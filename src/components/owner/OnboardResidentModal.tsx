import React, { useState, useEffect, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { PlanLimitModal } from '../common/PlanLimitModal';
import { ButtonProcessing } from '../common/Spinner';
import { TenantSearchCombobox, SelectedTenantInfo } from '../leasing/TenantSearchCombobox';
import {
  getNextMonthFirstDateString,
  getOneYearLaterDateString,
} from '../../lib/dates';
import { DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol } from '../../lib/currencyService';
import { uploadDocumentFile } from '../../lib/imageUploader';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { TenancyRequest, Agreement, TenantRecord, UserProfile, RequiredIdItem, Invoice } from '../../types';
import {
  UserPlus,
  UserCheck,
  Upload,
  ArrowRight,
  ArrowLeft,
  X,
  Plus,
  Trash2,
  FileCheck,
  CheckCircle2,
  Bookmark,
} from 'lucide-react';

export interface OnboardResidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryContext?: 'tenants' | 'leasing';
  preselectedUnitId?: string;
  draftAgreementId?: string | null;
  initialStep?: 1 | 2 | 3;
  onSuccess?: (tenantName: string, unitLabel: string) => void;
}

export const OnboardResidentModal: React.FC<OnboardResidentModalProps> = ({
  isOpen,
  onClose,
  entryContext = 'tenants',
  preselectedUnitId,
  draftAgreementId,
  initialStep,
  onSuccess,
}) => {
  const {
    state,
    updateState,
    showToast,
    saveAgreement,
    deleteAgreement,
    saveUnit,
    saveInvoice,
    saveTenant,
    saveTenancyRequest,
  } = useAppData();
  const { user, provisionUser } = useAuth();
  const ownerId = user?.id || '';

  const {
    usage,
    currentPlanName,
    limitModalResource,
    openLimitModal,
    closeLimitModal,
  } = usePlanLimits();

  const maxTenants = usage.tenants.max;
  const isTenantLimitReached = usage.tenants.isFull;

  // Wizard Step: 1 = Resident, 2 = Property/Unit & Terms, 3 = Lease & Execution Mode
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Step 1: Resident State ---
  const [selectedTenant, setSelectedTenant] = useState<SelectedTenantInfo | null>(null);

  // --- Step 2: Property & Unit State ---
  const myProperties = useMemo(() => {
    return state.properties.filter((p) => Boolean(ownerId) && p.ownerId === ownerId);
  }, [state.properties, ownerId]);

  const defaultOwnerCurrency = getCurrencySymbol(
    myProperties.find((p) => p.currency)?.currency || myProperties[0]?.currency || DEFAULT_CURRENCY_SYMBOL
  );

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [rent, setRent] = useState<number>(0);
  const [deposit, setDeposit] = useState<number>(0);
  const [dueDay, setDueDay] = useState<number>(1);
  const [leaseStart, setLeaseStart] = useState<string>(getNextMonthFirstDateString());
  const [leaseEnd, setLeaseEnd] = useState<string>(getOneYearLaterDateString(getNextMonthFirstDateString()));

  // Filter available units for chosen property
  const vacantUnits = useMemo(() => {
    return state.units.filter((u) => {
      const matchOwner = myProperties.some((p) => p.id === u.propertyId);
      if (!matchOwner) return false;
      if (selectedPropertyId && selectedPropertyId !== 'all' && u.propertyId !== selectedPropertyId) {
        return false;
      }
      if (u.id === preselectedUnitId) return true;
      const hasActiveAgreement = (state.agreements || []).some(
        (a) => a.status === 'active' && (a.unitId === u.id || (a.unit === u.unitNumber && (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId)))
      );
      const hasPendingReq = (state.tenancyRequests || []).some(
        (r) => r.status === 'pending' && (r.unitId === u.id || (r.unitNumber === u.unitNumber && (!r.propertyId || !u.propertyId || r.propertyId === u.propertyId)))
      );
      const isOccupiedOrReserved =
        u.status === 'occupied' ||
        u.status === 'reserved' ||
        Boolean(u.currentTenantId) ||
        Boolean(u.tenant && u.tenant !== 'Unassigned' && u.tenant !== 'Vacant') ||
        hasActiveAgreement ||
        hasPendingReq;
      return !isOccupiedOrReserved;
    });
  }, [state.units, state.agreements, state.tenancyRequests, myProperties, selectedPropertyId, preselectedUnitId]);

  // --- Step 3: Agreement & Execution Mode State ---
  const [executionMode, setExecutionMode] = useState<'digital_dispatch' | 'already_executed_offline'>('digital_dispatch');
  const [offlineDepositCollected, setOfflineDepositCollected] = useState<boolean>(true);
  const [offlineDepositRef, setOfflineDepositRef] = useState<string>('Cash / Bank Wire Settled');

  const [agreementSource, setAgreementSource] = useState<'upload' | 'library'>('upload');
  const [agreementFileName, setAgreementFileName] = useState<string>('');
  const [agreementFileData, setAgreementFileData] = useState<string | null>(null);
  const [agreementFileSize, setAgreementFileSize] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const [requireIds, setRequireIds] = useState(false);
  const [idList, setIdList] = useState<RequiredIdItem[]>([
    { id: 'req_id_1', name: 'Government Photo ID' },
  ]);

  // Templates belonging to this owner
  const availableTemplates = useMemo(() => {
    return (state.agreementTemplates || []).filter(
      (t) => t.ownerId === ownerId || user?.role === 'superadmin' || (user?.role as string) === 'admin'
    );
  }, [state.agreementTemplates, ownerId, user?.role]);

  // Initialize or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);

      // Check if re-hydrating an existing draft
      if (draftAgreementId) {
        const draft = state.agreements.find((a) => a.id === draftAgreementId);
        if (draft) {
          if (draft.tenant && draft.tenant !== 'Unassigned Resident') {
            setSelectedTenant({
              id: draft.tenantId || '',
              name: draft.tenant,
              email: draft.tenantEmail || '',
              phone: draft.tenantPhone || '',
              isNew: !draft.tenantId,
            });
          } else {
            setSelectedTenant(null);
          }
          if (draft.propertyId) setSelectedPropertyId(draft.propertyId);
          if (draft.unitId) {
            setSelectedUnitId(draft.unitId);
          } else if (draft.unit) {
            const matchU = state.units.find(
              (u) =>
                (!draft.propertyId || u.propertyId === draft.propertyId) &&
                (u.unitNumber === draft.unit || u.id === draft.unit)
            );
            if (matchU) setSelectedUnitId(matchU.id);
          }
          if (typeof draft.rent === 'number') setRent(draft.rent);
          if (typeof draft.deposit === 'number') setDeposit(draft.deposit);
          if (draft.rentDueDay) setDueDay(draft.rentDueDay);
          if (draft.start) setLeaseStart(draft.start);
          if (draft.end) setLeaseEnd(draft.end);
          if (draft.fileData) setAgreementFileData(draft.fileData);
          if (draft.fileName) setAgreementFileName(draft.fileName);
          if (typeof draft.fileSize === 'number') setAgreementFileSize(draft.fileSize);
          if (draft.executionMode) setExecutionMode(draft.executionMode);
          setCurrentStep(initialStep || (draft.draftStep as any) || 1);
          return;
        }
      }

      setCurrentStep(1);
      setSelectedTenant(null);

      const firstProp = myProperties[0] || null;
      const initialPropId = firstProp?.id || '';
      setSelectedPropertyId(initialPropId);

      // Find initial unit strictly from non-occupied, non-reserved units
      const candidateUnits = state.units.filter((u) => {
        const matchOwner = myProperties.some((p) => p.id === u.propertyId);
        if (!matchOwner) return false;
        if (initialPropId && u.propertyId !== initialPropId) return false;
        if (u.id === preselectedUnitId) return true;
        const hasActiveAgreement = (state.agreements || []).some(
          (a) => a.status === 'active' && (a.unitId === u.id || (a.unit === u.unitNumber && (!a.propertyId || !u.propertyId || a.propertyId === u.propertyId)))
        );
        const hasPendingReq = (state.tenancyRequests || []).some(
          (r) => r.status === 'pending' && (r.unitId === u.id || (r.unitNumber === u.unitNumber && (!r.propertyId || !u.propertyId || r.propertyId === u.propertyId)))
        );
        const isOccupiedOrReserved =
          u.status === 'occupied' ||
          u.status === 'reserved' ||
          Boolean(u.currentTenantId) ||
          Boolean(u.tenant && u.tenant !== 'Unassigned' && u.tenant !== 'Vacant') ||
          hasActiveAgreement ||
          hasPendingReq;
        return !isOccupiedOrReserved;
      });

      const initialUnit = preselectedUnitId
        ? state.units.find((u) => u.id === preselectedUnitId)
        : candidateUnits[0] || null;

      if (initialUnit) {
        setSelectedUnitId(initialUnit.id);
        setSelectedPropertyId(initialUnit.propertyId);
        setRent(initialUnit.rent || 0);
        setDeposit(initialUnit.deposit || 0);
      } else {
        setSelectedUnitId('');
        setRent(0);
        setDeposit(0);
      }

      setDueDay(1);
      setLeaseStart(getNextMonthFirstDateString());
      setLeaseEnd(getOneYearLaterDateString(getNextMonthFirstDateString()));
      setExecutionMode('digital_dispatch');
      setOfflineDepositCollected(true);
      setOfflineDepositRef('Cash / Bank Wire Settled');
      setAgreementSource('upload');
      setAgreementFileName('');
      setAgreementFileData(null);
      setAgreementFileSize(null);
      setSelectedTemplateId('');
      setRequireIds(false);
      setIdList([{ id: `req_id_${Date.now()}`, name: 'Government Photo ID' }]);
    }
  }, [isOpen, preselectedUnitId, draftAgreementId, initialStep, myProperties, state.units, state.agreements, entryContext]);

  // Handle Property selection change
  const handlePropertyChange = (propId: string) => {
    setSelectedPropertyId(propId);
    const unitsInProp = state.units.filter((u) => u.propertyId === propId && (u.status === 'vacant' || u.id === preselectedUnitId));
    if (unitsInProp.length > 0) {
      const first = unitsInProp[0];
      setSelectedUnitId(first.id);
      setRent(first.rent || 0);
      setDeposit(first.deposit || 0);
    } else {
      setSelectedUnitId('');
      setRent(0);
      setDeposit(0);
    }
  };

  // Handle Unit selection change
  const handleUnitChange = (unitId: string) => {
    setSelectedUnitId(unitId);
    const u = state.units.find((x) => x.id === unitId);
    if (u) {
      if (u.rent) setRent(u.rent);
      if (u.deposit) setDeposit(u.deposit);
    }
  };

  // Quick duration selection
  const setDurationMonths = (months: number) => {
    const startObj = new Date(leaseStart || getNextMonthFirstDateString());
    const endObj = new Date(startObj);
    endObj.setMonth(endObj.getMonth() + months);
    endObj.setDate(endObj.getDate() - 1);
    setLeaseEnd(endObj.toISOString().split('T')[0]);
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        showToast('Agreement file size cannot exceed 10 MB.');
        return;
      }
      setAgreementFileName(file.name);
      setAgreementFileSize(file.size < 1024 ? 1 : Math.round(file.size / 1024));
      const reader = new FileReader();
      reader.onload = () => {
        setAgreementFileData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle template selection from library
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = availableTemplates.find((t) => t.id === templateId);
    if (tmpl) {
      setAgreementFileName(tmpl.fileName || `${tmpl.title}.pdf`);
      setAgreementFileData(tmpl.fileData || null);
      setAgreementFileSize(tmpl.fileSizeKb || null);
    }
  };

  // Validation before advancing to next step
  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!selectedTenant || !selectedTenant.name?.trim()) {
        showToast('Please find an existing tenant or enter a new tenant name.');
        return;
      }
      if (selectedTenant.isNew) {
        if (!selectedTenant.email || !selectedTenant.email.includes('@')) {
          showToast('Please enter a valid email address for the tenant.');
          return;
        }
        const cleanPhone = (selectedTenant.phone || '').trim();
        const phoneDigits = cleanPhone.replace(/\D/g, '');
        if (!cleanPhone || phoneDigits.length < 7 || phoneDigits.length > 15) {
          showToast('Please enter a valid phone number (at least 7 digits with country code).');
          return;
        }
        if (!selectedTenant.tempPassword || selectedTenant.tempPassword.trim().length < 6) {
          showToast('Please specify a temporary password (at least 6 characters) for resident setup.');
          return;
        }
      }
      if (isTenantLimitReached && selectedTenant.isNew) {
        openLimitModal('tenants');
        showToast(`Tenant quota reached (${usage.tenants.used}/${maxTenants} on ${currentPlanName} plan). Upgrade to add more tenants.`);
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!selectedUnitId) {
        showToast('Please select a unit.');
        return;
      }
      if (rent <= 0) {
        showToast('Please specify a monthly rent amount.');
        return;
      }
      if (!leaseStart || !leaseEnd) {
        showToast('Please enter both lease start and end dates.');
        return;
      }
      if (new Date(leaseStart) >= new Date(leaseEnd)) {
        showToast('Lease end date must be after lease start date.');
        return;
      }
      setCurrentStep(3);
    }
  };

  // Save progress as draft at any stage (Step 1, 2, or 3)
  const handleSaveDraft = async () => {
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 200));

    try {
      const targetUnit = state.units.find((u) => u.id === selectedUnitId);
      const targetProperty = state.properties.find(
        (p) => p.id === (targetUnit?.propertyId || selectedPropertyId)
      );
      const unitLabel = targetUnit?.unitNumber || targetUnit?.id || (selectedUnitId ? 'Unit' : 'Unassigned Unit');
      const propId = targetProperty?.id || selectedPropertyId || '';
      const propName = targetProperty?.name || (propId ? 'Property' : 'Unassigned Property');
      const propCurrency = targetUnit?.currency || targetProperty?.currency || defaultOwnerCurrency;
      const nowIso = new Date().toISOString();

      const agId = draftAgreementId || `DFT-${Date.now().toString().slice(-6)}`;

      const draftAgreement: Agreement = {
        id: agId,
        ownerId,
        ownerName: user?.displayName || 'Property Owner',
        propertyId: propId,
        propertyName: propName,
        unit: unitLabel,
        unitId: targetUnit?.id || selectedUnitId || undefined,
        tenant: selectedTenant?.name?.trim() || 'Unassigned Resident',
        tenantId: selectedTenant?.id || '',
        tenantEmail: selectedTenant?.email?.trim() || undefined,
        tenantPhone: selectedTenant?.phone?.trim() || undefined,
        type: 'upload',
        executionMode,
        fileData: agreementFileData,
        fileName: agreementFileName,
        fileSize: agreementFileSize,
        start: leaseStart || '',
        end: leaseEnd || '',
        rent: rent || targetUnit?.rent || 0,
        deposit: deposit || targetUnit?.deposit || 0,
        currency: propCurrency,
        rentDueDay: dueDay || 1,
        status: 'draft',
        isDraft: true,
        draftStep: currentStep,
        draftSavedAt: nowIso,
        autoRenew: false,
      };

      await saveAgreement(draftAgreement);
      showToast(`✓ Lease saved as draft for ${unitLabel}. You can assign and issue it anytime from Leases.`);
      onClose();
    } catch (err) {
      console.error('Error saving draft:', err);
      showToast('⚠️ Failed to save draft. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Final submission handler
  const handleCompleteOnboarding = async () => {
    if (!selectedTenant) {
      showToast('Resident information is missing.');
      setCurrentStep(1);
      return;
    }
    if (!selectedUnitId) {
      showToast('Vacant unit selection is missing.');
      setCurrentStep(2);
      return;
    }
    if (!agreementFileData && agreementSource === 'upload') {
      showToast('Please attach or upload a lease agreement document (PDF/scan).');
      return;
    }

    if (isTenantLimitReached && selectedTenant.isNew) {
      openLimitModal('tenants');
      showToast(`Tenant limit reached (${usage.tenants.used}/${maxTenants} on ${currentPlanName} plan).`);
      return;
    }

    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 400));

    try {
      const cleanName = selectedTenant.name.trim();
      const cleanEmail = selectedTenant.email?.trim().toLowerCase() || `${cleanName.toLowerCase().replace(/\s+/g, '')}@tenant.com`;
      const cleanPhone = selectedTenant.phone?.trim() || '';
      const tempPassword = selectedTenant.tempPassword || 'Welcome@123';

      const targetUnit = state.units.find((u) => u.id === selectedUnitId);
      const targetProperty = state.properties.find((p) => p.id === (targetUnit?.propertyId || selectedPropertyId));
      const unitLabel = targetUnit?.unitNumber || targetUnit?.id || 'Unit';
      const propName = targetProperty?.name || 'Property';
      const propCurrency = targetUnit?.currency || targetProperty?.currency || defaultOwnerCurrency;
      const nowIso = new Date().toISOString();

      // 1. Resolve or provision tenant UserProfile ID
      const existingUser = state.users.find((u) => u.email?.toLowerCase() === cleanEmail);
      const existingTenant = state.tenants.find((t) => t.email?.toLowerCase() === cleanEmail);
      let tenantId = selectedTenant.id;

      if (selectedTenant.isNew && !existingUser && !existingTenant) {
        try {
          const provRes = await provisionUser({
            name: cleanName,
            email: cleanEmail,
            password: tempPassword,
            role: 'tenant',
            phone: cleanPhone,
            ownerId,
            ownerName: user?.displayName || 'Property Owner',
          });
          if (provRes?.uid) {
            tenantId = provRes.uid;
          }
        } catch (provErr) {
          console.warn('User auth provisioning non-blocking warning:', provErr);
        }
      } else if (existingUser?.id) {
        tenantId = existingUser.id;
      } else if (existingTenant?.id) {
        tenantId = existingTenant.id;
      }

      const isOfflineMode = executionMode === 'already_executed_offline';

      // -------------------------------------------------------------
      // PATH A: DIGITAL DISPATCH (Tenant e-Signs on Dashboard)
      // -------------------------------------------------------------
      if (!isOfflineMode) {
        const requestId = `req_${Date.now()}`;
        let uploadedAgreementUrl = agreementFileData;
        if (agreementFileData && agreementFileData.startsWith('data:')) {
          const fileExt = (agreementFileName || '').split('.').pop() || 'pdf';
          const storagePath = `agreements/${requestId}/${Date.now()}_initial.${fileExt}`;
          uploadedAgreementUrl = await uploadDocumentFile(agreementFileData, storagePath, {
            tenantId,
            ownerId,
          });
        }

        const newRequest: TenancyRequest = {
          id: requestId,
          ownerId,
          ownerName: user?.displayName || 'Property Owner',
          ownerEmail: user?.email || '',
          tenantId,
          tenantName: cleanName,
          tenantEmail: cleanEmail,
          tenantPhone: cleanPhone,
          propertyId: targetProperty?.id || 'prop-1',
          propertyName: propName,
          unitId: targetUnit?.id || selectedUnitId,
          unitNumber: unitLabel,
          rent,
          deposit,
          currency: propCurrency,
          leaseStart,
          leaseEnd,
          message: `Welcome to your new home at ${propName}! Please review the attached lease agreement for Unit ${unitLabel}, accept, sign, and upload your signed copy to proceed to security deposit settlement.`,
          agreementFileName: agreementFileName || 'Rental_Agreement.pdf',
          agreementFileData: uploadedAgreementUrl,
          agreementFileSize: agreementFileSize || undefined,
          requireTenantId: requireIds,
          requiredIdList: requireIds ? idList.filter((i) => i.name.trim()) : [],
          requiredIdTypes: requireIds ? idList.map((i) => i.name.trim()).filter(Boolean) : [],
          status: 'pending',
          createdAt: nowIso,
        };

        // Unit is reserved pending digital signature
        if (targetUnit) {
          saveUnit({
            ...targetUnit,
            status: 'reserved',
            tenant: cleanName,
            currentTenantId: tenantId,
            rent: rent || targetUnit.rent,
            deposit: deposit || targetUnit.deposit,
          });
        }

        // Notification for tenant
        const notif = {
          id: `notif_${Date.now()}`,
          userId: tenantId,
          title: `Tenancy Offer & Lease Agreement from ${user?.displayName || 'Property Owner'}`,
          body: `You have received a tenancy invitation with attached lease agreement for Unit ${unitLabel} at ${propName} (${propCurrency}${rent.toLocaleString()}/mo). Please inspect and accept on your dashboard.`,
          link: '/tenant/dashboard',
          isRead: false,
          createdAt: nowIso,
        };

        saveTenancyRequest(newRequest, notif);

        // Update local state
        updateState((prev) => {
          const updatedUnits = prev.units.map((u) =>
            u.id === targetUnit?.id
              ? {
                  ...u,
                  status: 'reserved' as const,
                  tenant: cleanName,
                  currentTenantId: tenantId,
                  rent: rent || u.rent,
                  deposit: deposit || u.deposit,
                }
              : u
          );

          // For pending online invitation, record invited user profile without placing them into active tenants directory
          const newProfile: UserProfile = {
            id: tenantId,
            email: cleanEmail,
            role: 'tenant',
            ownerId,
            displayName: cleanName,
            phone: cleanPhone,
            status: 'invited',
            createdAt: nowIso,
            tempPassword,
          };
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'users', tenantId), newProfile, { merge: true }).catch(console.warn);
          }

          return {
            ...prev,
            tenancyRequests: [newRequest, ...(prev.tenancyRequests || [])],
            units: updatedUnits,
            users: [...(prev.users || []).filter((u) => u.id !== tenantId), newProfile],
            notifications: [...(prev.notifications || []), notif],
          };
        });

        showToast(`Invitation sent to ${cleanName}! Unit ${unitLabel} is now reserved.`);
      }

      // -------------------------------------------------------------
      // PATH B: ALREADY EXECUTED OFFLINE (Immediate Active Tenancy)
      // -------------------------------------------------------------
      else {
        const agId = `AG-${Math.floor(1000 + Math.random() * 9000)}`;
        let uploadedAgreementUrl = agreementFileData;
        if (agreementFileData && agreementFileData.startsWith('data:')) {
          const fileExt = (agreementFileName || '').split('.').pop() || 'pdf';
          const storagePath = `agreements/${agId}/${Date.now()}_signed.${fileExt}`;
          uploadedAgreementUrl = await uploadDocumentFile(agreementFileData, storagePath, {
            tenantId,
            ownerId,
          });
        }

        const newAg: Agreement = {
          id: agId,
          ownerId,
          propertyId: targetProperty?.id || 'prop-1',
          unit: unitLabel,
          tenant: cleanName,
          tenantId,
          tenantEmail: cleanEmail,
          tenantPhone: cleanPhone,
          type: 'uploaded',
          executionMode: 'already_executed_offline',
          contentHtml: null,
          fileName: agreementFileName,
          fileData: uploadedAgreementUrl,
          initialAgreementUrl: uploadedAgreementUrl || undefined,
          initialAgreementName: agreementFileName || undefined,
          initialUploadedAt: nowIso,
          ownerSignedDocumentUrl: uploadedAgreementUrl || undefined,
          ownerSignedDocumentName: agreementFileName || undefined,
          ownerSignedUploadedAt: nowIso,
          start: leaseStart,
          end: leaseEnd,
          rent,
          deposit,
          currency: propCurrency,
          rentDueDay: dueDay || 1,
          status: 'active',
          tenantSignature: null,
          signedDocumentUrl: uploadedAgreementUrl || undefined,
          signedDocumentName: agreementFileName,
          signedUploadedAt: nowIso,
          approvedAt: nowIso,
          approvedBy: user?.displayName || 'Property Owner',
          counterSignedAt: nowIso,
          counterSignatory: user?.displayName || 'Property Owner',
          depositStatus: offlineDepositCollected ? 'paid' : 'unpaid',
          autoRenew: false,
          requireTenantId: requireIds,
          requiredIdList: requireIds ? idList.filter((i) => i.name.trim()) : [],
          requiredIdTypes: requireIds ? idList.map((i) => i.name.trim()).filter(Boolean) : [],
          requiredIdType: requireIds && idList.length > 0 ? idList[0].name.trim() : undefined,
        };

        // Mark unit occupied immediately
        if (targetUnit) {
          saveUnit({
            ...targetUnit,
            status: 'occupied',
            tenant: cleanName,
            currentTenantId: tenantId,
            rent: rent || targetUnit.rent,
            deposit: deposit || targetUnit.deposit,
          });
        }

        saveAgreement(newAg);

        // If offline deposit was collected, record payment transaction
        const newPayments = [...state.payments];
        if (offlineDepositCollected && deposit > 0) {
          newPayments.unshift({
            id: `TXN-DEP-${Date.now().toString().slice(-6)}`,
            ownerId,
            tenant: cleanName,
            tenantId,
            unit: unitLabel,
            amount: deposit,
            date: new Date().toISOString().split('T')[0],
            dueDate: leaseStart,
            status: 'paid',
            method: offlineDepositRef || 'Offline Cash/Wire',
            type: 'deposit',
            currency: propCurrency,
            notes: `Security deposit collected offline upon manual lease execution.`,
          });
        }

        // Generate first month move-in rent invoice
        const cleanAgId = agId.replace(/[^a-zA-Z0-9_-]/g, '');
        const rentInvId = `INV-RENT-${cleanAgId}-M1`;
        const firstMonthRentInvoice: Invoice = {
          id: rentInvId,
          ownerId,
          propertyId: newAg.propertyId,
          tenant: cleanName,
          tenantId,
          unit: unitLabel,
          propertyName: propName,
          amount: rent,
          tax: 0,
          total: rent,
          currency: propCurrency,
          due: leaseStart,
          status: 'sent',
          invoiceType: 'rent',
          leaseAgreementId: agId,
          issueDate: nowIso.split('T')[0],
          notes: `First month move-in rent pursuant to executed tenancy agreement for Unit ${unitLabel}.`,
          items: [
            {
              description: `First Month Rent (Move-in) — Unit ${unitLabel} (${propName})`,
              amount: rent,
            },
          ],
        };
        saveInvoice(firstMonthRentInvoice);

        // Update local state with occupied unit and active lease
        updateState((prev) => {
          const updatedUnits = prev.units.map((u) =>
            u.id === targetUnit?.id
              ? {
                  ...u,
                  status: 'occupied' as const,
                  tenant: cleanName,
                  currentTenantId: tenantId,
                  rent: rent || u.rent,
                  deposit: deposit || u.deposit,
                }
              : u
          );

          const updatedProperties = prev.properties.map((p) => {
            if (p.id === targetProperty?.id) {
              const occ = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
              return { ...p, occupied: occ };
            }
            return p;
          });

          // Upsert tenant record
          const existingTenantIdx = prev.tenants.findIndex(
            (t) => t.id === tenantId || (cleanEmail && t.email?.toLowerCase() === cleanEmail)
          );
          let updatedTenants = [...prev.tenants];
          if (existingTenantIdx >= 0) {
            const t = prev.tenants[existingTenantIdx];
            updatedTenants[existingTenantIdx] = {
              ...t,
              unit: unitLabel,
              unitsRented: Array.from(new Set([...(t.unitsRented || []), unitLabel])),
              owner: user?.displayName || 'Property Owner',
              ownerId,
              rent: rent || t.rent,
              deposit: deposit || t.deposit,
              currency: propCurrency,
              leaseStart,
              leaseEnd,
            };
          } else {
            const newRecord: TenantRecord = {
              id: tenantId,
              name: cleanName,
              email: cleanEmail,
              phone: cleanPhone,
              unit: unitLabel,
              owner: user?.displayName || 'Property Owner',
              ownerId,
              leaseStart,
              leaseEnd,
              rent,
              deposit,
              currency: propCurrency,
              rating: 5.0,
              unitsRented: [unitLabel],
              history: [],
              kycDocuments: [],
            };
            updatedTenants.push(newRecord);

            const newProfile: UserProfile = {
              id: tenantId,
              email: newRecord.email,
              role: 'tenant',
              ownerId,
              displayName: cleanName,
              phone: newRecord.phone,
              status: 'active',
              createdAt: nowIso,
              tempPassword,
            };
            saveTenant(newRecord, newProfile);
          }

          return {
            ...prev,
            agreements: [...prev.agreements, newAg],
            units: updatedUnits,
            properties: updatedProperties,
            tenants: updatedTenants,
            payments: newPayments,
            invoices: [firstMonthRentInvoice, ...prev.invoices],
          };
        });

        showToast(`Tenant ${cleanName} added successfully! Unit ${unitLabel} is now Occupied.`);
      }

      // If completing an existing draft, retire the draft
      if (draftAgreementId) {
        deleteAgreement(draftAgreementId).catch(console.warn);
      }

      if (onSuccess) {
        onSuccess(cleanName, unitLabel);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err);
      showToast(err.message || 'Failed to add tenant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop onboard-modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-card onboard-resident-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Head */}
        <div
          className="modal-head"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 22px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={20} color="var(--brass)" />
              {entryContext === 'leasing' ? 'New Lease & Add Tenant' : 'Add Tenant & Lease'}
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
              Step {currentStep} of 3 —{' '}
              {currentStep === 1 && 'Select or add tenant'}
              {currentStep === 2 && 'Select unit and rent terms'}
              {currentStep === 3 && 'Attach lease and choose signing method'}
            </p>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="onboard-stepper-bar">
          <div
            className="onboard-step-item"
            onClick={() => setCurrentStep(1)}
            style={{
              fontWeight: currentStep === 1 ? 700 : 500,
              color: currentStep === 1 ? 'var(--brass)' : currentStep > 1 ? 'var(--ink)' : 'var(--ink-soft)',
              cursor: 'pointer',
            }}
          >
            <span
              className="onboard-step-num"
              style={{ background: currentStep >= 1 ? 'var(--brass)' : 'var(--line-strong)' }}
            >
              1
            </span>
            <span className="onboard-step-text-full">Tenant Details</span>
            <span className="onboard-step-text-short">Tenant</span>
          </div>

          <div
            className="onboard-step-item"
            onClick={() => selectedTenant && setCurrentStep(2)}
            style={{
              fontWeight: currentStep === 2 ? 700 : 500,
              color: currentStep === 2 ? 'var(--brass)' : currentStep > 2 ? 'var(--ink)' : 'var(--ink-soft)',
              cursor: selectedTenant ? 'pointer' : 'default',
            }}
          >
            <span
              className="onboard-step-num"
              style={{ background: currentStep >= 2 ? 'var(--brass)' : 'var(--line-strong)' }}
            >
              2
            </span>
            <span className="onboard-step-text-full">Unit & Rent</span>
            <span className="onboard-step-text-short">Unit</span>
          </div>

          <div
            className="onboard-step-item"
            onClick={() => selectedTenant && selectedUnitId && setCurrentStep(3)}
            style={{
              fontWeight: currentStep === 3 ? 700 : 500,
              color: currentStep === 3 ? 'var(--brass)' : 'var(--ink-soft)',
              cursor: selectedTenant && selectedUnitId ? 'pointer' : 'default',
            }}
          >
            <span
              className="onboard-step-num"
              style={{ background: currentStep >= 3 ? 'var(--brass)' : 'var(--line-strong)' }}
            >
              3
            </span>
            <span className="onboard-step-text-full">Lease & Signing</span>
            <span className="onboard-step-text-short">Lease</span>
          </div>
        </div>

        {/* Modal Body */}
        <div
          className="modal-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* STEP 1: TENANT INFORMATION */}
          {currentStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '13px',
                  color: 'var(--ink-soft)',
                }}
              >
                Find an existing tenant by name, email, or phone, or add a new one directly below.
              </div>

              <div>
                <TenantSearchCombobox
                  selectedTenant={selectedTenant}
                  onSelectTenant={setSelectedTenant}
                  ownerId={ownerId}
                  label="Find or Enter Tenant *"
                  placeholder="Type tenant name, email, or phone..."
                />
              </div>
            </div>
          )}

          {/* STEP 2: UNIT & FINANCIAL TERMS */}
          {currentStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="onboard-grid-2col">
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Property *
                  </label>
                  <select
                    className="input"
                    value={selectedPropertyId}
                    onChange={(e) => handlePropertyChange(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {myProperties.map((p) => {
                      const addr = typeof p.address === 'string'
                        ? p.address
                        : (p.address?.formattedAddress || p.address?.city || '');
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} {addr ? `(${addr})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Select Unit *
                  </label>
                  <select
                    className="input"
                    value={selectedUnitId}
                    onChange={(e) => handleUnitChange(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {vacantUnits.length === 0 ? (
                      <option value="">No vacant units available in this property</option>
                    ) : (
                      vacantUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          Unit {u.unitNumber} {u.unitType ? `• ${u.unitType} ` : ''}• {defaultOwnerCurrency}{u.rent?.toLocaleString()}/mo
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Financial Inputs */}
              <div className="onboard-grid-3col">
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Monthly Rent ({defaultOwnerCurrency}) *
                  </label>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    value={rent || ''}
                    onChange={(e) => setRent(Number(e.target.value))}
                    placeholder="0"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Security Deposit ({defaultOwnerCurrency})
                  </label>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    value={deposit || ''}
                    onChange={(e) => setDeposit(Number(e.target.value))}
                    placeholder="0"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Rent Due Day
                  </label>
                  <select
                    className="input"
                    value={dueDay}
                    onChange={(e) => setDueDay(Number(e.target.value))}
                    style={{ width: '100%' }}
                  >
                    {[1, 5, 10, 15, 20, 25].map((d) => (
                      <option key={d} value={d}>
                        {d === 1 ? '1st' : `${d}th`} of each month
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Lease Dates with Quick Duration Pills */}
              <div
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, margin: 0 }}>
                    Lease Duration & Timeline
                  </label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setDurationMonths(6)}
                      style={{ fontSize: '11.5px', padding: '3px 8px' }}
                    >
                      6 Months
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setDurationMonths(12)}
                      style={{ fontSize: '11.5px', padding: '3px 8px' }}
                    >
                      1 Year
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setDurationMonths(24)}
                      style={{ fontSize: '11.5px', padding: '3px 8px' }}
                    >
                      2 Years
                    </button>
                  </div>
                </div>

                <div className="onboard-grid-2col">
                  <div>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                      Lease Start Date *
                    </span>
                    <input
                      type="date"
                      className="input"
                      value={leaseStart}
                      onChange={(e) => setLeaseStart(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '4px' }}>
                      Lease End Date *
                    </span>
                    <input
                      type="date"
                      className="input"
                      value={leaseEnd}
                      onChange={(e) => setLeaseEnd(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: LEASE AGREEMENT & EXECUTION MODE */}
          {currentStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Mode Selection Cards */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  Select Signing Method *
                </label>
                <div className="onboard-signing-cards">
                  <div
                    onClick={() => setExecutionMode('digital_dispatch')}
                    style={{
                      border: executionMode === 'digital_dispatch' ? '2px solid var(--brass)' : '1px solid var(--line)',
                      background: executionMode === 'digital_dispatch' ? '#FCFBF7' : '#FFFFFF',
                      borderRadius: '8px',
                      padding: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <FileCheck size={18} color="var(--brass)" />
                      <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>Send Online to Tenant</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink-soft)', lineHeight: '1.4' }}>
                      Tenant gets an invite in their app to review, sign the lease, and pay deposit online. Unit stays reserved.
                    </p>
                  </div>

                  <div
                    onClick={() => setExecutionMode('already_executed_offline')}
                    style={{
                      border: executionMode === 'already_executed_offline' ? '2px solid var(--brass)' : '1px solid var(--line)',
                      background: executionMode === 'already_executed_offline' ? '#FCFBF7' : '#FFFFFF',
                      borderRadius: '8px',
                      padding: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <CheckCircle2 size={18} color="#16A34A" />
                      <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>Signed on Paper / Already Moved In</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink-soft)', lineHeight: '1.4' }}>
                      For tenants already living in the unit or with paper contracts signed. Marks unit occupied immediately.
                    </p>
                  </div>
                </div>
              </div>

              {/* Offline Deposit Options */}
              {executionMode === 'already_executed_offline' && (
                <div
                  style={{
                    background: 'var(--teal-light)',
                    border: '1px solid var(--teal-border)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={offlineDepositCollected}
                      onChange={(e) => setOfflineDepositCollected(e.target.checked)}
                    />
                    <span>Security deposit already collected offline ({defaultOwnerCurrency}{deposit.toLocaleString()})</span>
                  </label>

                  {offlineDepositCollected && (
                    <div>
                      <input
                        type="text"
                        className="input"
                        placeholder="Settlement reference (e.g. Cash / Bank Wire Settled)"
                        value={offlineDepositRef}
                        onChange={(e) => setOfflineDepositRef(e.target.value)}
                        style={{ width: '100%', fontSize: '12.5px' }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Agreement Document Source */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Lease Agreement Document *
                </label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn small ${agreementSource === 'upload' ? 'brass' : 'secondary'}`}
                    onClick={() => setAgreementSource('upload')}
                  >
                    Upload PDF / Scan
                  </button>
                  <button
                    type="button"
                    className={`btn small ${agreementSource === 'library' ? 'brass' : 'secondary'}`}
                    onClick={() => setAgreementSource('library')}
                    disabled={availableTemplates.length === 0}
                  >
                    Template Library ({availableTemplates.length})
                  </button>
                </div>

                {agreementSource === 'upload' ? (
                  <div
                    style={{
                      border: '1.5px dashed var(--line)',
                      borderRadius: '8px',
                      padding: '16px',
                      textAlign: 'center',
                      background: 'var(--surface-sunken)',
                    }}
                  >
                    <input
                      type="file"
                      id="onboard-agreement-upload"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                    <label
                      htmlFor="onboard-agreement-upload"
                      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}
                    >
                      <Upload size={22} color="var(--brass)" />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                        {agreementFileData ? agreementFileName : 'Choose Agreement PDF or Scan'}
                      </span>
                      <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                        {agreementFileData ? `${Math.max(1, agreementFileSize || 1)} KB uploaded` : 'Supports PDF, JPEG, PNG (Max 10 MB)'}
                      </span>
                    </label>
                  </div>
                ) : (
                  <div>
                    <select
                      className="input"
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                      style={{ width: '100%' }}
                    >
                      <option value="">Select a template from your library...</option>
                      {availableTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.fileName})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* KYC ID Requirements Toggle */}
              <div
                style={{
                  borderTop: '1px solid var(--line)',
                  paddingTop: '12px',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={requireIds}
                    onChange={(e) => setRequireIds(e.target.checked)}
                  />
                  <span>Ask Tenant for ID Proof (Aadhaar, Passport, etc.)</span>
                </label>

                {requireIds && (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {idList.map((item, idx) => (
                      <div key={item.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="input"
                          value={item.name}
                          onChange={(e) => {
                            const updated = [...idList];
                            updated[idx].name = e.target.value;
                            setIdList(updated);
                          }}
                          placeholder="e.g. Passport, Voter ID, National ID"
                          style={{ flex: 1, fontSize: '12.5px' }}
                        />
                        {idList.length > 1 && (
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => setIdList(idList.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setIdList([...idList, { id: `req_id_${Date.now()}`, name: '' }])}
                      style={{ alignSelf: 'flex-start', fontSize: '12px', marginTop: '4px' }}
                    >
                      <Plus size={13} /> Add Another ID Request
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Foot */}
        <div
          className="modal-foot"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 22px',
            borderTop: '1px solid var(--line)',
            background: 'var(--surface-sunken)',
            gap: '10px',
          }}
        >
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                className="btn secondary"
                onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
                disabled={isSubmitting}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowLeft size={15} /> Back
              </button>
            ) : (
              <button
                type="button"
                className="btn secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={handleSaveDraft}
              disabled={isSubmitting}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Save progress as draft to finalize or assign later"
            >
              <Bookmark size={15} /> Save as Draft
            </button>

            {currentStep < 3 ? (
              <button
                type="button"
                className="btn brass"
                onClick={handleNextStep}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Continue <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                className={`btn brass ${isSubmitting ? 'btn-processing' : ''}`}
                onClick={handleCompleteOnboarding}
                disabled={isSubmitting}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ButtonProcessing
                  loading={isSubmitting}
                  defaultText={executionMode === 'already_executed_offline' ? 'Add Tenant Directly' : 'Send Lease Invitation'}
                  loadingText="Saving..."
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {limitModalResource && (
        <PlanLimitModal
          resourceType={limitModalResource}
          currentUsage={usage[limitModalResource].used}
          limit={usage[limitModalResource].max}
          planName={currentPlanName}
          onClose={closeLimitModal}
          onUpgrade={() => {
            closeLimitModal();
            showToast('Redirecting to subscription tiers...');
          }}
        />
      )}
    </div>
  );
};
