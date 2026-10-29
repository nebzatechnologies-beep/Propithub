import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  LayoutAnimation,
  Dimensions,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { collection, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { MobileAgreement, MobileAgreementTemplate, MobileTenancyRequest, MobileRenewalItem, MobileTenantUploadedIdItem, MobileTenantRecord, MobileRequiredIdItem, MobileInvoice } from '../types';
import { DocumentViewerModal } from '../components/DocumentViewerModal';
import { downloadDocument, DocumentDownloadItem } from '../lib/documentService';
import { uploadOrCompressDocument } from '../lib/imageUploader';
import { pickDocument } from '../lib/nativePicker';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { useMobileAlert } from '../context/MobileAlertContext';
import { useMobileToast } from '../context/MobileToastContext';

export interface SearchCandidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  unit?: string;
  source: 'directory' | 'platform' | 'unit';
}

function getNextMonthFirstDateString(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString().split('T')[0];
}

function getOneYearLaterDateString(dateStr: string): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

interface LeasingHubScreenProps {
  onProfilePress?: () => void;
  onNewAgreementPress?: () => void;
  onInitiateNoticePress?: (unitId: string) => void;
  /** Render only the modals (used by Tenants screen to reuse the onboarding wizard). */
  modalOnly?: boolean;
  /** Increment to open the 3-step Onboard / New Lease wizard. */
  openOnboardSignal?: number;
}

export const LeasingHubScreen: React.FC<LeasingHubScreenProps> = ({
  onProfilePress,
  onNewAgreementPress,
  onInitiateNoticePress,
  modalOnly = false,
  openOnboardSignal = 0,
}) => {
  const {
    state,
    updateAgreement,
    addAgreement,
    saveAgreement,
    deleteAgreement,
    saveAgreementTemplate,
    deleteAgreementTemplate,
    updateTenancyRequest,
    sendTenancyRequest,
    saveUnit,
    saveInvoice,
    saveTenant,
    approveSignedAgreement,
    rejectSignedAgreement,
    offerLeaseRenewal,
    approveLeaseRenewal,
    planUsage,
  } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency } = useMobileCurrency();
  const { colors, isDark } = useMobileTheme();
  const { showAlert } = useMobileAlert();
  const { showToast } = useMobileToast();

  const windowHeight = Dimensions.get('window').height;

  // Primary Subtab (1-to-1 Web Parity)
  const [activeTab, setActiveTab] = useState<'agreements' | 'renewals' | 'applications' | 'library' | 'drafts'>('agreements');

  // Filter states
  const [agreementFilter, setAgreementFilter] = useState<
    'all' | 'active' | 'pending_approval' | 'pending_deposit' | 'awaiting_signature'
  >('all');
  const [appFilter, setAppFilter] = useState<'all' | 'pending' | 'accepted' | 'declined'>('all');
  const [search, setSearch] = useState('');

  // 1. View Agreement Details Modal State
  const [viewingAgreement, setViewingAgreement] = useState<MobileAgreement | null>(null);

  // 2. Review & Approve Signed Lease Modal State
  const [inspectingSignedAgreement, setInspectingSignedAgreement] = useState<MobileAgreement | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReasonText, setRejectReasonText] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentDownloadItem | null>(null);

  // 3. Web Parity Renewal Offer Modal State
  const [renewalModalItem, setRenewalModalItem] = useState<{
    unit: string;
    tenant: string;
    currentRent: number;
    leaseEnd: string;
    currency?: string;
    propertyId?: string;
  } | null>(null);
  const [renewalPercent, setRenewalPercent] = useState<number>(8);
  const [renewalDurationMonths, setRenewalDurationMonths] = useState<number>(12);
  const [renewalStartDate, setRenewalStartDate] = useState<string>('');
  const [renewalEndDate, setRenewalEndDate] = useState<string>('');
  const [renewalOwnerNotes, setRenewalOwnerNotes] = useState<string>('');

  // 4. Review Signed Renewal Modal State
  const [inspectingSignedRenewal, setInspectingSignedRenewal] = useState<MobileRenewalItem | null>(null);

  // 5. Terminate / Vacate Modal State
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [selectedTerminateAg, setSelectedTerminateAg] = useState<MobileAgreement | null>(null);
  const [terminateReason, setTerminateReason] = useState('Tenant relocating for work');
  const [vacateDate, setVacateDate] = useState('2026-11-30');

  const ownerId = user?.id || '';
  const myProperties = useMemo(() => {
    if (!ownerId) return [];
    return (state.properties || []).filter((p) => p.ownerId === ownerId);
  }, [state.properties, ownerId]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    if (!ownerId) return [];
    return (state.units || []).filter((u) => u.ownerId === ownerId || (u.propertyId && myPropertyIds.has(u.propertyId)));
  }, [state.units, ownerId, myPropertyIds]);

  const vacantUnits = useMemo(() => {
    return myUnits.filter((u) => {
      if (u.status === 'occupied') return false;
      if (u.tenant || u.currentTenantId) return false;
      const hasActiveAg = (state.agreements || []).some(
        (a) =>
          (a.status === 'active' || a.status === 'pending_deposit') &&
          (!u.propertyId || !a.propertyId || a.propertyId === u.propertyId) &&
          (a.unit === u.unitNumber || a.unit === u.id)
      );
      if (hasActiveAg) return false;
      return true;
    });
  }, [myUnits, state.agreements]);

  const myTenants = useMemo(() => {
    if (!ownerId) return [];
    return (state.tenants || []).filter((t) => {
      const matchOwner = t.ownerId === ownerId;
      const matchProp = Boolean(t.propertyId && myPropertyIds.has(t.propertyId));
      const matchUnit = Boolean(t.unit && myUnits.some((u) => u.unitNumber === t.unit || u.id === t.unit));
      const matchAgreement = (state.agreements || []).some(
        (a) =>
          (a.ownerId === ownerId || (a.propertyId && myPropertyIds.has(a.propertyId))) &&
          (a.tenantId === t.id || (t.email && a.tenantEmail?.toLowerCase() === t.email.toLowerCase())) &&
          a.status !== 'terminated' && a.status !== 'cancelled'
      );
      return matchOwner || matchProp || matchUnit || matchAgreement;
    });
  }, [state.tenants, state.agreements, ownerId, myPropertyIds, myUnits]);

  const myAgreements = useMemo(() => {
    if (!ownerId) return [];
    return (state.agreements || []).filter((ag) => ag.ownerId === ownerId || (ag.propertyId && myPropertyIds.has(ag.propertyId)));
  }, [state.agreements, ownerId, myPropertyIds]);

  const myDrafts = useMemo(() => {
    if (!ownerId) return [];
    return (state.agreements || []).filter(
      (a) =>
        (a.ownerId === ownerId || (a.propertyId && myPropertyIds.has(a.propertyId))) &&
        (a.isDraft === true || a.status === 'draft')
    );
  }, [state.agreements, ownerId, myPropertyIds]);

  const displayedDrafts = useMemo(() => {
    if (!search.trim()) return myDrafts;
    const q = search.toLowerCase();
    return myDrafts.filter(
      (d) =>
        d.tenant.toLowerCase().includes(q) ||
        d.unit.toLowerCase().includes(q) ||
        (d.propertyName && d.propertyName.toLowerCase().includes(q)) ||
        d.id.toLowerCase().includes(q)
    );
  }, [myDrafts, search]);

  const myTenancyRequests = useMemo(() => {
    if (!ownerId) return [];
    return (state.tenancyRequests || []).filter((r) => r.ownerId === ownerId || (r.propertyId && myPropertyIds.has(r.propertyId)));
  }, [state.tenancyRequests, ownerId, myPropertyIds]);

  // Agreement Library State (Mobile Parity)
  const myTemplates: MobileAgreementTemplate[] = useMemo(() => {
    const isAdmin = (user?.role as any) === 'superadmin' || (user?.role as any) === 'admin';
    const custom = (state.agreementTemplates || []).filter(
      (t) => t.ownerId === ownerId || isAdmin
    );
    const fromAg: MobileAgreementTemplate[] = [];
    const seen = new Set(custom.map((t) => (t.fileName || t.title).toLowerCase()));
    (state.agreements || []).forEach((a) => {
      const agAny = a as any;
      if ((a.ownerId === ownerId || isAdmin) && agAny.fileData && agAny.fileName) {
        const lower = agAny.fileName.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          fromAg.push({
            id: `ag_tmpl_${a.id}`,
            ownerId: a.ownerId,
            ownerName: agAny.ownerName || 'Owner',
            title: agAny.fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            propertyId: a.propertyId || 'all',
            propertyName: a.propertyName || 'All Properties',
            fileName: agAny.fileName,
            fileData: agAny.fileData,
            fileSizeKb: typeof agAny.fileSize === 'number' ? agAny.fileSize : 450,
            uploadedAt: a.start || new Date().toISOString(),
            uploadedBy: 'owner',
            status: 'active',
          });
        }
      }
    });
    return [...custom, ...fromAg];
  }, [state.agreementTemplates, state.agreements, ownerId, user?.role]);

  const [showUploadTemplateModal, setShowUploadTemplateModal] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templatePropertyId, setTemplatePropertyId] = useState('all');
  const [templateFileName, setTemplateFileName] = useState('');
  const [templateFileData, setTemplateFileData] = useState<string | null>(null);
  const [templateFileSize, setTemplateFileSize] = useState<number | null>(null);
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false);

  const filteredTemplates = useMemo(() => {
    let list = myTemplates;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.fileName.toLowerCase().includes(q) ||
          (t.propertyName && t.propertyName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [myTemplates, search]);

  const handleSaveNewTemplate = async () => {
    if (!templateTitle.trim()) {
      showAlert({ title: 'Validation Error', message: 'Please enter an agreement title.', type: 'warning' });
      return;
    }
    if (!templateFileData) {
      showAlert({ title: 'Validation Error', message: 'Please choose a document file (PDF or image).', type: 'warning' });
      return;
    }

    setIsUploadingTemplate(true);
    try {
      const targetProp = myProperties.find((p) => p.id === templatePropertyId);
      const newDoc: MobileAgreementTemplate = {
        id: `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        ownerId: ownerId || 'unknown_owner',
        ownerName: (user as any)?.displayName || (user as any)?.name || 'Owner',
        title: templateTitle.trim(),
        propertyId: templatePropertyId,
        propertyName: templatePropertyId === 'all' ? 'All Properties' : (targetProp?.name || 'Custom Property'),
        fileName: templateFileName || 'Standard_Lease_Agreement.pdf',
        fileData: templateFileData,
        fileSizeKb: templateFileSize || 450,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'owner',
        status: 'active',
      };

      await saveAgreementTemplate(newDoc);
      showToast('Agreement added to library successfully!', 'success');
      setShowUploadTemplateModal(false);
      setTemplateTitle('');
      setTemplatePropertyId('all');
      setTemplateFileName('');
      setTemplateFileData(null);
      setTemplateFileSize(null);
    } catch (err: any) {
      showAlert({ title: 'Error', message: err?.message || 'Failed to save agreement template.', type: 'error' });
    } finally {
      setIsUploadingTemplate(false);
    }
  };

  const handleDeleteTemplate = (tmpl: MobileAgreementTemplate) => {
    const isAdmin = (user?.role as any) === 'superadmin' || (user?.role as any) === 'admin';
    const isOwner = tmpl.ownerId === ownerId;

    if (!isAdmin && !isOwner) {
      showAlert({ title: 'Unauthorized', message: 'You do not have permission to delete this agreement.', type: 'error' });
      return;
    }

    Alert.alert(
      'Delete Agreement',
      `Are you sure you want to delete "${tmpl.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAgreementTemplate(tmpl.id);
              showToast('Agreement template deleted', 'success');
            } catch (err: any) {
              showAlert({ title: 'Error', message: err?.message || 'Failed to delete template.', type: 'error' });
            }
          },
        },
      ]
    );
  };

  // 6. Web Parity: "+ Upload agreement" Modal State
  const [showUploadAgreementModal, setShowUploadAgreementModal] = useState(false);
  const [uploadTenantName, setUploadTenantName] = useState('');
  const [uploadTenantEmail, setUploadTenantEmail] = useState('');
  const [uploadTenantPhone, setUploadTenantPhone] = useState('');
  const [uploadPropertyId, setUploadPropertyId] = useState('');
  const [uploadUnitId, setUploadUnitId] = useState('');
  const [uploadUnit, setUploadUnit] = useState('');
  const [uploadRent, setUploadRent] = useState('');
  const [uploadDeposit, setUploadDeposit] = useState('');
  const [uploadDueDay, setUploadDueDay] = useState<string>('1');
  const [uploadAutoRenew, setUploadAutoRenew] = useState<'Off' | 'On'>('Off');
  const [uploadStartDate, setUploadStartDate] = useState(getNextMonthFirstDateString);
  const [uploadEndDate, setUploadEndDate] = useState(() => getOneYearLaterDateString(getNextMonthFirstDateString()));
  const [uploadExecutionMode, setUploadExecutionMode] = useState<'already_executed_offline' | 'digital_dispatch'>('digital_dispatch');
  const [offlineDepositCollected, setOfflineDepositCollected] = useState<boolean>(true);
  const [offlineDepositRef, setOfflineDepositRef] = useState<string>('Cash / Bank Wire Settled');
  const [uploadFileName, setUploadFileName] = useState('Rental_Agreement_Signed.pdf');
  const [uploadFileData, setUploadFileData] = useState<string>('');
  const [uploadAgreementSource, setUploadAgreementSource] = useState<'upload' | 'library'>('upload');
  const [uploadSelectedTemplateId, setUploadSelectedTemplateId] = useState<string>('');
  const [uploadRequireIds, setUploadRequireIds] = useState<boolean>(false);
  const [uploadIdList, setUploadIdList] = useState<MobileRequiredIdItem[]>([
    { id: 'req_1', name: 'Government Photo ID' },
  ]);
  const [uploadOfflineTenantIds, setUploadOfflineTenantIds] = useState<Record<string, { fileName: string; fileUrl: string }>>({});
  const uploadProp = myProperties.find((p) => p.id === uploadPropertyId) || myProperties[0];
  const uploadCurrency = uploadProp?.currency || viewCurrency;

  // Web Parity: Interactive Dropdowns for Unit and Resident Search
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [tenantSearchQuery, setTenantSearchQuery] = useState('');
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const [selectedTenantObj, setSelectedTenantObj] = useState<SearchCandidate | null>(null);
  const [isNewTenantMode, setIsNewTenantMode] = useState(false);
  const [showTenantDetailsEdit, setShowTenantDetailsEdit] = useState(false);
  const [uploadTenantPassword, setUploadTenantPassword] = useState('Welcome@123');
  const [liveFirestoreUsers, setLiveFirestoreUsers] = useState<SearchCandidate[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);

  // Live Query from Firestore (Web Parity):
  // When modal is open, query all users and tenants from Firestore so any user registered on Propithub
  // can be searched and selected immediately.
  useEffect(() => {
    if (!showUploadAgreementModal) return;
    if (isFirebaseConfigured && db) {
      setIsLoadingCandidates(true);
      Promise.all([
        getDocs(collection(db, 'users')).catch((err) => {
          console.warn('[LeasingHub] Could not load users from Firestore:', err);
          return null;
        }),
        getDocs(collection(db, 'tenants')).catch((err) => {
          console.warn('[LeasingHub] Could not load tenants from Firestore:', err);
          return null;
        }),
      ])
        .then(([usersSnap, tenantsSnap]) => {
          const freshCandidates: SearchCandidate[] = [];
          if (usersSnap) {
            usersSnap.forEach((docSnap) => {
              const u = docSnap.data();
              if (!u) return;
              const uId = u.id || docSnap.id;
              if (uId === ownerId) return; // Exclude owner themselves
              const role = String(u.role || '').toLowerCase();
              if (!role || role === 'tenant' || role === 'resident' || role === 'renter' || role === 'user') {
                const name = u.displayName || u.name || (u.email ? u.email.split('@')[0] : '');
                if (name || u.email) {
                  freshCandidates.push({
                    id: uId,
                    name: name || 'Propithub User',
                    email: u.email || '',
                    phone: u.phone || u.phoneNumber || '',
                    source: 'platform',
                  });
                }
              }
            });
          }
          if (tenantsSnap) {
            tenantsSnap.forEach((docSnap) => {
              const t = docSnap.data();
              if (!t) return;
              const tId = t.id || docSnap.id;
              const name = t.name || t.displayName;
              if (name || t.email) {
                freshCandidates.push({
                  id: tId,
                  name: name || 'Tenant',
                  email: t.email || '',
                  phone: t.phone || t.phoneNumber || '',
                  unit: t.unit,
                  source: 'directory',
                });
              }
            });
          }
          if (freshCandidates.length > 0) {
            setLiveFirestoreUsers(freshCandidates);
          }
        })
        .finally(() => {
          setIsLoadingCandidates(false);
        });
    }
  }, [showUploadAgreementModal, ownerId]);

  const candidateTenants = useMemo(() => {
    const map = new Map<string, SearchCandidate>();
    // 1. Owner's direct tenants from state.tenants
    (myTenants || []).forEach((t) => {
      if (t.name) {
        const key = (t.email || t.id || t.name).toLowerCase();
        map.set(key, {
          id: t.id || `t_${Date.now()}`,
          name: t.name,
          email: t.email || '',
          phone: t.phone || '',
          unit: t.unit && t.unit !== 'Unassigned' ? t.unit : undefined,
          source: 'directory',
        });
      }
    });
    // 2. Tenants from occupied units
    (myUnits || [])
      .filter((u) => u.tenant && u.tenant !== 'Unassigned' && u.tenant !== 'Unassigned Unit')
      .forEach((u) => {
        const key = u.tenant.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            id: (u as any).currentTenantId || `unit_t_${u.id}`,
            name: u.tenant,
            email: '',
            phone: '',
            unit: u.unitNumber,
            source: 'unit',
          });
        }
      });
    // 3. Platform registered users & Firestore tenants
    (liveFirestoreUsers || []).forEach((u) => {
      const key = (u.email || u.id || u.name).toLowerCase();
      if (!map.has(key)) {
        map.set(key, u);
      } else {
        const existing = map.get(key)!;
        if (!existing.email && u.email) existing.email = u.email;
        if (!existing.phone && u.phone) existing.phone = u.phone;
      }
    });
    return Array.from(map.values());
  }, [myTenants, myUnits, liveFirestoreUsers]);

  const filteredTenantCandidates = useMemo(() => {
    const q = tenantSearchQuery.toLowerCase().trim();
    if (!q) return candidateTenants;
    return candidateTenants.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.email && t.email.toLowerCase().includes(q)) ||
        (t.phone && t.phone.toLowerCase().includes(q)) ||
        (t.unit && t.unit.toLowerCase().includes(q))
    );
  }, [candidateTenants, tenantSearchQuery]);

  const canGoToStep = (target: 1 | 2 | 3) => {
    if (target === 1) return true;
    if (target === 2) {
      return Boolean(uploadTenantName.trim() || selectedTenantObj);
    }
    if (target === 3) {
      const hasTenant = Boolean(uploadTenantName.trim() || selectedTenantObj);
      const hasUnit = Boolean(uploadUnit.trim() || uploadUnitId);
      const rentNum = parseFloat(uploadRent) || 0;
      const validDates = Boolean(uploadStartDate && uploadEndDate && new Date(uploadStartDate) < new Date(uploadEndDate));
      return hasTenant && hasUnit && rentNum > 0 && validDates;
    }
    return false;
  };

  const handleSelectProperty = (propId: string) => {
    setUploadPropertyId(propId);
    const vacantOfProp = vacantUnits.filter((u) => u.propertyId === propId);
    if (vacantOfProp.length > 0) {
      handleSelectUnitForUpload(vacantOfProp[0].id);
    } else {
      setUploadUnitId('');
      setUploadUnit('');
      setUploadRent('');
      setUploadDeposit('');
    }
  };

  // Tenant Limit computation from plan usage
  const isTenantLimitReached =
    planUsage?.isTenantLimitReached ||
    (planUsage?.unitsMax ? myTenants.length >= planUsage.unitsMax : false);
  const maxTenants = planUsage?.tenantsMax || planUsage?.unitsMax || 10;
  const currentPlanName = planUsage?.planName || (planUsage?.tier ? planUsage.tier.toUpperCase() : 'GROWTH');

  // Select unit helper for upload modal (auto-fills rent, deposit, resident)
  const handleSelectUnitForUpload = (unitIdOrNum: string) => {
    const matched = myUnits.find((u) => u.id === unitIdOrNum) ||
      myUnits.find((u) => u.unitNumber === unitIdOrNum);
    if (!matched) return;
    setUploadUnitId(matched.id);
    setUploadUnit(matched.unitNumber || matched.id);
    if (matched.propertyId) {
      setUploadPropertyId(matched.propertyId);
    }
    if (matched.tenant) {
      setUploadTenantName(matched.tenant);
      const existingCandidate = candidateTenants.find(
        (t) =>
          t.name.toLowerCase() === matched.tenant.toLowerCase() || t.unit === matched.unitNumber || t.id === (matched as any).currentTenantId
      );
      if (existingCandidate) {
        setSelectedTenantObj(existingCandidate);
        if (existingCandidate.email) setUploadTenantEmail(existingCandidate.email);
        if (existingCandidate.phone) setUploadTenantPhone(existingCandidate.phone);
      }
    } else {
      setUploadTenantName('');
      setSelectedTenantObj(null);
    }
    if (matched.rent) setUploadRent(String(matched.rent));
    if (matched.deposit) setUploadDeposit(String(matched.deposit));
  };

  // ----------------------------------------------------
  // Drafts & Multi-Step Controlled Wizard State
  // ----------------------------------------------------
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  const handleOpenDraftModal = (draftId?: string, targetStep?: 1 | 2 | 3) => {
    if (draftId) {
      const draft = (state.agreements || []).find((a) => a.id === draftId);
      if (draft) {
        setActiveDraftId(draft.id);
        setWizardStep(targetStep || draft.draftStep || 1);
        setUploadTenantName(draft.tenant && draft.tenant !== 'Unassigned Resident' ? draft.tenant : '');
        setUploadTenantEmail(draft.tenantEmail || '');
        setUploadTenantPhone(draft.tenantPhone || '');
        setUploadPropertyId(draft.propertyId || '');
        setUploadUnitId(draft.unitId || '');
        setUploadUnit(draft.unit && draft.unit !== 'Unassigned Unit' && draft.unit !== 'Unassigned' ? draft.unit : '');
        setUploadRent(draft.rent ? String(draft.rent) : '');
        setUploadDeposit(draft.deposit ? String(draft.deposit) : '');
        setUploadDueDay(String(draft.dueDay || draft.rentDueDay || 1));
        if (draft.start) setUploadStartDate(draft.start);
        if (draft.end) setUploadEndDate(draft.end);
        if (draft.executionMode) setUploadExecutionMode(draft.executionMode);
        if (draft.initialAgreementName) setUploadFileName(draft.initialAgreementName);
        if (draft.initialAgreementUrl) setUploadFileData(draft.initialAgreementUrl);
        if (draft.requireTenantId) setUploadRequireIds(true);
        if (draft.requiredIdList && draft.requiredIdList.length > 0) {
          setUploadIdList(draft.requiredIdList);
        }
        setShowUploadAgreementModal(true);
        return;
      }
    }

    // New Draft / Clean
    setActiveDraftId(null);
    setWizardStep(targetStep || 1);
    setUploadTenantName('');
    setUploadTenantEmail('');
    setUploadTenantPhone('');
    setUploadTenantPassword('Welcome@123');
    setSelectedTenantObj(null);
    setIsNewTenantMode(false);
    setShowTenantDetailsEdit(false);
    setTenantSearchQuery('');
    setShowTenantDropdown(false);
    setUploadStartDate(getNextMonthFirstDateString());
    setUploadEndDate(getOneYearLaterDateString(getNextMonthFirstDateString()));
    setUploadRequireIds(false);
    setUploadIdList([{ id: 'req_1', name: 'Government Photo ID' }]);
    setUploadOfflineTenantIds({});
    const firstVacant = vacantUnits[0];
    if (firstVacant) {
      handleSelectUnitForUpload(firstVacant.id);
    } else if (myUnits[0]) {
      setUploadPropertyId(myUnits[0].propertyId || '');
      setUploadUnitId(myUnits[0].id);
      setUploadUnit(myUnits[0].unitNumber || myUnits[0].id);
      setUploadRent(String(myUnits[0].rent || ''));
      setUploadDeposit(String(myUnits[0].deposit || ''));
    }
    setShowUploadAgreementModal(true);
  };

  useEffect(() => {
    if (openOnboardSignal > 0) handleOpenDraftModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOnboardSignal]);

  const handleSaveDraft = async () => {
    const unitObj = myUnits.find((u) => (uploadUnitId ? u.id === uploadUnitId : (u.unitNumber === uploadUnit || u.id === uploadUnit)));
    const prop = myProperties.find((p) => p.id === (unitObj?.propertyId || uploadPropertyId)) || myProperties[0];
    const rentNum = parseFloat(uploadRent) || (unitObj?.rent || 0);
    const depNum = parseFloat(uploadDeposit) || (unitObj?.deposit || (rentNum > 0 ? rentNum * 2 : 0));
    const dueDayNum = parseInt(uploadDueDay, 10) || 1;
    const draftId = activeDraftId || `agr_draft_${Date.now()}`;

    const validIdList = uploadRequireIds
      ? uploadIdList.filter((item) => item.name.trim().length > 0)
      : [];

    const draftAg: MobileAgreement = {
      id: draftId,
      ownerId: prop?.ownerId || user?.id || ownerId,
      ownerName: user?.displayName || 'Property Owner',
      propertyId: prop?.id || uploadPropertyId || 'all',
      propertyName: prop?.name || (uploadPropertyId === 'all' ? 'All Properties' : 'Property'),
      unit: uploadUnit.trim() || 'Unassigned Unit',
      unitId: unitObj?.id || uploadUnitId || undefined,
      tenant: uploadTenantName.trim() || 'Unassigned Resident',
      tenantId: selectedTenantObj?.id || `draft_usr_${Date.now()}`,
      tenantEmail: uploadTenantEmail.trim() || undefined,
      tenantPhone: uploadTenantPhone.trim() || undefined,
      start: uploadStartDate,
      end: uploadEndDate,
      rent: rentNum,
      deposit: depNum,
      currency: prop?.currency || viewCurrency,
      dueDay: dueDayNum,
      escalationPercent: 8,
      lockInMonths: 11,
      noticePeriodDays: 30,
      status: 'draft',
      isDraft: true,
      draftStep: wizardStep,
      draftSavedAt: new Date().toISOString(),
      executionMode: uploadExecutionMode,
      initialAgreementName: uploadFileName || undefined,
      initialAgreementUrl: uploadFileData || undefined,
      requireTenantId: uploadRequireIds && validIdList.length > 0,
      requiredIdList: uploadRequireIds && validIdList.length > 0 ? validIdList : undefined,
      requiredIdTypes: uploadRequireIds && validIdList.length > 0 ? validIdList.map((i) => i.name.trim()) : undefined,
      requiredIdType: uploadRequireIds && validIdList.length > 0 ? validIdList[0].name.trim() : undefined,
      createdAt: new Date().toISOString(),
    };

    saveAgreement(draftAg);
    setShowUploadAgreementModal(false);
    setActiveDraftId(null);
    showToast('Lease draft saved successfully!', 'success');
  };

  const handleDeleteDraft = (draft: MobileAgreement) => {
    Alert.alert(
      'Delete Lease Draft',
      `Are you sure you want to delete this draft (${draft.id})? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAgreement(draft.id);
              showToast('Lease draft deleted', 'success');
            } catch (err: any) {
              showAlert({ title: 'Error', message: err?.message || 'Failed to delete draft', type: 'error' });
            }
          },
        },
      ]
    );
  };

  // ----------------------------------------------------
  // Dynamic Tenancy Requests / Applications
  // ----------------------------------------------------
  const displayedApplications = useMemo(() => {
    const list = myTenancyRequests;
    return list.filter((app) => {
      if (appFilter !== 'all' && app.status !== appFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          app.tenantName.toLowerCase().includes(q) ||
          app.propertyName.toLowerCase().includes(q) ||
          (app.unit && app.unit.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [myTenancyRequests, appFilter, search]);

  const handleApproveApplication = (app: MobileTenancyRequest) => {
    updateTenancyRequest(app.id, 'accepted');
    const newAg: MobileAgreement = {
      id: `AGR-${Date.now().toString().slice(-4)}`,
      ownerId: app.ownerId || user.id || 'owner-1',
      ownerName: app.ownerName || user.displayName || 'Property Landlord',
      propertyId: app.propertyId,
      propertyName: app.propertyName,
      unit: app.unit || '101',
      tenantId: app.tenantId || `TEN-${Date.now()}`,
      tenant: app.tenantName,
      tenantEmail: app.tenantEmail,
      tenantPhone: app.tenantPhone,
      rent: app.rent,
      deposit: app.deposit,
      currency: app.currency || viewCurrency,
      start: app.leaseStart || '2026-11-01',
      end: app.leaseEnd || '2027-10-31',
      escalationPercent: 8,
      lockInMonths: 11,
      noticePeriodDays: 30,
      status: 'awaiting_tenant_signature',
      executionMode: 'digital_dispatch',
      initialAgreementName: `Draft_Lease_${app.unit || '101'}.pdf`,
      initialAgreementUrl: `https://storage.propithub.app/agreements/draft_${app.id}.pdf`,
      createdAt: new Date().toISOString(),
    };
    addAgreement(newAg);
    Alert.alert(
      'Application Approved ✓',
      `Application for ${app.tenantName} approved! Draft Agreement #${newAg.id} generated and dispatched for tenant signature.`
    );
  };

  const handleDeclineApplication = (app: MobileTenancyRequest) => {
    updateTenancyRequest(app.id, 'declined');
    Alert.alert(
      'Application Declined',
      `Application for ${app.tenantName} declined. Notification dispatched to prospective resident.`
    );
  };

  // ----------------------------------------------------
  // Agreements List with Parity Filter Chips
  // ----------------------------------------------------
  const displayedAgreements = useMemo(() => {
    return myAgreements.filter((ag) => {
      // Exclude draft agreements from live agreements view
      if (ag.isDraft || ag.status === 'draft') return false;

      if (agreementFilter === 'active') {
        if (ag.status !== 'active') return false;
      } else if (agreementFilter === 'pending_approval') {
        if (ag.status !== 'pending_approval' && (ag as any).status !== 'awaiting_owner_signature') return false;
      } else if (agreementFilter === 'pending_deposit') {
        if (ag.status !== 'pending_deposit') return false;
      } else if (agreementFilter === 'awaiting_signature') {
        if (
          ag.status !== 'awaiting_tenant_signature' &&
          ag.status !== 'awaiting_tenant_upload'
        ) {
          return false;
        }
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          ag.tenant.toLowerCase().includes(q) ||
          ag.propertyName.toLowerCase().includes(q) ||
          ag.unit.toLowerCase().includes(q) ||
          ag.id.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [myAgreements, agreementFilter, search]);

  // ----------------------------------------------------
  // Renewals List (Web 1-to-1 Parity with Expiring Leases)
  // ----------------------------------------------------
  const myRenewals: MobileRenewalItem[] = useMemo(() => {
    if (!ownerId) return [];
    const list: MobileRenewalItem[] = (state.renewals || []).filter(
      (r) => (r as any).ownerId === ownerId || (r.propertyId && myPropertyIds.has(r.propertyId))
    );
    const registeredUnits = new Set(list.map((r) => `${r.propertyId || ''}_${r.unit}`));

    // Auto-populate active contracted agreements expiring within 90 days
    myAgreements.forEach((ag) => {
      if (ag.status === 'active' || ag.status === 'pending_deposit') {
        const renewalKey = `${ag.propertyId || ''}_${ag.unit}`;
        if (!registeredUnits.has(renewalKey)) {
          const effectiveEnd = ag.end || '2027-10-31';
          const daysLeft =
            effectiveEnd && !isNaN(new Date(effectiveEnd).getTime())
              ? Math.max(0, Math.ceil((new Date(effectiveEnd).getTime() - Date.now()) / (1000 * 3600 * 24)))
              : 60;

          list.push({
            id: `REN-${ag.propertyId ? ag.propertyId.slice(-6) + '-' : ''}${ag.unit}-${ag.id || Date.now().toString().slice(-4)}`,
            unit: ag.unit,
            tenant: ag.tenant,
            tenantId: ag.tenantId,
            ownerId: ag.ownerId,
            propertyId: ag.propertyId,
            propertyName: ag.propertyName,
            currentRent: ag.rent,
            percentageIncrease: ag.escalationPercent || 8,
            proposedRent: Math.round(ag.rent * (1 + (ag.escalationPercent || 8) / 100)),
            rentIncreaseAmount: Math.round(ag.rent * ((ag.escalationPercent || 8) / 100)),
            termMonths: 12,
            leaseEnd: effectiveEnd,
            daysLeft,
            status:
              ag.renewalProposal?.status === 'pending'
                ? 'renewal_offered'
                : ag.renewalProposal?.status === 'accepted'
                  ? 'accepted'
                  : 'pending_decision',
          });
          registeredUnits.add(renewalKey);
        }
      }
    });

    if (search.trim()) {
      const q = search.toLowerCase();
      return list.filter(
        (r) =>
          r.tenant.toLowerCase().includes(q) ||
          r.unit.toLowerCase().includes(q) ||
          (r.propertyName && r.propertyName.toLowerCase().includes(q))
      );
    }

    return list;
  }, [state.renewals, state.agreements, search]);

  // ----------------------------------------------------
  // Modal Open Handlers
  // ----------------------------------------------------
  const openRenewalModal = (unit: string, tenantName: string, rent: number, leaseEnd: string, currency?: string, propertyId?: string) => {
    const effectiveRent = rent || (unit ? (myUnits.find((u) => (!propertyId || u.propertyId === propertyId) && (u.unitNumber === unit || u.id === unit))?.rent || 0) : 0);
    const baseDate = leaseEnd ? new Date(leaseEnd) : new Date();
    let nextStartStr = '';
    let nextEndStr = '';
    if (!isNaN(baseDate.getTime())) {
      const nextDay = new Date(baseDate.getTime() + 86400000);
      nextStartStr = nextDay.toISOString().split('T')[0];
      const endObj = new Date(nextDay);
      endObj.setMonth(endObj.getMonth() + 12);
      nextEndStr = endObj.toISOString().split('T')[0];
    } else {
      nextStartStr = new Date().toISOString().split('T')[0];
      const endObj = new Date();
      endObj.setFullYear(endObj.getFullYear() + 1);
      nextEndStr = endObj.toISOString().split('T')[0];
    }

    setRenewalModalItem({
      unit,
      tenant: tenantName,
      currentRent: effectiveRent,
      leaseEnd: leaseEnd || nextStartStr,
      currency,
      propertyId,
    });
    setRenewalPercent(8);
    setRenewalDurationMonths(12);
    setRenewalStartDate(nextStartStr);
    setRenewalEndDate(nextEndStr);
    setRenewalOwnerNotes('');
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

  const handleConfirmSendRenewal = async () => {
    if (!renewalModalItem) return;
    const proposedRent = Math.round(renewalModalItem.currentRent * (1 + renewalPercent / 100));

    await offerLeaseRenewal(renewalModalItem.unit, {
      currentRent: renewalModalItem.currentRent,
      percentageIncrease: renewalPercent,
      proposedRent,
      termMonths: renewalDurationMonths,
      newLeaseStart: renewalStartDate,
      newLeaseEnd: renewalEndDate,
      ownerNotes: renewalOwnerNotes,
      ownerAgreementFileName: `Renewal_Agreement_Unit_${renewalModalItem.unit}.pdf`,
      ownerAgreementFileUrl: `https://storage.propithub.app/agreements/renewal_${renewalModalItem.unit}.pdf`,
      propertyId: renewalModalItem.propertyId,
    });

    setRenewalModalItem(null);
    Alert.alert(
      'Renewal Offer Dispatched ✓',
      `Renewal terms (+${renewalPercent}%: ${format(proposedRent, renewalModalItem.currency || viewCurrency)}/mo) dispatched to ${renewalModalItem.tenant} for Unit ${renewalModalItem.unit}.`
    );
  };

  const handleConfirmApproveRenewal = async (r: MobileRenewalItem) => {
    await approveLeaseRenewal(r.unit, r.propertyId);
    setInspectingSignedRenewal(null);
    Alert.alert(
      'Renewal Finalized & Active ✓',
      `Signed lease renewal for Unit ${r.unit} approved! Contract extended through ${r.newLeaseEnd || r.leaseEnd} at ${format(r.proposedRent || r.currentRent || 0, r.currency || viewCurrency)}/mo.`
    );
  };

  const handleApproveSignedLease = async (ag: MobileAgreement) => {
    try {
      const depInvId = await approveSignedAgreement(ag.id);
      setInspectingSignedAgreement(null);
      Alert.alert(
        'Lease Approved ✓',
        `Signed lease for Unit ${ag.unit} has been approved! Security deposit invoice #${depInvId} has been generated and dispatched to ${ag.tenant}.`
      );
    } catch (err) {
      Alert.alert('Approval Error', 'Failed to approve agreement. Please try again.');
    }
  };

  const handleRejectSignedLease = async () => {
    if (!inspectingSignedAgreement) return;
    if (!rejectReasonText.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for rejecting the uploaded lease.');
      return;
    }
    try {
      setIsRejecting(true);
      await rejectSignedAgreement(inspectingSignedAgreement.id, rejectReasonText.trim());
      setIsRejecting(false);
      setShowRejectModal(false);
      const targetUnit = inspectingSignedAgreement.unit;
      setInspectingSignedAgreement(null);
      setRejectReasonText('');
      Alert.alert(
        'Agreement Rejected',
        `The signed lease for Unit ${targetUnit} has been rejected. The resident has been notified to re-upload corrected documents.`
      );
    } catch (err) {
      setIsRejecting(false);
      Alert.alert('Rejection Error', 'Failed to reject agreement. Please try again.');
    }
  };

  // Web Parity: "+ Upload agreement" Handler
  const handleDirectUploadAgreement = () => {
    if (!uploadTenantName.trim() || !uploadUnit.trim() || !uploadRent.trim()) {
      showAlert({
        type: 'warning',
        title: 'Required Fields',
        message: 'Please enter Resident Full Name, Unit, and Monthly Rent to continue.',
        primaryButtonText: 'Review Form',
      });
      return;
    }
    const unitObj = myUnits.find((u) => (uploadUnitId ? u.id === uploadUnitId : (u.unitNumber === uploadUnit || u.id === uploadUnit)));
    const prop = myProperties.find((p) => p.id === (unitObj?.propertyId || uploadPropertyId)) || myProperties[0];
    const rentNum = parseFloat(uploadRent) || (unitObj?.rent || 0);
    const depNum = parseFloat(uploadDeposit) || (unitObj?.deposit || (rentNum > 0 ? rentNum * 2 : 0));
    const dueDayNum = parseInt(uploadDueDay, 10) || 1;
    const newAgId = `AG-${Date.now().toString().slice(-5)}`;
    const isOfflineMode = uploadExecutionMode === 'already_executed_offline';

    const validIdList = uploadRequireIds
      ? uploadIdList.filter((item) => item.name.trim().length > 0)
      : [];

    if (!isOfflineMode) {
      // Digital Dispatch Workflow (Web Parity):
      // Dispatches an official MobileTenancyRequest with attached agreement & ID requirements.
      const targetTenantId = selectedTenantObj?.id || `usr_${Date.now()}`;
      const newReq: MobileTenancyRequest = {
        id: `req_${Date.now()}`,
        ownerId: prop?.ownerId || user?.id || '',
        ownerName: user?.displayName || 'Property Owner',
        ownerEmail: user?.email || '',
        tenantId: targetTenantId,
        tenantName: uploadTenantName.trim(),
        tenantEmail: uploadTenantEmail.trim().toLowerCase() || `${uploadTenantName.trim().toLowerCase().replace(/\s+/g, '')}@tenant.com`,
        tenantPhone: uploadTenantPhone.trim(),
        propertyId: prop?.id || '',
        propertyName: prop?.name || 'Property',
        unitId: unitObj?.id || uploadUnit.trim(),
        unit: uploadUnit.trim(),
        unitNumber: unitObj?.unitNumber || uploadUnit.trim(),
        rent: rentNum,
        deposit: depNum,
        currency: prop?.currency || viewCurrency,
        leaseStart: uploadStartDate,
        leaseEnd: uploadEndDate,
        message: `Welcome to your new home at ${prop?.name || 'Property'}! Please review the attached lease agreement for Unit ${uploadUnit.trim()}, accept, sign physically, and upload your signed copy to finalize your move-in.`,
        agreementFileName: uploadFileName || 'Lease_Agreement.pdf',
        agreementFileData: uploadFileData || undefined,
        agreementFileUrl: uploadFileData || undefined,
        requireTenantId: uploadRequireIds && validIdList.length > 0,
        requiredIdList: uploadRequireIds && validIdList.length > 0 ? validIdList : undefined,
        requiredIdTypes: uploadRequireIds && validIdList.length > 0 ? validIdList.map((i) => i.name.trim()) : undefined,
        requiredIdType: uploadRequireIds && validIdList.length > 0 ? validIdList[0].name.trim() : undefined,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      sendTenancyRequest(newReq);
      if (unitObj) {
        saveUnit({
          ...unitObj,
          status: 'reserved',
          tenant: uploadTenantName.trim(),
          currentTenantId: targetTenantId,
          rent: rentNum,
          deposit: depNum,
        });
      }

      if (activeDraftId) {
        deleteAgreement(activeDraftId);
        setActiveDraftId(null);
      }

      setShowUploadAgreementModal(false);
      setUploadTenantName('');
      setUploadTenantEmail('');
      setUploadTenantPhone('');
      setUploadUnitId('');
      setUploadRequireIds(false);
      setUploadOfflineTenantIds({});

      showAlert({
        type: 'success',
        title: 'Tenancy Offer Dispatched',
        message: `Tenancy invitation with attached lease agreement dispatched to ${uploadTenantName.trim()} for Unit ${uploadUnit.trim()}.`,
        details: [
          { label: 'Resident', value: uploadTenantName.trim(), icon: 'user' },
          { label: 'Unit', value: `Unit ${uploadUnit.trim()}`, icon: 'home' },
          { label: 'Monthly Rent', value: `${format(Number(uploadRent) || 0, viewCurrency)}/mo`, icon: 'dollar-sign' },
          { label: 'Status', value: 'Unit Reserved Pending Acceptance', icon: 'shield' },
        ],
        primaryButtonText: 'Done',
      });
      return;
    }

    const offlineUploadedIds: MobileTenantUploadedIdItem[] = Object.entries(uploadOfflineTenantIds).map(([id, info]) => {
      const match = validIdList.find((item) => item.id === id);
      return {
        id: `u_${id}`,
        name: match?.name || 'ID Verification Document',
        fileUrl: info.fileUrl,
        fileName: info.fileName,
        uploadedAt: new Date().toISOString(),
      };
    });

    const newAg: MobileAgreement = {
      id: newAgId,
      ownerId: prop?.ownerId || user.id || '',
      ownerName: user.displayName || 'Property Owner',
      propertyId: prop?.id || '',
      propertyName: prop?.name || 'Property',
      unit: uploadUnit.trim(),
      tenant: uploadTenantName.trim(),
      tenantId: selectedTenantObj?.id || `TEN-${Date.now().toString().slice(-4)}`,
      tenantEmail: uploadTenantEmail.trim() || undefined,
      tenantPhone: uploadTenantPhone.trim() || undefined,
      start: uploadStartDate,
      end: uploadEndDate,
      rent: rentNum,
      deposit: depNum,
      currency: prop?.currency || viewCurrency,
      dueDay: dueDayNum,
      escalationPercent: 8,
      lockInMonths: 11,
      noticePeriodDays: 30,
      status: 'active',
      executionMode: uploadExecutionMode,
      initialAgreementName: uploadFileName,
      initialAgreementUrl: uploadFileData || undefined,
      signedDocumentName: uploadFileName,
      signedDocumentUrl: uploadFileData || undefined,
      depositStatus: offlineDepositCollected ? 'paid' : 'unpaid',
      autoRenew: uploadAutoRenew === 'On',
      requireTenantId: uploadRequireIds && validIdList.length > 0,
      requiredIdList: uploadRequireIds && validIdList.length > 0 ? validIdList : undefined,
      requiredIdTypes: uploadRequireIds && validIdList.length > 0 ? validIdList.map((i) => i.name.trim()) : undefined,
      requiredIdType: uploadRequireIds && validIdList.length > 0 ? validIdList[0].name.trim() : undefined,
      tenantUploadedIds: offlineUploadedIds.length > 0 ? offlineUploadedIds : undefined,
      tenantUploadedIdUrl: offlineUploadedIds.length > 0 ? offlineUploadedIds[0].fileUrl : undefined,
      tenantUploadedIdName: offlineUploadedIds.length > 0 ? offlineUploadedIds[0].fileName : undefined,
      tenantUploadedIdAt: offlineUploadedIds.length > 0 ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };

    addAgreement(newAg);
    if (unitObj) {
      saveUnit({
        ...unitObj,
        status: 'occupied',
        tenant: uploadTenantName.trim(),
        currentTenantId: newAg.tenantId,
        rent: rentNum,
        deposit: depNum,
      });
    }

    // Persist resident in state.tenants & Firestore directory
    saveTenant({
      id: newAg.tenantId,
      name: uploadTenantName.trim(),
      email: uploadTenantEmail.trim() || '',
      phone: uploadTenantPhone.trim() || '',
      unit: uploadUnit.trim(),
      ownerId: prop?.ownerId || user?.id || ownerId,
      propertyId: prop?.id || '',
      propertyName: prop?.name || 'Property',
      rent: rentNum,
      deposit: depNum,
      currency: prop?.currency || viewCurrency,
      leaseStart: uploadStartDate,
      leaseEnd: uploadEndDate,
      rating: 5,
      kycStatus: 'verified',
      status: 'active',
    });

    // Auto-generate first-month rent invoice (Web Parity)
    const invId = `INV-${Math.floor(1000 + Math.random() * 9000)}`;
    const newInvoice: MobileInvoice = {
      id: invId,
      ownerId: prop?.ownerId || user?.id || ownerId,
      propertyId: prop?.id || '',
      propertyName: prop?.name || 'Property',
      unitId: unitObj?.id || uploadUnit.trim(),
      unit: uploadUnit.trim(),
      tenant: uploadTenantName.trim(),
      tenantId: newAg.tenantId,
      amount: rentNum,
      tax: 0,
      total: rentNum,
      currency: prop?.currency || viewCurrency,
      due: uploadStartDate,
      issueDate: new Date().toISOString().split('T')[0],
      status: 'sent',
      type: 'rent',
      items: [
        {
          description: `First Month Rent for Unit ${uploadUnit.trim()}`,
          amount: rentNum,
          quantity: 1,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    try {
      saveInvoice(newInvoice);
    } catch (e) {
      console.warn('Invoice generation warning:', e);
    }

    if (activeDraftId) {
      deleteAgreement(activeDraftId);
      setActiveDraftId(null);
    }

    setShowUploadAgreementModal(false);
    setUploadTenantName('');
    setUploadTenantEmail('');
    setUploadTenantPhone('');
    setUploadUnitId('');
    setUploadRequireIds(false);
    setUploadOfflineTenantIds({});

    showAlert({
      type: 'success',
      title: 'Agreement Saved',
      message: `Executed offline agreement #${newAgId} successfully archived. Unit ${uploadUnit} is now marked Occupied.`,
      details: [
        { label: 'Agreement ID', value: `#${newAgId}`, icon: 'file-text' },
        { label: 'Unit', value: `Unit ${uploadUnit}`, icon: 'home' },
        { label: 'Status', value: 'Occupied', icon: 'check-circle' },
      ],
      primaryButtonText: 'Done',
    });
  };

  const handleConfirmTerminate = () => {
    if (!selectedTerminateAg) return;
    updateAgreement(selectedTerminateAg.id, { status: 'terminated' });
    setShowTerminateModal(false);
    Alert.alert(
      'Notice Formally Registered',
      `Unit ${selectedTerminateAg.unit} vacate scheduled for ${vacateDate}. Inspection checklist queued.`,
      [
        {
          text: 'Open Vacate Desk',
          onPress: () => onInitiateNoticePress?.(selectedTerminateAg.unit),
        },
        { text: 'Done' },
      ]
    );
    setSelectedTerminateAg(null);
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


  return (
    <SafeAreaView
      style={
        modalOnly
          ? { position: 'absolute', width: 0, height: 0, overflow: 'hidden' }
          : [styles.safeArea, { backgroundColor: colors.background }]
      }
      pointerEvents={modalOnly ? 'box-none' : 'auto'}
    >
      {!modalOnly && (<>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Header */}
      <Header
        title="Leasing Hub"
        onNotificationPress={() => { }}
        onProfilePress={onProfilePress}
      />

      <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Subtab Pill Chips */}
          <TourTarget id="leasing-subtabs">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabContainer}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            >
              {/* Leases */}
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'agreements' && styles.tabButtonActive]}
                onPress={() => setActiveTab('agreements')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'agreements' && styles.tabTextActive]}>
                  Leases
                </Text>
              </TouchableOpacity>

              {/* Renewals */}
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'renewals' && styles.tabButtonActive]}
                onPress={() => setActiveTab('renewals')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={[styles.tabText, activeTab === 'renewals' && styles.tabTextActive]}>
                    Renewals
                  </Text>
                  {myRenewals.length > 0 && (
                    <View
                      style={{
                        backgroundColor: activeTab === 'renewals' ? 'rgba(255,255,255,0.3)' : colors.inkSoft,
                        borderRadius: 10,
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>
                        {myRenewals.length}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              {/* Lease Templates */}
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'library' && styles.tabButtonActive]}
                onPress={() => setActiveTab('library')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'library' && styles.tabTextActive]}>
                  Lease Templates ({myTemplates.length})
                </Text>
              </TouchableOpacity>

              {/* Drafts */}
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'drafts' && styles.tabButtonActive]}
                onPress={() => setActiveTab('drafts')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'drafts' && styles.tabTextActive]}>
                  Drafts ({myDrafts.length})
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </TourTarget>

          {/* Tenant Limit Warning Banner (Web Parity) */}
          {isTenantLimitReached && (
            <View style={styles.limitWarningBanner}>
              <Feather name="alert-triangle" size={16} color="#D97706" style={{ marginTop: 2, marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.limitWarningTitle}>
                  Tenant limit reached ({state.tenants.length}/{maxTenants} on {currentPlanName} tier)
                </Text>
                <Text style={styles.limitWarningSub}>
                  Upgrade your plan to add more tenancies and automated agreements.
                </Text>
              </View>
            </View>
          )}

          {/* Search Box */}
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Feather name="search" size={16} color={colors.inkSoft} />
            <TextInput
              style={[styles.searchInput, { color: colors.navy }]}
              value={search}
              onChangeText={setSearch}
              placeholder={
                activeTab === 'library'
                  ? 'Search agreement title or property...'
                  : activeTab === 'applications'
                    ? 'Search applicant or unit...'
                    : activeTab === 'renewals'
                      ? 'Search renewal or unit...'
                      : activeTab === 'drafts'
                        ? 'Search draft resident or unit...'
                        : 'Search tenant or unit...'
              }
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
              </TouchableOpacity>
            )}
          </View>

          {/* SubTab 1: Agreements Header & Filter Chips (1-to-1 Web Parity) */}
          {activeTab === 'agreements' && (
            <View>
              {/* Web Parity Panel Head: Hint on left, "+ Upload" brass button on right */}
              <TourTarget id="leasing-issue-btn" style={styles.metaRow}>
                <Text style={styles.metaHint} numberOfLines={1}>
                  {displayedAgreements.length} leases on file
                </Text>
                <TouchableOpacity
                  style={styles.headerUploadBtn}
                  onPress={() => handleOpenDraftModal()}
                  activeOpacity={0.85}
                >
                  <Text style={styles.headerUploadBtnText}>+ New Lease</Text>
                </TouchableOpacity>
              </TourTarget>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipScroll}>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'active', label: 'Active' },
                  { key: 'pending_approval', label: 'Pending' },
                  { key: 'pending_deposit', label: 'Deposit Due' },
                  { key: 'awaiting_signature', label: 'Signing' },
                ].map((item) => {
                  const isSelected = agreementFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.filterChip, { backgroundColor: colors.surface, borderColor: colors.line }, isSelected && styles.filterChipActive]}
                      onPress={() => setAgreementFilter(item.key as any)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.filterText, { color: colors.inkSoft }, isSelected && styles.filterTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* SubTab 3: Applications Filter Chips */}
          {activeTab === 'applications' && (
            <View style={styles.filterRow}>
              {(['all', 'pending', 'accepted', 'declined'] as const).map((item) => {
                const isSelected = appFilter === item;
                const label =
                  item === 'all'
                    ? 'All'
                    : item === 'pending'
                      ? 'Pending'
                      : item === 'accepted'
                        ? 'Approved'
                        : 'Declined';

                return (
                  <TouchableOpacity
                    key={item}
                    style={[styles.filterChip, { backgroundColor: colors.surface, borderColor: colors.line }, isSelected && styles.filterChipActive]}
                    onPress={() => setAppFilter(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterText, { color: colors.inkSoft }, isSelected && styles.filterTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ==================================================== */}
          {/* SUBTAB 1: AGREEMENTS & DOCUMENTS                     */}
          {/* ==================================================== */}
          {activeTab === 'agreements' && (
            displayedAgreements.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Feather name="file-text" size={32} color={colors.inkSoft} />
                <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Agreements Found</Text>
                <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                  No legal tenancy agreements match your active filter. Use "Create Lease" to record a lease agreement.
                </Text>
              </View>
            ) : (
              displayedAgreements.map((ag) => {
                const isActive = ag.status === 'active';
                const isPendingApproval = ag.status === 'pending_approval' || (ag as any).status === 'awaiting_owner_signature';
                const isPendingDeposit = ag.status === 'pending_deposit';
                const isAwaitingTenant =
                  ag.status === 'awaiting_tenant_signature' || ag.status === 'awaiting_tenant_upload';

                return (
                  <View key={ag.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    {/* Header */}
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[styles.unitName, { color: colors.navy }]} numberOfLines={1}>
                          {ag.propertyName?.trim() ? `${ag.propertyName.trim()} • Unit ${ag.unit}` : `Unit ${ag.unit}`}
                        </Text>
                        <Text style={styles.agreementCode}>AGREEMENT #{ag.id}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View
                          style={[
                            styles.statusBadge,
                            isActive && styles.activeBadge,
                            isPendingApproval && { backgroundColor: '#FEF3C7' },
                            isPendingDeposit && { backgroundColor: '#EFF6FF' },
                            isAwaitingTenant && styles.pendingBadge,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isActive && styles.activeBadgeText,
                              isPendingApproval && { color: '#D97706', fontWeight: '700' },
                              isPendingDeposit && { color: '#2563EB', fontWeight: '700' },
                              isAwaitingTenant && styles.pendingBadgeText,
                            ]}
                          >
                            {isActive
                              ? 'ACTIVE'
                              : isPendingApproval
                                ? 'PENDING APPROVAL'
                                : isPendingDeposit
                                  ? 'DEPOSIT PENDING'
                                  : isAwaitingTenant
                                    ? 'AWAITING RESIDENT'
                                    : ag.status.replace(/_/g, ' ').toUpperCase()}
                          </Text>
                        </View>
                        {isAwaitingTenant && (
                          <Text style={styles.stepBadgeSubtext}>
                            Step 2: Ink Sign
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Resident & Term Info Grid */}
                    <View style={styles.agreementGrid}>
                      <View style={styles.agGridRow}>
                        <View style={styles.agGridCol}>
                          <Text style={styles.agGridLabel}>RESIDENT</Text>
                          <Text style={styles.agGridValBold} numberOfLines={1}>{ag.tenant}</Text>
                          {(ag.tenantEmail || ag.tenantPhone) && (
                            <Text style={styles.agGridSub} numberOfLines={1}>{ag.tenantPhone || ag.tenantEmail}</Text>
                          )}
                        </View>
                        <View style={styles.agGridCol}>
                          <Text style={styles.agGridLabel}>MONTHLY RENT</Text>
                          <Text style={[styles.agGridValBold, { color: '#059669' }]}>
                            {format(ag.rent, ag.currency || viewCurrency)}/mo
                          </Text>
                          <Text style={styles.agGridSub}>Due on Day {ag.dueDay || 1}</Text>
                        </View>
                      </View>

                      <View style={[styles.agGridRow, { marginTop: 8 }]}>
                        <View style={styles.agGridCol}>
                          <Text style={styles.agGridLabel}>CONTRACT PERIOD</Text>
                          <Text style={styles.agGridVal} numberOfLines={1}>
                            {ag.start} → {ag.end}
                          </Text>
                        </View>
                        <View style={styles.agGridCol}>
                          <Text style={styles.agGridLabel}>SECURITY DEPOSIT</Text>
                          <Text style={styles.agGridVal}>
                            {format(ag.deposit || 0, ag.currency || viewCurrency)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Document Repository Strip */}
                    <View style={styles.docRepositoryStrip}>
                      <View style={styles.docBadge}>
                        <Feather name="file-text" size={13} color="#D97706" style={{ marginRight: 6 }} />
                        <Text style={styles.docBadgeText} numberOfLines={1} ellipsizeMode="middle">
                          {ag.initialAgreementName || 'Executed_Agreement.pdf'}
                        </Text>
                        <Feather name="external-link" size={12} color="#D97706" style={{ marginLeft: 4 }} />
                      </View>
                      {ag.signedDocumentName || ag.signedDocumentUrl ? (
                        <TouchableOpacity
                          style={styles.docBadgeSigned}
                          onPress={() => setInspectingSignedAgreement(ag)}
                          activeOpacity={0.8}
                        >
                          <Feather name="check-circle" size={13} color="#059669" style={{ marginRight: 6 }} />
                          <Text style={styles.docBadgeSignedText} numberOfLines={1} ellipsizeMode="middle">
                            {ag.signedDocumentName || 'Resident Signed Copy ✓'}
                          </Text>
                          <Feather name="external-link" size={12} color="#059669" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {/* Pending Approval Callout Strip */}
                    {isPendingApproval && (
                      <View style={styles.approvalRequiredBox}>
                        <View style={styles.approvalRequiredHeader}>
                          <Feather name="file-text" size={14} color="#D97706" />
                          <Text style={styles.approvalRequiredTitle}>Resident Uploaded Signed Lease</Text>
                        </View>
                        <Text style={styles.approvalRequiredFile}>
                          File: {ag.signedDocumentName || 'Executed_Tenancy_Lease.pdf'}
                        </Text>
                        <TouchableOpacity
                          style={styles.approveLeaseBtn}
                          onPress={() => setInspectingSignedAgreement(ag)}
                          activeOpacity={0.85}
                        >
                          <Feather name="check-circle" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.approveLeaseBtnText}>Review</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Deposit Pending Callout Strip */}
                    {isPendingDeposit && (
                      <View style={styles.depositPendingBox}>
                        <Feather name="clock" size={14} color="#2563EB" />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={styles.depositPendingTitle}>Awaiting Move-In Security Deposit</Text>
                          <Text style={styles.depositPendingSub}>
                            Invoice #{ag.depositInvoiceId || `INV-DEP-${ag.id}`} • {format(ag.deposit || 0, ag.currency || viewCurrency)} • Automatically activates once paid.
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Action Buttons Row */}
                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        style={styles.detailsActionBtn}
                        onPress={() => setViewingAgreement(ag)}
                        activeOpacity={0.8}
                      >
                        <Feather name="eye" size={13} color="#475569" />
                        <Text style={styles.detailsActionText}>View</Text>
                      </TouchableOpacity>

                      {isActive && (
                        <TouchableOpacity
                          style={styles.renewalActionBtn}
                          onPress={() => openRenewalModal(ag.unit, ag.tenant, ag.rent, ag.end, ag.currency, ag.propertyId)}
                          activeOpacity={0.8}
                        >
                          <Feather name="calendar" size={13} color="#2563EB" />
                          <Text style={styles.renewalActionText}>Renew</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.noticeActionBtn}
                        onPress={() => {
                          setSelectedTerminateAg(ag);
                          setShowTerminateModal(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <Feather name="log-out" size={13} color="#DC2626" />
                        <Text style={styles.noticeActionText}>Send Notice</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )
          )}

          {/* ==================================================== */}
          {/* SUBTAB 2: LEASE RENEWALS (Web 1-to-1 Parity)         */}
          {/* ==================================================== */}
          {activeTab === 'renewals' && (
            <View>
              {/* Web Banner Notice */}
              <View style={styles.renewalNoticeBanner}>
                <Feather name="info" size={15} color="#2563EB" style={{ marginRight: 8, marginTop: 1 }} />
                <Text style={styles.renewalNoticeText}>
                  Propithub flags leases 60 and 30 days before expiry automatically. Offer early renewal terms with dynamic rent escalation.
                </Text>
              </View>

              {myRenewals.length === 0 ? (
                <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <Feather name="calendar" size={32} color={colors.inkSoft} />
                  <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Renewals Due</Text>
                  <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                    No active lease renewals on record. Expiring tenancies will automatically appear here.
                  </Text>
                </View>
              ) : (
                myRenewals.map((r) => {
                  const isAccepted = r.status === 'accepted' || r.status === 'auto_renew_set';
                  const isSignedByTenant = r.status === 'signed_by_tenant';
                  const isRenewalOffered = r.status === 'renewal_offered';
                  const isDeclined = r.status === 'rejected';
                  const isRequested = r.status === 'renewal_requested';

                  return (
                    <View key={r.id || `${r.propertyId || ''}_${r.unit}`} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                      <View style={styles.cardHeader}>
                        <View>
                          <Text style={[styles.unitNameBold, { color: colors.navy }]}>Unit {r.unit}</Text>
                          <Text style={[styles.tenantSub, { color: colors.inkSoft }]}>{r.tenant}</Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            isAccepted && styles.activeBadge,
                            isSignedByTenant && { backgroundColor: '#FEF3C7' },
                            isRenewalOffered && { backgroundColor: '#EFF6FF' },
                            isDeclined && { backgroundColor: '#FEE2E2' },
                            isRequested && { backgroundColor: '#FEF3C7' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isAccepted && styles.activeBadgeText,
                              isSignedByTenant && { color: '#D97706', fontWeight: '700' },
                              isRenewalOffered && { color: '#2563EB', fontWeight: '700' },
                              isDeclined && { color: '#DC2626' },
                              isRequested && { color: '#D97706', fontWeight: '700' },
                            ]}
                          >
                            {isAccepted
                              ? 'LEASE RENEWED & ACTIVE'
                              : isSignedByTenant
                                ? 'SIGNED BY RESIDENT — REVIEW'
                                : isRenewalOffered
                                  ? `RENEWAL OFFERED (+${r.percentageIncrease || 8}%)`
                                  : isDeclined
                                    ? 'DECLINED BY RESIDENT'
                                    : isRequested
                                      ? 'RENEWAL REQUESTED'
                                      : 'AWAITING DECISION'}
                          </Text>
                        </View>
                      </View>

                      {/* 2-Box Countdown Grid (Web Parity) */}
                      <View style={styles.renewalTwoBoxGrid}>
                        <View style={styles.renewalBox}>
                          <Text style={styles.renewalBoxLabel}>Lease Ends</Text>
                          <Text style={styles.renewalBoxVal}>{r.leaseEnd}</Text>
                        </View>
                        <View style={styles.renewalBox}>
                          <Text style={styles.renewalBoxLabel}>Days Left</Text>
                          <Text
                            style={[
                              styles.renewalBoxVal,
                              { color: r.daysLeft <= 30 ? '#DC2626' : r.daysLeft <= 60 ? '#D97706' : '#059669' },
                            ]}
                          >
                            {r.daysLeft} days
                          </Text>
                        </View>
                      </View>

                      {/* Proposed Rent Terms Strip */}
                      {(isRenewalOffered || isAccepted || isSignedByTenant) && (
                        <View style={styles.termsSnippetStrip}>
                          <Text style={styles.termsSnippetText}>
                            Current: {format(r.currentRent || 25000, r.currency || viewCurrency)}/mo → Proposed:{' '}
                            <Text style={{ fontWeight: '700', color: '#059669' }}>
                              {format(r.proposedRent || Math.round((r.currentRent || 25000) * 1.08), r.currency || viewCurrency)}/mo
                            </Text>{' '}
                            (+{r.percentageIncrease || 8}%)
                          </Text>
                        </View>
                      )}

                      {/* Action Buttons */}
                      {isAccepted ? (
                        <View style={styles.renewalActionRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Feather name="check-circle" size={14} color="#059669" style={{ marginRight: 5 }} />
                            <Text style={styles.activeRenewalText}>Active Renewal</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.offerNextTermBtn}
                            onPress={() =>
                              openRenewalModal(
                                r.unit,
                                r.tenant,
                                r.proposedRent || r.currentRent || 25000,
                                r.newLeaseEnd || r.leaseEnd,
                                r.currency,
                                r.propertyId
                              )
                            }
                            activeOpacity={0.8}
                          >
                            <Text style={styles.offerNextTermBtnText}>Offer Next Term</Text>
                          </TouchableOpacity>
                        </View>
                      ) : isSignedByTenant ? (
                        <TouchableOpacity
                          style={styles.reviewSignedRenewalBtn}
                          onPress={() => setInspectingSignedRenewal(r)}
                          activeOpacity={0.85}
                        >
                          <Feather name="check-circle" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.reviewSignedRenewalBtnText}>Review</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.offerRenewalCTA}
                          onPress={() =>
                            openRenewalModal(
                              r.unit,
                              r.tenant,
                              r.currentRent || 25000,
                              r.leaseEnd,
                              r.currency,
                              r.propertyId
                            )
                          }
                          activeOpacity={0.85}
                        >
                          <Feather name="send" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.offerRenewalCTAText}>
                            {isRenewalOffered
                              ? 'Update Offer'
                              : isDeclined
                                ? 'Re-propose Offer'
                                : isRequested
                                  ? 'Review & Offer'
                                  : 'Offer Renewal'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ==================================================== */}
          {/* SUBTAB 3: APPLICATIONS / TENANCY REQUESTS            */}
          {/* ==================================================== */}
          {activeTab === 'applications' && (
            displayedApplications.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Feather name="user-check" size={32} color={colors.inkSoft} />
                <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Prospective Applications</Text>
                <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                  No rental applications match the current status filter.
                </Text>
              </View>
            ) : (
              displayedApplications.map((app) => {
                const isPending = app.status === 'pending';
                const isAccepted = app.status === 'accepted';
                const isDeclined = app.status === 'declined';

                return (
                  <View key={app.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <View style={styles.cardHeader}>
                      <View>
                        <Text style={styles.agreementCode}>APPLICATION #{app.id}</Text>
                        <Text style={[styles.applicantNameTitle, { color: colors.navy }]}>{app.tenantName}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          isAccepted && styles.activeBadge,
                          isPending && styles.pendingBadge,
                          isDeclined && { backgroundColor: '#FEE2E2' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            isAccepted && styles.activeBadgeText,
                            isPending && styles.pendingBadgeText,
                            isDeclined && { color: '#DC2626' },
                          ]}
                        >
                          {app.status === 'accepted' ? 'APPROVED' : app.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {/* Trust & Screening Badges Strip */}
                    <View style={styles.screeningBadgesRow}>
                      <View style={styles.trustScoreBadge}>
                        <Feather name="shield" size={12} color="#059669" style={{ marginRight: 4 }} />
                        <Text style={styles.trustScoreText}>Credit Score: 780 (Excellent)</Text>
                      </View>
                      <View style={styles.kycVerifiedBadge}>
                        <Feather name="check" size={11} color="#2563EB" style={{ marginRight: 3 }} />
                        <Text style={styles.kycVerifiedText}>ID & Income Verified</Text>
                      </View>
                    </View>

                    {/* Applicant Profile Grid */}
                    <View style={styles.applicantGrid}>
                      <View style={styles.applicantGridCol}>
                        <Text style={styles.appGridLabel}>Requested Unit</Text>
                        <Text style={styles.appGridVal}>{app.propertyName} • Unit {app.unit}</Text>
                      </View>
                      <View style={styles.applicantGridCol}>
                        <Text style={styles.appGridLabel}>Proposed Monthly Rent</Text>
                        <Text style={[styles.appGridVal, { color: '#059669' }]}>
                          {format(app.rent, app.currency || viewCurrency)}/mo
                        </Text>
                      </View>
                      <View style={styles.applicantGridCol}>
                        <Text style={styles.appGridLabel}>Target Move-In Date</Text>
                        <Text style={styles.appGridVal}>{app.leaseStart}</Text>
                      </View>
                      <View style={styles.applicantGridCol}>
                        <Text style={styles.appGridLabel}>Applicant Contact</Text>
                        <Text style={styles.appGridVal}>{app.tenantPhone} • {app.tenantEmail}</Text>
                      </View>
                    </View>

                    {/* Applicant Note */}
                    <View style={styles.appNoteBox}>
                      <Text style={styles.appNoteLabel}>APPLICANT STATEMENT & EMPLOYMENT:</Text>
                      <Text style={styles.appNoteText}>{app.message}</Text>
                    </View>

                    {/* Action Buttons */}
                    {isPending ? (
                      <View style={styles.appActionRow}>
                        <TouchableOpacity
                          style={styles.declineAppBtn}
                          onPress={() => handleDeclineApplication(app)}
                          activeOpacity={0.8}
                        >
                          <Feather name="x" size={14} color="#DC2626" style={{ marginRight: 4 }} />
                          <Text style={styles.declineAppBtnText}>Decline</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.approveAppBtn}
                          onPress={() => handleApproveApplication(app)}
                          activeOpacity={0.85}
                        >
                          <Feather name="check" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text style={styles.approveAppBtnText}>Approve</Text>
                        </TouchableOpacity>
                      </View>
                    ) : isAccepted ? (
                      <View style={styles.appSettledRow}>
                        <Feather name="check-circle" size={15} color="#059669" style={{ marginRight: 6 }} />
                        <Text style={styles.appSettledText}>
                          Lease dispatched. Awaiting resident signature.
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.appSettledRow, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
                        <Feather name="x-circle" size={15} color="#DC2626" style={{ marginRight: 6 }} />
                        <Text style={[styles.appSettledText, { color: '#B91C1C' }]}>
                          Application archived as declined.
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )
          )}

          {/* ==================================================== */}
          {/* SUBTAB 4: AGREEMENT LIBRARY                          */}
          {/* ==================================================== */}
          {activeTab === 'library' && (
            <View>
              {/* Panel Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                  paddingHorizontal: 2,
                }}
              >
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.navy }}>
                    Agreement Library ({filteredTemplates.length})
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.inkSoft, marginTop: 1 }} numberOfLines={1}>
                    Reusable legal templates & contracts
                  </Text>
                </View>

                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: isDark ? '#059669' : '#10B981',
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 8,
                    shadowColor: '#059669',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.15,
                    shadowRadius: 3,
                    elevation: 2,
                  }}
                  onPress={() => {
                    setTemplateTitle('');
                    setTemplatePropertyId('all');
                    setTemplateFileName('');
                    setTemplateFileData(null);
                    setTemplateFileSize(null);
                    setShowUploadTemplateModal(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Feather name="upload" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>+ Upload Doc</Text>
                </TouchableOpacity>
              </View>

              {/* Templates List */}
              {filteredTemplates.length === 0 ? (
                <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <Feather name="folder" size={34} color={colors.inkSoft} />
                  <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Agreements Found</Text>
                  <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                    No agreements or templates match your search. Upload standalone agreements to access and dispatch them anytime.
                  </Text>
                  <TouchableOpacity
                    style={{
                      marginTop: 14,
                      backgroundColor: '#10B981',
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                    onPress={() => setShowUploadTemplateModal(true)}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>+ Upload Document</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                filteredTemplates.map((tmpl) => {
                  const isAdmin = (user?.role as any) === 'superadmin' || (user?.role as any) === 'admin';
                  const isOwner = tmpl.ownerId === ownerId;
                  const canDelete = isAdmin || isOwner;

                  return (
                    <View
                      key={tmpl.id}
                      style={[
                        styles.card,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.line,
                          padding: 12,
                          marginBottom: 10,
                        },
                      ]}
                    >
                      {/* Top Header Row */}
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 8,
                            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10,
                          }}
                        >
                          <Feather name="file-text" size={18} color={isDark ? '#34D399' : '#059669'} />
                        </View>

                        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                          <Text
                            style={{ fontSize: 13.5, fontWeight: '700', color: colors.navy }}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {tmpl.title}
                          </Text>
                          <Text
                            style={{ fontSize: 11, color: colors.inkSoft, marginTop: 1 }}
                            numberOfLines={1}
                            ellipsizeMode="middle"
                          >
                            {tmpl.fileName || 'Rental_Agreement.pdf'} • {tmpl.fileSizeKb || 450} KB
                          </Text>
                        </View>

                        <View
                          style={{
                            backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                            alignSelf: 'flex-start',
                            maxWidth: 110,
                          }}
                        >
                          <Text
                            style={{ fontSize: 10, fontWeight: '600', color: colors.inkSoft }}
                            numberOfLines={1}
                          >
                            {tmpl.propertyName || 'All Properties'}
                          </Text>
                        </View>
                      </View>

                      {/* Divider */}
                      <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 10 }} />

                      {/* Bottom Info & Action Bar */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, marginRight: 6 }}>
                          <Feather name="calendar" size={12} color={colors.inkSoft} />
                          <Text style={{ fontSize: 10.5, color: colors.inkSoft }} numberOfLines={1}>
                            {tmpl.uploadedAt ? tmpl.uploadedAt.split('T')[0] : 'Active'}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {/* Preview / View */}
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
                              borderWidth: 1,
                              borderColor: colors.line,
                              paddingHorizontal: 9,
                              paddingVertical: 5,
                              borderRadius: 6,
                            }}
                            onPress={() => {
                              setPreviewDoc({
                                fileName: tmpl.fileName || `${tmpl.title}.pdf`,
                                fileUrl: tmpl.fileData,
                                title: tmpl.title,
                                docType: 'agreement_template',
                              });
                            }}
                            activeOpacity={0.7}
                          >
                            <Feather name="eye" size={12} color={colors.navy} />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.navy }}>View</Text>
                          </TouchableOpacity>

                          {/* Download */}
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                              borderWidth: 1,
                              borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
                              paddingHorizontal: 9,
                              paddingVertical: 5,
                              borderRadius: 6,
                            }}
                            onPress={async () => {
                              showToast('Starting document download...', 'info');
                              const ok = await downloadDocument({
                                fileName: tmpl.fileName || `${tmpl.title}.pdf`,
                                fileUrl: tmpl.fileData,
                                title: tmpl.title,
                                docType: 'agreement_template',
                              });
                              if (ok) {
                                showToast('Saved to device', 'success');
                              }
                            }}
                            activeOpacity={0.7}
                          >
                            <Feather name="download" size={12} color="#059669" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>Save</Text>
                          </TouchableOpacity>

                          {/* Delete (Owner or Admin) */}
                          {canDelete && (
                            <TouchableOpacity
                              style={{
                                width: 28,
                                height: 28,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 6,
                                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
                              }}
                              onPress={() => handleDeleteTemplate(tmpl)}
                              activeOpacity={0.7}
                            >
                              <Feather name="trash-2" size={13} color="#DC2626" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ==================================================== */}
          {/* SUBTAB 5: DRAFTS (Web 1-to-1 Parity)                  */}
          {/* ==================================================== */}
          {activeTab === 'drafts' && (
            <View>
              {/* Header Strip with + New Draft */}
              <View style={styles.metaRow}>
                <Text style={styles.metaHint} numberOfLines={1}>
                  Drafts ({displayedDrafts.length})
                </Text>
                <TouchableOpacity
                  style={[styles.headerUploadBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleOpenDraftModal()}
                  activeOpacity={0.85}
                >
                  <Feather name="plus" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.headerUploadBtnText}>New Draft</Text>
                </TouchableOpacity>
              </View>

              {displayedDrafts.length === 0 ? (
                <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <Feather name="bookmark" size={32} color={colors.primary} style={{ opacity: 0.8 }} />
                  <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Draft Leases</Text>
                  <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                    You have no in-progress drafts. Create a draft ahead of time for any unit and assign it to an applicant when ready.
                  </Text>
                </View>
              ) : (
                displayedDrafts.map((d) => {
                  const hasTenant = Boolean(d.tenant && d.tenant !== 'Unassigned Resident' && d.tenant.trim());
                  const hasUnit = Boolean(d.unit && d.unit !== 'Unassigned Unit' && d.unit !== 'Unassigned' && d.unit.trim());
                  const propName = d.propertyName && d.propertyName !== 'Unassigned Property'
                    ? d.propertyName
                    : (myProperties.find((p) => p.id === d.propertyId)?.name || '');
                  const cleanFileName = d.initialAgreementName && d.initialAgreementName !== 'Lease_Agreement.pdf' ? d.initialAgreementName.replace(/\.[^/.]+$/, '') : '';

                  const agreementTitle = cleanFileName
                    ? cleanFileName
                    : hasTenant && hasUnit
                    ? `Lease Agreement — ${d.tenant} (Unit ${d.unit})`
                    : hasTenant
                    ? `Lease Agreement — ${d.tenant}`
                    : hasUnit
                    ? `Lease Draft — Unit ${d.unit}${propName ? ` (${propName})` : ''}`
                    : 'New Lease Draft';

                  const shortDraftId = d.id.startsWith('agr_draft_')
                    ? `DFT-${d.id.slice(-6)}`
                    : d.id.length > 16
                    ? `DFT-${d.id.slice(-6)}`
                    : d.id;

                  const hasDoc = Boolean(d.initialAgreementUrl || (d.initialAgreementName && d.initialAgreementName !== 'Lease_Agreement.pdf'));

                  return (
                    <View key={d.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                      {/* Card Header */}
                      <View style={styles.cardHeader}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.navy }}>{agreementTitle}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <View style={{ backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9', borderWidth: 1, borderColor: colors.line, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: '700', color: colors.inkSoft }}>{shortDraftId}</Text>
                            </View>
                            <Text style={{ fontSize: 11, color: colors.inkSoft }}>
                              {d.executionMode === 'already_executed_offline' ? 'Paper Lease' : 'Digital Offer'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FCD34D', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Feather name="bookmark" size={11} color="#92400E" />
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#92400E' }}>Step {d.draftStep || 1} of 3</Text>
                        </View>
                      </View>

                      {/* Details Box */}
                      <View style={{ backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC', borderRadius: 8, padding: 10, marginVertical: 8, gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10.5, color: colors.inkSoft }}>Unit & Property</Text>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: hasUnit ? colors.navy : colors.inkSoft, fontStyle: hasUnit ? 'normal' : 'italic' }}>
                              {hasUnit ? `Unit ${d.unit} • ${propName || 'Property'}` : 'Pending Unit (Step 2)'}
                            </Text>
                          </View>
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 10.5, color: colors.inkSoft }}>Target Resident</Text>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: hasTenant ? colors.navy : colors.inkSoft, fontStyle: hasTenant ? 'normal' : 'italic' }}>
                              {hasTenant ? d.tenant : 'Pending Resident (Step 1)'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 6 }}>
                          <View>
                            <Text style={{ fontSize: 10.5, color: colors.inkSoft }}>Rent & Term</Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy }}>
                              {d.rent ? `${format(d.rent, d.currency || viewCurrency)}/mo` : 'Rent pending'}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 10.5, color: colors.inkSoft }}>Attached Document</Text>
                            <Text style={{ fontSize: 11, color: hasDoc ? '#059669' : colors.inkSoft, fontStyle: hasDoc ? 'normal' : 'italic' }}>
                              {hasDoc ? (d.initialAgreementName || 'Attached PDF ✓') : 'Pending upload (Step 3)'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Action Buttons Row */}
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                        <TouchableOpacity
                          style={{ flex: 1.4, backgroundColor: '#D97706', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                          onPress={() => handleOpenDraftModal(d.id, 1)}
                          activeOpacity={0.8}
                        >
                          <Feather name="user-check" size={13} color="#FFFFFF" />
                          <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' }}>Assign & Issue</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ flex: 1, backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9', borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => handleOpenDraftModal(d.id, d.draftStep || 1)}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.navy }}>Edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ width: 36, height: 36, backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2', borderWidth: 1, borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => handleDeleteDraft(d)}
                          activeOpacity={0.7}
                        >
                          <Feather name="trash-2" size={14} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </View>
      </>)}

      {/* ==================================================== */}
      {/* MODAL 1: VIEW AGREEMENT DETAILS MODAL (Web Parity)   */}
      {/* ==================================================== */}
      <Modal visible={!!viewingAgreement} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '90%', backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Agreement #{viewingAgreement?.id}</Text>
                <Text style={[styles.modalSub, { color: colors.inkSoft }]}>
                  {viewingAgreement?.propertyName} • Unit {viewingAgreement?.unit}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setViewingAgreement(null)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>RESIDENT & TENANCY</Text>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Resident Name:</Text>
                  <Text style={styles.detailsVal}>{viewingAgreement?.tenant}</Text>
                </View>
                {viewingAgreement?.tenantEmail && (
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>Email:</Text>
                    <Text style={styles.detailsVal}>{viewingAgreement.tenantEmail}</Text>
                  </View>
                )}
                {viewingAgreement?.tenantPhone && (
                  <View style={styles.detailsRow}>
                    <Text style={styles.detailsLabel}>Phone:</Text>
                    <Text style={styles.detailsVal}>{viewingAgreement.tenantPhone}</Text>
                  </View>
                )}
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Lease Term:</Text>
                  <Text style={styles.detailsVal}>
                    {viewingAgreement?.start} to {viewingAgreement?.end}
                  </Text>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Lock-in Period:</Text>
                  <Text style={styles.detailsVal}>{viewingAgreement?.lockInMonths || 11} Months</Text>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Notice Period:</Text>
                  <Text style={styles.detailsVal}>{viewingAgreement?.noticePeriodDays || 30} Days</Text>
                </View>
              </View>

              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>FINANCIALS & DEPOSIT</Text>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Monthly Rent:</Text>
                  <Text style={[styles.detailsVal, { color: '#059669', fontWeight: '700' }]}>
                    {format(viewingAgreement?.rent || 0, viewingAgreement?.currency || viewCurrency)}/mo
                  </Text>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Security Deposit:</Text>
                  <Text style={styles.detailsVal}>
                    {format(viewingAgreement?.deposit || 0, viewingAgreement?.currency || viewCurrency)}
                  </Text>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Deposit Invoice:</Text>
                  <Text style={styles.detailsVal}>
                    {viewingAgreement?.depositInvoiceId || `INV-DEP-${viewingAgreement?.id || ''}`} (
                    {viewingAgreement?.depositStatus === 'paid' ? 'PAID ✓' : 'PENDING'})
                  </Text>
                </View>
                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLabel}>Rent Due Day:</Text>
                  <Text style={styles.detailsVal}>Day {viewingAgreement?.dueDay || 1} of each month</Text>
                </View>
              </View>

              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>DOCUMENT REPOSITORY</Text>

                {/* 1. Initial Dispatched Copy */}
                <View style={styles.detailsDocBox}>
                  <Feather name="file-text" size={14} color="#D97706" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.detailsDocName}>
                      {viewingAgreement?.initialAgreementName || 'Landlord Dispatched Copy (Pre-Signed)'}
                    </Text>
                    <Text style={styles.detailsDocSub}>Pre-signed tenancy draft</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() =>
                        setPreviewDoc({
                          fileName: viewingAgreement?.initialAgreementName || 'Landlord_Dispatched_Tenancy_Draft.pdf',
                          fileUrl: viewingAgreement?.initialAgreementUrl,
                          title: 'Landlord Dispatched Copy (Pre-Signed)',
                          docType: 'Official Tenancy Draft',
                          meta: {
                            agreementId: viewingAgreement?.id,
                            tenantName: viewingAgreement?.tenant,
                            unit: viewingAgreement?.unit,
                            propertyName: viewingAgreement?.propertyName,
                            amount: viewingAgreement?.rent ? format(viewingAgreement.rent, viewingAgreement.currency || viewCurrency) : undefined,
                            date: viewingAgreement?.start,
                          },
                        })
                      }
                      style={{ padding: 4 }}
                      accessibilityLabel="View Document"
                    >
                      <Feather name="eye" size={15} color="#2563EB" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        downloadDocument({
                          fileName: viewingAgreement?.initialAgreementName || 'Landlord_Dispatched_Tenancy_Draft.pdf',
                          fileUrl: viewingAgreement?.initialAgreementUrl,
                          title: 'Landlord Dispatched Copy (Pre-Signed)',
                          docType: 'Official Tenancy Draft',
                          meta: {
                            tenantName: viewingAgreement?.tenant,
                            unit: viewingAgreement?.unit,
                            propertyName: viewingAgreement?.propertyName,
                            amount: viewingAgreement?.rent ? format(viewingAgreement.rent, viewingAgreement.currency || viewCurrency) : undefined,
                            date: viewingAgreement?.start,
                          },
                        })
                      }
                      style={{ padding: 4 }}
                      accessibilityLabel="Download Document"
                    >
                      <Feather name="download" size={15} color="#2563EB" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 2. Resident Signed Copy */}
                {viewingAgreement?.signedDocumentName && (
                  <View style={[styles.detailsDocBox, { marginTop: 8, borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}>
                    <Feather name="check-circle" size={14} color="#059669" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.detailsDocName, { color: '#065F46' }]}>
                        {viewingAgreement.signedDocumentName}
                      </Text>
                      <Text style={styles.detailsDocSub}>Resident signed & stamped copy</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TouchableOpacity
                        onPress={() =>
                          setPreviewDoc({
                            fileName: viewingAgreement.signedDocumentName || 'Resident_Signed_Lease.pdf',
                            fileUrl: viewingAgreement.signedDocumentUrl,
                            title: viewingAgreement.signedDocumentName,
                            docType: 'Resident Ink-Signed Agreement',
                            meta: {
                              agreementId: viewingAgreement.id,
                              tenantName: viewingAgreement.tenant,
                              unit: viewingAgreement.unit,
                              propertyName: viewingAgreement.propertyName,
                              amount: viewingAgreement.deposit ? format(viewingAgreement.deposit, viewingAgreement.currency || viewCurrency) : undefined,
                              date: viewingAgreement.signedUploadedAt || viewingAgreement.start,
                            },
                          })
                        }
                        style={{ padding: 4 }}
                        accessibilityLabel="View Document"
                      >
                        <Feather name="eye" size={15} color="#059669" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          downloadDocument({
                            fileName: viewingAgreement.signedDocumentName || 'Resident_Signed_Lease.pdf',
                            fileUrl: viewingAgreement.signedDocumentUrl,
                            title: viewingAgreement.signedDocumentName,
                            docType: 'Resident Ink-Signed Agreement',
                            meta: {
                              tenantName: viewingAgreement.tenant,
                              unit: viewingAgreement.unit,
                              propertyName: viewingAgreement.propertyName,
                              amount: viewingAgreement.deposit ? format(viewingAgreement.deposit, viewingAgreement.currency || viewCurrency) : undefined,
                              date: viewingAgreement.signedUploadedAt || viewingAgreement.start,
                            },
                          })
                        }
                        style={{ padding: 4 }}
                        accessibilityLabel="Download Document"
                      >
                        <Feather name="download" size={15} color="#059669" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              {/* Tenant Uploaded Identity Verification Documents */}
              {viewingAgreement?.tenantUploadedIds && viewingAgreement.tenantUploadedIds.length > 0 && (
                <View style={styles.detailsSection}>
                  <Text style={styles.detailsSectionTitle}>RESIDENT IDENTITY DOCUMENTS</Text>
                  <View style={{ gap: 6 }}>
                    {(viewingAgreement.tenantUploadedIds as MobileTenantUploadedIdItem[]).map((idDoc) => (
                      <View
                        key={idDoc.id}
                        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 8, padding: 8, gap: 8 }}
                      >
                        <Feather name="check-circle" size={14} color="#059669" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#065F46' }}>{idDoc.name}</Text>
                          <Text style={{ fontSize: 10.5, color: '#6B7280' }} numberOfLines={1}>{idDoc.fileName}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <TouchableOpacity
                            onPress={() =>
                              setPreviewDoc({
                                fileName: idDoc.fileName,
                                fileUrl: idDoc.fileUrl,
                                title: idDoc.name,
                                docType: 'Government Identity Proof',
                                meta: {
                                  tenantName: viewingAgreement.tenant,
                                  unit: viewingAgreement.unit,
                                  propertyName: viewingAgreement.propertyName,
                                  date: idDoc.uploadedAt,
                                },
                              })
                            }
                            style={{ padding: 4 }}
                            accessibilityLabel="View Document"
                          >
                            <Feather name="eye" size={14} color="#059669" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              downloadDocument({
                                fileName: idDoc.fileName,
                                fileUrl: idDoc.fileUrl,
                                title: idDoc.name,
                                docType: 'Government Identity Proof',
                                meta: {
                                  tenantName: viewingAgreement.tenant,
                                  unit: viewingAgreement.unit,
                                  propertyName: viewingAgreement.propertyName,
                                  date: idDoc.uploadedAt,
                                },
                              })
                            }
                            style={{ padding: 4 }}
                            accessibilityLabel="Download Document"
                          >
                            <Feather name="download" size={14} color="#059669" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setViewingAgreement(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalCloseBtnText}>Close Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 2: REVIEW & APPROVE SIGNED LEASE (Web Parity)  */}
      {/* ==================================================== */}
      <Modal visible={!!inspectingSignedAgreement} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Review Resident Signed Lease</Text>
                <Text style={styles.modalSub}>
                  {inspectingSignedAgreement?.tenant} • Unit {inspectingSignedAgreement?.unit}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setInspectingSignedAgreement(null)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.approvalInspectionCard}>
              <Feather name="check-circle" size={24} color="#059669" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.approvalInspectionFile}>
                  {inspectingSignedAgreement?.signedDocumentName || 'Executed_Tenancy_Lease.pdf'}
                </Text>
                <Text style={styles.approvalInspectionSub}>
                  Resident uploaded ink-signed agreement on file.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  onPress={() =>
                    setPreviewDoc({
                      fileName: inspectingSignedAgreement?.signedDocumentName || 'Executed_Tenancy_Lease.pdf',
                      fileUrl: inspectingSignedAgreement?.signedDocumentUrl,
                      title: inspectingSignedAgreement?.signedDocumentName || 'Signed Tenancy Agreement',
                      docType: 'Resident Ink-Signed Agreement',
                      meta: {
                        agreementId: inspectingSignedAgreement?.id,
                        tenantName: inspectingSignedAgreement?.tenant,
                        unit: inspectingSignedAgreement?.unit,
                        propertyName: inspectingSignedAgreement?.propertyName,
                        amount: inspectingSignedAgreement?.deposit ? format(inspectingSignedAgreement.deposit, inspectingSignedAgreement.currency || viewCurrency) : undefined,
                        date: inspectingSignedAgreement?.signedUploadedAt || inspectingSignedAgreement?.start,
                      },
                    })
                  }
                  style={{ padding: 4 }}
                  accessibilityLabel="View Document"
                >
                  <Feather name="eye" size={18} color="#2563EB" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    downloadDocument({
                      fileName: inspectingSignedAgreement?.signedDocumentName || 'Executed_Tenancy_Lease.pdf',
                      fileUrl: inspectingSignedAgreement?.signedDocumentUrl,
                      title: inspectingSignedAgreement?.signedDocumentName || 'Signed Tenancy Agreement',
                      docType: 'Resident Ink-Signed Agreement',
                      meta: {
                        tenantName: inspectingSignedAgreement?.tenant,
                        unit: inspectingSignedAgreement?.unit,
                        propertyName: inspectingSignedAgreement?.propertyName,
                        amount: inspectingSignedAgreement?.deposit ? format(inspectingSignedAgreement.deposit, inspectingSignedAgreement.currency || viewCurrency) : undefined,
                        date: inspectingSignedAgreement?.signedUploadedAt || inspectingSignedAgreement?.start,
                      },
                    })
                  }
                  style={{ padding: 4 }}
                  accessibilityLabel="Download Document"
                >
                  <Feather name="download" size={17} color="#2563EB" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Tenant Uploaded IDs (if any) */}
            {inspectingSignedAgreement?.tenantUploadedIds && inspectingSignedAgreement.tenantUploadedIds.length > 0 && (
              <View
                style={{
                  marginVertical: 10,
                  padding: 12,
                  backgroundColor: '#F0FDF4',
                  borderWidth: 1,
                  borderColor: '#A7F3D0',
                  borderRadius: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Feather name="shield" size={15} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#065F46' }}>
                    Resident Identity Documents ({inspectingSignedAgreement.tenantUploadedIds.length})
                  </Text>
                </View>
                <View style={{ gap: 6 }}>
                  {(inspectingSignedAgreement.tenantUploadedIds as MobileTenantUploadedIdItem[]).map((idDoc) => (
                    <View
                      key={idDoc.id}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 6, gap: 8 }}
                    >
                      <Feather name="check-circle" size={13} color="#059669" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#065F46' }}>{idDoc.name}</Text>
                        <Text style={{ fontSize: 10.5, color: '#6B7280' }} numberOfLines={1}>{idDoc.fileName}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <TouchableOpacity
                          onPress={() =>
                            setPreviewDoc({
                              fileName: idDoc.fileName,
                              fileUrl: idDoc.fileUrl,
                              title: idDoc.name,
                              docType: 'Government Identity Proof',
                              meta: {
                                tenantName: inspectingSignedAgreement.tenant,
                                unit: inspectingSignedAgreement.unit,
                                propertyName: inspectingSignedAgreement.propertyName,
                                date: idDoc.uploadedAt,
                              },
                            })
                          }
                          style={{ padding: 4 }}
                          accessibilityLabel="View Document"
                        >
                          <Feather name="eye" size={14} color="#2563EB" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            downloadDocument({
                              fileName: idDoc.fileName,
                              fileUrl: idDoc.fileUrl,
                              title: idDoc.name,
                              docType: 'Government Identity Proof',
                              meta: {
                                tenantName: inspectingSignedAgreement.tenant,
                                unit: inspectingSignedAgreement.unit,
                                propertyName: inspectingSignedAgreement.propertyName,
                                date: idDoc.uploadedAt,
                              },
                            })
                          }
                          style={{ padding: 4 }}
                          accessibilityLabel="Download Document"
                        >
                          <Feather name="download" size={14} color="#2563EB" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.approvalDepositBox}>
              <Text style={styles.approvalDepositLabel}>NEXT STEP: MOVE-IN DEPOSIT DISPATCH</Text>
              <Text style={styles.approvalDepositText}>
                Upon 1-click approval, invoice #{inspectingSignedAgreement?.depositInvoiceId || `INV-DEP-${inspectingSignedAgreement?.id}`} for{' '}
                <Text style={{ fontWeight: '700', color: '#0F172A' }}>
                  {format(inspectingSignedAgreement?.deposit || 0, inspectingSignedAgreement?.currency || viewCurrency)}
                </Text>{' '}
                will be automatically created and dispatched to resident.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: '#EF4444',
                  backgroundColor: '#FEF2F2',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  setRejectReasonText('');
                  setShowRejectModal(true);
                }}
                activeOpacity={0.85}
              >
                <Feather name="x-circle" size={14} color="#DC2626" style={{ marginRight: 5 }} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.approvePrimaryCTA, { flex: 2, marginTop: 0 }]}
                onPress={() => inspectingSignedAgreement && handleApproveSignedLease(inspectingSignedAgreement)}
                activeOpacity={0.85}
              >
                <Feather name="shield" size={15} color="#FFFFFF" style={{ marginRight: 5 }} />
                <Text style={styles.approvePrimaryCTAText}>Approve</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* REJECTION MODAL FOR SIGNED LEASE                     */}
      {/* ==================================================== */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 440 }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: '#DC2626' }]}>Reject Signed Agreement</Text>
                <Text style={styles.modalSub}>
                  Unit {inspectingSignedAgreement?.unit} • Resident: {inspectingSignedAgreement?.tenant}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowRejectModal(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ fontSize: 13, color: '#475569', marginBottom: 10, lineHeight: 18 }}>
              Please specify why the uploaded agreement is being rejected. The resident will receive this reason and will be prompted to re-upload.
            </Text>

            <Text style={styles.modalFieldLabel}>Reason for Rejection *</Text>
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top', paddingTop: 8 }]}
              multiline
              numberOfLines={3}
              placeholder="e.g., Signature missing on page 2, unclear scan, or incomplete document."
              placeholderTextColor="#94A3B8"
              value={rejectReasonText}
              onChangeText={setRejectReasonText}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { flex: 1 }]}
                onPress={() => setShowRejectModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  { flex: 1.5, backgroundColor: '#DC2626' },
                  (!rejectReasonText.trim() || isRejecting) && { opacity: 0.6 }
                ]}
                disabled={!rejectReasonText.trim() || isRejecting}
                onPress={handleRejectSignedLease}
              >
                <Text style={styles.modalSubmitBtnText}>
                  {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 3: RENEWAL OFFER MODAL (Web 1-to-1 Parity)     */}
      {/* ==================================================== */}
      <Modal visible={!!renewalModalItem} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Propose Lease Renewal</Text>
                <Text style={styles.modalSub}>
                  Unit {renewalModalItem?.unit} • Resident: {renewalModalItem?.tenant}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setRenewalModalItem(null)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Current Contract Rent */}
              <View style={styles.currentRentStrip}>
                <Text style={styles.currentRentLabel}>Current Contracted Rent:</Text>
                <Text style={styles.currentRentVal}>
                  {format(renewalModalItem?.currentRent || 0, renewalModalItem?.currency || viewCurrency)}/mo
                </Text>
              </View>

              {/* Escalation Percentage Presets (Web Parity) */}
              <Text style={styles.modalFieldLabel}>Escalation Percentage (%)</Text>
              <View style={styles.escalationPillsRow}>
                {[0, 5, 8, 10, 12, 15].map((pct) => (
                  <TouchableOpacity
                    key={pct}
                    style={[
                      styles.escalationPill,
                      renewalPercent === pct && styles.escalationPillActive,
                    ]}
                    onPress={() => setRenewalPercent(pct)}
                  >
                    <Text
                      style={[
                        styles.escalationPillText,
                        renewalPercent === pct && styles.escalationPillTextActive,
                      ]}
                    >
                      {pct === 0 ? '0%' : `+${pct}%`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Dynamic Bi-Directional Calculation Preview */}
              <View style={styles.calcPreviewBox}>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Current Monthly Rent:</Text>
                  <Text style={styles.calcVal}>
                    {format(renewalModalItem?.currentRent || 0, renewalModalItem?.currency || viewCurrency)}
                  </Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Monthly Increase:</Text>
                  <Text style={[styles.calcVal, { color: '#059669' }]}>
                    +{format(renewalModalItem ? Math.round(renewalModalItem.currentRent * (renewalPercent / 100)) : 0, renewalModalItem?.currency || viewCurrency)}
                  </Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>New Proposed Rent:</Text>
                  <Text style={[styles.calcVal, { color: '#059669', fontWeight: '800', fontSize: 13 }]}>
                    {format(renewalModalItem ? Math.round(renewalModalItem.currentRent * (1 + renewalPercent / 100)) : 0, renewalModalItem?.currency || viewCurrency)}/mo
                  </Text>
                </View>
              </View>

              {/* Duration Selector (Web Parity) */}
              <Text style={styles.modalFieldLabel}>Renewal Term Duration</Text>
              <View style={styles.durationPillsRow}>
                {[6, 11, 12, 24].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.durationPill,
                      renewalDurationMonths === m && styles.durationPillActive,
                    ]}
                    onPress={() => handleRenewalDurationChange(m)}
                  >
                    <Text
                      style={[
                        styles.durationPillText,
                        renewalDurationMonths === m && styles.durationPillTextActive,
                      ]}
                    >
                      {m} Months
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Dates Preview */}
              <View style={styles.datesGrid}>
                <View style={styles.dateCol}>
                  <Text style={styles.dateLabel}>New Lease Start</Text>
                  <Text style={styles.dateVal}>{renewalStartDate}</Text>
                </View>
                <View style={styles.dateCol}>
                  <Text style={styles.dateLabel}>New Lease End</Text>
                  <Text style={styles.dateVal}>{renewalEndDate}</Text>
                </View>
              </View>

              {/* Landlord Notes */}
              <Text style={styles.modalFieldLabel}>Owner Notes / Clause Details (Optional)</Text>
              <TextInput
                style={[styles.modalInput, { height: 60 }]}
                value={renewalOwnerNotes}
                onChangeText={setRenewalOwnerNotes}
                placeholder="Standard annual escalation per rental clause..."
                placeholderTextColor="#94A3B8"
                multiline
              />
            </ScrollView>

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={handleConfirmSendRenewal}
              activeOpacity={0.85}
            >
              <Text style={styles.modalSubmitBtnText}>Dispatch Renewal Offer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 4: REVIEW SIGNED RENEWAL MODAL (Web Parity)    */}
      {/* ==================================================== */}
      <Modal visible={!!inspectingSignedRenewal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Review Signed Renewal Agreement</Text>
                <Text style={styles.modalSub}>
                  Unit {inspectingSignedRenewal?.unit} • Resident: {inspectingSignedRenewal?.tenant}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setInspectingSignedRenewal(null)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.approvalInspectionCard}>
              <Feather name="file-text" size={24} color="#D97706" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.approvalInspectionFile}>
                  {inspectingSignedRenewal?.tenantSignedFileName || `Signed_Renewal_Unit_${inspectingSignedRenewal?.unit}.pdf`}
                </Text>
                <Text style={styles.approvalInspectionSub}>
                  Uploaded by resident for landlord review and approval.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  onPress={() =>
                    setPreviewDoc({
                      fileName: inspectingSignedRenewal?.tenantSignedFileName || `Signed_Renewal_Unit_${inspectingSignedRenewal?.unit}.pdf`,
                      fileUrl: inspectingSignedRenewal?.tenantSignedFileUrl,
                      title: 'Signed Renewal Agreement',
                      docType: 'Lease Renewal Agreement',
                      meta: {
                        tenantName: inspectingSignedRenewal?.tenant,
                        unit: inspectingSignedRenewal?.unit,
                        amount: inspectingSignedRenewal?.proposedRent ? format(inspectingSignedRenewal.proposedRent, inspectingSignedRenewal.currency || viewCurrency) : undefined,
                        date: inspectingSignedRenewal?.newLeaseEnd,
                      },
                    })
                  }
                  style={{ padding: 4 }}
                  accessibilityLabel="View Document"
                >
                  <Feather name="eye" size={18} color="#2563EB" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    downloadDocument({
                      fileName: inspectingSignedRenewal?.tenantSignedFileName || `Signed_Renewal_Unit_${inspectingSignedRenewal?.unit}.pdf`,
                      fileUrl: inspectingSignedRenewal?.tenantSignedFileUrl,
                      title: 'Signed Renewal Agreement',
                      docType: 'Lease Renewal Agreement',
                      meta: {
                        tenantName: inspectingSignedRenewal?.tenant,
                        unit: inspectingSignedRenewal?.unit,
                        amount: inspectingSignedRenewal?.proposedRent ? format(inspectingSignedRenewal.proposedRent, inspectingSignedRenewal.currency || viewCurrency) : undefined,
                        date: inspectingSignedRenewal?.newLeaseEnd,
                      },
                    })
                  }
                  style={{ padding: 4 }}
                  accessibilityLabel="Download Document"
                >
                  <Feather name="download" size={17} color="#2563EB" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.calcPreviewBox}>
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>Agreed Renewal Rent:</Text>
                <Text style={[styles.calcVal, { color: '#059669', fontWeight: '700' }]}>
                  {format(inspectingSignedRenewal?.proposedRent || 0, inspectingSignedRenewal?.currency || viewCurrency)}/mo
                </Text>
              </View>
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>Extended Through:</Text>
                <Text style={styles.calcVal}>{inspectingSignedRenewal?.newLeaseEnd || inspectingSignedRenewal?.leaseEnd}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.approvePrimaryCTA}
              onPress={() => inspectingSignedRenewal && handleConfirmApproveRenewal(inspectingSignedRenewal)}
              activeOpacity={0.85}
            >
              <Feather name="check" size={15} color="#FFFFFF" style={{ marginRight: 5 }} />
              <Text style={styles.approvePrimaryCTAText}>Approve</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 5: WEB PARITY "+ Upload agreement" MODAL        */}
      {/* ==================================================== */}
      <Modal visible={showUploadAgreementModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.surface, maxHeight: '92%' }]}>
            {/* Modal Header */}
            <View style={[styles.modalTop, { borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 12, marginBottom: 0 }]}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="user-plus" size={17} color="#10B981" />
                  <Text style={[styles.modalTitle, { color: colors.navy }]}>
                    {activeDraftId ? 'Edit Lease Draft' : 'Add Tenant & Lease'}
                  </Text>
                </View>
                <Text style={[styles.modalSub, { color: colors.inkSoft, marginTop: 3 }]}>
                  Step {wizardStep} of 3 —{' '}
                  {wizardStep === 1 && 'Select or add tenant'}
                  {wizardStep === 2 && 'Select unit and rent terms'}
                  {wizardStep === 3 && 'Attach lease and choose signing method'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowUploadAgreementModal(false)}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            {/* 3-Step Numbered Circle Stepper — Web Parity */}
            <View style={styles.wizardStepperBar}>
              {[
                { step: 1, labelFull: 'Tenant Details', labelShort: 'Tenant' },
                { step: 2, labelFull: 'Unit & Rent', labelShort: 'Unit' },
                { step: 3, labelFull: 'Lease & Signing', labelShort: 'Lease' },
              ].map((item, idx) => {
                const isActive = wizardStep === item.step;
                const isPassed = wizardStep > item.step;
                return (
                  <View key={item.step} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <TouchableOpacity
                      style={styles.wizardStepNode}
                      onPress={() => {
                        if (canGoToStep(item.step as 1 | 2 | 3)) {
                          setWizardStep(item.step as 1 | 2 | 3);
                        } else if (item.step === 2 && !uploadTenantName.trim() && !selectedTenantObj) {
                          showToast('Please find or enter a tenant name first.');
                        } else if (item.step === 3) {
                          showToast('Please select unit, rent, and lease dates first.');
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      {/* Step number circle */}
                      <View
                        style={[
                          styles.wizardStepCircle,
                          isActive && styles.wizardStepCircleActive,
                          isPassed && styles.wizardStepCirclePassed,
                        ]}
                      >
                        {isPassed ? (
                          <Feather name="check" size={11} color="#FFFFFF" />
                        ) : (
                          <Text
                            style={[
                              styles.wizardStepCircleText,
                              (isActive || isPassed) && { color: '#FFFFFF' },
                            ]}
                          >
                            {item.step}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.wizardStepLabel,
                          isActive && styles.wizardStepLabelActive,
                          isPassed && styles.wizardStepLabelPassed,
                        ]}
                        numberOfLines={1}
                      >
                        {item.labelFull}
                      </Text>
                    </TouchableOpacity>
                    {/* Connector line between steps */}
                    {idx < 2 && (
                      <View
                        style={[
                          styles.wizardConnector,
                          (wizardStep > item.step) && styles.wizardConnectorPassed,
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>

            <ScrollView
              style={{ maxHeight: Math.min(windowHeight * 0.72, 600) }}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingTop: 14, paddingBottom: 24 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {/* STEP 1: TENANT DETAILS — Web Parity */}
              {wizardStep === 1 && (
                <View>
                  {/* Info hint box */}
                  <View
                    style={{
                      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 16,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: colors.inkSoft, lineHeight: 18 }}>
                      Find an existing tenant by name, email, or phone, or add a new one directly below.
                    </Text>
                  </View>

                  {/* Form Mode: Register / Edit Resident Details */}
                  {showTenantDetailsEdit ? (
                    <View
                      style={{
                        backgroundColor: isDark ? colors.surfaceSunken : '#FFFFFF',
                        borderWidth: 1.5,
                        borderColor: '#059669',
                        borderRadius: 10,
                        padding: 14,
                        marginBottom: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>
                          {selectedTenantObj ? `Edit Details for ${selectedTenantObj.name}` : 'Register New Resident for Lease'}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setShowTenantDetailsEdit(false)}
                          style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: isDark ? colors.surface : '#F1F5F9' }}
                        >
                          <Text style={{ fontSize: 11.5, color: colors.inkSoft }}>Cancel</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={[styles.modalFieldLabel, { marginTop: 0 }]}>Tenant Full Name *</Text>
                      <TextInput
                        style={[styles.modalInput, { marginBottom: 8 }]}
                        value={uploadTenantName}
                        onChangeText={setUploadTenantName}
                        placeholder="e.g. Rahul Sharma"
                        placeholderTextColor={colors.inkSoft}
                      />

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.modalFieldLabel, { marginTop: 0 }]}>Email Address</Text>
                          <TextInput
                            style={[styles.modalInput, { marginBottom: 8 }]}
                            value={uploadTenantEmail}
                            onChangeText={setUploadTenantEmail}
                            placeholder="resident@gmail.com"
                            placeholderTextColor={colors.inkSoft}
                            keyboardType="email-address"
                            autoCapitalize="none"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.modalFieldLabel, { marginTop: 0 }]}>Phone Number</Text>
                          <TextInput
                            style={[styles.modalInput, { marginBottom: 8 }]}
                            value={uploadTenantPhone}
                            onChangeText={setUploadTenantPhone}
                            placeholder="+91 98765 43210"
                            placeholderTextColor={colors.inkSoft}
                            keyboardType="phone-pad"
                          />
                        </View>
                      </View>

                      <Text style={[styles.modalFieldLabel, { marginTop: 0 }]}>Temporary Password for Tenant *</Text>
                      <TextInput
                        style={[styles.modalInput, { marginBottom: 4 }]}
                        value={uploadTenantPassword}
                        onChangeText={setUploadTenantPassword}
                        placeholder="Welcome@123"
                        placeholderTextColor={colors.inkSoft}
                      />
                      <Text style={{ fontSize: 11, color: colors.inkSoft, marginBottom: 12 }}>
                        Tenant will use this password to sign in for the first time and inspect the lease.
                      </Text>

                      <TouchableOpacity
                        style={{
                          backgroundColor: '#059669',
                          borderRadius: 8,
                          paddingVertical: 10,
                          alignItems: 'center',
                        }}
                        onPress={() => {
                          if (!uploadTenantName.trim()) {
                            showToast('Please enter tenant name.');
                            return;
                          }
                          setIsNewTenantMode(true);
                          setShowTenantDetailsEdit(false);
                          setShowTenantDropdown(false);
                        }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Save Resident Details</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (selectedTenantObj || (uploadTenantName.trim() && !showTenantDropdown)) ? (
                    /* Selected Tenant Card State (Web Parity) */
                    <View
                      style={{
                        backgroundColor: isDark ? 'rgba(5, 150, 105, 0.12)' : '#ECFDF5',
                        borderWidth: 1.5,
                        borderColor: '#A7F3D0',
                        borderRadius: 10,
                        padding: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: '#A7F3D0',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Feather name="user-check" size={18} color="#059669" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.navy }}>
                              {selectedTenantObj?.name || uploadTenantName}
                            </Text>
                            <View
                              style={{
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                backgroundColor: isNewTenantMode
                                  ? '#FEF3C7'
                                  : selectedTenantObj?.source === 'platform'
                                  ? '#DBEAFE'
                                  : selectedTenantObj?.source === 'unit'
                                  ? '#F3E8FF'
                                  : '#DCFCE7',
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: '700',
                                  color: isNewTenantMode
                                    ? '#92400E'
                                    : selectedTenantObj?.source === 'platform'
                                    ? '#1D4ED8'
                                    : selectedTenantObj?.source === 'unit'
                                    ? '#7E22CE'
                                    : '#15803D',
                                }}
                              >
                                {isNewTenantMode
                                  ? 'New Resident'
                                  : selectedTenantObj?.source === 'platform'
                                  ? 'Propithub User'
                                  : selectedTenantObj?.source === 'unit'
                                  ? 'Unit Occupant'
                                  : 'My Tenant'}
                              </Text>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 }}>
                            {(selectedTenantObj?.email || uploadTenantEmail) ? (
                              <Text style={{ fontSize: 11.5, color: '#059669' }}>
                                ✉ {selectedTenantObj?.email || uploadTenantEmail}
                              </Text>
                            ) : null}
                            {(selectedTenantObj?.phone || uploadTenantPhone) ? (
                              <Text style={{ fontSize: 11.5, color: '#059669' }}>
                                ☎ {selectedTenantObj?.phone || uploadTenantPhone}
                              </Text>
                            ) : null}
                            {(!selectedTenantObj?.email && !uploadTenantEmail) && (
                              <TouchableOpacity onPress={() => setShowTenantDetailsEdit(true)}>
                                <Text style={{ fontSize: 11.5, color: '#059669', fontStyle: 'italic', textDecorationLine: 'underline' }}>
                                  + Add Email & Phone
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 5,
                            borderRadius: 6,
                            backgroundColor: isDark ? colors.surface : '#FFFFFF',
                            borderWidth: 1,
                            borderColor: colors.line,
                          }}
                          onPress={() => setShowTenantDetailsEdit(true)}
                        >
                          <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.navy }}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 5,
                            borderRadius: 6,
                            backgroundColor: isDark ? colors.surface : '#FFFFFF',
                            borderWidth: 1,
                            borderColor: colors.line,
                          }}
                          onPress={() => {
                            setSelectedTenantObj(null);
                            setUploadTenantName('');
                            setUploadTenantEmail('');
                            setUploadTenantPhone('');
                            setIsNewTenantMode(false);
                            setTenantSearchQuery('');
                            setShowTenantDropdown(true);
                          }}
                        >
                          <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.inkSoft }}>Change</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    /* Search Combobox Input */
                    <View>
                      <Text style={[styles.modalFieldLabel, { marginTop: 0, fontSize: 13, fontWeight: '600', color: colors.navy }]}>
                        Find or Enter Tenant *
                      </Text>
                      <View
                        style={[
                          styles.modalInput,
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 10,
                            marginBottom: 6,
                            backgroundColor: isDark ? colors.surfaceSunken : '#FFFFFF',
                          },
                        ]}
                      >
                        <Feather name="search" size={15} color={colors.inkSoft} style={{ marginRight: 8 }} />
                        <TextInput
                          style={[styles.searchInput, { flex: 1, color: colors.navy }]}
                          value={uploadTenantName}
                          onChangeText={(val) => {
                            setUploadTenantName(val);
                            setTenantSearchQuery(val);
                            setShowTenantDropdown(true);
                            if (selectedTenantObj && val !== selectedTenantObj.name) {
                              setSelectedTenantObj(null);
                              setUploadTenantEmail('');
                              setUploadTenantPhone('');
                            }
                          }}
                          onFocus={() => setShowTenantDropdown(true)}
                          placeholder="Type tenant name, email, or phone..."
                          placeholderTextColor={colors.inkSoft}
                          autoCapitalize="none"
                          onSubmitEditing={() => {
                            const trimmed = uploadTenantName.trim();
                            if (!trimmed) return;
                            const match = filteredTenantCandidates.find(
                              (c) =>
                                c.name.toLowerCase() === trimmed.toLowerCase() ||
                                (c.email && c.email.toLowerCase() === trimmed.toLowerCase()) ||
                                (c.phone && c.phone.includes(trimmed))
                            );
                            if (match) {
                              setSelectedTenantObj(match);
                              setUploadTenantName(match.name);
                              if (match.email) setUploadTenantEmail(match.email);
                              if (match.phone) setUploadTenantPhone(match.phone);
                              setIsNewTenantMode(false);
                            } else {
                              setSelectedTenantObj({
                                id: `usr_${Date.now()}`,
                                name: trimmed,
                                email: uploadTenantEmail.trim(),
                                phone: uploadTenantPhone.trim(),
                                source: 'platform',
                              });
                              setIsNewTenantMode(true);
                            }
                            setShowTenantDropdown(false);
                          }}
                        />
                        {uploadTenantName ? (
                          <TouchableOpacity
                            onPress={() => {
                              setUploadTenantName('');
                              setUploadTenantEmail('');
                              setUploadTenantPhone('');
                              setTenantSearchQuery('');
                              setSelectedTenantObj(null);
                              setShowTenantDropdown(false);
                            }}
                          >
                            <Ionicons name="close-circle" size={18} color={colors.inkSoft} />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {/* Dropdown Menu */}
                      {showTenantDropdown && (
                        <View style={styles.dropdownMenuBox}>
                          {/* Option 1: 1-click use typed name as new resident */}
                          {uploadTenantName.trim().length > 0 && (
                            <TouchableOpacity
                              style={[styles.dropdownMenuItem, { backgroundColor: isDark ? colors.surfaceSunken : '#ECFDF5', borderBottomColor: '#A7F3D0' }]}
                              onPress={() => {
                                setIsNewTenantMode(true);
                                setSelectedTenantObj({
                                  id: `usr_${Date.now()}`,
                                  name: uploadTenantName.trim(),
                                  email: uploadTenantEmail.trim(),
                                  phone: uploadTenantPhone.trim(),
                                  source: 'platform',
                                });
                                setShowTenantDropdown(false);
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                <Feather name="user-plus" size={14} color="#059669" />
                                <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#059669' }}>
                                  Use "{uploadTenantName.trim()}" as New Resident
                                </Text>
                              </View>
                              <Feather name="arrow-right" size={13} color="#059669" />
                            </TouchableOpacity>
                          )}

                          {isLoadingCandidates ? (
                            <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                              <ActivityIndicator size="small" color="#059669" />
                              <Text style={{ fontSize: 11.5, color: colors.inkSoft }}>Querying registered users & tenants...</Text>
                            </View>
                          ) : null}

                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.inkSoft, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, letterSpacing: 0.5 }}>
                            AVAILABLE USERS & RESIDENTS ({filteredTenantCandidates.length})
                          </Text>

                          {filteredTenantCandidates.length === 0 && !isLoadingCandidates ? (
                            <View style={{ padding: 14, alignItems: 'center' }}>
                              <Text style={{ fontSize: 12, color: colors.inkSoft }}>No matching users found.</Text>
                              <Text style={{ fontSize: 11, color: '#059669', marginTop: 4, fontWeight: '600' }}>
                                Tap "Use as New Resident" above or register below.
                              </Text>
                            </View>
                          ) : null}

                          {filteredTenantCandidates.slice(0, 15).map((t) => {
                            const badgeBg =
                              t.source === 'platform' ? '#DBEAFE' : t.source === 'unit' ? '#F3E8FF' : '#DCFCE7';
                            const badgeColor =
                              t.source === 'platform' ? '#1D4ED8' : t.source === 'unit' ? '#7E22CE' : '#15803D';
                            const badgeLabel =
                              t.source === 'platform' ? 'PROPITHUB USER' : t.source === 'unit' ? 'OCCUPANT' : 'MY TENANT';

                            return (
                              <TouchableOpacity
                                key={t.id}
                                style={styles.dropdownMenuItem}
                                onPress={() => {
                                  setSelectedTenantObj(t);
                                  setUploadTenantName(t.name);
                                  if (t.email) setUploadTenantEmail(t.email);
                                  if (t.phone) setUploadTenantPhone(t.phone);
                                  setIsNewTenantMode(false);
                                  setShowTenantDropdown(false);
                                }}
                              >
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.navy }}>{t.name}</Text>
                                    <View style={{ backgroundColor: badgeBg, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 }}>
                                      <Text style={{ fontSize: 9, fontWeight: '700', color: badgeColor }}>{badgeLabel}</Text>
                                    </View>
                                  </View>
                                  <Text style={{ fontSize: 11, color: colors.inkSoft, marginTop: 2 }}>
                                    {t.email || 'No email'}{t.phone ? ` • ${t.phone}` : ''}{t.unit ? ` • Unit ${t.unit}` : ''}
                                  </Text>
                                </View>
                                <Feather name="user-check" size={15} color="#059669" />
                              </TouchableOpacity>
                            );
                          })}

                          {filteredTenantCandidates.length > 15 && (
                            <View style={{ padding: 8, alignItems: 'center' }}>
                              <Text style={{ fontSize: 11, color: colors.inkSoft }}>
                                + {filteredTenantCandidates.length - 15} more candidates. Keep typing to filter...
                              </Text>
                            </View>
                          )}

                          {/* Option to register with full details */}
                          <TouchableOpacity
                            style={[styles.dropdownMenuItem, { borderTopWidth: 1, borderTopColor: colors.line }]}
                            onPress={() => {
                              setShowTenantDetailsEdit(true);
                              setShowTenantDropdown(false);
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Feather name="plus-circle" size={14} color="#059669" />
                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#059669' }}>
                                + Register new resident with email, phone & password
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* STEP 2: UNIT & RENT — Web Parity */}
              {wizardStep === 2 && (
                <View>
                  {/* Property + Unit selectors (2-column like web) */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {/* Property selector */}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalFieldLabel, { marginTop: 0, fontSize: 13, fontWeight: '600', color: colors.navy }]}>Property *</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ marginBottom: 8 }}
                        contentContainerStyle={{ gap: 6 }}
                        nestedScrollEnabled
                      >
                        {myProperties.length === 0 ? (
                          <View style={[styles.modalInput, { justifyContent: 'center', paddingVertical: 10 }]}>
                            <Text style={{ fontSize: 12, color: colors.inkSoft }}>No properties</Text>
                          </View>
                        ) : (
                          myProperties.map((p) => {
                            const isSelected = uploadPropertyId === p.id;
                            return (
                              <TouchableOpacity
                                key={p.id}
                                style={[
                                  styles.filterChip,
                                  { backgroundColor: isSelected ? '#059669' : (isDark ? colors.surfaceSunken : '#F1F5F9'), borderColor: isSelected ? '#059669' : colors.line },
                                ]}
                                onPress={() => handleSelectProperty(p.id)}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? '#FFFFFF' : colors.inkSoft }} numberOfLines={1}>
                                  {p.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </ScrollView>
                    </View>

                    {/* Unit selector */}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalFieldLabel, { marginTop: 0, fontSize: 13, fontWeight: '600', color: colors.navy }]}>Select Unit *</Text>
                      <TouchableOpacity
                        style={[styles.dropdownTrigger, { marginBottom: 8, paddingVertical: 10 }]}
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setShowUnitDropdown(!showUnitDropdown);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.dropdownValueText, !uploadUnit && { color: colors.inkSoft }, { fontSize: 12 }]} numberOfLines={1}>
                          {(() => {
                            const selectedUnitObj = myUnits.find((u) => (uploadUnitId ? u.id === uploadUnitId : (u.unitNumber === uploadUnit || u.id === uploadUnit)));
                            if (!selectedUnitObj) return 'No vacant units available';
                            const uNum = selectedUnitObj.unitNumber || selectedUnitObj.id;
                            return `Unit ${uNum} • ${selectedUnitObj.status || 'Vacant'}`;
                          })()}
                        </Text>
                        <Feather name={showUnitDropdown ? 'chevron-up' : 'chevron-down'} size={15} color={colors.inkSoft} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Unit dropdown list */}
                  {showUnitDropdown && (
                    <View style={styles.dropdownMenuBox}>
                      {(() => {
                        const propUnits = uploadPropertyId
                          ? myUnits.filter((u) => u.propertyId === uploadPropertyId)
                          : myUnits;
                        if (propUnits.length === 0) {
                          return (
                            <View style={{ padding: 14 }}>
                              <Text style={{ fontSize: 13, color: colors.inkSoft, textAlign: 'center' }}>
                                No units available for this property.
                              </Text>
                            </View>
                          );
                        }
                        return propUnits.slice(0, 15).map((u) => {
                          const uNum = u.unitNumber || u.id;
                          const isSelected = uploadUnitId ? uploadUnitId === u.id : uploadUnit === uNum;
                          const propName = myProperties.find((p) => p.id === u.propertyId)?.name;
                          const isVacant = u.status === 'vacant';
                          return (
                            <TouchableOpacity
                              key={u.id}
                              style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                              onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                handleSelectUnitForUpload(u.id);
                                setShowUnitDropdown(false);
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.dropdownMenuText, isSelected && { fontWeight: '700', color: '#059669' }]}>
                                  Unit {uNum}{propName ? ` • ${propName}` : ''}
                                </Text>
                                <Text style={{ fontSize: 11, color: isVacant ? '#059669' : '#D97706', marginTop: 1 }}>
                                  {u.status ? u.status.charAt(0).toUpperCase() + u.status.slice(1) : 'Vacant'}
                                </Text>
                              </View>
                              {isSelected && <Feather name="check" size={15} color="#059669" />}
                            </TouchableOpacity>
                          );
                        });
                      })()}
                    </View>
                  )}
                  {/* Financials: Monthly Rent | Security Deposit | Rent Due Day */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalFieldLabel, { fontSize: 13, fontWeight: '600', color: colors.navy }]}>Monthly Rent ({uploadCurrency}) *</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: isDark ? colors.surfaceSunken : '#FFFFFF' }]}
                        value={uploadRent}
                        onChangeText={setUploadRent}
                        placeholder="0"
                        placeholderTextColor={colors.inkSoft}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.modalFieldLabel, { fontSize: 13, fontWeight: '600', color: colors.navy }]}>Security Deposit ({uploadCurrency})</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: isDark ? colors.surfaceSunken : '#FFFFFF' }]}
                        value={uploadDeposit}
                        onChangeText={setUploadDeposit}
                        placeholder="0"
                        placeholderTextColor={colors.inkSoft}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ width: 82 }}>
                      <Text style={[styles.modalFieldLabel, { fontSize: 13, fontWeight: '600', color: colors.navy }]}>Rent Due Day</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: isDark ? colors.surfaceSunken : '#FFFFFF' }]}
                        value={uploadDueDay}
                        onChangeText={setUploadDueDay}
                        placeholder="1"
                        placeholderTextColor={colors.inkSoft}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* Lease Duration & Timeline box — exact web parity */}
                  <View
                    style={{
                      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 10,
                      padding: 14,
                      marginTop: 12,
                    }}
                  >
                    {/* Header row: label + quick duration pills */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.navy }}>Lease Duration & Timeline</Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {[{ label: '6 Months', months: 6 }, { label: '1 Year', months: 12 }, { label: '2 Years', months: 24 }].map((opt) => (
                          <TouchableOpacity
                            key={opt.months}
                            style={[
                              styles.durationPill,
                              { flex: 0, paddingHorizontal: 10, paddingVertical: 5 },
                            ]}
                            onPress={() => {
                              const startObj = new Date(uploadStartDate || new Date().toISOString().split('T')[0]);
                              const endObj = new Date(startObj);
                              endObj.setMonth(endObj.getMonth() + opt.months);
                              endObj.setDate(endObj.getDate() - 1);
                              setUploadEndDate(endObj.toISOString().split('T')[0]);
                            }}
                          >
                            <Text style={[styles.durationPillText, { fontSize: 11 }]}>{opt.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Date pickers side by side */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 4 }}>Lease Start Date *</Text>
                        <TextInput
                          style={[styles.modalInput, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}
                          value={uploadStartDate}
                          onChangeText={setUploadStartDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.inkSoft}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: colors.inkSoft, marginBottom: 4 }}>Lease End Date *</Text>
                        <TextInput
                          style={[styles.modalInput, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]}
                          value={uploadEndDate}
                          onChangeText={setUploadEndDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.inkSoft}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* STEP 3: LEASE & SIGNING — Web Parity */}
              {wizardStep === 3 && (
                <View>
                  {/* Select Signing Method label */}
                  <Text style={[styles.modalFieldLabel, { fontSize: 13, fontWeight: '600', color: colors.navy, marginTop: 4 }]}>Select Signing Method *</Text>
              <View style={{ gap: 8, marginBottom: 12 }}>
                {/* Radio Card 1: Dispatch for Signing */}
                <TouchableOpacity
                  style={[
                    styles.workflowCard,
                    uploadExecutionMode === 'digital_dispatch' && styles.workflowCardActive,
                  ]}
                  onPress={() => setUploadExecutionMode('digital_dispatch')}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons
                      name={uploadExecutionMode === 'digital_dispatch' ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={uploadExecutionMode === 'digital_dispatch' ? '#10B981' : '#94A3B8'}
                    />
                    <Text style={[styles.workflowCardTitle, uploadExecutionMode === 'digital_dispatch' && { color: '#0F172A' }]}>
                      Dispatch Tenancy Offer
                    </Text>
                  </View>
                  <Text style={styles.workflowCardDesc}>
                    Unit becomes <Text style={{ fontWeight: '700' }}>Reserved</Text>. Resident reviews & accepts invitation on dashboard, downloads agreement, signs in ink offline, and uploads signed copy.
                  </Text>
                </TouchableOpacity>

                {/* Radio Card 2: Already Executed Offline */}
                <TouchableOpacity
                  style={[
                    styles.workflowCard,
                    uploadExecutionMode === 'already_executed_offline' && styles.workflowCardActive,
                  ]}
                  onPress={() => setUploadExecutionMode('already_executed_offline')}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons
                      name={uploadExecutionMode === 'already_executed_offline' ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={uploadExecutionMode === 'already_executed_offline' ? '#10B981' : '#94A3B8'}
                    />
                    <Text style={[styles.workflowCardTitle, uploadExecutionMode === 'already_executed_offline' && { color: '#0F172A' }]}>
                      Already Executed Offline
                    </Text>
                  </View>
                  <Text style={styles.workflowCardDesc}>
                    Unit is marked <Text style={{ fontWeight: '700' }}>Occupied</Text> immediately. Physical agreement has already been executed in ink in person.
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Offline Deposit Checkbox (Web Parity) */}
              {uploadExecutionMode === 'already_executed_offline' && (
                <View style={styles.offlineDepositBox}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => setOfflineDepositCollected(!offlineDepositCollected)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={offlineDepositCollected ? 'checkbox' : 'square-outline'}
                      size={18}
                      color="#059669"
                    />
                    <Text style={styles.offlineDepositLabel}>
                      Security Deposit ({format(parseFloat(uploadDeposit) || 0, uploadCurrency || viewCurrency)}) already collected in full offline
                    </Text>
                  </TouchableOpacity>

                  {offlineDepositCollected && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Payment Reference / Receipt Note</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: '#FFFFFF', marginBottom: 0 }]}
                        value={offlineDepositRef}
                        onChangeText={setOfflineDepositRef}
                        placeholder="e.g. Bank Wire / UPI Ref / Cash Settled"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Document File Attachment Header with Segmented Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <Text style={[styles.modalFieldLabel, { marginBottom: 0 }]}>
                  Agreement Document File
                </Text>

                <View style={{ flexDirection: 'row', backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9', borderRadius: 8, padding: 2, borderWidth: 1, borderColor: colors.line }}>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: uploadAgreementSource === 'upload' ? '#10B981' : 'transparent',
                    }}
                    onPress={() => setUploadAgreementSource('upload')}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: uploadAgreementSource === 'upload' ? '#FFFFFF' : colors.inkSoft }}>
                      📁 Upload File
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: uploadAgreementSource === 'library' ? '#10B981' : 'transparent',
                    }}
                    onPress={() => setUploadAgreementSource('library')}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: uploadAgreementSource === 'library' ? '#FFFFFF' : colors.inkSoft }}>
                      📄 Select from Library ({myTemplates.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {uploadAgreementSource === 'upload' ? (
                <TouchableOpacity
                  style={styles.documentFileCard}
                  onPress={async () => {
                    try {
                      const picked = await pickDocument({ type: ['application/pdf', 'image/*'] });
                      if (picked) {
                        setUploadFileName(picked.name);
                        const rawData = picked.base64 || picked.uri;
                        try {
                          const safeUrl = await uploadOrCompressDocument(
                            rawData,
                            `agreements/drafts/${Date.now()}_${picked.name}`
                          );
                          setUploadFileData(safeUrl);
                        } catch {
                          setUploadFileData(rawData);
                        }
                        showToast(`${picked.name} attached`, 'success');
                      }
                    } catch (err: any) {
                      showToast(err?.message || 'Could not attach document.', 'error');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 8 }}>
                    <Feather name="file-text" size={18} color="#059669" />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <Text style={[styles.documentFileName, { color: colors.navy }]} numberOfLines={1} ellipsizeMode="middle">
                        {uploadFileName}
                      </Text>
                      <Text style={styles.documentFileSize}>Tap to choose or replace file</Text>
                    </View>
                  </View>
                  <View style={styles.readyBadge}>
                    <Text style={styles.readyBadgeText}>Browse</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={{ marginBottom: 8 }}>
                  {myTemplates.length === 0 ? (
                    <View style={[styles.documentFileCard, { justifyContent: 'center', alignItems: 'center', paddingVertical: 14 }]}>
                      <Text style={{ fontSize: 12, color: colors.inkSoft, textAlign: 'center' }}>
                        No templates in library yet. Switch to "Upload File" above.
                      </Text>
                    </View>
                  ) : (
                    <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      <View style={{ gap: 6 }}>
                        {myTemplates.map((t) => {
                          const isSelected = uploadSelectedTemplateId === t.id || (uploadFileData && uploadFileData === t.fileData);
                          return (
                            <TouchableOpacity
                              key={t.id}
                              style={[
                                styles.documentFileCard,
                                {
                                  paddingVertical: 8,
                                  paddingHorizontal: 10,
                                  borderColor: isSelected ? '#10B981' : colors.line,
                                  backgroundColor: isSelected ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5') : (isDark ? colors.surfaceSunken : '#FFFFFF'),
                                },
                              ]}
                              onPress={() => {
                                setUploadSelectedTemplateId(t.id);
                                setUploadFileName(t.fileName);
                                setUploadFileData(t.fileData);
                                showToast(`${t.title} selected from library`, 'success');
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 8 }}>
                                <Feather
                                  name={isSelected ? 'check-circle' : 'file-text'}
                                  size={16}
                                  color={isSelected ? '#059669' : colors.inkSoft}
                                />
                                <View style={{ marginLeft: 8, flex: 1 }}>
                                  <Text
                                    style={{
                                      fontSize: 12.5,
                                      fontWeight: isSelected ? '700' : '600',
                                      color: isSelected ? '#065F46' : colors.navy,
                                    }}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                  >
                                    {t.title}
                                  </Text>
                                  <Text style={{ fontSize: 10.5, color: colors.inkSoft, marginTop: 1 }} numberOfLines={1}>
                                    {t.fileName} • {t.fileSizeKb || 450} KB
                                  </Text>
                                </View>
                              </View>
                              <View
                                style={[
                                  styles.readyBadge,
                                  isSelected && { backgroundColor: '#10B981' },
                                ]}
                              >
                                <Text style={[styles.readyBadgeText, isSelected && { color: '#FFFFFF' }]}>
                                  {isSelected ? 'Selected ✓' : 'Select'}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  )}
                </View>
              )}

              {/* Identity Verification Requirements (Web Parity) */}
              <View
                style={{
                  marginTop: 14,
                  padding: 12,
                  backgroundColor: uploadRequireIds ? '#FFFFFF' : '#F8FAFC',
                  borderWidth: 1.5,
                  borderColor: uploadRequireIds ? '#10B981' : '#E2E8F0',
                  borderRadius: 10,
                  marginBottom: 14,
                }}
              >
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  onPress={() => setUploadRequireIds(!uploadRequireIds)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                    <Ionicons
                      name={uploadRequireIds ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={uploadRequireIds ? '#10B981' : '#64748B'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                        Request Resident ID Verification Documents
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                        {uploadRequireIds
                          ? 'Resident must provide these ID documents for verification.'
                          : 'Require resident identity verification (Aadhaar, Voter ID, Passport, etc.)'}
                      </Text>
                    </View>
                  </View>
                  {uploadRequireIds && (
                    <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>
                        {uploadIdList.length} ID{uploadIdList.length === 1 ? '' : 's'} Required
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {uploadRequireIds && (
                  <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6, letterSpacing: 0.3 }}>
                      QUICK ADD SUGGESTIONS
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {['Voter ID', 'Aadhaar Card', 'PAN Card', 'Passport', 'Driving License', 'Police Verification'].map((preset) => {
                        const isAdded = uploadIdList.some((item) => item.name.toLowerCase() === preset.toLowerCase());
                        return (
                          <TouchableOpacity
                            key={preset}
                            style={{
                              paddingHorizontal: 9,
                              paddingVertical: 4,
                              borderRadius: 6,
                              backgroundColor: isAdded ? '#F1F5F9' : '#ECFDF5',
                              borderWidth: 1,
                              borderColor: isAdded ? '#E2E8F0' : '#A7F3D0',
                              opacity: isAdded ? 0.6 : 1,
                            }}
                            disabled={isAdded}
                            onPress={() => {
                              setUploadIdList([...uploadIdList, { id: `id_${Date.now()}_${Math.random()}`, name: preset }]);
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: isAdded ? '#94A3B8' : '#059669' }}>
                              {isAdded ? '✓ ' : '+ '}
                              {preset}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6, letterSpacing: 0.3 }}>
                      REQUIRED ID DOCUMENT LIST
                    </Text>
                    <View style={{ gap: 8 }}>
                      {uploadIdList.map((item, idx) => (
                        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', width: 22 }}>
                            #{idx + 1}
                          </Text>
                          <TextInput
                            style={[styles.modalInput, { flex: 1, marginBottom: 0, paddingVertical: 6, fontSize: 12.5 }]}
                            value={item.name}
                            placeholder="e.g. Passport, Aadhaar, Driving License"
                            placeholderTextColor="#94A3B8"
                            onChangeText={(txt) => {
                              const updated = [...uploadIdList];
                              updated[idx].name = txt;
                              setUploadIdList(updated);
                            }}
                          />
                          {uploadExecutionMode === 'already_executed_offline' && (
                            <TouchableOpacity
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 7,
                                backgroundColor: uploadOfflineTenantIds[item.id] ? '#DCFCE7' : '#F1F5F9',
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: uploadOfflineTenantIds[item.id] ? '#86EFAC' : '#CBD5E1',
                              }}
                              onPress={async () => {
                                try {
                                  const picked = await pickDocument({ type: ['application/pdf', 'image/*'] });
                                  if (picked) {
                                    setUploadOfflineTenantIds((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        fileName: picked.name,
                                        fileUrl: picked.base64 || picked.uri,
                                      },
                                    }));
                                    showToast(`${item.name} attached`, 'success');
                                  }
                                } catch (err: any) {
                                  showToast(err?.message || 'Could not attach ID.', 'error');
                                }
                              }}
                            >
                              <Text style={{ fontSize: 10.5, fontWeight: '700', color: uploadOfflineTenantIds[item.id] ? '#15803D' : '#475569' }}>
                                {uploadOfflineTenantIds[item.id] ? 'Attached ✓' : 'Upload File'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {uploadIdList.length > 1 && (
                            <TouchableOpacity
                              onPress={() => setUploadIdList(uploadIdList.filter((_, i) => i !== idx))}
                              style={{ padding: 6 }}
                            >
                              <Feather name="trash-2" size={15} color="#EF4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity
                      style={{
                        marginTop: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        alignSelf: 'flex-start',
                        gap: 4,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#CBD5E1',
                        borderRadius: 6,
                      }}
                      onPress={() => setUploadIdList([...uploadIdList, { id: `id_${Date.now()}_${Math.random()}`, name: '' }])}
                    >
                      <Feather name="plus" size={13} color="#059669" />
                      <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#059669' }}>
                        Add Custom ID Requirement
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}
        </ScrollView>

            {/* Modal Footer — Redesigned 2-row layout */}
            <View style={[styles.wizardFooter, { borderTopColor: colors.line }]}>

              {/* Row 1: Save Draft (full width) */}
              <TouchableOpacity
                style={styles.modalSaveDraftBtn}
                onPress={handleSaveDraft}
                activeOpacity={0.8}
              >
                <Feather name="bookmark" size={14} color={isDark ? colors.primary : '#059669'} style={{ marginRight: 6 }} />
                <Text style={styles.modalSaveDraftBtnText}>Save Draft</Text>
              </TouchableOpacity>

              {/* Row 2: Cancel + Continue */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
                {/* Cancel / Back */}
                <TouchableOpacity
                  style={[styles.wizardFooterBackBtn, { flex: 1 }]}
                  onPress={() => {
                    if (wizardStep > 1) {
                      setWizardStep((prev) => (prev - 1) as 1 | 2 | 3);
                    } else {
                      setShowUploadAgreementModal(false);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  {wizardStep > 1 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Feather name="arrow-left" size={14} color={colors.inkSoft} />
                      <Text style={styles.wizardFooterBackBtnText}>Back</Text>
                    </View>
                  ) : (
                    <Text style={[styles.wizardFooterBackBtnText, { textAlign: 'center' }]}>Cancel</Text>
                  )}
                </TouchableOpacity>

                {/* Continue / Submit */}
                <TouchableOpacity
                  style={[styles.modalWebSubmitBtn, { flex: 2 }]}
                  onPress={() => {
                    if (wizardStep === 1) {
                      if (!uploadTenantName.trim()) {
                        showToast('Please enter or select a tenant name.');
                        return;
                      }
                      if (isTenantLimitReached && (!selectedTenantObj || isNewTenantMode)) {
                        showAlert({
                          type: 'warning',
                          title: 'Tenant Quota Reached',
                          message: `Tenant quota reached (${myTenants.length}/${maxTenants} on ${currentPlanName} plan). Upgrade to add more tenants.`,
                        });
                        return;
                      }
                      setWizardStep(2);
                    } else if (wizardStep === 2) {
                      if (!uploadUnitId && !uploadUnit) {
                        showToast('Please select a unit.');
                        return;
                      }
                      const rentNum = parseFloat(uploadRent);
                      if (!rentNum || rentNum <= 0) {
                        showToast('Please enter a monthly rent amount.');
                        return;
                      }
                      if (!uploadStartDate || !uploadEndDate) {
                        showToast('Please enter both lease start and end dates.');
                        return;
                      }
                      if (new Date(uploadStartDate) >= new Date(uploadEndDate)) {
                        showToast('Lease end date must be after lease start date.');
                        return;
                      }
                      setWizardStep(3);
                    } else {
                      handleDirectUploadAgreement();
                    }
                  }}
                  activeOpacity={0.85}
                >
                  {wizardStep < 3 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Text style={styles.modalWebSubmitBtnText}>Continue</Text>
                      <Feather name="arrow-right" size={14} color="#FFFFFF" />
                    </View>
                  ) : (
                    <Text style={[styles.modalWebSubmitBtnText, { textAlign: 'center' }]}>
                      {uploadExecutionMode === 'already_executed_offline'
                        ? 'Add Tenant Directly'
                        : 'Send Lease Invitation'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 6: NOTICE / VACATE MODAL                       */}
      {/* ==================================================== */}
      <Modal visible={showTerminateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalTop}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Initiate Move-Out Notice</Text>
                <Text style={[styles.modalSub, { color: colors.inkSoft }]}>
                  {selectedTerminateAg?.tenant} • Unit {selectedTerminateAg?.unit}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowTerminateModal(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalFieldLabel}>Target Move-Out Date</Text>
            <TextInput
              style={styles.modalInput}
              value={vacateDate}
              onChangeText={setVacateDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.modalFieldLabel}>Reason for Notice</Text>
            <TextInput
              style={styles.modalInput}
              value={terminateReason}
              onChangeText={setTerminateReason}
              placeholder="e.g. Relocating for employment"
              placeholderTextColor="#94A3B8"
            />

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { backgroundColor: '#DC2626' }]}
              onPress={handleConfirmTerminate}
              activeOpacity={0.85}
            >
              <Text style={styles.modalSubmitBtnText}>Register Notice to Vacate</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==================================================== */}
      {/* MODAL 7: UPLOAD AGREEMENT TEMPLATE MODAL             */}
      {/* ==================================================== */}
      <Modal visible={showUploadTemplateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, maxHeight: '90%' }]}>
            <View style={styles.modalTop}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Upload Agreement Document</Text>
                <Text style={[styles.modalSub, { color: colors.inkSoft }]} numberOfLines={1}>
                  Add reusable templates & legal contracts to your library
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowUploadTemplateModal(false);
                }}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Document Title */}
              <Text style={styles.modalFieldLabel}>Document Title *</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: isDark ? colors.surfaceSunken : '#FFFFFF', color: colors.navy }]}
                value={templateTitle}
                onChangeText={setTemplateTitle}
                placeholder="e.g. Master Residential Lease Agreement 2026"
                placeholderTextColor={colors.inkSoft}
              />

              {/* Associated Property */}
              <Text style={styles.modalFieldLabel}>Associated Property</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      { backgroundColor: colors.surface, borderColor: colors.line },
                      templatePropertyId === 'all' && styles.filterChipActive,
                    ]}
                    onPress={() => setTemplatePropertyId('all')}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        { color: colors.inkSoft },
                        templatePropertyId === 'all' && styles.filterTextActive,
                      ]}
                    >
                      All Properties (Global)
                    </Text>
                  </TouchableOpacity>

                  {myProperties.map((p) => {
                    const isSelected = templatePropertyId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[
                          styles.filterChip,
                          { backgroundColor: colors.surface, borderColor: colors.line },
                          isSelected && styles.filterChipActive,
                        ]}
                        onPress={() => setTemplatePropertyId(p.id)}
                      >
                        <Text
                          style={[
                            styles.filterText,
                            { color: colors.inkSoft },
                            isSelected && styles.filterTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Document File Touch Card */}
              <Text style={styles.modalFieldLabel}>Agreement Document File (PDF or Image) *</Text>
              <TouchableOpacity
                style={[
                  styles.documentFileCard,
                  {
                    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
                    borderColor: templateFileData ? (isDark ? '#34D399' : '#059669') : colors.line,
                  },
                ]}
                onPress={async () => {
                  try {
                    const picked = await pickDocument({ type: ['application/pdf', 'image/*'] });
                    if (picked) {
                      setTemplateFileName(picked.name);
                      setTemplateFileSize(picked.size ? Math.round(picked.size / 1024) : 450);
                      const rawData = picked.base64 || picked.uri;
                      try {
                        const safeUrl = await uploadOrCompressDocument(
                          rawData,
                          `agreement_templates/${Date.now()}_${picked.name}`
                        );
                        setTemplateFileData(safeUrl);
                      } catch {
                        setTemplateFileData(rawData);
                      }
                      showToast(`${picked.name} selected`, 'success');
                    }
                  } catch (err: any) {
                    showToast(err?.message || 'Could not attach document.', 'error');
                  }
                }}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 8 }}>
                  <Feather
                    name={templateFileData ? 'check-circle' : 'file-text'}
                    size={20}
                    color={templateFileData ? '#059669' : colors.inkSoft}
                  />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text
                      style={[styles.documentFileName, { color: colors.navy }]}
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {templateFileName || 'Tap to choose agreement file'}
                    </Text>
                    <Text style={[styles.documentFileSize, { color: colors.inkSoft }]}>
                      {templateFileSize ? `${templateFileSize} KB` : 'Supports PDF, JPEG, PNG'}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.readyBadge,
                    templateFileData && { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5' },
                  ]}
                >
                  <Text style={styles.readyBadgeText}>{templateFileData ? 'Attached ✓' : 'Browse'}</Text>
                </View>
              </TouchableOpacity>

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 10 }}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setShowUploadTemplateModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalWebSubmitBtn,
                    (!templateTitle.trim() || !templateFileData || isUploadingTemplate) && { opacity: 0.5 },
                  ]}
                  disabled={!templateTitle.trim() || !templateFileData || isUploadingTemplate}
                  onPress={handleSaveNewTemplate}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalWebSubmitBtnText}>
                    {isUploadingTemplate ? 'Saving...' : 'Save to Library'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Universal Document Inspection & Viewer Modal */}
      <DocumentViewerModal
        visible={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
        onAttachFile={async (dataUrl, fileName) => {
          if (previewDoc?.meta?.agreementId) {
            const agId = previewDoc.meta.agreementId;
            const ag = (myAgreements || []).find((a) => a.id === agId);
            if (ag) {
              const safeUrl = await uploadOrCompressDocument(
                dataUrl,
                `agreements/${ag.id}/${Date.now()}_${fileName}`
              );
              if (previewDoc.title?.includes('Landlord Dispatched') || previewDoc.title?.includes('Draft')) {
                updateAgreement(ag.id, { initialAgreementUrl: safeUrl, initialAgreementName: fileName });
              } else {
                updateAgreement(ag.id, { signedDocumentUrl: safeUrl, signedDocumentName: fileName });
              }
            }
          }
        }}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 110,
    flexGrow: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 14,
    paddingVertical: 2,
  },
  tabButton: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: isDark ? colors.surfaceMuted : '#E9EDF2',
    borderWidth: 1,
    borderColor: isDark ? colors.line : '#D1D9E0',
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  limitWarningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  limitWarningTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
  },
  limitWarningSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: colors.navy,
    paddingVertical: 0,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  metaHint: {
    fontSize: 12.5,
    color: colors.inkSoft,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  headerUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexShrink: 0,
  },
  headerUploadBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipScroll: {
    marginBottom: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  agreementCode: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.5,
  },
  unitName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 2,
  },
  unitNameBold: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  tenantSub: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  activeBadge: {
    backgroundColor: '#ECFDF5',
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  activeBadgeText: {
    color: '#059669',
  },
  pendingBadgeText: {
    color: '#D97706',
  },
  stepBadgeSubtext: {
    fontSize: 9.5,
    color: '#D97706',
    fontWeight: '700',
    marginTop: 3,
  },
  agreementGrid: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 10,
    marginVertical: 8,
  },
  agGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  agGridCol: {
    flex: 1,
  },
  agGridLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  agGridValBold: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  agGridVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  agGridSub: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 1,
  },
  docRepositoryStrip: {
    flexDirection: 'column',
    gap: 6,
    marginVertical: 4,
    width: '100%',
  },
  docBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: '100%',
    maxWidth: '100%',
  },
  docBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#B45309',
    flex: 1,
  },
  docBadgeSigned: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: '100%',
    maxWidth: '100%',
  },
  docBadgeSignedText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
    flex: 1,
  },
  approvalRequiredBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
  },
  approvalRequiredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  approvalRequiredTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginLeft: 6,
  },
  approvalRequiredFile: {
    fontSize: 11,
    color: '#B45309',
    marginBottom: 8,
  },
  approveLeaseBtn: {
    backgroundColor: '#D97706',
    borderRadius: 7,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveLeaseBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  depositPendingBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
  },
  depositPendingTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  depositPendingSub: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 2,
    lineHeight: 15,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  detailsActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 8,
    gap: 5,
  },
  detailsActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  renewalActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 5,
  },
  renewalActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  noticeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  noticeActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  // Renewals Subtab Styles
  renewalNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  renewalNoticeText: {
    flex: 1,
    fontSize: 11.5,
    color: '#1E40AF',
    lineHeight: 16,
  },
  renewalTwoBoxGrid: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
  },
  renewalBox: {
    flex: 1,
  },
  renewalBoxLabel: {
    fontSize: 10,
    color: colors.inkSoft,
    marginBottom: 2,
  },
  renewalBoxVal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  termsSnippetStrip: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  termsSnippetText: {
    fontSize: 11,
    color: colors.inkSoft,
  },
  renewalActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  activeRenewalText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  offerNextTermBtn: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  offerNextTermBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.navy,
  },
  reviewSignedRenewalBtn: {
    backgroundColor: '#D97706',
    borderRadius: 8,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  reviewSignedRenewalBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  offerRenewalCTA: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  offerRenewalCTAText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  // Applications Subtab Styles
  applicantNameTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 2,
  },
  screeningBadgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
    flexWrap: 'wrap',
  },
  trustScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  trustScoreText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  kycVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kycVerifiedText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  applicantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
  },
  applicantGridCol: {
    width: '50%',
  },
  appGridLabel: {
    fontSize: 10,
    color: colors.inkSoft,
    marginBottom: 1,
  },
  appGridVal: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.navy,
  },
  appNoteBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    padding: 8,
    marginBottom: 10,
  },
  appNoteLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.inkSoft,
    marginBottom: 2,
  },
  appNoteText: {
    fontSize: 11,
    color: colors.ink,
    lineHeight: 15,
  },
  appActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  declineAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  declineAppBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  approveAppBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 8,
  },
  approveAppBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  appSettledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  appSettledText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#065F46',
  },
  // Single Web-Parity Floating Action Button
  singleFabContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  singleFabBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 14,
  },
  singleFabBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // Modals Styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.navy,
  },
  modalSub: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  modalFieldLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.navy,
  },
  modalSubmitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 14,
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  modalCloseBtn: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  modalCloseBtnText: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  // Details Modal
  detailsSection: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  detailsSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailsLabel: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  detailsVal: {
    fontSize: 12,
    color: colors.navy,
    fontWeight: '600',
  },
  detailsDocBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 10,
  },
  detailsDocName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
  },
  detailsDocSub: {
    fontSize: 10,
    color: colors.inkSoft,
    marginTop: 1,
  },
  // Approval Modal
  approvalInspectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  approvalInspectionFile: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  approvalInspectionSub: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  approvalDepositBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  approvalDepositLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 3,
  },
  approvalDepositText: {
    fontSize: 11.5,
    color: '#1E3A8A',
    lineHeight: 16,
  },
  approvePrimaryCTA: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  approvePrimaryCTAText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  // Renewal Offer Modal
  currentRentStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  currentRentLabel: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  currentRentVal: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.navy,
  },
  escalationPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  escalationPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  escalationPillActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  escalationPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  escalationPillTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  calcPreviewBox: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 4,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calcLabel: {
    fontSize: 11.5,
    color: colors.inkSoft,
  },
  calcVal: {
    fontSize: 11.5,
    color: colors.navy,
    fontWeight: '600',
  },
  durationPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  durationPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  durationPillActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  durationPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  durationPillTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  datesGrid: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  dateCol: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 10,
    color: colors.inkSoft,
    marginBottom: 2,
  },
  dateVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
  },
  // Upload modal Web Parity Styles
  unitSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 8,
  },
  unitSelectChipActive: {
    backgroundColor: '#FFFBEB',
    borderColor: '#D97706',
  },
  unitSelectChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  unitSelectChipTextActive: {
    color: '#92400E',
    fontWeight: '700',
  },
  autoRenewPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  autoRenewPillActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  autoRenewPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  autoRenewPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  workflowCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  workflowCardActive: {
    borderColor: '#10B981',
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  workflowCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
    marginLeft: 8,
  },
  workflowCardDesc: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 6,
    marginLeft: 26,
    lineHeight: 16,
  },
  offlineDepositBox: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  offlineDepositLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.navy,
    marginLeft: 8,
    flex: 1,
  },
  documentFileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  documentFileName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy,
  },
  documentFileSize: {
    fontSize: 10.5,
    color: colors.inkSoft,
    marginTop: 1,
  },
  readyBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  readyBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  modalWebSubmitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalWebSubmitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Wizard stepper styles — Web Parity
  wizardStepperBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: 0,
  },
  wizardStepNode: {
    alignItems: 'center',
    flexShrink: 0,
  },
  wizardStepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: isDark ? colors.surfaceSunken : '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  wizardStepCircleActive: {
    backgroundColor: '#10B981',
  },
  wizardStepCirclePassed: {
    backgroundColor: '#059669',
  },
  wizardStepCircleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  wizardStepLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.inkSoft,
    textAlign: 'center',
  },
  wizardStepLabelActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  wizardStepLabelPassed: {
    color: colors.ink,
    fontWeight: '600',
  },
  wizardConnector: {
    flex: 1,
    height: 1.5,
    backgroundColor: isDark ? colors.surfaceSunken : '#CBD5E1',
    marginBottom: 18,
    marginHorizontal: 4,
  },
  wizardConnectorPassed: {
    backgroundColor: '#059669',
  },
  // Wizard footer
  wizardFooter: {
    flexDirection: 'column',
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 14,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  wizardFooterBackBtn: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardFooterBackBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  emptyContainer: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  dropdownValueText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  dropdownMenuBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    marginTop: -4,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  dropdownMenuItemActive: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  dropdownMenuText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  selectedTenantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  selectedTenantText: {
    fontSize: 11.5,
    color: '#065F46',
    flex: 1,
  },
  // legacy - kept for reference but no longer used for the wizard
  wizardStepIndicator: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  wizardStepItem: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  wizardStepItemActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  wizardStepItemPassed: {
    backgroundColor: 'transparent',
  },
  wizardStepText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  wizardStepTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  wizardStepTextPassed: {
    color: '#059669',
    fontWeight: '600',
  },
  modalSaveDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(5, 150, 105, 0.12)' : '#ECFDF5',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(5, 150, 105, 0.3)' : '#6EE7B7',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  modalSaveDraftBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: isDark ? '#A7F3D0' : '#065F46',
  },
  });
