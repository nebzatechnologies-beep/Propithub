import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Agreement, AgreementTemplate, RenewalItem, MoveOutRequest, Invoice, TenantRecord, UserProfile, RequiredIdItem, TenancyRequest } from '../../types';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import {
  getTodayDateString,
  getNextMonthFirstDateString,
  getOneYearLaterDateString,
  getDaysFromNowString,
} from '../../lib/dates';
import { TenantSearchCombobox, SelectedTenantInfo } from '../../components/leasing/TenantSearchCombobox';
import { downloadAgreementPDF } from '../../lib/pdf';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { PlanLimitModal } from '../../components/common/PlanLimitModal';
import { ButtonProcessing } from '../../components/common/Spinner';
import { OnboardResidentModal } from '../../components/owner/OnboardResidentModal';
import {
  FileText,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  ShieldCheck,
  UserCheck,
  FileCheck,
  Upload,
  Calendar,
  Building,
  CreditCard,
  AlertTriangle,
  Plus,
  Trash2,
  XCircle,
  Bookmark,
  Edit,
} from 'lucide-react';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, normalizeCurrencyCode, getCurrencySymbol } from '../../lib/currencyService';


export const LeasingPage: React.FC = () => {
  const { state, updateState, showToast, saveAgreement, deleteAgreement, saveAgreementTemplate, deleteAgreementTemplate, saveUnit, saveInvoice, saveTenant, saveMoveout, saveTenancyRequest, approveSignedAgreement, rejectSignedAgreement, offerLeaseRenewal, approveLeaseRenewal } = useAppData();
  const { user, isOwnerPlanActive } = useAuth();
  const navigate = useNavigate();
  const ownerId = user?.id || '';
  const isPlanActive = isOwnerPlanActive(ownerId);

  const [subTab, setSubTab] = useState<'agreements' | 'renewals' | 'library' | 'drafts'>('agreements');
  const [leaseStatusFilter, setLeaseStatusFilter] = useState<'all' | 'active' | 'pending' | 'terminated'>('all');
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCreatingAgreement, setIsCreatingAgreement] = useState(false);
  const [isApprovingAgreement, setIsApprovingAgreement] = useState(false);
  const [isRejectingAgreement, setIsRejectingAgreement] = useState(false);
  const [isRejectingModalOpen, setIsRejectingModalOpen] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [isSendingRenewalOffer, setIsSendingRenewalOffer] = useState(false);
  const [isApprovingRenewal, setIsApprovingRenewal] = useState(false);
  const [viewingAgreement, setViewingAgreement] = useState<Agreement | null>(null);
  const [inspectingSignedAgreement, setInspectingSignedAgreement] = useState<Agreement | null>(null);

  // Upload Agreement Modal state
  const [newAgUnit, setNewAgUnit] = useState('');
  const [newAgTenant, setNewAgTenant] = useState('');
  const [uploadTenantInfo, setUploadTenantInfo] = useState<SelectedTenantInfo | null>(null);
  const [newAgStart, setNewAgStart] = useState(getNextMonthFirstDateString());
  const [newAgEnd, setNewAgEnd] = useState(getOneYearLaterDateString(getNextMonthFirstDateString()));
  const [uploadRent, setUploadRent] = useState<number>(0);
  const [uploadDeposit, setUploadDeposit] = useState<number>(0);
  const [uploadDueDay, setUploadDueDay] = useState<number>(1);
  const [uploadMode, setUploadMode] = useState<'digital_dispatch' | 'already_executed_offline'>('digital_dispatch');
  const [offlineDepositCollected, setOfflineDepositCollected] = useState<boolean>(true);
  const [offlineDepositRef, setOfflineDepositRef] = useState<string>('Cash / Bank Wire Settled');
  const [newAgAuto, setNewAgAuto] = useState('Off');
  const [newAgFileName, setNewAgFileName] = useState('Rental_Agreement_Signed.pdf');
  const [newAgFileData, setNewAgFileData] = useState<string | null>(null);
  const [newAgFileSize, setNewAgFileSize] = useState<number | null>(null);
  const [leaseAgreementSource, setLeaseAgreementSource] = useState<'upload' | 'library'>('upload');
  const [leaseSelectedTemplateId, setLeaseSelectedTemplateId] = useState<string>('');
  const [newAgRequireIds, setNewAgRequireIds] = useState(false);
  const [newAgIdList, setNewAgIdList] = useState<RequiredIdItem[]>([
    { id: 'ag_id_1', name: 'Voter ID' },
  ]);

  // Renewal offer modal state
  const [renewalModalItem, setRenewalModalItem] = useState<RenewalItem | null>(null);
  const [renewalCurrentRent, setRenewalCurrentRent] = useState<number>(0);
  const [renewalPercent, setRenewalPercent] = useState<number>(10);
  const [renewalNewRent, setRenewalNewRent] = useState<number>(0);
  const [renewalDurationMonths, setRenewalDurationMonths] = useState<number>(12);
  const [renewalStartDate, setRenewalStartDate] = useState<string>('');
  const [renewalEndDate, setRenewalEndDate] = useState<string>('');
  const [renewalOwnerNotes, setRenewalOwnerNotes] = useState<string>('');
  const [renewalAgreementFileUrl, setRenewalAgreementFileUrl] = useState<string | null>(null);
  const [renewalAgreementFileName, setRenewalAgreementFileName] = useState<string>('');
  const [renewalAgreementFileSize, setRenewalAgreementFileSize] = useState<number | null>(null);

  // Tenant-signed renewal inspection modal state
  const [inspectingSignedRenewal, setInspectingSignedRenewal] = useState<RenewalItem | null>(null);

  // Agreement Library State
  const [isUploadTemplateOpen, setIsUploadTemplateOpen] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplatePropertyId, setNewTemplatePropertyId] = useState('all');
  const [newTemplateFileName, setNewTemplateFileName] = useState('');
  const [newTemplateFileData, setNewTemplateFileData] = useState<string | null>(null);
  const [newTemplateFileSize, setNewTemplateFileSize] = useState<number | null>(null);
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templatePropertyFilter, setTemplatePropertyFilter] = useState('all');
  const [previewingTemplate, setPreviewingTemplate] = useState<AgreementTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<AgreementTemplate | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);

  const myProperties = state.properties.filter((p) => Boolean(ownerId) && p.ownerId === ownerId);
  const myPropertyIds = new Set(myProperties.map((p) => p.id));
  const defaultOwnerCurrency = getCurrencySymbol(myProperties.find((p) => p.currency)?.currency || myProperties[0]?.currency || DEFAULT_CURRENCY_SYMBOL);

  const myTemplates: AgreementTemplate[] = useMemo(() => {
    const customTemplates = (state.agreementTemplates || []).filter(
      (t) => t.ownerId === ownerId || user?.role === 'superadmin' || (user?.role as string) === 'admin'
    );
    // Also include unique agreements uploaded during resident onboarding or offline execution
    const fromAgreements: AgreementTemplate[] = [];
    const seenNames = new Set(customTemplates.map((t) => (t.fileName || t.title).toLowerCase()));
    (state.agreements || []).forEach((a) => {
      if ((a.ownerId === ownerId || user?.role === 'superadmin' || (user?.role as string) === 'admin') && a.fileData && a.fileName) {
        const lower = a.fileName.toLowerCase();
        if (!seenNames.has(lower)) {
          seenNames.add(lower);
          fromAgreements.push({
            id: `ag_tmpl_${a.id}`,
            ownerId: a.ownerId,
            ownerName: a.ownerName,
            title: a.fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            propertyId: a.propertyId || 'all',
            propertyName: a.propertyName || 'All Properties',
            fileName: a.fileName,
            fileData: a.fileData,
            fileSizeKb: typeof a.fileSize === 'number' ? a.fileSize : 450,
            uploadedAt: a.start || new Date().toISOString(),
            uploadedBy: 'owner',
            status: 'active',
          });
        }
      }
    });
    return [...customTemplates, ...fromAgreements];
  }, [state.agreementTemplates, state.agreements, ownerId, user?.role]);

  const filteredTemplates = useMemo(() => {
    return myTemplates.filter((t) => {
      if (templatePropertyFilter !== 'all' && t.propertyId && t.propertyId !== 'all' && t.propertyId !== templatePropertyFilter) {
        return false;
      }
      if (templateSearch.trim()) {
        const q = templateSearch.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesFile = t.fileName.toLowerCase().includes(q);
        const matchesProp = (t.propertyName || '').toLowerCase().includes(q);
        return matchesTitle || matchesFile || matchesProp;
      }
      return true;
    });
  }, [myTemplates, templatePropertyFilter, templateSearch]);

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateTitle.trim() || !newTemplateFileData) {
      showToast('⚠️ Please provide a document title and upload a file.');
      return;
    }
    setIsUploadingTemplate(true);
    const targetProp = myProperties.find((p) => p.id === newTemplatePropertyId);
    const newTmpl: AgreementTemplate = {
      id: `tmpl_${Date.now()}`,
      ownerId,
      ownerName: user?.displayName || 'Owner',
      title: newTemplateTitle.trim(),
      description: newTemplateDescription.trim(),
      propertyId: newTemplatePropertyId,
      propertyName: targetProp ? targetProp.name : 'All Properties',
      fileName: newTemplateFileName || 'Agreement_Template.pdf',
      fileData: newTemplateFileData,
      fileSizeKb: newTemplateFileSize || 350,
      fileType: 'pdf',
      uploadedBy: (user?.role === 'superadmin' || (user?.role as string) === 'admin') ? 'admin' : 'owner',
      uploadedByUserId: user?.id || ownerId,
      uploadedAt: new Date().toISOString(),
      status: 'active',
    };
    await saveAgreementTemplate(newTmpl);
    setIsUploadingTemplate(false);
    setIsUploadTemplateOpen(false);
    setNewTemplateTitle('');
    setNewTemplateDescription('');
    setNewTemplateFileData(null);
    setNewTemplateFileName('');
    setNewTemplateFileSize(null);
    showToast(`✓ Agreement "${newTmpl.title}" saved to library.`);
  };

  const handleConfirmDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    setIsDeletingTemplate(true);
    await deleteAgreementTemplate(deletingTemplate.id);
    setIsDeletingTemplate(false);
    setDeletingTemplate(null);
    showToast(`✓ Document "${deletingTemplate.title}" removed from library.`);
  };

  const formatMoney = (amount: number, curr?: string) => {
    const c = getCurrencySymbol(curr || defaultOwnerCurrency);
    const isIndian = normalizeCurrencyCode(curr || defaultOwnerCurrency) === 'INR';
    return `${c}${(amount || 0).toLocaleString(isIndian ? 'en-IN' : 'en-US')}`;
  };

  const myUnits = state.units.filter((u) => Boolean(ownerId) && (u.ownerId === ownerId || (u.propertyId && myPropertyIds.has(u.propertyId))));
  const vacantUnits = myUnits.filter((u) => {
    if (u.status === 'occupied') return false;
    if (u.tenant || u.currentTenantId) return false;
    const hasActiveAg = state.agreements.some(
      (a) =>
        (a.status === 'active' || a.status === 'pending_deposit') &&
        (!u.propertyId || !a.propertyId || a.propertyId === u.propertyId) &&
        (a.unit === u.unitNumber || a.unit === u.id)
    );
    if (hasActiveAg) return false;
    return true;
  });
  const myAgreements = state.agreements.filter((a) => Boolean(ownerId) && (a.ownerId === ownerId || (a.propertyId && myPropertyIds.has(a.propertyId))));

  const myIssuedAgreements = useMemo(() => {
    return myAgreements.filter((a) => a.status !== 'draft');
  }, [myAgreements]);

  const draftAgreements = useMemo(() => {
    return myAgreements.filter((a) => a.status === 'draft');
  }, [myAgreements]);

  const agreementCounts = useMemo(() => {
    const all = myIssuedAgreements.length;
    const drafts = draftAgreements.length;
    const active = myIssuedAgreements.filter((a) => a.status === 'active').length;
    const pending = myIssuedAgreements.filter((a) =>
      ['awaiting_tenant_signature', 'awaiting_tenant_upload', 'pending_approval', 'pending_deposit'].includes(a.status)
    ).length;
    const terminated = myIssuedAgreements.filter((a) => a.status === 'terminated').length;
    return { all, drafts, active, pending, terminated };
  }, [myIssuedAgreements, draftAgreements]);

  const filteredAgreements = useMemo(() => {
    return myIssuedAgreements.filter((a) => {
      if (leaseStatusFilter === 'all') return true;
      if (leaseStatusFilter === 'active') return a.status === 'active';
      if (leaseStatusFilter === 'pending') {
        return ['awaiting_tenant_signature', 'awaiting_tenant_upload', 'pending_approval', 'pending_deposit'].includes(a.status);
      }
      if (leaseStatusFilter === 'terminated') return a.status === 'terminated';
      return true;
    });
  }, [myIssuedAgreements, leaseStatusFilter]);
  const myTenants = state.tenants.filter((t) => {
    if (Boolean(ownerId) && t.ownerId === ownerId) return true;
    if (t.propertyId && myPropertyIds.has(t.propertyId)) return true;
    if (myAgreements.some((a) => (a.tenantId && a.tenantId === t.id) || (a.tenantEmail && t.email && a.tenantEmail.toLowerCase() === t.email.toLowerCase()))) return true;
    if (myUnits.some((u) => u.currentTenantId === t.id)) return true;
    return false;
  });
  const myRenewals = (state.renewals || []).filter((r) => {
    // Hard reject: belongs to a different owner
    if (ownerId && r.ownerId && r.ownerId !== ownerId) return false;
    // Hard reject: bound to a property not owned by this owner
    if (r.propertyId && !myPropertyIds.has(r.propertyId)) return false;
    // Positive matches
    if (ownerId && r.ownerId === ownerId) return true;
    if (r.propertyId && myPropertyIds.has(r.propertyId)) return true;
    // Unit ID match (myUnits is already owner-scoped)
    const myUnitIds = new Set(myUnits.map((u) => u.id));
    if (r.unit && myUnitIds.has(r.unit)) return true;
    // Unit number match: must also verify by tenantId to prevent same-number collision
    if (r.unit && r.tenantId) {
      const matchedUnit = myUnits.find((u) => u.unitNumber === r.unit && myPropertyIds.has(u.propertyId));
      if (matchedUnit) return true;
    }
    return false;
  });

  const myPendingInvitations = (state.tenancyRequests || []).filter(
    (r) => (r.ownerId === ownerId || myPropertyIds.has(r.propertyId)) && r.status === 'pending'
  );

  const {
    currentPlan,
    currentPlanName,
    usage,
    checkAndRun,
    limitModalResource,
    openLimitModal,
    closeLimitModal,
  } = usePlanLimits();

  const maxTenants = usage.tenants.max;
  const isTenantLimitReached = usage.tenants.isFull;

  // File upload handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewAgFileName(file.name);
      setNewAgFileSize(Math.round(file.size / 1024));
      const reader = new FileReader();
      reader.onload = () => {
        setNewAgFileData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateAgreement = async () => {
    setIsCreatingAgreement(true);
    await new Promise((r) => setTimeout(r, 450));
    const unitObj = vacantUnits.find((u) => u.id === newAgUnit || u.unitNumber === newAgUnit) || myUnits.find((u) => u.id === newAgUnit);
    if (!unitObj) {
      setIsCreatingAgreement(false);
      showToast('⚠️ Please select a valid vacant unit to create an agreement.');
      return;
    }
    const agId = `AG-${Math.floor(1000 + Math.random() * 9000)}`;
    const tenantName = uploadTenantInfo?.name || newAgTenant.trim() || unitObj?.tenant || 'Resident';
    const tenantEmail = uploadTenantInfo?.email || '';
    const tenantPhone = uploadTenantInfo?.phone || '';
    const tenantId = uploadTenantInfo?.id || unitObj?.currentTenantId || `usr_tenant_${Date.now()}`;

    // Prefer id then email; avoid name-only match which can pick wrong tenant across owners
    const existingTenant = myTenants.find(
      (t) =>
        t.id === tenantId ||
        (tenantEmail && t.email?.toLowerCase() === tenantEmail.toLowerCase())
    );
    if (isTenantLimitReached && !existingTenant) {
      setIsCreatingAgreement(false);
      showToast(`⚠️ Tenant limit reached (${myTenants.length}/${maxTenants} on ${currentPlanName} tier). Please upgrade your plan to add more tenants.`);
      return;
    }

    const isOfflineMode = uploadMode === 'already_executed_offline';
    const nowIso = new Date().toISOString();

    if (!isOfflineMode) {
      // Digital Dispatch Workflow:
      // Dispatches an official TenancyRequest with attached agreement.
      // Tenant must first review & accept the offer on their dashboard
      // (same process as in Add Resident and Search & Invite).
      const requestId = `req_${Date.now()}`;
      const unitNumber = unitObj?.unitNumber || unitObj?.id || 'Unit';
      const targetProp = state.properties.find((p) => p.id === unitObj?.propertyId) || myProperties[0];
      const rentAmount = uploadRent || unitObj?.rent || 0;
      const depAmount = uploadDeposit || unitObj?.deposit || 0;
      const currencyCode = unitObj?.currency || targetProp?.currency || defaultOwnerCurrency;
      const cleanEmail = tenantEmail || `${tenantName.toLowerCase().replace(/\s+/g, '')}@tenant.com`;

      const newRequest: TenancyRequest = {
        id: requestId,
        ownerId,
        ownerName: user?.displayName || 'Property Owner',
        ownerEmail: user?.email || '',
        tenantId,
        tenantName,
        tenantEmail: cleanEmail,
        tenantPhone,
        propertyId: targetProp?.id || 'prop-1',
        propertyName: targetProp?.name || 'Property',
        unitId: unitObj?.id || newAgUnit,
        unitNumber,
        rent: rentAmount,
        deposit: depAmount,
        currency: currencyCode,
        leaseStart: newAgStart || getNextMonthFirstDateString(),
        leaseEnd: newAgEnd || getOneYearLaterDateString(getNextMonthFirstDateString()),
        message: `Welcome to your new home at ${targetProp?.name || 'Property'}! Please review the attached lease agreement for Unit ${unitNumber}, accept, sign, and upload your signed copy to proceed to security deposit settlement.`,
        agreementFileName: newAgFileName || 'Rental_Agreement.pdf',
        agreementFileData: newAgFileData,
        agreementFileSize: newAgFileSize || undefined,
        requireTenantId: newAgRequireIds,
        requiredIdList: newAgRequireIds ? newAgIdList.filter((i) => i.name.trim()) : [],
        requiredIdTypes: newAgRequireIds ? newAgIdList.map((i) => i.name.trim()).filter(Boolean) : [],
        status: 'pending',
        createdAt: nowIso,
      };

      // Reserve unit while tenancy invitation is pending
      if (unitObj) {
        saveUnit({
          ...unitObj,
          status: 'reserved',
          tenant: tenantName,
          currentTenantId: tenantId,
          rent: rentAmount || unitObj.rent,
          deposit: depAmount || unitObj.deposit,
        });
      }

      // In-app notification for tenant to accept on dashboard
      const notif = {
        id: `notif_${Date.now()}`,
        userId: tenantId,
        title: `Tenancy Offer & Lease Agreement from ${user?.displayName || 'Property Owner'}`,
        body: `You have received a tenancy invitation with attached lease agreement for Unit ${unitNumber} at ${targetProp?.name || 'Property'} (${getCurrencySymbol(currencyCode)}${rentAmount.toLocaleString()}/mo). Please inspect and accept on your dashboard.`,
        link: '/tenant/dashboard',
        isRead: false,
        createdAt: nowIso,
      };

      saveTenancyRequest(newRequest, notif);

      updateState((prev) => {
        const updatedUnits = prev.units.map((u) =>
          u.id === unitObj?.id
            ? {
              ...u,
              status: 'reserved' as const,
              tenant: tenantName,
              currentTenantId: tenantId,
              rent: rentAmount || u.rent,
              deposit: depAmount || u.deposit,
            }
            : u
        );

        const updatedProperties = prev.properties.map((p) => {
          if (p.id === unitObj?.propertyId) {
            const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
            return { ...p, occupied: occ };
          }
          return p;
        });

        // Upsert tenant record and provision user profile if new
        const existingTenantIndex = prev.tenants.findIndex(
          (t) =>
            t.id === tenantId ||
            (tenantEmail && t.email?.toLowerCase() === tenantEmail.toLowerCase())
        );
        let updatedTenants = [...prev.tenants];
        if (existingTenantIndex >= 0) {
          const t = prev.tenants[existingTenantIndex];
          const unitsRented = Array.from(new Set([...(t.unitsRented || []), unitNumber]));
          updatedTenants[existingTenantIndex] = {
            ...t,
            unit: unitNumber,
            unitsRented,
            owner: user?.displayName || 'Property Owner',
            ownerId,
            rent: rentAmount || t.rent,
            deposit: depAmount || t.deposit,
            currency: currencyCode,
            leaseStart: newAgStart || t.leaseStart,
            leaseEnd: newAgEnd || t.leaseEnd,
          };
        } else {
          const newRecord: TenantRecord = {
            id: tenantId,
            name: tenantName,
            email: cleanEmail,
            phone: tenantPhone || '',
            unit: unitNumber,
            owner: user?.displayName || 'Property Owner',
            ownerId,
            leaseStart: newAgStart || getNextMonthFirstDateString(),
            leaseEnd: newAgEnd || getOneYearLaterDateString(getNextMonthFirstDateString()),
            rent: rentAmount,
            deposit: depAmount,
            currency: currencyCode,
            rating: 5.0,
            unitsRented: [unitNumber],
            history: [],
            kycDocuments: [],
          };
          updatedTenants.push(newRecord);

          const newProfile: UserProfile = {
            id: tenantId,
            email: newRecord.email,
            role: 'tenant',
            ownerId,
            displayName: tenantName,
            phone: newRecord.phone,
            status: 'active',
            createdAt: nowIso,
            tempPassword: uploadTenantInfo?.tempPassword || 'Welcome@123',
          };
          saveTenant(newRecord, newProfile);
        }

        return {
          ...prev,
          tenancyRequests: [newRequest, ...(prev.tenancyRequests || [])],
          units: updatedUnits,
          properties: updatedProperties,
          tenants: updatedTenants,
          notifications: [...(prev.notifications || []), notif],
        };
      });

      setIsCreatingAgreement(false);
      setIsUploadOpen(false);
      showToast(`✓ Tenancy invitation with attached lease agreement dispatched to ${tenantName}! Unit ${unitNumber} reserved pending resident acceptance.`);
      return;
    }

    const newAg: Agreement = {
      id: agId,
      ownerId,
      propertyId: unitObj?.propertyId || 'prop-1',
      unit: unitObj?.unitNumber || unitObj?.id || 'Unit',
      tenant: tenantName,
      tenantId,
      tenantEmail,
      tenantPhone,
      type: 'uploaded',
      executionMode: uploadMode,
      contentHtml: null,
      fileName: newAgFileName,
      fileData: newAgFileData,
      initialAgreementUrl: newAgFileData || undefined,
      initialAgreementName: newAgFileName || undefined,
      initialUploadedAt: nowIso,
      ownerSignedDocumentUrl: newAgFileData || undefined,
      ownerSignedDocumentName: newAgFileName || undefined,
      ownerSignedUploadedAt: nowIso,
      start: newAgStart || getNextMonthFirstDateString(),
      end: newAgEnd || getOneYearLaterDateString(getNextMonthFirstDateString()),
      rent: uploadRent || unitObj?.rent || 0,
      deposit: uploadDeposit || unitObj?.deposit || 0,
      currency: unitObj?.currency || myProperties.find((p) => p.id === unitObj?.propertyId)?.currency || defaultOwnerCurrency,
      rentDueDay: uploadDueDay || 1,
      status: isOfflineMode ? 'active' : 'awaiting_tenant_upload',
      tenantSignature: null,
      signedDocumentUrl: isOfflineMode ? newAgFileData || undefined : undefined,
      signedDocumentName: isOfflineMode ? newAgFileName : undefined,
      signedUploadedAt: isOfflineMode ? nowIso : undefined,
      approvedAt: nowIso,
      approvedBy: user?.displayName || 'Property Owner',
      counterSignedAt: nowIso,
      counterSignatory: user?.displayName || 'Property Owner',
      depositStatus: isOfflineMode && offlineDepositCollected ? 'paid' : 'unpaid',
      autoRenew: newAgAuto === 'On',
      requireTenantId: newAgRequireIds,
      requiredIdList: newAgRequireIds ? newAgIdList.filter((i) => i.name.trim()) : [],
      requiredIdTypes: newAgRequireIds ? newAgIdList.map((i) => i.name.trim()).filter(Boolean) : [],
      requiredIdType: newAgRequireIds && newAgIdList.length > 0 ? newAgIdList[0].name.trim() : undefined,
    };

    updateState((prev) => {
      // If offline mode, mark occupied; if digital dispatch, mark reserved
      const updatedUnits = prev.units.map((u) =>
        u.id === unitObj?.id
          ? {
            ...u,
            status: isOfflineMode ? ('occupied' as const) : ('reserved' as const),
            tenant: tenantName,
            currentTenantId: tenantId,
            rent: uploadRent || u.rent,
            deposit: uploadDeposit || u.deposit,
          }
          : u
      );

      const updatedProperties = prev.properties.map((p) => {
        if (p.id === unitObj?.propertyId) {
          const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
          return { ...p, occupied: occ };
        }
        return p;
      });

      // If offline mode and deposit was already collected, record payment transaction
      const newPayments = [...prev.payments];
      if (isOfflineMode && offlineDepositCollected && (uploadDeposit || 0) > 0) {
        newPayments.unshift({
          id: `TXN-DEP-${Date.now().toString().slice(-6)}`,
          ownerId,
          tenant: tenantName,
          tenantId,
          unit: unitObj?.unitNumber || unitObj?.id || 'Unit',
          amount: uploadDeposit,
          date: new Date().toISOString().split('T')[0],
          dueDate: newAgStart,
          status: 'paid',
          method: offlineDepositRef || 'Offline Cash/Wire',
          type: 'deposit',
          currency: unitObj?.currency || myProperties.find((p) => p.id === unitObj?.propertyId)?.currency || defaultOwnerCurrency,
          notes: `Security deposit collected offline upon manual lease execution.`,
        });
      }

      // Sync or upsert TenantRecord in state.tenants
      const unitNumber = unitObj?.unitNumber || unitObj?.id || 'Unit';
      // Prefer id/email; avoid name-only match which can pick wrong tenant across owners
      const existingTenantIndex = prev.tenants.findIndex(
        (t) =>
          t.id === tenantId ||
          (tenantEmail && t.email?.toLowerCase() === tenantEmail.toLowerCase())
      );
      let updatedTenants = [...prev.tenants];
      if (existingTenantIndex >= 0) {
        const t = prev.tenants[existingTenantIndex];
        const unitsRented = Array.from(new Set([...(t.unitsRented || []), unitNumber]));
        updatedTenants[existingTenantIndex] = {
          ...t,
          unit: unitNumber,
          unitsRented,
          owner: user?.displayName || 'Property Owner',
          ownerId,
          rent: uploadRent || t.rent,
          deposit: uploadDeposit || t.deposit,
          currency: unitObj?.currency || t.currency || myProperties.find((p) => p.id === unitObj?.propertyId)?.currency || defaultOwnerCurrency,
          leaseStart: newAgStart || t.leaseStart,
          leaseEnd: newAgEnd || t.leaseEnd,
        };
      } else {
        const newRecord: TenantRecord = {
          id: tenantId,
          name: tenantName,
          email: tenantEmail || `${tenantName.toLowerCase().replace(/\s+/g, '')}@tenant.com`,
          phone: tenantPhone || '',
          unit: unitNumber,
          owner: user?.displayName || 'Property Owner',
          ownerId,
          leaseStart: newAgStart,
          leaseEnd: newAgEnd,
          rent: uploadRent || unitObj?.rent || 0,
          deposit: uploadDeposit || unitObj?.deposit || 0,
          currency: unitObj?.currency || myProperties.find((p) => p.id === unitObj?.propertyId)?.currency || defaultOwnerCurrency,
          rating: 5.0,
          unitsRented: [unitNumber],
          history: [],
          kycDocuments: [],
        };
        updatedTenants.push(newRecord);

        // Provision UserProfile account with tempPassword for first-time login
        const newProfile: UserProfile = {
          id: tenantId,
          email: newRecord.email,
          role: 'tenant',
          ownerId,
          displayName: tenantName,
          phone: newRecord.phone,
          status: 'active',
          createdAt: nowIso,
          tempPassword: uploadTenantInfo?.tempPassword || 'Welcome@123',
        };
        saveTenant(newRecord, newProfile);
      }

      // Notify tenant
      const notif = {
        id: `notif_${Date.now()}`,
        userId: tenantId,
        title: isOfflineMode ? 'Executed Lease Uploaded' : 'Lease Agreement Ready for Physical Signature',
        body: isOfflineMode
          ? `Your executed lease agreement for Unit ${unitObj?.unitNumber || unitObj?.id} is on file.`
          : `Your landlord has drafted your tenancy agreement for Unit ${unitObj?.unitNumber || unitObj?.id}. Please download, print, sign in ink, and upload your signed document to settle your security deposit.`,
        link: '/tenant/lease',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      // If offline mode, generate first month rent invoice
      let updatedInvoices = prev.invoices;
      if (isOfflineMode && (uploadRent || unitObj?.rent || 0) > 0) {
        const cleanAgId = agId.replace(/[^a-zA-Z0-9_-]/g, '');
        const rentInvId = `INV-RENT-${cleanAgId}-M1`;
        const propName = prev.properties.find((p) => p.id === newAg.propertyId)?.name || 'Rental Property';
        const rentAmount = uploadRent || unitObj?.rent || 0;
        const firstMonthRentInvoice: Invoice = {
          id: rentInvId,
          ownerId,
          propertyId: newAg.propertyId,
          tenant: tenantName,
          tenantId,
          unit: unitNumber,
          propertyName: propName,
          amount: rentAmount,
          tax: 0,
          total: rentAmount,
          currency: unitObj?.currency || myProperties.find((p) => p.id === unitObj?.propertyId)?.currency || defaultOwnerCurrency,
          due: newAgStart || getNextMonthFirstDateString(),
          status: 'sent',
          invoiceType: 'rent',
          leaseAgreementId: agId,
          issueDate: nowIso.split('T')[0],
          notes: `First month move-in rent pursuant to executed tenancy agreement for Unit ${unitNumber}.`,
          items: [
            {
              description: `First Month Rent (Move-in) — Unit ${unitNumber} (${propName})`,
              amount: rentAmount,
            },
          ],
        };
        saveInvoice(firstMonthRentInvoice);
        updatedInvoices = [firstMonthRentInvoice, ...prev.invoices];
      }

      saveAgreement(newAg);
      if (unitObj) {
        saveUnit({
          ...unitObj,
          status: isOfflineMode ? ('occupied' as const) : ('reserved' as const),
          tenant: tenantName,
          currentTenantId: tenantId,
          rent: uploadRent || unitObj.rent,
          deposit: uploadDeposit || unitObj.deposit,
        });
      }
      return {
        ...prev,
        agreements: [...prev.agreements, newAg],
        units: updatedUnits,
        properties: updatedProperties,
        tenants: updatedTenants,
        payments: newPayments,
        invoices: updatedInvoices,
        renewals: (prev.renewals || []).filter((r) => {
          if (r.unit === unitNumber && (!newAg.propertyId || !r.propertyId || r.propertyId === newAg.propertyId)) {
            const belongsToNewTenant =
              (tenantId && r.tenantId === tenantId) ||
              (tenantName && r.tenant && r.tenant.toLowerCase() === tenantName.toLowerCase());
            return belongsToNewTenant;
          }
          return true;
        }),
        notifications: [...(prev.notifications || []), notif],
      };
    });

    setIsCreatingAgreement(false);
    setIsUploadOpen(false);
    showToast(
      isOfflineMode
        ? `Agreement ${agId} uploaded as fully executed! Unit marked Occupied.`
        : `Agreement ${agId} dispatched! Unit marked Reserved (awaiting physical signature & deposit).`
    );
  };



  const openRenewalModalForUnit = (unitNumber: string, specificAgreement?: Agreement, targetPropertyId?: string) => {
    const effPropId = targetPropertyId || specificAgreement?.propertyId;
    const matchAgreement =
      specificAgreement ||
      state.agreements.find(
        (a) => (!effPropId || a.propertyId === effPropId) && (a.unit === unitNumber || a.id === unitNumber) && (a.status === 'active' || a.status === 'signed' || a.status === 'pending_deposit')
      ) ||
      state.agreements.find((a) => (!effPropId || a.propertyId === effPropId) && (a.unit === unitNumber || a.id === unitNumber));
    const matchUnit = myUnits.find((u) => (!effPropId || u.propertyId === effPropId) && (u.id === unitNumber || u.unitNumber === unitNumber));
    const matchTenant = state.tenants.find((t) => (!effPropId || t.propertyId === effPropId) && (t.unit === unitNumber || (t.unitsRented && t.unitsRented.includes(unitNumber))));
    const matchRenewal = (state.renewals || []).find((r) => {
      if ((r as any).agreementId && matchAgreement && (r as any).agreementId === matchAgreement.id) return true;
      if (r.unit !== unitNumber) return false;
      if (effPropId && r.propertyId && r.propertyId !== effPropId) return false;
      if (matchTenant) {
        if (r.tenantId && matchTenant.id && r.tenantId !== matchTenant.id) return false;
        if (r.tenant && matchTenant.name && r.tenant.toLowerCase() !== matchTenant.name.toLowerCase()) return false;
      }
      return true;
    });

    // Current effective active contracted rent (accounting for accepted renewals)
    const effectiveRentVal =
      Number(
        matchAgreement?.renewalTerms?.newRent ||
        matchAgreement?.rent ||
        matchTenant?.rent ||
        matchUnit?.rent
      ) || 0;

    // Current effective active lease expiry date
    const effectiveLeaseEnd =
      matchAgreement?.renewalTerms?.newLeaseEnd ||
      matchAgreement?.end ||
      matchTenant?.leaseEnd ||
      matchRenewal?.newLeaseEnd ||
      matchRenewal?.leaseEnd ||
      new Date().toISOString().split('T')[0];

    const duration =
      matchRenewal?.status === 'renewal_requested' && matchRenewal.termMonths
        ? matchRenewal.termMonths
        : 12;

    // Default upcoming period: start is the day after the current active lease ends
    let defaultStartStr = '';
    let defaultEndStr = '';
    const currentEndObj = new Date(effectiveLeaseEnd);
    if (!isNaN(currentEndObj.getTime())) {
      const nextDay = new Date(currentEndObj.getTime() + 86400000);
      defaultStartStr = nextDay.toISOString().split('T')[0];
      const endObj = new Date(nextDay);
      endObj.setMonth(endObj.getMonth() + duration);
      defaultEndStr = endObj.toISOString().split('T')[0];
    } else {
      defaultStartStr = getNextMonthFirstDateString();
      defaultEndStr = getOneYearLaterDateString(defaultStartStr);
    }

    const pct =
      matchRenewal && matchRenewal.status === 'renewal_requested' && matchRenewal.percentageIncrease
        ? matchRenewal.percentageIncrease
        : 10;
    const compRent = Math.round(effectiveRentVal * (1 + pct / 100));

    const itemToSet: RenewalItem = {
      unit: unitNumber,
      tenant: matchAgreement?.tenant || matchTenant?.name || matchRenewal?.tenant || 'Resident',
      tenantId: matchAgreement?.tenantId || matchTenant?.id || matchRenewal?.tenantId,
      ownerId: matchAgreement?.ownerId || matchTenant?.ownerId || ownerId,
      propertyId: matchAgreement?.propertyId || matchTenant?.propertyId || matchRenewal?.propertyId,
      propertyName: matchTenant?.propertyName || matchRenewal?.propertyName,
      currentRent: effectiveRentVal,
      leaseEnd: effectiveLeaseEnd,
      daysLeft: Math.max(0, Math.ceil((new Date(effectiveLeaseEnd).getTime() - Date.now()) / (1000 * 3600 * 24))),
      status: matchRenewal?.status || 'pending_decision',
      tenantNotes: matchRenewal?.status === 'renewal_requested' ? matchRenewal.tenantNotes : undefined,
    };

    setRenewalModalItem(itemToSet);
    setRenewalCurrentRent(effectiveRentVal);
    setRenewalPercent(pct);
    setRenewalNewRent(compRent);
    setRenewalDurationMonths(duration);
    setRenewalStartDate(defaultStartStr);
    setRenewalEndDate(defaultEndStr);
    setRenewalOwnerNotes(matchRenewal?.ownerNotes || '');
    setRenewalAgreementFileUrl(null);
    setRenewalAgreementFileName('');
    setRenewalAgreementFileSize(null);
  };

  const openRenewalForAgreement = (a: Agreement) => {
    openRenewalModalForUnit(a.unit, a);
  };

  const handleRenewalDurationChange = (months: number) => {
    setRenewalDurationMonths(months);
    const startObj = renewalStartDate ? new Date(renewalStartDate) : new Date();
    if (!isNaN(startObj.getTime())) {
      const endObj = new Date(startObj);
      endObj.setMonth(endObj.getMonth() + months);
      setRenewalEndDate(endObj.toISOString().split('T')[0]);
    }
  };

  const handleRenewalStartDateChange = (newStart: string) => {
    setRenewalStartDate(newStart);
    const startObj = new Date(newStart);
    if (!isNaN(startObj.getTime())) {
      const endObj = new Date(startObj);
      endObj.setMonth(endObj.getMonth() + renewalDurationMonths);
      setRenewalEndDate(endObj.toISOString().split('T')[0]);
    }
  };

  const inspectingDepInv = inspectingSignedAgreement
    ? (state.invoices || []).find(
      (inv) =>
        inspectingSignedAgreement.depositInvoiceId
          ? inv.id === inspectingSignedAgreement.depositInvoiceId
          : inv.leaseAgreementId === inspectingSignedAgreement.id && (inv.invoiceType === 'deposit' || inv.type === 'deposit')
    )
    : null;
  const isInspectingDepositPaid = inspectingSignedAgreement
    ? (inspectingSignedAgreement.depositStatus === 'paid' || inspectingDepInv?.status === 'paid')
    : false;

  return (
    <div>
      <div className="tabs" data-tour="leasing-subtabs">
        <div
          className={`tab ${subTab === 'agreements' ? 'active' : ''}`}
          onClick={() => setSubTab('agreements')}
        >
          Leases
        </div>
        <div
          className={`tab ${subTab === 'renewals' ? 'active' : ''}`}
          onClick={() => setSubTab('renewals')}
        >
          Renewals
        </div>
        <div
          className={`tab ${subTab === 'library' ? 'active' : ''}`}
          onClick={() => setSubTab('library')}
        >
          Lease Templates ({myTemplates.length})
        </div>
        <div
          className={`tab ${subTab === 'drafts' ? 'active' : ''}`}
          onClick={() => setSubTab('drafts')}
        >
          Drafts ({draftAgreements.length})
        </div>
      </div>

      {subTab === 'agreements' ? (
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div className="hint">{myIssuedAgreements.length} leases on file</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                data-tour="leasing-issue-btn"
                className="btn brass btn-mobile-full"
                disabled={!isPlanActive}
                title={isTenantLimitReached ? `Tenant limit reached (${maxTenants} max on ${currentPlanName} tier) - Click to upgrade` : undefined}
                onClick={() => {
                  checkAndRun('tenants', () => {
                    if (vacantUnits.length === 0) {
                      showToast('⚠️ No vacant units available. All units in your portfolio are currently occupied.');
                      return;
                    }
                    setActiveDraftId(null);
                    setIsUploadOpen(true);
                  });
                }}
              >
                + New Lease
              </button>
            </div>
          </div>

          {isTenantLimitReached && (
            <div style={{ background: 'var(--amber-soft)', border: '1px solid var(--amber)', padding: '12px 18px', borderRadius: '8px', fontSize: '13px', color: 'var(--amber)', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                ⚠️ <b>Tenant limit reached:</b> You have reached the maximum allowance of {maxTenants} tenants on your <b>{currentPlanName}</b> subscription tier.
              </div>
              <button type="button" className="btn brass small" onClick={() => openLimitModal('tenants')}>
                Upgrade Plan
              </button>
            </div>
          )}

          {myPendingInvitations.length > 0 && (
            <div
              style={{
                background: '#FFFDF0',
                border: '1px solid #FCD34D',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={18} color="#D97706" />
                <div style={{ fontSize: '13px', color: '#92400E' }}>
                  <b>{myPendingInvitations.length} Pending Tenancy Invitation{myPendingInvitations.length > 1 ? 's' : ''}:</b> Dispatched and reserved pending tenant review & acceptance on their dashboard.
                </div>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => navigate('/owner/tenants')}
                style={{ fontSize: '12px', background: 'var(--surface)' }}
              >
                View in Resident Invitations →
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
            <button
              type="button"
              className={`pill-filter ${leaseStatusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setLeaseStatusFilter('all')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: leaseStatusFilter === 'all' ? 700 : 500,
                background: leaseStatusFilter === 'all' ? 'var(--brass)' : 'var(--surface-sunken)',
                color: leaseStatusFilter === 'all' ? '#FFF' : 'var(--ink)',
                border: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              All Leases ({agreementCounts.all})
            </button>
            <button
              type="button"
              className={`pill-filter ${leaseStatusFilter === 'active' ? 'active' : ''}`}
              onClick={() => setLeaseStatusFilter('active')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: leaseStatusFilter === 'active' ? 700 : 500,
                background: leaseStatusFilter === 'active' ? 'var(--brass)' : 'var(--surface-sunken)',
                color: leaseStatusFilter === 'active' ? '#FFF' : 'var(--ink)',
                border: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              Active ({agreementCounts.active})
            </button>
            <button
              type="button"
              className={`pill-filter ${leaseStatusFilter === 'pending' ? 'active' : ''}`}
              onClick={() => setLeaseStatusFilter('pending')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: leaseStatusFilter === 'pending' ? 700 : 500,
                background: leaseStatusFilter === 'pending' ? 'var(--brass)' : 'var(--surface-sunken)',
                color: leaseStatusFilter === 'pending' ? '#FFF' : 'var(--ink)',
                border: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              Pending ({agreementCounts.pending})
            </button>
            <button
              type="button"
              className={`pill-filter ${leaseStatusFilter === 'terminated' ? 'active' : ''}`}
              onClick={() => setLeaseStatusFilter('terminated')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '12.5px',
                fontWeight: leaseStatusFilter === 'terminated' ? 700 : 500,
                background: leaseStatusFilter === 'terminated' ? 'var(--brass)' : 'var(--surface-sunken)',
                color: leaseStatusFilter === 'terminated' ? '#FFF' : 'var(--ink)',
                border: '1px solid var(--line)',
                cursor: 'pointer',
              }}
            >
              Terminated ({agreementCounts.terminated})
            </button>
          </div>

          <div className="panel">
            <div className="panel-body">
              {/* Desktop Table View */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Resident</th>
                        <th>Unit</th>
                        <th>Term & Rent</th>
                        <th>Status</th>
                        <th>Signed Document</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAgreements.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px 16px' }}>
                            No lease agreements found{leaseStatusFilter && leaseStatusFilter !== 'all' ? ` matching "${leaseStatusFilter}"` : ''}.
                          </td>
                        </tr>
                      ) : (
                        filteredAgreements.map((a) => {
                          const matchingDepInv = (state.invoices || []).find(
                            (inv) =>
                              a.depositInvoiceId
                                ? inv.id === a.depositInvoiceId
                                : inv.leaseAgreementId === a.id && (inv.invoiceType === 'deposit' || inv.type === 'deposit')
                          );
                          const isDepositPaid = a.depositStatus === 'paid' || matchingDepInv?.status === 'paid';
                          const isPendingApproval = a.status === 'pending_approval' || (a as any).status === 'awaiting_owner_signature';
                          const isPendingDeposit = (a.status === 'pending_deposit' || a.depositStatus === 'unpaid') && !isDepositPaid && !isPendingApproval;
                          const isLeaseActive = a.status === 'active' && !isPendingApproval;
                          const initialDocUrl = a.initialAgreementUrl || a.fileData || a.ownerSignedDocumentUrl;
                          const initialDocName = a.initialAgreementName || a.fileName || a.ownerSignedDocumentName || `Landlord_Signed_Lease_${a.unit}.pdf`;

                          return (
                            <tr key={a.id}>
                              <td>
                                <b>{a.id}</b>
                                <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                  {a.executionMode === 'already_executed_offline' ? 'Paper Lease' : 'Sent Online'}
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600 }}>{a.tenant}</div>
                                {(a.tenantEmail || a.tenantPhone) && (
                                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                    {a.tenantEmail || a.tenantPhone}
                                  </div>
                                )}
                              </td>
                              <td>
                                <b>Unit {a.unit}</b>
                              </td>
                              <td>
                                <div>{a.start} → {a.end}</div>
                                <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                                  {formatMoney(a.rent || 0, a.currency)}/mo • {formatMoney(a.deposit || 0, a.currency)} dep
                                </div>
                              </td>
                              <td>
                                {a.status === 'draft' ? (
                                  <span className="badge grey" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }}>
                                    <Bookmark size={12} color="#64748B" /> Draft ({a.tenant && a.tenant !== 'Unassigned Resident' ? 'Ready' : 'Unassigned'})
                                  </span>
                                ) : isLeaseActive ? (
                                  <span className="badge green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle2 size={12} /> Active Lease
                                  </span>
                                ) : a.status === 'awaiting_tenant_upload' ? (
                                  <span className="badge amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={12} /> Awaiting Resident Sign
                                  </span>
                                ) : isPendingApproval ? (
                                  <span className="badge amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
                                    <Clock size={12} /> Pending Your Approval
                                  </span>
                                ) : isPendingDeposit ? (
                                  <span className="badge blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <CreditCard size={12} /> Deposit Pending
                                  </span>
                                ) : (
                                  <span className="badge grey">{a.status}</span>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                  {/* Record 1: Before Tenant Sign (Landlord Pre-Signed Copy) */}
                                  {initialDocUrl ? (
                                    <a
                                      className="badge grey"
                                      href={initialDocUrl}
                                      download={initialDocName}
                                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', width: 'fit-content', fontSize: '11px', color: 'var(--ink)' }}
                                      title="Download initial agreement uploaded by landlord"
                                    >
                                      <FileText size={12} color="var(--brass)" />
                                      <span>1. Offer Sent</span>
                                    </a>
                                  ) : (
                                    <span className="badge grey" style={{ fontSize: '10.5px', width: 'fit-content' }}>
                                      1. Initial File Missing
                                    </span>
                                  )}

                                  {/* Record 2: After Tenant Sign (Resident Signed Copy) */}
                                  {a.signedDocumentUrl ? (
                                    <button
                                      type="button"
                                      className="btn secondary small"
                                      onClick={() => setInspectingSignedAgreement(a)}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content', padding: '2px 8px', fontSize: '11px' }}
                                      title="View resident signed submission"
                                    >
                                      <FileCheck size={12} color="var(--ledger)" /> 2. Resident Signed Copy
                                    </button>
                                  ) : (
                                    <span className="badge grey" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content', fontSize: '10.5px', color: 'var(--ink-soft)' }}>
                                      <Clock size={11} /> 2. Resident Sign Pending
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                  {a.status === 'draft' ? (
                                    <>
                                      <button
                                        type="button"
                                        className="btn brass small"
                                        onClick={() => {
                                          setActiveDraftId(a.id);
                                          setIsUploadOpen(true);
                                        }}
                                        title="Assign a tenant and issue offer"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                      >
                                        <UserCheck size={13} /> Assign &amp; Issue
                                      </button>
                                      <button
                                        type="button"
                                        className="btn secondary small"
                                        onClick={() => {
                                          setActiveDraftId(a.id);
                                          setIsUploadOpen(true);
                                        }}
                                        title="Edit draft lease terms"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                      >
                                        <Edit size={13} /> Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="btn secondary small"
                                        onClick={async () => {
                                          if (window.confirm(`Discard draft lease for Unit ${a.unit}?`)) {
                                            await deleteAgreement(a.id);
                                            showToast(`✓ Draft lease for Unit ${a.unit} deleted.`);
                                          }
                                        }}
                                        title="Delete draft lease"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#DC2626' }}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {isPendingApproval && (
                                        <button
                                          type="button"
                                          className="btn brass small"
                                          onClick={() => {
                                            setInspectingSignedAgreement(a);
                                          }}
                                          title="Review resident signed agreement and approve"
                                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        >
                                          <CheckCircle2 size={13} /> Review &amp; Approve
                                        </button>
                                      )}
                                      {isLeaseActive && a.status !== 'terminated' && (
                                        <button
                                          type="button"
                                          className="btn secondary small"
                                          title="Offer or configure lease renewal terms for this tenancy"
                                          onClick={() => openRenewalForAgreement(a)}
                                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        >
                                          <Calendar size={13} /> Renew Lease
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="btn secondary small"
                                        title="Download formal draft agreement PDF for physical signature"
                                        onClick={() => {
                                          const propName = state.properties.find((p) => p.id === a.propertyId)?.name || 'Property Residence';
                                          downloadAgreementPDF(a, propName, user?.displayName || 'Property Owner', a.tenant);
                                        }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                      >
                                        <Download size={13} /> PDF
                                      </button>
                                      <button
                                        type="button"
                                        className="btn secondary small"
                                        onClick={() => setViewingAgreement(a)}
                                        title="View agreement details"
                                      >
                                        <Eye size={13} />
                                      </button>
                                    </>
                                  )}
                                </div>
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
                {myAgreements.length === 0 ? (
                  <div className="staff-card" style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 16px' }}>
                    No lease agreements on record. Use "+ Create Lease" above to create and record a lease agreement.
                  </div>
                ) : (
                  myAgreements.map((a) => {
                    const matchingDepInv = (state.invoices || []).find(
                      (inv) =>
                        a.depositInvoiceId
                          ? inv.id === a.depositInvoiceId
                          : inv.leaseAgreementId === a.id && (inv.invoiceType === 'deposit' || inv.type === 'deposit')
                    );
                    const isDepositPaid = a.depositStatus === 'paid' || matchingDepInv?.status === 'paid';
                    const isPendingApproval = a.status === 'pending_approval';
                    const isPendingDeposit = (a.status === 'pending_deposit' || a.depositStatus === 'unpaid') && !isDepositPaid;
                    const isLeaseActive = a.status === 'active' || isDepositPaid;
                    const initialDocUrl = a.initialAgreementUrl || a.fileData || a.ownerSignedDocumentUrl;
                    const initialDocName = a.initialAgreementName || a.fileName || a.ownerSignedDocumentName || `Landlord_Signed_Lease_${a.unit}.pdf`;

                    return (
                      <div key={a.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div>
                            <b style={{ fontSize: '14px' }}>{a.id}</b>
                            <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                              {a.executionMode === 'already_executed_offline' ? 'Paper Lease' : 'Sent Online'}
                            </div>
                          </div>
                          <div>
                            {isLeaseActive ? (
                              <span className="badge green" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle2 size={12} /> Active Lease
                              </span>
                            ) : a.status === 'awaiting_tenant_upload' ? (
                              <span className="badge amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={12} /> Awaiting Resident Sign
                              </span>
                            ) : isPendingApproval ? (
                              <span className="badge amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
                                <Clock size={12} /> Pending Approval
                              </span>
                            ) : isPendingDeposit ? (
                              <span className="badge blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CreditCard size={12} /> Deposit Pending
                              </span>
                            ) : (
                              <span className="badge grey">{a.status}</span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                          <div>
                            <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Resident</div>
                            <b style={{ color: 'var(--ink)' }}>{a.tenant}</b>
                            {(a.tenantEmail || a.tenantPhone) && (
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{a.tenantEmail || a.tenantPhone}</div>
                            )}
                          </div>
                          <div>
                            <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Unit & Rent</div>
                            <b>Unit {a.unit}</b>
                            <div style={{ fontSize: '11px', color: 'var(--ledger)' }}>{formatMoney(a.rent || 0, a.currency)}/mo</div>
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Term & Deposit</div>
                            <div>{a.start} → {a.end}</div>
                            <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Deposit: {formatMoney(a.deposit || 0, a.currency)}</div>
                          </div>
                        </div>

                        {/* Documents snippet */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {initialDocUrl && (
                            <a
                              className="badge grey"
                              href={initialDocUrl}
                              download={initialDocName}
                              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--ink)' }}
                            >
                              <FileText size={12} color="var(--brass)" /> Lease Copy
                            </a>
                          )}
                          {a.signedDocumentUrl && (
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => setInspectingSignedAgreement(a)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', fontSize: '11px' }}
                            >
                              <FileCheck size={12} color="var(--ledger)" /> Resident Signed Copy
                            </button>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {a.status === 'draft' ? (
                            <>
                              <button
                                type="button"
                                className="btn brass small btn-mobile-full"
                                onClick={() => {
                                  setActiveDraftId(a.id);
                                  setIsUploadOpen(true);
                                }}
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                              >
                                <UserCheck size={13} /> Assign &amp; Issue
                              </button>
                              <button
                                type="button"
                                className="btn secondary small btn-mobile-full"
                                onClick={() => {
                                  setActiveDraftId(a.id);
                                  setIsUploadOpen(true);
                                }}
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                              >
                                <Edit size={13} /> Edit Draft
                              </button>
                              <button
                                type="button"
                                className="btn secondary small btn-mobile-full"
                                onClick={async () => {
                                  if (window.confirm(`Discard draft lease for Unit ${a.unit}?`)) {
                                    await deleteAgreement(a.id);
                                    showToast(`✓ Draft lease for Unit ${a.unit} deleted.`);
                                  }
                                }}
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#DC2626' }}
                              >
                                <Trash2 size={13} /> Delete Draft
                              </button>
                            </>
                          ) : (
                            <>
                              {isPendingApproval && (
                                <button
                                  type="button"
                                  className="btn brass small btn-mobile-full"
                                  onClick={() => {
                                    setInspectingSignedAgreement(a);
                                  }}
                                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                >
                                  <CheckCircle2 size={13} /> Review &amp; Approve
                                </button>
                              )}
                              {isLeaseActive && a.status !== 'terminated' && (
                                <button
                                  type="button"
                                  className="btn secondary small btn-mobile-full"
                                  title="Offer or configure lease renewal terms for this tenancy"
                                  onClick={() => openRenewalForAgreement(a)}
                                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                >
                                  <Calendar size={13} /> Renew Lease
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn secondary small btn-mobile-full"
                                onClick={() => {
                                  const propName = state.properties.find((p) => p.id === a.propertyId)?.name || 'Property Residence';
                                  downloadAgreementPDF(a, propName, user?.displayName || 'Property Owner', a.tenant);
                                }}
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                              >
                                <Download size={13} /> Download Draft PDF
                              </button>
                              <button
                                type="button"
                                className="btn secondary small btn-mobile-full"
                                onClick={() => setViewingAgreement(a)}
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                              >
                                <Eye size={13} /> View Details
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : subTab === 'renewals' ? (
        <div>
          <div className="panel">
            <div className="panel-body">
              <p style={{ color: 'var(--ink-soft)', marginBottom: '14px' }}>
                Propithub flags leases 60 and 30 days before expiry automatically.
              </p>
              {/* Desktop Table View */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Tenant</th>
                        <th>Lease ends</th>
                        <th>Days left</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myRenewals.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--ink-soft)' }}>
                            No lease renewals on record for your properties. Leases expiring within 60 days will appear here.
                          </td>
                        </tr>
                      ) : (
                        myRenewals.map((r: RenewalItem) => (
                          <tr key={r.id || `${r.propertyId || ''}_${r.unit}`}>
                            <td><b>{r.unit}</b></td>
                            <td>{r.tenant}</td>
                            <td>{r.leaseEnd}</td>
                            <td>{r.daysLeft}</td>
                            <td>
                              <span
                                className={`badge ${r.status === 'auto_renew_set'
                                  ? 'green'
                                  : r.status === 'accepted'
                                    ? 'green'
                                    : r.status === 'signed_by_tenant'
                                      ? 'amber'
                                      : r.status === 'renewal_offered'
                                        ? 'blue'
                                        : r.status === 'rejected'
                                          ? 'red'
                                          : r.status === 'renewal_requested'
                                            ? 'amber'
                                            : 'grey'
                                  }`}
                              >
                                {r.status === 'auto_renew_set'
                                  ? 'Auto-renew set'
                                  : r.status === 'accepted'
                                    ? 'Lease Renewed & Active'
                                    : r.status === 'signed_by_tenant'
                                      ? 'Signed by Resident — Review Required'
                                      : r.status === 'renewal_offered'
                                        ? `Renewal offered ${r.percentageIncrease ? `(+${r.percentageIncrease}%)` : ''}`
                                        : r.status === 'rejected'
                                          ? 'Declined by Resident'
                                          : r.status === 'renewal_requested'
                                            ? 'Renewal Requested by Resident'
                                            : 'Awaiting decision'}
                              </span>
                            </td>
                            <td>
                              {r.status === 'accepted' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <CheckCircle2 size={13} /> Active Renewal
                                  </span>
                                  <button
                                    type="button"
                                    className="btn brass small"
                                    style={{ padding: '2px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
                                    onClick={() => openRenewalModalForUnit(r.unit, undefined, r.propertyId)}
                                    title="Offer renewal for the next upcoming term after this extended lease ends"
                                  >
                                    Offer Next Term Renewal
                                  </button>
                                  {(r.tenantSignedFileUrl || r.ownerAgreementFileUrl) && (
                                    <a
                                      href={r.tenantSignedFileUrl || r.ownerAgreementFileUrl || '#'}
                                      download={r.tenantSignedFileName || r.ownerAgreementFileName || `Renewal_Agreement_${r.unit}.pdf`}
                                      className="btn secondary small"
                                      style={{ padding: '2px 8px', fontSize: '11px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                      title="Download renewal agreement"
                                    >
                                      <Download size={11} /> Agreement
                                    </a>
                                  )}
                                </div>
                              ) : r.status === 'signed_by_tenant' ? (
                                <button
                                  type="button"
                                  className="btn brass small"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  onClick={() => setInspectingSignedRenewal(r)}
                                >
                                  <CheckCircle2 size={13} /> Review &amp; Approve
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={`btn small ${r.status === 'renewal_requested' ? 'brass' : 'secondary'}`}
                                  onClick={() => openRenewalModalForUnit(r.unit, undefined, r.propertyId)}
                                >
                                  {r.status === 'renewal_requested'
                                    ? 'Review & Offer Terms'
                                    : r.status === 'renewal_offered'
                                      ? 'Update Offer'
                                      : r.status === 'rejected'
                                        ? 'Re-propose Offer'
                                        : 'Offer renewal'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-card-view">
                {myRenewals.length === 0 ? (
                  <div className="empty" style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                    No lease renewals on record for your properties.
                  </div>
                ) : (
                  myRenewals.map((r: RenewalItem) => (
                    <div key={r.id || `${r.propertyId || ''}_${r.unit}`} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div>
                          <b style={{ fontSize: '14px' }}>Unit {r.unit}</b>
                          <div style={{ fontSize: '12px', color: 'var(--ink)' }}>{r.tenant}</div>
                        </div>
                        <span
                          className={`badge ${r.status === 'auto_renew_set'
                            ? 'green'
                            : r.status === 'accepted'
                              ? 'green'
                              : r.status === 'signed_by_tenant'
                                ? 'amber'
                                : r.status === 'renewal_offered'
                                  ? 'blue'
                                  : r.status === 'rejected'
                                    ? 'red'
                                    : r.status === 'renewal_requested'
                                      ? 'amber'
                                      : 'grey'
                            }`}
                        >
                          {r.status === 'auto_renew_set'
                            ? 'Auto-renew set'
                            : r.status === 'accepted'
                              ? 'Lease Renewed & Active'
                              : r.status === 'signed_by_tenant'
                                ? 'Signed by Resident — Review Required'
                                : r.status === 'renewal_offered'
                                  ? `Renewal offered ${r.percentageIncrease ? `(+${r.percentageIncrease}%)` : ''}`
                                  : r.status === 'rejected'
                                    ? 'Declined by Resident'
                                    : r.status === 'renewal_requested'
                                      ? 'Renewal Requested'
                                      : 'Awaiting decision'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Lease Ends</div>
                          <b>{r.leaseEnd}</b>
                        </div>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Days Left</div>
                          <b style={{ color: r.daysLeft <= 30 ? 'var(--danger)' : 'var(--brass)' }}>{r.daysLeft} days</b>
                        </div>
                      </div>

                      {r.status === 'accepted' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: 600 }}>
                            ✓ Active (thru {r.newLeaseEnd || r.leaseEnd})
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn brass small"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              onClick={() => openRenewalModalForUnit(r.unit, undefined, r.propertyId)}
                            >
                              Offer Next Term
                            </button>
                            {(r.tenantSignedFileUrl || r.ownerAgreementFileUrl) && (
                              <a
                                href={r.tenantSignedFileUrl || r.ownerAgreementFileUrl || '#'}
                                download={r.tenantSignedFileName || r.ownerAgreementFileName || `Renewal_Agreement_${r.unit}.pdf`}
                                className="btn secondary small"
                                style={{ padding: '3px 8px', fontSize: '11px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                title="Download renewal agreement"
                              >
                                <Download size={11} />
                              </a>
                            )}
                          </div>
                        </div>
                      ) : r.status === 'signed_by_tenant' ? (
                        <button
                          type="button"
                          className="btn brass small btn-mobile-full"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          onClick={() => setInspectingSignedRenewal(r)}
                        >
                          <CheckCircle2 size={13} /> Review &amp; Approve
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`btn small btn-mobile-full ${r.status === 'renewal_requested' ? 'brass' : 'secondary'}`}
                          onClick={() => openRenewalModalForUnit(r.unit, undefined, r.propertyId)}
                        >
                          {r.status === 'renewal_requested'
                            ? 'Review & Offer Terms'
                            : r.status === 'renewal_offered'
                              ? 'Update Offer'
                              : r.status === 'rejected'
                                ? 'Re-propose Offer'
                                : 'Offer renewal'}
                        </button>
                      )}
                    </div>
                  )))}
              </div>
            </div>
          </div>
        </div>
      ) : subTab === 'library' ? (
        /* ======================================================== */
        /* AGREEMENT LIBRARY TAB                                    */
        /* ======================================================== */
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div className="hint">{myTemplates.length} lease templates on file</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={() => setIsUploadTemplateOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={15} /> Upload Lease Template
              </button>
            </div>
          </div>

          {/* Search & Property Filter Bar */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
              <input
                type="text"
                placeholder="Search templates by title, property, or file..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                style={{ width: '100%', fontSize: '13px', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)' }}
              />
            </div>
            <div style={{ width: '220px' }}>
              <select
                value={templatePropertyFilter}
                onChange={(e) => setTemplatePropertyFilter(e.target.value)}
                style={{ width: '100%', fontSize: '13px', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}
              >
                <option value="all">All Properties</option>
                {myProperties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            {(templateSearch || templatePropertyFilter !== 'all') && (
              <button
                type="button"
                className="btn secondary small"
                onClick={() => {
                  setTemplateSearch('');
                  setTemplatePropertyFilter('all');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Templates Table */}
          <div className="panel">
            <div className="panel-body">
              {filteredTemplates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--ink-soft)' }}>
                  <FileText size={40} color="var(--ink-muted)" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                    {myTemplates.length === 0 ? 'No Lease Templates in Library' : 'No Matching Templates Found'}
                  </h4>
                  <p style={{ fontSize: '13px', maxWidth: '420px', margin: '0 auto', lineHeight: 1.5 }}>
                    {myTemplates.length === 0
                      ? 'Upload your standard lease agreements, master rules, or property contract PDFs here to easily reuse them whenever adding residents.'
                      : 'Try adjusting your search terms or property filter above.'}
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Document & Title</th>
                        <th>Associated Property</th>
                        <th>File Name & Size</th>
                        <th>Uploaded On</th>
                        <th>Uploaded By</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTemplates.map((t) => {
                        const isPdf = t.fileName.toLowerCase().endsWith('.pdf');
                        return (
                          <tr key={t.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '34px', height: '34px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981', flexShrink: 0 }}>
                                  <FileText size={18} />
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{t.title}</div>
                                  {t.description && (
                                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '1px' }}>
                                      {t.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="badge" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
                                {t.propertyName || 'All Properties'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: isPdf ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: isPdf ? '#DC2626' : '#2563EB' }}>
                                  {isPdf ? 'PDF' : 'DOC'}
                                </span>
                                <span style={{ fontWeight: 500, fontSize: '12.5px' }}>{t.fileName}</span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-muted)', marginTop: '2px' }}>
                                {t.fileSizeKb ? `${t.fileSizeKb} KB` : 'Standard PDF'}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
                                {new Date(t.uploadedAt).toLocaleDateString()}
                              </div>
                            </td>
                            <td>
                              {t.uploadedBy === 'admin' ? (
                                <span className="badge blue" style={{ fontSize: '11px' }}>Platform Admin</span>
                              ) : (
                                <span className="badge green" style={{ fontSize: '11px' }}>Owner</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  onClick={() => setPreviewingTemplate(t)}
                                >
                                  <Eye size={13} /> Preview
                                </button>
                                <a
                                  href={t.fileData}
                                  download={t.fileName || 'agreement.pdf'}
                                  className="btn secondary small"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                                >
                                  <Download size={13} /> Download
                                </a>
                                {((user?.role === 'superadmin' || (user?.role as string) === 'admin') || t.ownerId === ownerId) && (
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    title={(user?.role === 'superadmin' || (user?.role as string) === 'admin') ? 'Delete document (Admin Authority)' : 'Delete document from library'}
                                    style={{ color: '#DC2626', borderColor: 'rgba(220, 38, 38, 0.3)', padding: '4px 8px' }}
                                    onClick={() => setDeletingTemplate(t)}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : subTab === 'drafts' ? (
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div className="hint" style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
                {draftAgreements.length} draft lease{draftAgreements.length === 1 ? '' : 's'} on file
              </div>
              {/* <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--ink-muted)' }}>
                Draft leases ready for tenant assignment and execution. Units remain vacant while in draft.
              </p> */}
            </div>
            <button
              type="button"
              className="btn brass btn-mobile-full"
              onClick={() => {
                setActiveDraftId(null);
                setIsUploadOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              + New Draft
            </button>
          </div>

          <div className="panel">
            <div className="panel-body">
              {draftAgreements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--ink-soft)' }}>
                  <Bookmark size={36} color="var(--brass)" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
                  <h4 style={{ margin: '0 0 6px', fontSize: '16px', color: 'var(--ink)' }}>No Draft Leases</h4>
                  <p style={{ margin: 0, fontSize: '13px', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                    You have no in-progress drafts. Create a draft ahead of time for any unit and assign it to an applicant when they're ready.
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="desktop-table-view">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Draft Agreement</th>
                            <th>Unit &amp; Property</th>
                            <th>Target Resident</th>
                            <th>Term &amp; Rent</th>
                            <th>Progress</th>
                            <th>Document</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draftAgreements.map((a) => {
                            const hasTenant = Boolean(a.tenant && a.tenant !== 'Unassigned Resident' && a.tenant.trim());
                            const hasUnit = Boolean(a.unit && a.unit !== 'Unassigned Unit' && a.unit !== 'Unassigned' && a.unit.trim());
                            const propName = a.propertyName && a.propertyName !== 'Unassigned Property'
                              ? a.propertyName
                              : (state.properties.find((p) => p.id === a.propertyId)?.name || '');
                            const cleanFileName = a.fileName && a.fileName !== 'Lease_Agreement.pdf' ? a.fileName.replace(/\.[^/.]+$/, '') : '';

                            // Dynamic Human-Readable Agreement Name
                            const agreementTitle = cleanFileName
                              ? cleanFileName
                              : hasTenant && hasUnit
                              ? `Lease Agreement — ${a.tenant} (Unit ${a.unit})`
                              : hasTenant
                              ? `Lease Agreement — ${a.tenant}`
                              : hasUnit
                              ? `Lease Draft — Unit ${a.unit}${propName ? ` (${propName})` : ''}`
                              : 'New Lease Draft';

                            const shortDraftId = a.id.startsWith('agr_draft_')
                              ? `DFT-${a.id.slice(-6)}`
                              : a.id.length > 16
                              ? `DFT-${a.id.slice(-6)}`
                              : a.id;

                            const hasDoc = Boolean(a.fileData || a.initialAgreementUrl || (a.fileName && a.fileName !== 'Lease_Agreement.pdf' && a.fileName.trim() !== ''));

                            return (
                              <tr key={a.id}>
                                <td>
                                  <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)' }}>
                                    {agreementTitle}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                    <span
                                      className="badge"
                                      title={a.id}
                                      style={{
                                        fontSize: '10.5px',
                                        padding: '2px 6px',
                                        background: 'var(--surface-sunken)',
                                        border: '1px solid var(--line)',
                                        color: 'var(--ink-soft)',
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {shortDraftId}
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                      {a.executionMode === 'already_executed_offline' ? 'Paper Lease' : 'Digital Offer'}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  {hasUnit ? (
                                    <>
                                      <b>Unit {a.unit}</b>
                                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{propName || 'Assigned Property'}</div>
                                    </>
                                  ) : (
                                    <>
                                      <span style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '12.5px' }}>
                                        Pending Unit (Step 2)
                                      </span>
                                      {propName && <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{propName}</div>}
                                    </>
                                  )}
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600 }}>
                                    {hasTenant ? (
                                      a.tenant
                                    ) : (
                                      <span style={{ color: 'var(--ink-soft)', fontStyle: 'italic', fontWeight: 500, fontSize: '12.5px' }}>
                                        Pending Resident (Step 1)
                                      </span>
                                    )}
                                  </div>
                                  {(a.tenantEmail || a.tenantPhone) && (
                                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                      {a.tenantEmail || a.tenantPhone}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <div>{a.start && a.end ? `${a.start} → ${a.end}` : (a.start || a.end || 'Timeline pending')}</div>
                                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                                    {a.rent ? `${formatMoney(a.rent, a.currency)}/mo` : 'Rent pending'}
                                    {a.deposit ? ` • ${formatMoney(a.deposit, a.currency)} dep` : ''}
                                  </div>
                                </td>
                                <td>
                                  <span
                                    className="badge"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      background: 'var(--surface-sunken)',
                                      color: 'var(--ink)',
                                      border: '1px solid var(--line)',
                                      fontSize: '11.5px',
                                      padding: '3px 8px',
                                    }}
                                  >
                                    <Bookmark size={12} color="var(--brass)" /> Step {a.draftStep || 1} of 3
                                  </span>
                                </td>
                                <td>
                                  {hasDoc ? (
                                    <span className="badge grey" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                                      <FileText size={12} color="var(--brass)" /> {a.fileName || 'Attached PDF'}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontStyle: 'italic' }}>Pending upload (Step 3)</span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                    <button
                                      type="button"
                                      className="btn brass small"
                                      onClick={() => {
                                        setActiveDraftId(a.id);
                                        setIsUploadOpen(true);
                                      }}
                                      title="Assign resident and issue lease offer"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      <UserCheck size={13} /> Assign &amp; Issue
                                    </button>
                                    <button
                                      type="button"
                                      className="btn secondary small"
                                      onClick={() => {
                                        setActiveDraftId(a.id);
                                        setIsUploadOpen(true);
                                      }}
                                      title="Edit draft terms"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      <Edit size={13} /> Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="btn secondary small"
                                      onClick={async () => {
                                        const label = hasUnit ? `Unit ${a.unit}` : agreementTitle;
                                        if (window.confirm(`Discard draft lease for ${label}?`)) {
                                          await deleteAgreement(a.id);
                                          showToast(`✓ Draft lease for ${label} deleted.`);
                                        }
                                      }}
                                      title="Delete draft lease"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#DC2626' }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile Card View (Strictly hidden on desktop via .mobile-card-view) */}
                  <div className="mobile-card-view">
                    {draftAgreements.map((a) => {
                      const hasTenant = Boolean(a.tenant && a.tenant !== 'Unassigned Resident' && a.tenant.trim());
                      const hasUnit = Boolean(a.unit && a.unit !== 'Unassigned Unit' && a.unit !== 'Unassigned' && a.unit.trim());
                      const propName = a.propertyName && a.propertyName !== 'Unassigned Property'
                        ? a.propertyName
                        : (state.properties.find((p) => p.id === a.propertyId)?.name || '');
                      const cleanFileName = a.fileName && a.fileName !== 'Lease_Agreement.pdf' ? a.fileName.replace(/\.[^/.]+$/, '') : '';

                      const agreementTitle = cleanFileName
                        ? cleanFileName
                        : hasTenant && hasUnit
                        ? `Lease Agreement — ${a.tenant} (Unit ${a.unit})`
                        : hasTenant
                        ? `Lease Agreement — ${a.tenant}`
                        : hasUnit
                        ? `Lease Draft — Unit ${a.unit}${propName ? ` (${propName})` : ''}`
                        : 'New Lease Draft';

                      const shortDraftId = a.id.startsWith('agr_draft_')
                        ? `DFT-${a.id.slice(-6)}`
                        : a.id.length > 16
                        ? `DFT-${a.id.slice(-6)}`
                        : a.id;

                      return (
                        <div key={a.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <div>
                              <b style={{ fontSize: '14px', color: 'var(--ink)' }}>{agreementTitle}</b>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: '10.5px',
                                    padding: '2px 6px',
                                    background: 'var(--surface-sunken)',
                                    border: '1px solid var(--line)',
                                    color: 'var(--ink-soft)',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {shortDraftId}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                  {hasUnit ? `Unit ${a.unit}${propName ? ` · ${propName}` : ''}` : 'Pending Unit'}
                                </span>
                              </div>
                            </div>
                            <span
                              className="badge"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'var(--surface-sunken)',
                                color: 'var(--ink)',
                                border: '1px solid var(--line)',
                                fontSize: '11.5px',
                              }}
                            >
                              <Bookmark size={12} color="var(--brass)" /> Step {a.draftStep || 1} of 3
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                            <div>
                              <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Resident</div>
                              <b style={{ color: hasTenant ? 'var(--ink)' : 'var(--ink-soft)' }}>
                                {hasTenant ? a.tenant : 'Pending Resident (Step 1)'}
                              </b>
                              {(a.tenantEmail || a.tenantPhone) && (
                                <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{a.tenantEmail || a.tenantPhone}</div>
                              )}
                            </div>
                            <div>
                              <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Rent &amp; Deposit</div>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ledger)' }}>
                                {a.rent ? `${formatMoney(a.rent, a.currency)}/mo` : 'Pending'}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                Dep: {a.deposit ? formatMoney(a.deposit, a.currency) : 'Pending'}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', width: '100%' }}>
                            <button
                              type="button"
                              className="btn brass small btn-mobile-full"
                              onClick={() => {
                                setActiveDraftId(a.id);
                                setIsUploadOpen(true);
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            >
                              <UserCheck size={13} /> Assign &amp; Issue
                            </button>
                            <button
                              type="button"
                              className="btn secondary small btn-mobile-full"
                              onClick={() => {
                                setActiveDraftId(a.id);
                                setIsUploadOpen(true);
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            >
                              <Edit size={13} /> Edit Draft
                            </button>
                            <button
                              type="button"
                              className="btn secondary small btn-mobile-full"
                              onClick={async () => {
                                const label = hasUnit ? `Unit ${a.unit}` : agreementTitle;
                                if (window.confirm(`Discard draft lease for ${label}?`)) {
                                  await deleteAgreement(a.id);
                                  showToast(`✓ Draft lease for ${label} deleted.`);
                                }
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#DC2626' }}
                            >
                              <Trash2 size={13} /> Delete Draft
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Unified Onboard Resident & Lease Modal */}
      <OnboardResidentModal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setActiveDraftId(null);
        }}
        draftAgreementId={activeDraftId}
        entryContext="leasing"
      />


      {/* View Agreement Modal */}
      {viewingAgreement && (
        <div className="modal-backdrop" onClick={() => setViewingAgreement(null)}>
          <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{viewingAgreement.id}</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setViewingAgreement(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
                  <b>{viewingAgreement.tenant}</b> • Unit <b>{viewingAgreement.unit}</b>
                </p>
                <span className={`badge ${viewingAgreement.status === 'signed' || viewingAgreement.tenantSignature ? 'green' : 'amber'}`}>
                  {viewingAgreement.status === 'signed' || viewingAgreement.tenantSignature
                    ? '✓ Signed'
                    : 'Awaiting Signature'}
                </span>
              </div>

              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Term</span>
                <span>{viewingAgreement.start} → {viewingAgreement.end}</span>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Monthly Rent</span>
                <span>{formatMoney(viewingAgreement.rent || 0, viewingAgreement.currency)}</span>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Security Deposit</span>
                <span>{formatMoney(viewingAgreement.deposit || 0, viewingAgreement.currency)}</span>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Auto-renew</span>
                <span>{viewingAgreement.autoRenew ? 'On' : 'Off'}</span>
              </div>

              {viewingAgreement.tenantSignature && (
                <div style={{ margin: '14px 0', padding: '12px', background: '#F2F8F4', border: '1px solid #B8DCBE', borderRadius: 'var(--radius)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--ledger)', fontSize: '13px' }}>
                      ✓ Digitally Signed & Legally Verified
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                      {viewingAgreement.tenantSignature.signedAt}
                    </span>
                  </div>
                  {viewingAgreement.tenantSignature.signatureDataUrl && (
                    <img
                      src={viewingAgreement.tenantSignature.signatureDataUrl}
                      alt="Tenant Digital Signature"
                      style={{ height: '44px', marginTop: '8px', borderBottom: '1px solid var(--ledger)' }}
                    />
                  )}
                </div>
              )}

              {viewingAgreement.contentHtml ? (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '16px',
                    background: '#FAFAF7',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)',
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}
                  dangerouslySetInnerHTML={{ __html: viewingAgreement.contentHtml }}
                />
              ) : viewingAgreement.fileData ? (
                <div className="note-box" style={{ marginTop: '16px' }}>
                  Uploaded file: <b>{viewingAgreement.fileName}</b>
                </div>
              ) : (
                <p style={{ color: 'var(--ink-soft)', fontSize: '12.5px', marginTop: '16px' }}>
                  Standard lease document on file.
                </p>
              )}

              {/* Dual-Document Repository in Details Modal */}
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>
                  Tenancy Agreement Documents & Records
                </div>

                {/* Record 1: Before Resident Sign (Landlord Dispatched Copy) */}
                {(viewingAgreement.initialAgreementUrl || viewingAgreement.fileData || viewingAgreement.ownerSignedDocumentUrl) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#FAF9F5', border: '1.5px solid var(--brass)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={16} color="var(--brass)" />
                      <div>
                        <b style={{ fontSize: '13px', color: 'var(--ledger)' }}>1. Landlord Dispatched Copy (Pre-Signed)</b>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                          {viewingAgreement.initialAgreementName || viewingAgreement.fileName || viewingAgreement.ownerSignedDocumentName || 'Landlord_Signed_Lease.pdf'} • Dispatched on record
                        </div>
                      </div>
                    </div>
                    <a
                      className="btn brass small"
                      href={viewingAgreement.initialAgreementUrl || viewingAgreement.fileData || viewingAgreement.ownerSignedDocumentUrl}
                      download={viewingAgreement.initialAgreementName || viewingAgreement.fileName || viewingAgreement.ownerSignedDocumentName || 'Landlord_Signed_Lease.pdf'}
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                    >
                      <Download size={12} /> Download
                    </a>
                  </div>
                )}

                {/* Record 2: After Resident Sign (Resident Signed Copy) */}
                {viewingAgreement.signedDocumentUrl ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#F2F8F4', border: '1px solid #B8DCBE', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileCheck size={16} color="var(--ledger)" />
                      <div>
                        <b style={{ fontSize: '13px', color: 'var(--ledger)' }}>2. Resident Signed Copy (Uploaded)</b>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                          {viewingAgreement.signedDocumentName || 'Resident_Signed_Agreement.pdf'} • Uploaded on {viewingAgreement.signedUploadedAt ? new Date(viewingAgreement.signedUploadedAt).toLocaleDateString() : 'file'}
                        </div>
                      </div>
                    </div>
                    <a
                      className="btn secondary small"
                      href={viewingAgreement.signedDocumentUrl}
                      download={viewingAgreement.signedDocumentName || 'Resident_Signed_Agreement.pdf'}
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                    >
                      <Download size={12} /> Download
                    </a>
                  </div>
                ) : (
                  <div style={{ padding: '10px 12px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '6px', fontSize: '12px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} /> 2. Resident Signed Copy: Awaiting resident physical ink signature and upload.
                  </div>
                )}

                {/* Record 3: Resident Identification Documents */}
                {viewingAgreement.tenantUploadedIds && viewingAgreement.tenantUploadedIds.length > 0 ? (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ledger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={15} color="var(--brass)" /> 3. Resident Identity Verification Documents ({viewingAgreement.tenantUploadedIds.length})
                    </div>
                    {viewingAgreement.tenantUploadedIds.map((idDoc, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="badge brass" style={{ fontSize: '10.5px', padding: '1px 6px' }}>
                            {idDoc.name}
                          </span>
                          <div>
                            <b style={{ fontSize: '12.5px', color: 'var(--ink)' }}>{idDoc.fileName}</b>
                            <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)' }}>
                              Uploaded {idDoc.uploadedAt ? new Date(idDoc.uploadedAt).toLocaleDateString() : 'on record'}
                            </div>
                          </div>
                        </div>
                        <a
                          className="btn secondary small"
                          href={idDoc.fileUrl}
                          download={idDoc.fileName || `${idDoc.name}.pdf`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px' }}
                        >
                          <Download size={11} /> Download ID
                        </a>
                      </div>
                    ))}
                  </div>
                ) : viewingAgreement.requireTenantId ? (
                  <div style={{ marginTop: '10px', padding: '10px 12px', background: '#FFFDF5', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '12px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={13} color="#D97706" />
                    <span>3. Identity Documents: Awaiting resident upload ({viewingAgreement.requiredIdList?.map(i => i.name).join(', ') || viewingAgreement.requiredIdType || 'ID Document'}).</span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="modal-foot" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setViewingAgreement(null)}
              >
                Close
              </button>
              {viewingAgreement.fileData && (
                <a
                  className="btn brass btn-mobile-full"
                  href={viewingAgreement.fileData}
                  download={viewingAgreement.fileName || 'agreement.pdf'}
                  style={{ textDecoration: 'none', textAlign: 'center' }}
                >
                  Download file
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inspect Tenant Uploaded Signed Agreement Modal */}
      {inspectingSignedAgreement && (
        <div className="modal-backdrop" onClick={() => setInspectingSignedAgreement(null)}>
          <div className="modal-card" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Tenant Signed Agreement — Unit {inspectingSignedAgreement.unit}</h3>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                  Document {inspectingSignedAgreement.id} • Resident: {inspectingSignedAgreement.tenant}
                </div>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setInspectingSignedAgreement(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                <div style={{ padding: '10px', background: '#F8F9FA', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Monthly Rent</div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{formatMoney(inspectingSignedAgreement.rent || 0, inspectingSignedAgreement.currency)}</div>
                </div>
                <div style={{ padding: '10px', background: '#F8F9FA', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Security Deposit</div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{formatMoney(inspectingSignedAgreement.deposit || 0, inspectingSignedAgreement.currency)}</div>
                  <span className={`badge ${isInspectingDepositPaid ? 'green' : 'amber'}`} style={{ fontSize: '10px', padding: '1px 5px', marginTop: '3px' }}>
                    {isInspectingDepositPaid ? '✓ Paid' : 'Unpaid'}
                  </span>
                </div>
                <div style={{ padding: '10px', background: '#F8F9FA', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Rent Due Day</div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Day {inspectingSignedAgreement.rentDueDay || 1}</div>
                </div>
                <div style={{ padding: '10px', background: '#F8F9FA', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Uploaded At</div>
                  <div style={{ fontSize: '12px', fontWeight: 500, marginTop: '2px' }}>
                    {inspectingSignedAgreement.signedUploadedAt
                      ? new Date(inspectingSignedAgreement.signedUploadedAt).toLocaleDateString()
                      : 'Recently'}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#FAF8F4', border: '1px solid var(--brass)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={18} color="var(--brass)" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>
                      {inspectingSignedAgreement.signedDocumentName || inspectingSignedAgreement.fileName || 'Signed_Tenancy_Agreement.pdf'}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                      Physical ink signature executed & uploaded by resident
                    </div>
                  </div>
                </div>
                {inspectingSignedAgreement.signedDocumentUrl && (
                  <a
                    className="btn secondary small"
                    href={inspectingSignedAgreement.signedDocumentUrl}
                    download={inspectingSignedAgreement.signedDocumentName || 'signed_agreement.pdf'}
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Download size={12} /> Download
                  </a>
                )}
              </div>

              {/* Document Preview Box */}
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden', background: '#f5f5f5', textAlign: 'center', padding: '6px' }}>
                {inspectingSignedAgreement.signedDocumentUrl?.startsWith('data:image') ? (
                  <img
                    src={inspectingSignedAgreement.signedDocumentUrl}
                    alt="Resident Signed Document"
                    style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                  />
                ) : inspectingSignedAgreement.signedDocumentUrl ? (
                  <iframe
                    src={inspectingSignedAgreement.signedDocumentUrl}
                    style={{ width: '100%', height: '400px', border: 'none' }}
                    title="Signed Document File Preview"
                  />
                ) : (
                  <div style={{ padding: '40px 16px', color: 'var(--ink-soft)' }}>
                    Preview is not available in browser. Please download the document file using the button above.
                  </div>
                )}
              </div>

              {/* Resident Identity Documents Section */}
              {inspectingSignedAgreement.tenantUploadedIds && inspectingSignedAgreement.tenantUploadedIds.length > 0 ? (
                <div style={{ marginTop: '16px', padding: '14px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ledger)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <ShieldCheck size={16} color="var(--brass)" /> Resident Identity Verification Documents ({inspectingSignedAgreement.tenantUploadedIds.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {inspectingSignedAgreement.tenantUploadedIds.map((idDoc, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="badge brass" style={{ fontSize: '11px', fontWeight: 600 }}>
                            {idDoc.name}
                          </span>
                          <div>
                            <b style={{ fontSize: '13px', color: 'var(--ink)' }}>{idDoc.fileName}</b>
                            <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                              Uploaded {idDoc.uploadedAt ? new Date(idDoc.uploadedAt).toLocaleDateString() : 'on record'}
                            </div>
                          </div>
                        </div>
                        <a
                          className="btn secondary small"
                          href={idDoc.fileUrl}
                          download={idDoc.fileName || `${idDoc.name}.pdf`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                        >
                          <Download size={12} /> Download ID
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : inspectingSignedAgreement.requireTenantId ? (
                <div style={{ marginTop: '14px', padding: '10px 14px', background: '#FFFDF5', border: '1px solid #FCD34D', borderRadius: 'var(--radius)', fontSize: '12.5px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} color="#D97706" />
                  <span><b>Identity Verification Pending:</b> Landlord requested ID document(s) ({inspectingSignedAgreement.requiredIdList?.map(i => i.name).join(', ') || inspectingSignedAgreement.requiredIdType || 'IDs'}), but resident has not uploaded them yet.</span>
                </div>
              ) : null}

              {inspectingSignedAgreement.status === 'active' ? (
                <div style={{ marginTop: '16px', padding: '12px', background: '#F2F8F4', border: '1px solid #B8DCBE', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle2 size={18} color="var(--ledger)" />
                  <div style={{ fontSize: '13px' }}>
                    <b>Lease is Active & Fully Executed.</b> Unit {inspectingSignedAgreement.unit} is marked Occupied.
                  </div>
                </div>
              ) : inspectingSignedAgreement.status === 'pending_approval' ? (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ padding: '12px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Clock size={18} color="#D97706" />
                    <div style={{ fontSize: '13px', color: '#78350F' }}>
                      <b>Physical ink signature submitted by resident.</b> Review the uploaded document above. You can approve the agreement to generate and dispatch the move-in security deposit invoice, or reject it so the resident can re-upload corrected documents.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '16px', padding: '12px', background: '#F0F4F8', border: '1px solid #BFD2E5', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <UserCheck size={18} color="#2A6496" />
                  <div style={{ fontSize: '13px' }}>
                    Review the uploaded document above. When ready, approve the agreement below to initiate the deposit step.
                  </div>
                </div>
              )}
            </div>
            <div className="modal-foot" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => {
                  setInspectingSignedAgreement(null);
                }}
              >
                Close
              </button>
              {inspectingSignedAgreement.signedDocumentUrl && (
                <a
                  className="btn secondary btn-mobile-full"
                  href={inspectingSignedAgreement.signedDocumentUrl}
                  download={inspectingSignedAgreement.signedDocumentName || 'signed_agreement.pdf'}
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Download size={14} /> Download Document
                </a>
              )}
              {inspectingSignedAgreement.status === 'pending_approval' ? (
                <>
                  <button
                    type="button"
                    className="btn danger outline btn-mobile-full"
                    disabled={isApprovingAgreement || isRejectingAgreement}
                    onClick={() => {
                      setRejectionReasonInput('');
                      setIsRejectingModalOpen(true);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <XCircle size={15} /> Reject Agreement
                  </button>
                  <button
                    type="button"
                    className={`btn brass btn-mobile-full ${isApprovingAgreement ? 'btn-processing' : ''}`}
                    disabled={isApprovingAgreement || isRejectingAgreement}
                    onClick={async () => {
                      setIsApprovingAgreement(true);
                      await new Promise((r) => setTimeout(r, 400));
                      await approveSignedAgreement(
                        inspectingSignedAgreement.id,
                        user?.displayName || 'Property Owner'
                      );
                      setIsApprovingAgreement(false);
                      setInspectingSignedAgreement(null);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <ButtonProcessing
                      loading={isApprovingAgreement}
                      loadingText="Approving Lease..."
                      defaultText="Approve Signed Lease & Request Deposit"
                      icon={<CheckCircle2 size={15} />}
                    />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal for Tenant Uploaded Agreement */}
      {isRejectingModalOpen && inspectingSignedAgreement && (
        <div className="modal-backdrop" onClick={() => setIsRejectingModalOpen(false)} style={{ zIndex: 1200 }}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3 style={{ margin: 0, color: 'var(--rose, #DC2626)' }}>Reject Signed Agreement</h3>
                <div className="hint" style={{ fontSize: '12px' }}>Unit {inspectingSignedAgreement.unit} • Resident: {inspectingSignedAgreement.tenant}</div>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setIsRejectingModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', margin: 0 }}>
                Specify why the uploaded agreement is being rejected. The resident will be notified with this reason and prompted to re-upload corrected documents.
              </p>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  Rejection Reason *
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g., Signature missing on page 2, unclear scan, or incomplete pages."
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius)', border: '1px solid var(--line-strong)', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn secondary" onClick={() => setIsRejectingModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={!rejectionReasonInput.trim() || isRejectingAgreement}
                onClick={async () => {
                  setIsRejectingAgreement(true);
                  await rejectSignedAgreement(inspectingSignedAgreement.id, rejectionReasonInput.trim());
                  setIsRejectingAgreement(false);
                  setIsRejectingModalOpen(false);
                  setRejectionReasonInput('');
                  setInspectingSignedAgreement(null);
                }}
              >
                {isRejectingAgreement ? 'Rejecting...' : 'Confirm Rejection & Request Re-upload'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Renewal Terms Modal with Percentage Increment Option */}
      {renewalModalItem && (
        <div className="modal-backdrop" onClick={() => setRenewalModalItem(null)}>
          <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3 style={{ margin: 0 }}>Offer Lease Renewal: Unit {renewalModalItem.unit}</h3>
                <div className="hint" style={{ fontSize: '12px' }}>Configure renewal terms and rent increment for resident review</div>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setRenewalModalItem(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Resident & Tenancy Summary */}
              <div style={{ background: 'var(--surface-sunken, #F8FAFC)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--ink-soft)', fontSize: '13px' }}>Resident:</span>
                  <b style={{ color: 'var(--ink)', fontSize: '13px' }}>{renewalModalItem.tenant}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--ink-soft)', fontSize: '13px' }}>Current Lease Expiry:</span>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{renewalModalItem.leaseEnd} ({renewalModalItem.daysLeft} days left)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-soft)', fontSize: '13px' }}>Current Contracted Rent:</span>
                  <b style={{ color: 'var(--ink)', fontSize: '14px' }}>{formatMoney(renewalCurrentRent, inspectingSignedRenewal?.currency)}/mo</b>
                </div>
              </div>

              {renewalModalItem.tenantNotes && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', color: '#1E40AF' }}>
                  <b>Note from Resident:</b> "{renewalModalItem.tenantNotes}"
                </div>
              )}

              {/* Percentage Increment Option */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  Rent Increment Option:
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {[0, 5, 8, 10, 12, 15].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className={`btn small ${renewalPercent === pct ? 'brass' : 'secondary'}`}
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => {
                        setRenewalPercent(pct);
                        setRenewalNewRent(Math.round(renewalCurrentRent * (1 + pct / 100)));
                      }}
                    >
                      {pct === 0 ? 'No Increase (0%)' : `+${pct}%`}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Percentage (%)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        step="0.5"
                        value={renewalPercent === 0 ? '' : renewalPercent}
                        placeholder="0"
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                          const p = cleaned === '' ? 0 : Number(cleaned);
                          setRenewalPercent(p);
                          setRenewalNewRent(Math.round(renewalCurrentRent * (1 + p / 100)));
                        }}
                        style={{ paddingRight: '28px' }}
                      />
                      <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)', fontSize: '13px' }}>%</span>
                    </div>
                  </div>

                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>New Monthly Rent ({getCurrencySymbol(inspectingSignedRenewal?.currency || defaultOwnerCurrency)})</label>
                    <input
                      type="number"
                      step="100"
                      value={renewalNewRent === 0 ? '' : renewalNewRent}
                      placeholder="0"
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                        const val = cleaned === '' ? 0 : Number(cleaned);
                        setRenewalNewRent(val);
                        if (renewalCurrentRent > 0) {
                          setRenewalPercent(Number((((val - renewalCurrentRent) / renewalCurrentRent) * 100).toFixed(1)));
                        }
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: renewalNewRent >= renewalCurrentRent ? '#ECFDF5' : '#FEF2F2',
                      color: renewalNewRent >= renewalCurrentRent ? '#065F46' : '#991B1B',
                      fontWeight: 600,
                    }}
                  >
                    {renewalNewRent >= renewalCurrentRent
                      ? `+${formatMoney(renewalNewRent - renewalCurrentRent, inspectingSignedRenewal?.currency)}/mo increase`
                      : `-${formatMoney(renewalCurrentRent - renewalNewRent, inspectingSignedRenewal?.currency)}/mo decrease`}
                  </span>
                  <span style={{ color: 'var(--ink-soft)' }}>Effective upon renewal start date</span>
                </div>
              </div>

              {/* Lease Term & Dynamic Period Dates Controlled by Owner */}
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '13px', fontWeight: 600 }}>New Extension Term Duration</label>
                <select
                  value={renewalDurationMonths}
                  onChange={(e) => handleRenewalDurationChange(Number(e.target.value))}
                >
                  <option value={6}>6 Months Extension</option>
                  <option value={11}>11 Months Extension</option>
                  <option value={12}>12 Months (1 Full Year)</option>
                  <option value={24}>24 Months (2 Full Years)</option>
                </select>
              </div>

              {/* Editable Start & End Dates with Owner Control */}
              <div style={{ background: 'var(--surface-sunken)', border: '1px solid #CBD5E1', padding: '12px 14px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    Upcoming Renewal Period Dates (Owner Controlled)
                  </label>
                  <span className="badge blue" style={{ fontSize: '11px' }}>
                    Next Period
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Renewal Term Start Date</label>
                    <input
                      type="date"
                      value={renewalStartDate}
                      onChange={(e) => handleRenewalStartDateChange(e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Renewal Term End Date</label>
                    <input
                      type="date"
                      value={renewalEndDate}
                      onChange={(e) => setRenewalEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                  ℹ️ Starts on <b>{renewalStartDate || 'Start Date'}</b> (day after current lease concludes on <b>{renewalModalItem.leaseEnd}</b>) and extends through <b>{renewalEndDate || 'End Date'}</b>. Both dates can be customized above.
                </div>
              </div>

              {/* Renewal Agreement Document Attachment */}
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '13px', fontWeight: 600 }}>
                  Attach Renewal Agreement Document (PDF / Scan)
                </label>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '8px' }}>
                  Upload the renewed contract for the resident to inspect, download, and sign.
                </div>

                {renewalAgreementFileUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={18} color="#16A34A" />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                          {renewalAgreementFileName || 'Renewal_Agreement.pdf'}
                        </div>
                        {renewalAgreementFileSize && (
                          <div style={{ fontSize: '11px', color: '#15803D' }}>{renewalAgreementFileSize} KB</div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn secondary small"
                      style={{ padding: '2px 8px', fontSize: '11px', color: '#DC2626' }}
                      onClick={() => {
                        setRenewalAgreementFileUrl(null);
                        setRenewalAgreementFileName('');
                        setRenewalAgreementFileSize(null);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '16px',
                      border: '2px dashed var(--line)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: 'var(--surface-sunken)',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <Upload size={22} color="var(--brass)" style={{ marginBottom: '6px' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                      Click to upload renewal agreement
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                      PDF, PNG, JPG up to 10MB
                    </span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setRenewalAgreementFileName(file.name);
                          setRenewalAgreementFileSize(Math.round(file.size / 1024));
                          const reader = new FileReader();
                          reader.onload = () => {
                            setRenewalAgreementFileUrl(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Landlord Message */}
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px' }}>Notes / Instructions to Resident (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Standard annual lease extension subject to timely rent payments."
                  value={renewalOwnerNotes}
                  onChange={(e) => setRenewalOwnerNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn secondary btn-mobile-full" disabled={isSendingRenewalOffer} onClick={() => setRenewalModalItem(null)}>Cancel</button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isSendingRenewalOffer ? 'btn-processing' : ''}`}
                disabled={isSendingRenewalOffer}
                onClick={async () => {
                  setIsSendingRenewalOffer(true);
                  await new Promise((r) => setTimeout(r, 450));
                  const effectiveStart = renewalStartDate || (() => {
                    const currentEndObj = new Date(renewalModalItem.leaseEnd);
                    const startObj = isNaN(currentEndObj.getTime())
                      ? new Date()
                      : new Date(currentEndObj.getTime() + 86400000);
                    return startObj.toISOString().split('T')[0];
                  })();

                  const effectiveEnd = renewalEndDate || (() => {
                    const s = new Date(effectiveStart);
                    s.setMonth(s.getMonth() + renewalDurationMonths);
                    return s.toISOString().split('T')[0];
                  })();

                  await offerLeaseRenewal(renewalModalItem.unit, {
                    currentRent: renewalCurrentRent,
                    percentageIncrease: renewalPercent,
                    proposedRent: renewalNewRent,
                    termMonths: renewalDurationMonths,
                    newLeaseStart: effectiveStart,
                    newLeaseEnd: effectiveEnd,
                    ownerNotes: renewalOwnerNotes,
                    ownerAgreementFileUrl: renewalAgreementFileUrl,
                    ownerAgreementFileName: renewalAgreementFileName,
                    ownerAgreementFileSize: renewalAgreementFileSize,
                  });

                  setIsSendingRenewalOffer(false);
                  setRenewalModalItem(null);
                }}
              >
                <ButtonProcessing
                  loading={isSendingRenewalOffer}
                  loadingText="Sending Offer..."
                  defaultText="Send Renewal Offer"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review & Approve Tenant Signed Renewal Modal */}
      {inspectingSignedRenewal && (
        <div className="modal-backdrop" onClick={() => setInspectingSignedRenewal(null)}>
          <div className="modal-card" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3 style={{ margin: 0, fontSize: '17px' }}>Review Signed Renewal — Unit {inspectingSignedRenewal.unit}</h3>
                <div className="hint" style={{ fontSize: '12px' }}>
                  Verify resident signature and attached document to finalize renewed lease
                </div>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setInspectingSignedRenewal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Summary Banner */}
              <div style={{ background: 'var(--surface-sunken)', padding: '14px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Resident:</span>
                    <div style={{ fontWeight: 600 }}>{inspectingSignedRenewal.tenant}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Renewed Monthly Rent:</span>
                    <div style={{ fontWeight: 700, color: 'var(--brass)' }}>
                      {formatMoney(inspectingSignedRenewal.proposedRent || 0, inspectingSignedRenewal.currency)}/mo
                      {inspectingSignedRenewal.percentageIncrease ? ` (+${inspectingSignedRenewal.percentageIncrease}%)` : ''}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>Current Expiry:</span>
                    <div style={{ fontWeight: 600 }}>{inspectingSignedRenewal.leaseEnd}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-soft)' }}>New Term:</span>
                    <div style={{ fontWeight: 600 }}>
                      {inspectingSignedRenewal.newLeaseStart} → {inspectingSignedRenewal.newLeaseEnd} ({inspectingSignedRenewal.termMonths || 12} mo)
                    </div>
                  </div>
                </div>
              </div>

              {/* Resident Signed Document Card */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  Resident's Signed Document Submission:
                </label>
                {inspectingSignedRenewal.tenantSignedFileUrl ? (
                  <div style={{ padding: '14px', background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckCircle2 size={20} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#166534', fontSize: '13.5px' }}>
                            {inspectingSignedRenewal.tenantSignedFileName || 'Tenant_Signed_Renewal.pdf'}
                          </div>
                          <div style={{ fontSize: '11px', color: '#15803D' }}>
                            Submitted {inspectingSignedRenewal.tenantSignedAt ? new Date(inspectingSignedRenewal.tenantSignedAt).toLocaleString() : 'Recently'}
                            {inspectingSignedRenewal.tenantSignedFileSize ? ` • ${inspectingSignedRenewal.tenantSignedFileSize} KB` : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <a
                          href={inspectingSignedRenewal.tenantSignedFileUrl}
                          download={inspectingSignedRenewal.tenantSignedFileName || `Signed_Renewal_${inspectingSignedRenewal.unit}.pdf`}
                          className="btn secondary small"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={13} /> Download
                        </a>
                      </div>
                    </div>

                    {/* Preview thumbnail if image */}
                    {inspectingSignedRenewal.tenantSignedFileUrl.startsWith('data:image/') && (
                      <div style={{ marginTop: '12px', textAlign: 'center', borderTop: '1px dashed #86EFAC', paddingTop: '10px' }}>
                        <img
                          src={inspectingSignedRenewal.tenantSignedFileUrl}
                          alt="Tenant Signed Document"
                          style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '4px', border: '1px solid #CBD5E1', objectFit: 'contain' }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', fontSize: '12px', color: '#991B1B' }}>
                    No signed file attached by resident.
                  </div>
                )}
              </div>

              {/* Original Dispatched Agreement Reference */}
              {inspectingSignedRenewal.ownerAgreementFileUrl && (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'block', marginBottom: '4px' }}>
                    Original Renewal Draft Dispatched by Landlord:
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12.5px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} color="var(--brass)" />
                      {inspectingSignedRenewal.ownerAgreementFileName || 'Renewal_Offer_Draft.pdf'}
                    </span>
                    <a
                      href={inspectingSignedRenewal.ownerAgreementFileUrl}
                      download={inspectingSignedRenewal.ownerAgreementFileName || `Renewal_Offer_${inspectingSignedRenewal.unit}.pdf`}
                      className="btn secondary small"
                      style={{ padding: '2px 8px', fontSize: '11px', textDecoration: 'none' }}
                    >
                      <Download size={11} /> Download Draft
                    </a>
                  </div>
                </div>
              )}

              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', color: '#1E40AF' }}>
                ℹ️ <b>Activation Notice:</b> Approving this renewal will archive the previous agreement term, update the active contracted rent to <b>{formatMoney(inspectingSignedRenewal.proposedRent || 0, inspectingSignedRenewal.currency)}/mo</b>, extend the tenancy end date to <b>{inspectingSignedRenewal.newLeaseEnd}</b>, and immediately dispatch a confirmation notification to the resident.
              </div>
            </div>

            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn secondary btn-mobile-full" disabled={isApprovingRenewal} onClick={() => setInspectingSignedRenewal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isApprovingRenewal ? 'btn-processing' : ''}`}
                disabled={isApprovingRenewal}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={async () => {
                  setIsApprovingRenewal(true);
                  await new Promise((r) => setTimeout(r, 450));
                  await approveLeaseRenewal(inspectingSignedRenewal.unit);
                  setIsApprovingRenewal(false);
                  setInspectingSignedRenewal(null);
                }}
              >
                <ButtonProcessing
                  loading={isApprovingRenewal}
                  loadingText="Finalizing..."
                  defaultText="Approve & Finalize Renewal"
                  icon={<CheckCircle2 size={16} />}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Limit Paywall Modal */}
      {limitModalResource && (
        <PlanLimitModal
          resourceType={limitModalResource}
          currentUsage={usage[limitModalResource].used}
          limit={usage[limitModalResource].max}
          planName={currentPlanName}
          onClose={closeLimitModal}
          onUpgrade={() => navigate('/owner/subscription')}
        />
      )}

      {/* Upload Agreement Template Modal */}
      {isUploadTemplateOpen && (
        <div className="modal-backdrop" onClick={() => setIsUploadTemplateOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Upload Agreement to Library</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setIsUploadTemplateOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveTemplate}>
              <div className="modal-body">
                <p className="hint" style={{ marginBottom: '14px' }}>
                  Upload a standard master lease, rules document, or addendum. Once uploaded, you can easily select it whenever onboarding any resident without re-uploading.
                </p>

                <div className="field">
                  <label>Agreement Title / Label *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Standard 11-Month Residential Lease"
                    value={newTemplateTitle}
                    onChange={(e) => setNewTemplateTitle(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Applicable Property</label>
                  <select
                    value={newTemplatePropertyId}
                    onChange={(e) => setNewTemplatePropertyId(e.target.value)}
                  >
                    <option value="all">All Properties (Portfolio-wide Master)</option>
                    {myProperties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Notes / Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Standard residential clause with 2-month security deposit"
                    value={newTemplateDescription}
                    onChange={(e) => setNewTemplateDescription(e.target.value)}
                  />
                </div>

                <div
                  style={{
                    background: 'var(--surface-sunken)',
                    border: '1.5px dashed var(--brass)',
                    borderRadius: '8px',
                    padding: '16px',
                    textAlign: 'center',
                    marginTop: '12px',
                  }}
                >
                  <Upload size={22} color="var(--brass)" style={{ margin: '0 auto 6px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    Attach PDF or Document *
                  </div>
                  <p style={{ fontSize: '11.5px', color: 'var(--ink-soft)', margin: '2px 0 10px' }}>
                    Supports PDF, PNG, JPG (up to 15MB)
                  </p>
                  <input
                    type="file"
                    required
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setNewTemplateFileName(f.name);
                        setNewTemplateFileSize(Math.round(f.size / 1024));
                        const r = new FileReader();
                        r.onload = () => setNewTemplateFileData(r.result as string);
                        r.readAsDataURL(f);
                      }
                    }}
                    style={{ fontSize: '12px' }}
                  />
                  {newTemplateFileData && (
                    <div style={{ marginTop: '10px', padding: '6px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10B981', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#047857', fontWeight: 600 }}>
                        ✓ {newTemplateFileName} {newTemplateFileSize ? `(${newTemplateFileSize} KB)` : ''}
                      </span>
                      <button
                        type="button"
                        className="btn secondary small"
                        style={{ padding: '2px 6px', fontSize: '11px' }}
                        onClick={() => {
                          setNewTemplateFileData(null);
                          setNewTemplateFileName('');
                          setNewTemplateFileSize(null);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-foot">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setIsUploadTemplateOpen(false)}
                  disabled={isUploadingTemplate}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn brass"
                  disabled={isUploadingTemplate || !newTemplateFileData}
                >
                  {isUploadingTemplate ? 'Saving...' : 'Save to Library'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Document Modal */}
      {previewingTemplate && (
        <div className="modal-backdrop" onClick={() => setPreviewingTemplate(null)}>
          <div className="modal-card" style={{ maxWidth: '850px', width: '92vw', height: '88vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="var(--brass)" />
                <h3 style={{ margin: 0 }}>{previewingTemplate.title}</h3>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setPreviewingTemplate(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
              {previewingTemplate.fileData ? (
                <iframe
                  src={previewingTemplate.fileData}
                  title={previewingTemplate.title}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                  Preview not available for this file type. Please download to view.
                </div>
              )}
            </div>
            <div className="modal-foot">
              <a
                href={previewingTemplate.fileData}
                download={previewingTemplate.fileName || 'agreement.pdf'}
                className="btn brass"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} /> Download Document
              </a>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setPreviewingTemplate(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTemplate && (
        <div className="modal-backdrop" onClick={() => setDeletingTemplate(null)}>
          <div className="modal-card" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Trash2 size={18} /> Delete Agreement Document
              </h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setDeletingTemplate(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
                Are you sure you want to delete <b>{deletingTemplate.title}</b> from your Agreement Library?
              </p>
              <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '8px', lineHeight: 1.4 }}>
                {(user?.role === 'superadmin' || (user?.role as string) === 'admin') ? 'As a Platform Admin, this will permanently remove the agreement template from the owner’s repository.' : 'This will remove it from future resident onboarding options. Existing signed tenant leases will remain intact.'}
              </p>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setDeletingTemplate(null)}
                disabled={isDeletingTemplate}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={handleConfirmDeleteTemplate}
                disabled={isDeletingTemplate}
              >
                {isDeletingTemplate ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
