import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { TenantRecord, UserProfile, TenancyRequest, Agreement, Invoice, Unit, RequiredIdItem } from '../../types';
import { Plus, Search, Send, Clock, CheckCircle, XCircle, UserCheck, UserPlus, Mail, Phone, Building, Key, Eye, EyeOff, Upload, FileCheck, ArrowRight, ShieldCheck, Trash2 } from 'lucide-react';
import { ButtonProcessing } from '../../components/common/Spinner';
import { OnboardResidentModal } from '../../components/owner/OnboardResidentModal';
import {
  getTodayDateString,
  getNextMonthFirstDateString,
  getOneYearLaterDateString,
} from '../../lib/dates';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { PlanLimitModal } from '../../components/common/PlanLimitModal';
import { useCurrency } from '../../context/CurrencyContext';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, normalizeCurrencyCode, getCurrencySymbol, formatCurrencyAmount } from '../../lib/currencyService';


export const Tenant360Page: React.FC = () => {
  const {
    state,
    updateState,
    showToast,
    saveTenancyRequest,
    saveTenant,
    saveAgreement,
    saveInvoice,
    saveUnit,
  } = useAppData();
  const { user, provisionUser } = useAuth();
  const ownerId = user?.id || '';

  const navigate = useNavigate();
  const {
    currentPlan,
    currentPlanName,
    usage,
    limitModalResource,
    openLimitModal,
    closeLimitModal,
  } = usePlanLimits();

  const maxTenants = usage.tenants.max;
  const isTenantLimitReached = usage.tenants.isFull;

  const [activeTab, setActiveTab] = useState<'active' | 'requests'>('active');
  const [selectedTenant, setSelectedTenant] = useState<TenantRecord | null>(null);
  const [directorySearch, setDirectorySearch] = useState('');
  const [isSubmittingProv, setIsSubmittingProv] = useState(false);

  // Unified Onboard Resident Modal state
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);

  const ownerEmail = user?.email?.toLowerCase() || '';
  const ownerName = user?.displayName?.toLowerCase() || '';

  const isGenericName = (n?: string) => {
    if (!n) return true;
    const s = n.trim().toLowerCase();
    return s === 'property owner' || s === 'landlord' || s === 'owner' || s === 'admin' || s === 'manager';
  };

  const myProperties = state.properties.filter(
    (p) =>
      (ownerId && p.ownerId === ownerId) ||
      (ownerEmail && (p as any).ownerEmail?.toLowerCase() === ownerEmail) ||
      (!isGenericName(ownerName) && (p as any).ownerName?.toLowerCase() === ownerName)
  );
  const myPropertyIds = new Set(myProperties.map((p) => p.id));

  const defaultOwnerCurrency = getCurrencySymbol(myProperties.find((p) => p.currency)?.currency || myProperties[0]?.currency || DEFAULT_CURRENCY_SYMBOL);

  const { viewCurrency, convert } = useCurrency();
  const activeCurrencyCode = viewCurrency || 'USD';

  const formatMoney = (amount: number, curr?: string) => {
    const fromCode = curr ? normalizeCurrencyCode(curr) : 'USD';
    const converted = convert(amount || 0, fromCode, activeCurrencyCode);
    return formatCurrencyAmount(converted, activeCurrencyCode);
  };

  const myUnits = state.units.filter(
    (u) =>
      (ownerId && u.ownerId === ownerId) ||
      (u.propertyId && myPropertyIds.has(u.propertyId))
  );

  const mySentRequests = (state.tenancyRequests || []).filter(
    (r) =>
      (ownerId && r.ownerId === ownerId) ||
      (ownerEmail && (r as any).ownerEmail?.toLowerCase() === ownerEmail) ||
      (r.propertyId && myPropertyIds.has(r.propertyId))
  );

  const myAgreements = (state.agreements || []).filter((a) => {
    // Hard reject: different explicit owner
    if (ownerId && a.ownerId && a.ownerId !== ownerId) return false;
    // Hard reject: bound to a property not owned by this owner
    if (a.propertyId && !myPropertyIds.has(a.propertyId)) return false;
    if (ownerId && a.ownerId === ownerId) return true;
    if (a.propertyId && myPropertyIds.has(a.propertyId)) return true;
    // Unit ID is owner-scoped (myUnits already filtered by ownerId)
    const myUnitIds = new Set(myUnits.map((u) => u.id));
    if (a.unit && myUnitIds.has(a.unit)) return true;
    // Unit number must be backed by a property this owner owns
    if (a.unit && myUnits.some((u) => u.unitNumber === a.unit && u.propertyId && myPropertyIds.has(u.propertyId))) return true;
    return false;
  });

  const availableTemplates = React.useMemo(() => {
    const custom = (state.agreementTemplates || []).filter(
      (t) => t.ownerId === user?.id || user?.role === 'superadmin' || (user?.role as string) === 'admin'
    );
    const fromAg: { id: string; title: string; fileName: string; fileData: string; fileSizeKb: number }[] = [];
    const seen = new Set(custom.map((t) => (t.fileName || t.title).toLowerCase()));
    (state.agreements || []).forEach((a) => {
      if ((a.ownerId === user?.id || user?.role === 'superadmin' || (user?.role as string) === 'admin') && a.fileData && a.fileName) {
        const lower = a.fileName.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          fromAg.push({
            id: `ag_tmpl_${a.id}`,
            title: a.fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            fileName: a.fileName,
            fileData: a.fileData,
            fileSizeKb: typeof a.fileSize === 'number' ? a.fileSize : 450,
          });
        }
      }
    });
    return [...custom, ...fromAg];
  }, [state.agreementTemplates, state.agreements, user?.id, user?.role]);

  const myTenants: TenantRecord[] = React.useMemo(() => {
    const tenantMap = new Map<string, TenantRecord>();

    // 1. Process explicit tenant records from state.tenants
    state.tenants.forEach((t) => {
      // Disqualify only if this tenant has NO connection to this owner or any of this owner's properties/units/agreements
      const matchesOwnerId = Boolean(ownerId) && Boolean(t.ownerId) && t.ownerId === ownerId;
      const matchesProperty = Boolean(t.propertyId) && myPropertyIds.has(t.propertyId!);
      const matchesUnit =
        Boolean(t.unit) &&
        t.unit !== 'Unassigned' &&
        myUnits.some(
          (u) =>
            u.id === t.unit ||
            (u.unitNumber === t.unit && (!t.propertyId || !u.propertyId || u.propertyId === t.propertyId) && myPropertyIds.has(u.propertyId))
        );
      const matchesAcceptedReq = mySentRequests.some(
        (r) =>
          r.status === 'accepted' &&
          ((Boolean(r.tenantId) && r.tenantId === t.id) ||
            (Boolean(r.tenantEmail) && Boolean(t.email) && r.tenantEmail.toLowerCase() === t.email.toLowerCase()))
      );
      const matchesAgreement = myAgreements.some(
        (a) =>
          (Boolean(a.tenantId) && a.tenantId === t.id) ||
          (Boolean(a.tenantEmail) && Boolean(t.email) && a.tenantEmail!.toLowerCase() === t.email.toLowerCase())
      );

      const hasRelationshipWithThisOwner =
        matchesOwnerId || matchesProperty || matchesUnit || matchesAcceptedReq || matchesAgreement;

      if (!hasRelationshipWithThisOwner) {
        return;
      }

      // Disqualify if this resident ONLY has a pending or declined invitation and no active/accepted relationship (OWN-15)
      const hasActiveAgreement = myAgreements.some(
        (a) =>
          (a.status === 'active' || a.status === 'signed') &&
          ((Boolean(a.tenantId) && a.tenantId === t.id) ||
            (Boolean(a.tenantEmail) && Boolean(t.email) && a.tenantEmail!.toLowerCase() === t.email.toLowerCase()))
      );
      const occupiesOccupiedUnit = myUnits.some(
        (u) =>
          u.status === 'occupied' &&
          (u.currentTenantId === t.id || (t.unit && t.unit !== 'Unassigned' && (u.id === t.unit || u.unitNumber === t.unit)))
      );
      const hasPendingReq = mySentRequests.some(
        (r) =>
          r.status === 'pending' &&
          ((Boolean(r.tenantId) && r.tenantId === t.id) ||
            (Boolean(r.tenantEmail) && Boolean(t.email) && r.tenantEmail.toLowerCase() === t.email.toLowerCase()))
      );
      const hasDeclinedReq = mySentRequests.some(
        (r) =>
          r.status === 'declined' &&
          ((Boolean(r.tenantId) && r.tenantId === t.id) ||
            (Boolean(r.tenantEmail) && Boolean(t.email) && r.tenantEmail.toLowerCase() === t.email.toLowerCase()))
      );

      if ((hasPendingReq || hasDeclinedReq) && !matchesAcceptedReq && !hasActiveAgreement && !occupiesOccupiedUnit) {
        return;
      }

      // Prefer ID match, then unit assignment — avoid name-only match across owners
      const matchingUnit = myUnits.find(
        (u) =>
          u.currentTenantId === t.id ||
          (t.unit && (u.id === t.unit || (u.unitNumber === t.unit && u.propertyId && myPropertyIds.has(u.propertyId))))
      );
      const matchingReq = mySentRequests.find(
        (r) =>
          r.status === 'accepted' &&
          (r.tenantId === t.id || (r.tenantEmail && t.email && r.tenantEmail.toLowerCase() === t.email.toLowerCase()))
      );
      const matchingAgr = myAgreements.find(
        (a) =>
          a.tenantId === t.id ||
          (a.tenantEmail && t.email && a.tenantEmail.toLowerCase() === t.email.toLowerCase())
      );
      const matchingProp = myProperties.find(
        (p) => p.id === matchingUnit?.propertyId || p.id === matchingReq?.propertyId || p.id === matchingAgr?.propertyId || (t.propertyId && myPropertyIds.has(t.propertyId) ? t.propertyId : undefined)
      );

      const effUnit =
        matchingUnit?.unitNumber ||
        matchingAgr?.unit ||
        matchingReq?.unitNumber ||
        (t.unit && t.unit !== 'Unassigned' ? t.unit : 'Unit');

      const effUnitsRented =
        Array.isArray(t.unitsRented) && t.unitsRented.length > 0 && t.unitsRented[0] !== 'Unassigned'
          ? t.unitsRented
          : [effUnit];

      const effRent = t.rent > 0 ? t.rent : (matchingReq?.rent || matchingUnit?.rent || matchingAgr?.rent || 0);
      const effDeposit = t.deposit > 0 ? t.deposit : (matchingReq?.deposit || matchingUnit?.deposit || matchingAgr?.deposit || 0);
      const effCurrency =
        t.currency ||
        matchingUnit?.currency ||
        matchingAgr?.currency ||
        matchingReq?.currency ||
        matchingProp?.currency ||
        defaultOwnerCurrency;

      const rec: TenantRecord = {
        ...t,
        currency: effCurrency,
        ownerId: t.ownerId || (matchesAcceptedReq || matchesAgreement ? ownerId : ''),
        unit: effUnit,
        unitsRented: effUnitsRented,
        rent: effRent,
        deposit: effDeposit,
        propertyName: t.propertyName || matchingReq?.propertyName || matchingUnit?.propertyName || matchingAgr?.propertyName || matchingProp?.name,
        propertyId: t.propertyId || matchingUnit?.propertyId || matchingReq?.propertyId || matchingAgr?.propertyId || matchingProp?.id,
        rating: typeof t.rating === 'number' ? t.rating : 0,
        history: Array.isArray(t.history) ? t.history : [],
        kycDocuments: Array.isArray(t.kycDocuments) ? t.kycDocuments : [],
      };

      const key = (t.id || t.email || '').toLowerCase();
      if (key) tenantMap.set(key, rec);
    });

    // 2. Discover accepted tenancy requests that may not yet have a record in state.tenants
    mySentRequests.forEach((req) => {
      if (req.status === 'accepted') {
        const keyById = (req.tenantId || '').toLowerCase();
        const keyByEmail = (req.tenantEmail || '').toLowerCase();
        const existingKey = (keyById && tenantMap.has(keyById))
          ? keyById
          : (keyByEmail && tenantMap.has(keyByEmail))
            ? keyByEmail
            : null;

        // Resolve unit scoped to this owner's units — unit number match requires propertyId
        const targetUnit = myUnits.find((u) => u.id === req.unitId) ||
          (req.unitNumber && req.propertyId
            ? myUnits.find((u) => u.unitNumber === req.unitNumber && u.propertyId === req.propertyId)
            : myUnits.find((u) => req.unitNumber && u.unitNumber === req.unitNumber));

        if (existingKey) {
          const existing = tenantMap.get(existingKey)!;
          tenantMap.set(existingKey, {
            ...existing,
            unit: req.unitNumber || targetUnit?.unitNumber || existing.unit,
            unitsRented: Array.from(new Set([...(existing.unitsRented || []), req.unitNumber || targetUnit?.unitNumber].filter(Boolean) as string[])),
            rent: req.rent || targetUnit?.rent || existing.rent,
            deposit: req.deposit || targetUnit?.deposit || existing.deposit,
            leaseStart: req.leaseStart || existing.leaseStart,
            leaseEnd: req.leaseEnd || existing.leaseEnd,
            propertyName: req.propertyName || targetUnit?.propertyName || existing.propertyName,
            propertyId: req.propertyId || targetUnit?.propertyId || existing.propertyId,
            currency: req.currency || targetUnit?.currency || existing.currency,
          });
        } else {
          const userProf = state.users.find(
            (u) =>
              (req.tenantId && u.id === req.tenantId) ||
              (req.tenantEmail && u.email && u.email.toLowerCase() === req.tenantEmail.toLowerCase())
          );

          const newRecord: TenantRecord = {
            id: req.tenantId || userProf?.id || `usr_tenant_${Date.now()}`,
            name: req.tenantName || userProf?.displayName || 'Resident',
            email: req.tenantEmail || userProf?.email || '',
            phone: req.tenantPhone || userProf?.phone || '',
            unit: req.unitNumber || targetUnit?.unitNumber || '',
            owner: user?.displayName || 'Property Owner',
            ownerId: ownerId,
            leaseStart: req.leaseStart || new Date().toISOString().split('T')[0],
            leaseEnd: req.leaseEnd || getOneYearLaterDateString(new Date().toISOString().split('T')[0]),
            rent: req.rent || targetUnit?.rent || 0,
            deposit: req.deposit || targetUnit?.deposit || 0,
            rating: 0,
            history: [],
            kycDocuments: (userProf as any)?.kycDocuments || [],
            unitsRented: req.unitNumber || targetUnit?.unitNumber ? [req.unitNumber || targetUnit?.unitNumber || ''] : [],
            propertyName: req.propertyName || targetUnit?.propertyName || myProperties.find(p => p.id === req.propertyId)?.name,
            propertyId: req.propertyId || targetUnit?.propertyId,
            currency: req.currency || targetUnit?.currency || myProperties.find(p => p.id === req.propertyId)?.currency || defaultOwnerCurrency,
          };
          tenantMap.set(keyById || keyByEmail || newRecord.id.toLowerCase(), newRecord);
        }
      }
    });

    // 3. Discover occupied units belonging to this owner whose tenant may not yet have a record in state.tenants
    myUnits.forEach((unit) => {
      if (unit.status === 'occupied' && (unit.currentTenantId || unit.tenant)) {
        // Only skip if we already have this tenant by ID (name match alone is unreliable)
        const matchesExisting = Array.from(tenantMap.values()).some(
          (t) =>
            (unit.currentTenantId && t.id === unit.currentTenantId) ||
            (unit.tenant && t.name && t.name.toLowerCase().trim() === unit.tenant.toLowerCase().trim() && (t.unit === unit.unitNumber || t.propertyId === unit.propertyId)) ||
            (t.unit && t.unit.toLowerCase().trim() === unit.unitNumber.toLowerCase().trim() && t.propertyId === unit.propertyId)
        );

        if (!matchesExisting) {
          // Resolve user by ID only — never by display name (prevents cross-owner collision)
          const userProf = unit.currentTenantId
            ? state.users.find((u) => u.id === unit.currentTenantId)
            : undefined;
          const newRecord: TenantRecord = {
            id: unit.currentTenantId || userProf?.id || `usr_tenant_${Date.now()}`,
            name: unit.tenant || userProf?.displayName || 'Resident',
            email: userProf?.email || '',
            phone: userProf?.phone || '',
            unit: unit.unitNumber,
            owner: user?.displayName || 'Property Owner',
            ownerId: ownerId,
            leaseStart: new Date().toISOString().split('T')[0],
            leaseEnd: getOneYearLaterDateString(new Date().toISOString().split('T')[0]),
            rent: unit.rent || 0,
            deposit: unit.deposit || 0,
            rating: 0,
            history: [],
            kycDocuments: (userProf as any)?.kycDocuments || [],
            unitsRented: [unit.unitNumber],
            propertyName: unit.propertyName || myProperties.find(p => p.id === unit.propertyId)?.name,
            propertyId: unit.propertyId,
            currency: unit.currency || myProperties.find(p => p.id === unit.propertyId)?.currency || defaultOwnerCurrency,
          };
          tenantMap.set((newRecord.id || newRecord.email).toLowerCase(), newRecord);
        }
      }
    });

    // 4. Discover tenants who have active agreements with this owner
    myAgreements.forEach((agr) => {
      if (agr.status === 'active' || agr.status === 'signed') {
        const keyById = (agr.tenantId || '').toLowerCase();
        const keyByEmail = (agr.tenantEmail || '').toLowerCase();
        if ((!keyById || !tenantMap.has(keyById)) && (!keyByEmail || !tenantMap.has(keyByEmail))) {
          const userProf = agr.tenantId
            ? state.users.find((u) => u.id === agr.tenantId)
            : state.users.find((u) => agr.tenantEmail && u.email && u.email.toLowerCase() === agr.tenantEmail.toLowerCase());
          const safeKyc = Array.isArray((agr as any).tenantUploadedIds)
            ? (agr as any).tenantUploadedIds.map((d: any) => ({ title: d.title || 'ID Document', fileUrl: d.fileUrl, verified: true }))
            : ((userProf as any)?.kycDocuments || []);
          const newRecord: TenantRecord = {
            id: agr.tenantId || userProf?.id || `usr_tenant_${Date.now()}`,
            name: agr.tenant || userProf?.displayName || 'Resident',
            email: agr.tenantEmail || userProf?.email || '',
            phone: agr.tenantPhone || userProf?.phone || '',
            unit: agr.unit || '',
            owner: user?.displayName || 'Property Owner',
            ownerId: ownerId,
            leaseStart: agr.start || new Date().toISOString().split('T')[0],
            leaseEnd: agr.end || getOneYearLaterDateString(new Date().toISOString().split('T')[0]),
            rent: agr.rent || 0,
            deposit: agr.deposit || 0,
            rating: 0,
            history: [],
            kycDocuments: safeKyc,
            unitsRented: agr.unit ? [agr.unit] : [],
            propertyName: (agr as any).propertyName || myProperties.find(p => p.id === agr.propertyId)?.name,
            propertyId: agr.propertyId,
            currency: agr.currency || defaultOwnerCurrency,
          };
          tenantMap.set(keyById || keyByEmail || newRecord.id.toLowerCase(), newRecord);
        }
      }
    });

    const uniqueTenants: TenantRecord[] = [];
    const seenTenantKeys = new Set<string>();
    Array.from(tenantMap.values()).forEach((t) => {
      const emailK = t.email ? `email:${t.email.toLowerCase().trim()}` : '';
      const idK = t.id ? `id:${t.id}` : '';
      if (emailK && seenTenantKeys.has(emailK)) return;
      if (idK && seenTenantKeys.has(idK)) return;
      if (emailK) seenTenantKeys.add(emailK);
      if (idK) seenTenantKeys.add(idK);
      uniqueTenants.push(t);
    });

    return uniqueTenants;
  }, [state.tenants, state.units, state.tenancyRequests, state.agreements, state.users, ownerId, ownerEmail, ownerName]);

  // Self-heal and sync any missing tenant records back to Firestore (strictly for this owner's verified tenants)
  useEffect(() => {
    myTenants.forEach((t) => {
      if (t.ownerId === ownerId) {
        const existingInState = state.tenants.find((orig) => orig.id === t.id);
        if (!existingInState) {
          saveTenant(t);
        } else if (existingInState.ownerId === ownerId) {
          if (
            (existingInState.deposit !== t.deposit && t.deposit > 0) ||
            existingInState.unit !== t.unit ||
            (!existingInState.currency && t.currency)
          ) {
            saveTenant(t);
          }
        }
      }
    });
  }, [myTenants, ownerId]);

  // Cancel sent request
  const handleCancelRequest = (reqId: string) => {
    const targetReq = (state.tenancyRequests || []).find((r) => r.id === reqId);
    if (!targetReq) return;

    const cancelledReq: TenancyRequest = {
      ...targetReq,
      status: 'cancelled',
      respondedAt: new Date().toISOString(),
    };

    // Resolve unit scoped to this owner's units — prevents picking another owner's unit with same number
    const targetUnit = myUnits.find((u) => u.id === targetReq.unitId) ||
      (targetReq.propertyId
        ? myUnits.find((u) => u.unitNumber === targetReq.unitNumber && u.propertyId === targetReq.propertyId)
        : myUnits.find((u) => targetReq.unitNumber && u.unitNumber === targetReq.unitNumber));

    let freedUnit: Unit | null = null;
    if (targetUnit) {
      freedUnit = {
        ...targetUnit,
        status: 'vacant' as const,
        tenant: null,
        currentTenantId: null,
      };
      saveUnit(freedUnit);
    }

    const tenantNotif = {
      id: `notif_${Date.now()}`,
      userId: targetReq.tenantId,
      title: 'Tenancy Invitation Withdrawn',
      body: `The tenancy offer for Unit ${targetReq.unitNumber} (${targetReq.propertyName}) was cancelled by the landlord.`,
      link: '/tenant/dashboard',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    saveTenancyRequest(cancelledReq, tenantNotif);

    // Cancel any draft agreements or unconfirmed invoices
    const updatedAgreements = (state.agreements || []).map((a) => {
      if (
        (a.unit === targetReq.unitNumber || (targetUnit && a.unit === targetUnit.unitNumber)) &&
        (a.tenantId === targetReq.tenantId || (targetReq.tenantEmail && a.tenantEmail?.toLowerCase() === targetReq.tenantEmail.toLowerCase()))
      ) {
        const cancelledAg: Agreement = { ...a, status: 'terminated' as const };
        saveAgreement(cancelledAg);
        return cancelledAg;
      }
      return a;
    });

    const updatedInvoices = (state.invoices || []).map((inv) => {
      if (
        (inv.unit === targetReq.unitNumber || (targetUnit && inv.unit === targetUnit.unitNumber)) &&
        (inv.tenantId === targetReq.tenantId || (targetReq.tenantEmail && inv.tenantEmail?.toLowerCase() === targetReq.tenantEmail.toLowerCase())) &&
        (inv.status === 'sent' || inv.status === 'draft' || inv.status === 'pending_confirmation')
      ) {
        const cancelledInv: Invoice = { ...inv, status: 'cancelled' as const };
        saveInvoice(cancelledInv);
        return cancelledInv;
      }
      return inv;
    });

    const updatedTenants = (state.tenants || []).map((t) => {
      if (t.id === targetReq.tenantId || (targetReq.tenantEmail && t.email?.toLowerCase() === targetReq.tenantEmail.toLowerCase())) {
        const upT: TenantRecord = {
          ...t,
          unit: t.unit === targetReq.unitNumber ? '' : t.unit,
          unitsRented: (t.unitsRented || []).filter((un) => un !== targetReq.unitNumber),
        };
        saveTenant(upT);
        return upT;
      }
      return t;
    });

    updateState((prev) => {
      const updatedUnits = freedUnit
        ? prev.units.map((u) => (u.id === freedUnit!.id ? freedUnit! : u))
        : prev.units;

      const updatedProperties = prev.properties.map((p) => {
        if (freedUnit && p.id === freedUnit.propertyId) {
          const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
          return { ...p, occupied: occ };
        }
        return p;
      });

      return {
        ...prev,
        tenancyRequests: (prev.tenancyRequests || []).map((r) =>
          r.id === reqId ? cancelledReq : r
        ),
        units: updatedUnits,
        properties: updatedProperties,
        tenants: updatedTenants,
        agreements: updatedAgreements,
        invoices: updatedInvoices,
        notifications: [...(prev.notifications || []), tenantNotif],
      };
    });

    showToast(`Tenancy request for Unit ${targetReq.unitNumber} cancelled. Unit is now Vacant.`);
  };

  return (
    <div>
      {/* Header with Title and Dual Action Buttons */}
      <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3>Tenants & Tenancy Requests</h3>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-tour="tenants-onboard-btn"
            className="btn brass btn-mobile-full"
            onClick={() => setIsOnboardOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <UserPlus size={16} /> Onboard Tenant
          </button>
        </div>
      </div>

      {/* Tabs Bar: Active Tenants vs Sent Tenancy Requests */}
      <div
        data-tour="tenants-tabs"
        style={{
          display: 'flex',
          gap: '12px',
          borderBottom: '1px solid var(--line)',
          marginBottom: '18px',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'active' ? '2px solid var(--brass)' : '2px solid transparent',
            color: activeTab === 'active' ? 'var(--ink)' : 'var(--ink-soft)',
            fontWeight: activeTab === 'active' ? 600 : 500,
            fontSize: '14px',
            padding: '10px 14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <UserCheck size={16} />
          Active Tenants ({myTenants.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'requests' ? '2px solid var(--brass)' : '2px solid transparent',
            color: activeTab === 'requests' ? 'var(--ink)' : 'var(--ink-soft)',
            fontWeight: activeTab === 'requests' ? 600 : 500,
            fontSize: '14px',
            padding: '10px 14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Send size={15} />
          Pending Invitations ({mySentRequests.length})
        </button>
      </div>

      {/* TAB 1: Active Tenants Directory */}
      {activeTab === 'active' && (() => {
        const filteredTenants = directorySearch.trim()
          ? myTenants.filter((t) => {
            const q = directorySearch.trim().toLowerCase();
            const cleanPhone = (t.phone || '').replace(/[^0-9]/g, '');
            const cleanQ = q.replace(/[^0-9]/g, '');
            return (
              t.name.toLowerCase().includes(q) ||
              t.email.toLowerCase().includes(q) ||
              (cleanQ.length > 2 && cleanPhone.includes(cleanQ)) ||
              (t.unit || '').toLowerCase().includes(q)
            );
          })
          : myTenants;

        return (
          <div className="panel">
            <div className="panel-body">
              <div style={{ marginBottom: '14px' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search tenants by name, email, phone, or unit…"
                    value={directorySearch}
                    onChange={(e) => setDirectorySearch(e.target.value)}
                    style={{ paddingLeft: '34px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
                {directorySearch.trim() && (
                  <div className="hint" style={{ marginTop: '6px' }}>
                    {filteredTenants.length} of {myTenants.length} tenants match &quot;{directorySearch}&quot;
                  </div>
                )}
              </div>
              {/* Desktop Table View */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tenant</th>
                        <th>Units Rented</th>
                        <th>Monthly Rent</th>
                        <th>Deposit Held</th>
                        <th>Next Due Date</th>
                        <th>KYC Status</th>
                        <th>Rating</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myTenants.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px 16px' }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>
                              No active tenants
                            </div>
                            <div style={{ fontSize: '12.5px' }}>
                              Use the "+ Add Tenant" button above to add a tenant or send a lease invitation.
                            </div>
                          </td>
                        </tr>
                      ) : filteredTenants.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px 16px' }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>
                              No tenants match &quot;{directorySearch}&quot;
                            </div>
                            <div style={{ fontSize: '12.5px' }}>
                              Try a different name, email, phone number, or unit number.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredTenants.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <div className="person">
                                <div className="avatar">{t.name.slice(0, 2).toUpperCase()}</div>
                                <div className="who">
                                  <b>{t.name}</b>
                                  <span>
                                    {t.email} • {t.phone}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <b>{(t.unitsRented || [t.unit || 'Unit']).join(', ')}</b>
                            </td>
                            <td>{formatMoney(t.rent, t.currency)}</td>
                            <td>{formatMoney(t.deposit, t.currency)}</td>
                            <td>
                              <span className="badge grey">1st of month</span>
                            </td>
                            <td>
                              {(t.kycDocuments || []).some((k) => k.verified) ? (
                                <span className="badge green">✓ KYC Verified</span>
                              ) : (
                                <span className="badge grey">Pending KYC</span>
                              )}
                            </td>
                            <td>
                              {t.rating && t.rating > 0 ? (
                                <>
                                  <span className="stars">{'★'.repeat(Math.min(5, Math.max(1, Math.round(t.rating))))}</span> {t.rating}
                                </>
                              ) : (
                                <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>Unrated</span>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn secondary small"
                                onClick={() => setSelectedTenant(t)}
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-card-view">
                {myTenants.length === 0 ? (
                  <div className="staff-card" style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>
                      No active tenants
                    </div>
                    <div style={{ fontSize: '12.5px' }}>
                      Use the "+ Add Tenant" button above to add a tenant or send a lease invitation.
                    </div>
                  </div>
                ) : filteredTenants.length === 0 ? (
                  <div className="staff-card" style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>
                      No tenants match &quot;{directorySearch}&quot;
                    </div>
                    <div style={{ fontSize: '12.5px' }}>
                      Try a different name, email, phone number, or unit number.
                    </div>
                  </div>
                ) : (
                  filteredTenants.map((t) => (
                    <div key={t.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div className="person">
                          <div className="avatar">{t.name.slice(0, 2).toUpperCase()}</div>
                          <div className="who">
                            <b>{t.name}</b>
                            <span>{t.email}</span>
                            <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{t.phone}</span>
                          </div>
                        </div>
                        {(t.kycDocuments || []).some((k) => k.verified) ? (
                          <span className="badge green" style={{ fontSize: '11px', flexShrink: 0 }}>✓ KYC Verified</span>
                        ) : (
                          <span className="badge grey" style={{ fontSize: '11px', flexShrink: 0 }}>Pending KYC</span>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Units Rented</div>
                          <b style={{ color: 'var(--ink)' }}>{(t.unitsRented || [t.unit || 'Unit']).join(', ')}</b>
                        </div>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Monthly Rent</div>
                          <b style={{ color: 'var(--ledger)' }}>{formatMoney(t.rent, t.currency)}</b>
                        </div>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Deposit Held</div>
                          <b>{formatMoney(t.deposit, t.currency)}</b>
                        </div>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Rating</div>
                          {t.rating && t.rating > 0 ? (
                            <span style={{ color: 'var(--brass)' }}>★ {t.rating}</span>
                          ) : (
                            <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>Unrated</span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn secondary small btn-mobile-full"
                        onClick={() => setSelectedTenant(t)}
                      >
                        View Details
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* TAB 2: Sent Tenancy Requests & Invitations */}
      {activeTab === 'requests' && (
        <div className="panel">
          {/* Desktop Table View */}
          <div className="desktop-table-view">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tenant Candidate</th>
                    <th>Property & Unit</th>
                    <th>Offered Rent</th>
                    <th>Security Deposit</th>
                    <th>Proposed Term</th>
                    <th>Sent Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mySentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>
                          No tenancy requests sent yet
                        </div>
                        <div style={{ fontSize: '12.5px' }}>
                          Use the "+ Add Tenant" button above to send an online lease invitation to a tenant.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    mySentRequests.map((r) => {
                      let statusBadge = (
                        <span className="badge amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} /> Pending Tenant Response
                        </span>
                      );
                      if (r.status === 'accepted') {
                        statusBadge = (
                          <span className="badge green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle size={12} /> Accepted & Active
                          </span>
                        );
                      } else if (r.status === 'declined') {
                        statusBadge = (
                          <span className="badge red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <XCircle size={12} /> Declined by Tenant
                          </span>
                        );
                      } else if (r.status === 'cancelled') {
                        statusBadge = <span className="badge grey">Cancelled</span>;
                      }

                      return (
                        <tr key={r.id}>
                          <td>
                            <div className="person">
                              <div className="avatar">{r.tenantName.slice(0, 2).toUpperCase()}</div>
                              <div className="who">
                                <b>{r.tenantName}</b>
                                <span>
                                  {r.tenantEmail} {r.tenantPhone ? `• ${r.tenantPhone}` : ''}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <b>{r.propertyName}</b>
                            <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Unit {r.unitNumber}</div>
                          </td>
                          <td>
                            <b>
                              {getCurrencySymbol(r.currency || defaultOwnerCurrency)}
                              {(r.rent ?? 0).toLocaleString()}
                            </b>
                            /mo
                          </td>
                          <td>
                            {getCurrencySymbol(r.currency || defaultOwnerCurrency)}
                            {(r.deposit ?? 0).toLocaleString()}
                          </td>
                          <td style={{ fontSize: '12.5px' }}>
                            {r.leaseStart} to {r.leaseEnd}
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                            {new Date(r.createdAt).toLocaleDateString()}
                          </td>
                          <td>{statusBadge}</td>
                          <td>
                            {r.status === 'pending' ? (
                              <button
                                type="button"
                                className="btn secondary small"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => handleCancelRequest(r.id)}
                              >
                                Cancel Request
                              </button>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="mobile-card-view">
            {mySentRequests.length === 0 ? (
              <div className="staff-card" style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 16px' }}>
                <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px' }}>
                  No tenancy requests sent yet
                </div>
                <div style={{ fontSize: '12.5px' }}>
                  Use the "+ Add Tenant" button above to send an online lease invitation to a tenant.
                </div>
              </div>
            ) : (
              mySentRequests.map((r) => {
                let statusBadge = (
                  <span className="badge amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> Pending Response
                  </span>
                );
                if (r.status === 'accepted') {
                  statusBadge = (
                    <span className="badge green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={12} /> Accepted & Active
                    </span>
                  );
                } else if (r.status === 'declined') {
                  statusBadge = (
                    <span className="badge red" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <XCircle size={12} /> Declined
                    </span>
                  );
                } else if (r.status === 'cancelled') {
                  statusBadge = <span className="badge grey">Cancelled</span>;
                }

                return (
                  <div key={r.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div className="person">
                        <div className="avatar">{r.tenantName.slice(0, 2).toUpperCase()}</div>
                        <div className="who">
                          <b>{r.tenantName}</b>
                          <span>{r.tenantEmail}</span>
                          {r.tenantPhone && <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{r.tenantPhone}</span>}
                        </div>
                      </div>
                      {statusBadge}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                      <div>
                        <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Property & Unit</div>
                        <b style={{ color: 'var(--ink)' }}>{r.propertyName}</b>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Unit {r.unitNumber}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Offered Rent</div>
                        <b style={{ color: 'var(--ledger)' }}>{getCurrencySymbol(r.currency || defaultOwnerCurrency)}{(r.rent ?? 0).toLocaleString()}/mo</b>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Deposit: {getCurrencySymbol(r.currency || defaultOwnerCurrency)}{(r.deposit ?? 0).toLocaleString()}</div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Proposed Term</div>
                        <div>{r.leaseStart} to {r.leaseEnd}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>Sent: {new Date(r.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>

                    {r.status === 'pending' && (
                      <button
                        type="button"
                        className="btn secondary small btn-mobile-full"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => handleCancelRequest(r.id)}
                      >
                        Cancel Request
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Unified Onboard Resident & Lease Modal */}
      <OnboardResidentModal
        isOpen={isOnboardOpen}
        onClose={() => setIsOnboardOpen(false)}
        entryContext="tenants"
      />

      {/* Tenant Detail Modal */}
      {selectedTenant && (
        <div className="modal-backdrop" onClick={() => setSelectedTenant(null)}>
          <div className="modal" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Tenant Details: {selectedTenant.name}</h3>
              <button type="button" className="modal-close" onClick={() => setSelectedTenant(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="person" style={{ marginBottom: '16px' }}>
                <div className="avatar" style={{ width: '48px', height: '48px', fontSize: '18px' }}>
                  {selectedTenant.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="who">
                  <b>{selectedTenant.name}</b>
                  <span>
                    {selectedTenant.email} • {selectedTenant.phone}
                  </span>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  {selectedTenant.rating && selectedTenant.rating > 0 ? (
                    <>
                      <span className="stars">{'★'.repeat(Math.min(5, Math.max(1, Math.round(selectedTenant.rating))))}</span> {selectedTenant.rating}
                    </>
                  ) : (
                    <span className="badge grey" style={{ fontSize: '11px' }}>Unrated</span>
                  )}
                </div>
              </div>

              <div className="section-title">Rented Units</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {(selectedTenant.unitsRented || [selectedTenant.unit || 'Unit']).map((u, idx) => (
                  <span key={`${selectedTenant.id}-${u}-${idx}`} className="badge green" style={{ padding: '6px 12px', fontSize: '13px' }}>
                    Unit {u}
                  </span>
                ))}
              </div>

              <div className="section-title">Rental Terms & Financials</div>
              <div className="kv">
                <span className="k">Total Monthly Rent:</span>
                <b>{formatMoney(selectedTenant.rent || 0, selectedTenant.currency)}</b>
              </div>
              <div className="kv">
                <span className="k">Total Security Deposit Held:</span>
                <b>{formatMoney(selectedTenant.deposit || 0, selectedTenant.currency)}</b>
              </div>
              <div className="kv">
                <span className="k">Next Rent Due Date:</span>
                <b>{getNextMonthFirstDateString()} (Grace period: 5 days)</b>
              </div>
              <div className="kv">
                <span className="k">Lease Term:</span>
                <span>
                  {selectedTenant.leaseStart || '—'} to {selectedTenant.leaseEnd || '—'}
                </span>
              </div>

              <div className="section-title">Verified Identity & KYC Documents</div>
              {(() => {
                const tenantAgs = state.agreements.filter((a) => a.tenantId === selectedTenant.id || (a.tenantEmail && selectedTenant.email && a.tenantEmail.toLowerCase() === selectedTenant.email.toLowerCase()));
                const allAgreementIds = tenantAgs.flatMap((a) => a.tenantUploadedIds || []);
                const kycDocs = [...(selectedTenant.kycDocuments || [])];

                allAgreementIds.forEach((idDoc) => {
                  if (!kycDocs.some((k) => k.title.toLowerCase() === idDoc.name.toLowerCase())) {
                    kycDocs.push({
                      title: idDoc.name,
                      fileUrl: idDoc.fileUrl,
                      verified: true,
                    });
                  }
                });

                if (kycDocs.length === 0) {
                  return <div style={{ fontSize: '12px', color: 'var(--ink-soft)', padding: '6px 0' }}>No ID / KYC documents attached yet</div>;
                }

                return kycDocs.map((doc, idx) => (
                  <div key={idx} className="kv" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <span className="k" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={14} color="var(--brass)" />
                      <b>{doc.title}</b>
                    </span>
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      download={`${selectedTenant.name}_${doc.title}`}
                      style={{ color: 'var(--ledger)', fontWeight: 600, fontSize: '12.5px', textDecoration: 'underline' }}
                    >
                      View / Download ID
                    </a>
                  </div>
                ));
              })()}

              <div className="section-title">Past Rental History</div>
              {(selectedTenant.history || []).length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', padding: '6px 0' }}>First residency on Propithub platform</div>
              ) : (
                (selectedTenant.history || []).map((h, idx) => (
                  <div key={idx} className="kv">
                    <span>
                      {h.property} ({h.owner})
                    </span>
                    <span style={{ color: 'var(--ink-soft)' }}>{h.period}</span>
                  </div>
                ))
              )}

              <div className="section-title">Verified Landlord Reviews & Conduct Ratings</div>
              {(() => {
                const tenantReviews = (state.reviews?.tenants || []).filter(
                  (r: any) =>
                    // Prefer tenantId match; only fall back to name if tenantId is absent AND ownerId confirms this owner reviewed them
                    r.tenantId === selectedTenant.id ||
                    (!r.tenantId && r.tenant && r.tenant === selectedTenant.name && r.ownerId === ownerId)
                );
                return (
                  <div>
                    {tenantReviews.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', padding: '6px 0', marginBottom: '10px' }}>
                        No formal move-out reviews registered yet.
                      </div>
                    ) : (
                      tenantReviews.map((r: any, idx: number) => (
                        <div key={idx} style={{ background: 'var(--surface-sunken)', padding: '10px 12px', borderRadius: '6px', marginBottom: '8px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <b>{r.by || 'Property Owner'}</b>
                            <span style={{ color: 'var(--brass)' }}>{'★'.repeat(Math.round(r.rating || 5))} ({Number(r.rating || 5).toFixed(1)})</span>
                          </div>
                          <p style={{ margin: 0, color: 'var(--ink)', fontSize: '12.5px', lineHeight: 1.4 }}>{r.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setSelectedTenant(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {limitModalResource && (
        <PlanLimitModal
          resourceType={limitModalResource}
          planName={currentPlanName}
          currentUsage={usage[limitModalResource].used}
          limit={usage[limitModalResource].max}
          onClose={closeLimitModal}
          onUpgrade={() => {
            closeLimitModal();
            navigate('/owner/plan');
          }}
        />
      )}
    </div>
  );
};
