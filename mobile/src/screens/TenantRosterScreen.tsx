import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Modal,
  Alert,
  Linking,
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { collection, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { Header } from '../components/Header';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { MobileTenantRecord, MobileTenancyRequest, MobileRequiredIdItem, MobileAgreementTemplate } from '../types';
import { LeasingHubScreen } from './LeasingHubScreen';
import { pickDocument } from '../lib/nativePicker';
import { usePlanLimits, ResourceQuotaType } from '../hooks/usePlanLimits';
import { PlanLimitModal } from '../components/PlanLimitModal';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { useMobileAlert } from '../context/MobileAlertContext';
import { useMobileToast } from '../context/MobileToastContext';

interface TenantRosterScreenProps {
  onProfilePress?: () => void;
  onSelectTenant360?: (tenantId: string) => void;
  onInitiateVacatePress?: (unitId: string) => void;
  onUploadAgreementPress?: () => void;
  onNavigate?: (screenKey: string) => void;
}

export const TenantRosterScreen: React.FC<TenantRosterScreenProps> = ({
  onProfilePress,
  onSelectTenant360,
  onInitiateVacatePress,
  onUploadAgreementPress,
  onNavigate,
}) => {
  const { state, addTenant, sendTenancyRequest, updateTenancyRequest, saveUnit } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency, currencySymbol } = useMobileCurrency();
  const { usage, currentPlanName } = usePlanLimits();
  const { colors, isDark } = useMobileTheme();
  const { showAlert } = useMobileAlert();
  const { showToast } = useMobileToast();
  const [limitModalType, setLimitModalType] = useState<ResourceQuotaType | null>(null);

  const [activeTab, setActiveTab] = useState<'active' | 'requests'>('active');
  const [search, setSearch] = useState('');

  const formatUnitLabel = (u?: string) => {
    if (!u || u === 'Unassigned') return 'Unassigned';
    const clean = u.trim();
    if (/^unit\s+/i.test(clean)) return clean;
    return `Unit ${clean}`;
  };

  // Add Resident Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('Tenant@123');
  const ownerProperties = useMemo(() => {
    return state.properties.filter((p) => p.ownerId === user.id);
  }, [state.properties, user.id]);

  const ownerPropertyIds = useMemo(() => {
    return new Set(ownerProperties.map((p) => p.id));
  }, [ownerProperties]);

  const ownerUnits = useMemo(() => {
    return state.units.filter((u) => u.ownerId === user.id || (u.propertyId && ownerPropertyIds.has(u.propertyId)));
  }, [state.units, user.id, ownerPropertyIds]);

  const [selectedPropertyId, setSelectedPropertyId] = useState(ownerProperties[0]?.id || '');
  const [selectedUnitId, setSelectedUnitId] = useState(ownerUnits[0]?.id || '');
  const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);
  const [newRent, setNewRent] = useState(ownerUnits[0]?.rent ? String(ownerUnits[0].rent) : '');
  const [newDeposit, setNewDeposit] = useState(ownerUnits[0]?.deposit ? String(ownerUnits[0].deposit) : (ownerUnits[0]?.rent ? String(ownerUnits[0].rent * 2) : ''));
  const [newStart, setNewStart] = useState(new Date().toISOString().split('T')[0]);
  const [newEnd, setNewEnd] = useState(new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0]);
  const [newFileName, setNewFileName] = useState('Lease_Agreement.pdf');
  const [newFileData, setNewFileData] = useState<string>('');
  const [newRequireId, setNewRequireId] = useState(false);
  const [newIdList, setNewIdList] = useState<MobileRequiredIdItem[]>([
    { id: 'new_id_1', name: 'Voter ID' },
  ]);
  const [newCustomInput, setNewCustomInput] = useState('');
  const [onboardSignal, setOnboardSignal] = useState(0);

  // Search & Invite Registered Tenant Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [livePlatformTenants, setLivePlatformTenants] = useState<Array<{ id: string; name: string; email: string; phone: string; unit?: string }>>([]);
  const [isFetchingCandidates, setIsFetchingCandidates] = useState(false);
  const [reqPropertyId, setReqPropertyId] = useState(ownerProperties[0]?.id || '');
  const [reqUnitId, setReqUnitId] = useState(ownerUnits[0]?.id || '');
  const [isReqUnitDropdownOpen, setIsReqUnitDropdownOpen] = useState(false);
  const [reqRent, setReqRent] = useState(ownerUnits[0]?.rent ? String(ownerUnits[0].rent) : '');
  const [reqDeposit, setReqDeposit] = useState(ownerUnits[0]?.deposit ? String(ownerUnits[0].deposit) : (ownerUnits[0]?.rent ? String(ownerUnits[0].rent * 2) : ''));
  const [reqStart, setReqStart] = useState(new Date().toISOString().split('T')[0]);
  const [reqEnd, setReqEnd] = useState(new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0]);
  const [reqMessage, setReqMessage] = useState(
    'We would love to welcome you as a resident! Please review the terms and accept to finalize your tenancy.'
  );
  const [reqFileName, setReqFileName] = useState('Standard_Tenancy_Agreement.pdf');
  const [reqFileData, setReqFileData] = useState<string>('');
  const [reqRequireId, setReqRequireId] = useState(false);
  const [reqIdList, setReqIdList] = useState<MobileRequiredIdItem[]>([
    { id: 'req_id_1', name: 'Voter ID' },
  ]);
  const [newAgreementSource, setNewAgreementSource] = useState<'upload' | 'library'>('upload');
  const [newSelectedTemplateId, setNewSelectedTemplateId] = useState<string>('');
  const [reqAgreementSource, setReqAgreementSource] = useState<'upload' | 'library'>('upload');
  const [reqSelectedTemplateId, setReqSelectedTemplateId] = useState<string>('');

  const myTemplates: MobileAgreementTemplate[] = useMemo(() => {
    const isAdmin = (user?.role as any) === 'superadmin' || (user?.role as any) === 'admin';
    const custom = (state.agreementTemplates || []).filter(
      (t) => t.ownerId === (user?.id || '') || isAdmin
    );
    const fromAg: MobileAgreementTemplate[] = [];
    const seen = new Set(custom.map((t) => (t.fileName || t.title).toLowerCase()));
    (state.agreements || []).forEach((a) => {
      const agAny = a as any;
      if ((a.ownerId === (user?.id || '') || isAdmin) && agAny.fileData && agAny.fileName) {
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
  }, [state.agreementTemplates, state.agreements, user?.id, user?.role]);

  const [reqCustomInput, setReqCustomInput] = useState('');

  const ownerId = user?.id || '';
  const ownerEmail = (user?.email || '').toLowerCase();
  const ownerName = (user?.displayName || '').toLowerCase();

  const isGenericName = (n?: string) => {
    if (!n) return true;
    const s = n.trim().toLowerCase();
    return s === 'property owner' || s === 'landlord' || s === 'owner' || s === 'admin' || s === 'manager';
  };

  const myProperties = useMemo(() => {
    if (!ownerId) return [];
    return state.properties.filter(
      (p) =>
        p.ownerId === ownerId ||
        (ownerEmail && (p as any).ownerEmail?.toLowerCase() === ownerEmail)
    );
  }, [state.properties, ownerId, ownerEmail]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    if (!ownerId) return [];
    return state.units.filter(
      (u) =>
        u.ownerId === ownerId ||
        (u.propertyId && myPropertyIds.has(u.propertyId))
    );
  }, [state.units, ownerId, myPropertyIds]);

  const myUnitIds = useMemo(() => new Set(myUnits.map((u) => u.id)), [myUnits]);

  const selectedUnitObj = useMemo(
    () => myUnits.find((u) => u.id === selectedUnitId) || myUnits[0],
    [myUnits, selectedUnitId]
  );
  const reqUnitObj = useMemo(
    () => myUnits.find((u) => u.id === reqUnitId) || myUnits[0],
    [myUnits, reqUnitId]
  );

  const myTenants = useMemo(() => {
    if (!ownerId) return [];

    const tenantMap = new Map<string, typeof state.tenants[0]>();

    state.tenants.forEach((t) => {
      // Find matching unit that is actually occupied or reserved for this tenant
      const matchingUnit = myUnits.find(
        (u) =>
          (u.currentTenantId === t.id ||
            (t.unit && t.unit !== 'Unassigned' && (u.id === t.unit || (u.unitNumber === t.unit && u.propertyId && myPropertyIds.has(u.propertyId))))) &&
          (u.status === 'occupied' || u.status === 'reserved')
      );

      // Find non-terminated, non-cancelled agreement with no pending or cancelled request
      const matchingAgr = (state.agreements || []).find(
        (a) => {
          if (a.ownerId !== ownerId && (!a.propertyId || !myPropertyIds.has(a.propertyId))) return false;
          const matchesTenant = a.tenantId === t.id || (a.tenantEmail && t.email && a.tenantEmail.toLowerCase() === t.email.toLowerCase());
          if (!matchesTenant) return false;
          if (a.status === 'terminated' || a.status === 'cancelled') return false;

          // Guard: If request was cancelled, declined, or is still pending unaccepted, agreement cannot establish active residency
          const hasUnsettledReq = (state.tenancyRequests || []).some(
            (r) =>
              (r.status === 'declined' || r.status === 'cancelled' || r.status === 'pending') &&
              (((r as any).agreementId && (r as any).agreementId === a.id) ||
                ((r.unitNumber === a.unit || r.unitId === a.unit) &&
                  (r.tenantId === t.id || (r.tenantEmail && t.email && r.tenantEmail.toLowerCase() === t.email.toLowerCase()))))
          );
          if (hasUnsettledReq) return false;

          return true;
        }
      );

      // Find accepted tenancy request
      const matchingAcceptedReq = (state.tenancyRequests || []).find(
        (r) =>
          r.status === 'accepted' &&
          (r.ownerId === ownerId || (r.propertyId && myPropertyIds.has(r.propertyId))) &&
          (r.tenantId === t.id || (r.tenantEmail && t.email && r.tenantEmail.toLowerCase() === t.email.toLowerCase()))
      );

      // Exclude prospective tenants whose request is pending, declined, or cancelled and who have no separate accepted request or active agreement
      const isDeclinedOrCancelled = (state.tenancyRequests || []).some(
        (r) =>
          (r.status === 'declined' || r.status === 'cancelled') &&
          (r.tenantId === t.id || (r.tenantEmail && t.email && r.tenantEmail.toLowerCase() === t.email.toLowerCase()))
      );
      if (isDeclinedOrCancelled && !matchingAcceptedReq && (!matchingAgr || matchingAgr.status !== 'active')) {
        return;
      }

      // Check if this tenant ONLY has a pending request that hasn't been accepted yet
      const hasOnlyPendingReq = (state.tenancyRequests || []).some(
        (r) =>
          r.status === 'pending' &&
          (r.tenantId === t.id || (r.tenantEmail && t.email && r.tenantEmail.toLowerCase() === t.email.toLowerCase()))
      ) && !matchingAcceptedReq && (!matchingAgr || matchingAgr.status !== 'active');
      if (hasOnlyPendingReq) {
        return;
      }

      // STRICT RESIDENT REQUIREMENT: Must have an active assigned unit OR an active agreement / accepted offer
      if (!matchingUnit && !matchingAgr && !matchingAcceptedReq) {
        return;
      }

      // If unit is Unassigned or empty and has no matching unit or agreement, exclude from Active Residents
      if ((!t.unit || t.unit === 'Unassigned' || (t.unitsRented && t.unitsRented.length === 0)) && !matchingUnit && !matchingAgr) {
        return;
      }

      const matchingProp = myProperties.find(
        (p) => p.id === matchingUnit?.propertyId || p.id === matchingAgr?.propertyId || (t.propertyId && myPropertyIds.has(t.propertyId) ? t.propertyId : undefined)
      );

      const rawUnit =
        matchingUnit?.unitNumber ||
        matchingAgr?.unit ||
        matchingAcceptedReq?.unitNumber ||
        (t.unit && t.unit !== 'Unassigned' ? t.unit : '');

      if (!rawUnit) return;

      const effRent = t.rent > 0 ? t.rent : (matchingUnit?.rent || matchingAgr?.rent || matchingAcceptedReq?.rent || 0);
      const effDeposit = t.deposit > 0 ? t.deposit : (matchingUnit?.deposit || matchingAgr?.deposit || matchingAcceptedReq?.deposit || 0);

      const rec = {
        ...t,
        unit: rawUnit,
        rent: effRent,
        deposit: effDeposit,
        propertyName: matchingProp?.name || t.propertyName || matchingAgr?.propertyName || matchingUnit?.propertyName || 'Property',
        propertyId: matchingProp?.id || t.propertyId || matchingUnit?.propertyId || matchingAgr?.propertyId || '',
      };

      // Key by tenant ID + propertyId/unit to allow multi-property tenants
      const key = `${t.id || t.email}_${rec.propertyId || ''}_${rec.unit}`.toLowerCase();
      tenantMap.set(key, rec);
    });

    // Also discover from verified active agreements in case tenant is in agreements but not in state.tenants
    (state.agreements || []).forEach((a) => {
      if (
        (a.ownerId === ownerId || (a.propertyId && myPropertyIds.has(a.propertyId))) &&
        (a.status === 'active' || a.status === 'pending_deposit' || a.status === 'awaiting_tenant_upload' || a.status === 'pending_approval')
      ) {
        // Exclude if request was cancelled or declined
        const hasDeclinedOrCancelledReq = (state.tenancyRequests || []).some(
          (r) =>
            (r.status === 'declined' || r.status === 'cancelled') &&
            (((r as any).agreementId && (r as any).agreementId === a.id) ||
              ((r.unitNumber === a.unit || r.unitId === a.unit) &&
                (r.tenantId === a.tenantId || (r.tenantEmail && a.tenantEmail && r.tenantEmail.toLowerCase() === a.tenantEmail.toLowerCase()))))
        );
        if (hasDeclinedOrCancelledReq) return;

        // Exclude if invitation is still pending acceptance by tenant
        const hasPendingReq = (state.tenancyRequests || []).some(
          (r) =>
            r.status === 'pending' &&
            (((r as any).agreementId && (r as any).agreementId === a.id) ||
              ((r.unitNumber === a.unit || r.unitId === a.unit) &&
                (r.tenantId === a.tenantId || (r.tenantEmail && a.tenantEmail && r.tenantEmail.toLowerCase() === a.tenantEmail.toLowerCase()))))
        );
        if (hasPendingReq) return;

        const key = `${a.tenantId || a.tenantEmail || a.tenant}_${a.propertyId || ''}_${a.unit}`.toLowerCase();
        if (!tenantMap.has(key)) {
          const prop = myProperties.find((p) => p.id === a.propertyId);
          const matchedTenantUser = state.tenants.find((t) => t.id === a.tenantId || (a.tenantEmail && t.email && t.email.toLowerCase() === a.tenantEmail.toLowerCase()));
          tenantMap.set(key, {
            id: a.tenantId || `TEN-${a.id.slice(-4)}`,
            name: a.tenant || matchedTenantUser?.name || 'Resident',
            email: a.tenantEmail || matchedTenantUser?.email || '',
            phone: (a as any).tenantPhone || (a as any).phone || matchedTenantUser?.phone || '',
            unit: a.unit,
            propertyId: a.propertyId || '',
            propertyName: a.propertyName || prop?.name || '',
            rent: a.rent || 0,
            deposit: a.deposit || 0,
            status: a.status === 'active' ? 'active' : 'pending',
            ownerId: a.ownerId || ownerId,
          } as any);
        }
      }
    });

    return Array.from(tenantMap.values());
  }, [state.tenants, state.agreements, state.tenancyRequests, ownerId, myPropertyIds, myUnits, myProperties]);

  // Filtered residents
  const filteredResidents = useMemo(() => {
    return myTenants.filter((t) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          t.unit.toLowerCase().includes(q) ||
          t.phone.includes(q) ||
          t.email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [myTenants, search]);

  // When search & invite modal opens, fetch fresh platform users and tenants from Firestore immediately (100% Web Parity)
  useEffect(() => {
    if (showInviteModal && isFirebaseConfigured) {
      setIsFetchingCandidates(true);
      const fetchedMap = new Map<string, { id: string; name: string; email: string; phone: string; unit?: string }>();

      Promise.all([
        getDocs(collection(db, 'users')).catch((err) => {
          console.warn('[TenantRosterScreen] users fetch note:', err?.message);
          return null;
        }),
        getDocs(collection(db, 'tenants')).catch((err) => {
          console.warn('[TenantRosterScreen] tenants fetch note:', err?.message);
          return null;
        }),
      ]).then(([usersSnap, tenantsSnap]) => {
        if (usersSnap) {
          usersSnap.forEach((d) => {
            const u = d.data() as any;
            const r = (u.role || '').toLowerCase();
            if (r === 'tenant' || r === 'resident' || (!r && u.email && !u.email.includes('owner') && !u.email.includes('admin'))) {
              const key = u.email ? u.email.toLowerCase().trim() : d.id;
              fetchedMap.set(key, {
                id: d.id,
                name: u.displayName || (u.email ? u.email.split('@')[0] : 'Resident'),
                email: u.email || '',
                phone: u.phone || '',
              });
            }
          });
        }
        if (tenantsSnap) {
          tenantsSnap.forEach((d) => {
            const t = d.data() as any;
            const key = t.email ? t.email.toLowerCase().trim() : (t.id || d.id);
            if (!fetchedMap.has(key)) {
              fetchedMap.set(key, {
                id: t.id || d.id,
                name: t.name || (t.email ? t.email.split('@')[0] : 'Resident'),
                email: t.email || '',
                phone: t.phone || '',
                unit: t.unit && t.unit !== 'Unassigned' ? t.unit : undefined,
              });
            }
          });
        }
        setLivePlatformTenants(Array.from(fetchedMap.values()));
        setIsFetchingCandidates(false);
      }).catch(() => {
        setIsFetchingCandidates(false);
      });
    }
  }, [showInviteModal]);

  // Dynamic Registered Candidate Tenants List (Web Parity: livePlatformTenants + state.users + state.tenants)
  const candidateTenants = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string; phone: string; unit?: string }>();

    // 1. Live fetched platform tenants from Firestore
    livePlatformTenants.forEach((c) => {
      const key = c.email ? c.email.toLowerCase().trim() : c.id;
      map.set(key, c);
    });

    // 2. Platform registered users with role 'tenant' or 'resident'
    (state.users || [])
      .filter((u) => {
        const r = (u.role || '').toLowerCase();
        return r === 'tenant' || r === 'resident' || (!r && u.email && !u.email.includes('owner') && !u.email.includes('admin'));
      })
      .forEach((u) => {
        const key = u.email ? u.email.toLowerCase().trim() : u.id;
        if (!map.has(key)) {
          map.set(key, {
            id: u.id,
            name: u.displayName || (u.email ? u.email.split('@')[0] : 'Resident'),
            email: u.email || '',
            phone: u.phone || '',
          });
        }
      });

    // 3. Platform-wide tenant collection records (Web parity: state.tenants across all properties)
    (state.tenants || []).forEach((t) => {
      const key = t.email ? t.email.toLowerCase().trim() : t.id;
      if (!map.has(key)) {
        map.set(key, {
          id: t.id,
          name: t.name || (t.email ? t.email.split('@')[0] : 'Resident'),
          email: t.email || '',
          phone: t.phone || '',
          unit: t.unit && t.unit !== 'Unassigned' ? t.unit : undefined,
        });
      }
    });

    // 4. Platform agreements
    (state.agreements || []).forEach((a) => {
      if (a.tenantEmail || a.tenant) {
        const key = a.tenantEmail ? a.tenantEmail.toLowerCase().trim() : a.tenantId || a.tenant;
        if (!map.has(key)) {
          map.set(key, {
            id: a.tenantId || `TEN-${a.id.slice(-4)}`,
            name: a.tenant || 'Resident',
            email: a.tenantEmail || '',
            phone: (a as any).tenantPhone || '',
            unit: a.unit || undefined,
          });
        }
      }
    });

    return Array.from(map.values());
  }, [livePlatformTenants, state.users, state.tenants, state.agreements]);

  const filteredCandidates = useMemo(() => {
    if (!candidateSearch.trim()) return candidateTenants;
    const q = candidateSearch.toLowerCase().trim();
    const cleanQ = q.replace(/[^0-9]/g, '');
    return candidateTenants.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(q);
      const emailMatch = c.email.toLowerCase().includes(q);
      const cleanPhone = (c.phone || '').replace(/[^0-9]/g, '');
      const phoneMatch = cleanQ.length > 0 && cleanPhone.includes(cleanQ);
      const unitMatch = c.unit && c.unit.toLowerCase().includes(q);
      return nameMatch || emailMatch || phoneMatch || unitMatch;
    });
  }, [candidateTenants, candidateSearch]);

  // Tenancy requests scoped exactly like Web Tenant360Page (ownerId | ownerEmail | owned property)
  const tenancyRequests = useMemo(() => {
    if (!ownerId && !ownerEmail) return [];
    return (state.tenancyRequests || [])
      .filter((r) => {
        return Boolean(
          (ownerId && r.ownerId === ownerId) ||
          (ownerEmail && (r as any).ownerEmail?.toLowerCase() === ownerEmail) ||
          (r.propertyId && myPropertyIds.has(r.propertyId))
        );
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [state.tenancyRequests, ownerId, ownerEmail, myPropertyIds]);

  const pendingRequestCount = tenancyRequests.filter((r) => r.status === 'pending').length;

  // Provision / Add Resident Direct
  const handleCreateTenant = async () => {
    const cleanEmail = newEmail.trim().toLowerCase();
    const cleanName = newName.trim();
    const cleanPhone = newPhone.trim();

    if (!cleanName || !cleanEmail || !cleanPhone) {
      showAlert({
        type: 'warning',
        title: 'Missing Required Fields',
        message: 'Please provide the resident name, email address, and phone number to continue.',
        primaryButtonText: 'Review Form',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      showAlert({
        type: 'warning',
        title: 'Invalid Email Address',
        message: 'Please provide a valid email address (e.g. resident@example.com).',
        primaryButtonText: 'Correct Email',
      });
      return;
    }

    const phoneDigits = cleanPhone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      showAlert({
        type: 'warning',
        title: 'Invalid Phone Number',
        message: 'Please enter a valid phone number with at least 7 digits (e.g. +971 50 123 4567).',
        primaryButtonText: 'Correct Phone',
      });
      return;
    }

    const assignedUnit = myUnits.find((u) => u.id === selectedUnitId) || myUnits[0];
    if (assignedUnit && assignedUnit.status !== 'vacant') {
      showAlert({
        type: 'warning',
        title: 'Unit Unavailable',
        message: `Unit ${assignedUnit.unitNumber} is currently marked as ${assignedUnit.status.toUpperCase()}. New leases can only be assigned to vacant units.`,
        primaryButtonText: 'Select Vacant Unit',
      });
      return;
    }

    const assignedProp = myProperties.find((p) => p.id === selectedPropertyId || p.id === assignedUnit?.propertyId) || myProperties[0];
    const unitLabel = assignedUnit ? assignedUnit.unitNumber : '';

    // Check if returning tenant
    const existingTenant = state.tenants.find((t) => t.email?.toLowerCase().trim() === cleanEmail);
    const existingUser = (state.users || []).find((u) => u.email?.toLowerCase().trim() === cleanEmail);
    const newUid = existingTenant?.id || existingUser?.id || `usr_tenant_${Date.now()}`;
    const isReturningTenant = Boolean(existingTenant || existingUser);

    const newRecord: MobileTenantRecord = {
      id: newUid,
      name: cleanName,
      phone: cleanPhone || existingTenant?.phone || existingUser?.phone || '',
      email: cleanEmail,
      unit: unitLabel,
      propertyId: assignedProp ? assignedProp.id : '',
      propertyName: assignedProp ? assignedProp.name : 'Residence',
      ownerId: user?.id || '',
      leaseStart: newStart,
      leaseEnd: newEnd,
      rent: Number(newRent) || 0,
      deposit: Number(newDeposit) || 0,
      currency: assignedProp?.currency || viewCurrency || 'USD',
      kycStatus: existingTenant?.kycStatus || 'pending',
      rating: existingTenant?.rating ?? 0,
      policeVerificationDone: existingTenant?.policeVerificationDone || false,
      unitsRented: Array.from(new Set([...(existingTenant?.unitsRented || []), unitLabel].filter(Boolean))),
      history: existingTenant?.history || [],
      kycDocuments: existingTenant?.kycDocuments || [],
    };

    await addTenant(newRecord, newPassword || 'Tenant@123');

    // Update unit to reserved
    if (assignedUnit) {
      saveUnit({
        ...assignedUnit,
        status: 'reserved',
        currentTenantId: newUid,
        tenant: cleanName,
        rent: Number(newRent) || assignedUnit.rent,
        deposit: Number(newDeposit) || assignedUnit.deposit,
      });
    }

    // Create & dispatch official TenancyRequest so it appears in Sent Invitations & Requests
    const requestId = `req_${Date.now()}`;
    const newReq: MobileTenancyRequest = {
      id: requestId,
      ownerId: user?.id || '',
      ownerName: user?.displayName || 'Property Owner',
      ownerEmail: user?.email || '',
      tenantId: newUid,
      tenantName: cleanName,
      tenantEmail: cleanEmail,
      tenantPhone: cleanPhone,
      propertyId: assignedProp?.id || '',
      propertyName: assignedProp?.name || 'Property',
      unitId: assignedUnit?.id || '',
      unitNumber: unitLabel,
      rent: Number(newRent) || 0,
      deposit: Number(newDeposit) || 0,
      currency: assignedProp?.currency || viewCurrency || 'USD',
      leaseStart: newStart,
      leaseEnd: newEnd,
      message: `Welcome to your new home! Please review the attached lease agreement, accept, sign physically, and upload your signed copy to finalize your move-in.`,
      agreementFileName: newFileName || 'Lease_Agreement.pdf',
      agreementFileData: newFileData || undefined,
      agreementFileUrl: newFileData || undefined,
      requireTenantId: newRequireId,
      requiredIdList: newRequireId ? newIdList : [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    sendTenancyRequest(newReq);

    setShowAddModal(false);
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewFileData('');

    showAlert({
      type: 'success',
      title: isReturningTenant ? 'Resident Re-Enrolled' : 'Resident Enrolled & Invited',
      message: isReturningTenant
        ? `Returning resident ${newRecord.name} has been successfully re-onboarded for Unit ${newRecord.unit}. Existing profile and KYC records were preserved.`
        : `Successfully enrolled ${newRecord.name} for Unit ${newRecord.unit}. Account login created and formal tenancy invitation dispatched.`,
      details: [
        { label: 'Resident', value: newRecord.name, icon: 'user' },
        { label: 'Assigned Unit', value: `Unit ${newRecord.unit}`, icon: 'home' },
        { label: 'Account Email', value: newRecord.email, icon: 'mail' },
        { label: 'Tenancy Status', value: 'Offer Dispatched (Reserved)', icon: 'shield' },
        { label: 'Attached Document', value: newFileName || 'Lease Agreement', icon: 'file-text' },
      ],
      primaryButtonText: 'Done',
    });
  };

  // Dispatch Formal Tenancy Request
  const handleSendRequest = () => {
    const cleanCandName = candidateName.trim();
    const cleanCandEmail = candidateEmail.trim().toLowerCase();
    const cleanCandPhone = candidatePhone.trim();

    if (!cleanCandName || !cleanCandEmail) {
      showAlert({
        type: 'warning',
        title: 'Missing Candidate Details',
        message: 'Please specify the candidate name and email to dispatch an invitation.',
        primaryButtonText: 'Got It',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanCandEmail)) {
      showAlert({
        type: 'warning',
        title: 'Invalid Email Address',
        message: 'Please provide a valid email address for the candidate.',
        primaryButtonText: 'Correct Email',
      });
      return;
    }

    if (cleanCandPhone) {
      const pDigits = cleanCandPhone.replace(/\D/g, '');
      if (pDigits.length < 7 || pDigits.length > 15) {
        showAlert({
          type: 'warning',
          title: 'Invalid Phone Number',
          message: 'Please provide a valid candidate phone number with at least 7 digits.',
          primaryButtonText: 'Correct Phone',
        });
        return;
      }
    }

    const targetProp = myProperties.find((p) => p.id === reqPropertyId) || myProperties[0];
    const targetUnit = myUnits.find((u) => u.id === reqUnitId) || myUnits[0];

    if (targetUnit && targetUnit.status !== 'vacant') {
      showAlert({
        type: 'warning',
        title: 'Unit Unavailable',
        message: `Unit ${targetUnit.unitNumber} is currently marked as ${targetUnit.status.toUpperCase()}. Invitations can only be dispatched for vacant units.`,
        primaryButtonText: 'Select Vacant Unit',
      });
      return;
    }

    const existingTenant = state.tenants.find((t) => t.email?.toLowerCase().trim() === cleanCandEmail);
    const existingUser = (state.users || []).find((u) => u.email?.toLowerCase().trim() === cleanCandEmail);
    const targetTenantId = existingTenant?.id || existingUser?.id || `usr_${Date.now()}`;

    const newReq: MobileTenancyRequest = {
      id: `req_${Date.now()}`,
      ownerId: user?.id || '',
      ownerName: user?.displayName || 'Property Owner',
      ownerEmail: user?.email || '',
      tenantId: targetTenantId,
      tenantName: candidateName.trim(),
      tenantEmail: cleanCandEmail,
      tenantPhone: candidatePhone.trim(),
      propertyId: targetProp ? targetProp.id : '',
      propertyName: targetProp ? targetProp.name : '',
      unitId: targetUnit ? targetUnit.id : '',
      unitNumber: targetUnit ? targetUnit.unitNumber : '',
      rent: reqRent !== '' ? (Number(reqRent) || 0) : (targetUnit?.rent || 0),
      deposit: reqDeposit !== '' ? (Number(reqDeposit) || 0) : (targetUnit?.deposit || (targetUnit?.rent ? targetUnit.rent * 2 : 0)),
      currency: targetProp?.currency || viewCurrency || 'USD',
      leaseStart: reqStart,
      leaseEnd: reqEnd,
      message: reqMessage,
      agreementFileName: reqFileName || 'Lease_Agreement.pdf',
      agreementFileData: reqFileData || undefined,
      agreementFileUrl: reqFileData || undefined,
      requireTenantId: reqRequireId,
      requiredIdList: reqRequireId ? reqIdList.filter((item) => item.name.trim()) : undefined,
      requiredIdTypes: reqRequireId ? reqIdList.filter((item) => item.name.trim()).map((item) => item.name.trim()) : undefined,
      requiredIdType: reqRequireId ? (reqIdList.filter((item) => item.name.trim())[0]?.name || 'Government ID') : undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    sendTenancyRequest(newReq);

    // Reserve unit immediately
    if (targetUnit) {
      saveUnit({
        ...targetUnit,
        status: 'reserved',
        currentTenantId: targetTenantId,
        tenant: candidateName.trim(),
        rent: Number(reqRent) || targetUnit.rent,
        deposit: Number(reqDeposit) || targetUnit.deposit,
      });
    }

    setShowInviteModal(false);

    showAlert({
      type: 'success',
      title: 'Tenancy Offer Dispatched',
      message: `Formal tenancy agreement sent to ${newReq.tenantName} for Unit ${newReq.unitNumber}. Unit reserved pending tenant acceptance.`,
      details: [
        { label: 'Candidate', value: newReq.tenantName, icon: 'user' },
        { label: 'Unit', value: `Unit ${newReq.unitNumber}`, icon: 'home' },
        { label: 'Candidate Email', value: newReq.tenantEmail, icon: 'mail' },
        { label: 'Monthly Rent', value: `${currencySymbol}${newReq.rent.toLocaleString()}/mo`, icon: 'dollar-sign' },
      ],
      primaryButtonText: 'Done',
    });
  };

  const handleCancelRequest = (reqId: string) => {
    showAlert({
      type: 'warning',
      title: 'Withdraw Tenancy Request',
      message: 'Are you sure you want to withdraw this tenancy invitation? The unit reservation will be immediately released.',
      primaryButtonText: 'Withdraw Invitation',
      primaryButtonDestructive: true,
      onPrimaryPress: () => {
        updateTenancyRequest(reqId, 'cancelled');
        showAlert({
          type: 'info',
          title: 'Request Withdrawn',
          message: 'The tenancy invitation has been withdrawn and the unit status has been reset.',
          primaryButtonText: 'OK',
        });
      },
      secondaryButtonText: 'Keep Proposal',
    });
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Header */}
      <Header
        title="Tenant Directory"
        onNotificationPress={() => { }}
        onProfilePress={onProfilePress}
      />

      <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Segmented Capsule Tabs */}
          <TourTarget id="tenants-tabs">
            <View style={[styles.tabContainer, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'active' && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
                onPress={() => setActiveTab('active')}
                activeOpacity={0.8}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.tabText, activeTab === 'active' && [styles.tabTextActive, { color: colors.navy }]]}
                >
                  Residents ({myTenants.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'requests' && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
                onPress={() => setActiveTab('requests')}
                activeOpacity={0.8}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.tabText, activeTab === 'requests' && [styles.tabTextActive, { color: colors.navy }]]}
                >
                  Requests ({tenancyRequests.length})
                </Text>
                {pendingRequestCount > 0 && (
                  <View style={styles.tabPendingBadge}>
                    <Text style={styles.tabPendingBadgeText}>{pendingRequestCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </TourTarget>

          {/* TAB 1: ACTIVE RESIDENTS */}
          {activeTab === 'active' && (
            <View>
              {/* Search Bar + Actions */}
              <View style={styles.searchRow}>
                <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <Feather name="search" size={16} color={colors.inkSoft} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.navy }]}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search residents or unit..."
                    placeholderTextColor={colors.inkSoft}
                    autoCapitalize="none"
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Single Onboarding Action (Web Parity: Onboard Tenant) */}
              <View style={styles.dualActionRow}>
                <TouchableOpacity
                  style={[styles.addBannerBtn, { flex: 1, paddingVertical: 11 }]}
                  onPress={() => {
                    if (usage.tenants.isFull) {
                      setLimitModalType('tenants');
                      return;
                    }
                    setOnboardSignal((prev) => prev + 1);
                  }}
                  activeOpacity={0.85}
                >
                  <Feather name="user-plus" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={[styles.addBannerText, { fontSize: 13.5, fontWeight: '700' }]}>+ Onboard Tenant</Text>
                </TouchableOpacity>
              </View>

              {/* Residents List */}
              {filteredResidents.length === 0 ? (
                <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <Feather name="users" size={36} color={colors.inkSoft} />
                  <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Tenants Found</Text>
                  <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                    Invite registered tenants or onboard new residents to start managing leases.
                  </Text>
                </View>
              ) : (
                filteredResidents.map((t) => {
                  const initials = t.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <View key={t.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                      {/* Tenant Header */}
                      <View style={styles.tenantTop}>
                        <View style={[styles.avatar, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                          <Text style={[styles.avatarText, { color: colors.navy }]}>{initials}</Text>
                        </View>
                        <View style={styles.tenantInfo}>
                          <Text style={[styles.tenantName, { color: colors.navy }]}>{t.name}</Text>
                          <Text style={[styles.unitCode, { color: colors.inkSoft }]}>
                            {formatUnitLabel(t.unit)} • {t.propertyName || 'Property'}
                          </Text>
                          <Text style={[styles.contactSub, { color: colors.inkSoft }]}>{t.email}</Text>
                        </View>
                        <View style={styles.kycBadgeGreen}>
                          <Feather name="check" size={10} color="#059669" />
                          <Text style={styles.kycTextGreen}>KYC Verified</Text>
                        </View>
                      </View>

                      {/* Detail Metrics Grid */}
                      <View style={styles.metricsGrid}>
                        <View style={styles.metricItem}>
                          <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Units Rented</Text>
                          <Text style={[styles.metricValue, { color: colors.navy }]}>{formatUnitLabel(t.unit)}</Text>
                        </View>
                        <View style={styles.metricItem}>
                          <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Monthly Rent</Text>
                          <Text style={[styles.metricValue, { color: '#059669' }]}>
                            {format(t.rent, t.currency || viewCurrency)}
                          </Text>
                        </View>
                        <View style={styles.metricItem}>
                          <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Deposit Held</Text>
                          <Text style={[styles.metricValue, { color: colors.navy }]}>
                            {format(t.deposit, t.currency || viewCurrency)}
                          </Text>
                        </View>
                        <View style={styles.metricItem}>
                          <Text style={[styles.metricLabel, { color: colors.inkSoft }]}>Rating / Due</Text>
                          <Text style={[styles.metricValue, { color: colors.navy }]}>{t.rating ? `★ ${t.rating}` : 'Unrated'} • 1st of mo</Text>
                        </View>
                      </View>

                      {/* Card Footer Actions */}
                      <View style={[styles.cardActionsRow, { borderTopColor: colors.line }]}>
                        <TouchableOpacity
                          style={[styles.callBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                          onPress={() => Linking.openURL(`tel:${t.phone}`)}
                          activeOpacity={0.8}
                        >
                          <Feather name="phone" size={14} color={colors.navy} />
                          <Text style={[styles.callBtnText, { color: colors.navy }]}>Call</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.view360Btn}
                          onPress={() => onSelectTenant360?.(t.id)}
                          activeOpacity={0.8}
                        >
                          <Feather name="eye" size={14} color="#059669" />
                          <Text style={styles.view360BtnText}>Profile</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.moveOutBtn}
                          onPress={() => onInitiateVacatePress?.(t.unit)}
                          activeOpacity={0.8}
                        >
                          <Feather name="log-out" size={14} color="#DC2626" />
                          <Text style={styles.moveOutBtnText}>Vacate</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 2: TENANCY REQUESTS & INVITATIONS */}
          {activeTab === 'requests' && (
            <View>
              <TouchableOpacity
                style={styles.primaryFullBtn}
                onPress={() => {
                  if (usage.tenants.isFull) {
                    setLimitModalType('tenants');
                    return;
                  }
                  setOnboardSignal((prev) => prev + 1);
                }}
                activeOpacity={0.85}
              >
                <Feather name="user-plus" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.primaryFullBtnText}>+ Onboard Tenant</Text>
              </TouchableOpacity>

              {tenancyRequests.length === 0 ? (
                <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <Feather name="mail" size={36} color={colors.inkSoft} />
                  <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Tenancy Requests Sent</Text>
                  <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                    Search registered tenants looking for properties and send them a formal lease invitation.
                  </Text>
                </View>
              ) : (
                tenancyRequests.map((r) => {
                  const isPending = r.status === 'pending';
                  const isAccepted = r.status === 'accepted';
                  const isDeclined = r.status === 'declined';
                  const isCancelled = r.status === 'cancelled';

                  return (
                    <View key={r.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                      <View style={styles.reqTop}>
                        <View style={[styles.avatar, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                          <Text style={[styles.avatarText, { color: colors.navy }]}>
                            {r.tenantName.slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={[styles.tenantName, { color: colors.navy }]}>{r.tenantName}</Text>
                          <Text style={[styles.contactSub, { color: colors.inkSoft }]}>
                            {r.tenantEmail} {r.tenantPhone ? `• ${r.tenantPhone}` : ''}
                          </Text>
                          <View style={styles.reqPropertyTag}>
                            <Feather name="map-pin" size={11} color={colors.inkSoft} />
                            <Text style={[styles.reqPropertyText, { color: colors.inkSoft }]} numberOfLines={1}>
                              {r.propertyName?.trim() ? `${r.propertyName.trim()} • Unit ${r.unitNumber}` : `Unit ${r.unitNumber}`}
                            </Text>
                          </View>
                        </View>

                        {/* Status Badge */}
                        <View
                          style={[
                            styles.badgePill,
                            isPending && styles.badgeAmber,
                            isAccepted && styles.badgeGreen,
                            isDeclined && styles.badgeRed,
                            isCancelled && styles.badgeGray,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgePillText,
                              isPending && styles.badgeTextAmber,
                              isAccepted && styles.badgeTextGreen,
                              isDeclined && styles.badgeTextRed,
                              isCancelled && styles.badgeTextGray,
                            ]}
                          >
                            {isPending
                              ? 'Pending Response'
                              : isAccepted
                                ? 'Accepted & Active'
                                : isDeclined
                                  ? 'Declined by Tenant'
                                  : 'Cancelled'}
                          </Text>
                        </View>
                      </View>

                      {/* 3-Pillar Clean Terms Strip */}
                      <View style={[styles.reqPillarStrip, { borderTopColor: colors.line, borderBottomColor: colors.line }]}>
                        <View style={styles.reqPillarCol}>
                          <Text style={[styles.reqPillarLabel, { color: colors.inkSoft }]}>MONTHLY RENT</Text>
                          <Text style={[styles.reqPillarValue, { color: '#059669' }]}>
                            {format(r.rent, r.currency || viewCurrency)}/mo
                          </Text>
                          <Text style={[styles.reqPillarSub, { color: colors.inkSoft }]}>Due on 1st</Text>
                        </View>
                        <View style={[styles.reqPillarCol, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line, paddingHorizontal: 10 }]}>
                          <Text style={[styles.reqPillarLabel, { color: colors.inkSoft }]}>DEPOSIT</Text>
                          <Text style={[styles.reqPillarValue, { color: colors.navy }]}>
                            {format(r.deposit, r.currency || viewCurrency)}
                          </Text>
                          <Text style={[styles.reqPillarSub, { color: colors.inkSoft }]}>Refundable</Text>
                        </View>
                        <View style={[styles.reqPillarCol, { paddingLeft: 10 }]}>
                          <Text style={[styles.reqPillarLabel, { color: colors.inkSoft }]}>LEASE PERIOD</Text>
                          <Text style={[styles.reqPillarValue, { color: colors.navy }]} numberOfLines={1}>
                            {r.leaseStart && r.leaseEnd ? `${r.leaseStart.slice(0, 7)} → ${r.leaseEnd.slice(0, 7)}` : '12 Months'}
                          </Text>
                          <Text style={[styles.reqPillarSub, { color: colors.inkSoft }]} numberOfLines={1}>
                            {r.leaseStart && r.leaseEnd ? `${r.leaseStart} to ${r.leaseEnd}` : 'Standard'}
                          </Text>
                        </View>
                      </View>

                      {/* Document Attached Chip */}
                      {r.agreementFileName && (
                        <View style={styles.reqDocChip}>
                          <Feather name="file-text" size={13} color="#059669" />
                          <Text style={styles.reqDocChipText} numberOfLines={1} ellipsizeMode="middle">
                            {r.agreementFileName}
                          </Text>
                          <Feather name="external-link" size={12} color="#059669" />
                        </View>
                      )}

                      {/* ID Requirement Chip */}
                      {r.requireTenantId && (
                        <View style={styles.reqIdChip}>
                          <Feather name="shield" size={13} color="#2563EB" />
                          <Text style={styles.reqIdChipText} numberOfLines={1} ellipsizeMode="middle">
                            ID Req: {r.requiredIdList && r.requiredIdList.length > 0
                              ? r.requiredIdList.map((i) => i.name).join(', ')
                              : (r.requiredIdTypes && r.requiredIdTypes.length > 0
                                ? r.requiredIdTypes.join(', ')
                                : (r.requiredIdType || 'Government ID Required'))}
                          </Text>
                        </View>
                      )}

                      {/* Action Row */}
                      {isPending && (
                        <View style={styles.reqActionRow}>
                          <TouchableOpacity
                            style={styles.cancelProposalBtn}
                            onPress={() => handleCancelRequest(r.id)}
                            activeOpacity={0.8}
                          >
                            <Feather name="x-circle" size={14} color="#DC2626" />
                            <Text style={styles.cancelProposalText}>Withdraw</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* MODAL 1: ADD RESIDENT (DIRECT PROVISIONING) */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Onboard Tenant</Text>
                <Text style={styles.modalSub}>Search an existing resident or add a new one</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setShowAddModal(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              <Text style={styles.fieldLabel}>Resident Full Name *</Text>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Vikram Malhotra"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.fieldLabel}>Email Address *</Text>
              <TextInput
                style={styles.input}
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="e.g. vikram@example.com"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="e.g. +91 98765 43210"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Temporary Portal Password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Temporary Password"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.fieldLabel}>Select Unit Assignment</Text>
              <TouchableOpacity
                style={[styles.dropdownTrigger, isUnitDropdownOpen && styles.dropdownTriggerActive]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setIsUnitDropdownOpen(!isUnitDropdownOpen);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.dropdownLeft}>
                  <View style={styles.dropdownBadge}>
                    <Text style={styles.dropdownBadgeSymbol}>
                      {selectedUnitObj ? selectedUnitObj.unitNumber : '#'}
                    </Text>
                  </View>
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {selectedUnitObj
                      ? `Unit ${selectedUnitObj.unitNumber} (${selectedUnitObj.status === 'vacant' ? 'Vacant' : 'Occupied'})`
                      : 'Select a unit...'}
                  </Text>
                </View>
                <Feather
                  name={isUnitDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#64748B"
                />
              </TouchableOpacity>

              {isUnitDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                    {myUnits.length === 0 ? (
                      <View style={{ padding: 12, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>No units available</Text>
                      </View>
                    ) : (
                      myUnits.map((u) => {
                        const isSelected = selectedUnitId === u.id;
                        return (
                          <TouchableOpacity
                            key={u.id}
                            style={[
                              styles.dropdownItem,
                              isSelected && styles.dropdownItemActive,
                            ]}
                            onPress={() => {
                              if (u.status !== 'vacant') {
                                Alert.alert(
                                  'Unit Unavailable',
                                  `Unit ${u.unitNumber} is currently marked as ${u.status.toUpperCase()}. New tenants can only be assigned to vacant units.`
                                );
                                return;
                              }
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                              setSelectedUnitId(u.id);
                              setNewRent(String(u.rent));
                              setNewDeposit(String(u.deposit));
                              setIsUnitDropdownOpen(false);
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View
                                style={{
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 4,
                                  backgroundColor: u.status === 'vacant' ? '#ECFDF5' : '#F1F5F9',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: '700',
                                    color: u.status === 'vacant' ? '#059669' : '#64748B',
                                  }}
                                >
                                  {u.status === 'vacant' ? 'VACANT' : 'OCCUPIED'}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.dropdownItemText,
                                  isSelected && styles.dropdownItemTextActive,
                                ]}
                              >
                                Unit {u.unitNumber} • {format(u.rent, viewCurrency)}/mo
                              </Text>
                            </View>
                            {isSelected && <Feather name="check" size={16} color="#059669" />}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}

              <View style={styles.rowTwo}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Monthly Rent ({currencySymbol})</Text>
                  <TextInput
                    style={styles.input}
                    value={newRent}
                    onChangeText={setNewRent}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Deposit ({currencySymbol})</Text>
                  <TextInput
                    style={styles.input}
                    value={newDeposit}
                    onChangeText={setNewDeposit}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Document File Attachment Header with Segmented Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>
                  Attached Lease Agreement
                </Text>

                <View style={{ flexDirection: 'row', backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9', borderRadius: 8, padding: 2, borderWidth: 1, borderColor: colors.line }}>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: newAgreementSource === 'upload' ? '#10B981' : 'transparent',
                    }}
                    onPress={() => setNewAgreementSource('upload')}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: newAgreementSource === 'upload' ? '#FFFFFF' : colors.inkSoft }}>
                      📁 Upload
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: newAgreementSource === 'library' ? '#10B981' : 'transparent',
                    }}
                    onPress={() => setNewAgreementSource('library')}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: newAgreementSource === 'library' ? '#FFFFFF' : colors.inkSoft }}>
                      📄 Library ({myTemplates.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {newAgreementSource === 'upload' ? (
                <TouchableOpacity
                  style={styles.docUploadBox}
                  onPress={async () => {
                    try {
                      const picked = await pickDocument({ type: ['application/pdf', 'image/*'] });
                      if (picked) {
                        setNewFileName(picked.name);
                        setNewFileData(picked.base64 || picked.uri);
                        showToast(`${picked.name} attached`, 'success');
                      }
                    } catch (err: any) {
                      showToast(err?.message || 'Could not attach document.', 'error');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="file-text" size={20} color="#059669" />
                  <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                    <Text style={styles.docUploadTitle}>Upload Document File</Text>
                    <Text style={styles.docUploadSub} numberOfLines={1}>{newFileName} • Tap to choose file</Text>
                  </View>
                  <Ionicons name="cloud-upload-outline" size={18} color="#059669" />
                </TouchableOpacity>
              ) : (
                <View style={{ marginBottom: 12 }}>
                  {myTemplates.length === 0 ? (
                    <View style={[styles.docUploadBox, { justifyContent: 'center', alignItems: 'center', paddingVertical: 14 }]}>
                      <Text style={{ fontSize: 12, color: colors.inkSoft, textAlign: 'center' }}>
                        No templates in library yet. Switch to "Upload" to attach a file.
                      </Text>
                    </View>
                  ) : (
                    <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      <View style={{ gap: 6 }}>
                        {myTemplates.map((t) => {
                          const isSelected = newSelectedTemplateId === t.id || (newFileData && newFileData === t.fileData);
                          return (
                            <TouchableOpacity
                              key={t.id}
                              style={[
                                styles.docUploadBox,
                                {
                                  paddingVertical: 8,
                                  paddingHorizontal: 10,
                                  borderColor: isSelected ? '#10B981' : colors.line,
                                  backgroundColor: isSelected ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5') : (isDark ? colors.surfaceSunken : '#FFFFFF'),
                                },
                              ]}
                              onPress={() => {
                                setNewSelectedTemplateId(t.id);
                                setNewFileName(t.fileName);
                                setNewFileData(t.fileData);
                                showToast(`${t.title} selected from library`, 'success');
                              }}
                              activeOpacity={0.7}
                            >
                              <Feather
                                name={isSelected ? 'check-circle' : 'file-text'}
                                size={16}
                                color={isSelected ? '#059669' : colors.inkSoft}
                              />
                              <View style={{ marginLeft: 8, flex: 1, minWidth: 0 }}>
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
                              <View
                                style={[
                                  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#F1F5F9' },
                                  isSelected && { backgroundColor: '#10B981' },
                                ]}
                              >
                                <Text style={[{ fontSize: 10.5, fontWeight: '700', color: '#475569' }, isSelected && { color: '#FFFFFF' }]}>
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

              {/* Request Resident ID Verification (Optional) - Matching Web */}
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: newRequireId ? '#93C5FD' : '#E2E8F0', marginTop: 12, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    <Feather name="shield" size={18} color={newRequireId ? '#2563EB' : '#64748B'} />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>Request Resident ID Verification (Optional)</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setNewRequireId(!newRequireId)}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: newRequireId ? '#2563EB' : '#CBD5E1',
                      padding: 2,
                      justifyContent: 'center',
                      alignItems: newRequireId ? 'flex-end' : 'flex-start',
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' }} />
                  </TouchableOpacity>
                </View>

                {newRequireId && (
                  <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E40AF' }}>
                        Required Verification Documents:
                      </Text>
                      {/* <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#1D4ED8' }}>
                          {newIdList.length} ID{newIdList.length === 1 ? '' : 's'} Required
                        </Text>
                      </View> */}
                    </View>

                    <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
                      Quick Suggestions (Tap to add):
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {['Voter ID', 'Aadhaar Card', 'PAN Card', 'Passport', 'Driving License'].map((preset) => {
                        const alreadyAdded = newIdList.some((item) => item.name.trim().toLowerCase() === preset.toLowerCase());
                        return (
                          <TouchableOpacity
                            key={preset}
                            disabled={alreadyAdded}
                            onPress={() => {
                              if (!alreadyAdded) {
                                setNewIdList([...newIdList, { id: `id_${Date.now()}_${Math.random().toString().slice(2, 6)}`, name: preset }]);
                              }
                            }}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 6,
                              backgroundColor: alreadyAdded ? '#F1F5F9' : '#FFFFFF',
                              borderWidth: 1,
                              borderColor: alreadyAdded ? '#CBD5E1' : '#2563EB',
                              opacity: alreadyAdded ? 0.5 : 1,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: alreadyAdded ? '#94A3B8' : '#2563EB' }}>
                              {alreadyAdded ? '✓ ' : '+ '}{preset}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {newIdList.map((item, idx) => (
                      <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', width: 22 }}>#{idx + 1}</Text>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 8, fontSize: 13 }]}
                          value={item.name}
                          onChangeText={(val) => {
                            const updated = [...newIdList];
                            updated[idx].name = val;
                            setNewIdList(updated);
                          }}
                          placeholder="e.g. Voter ID, Aadhaar Card, Passport"
                          placeholderTextColor="#94A3B8"
                        />
                        <TouchableOpacity
                          onPress={() => setNewIdList(newIdList.filter((_, i) => i !== idx))}
                          style={{ padding: 6 }}
                        >
                          <Feather name="trash-2" size={16} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    ))}

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 8, fontSize: 13 }]}
                        value={newCustomInput}
                        onChangeText={setNewCustomInput}
                        placeholder="Type custom document requirement..."
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        onPress={() => {
                          if (newCustomInput.trim()) {
                            setNewIdList([...newIdList, { id: `id_${Date.now()}_${Math.random().toString().slice(2, 6)}`, name: newCustomInput.trim() }]);
                            setNewCustomInput('');
                          }
                        }}
                        style={{ backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateTenant}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>Save Resident</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: SEARCH & INVITE REGISTERED TENANT */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Search & Invite Tenant</Text>
                <Text style={styles.modalSub}>Find registered candidates and dispatch offer</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setShowInviteModal(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Search Candidate</Text>
              {candidateName ? (
                <View style={styles.candidateCard}>
                  <View style={styles.candidateAvatar}>
                    <Text style={styles.candidateAvatarText}>
                      {candidateName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || 'TN'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.candidateName}>{candidateName}</Text>
                    <Text style={styles.candidateEmail}>{candidateEmail || 'No email on file'}</Text>
                    <Text style={styles.candidatePhone}>{candidatePhone || 'No phone on file'}</Text>
                  </View>
                  <TouchableOpacity
                    style={{ padding: 6 }}
                    onPress={() => {
                      setCandidateName('');
                      setCandidateEmail('');
                      setCandidatePhone('');
                    }}
                  >
                    <Ionicons name="close-circle" size={22} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginBottom: 12 }}>
                  <View style={styles.candidateSearchBox}>
                    <Feather name="search" size={16} color="#64748B" />
                    <TextInput
                      style={{ flex: 1, marginLeft: 8, fontSize: 13, color: '#0F172A' }}
                      value={candidateSearch}
                      onChangeText={setCandidateSearch}
                      placeholder="Type name, email, or phone to search..."
                      placeholderTextColor="#94A3B8"
                    />
                    {candidateSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setCandidateSearch('')}>
                        <Ionicons name="close-circle" size={16} color="#94A3B8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView style={{ maxHeight: 180, marginTop: 6 }} nestedScrollEnabled>
                    {isFetchingCandidates ? (
                      <View style={{ padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                        <ActivityIndicator size="small" color="#2563EB" />
                        <Text style={{ fontSize: 12, color: '#64748B' }}>Searching registered platform tenants...</Text>
                      </View>
                    ) : filteredCandidates.length === 0 ? (
                      <View style={{ padding: 12, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>
                          {candidateSearch.trim()
                            ? `No registered tenants matching "${candidateSearch}"`
                            : 'No registered tenants found on platform'}
                        </Text>
                      </View>
                    ) : (
                      filteredCandidates.map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 10,
                            backgroundColor: '#F8FAFC',
                            borderRadius: 8,
                            marginBottom: 6,
                            borderWidth: 1,
                            borderColor: '#E2E8F0',
                          }}
                          onPress={() => {
                            setCandidateName(c.name);
                            setCandidateEmail(c.email);
                            setCandidatePhone(c.phone);
                            const targetUnit = (c.unit && myUnits.find((u) => u.unitNumber === c.unit || u.id === c.unit)) ||
                              myUnits.find((u) => u.status === 'vacant') ||
                              myUnits[0];
                            if (targetUnit) {
                              setReqUnitId(targetUnit.id);
                              if (targetUnit.rent) setReqRent(String(targetUnit.rent));
                              if (targetUnit.deposit) setReqDeposit(String(targetUnit.deposit));
                            }
                          }}
                        >
                          <View style={[styles.candidateAvatar, { width: 32, height: 32, borderRadius: 16 }]}>
                            <Text style={[styles.candidateAvatarText, { fontSize: 11 }]}>
                              {c.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0F172A' }}>{c.name}</Text>
                            <Text style={{ fontSize: 11, color: '#64748B' }}>{c.phone || c.email}</Text>
                          </View>
                          <Feather name="plus-circle" size={16} color="#059669" />
                        </TouchableOpacity>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}

              <Text style={styles.fieldLabel}>Target Unit</Text>
              <TouchableOpacity
                style={[styles.dropdownTrigger, isReqUnitDropdownOpen && styles.dropdownTriggerActive]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setIsReqUnitDropdownOpen(!isReqUnitDropdownOpen);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.dropdownLeft}>
                  <View style={styles.dropdownBadge}>
                    <Text style={styles.dropdownBadgeSymbol}>
                      {reqUnitObj ? reqUnitObj.unitNumber : '#'}
                    </Text>
                  </View>
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {reqUnitObj
                      ? `Unit ${reqUnitObj.unitNumber} (${reqUnitObj.status === 'vacant' ? 'Vacant' : 'Occupied'})`
                      : 'Select a unit...'}
                  </Text>
                </View>
                <Feather
                  name={isReqUnitDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#64748B"
                />
              </TouchableOpacity>

              {isReqUnitDropdownOpen && (
                <View style={styles.dropdownMenu}>
                  <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                    {myUnits.length === 0 ? (
                      <View style={{ padding: 12, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>No units available</Text>
                      </View>
                    ) : (
                      myUnits.map((u) => {
                        const isSelected = reqUnitId === u.id;
                        return (
                          <TouchableOpacity
                            key={u.id}
                            style={[
                              styles.dropdownItem,
                              isSelected && styles.dropdownItemActive,
                            ]}
                            onPress={() => {
                              if (u.status !== 'vacant') {
                                Alert.alert(
                                  'Unit Unavailable',
                                  `Unit ${u.unitNumber} is currently marked as ${u.status.toUpperCase()}. Tenancy invitations can only be dispatched for vacant units.`
                                );
                                return;
                              }
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                              setReqUnitId(u.id);
                              setReqRent(String(u.rent));
                              setReqDeposit(String(u.deposit));
                              setIsReqUnitDropdownOpen(false);
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View
                                style={{
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 4,
                                  backgroundColor: u.status === 'vacant' ? '#ECFDF5' : '#F1F5F9',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: '700',
                                    color: u.status === 'vacant' ? '#059669' : '#64748B',
                                  }}
                                >
                                  {u.status === 'vacant' ? 'VACANT' : 'OCCUPIED'}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.dropdownItemText,
                                  isSelected && styles.dropdownItemTextActive,
                                ]}
                              >
                                Unit {u.unitNumber} • {format(u.rent, viewCurrency)}/mo
                              </Text>
                            </View>
                            {isSelected && <Feather name="check" size={16} color="#059669" />}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}

              <View style={styles.rowTwo}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Offered Rent ({currencySymbol})</Text>
                  <TextInput
                    style={styles.input}
                    value={reqRent}
                    onChangeText={setReqRent}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Security Deposit ({currencySymbol})</Text>
                  <TextInput
                    style={styles.input}
                    value={reqDeposit}
                    onChangeText={setReqDeposit}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.rowTwo}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>Lease Start</Text>
                  <TextInput
                    style={styles.input}
                    value={reqStart}
                    onChangeText={setReqStart}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Lease End</Text>
                  <TextInput
                    style={styles.input}
                    value={reqEnd}
                    onChangeText={setReqEnd}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Invitation Message to Resident</Text>
              <TextInput
                style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                value={reqMessage}
                onChangeText={setReqMessage}
                multiline
              />

              {/* Document File Attachment Header with Segmented Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>
                  Attached Tenancy Document
                </Text>

                <View style={{ flexDirection: 'row', backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9', borderRadius: 8, padding: 2, borderWidth: 1, borderColor: colors.line }}>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: reqAgreementSource === 'upload' ? '#10B981' : 'transparent',
                    }}
                    onPress={() => setReqAgreementSource('upload')}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: reqAgreementSource === 'upload' ? '#FFFFFF' : colors.inkSoft }}>
                      📁 Upload
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: reqAgreementSource === 'library' ? '#10B981' : 'transparent',
                    }}
                    onPress={() => setReqAgreementSource('library')}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: reqAgreementSource === 'library' ? '#FFFFFF' : colors.inkSoft }}>
                      📄 Library ({myTemplates.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {reqAgreementSource === 'upload' ? (
                <TouchableOpacity
                  style={styles.docUploadBox}
                  onPress={async () => {
                    try {
                      const picked = await pickDocument({ type: ['application/pdf', 'image/*'] });
                      if (picked) {
                        setReqFileName(picked.name);
                        setReqFileData(picked.base64 || picked.uri);
                        showToast(`${picked.name} attached`, 'success');
                      }
                    } catch (err: any) {
                      showToast(err?.message || 'Could not attach agreement.', 'error');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="file-text" size={20} color="#059669" />
                  <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                    <Text style={styles.docUploadTitle}>Attached Tenancy Document</Text>
                    <Text style={styles.docUploadSub} numberOfLines={1}>{reqFileName} (Tap to change)</Text>
                  </View>
                  <Feather name="upload-cloud" size={18} color="#059669" />
                </TouchableOpacity>
              ) : (
                <View style={{ marginBottom: 12 }}>
                  {myTemplates.length === 0 ? (
                    <View style={[styles.docUploadBox, { justifyContent: 'center', alignItems: 'center', paddingVertical: 14 }]}>
                      <Text style={{ fontSize: 12, color: colors.inkSoft, textAlign: 'center' }}>
                        No templates in library yet. Switch to "Upload" to attach a file.
                      </Text>
                    </View>
                  ) : (
                    <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      <View style={{ gap: 6 }}>
                        {myTemplates.map((t) => {
                          const isSelected = reqSelectedTemplateId === t.id || (reqFileData && reqFileData === t.fileData);
                          return (
                            <TouchableOpacity
                              key={t.id}
                              style={[
                                styles.docUploadBox,
                                {
                                  paddingVertical: 8,
                                  paddingHorizontal: 10,
                                  borderColor: isSelected ? '#10B981' : colors.line,
                                  backgroundColor: isSelected ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5') : (isDark ? colors.surfaceSunken : '#FFFFFF'),
                                },
                              ]}
                              onPress={() => {
                                setReqSelectedTemplateId(t.id);
                                setReqFileName(t.fileName);
                                setReqFileData(t.fileData);
                                showToast(`${t.title} selected from library`, 'success');
                              }}
                              activeOpacity={0.7}
                            >
                              <Feather
                                name={isSelected ? 'check-circle' : 'file-text'}
                                size={16}
                                color={isSelected ? '#059669' : colors.inkSoft}
                              />
                              <View style={{ marginLeft: 8, flex: 1, minWidth: 0 }}>
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
                              <View
                                style={[
                                  { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#F1F5F9' },
                                  isSelected && { backgroundColor: '#10B981' },
                                ]}
                              >
                                <Text style={[{ fontSize: 10.5, fontWeight: '700', color: '#475569' }, isSelected && { color: '#FFFFFF' }]}>
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

              {/* Mandatory Resident ID Document Toggle & Multi-ID Builder */}
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: reqRequireId ? '#93C5FD' : '#E2E8F0', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    <Feather name="shield" size={18} color={reqRequireId ? '#2563EB' : '#64748B'} />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>Mandate Resident Government ID</Text>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>Require resident to upload official ID documents with signed lease</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setReqRequireId(!reqRequireId)}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: reqRequireId ? '#2563EB' : '#CBD5E1',
                      padding: 2,
                      justifyContent: 'center',
                      alignItems: reqRequireId ? 'flex-end' : 'flex-start',
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' }} />
                  </TouchableOpacity>
                </View>

                {reqRequireId && (
                  <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E40AF' }}>
                        Required Verification Documents:
                      </Text>
                      <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#1D4ED8' }}>
                          {reqIdList.length} ID{reqIdList.length === 1 ? '' : 's'} Required
                        </Text>
                      </View>
                    </View>

                    <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
                      Quick Suggestions (Tap to add):
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {['Voter ID', 'Aadhaar Card', 'PAN Card', 'Passport', 'Driving License'].map((preset) => {
                        const alreadyAdded = reqIdList.some((item) => item.name.trim().toLowerCase() === preset.toLowerCase());
                        return (
                          <TouchableOpacity
                            key={preset}
                            disabled={alreadyAdded}
                            onPress={() => {
                              if (!alreadyAdded) {
                                setReqIdList([...reqIdList, { id: `id_${Date.now()}_${Math.random().toString().slice(2, 6)}`, name: preset }]);
                              }
                            }}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 6,
                              backgroundColor: alreadyAdded ? '#F1F5F9' : '#FFFFFF',
                              borderWidth: 1,
                              borderColor: alreadyAdded ? '#CBD5E1' : '#2563EB',
                              opacity: alreadyAdded ? 0.5 : 1,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: alreadyAdded ? '#94A3B8' : '#2563EB' }}>
                              {alreadyAdded ? '✓ ' : '+ '}{preset}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* ID List Entries with delete and name edit */}
                    <View style={{ gap: 8, marginBottom: 10 }}>
                      {reqIdList.map((item, idx) => (
                        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#4338CA' }}>{idx + 1}</Text>
                          </View>
                          <TextInput
                            style={[styles.input, { flex: 1, height: 38, fontSize: 12, marginBottom: 0 }]}
                            placeholder="e.g. Voter ID, Aadhaar Card, Passport..."
                            value={item.name}
                            onChangeText={(text) => {
                              const updated = [...reqIdList];
                              updated[idx].name = text;
                              setReqIdList(updated);
                            }}
                          />
                          {reqIdList.length > 1 && (
                            <TouchableOpacity
                              onPress={() => setReqIdList(reqIdList.filter((_, i) => i !== idx))}
                              style={{ width: 32, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEE2E2', borderRadius: 8 }}
                              activeOpacity={0.7}
                            >
                              <Feather name="trash-2" size={15} color="#DC2626" />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </View>

                    {/* Add Custom / Additional ID Button */}
                    <TouchableOpacity
                      onPress={() => {
                        setReqIdList([...reqIdList, { id: `id_${Date.now()}_${Math.random().toString().slice(2, 6)}`, name: '' }]);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 7,
                        backgroundColor: '#EFF6FF',
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: '#93C5FD',
                        borderRadius: 8,
                        gap: 6,
                      }}
                      activeOpacity={0.8}
                    >
                      <Feather name="plus-circle" size={14} color="#2563EB" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>Add Another ID Document</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSendRequest}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>Send Proposal</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Plan Quota Limit Interception Modal */}
      <PlanLimitModal
        visible={limitModalType !== null}
        resourceType={limitModalType}
        currentUsage={limitModalType ? usage[limitModalType].used : 0}
        limit={limitModalType ? usage[limitModalType].max : 0}
        planName={currentPlanName}
        onClose={() => setLimitModalType(null)}
        onUpgrade={() => {
          setLimitModalType(null);
          onNavigate?.('owner_plan_subscription');
        }}
      />
      {/* 1-to-1 Web Parity: Unified 3-Step Onboard Resident & Lease Wizard */}
      <LeasingHubScreen
        modalOnly={true}
        openOnboardSignal={onboardSignal}
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
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 24,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
      borderRadius: 10,
      padding: 3,
      marginBottom: 14,
    },
    tabButton: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: 9,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      gap: 5,
    },
    tabPendingBadge: {
      backgroundColor: '#F59E0B',
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: 10,
    },
    tabPendingBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
    tabButtonActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    tabTextActive: {
      color: colors.navy,
      fontWeight: '700',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      fontSize: 13,
      color: colors.ink,
      paddingVertical: 0,
    },
    actionIconBtn: {
      width: 42,
      height: 42,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtn: {
      width: 42,
      height: 42,
      borderRadius: 10,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dualActionRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    inviteBannerBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
      borderRadius: 8,
      paddingVertical: 8,
    },
    inviteBannerText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: isDark ? '#34D399' : '#059669',
    },
    addBannerBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: '#10B981',
      borderRadius: 8,
      paddingVertical: 8,
    },
    addBannerText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      paddingHorizontal: 20,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      marginTop: 10,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 12,
    },
    emptySub: {
      fontSize: 12.5,
      color: colors.inkSoft,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      marginBottom: 12,
    },
    tenantTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.ink,
    },
    tenantInfo: {
      flex: 1,
      marginLeft: 12,
    },
    tenantName: {
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.navy,
    },
    unitCode: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    contactSub: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 1,
    },
    kycBadgeGreen: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    kycTextGreen: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? '#34D399' : '#059669',
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 8,
      padding: 10,
      gap: 10,
      marginBottom: 12,
    },
    metricItem: {
      width: '47%',
    },
    metricLabel: {
      fontSize: 11,
      color: colors.inkSoft,
      marginBottom: 2,
    },
    metricValue: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
    },
    cardActionsRow: {
      flexDirection: 'row',
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: 10,
    },
    callBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    },
    callBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.ink,
    },
    view360Btn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    view360BtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#34D399' : '#059669',
    },
    moveOutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
    },
    moveOutBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#EF4444',
    },
    bannerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      marginBottom: 12,
    },
    bannerIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
    },
    bannerSubtitle: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 2,
      lineHeight: 16,
    },
    primaryFullBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#10B981',
      borderRadius: 10,
      paddingVertical: 12,
      marginBottom: 14,
    },
    primaryFullBtnText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    reqTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    badgePill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    badgePillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    badgeAmber: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7',
    },
    badgeTextAmber: {
      color: isDark ? '#FBBF24' : '#D97706',
    },
    badgeGreen: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
    },
    badgeTextGreen: {
      color: isDark ? '#34D399' : '#059669',
    },
    badgeRed: {
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEF2F2',
    },
    badgeTextRed: {
      color: '#EF4444',
    },
    badgeGray: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    },
    badgeTextGray: {
      color: colors.inkSoft,
    },
    reqPropertyTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    reqPropertyText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    reqPillarStrip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      marginVertical: 10,
    },
    reqPillarCol: {
      flex: 1,
    },
    reqPillarLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    reqPillarValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    reqPillarSub: {
      fontSize: 10,
      color: colors.inkSoft,
      marginTop: 1,
    },
    reqDocChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#DCFCE7',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      marginTop: 2,
      marginBottom: 4,
    },
    reqDocChipText: {
      fontSize: 11.5,
      color: isDark ? '#34D399' : '#166534',
      fontWeight: '600',
      flex: 1,
      marginHorizontal: 6,
    },
    reqIdChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#DBEAFE',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginTop: 4,
      marginBottom: 4,
    },
    reqIdChipText: {
      fontSize: 11,
      color: isDark ? '#60A5FA' : '#1E40AF',
      fontWeight: '600',
      flex: 1,
      marginHorizontal: 6,
    },
    reqActionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingTop: 8,
    },
    cancelProposalBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
    },
    cancelProposalText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: '#EF4444',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 34,
      maxHeight: '85%',
    },
    sheetHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#CBD5E1',
      alignSelf: 'center',
      marginBottom: 14,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
      marginBottom: 6,
      marginTop: 8,
    },
    input: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.ink,
    },
    rowTwo: {
      flexDirection: 'row',
    },
    dropdownTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      marginBottom: 4,
    },
    dropdownTriggerActive: {
      borderColor: '#059669',
      backgroundColor: colors.surface,
    },
    dropdownLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    dropdownBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dropdownBadgeSymbol: {
      fontSize: 11,
      fontWeight: '700',
      color: '#059669',
    },
    dropdownText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.navy,
    },
    dropdownMenu: {
      marginTop: 4,
      marginBottom: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 4,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    dropdownItemActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#F0FDF4',
    },
    dropdownItemText: {
      fontSize: 12.5,
      color: colors.ink,
      fontWeight: '500',
    },
    dropdownItemTextActive: {
      color: isDark ? '#34D399' : '#065F46',
      fontWeight: '700',
    },
    unitPickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 4,
    },
    unitPickChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      borderWidth: 1,
      borderColor: colors.line,
    },
    unitPickChipActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
      borderColor: '#059669',
    },
    unitPickText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    unitPickTextActive: {
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '700',
    },
    docUploadBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
      borderRadius: 8,
      padding: 10,
      marginTop: 12,
      marginBottom: 16,
    },
    docUploadTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#065F46',
    },
    docUploadSub: {
      fontSize: 11,
      color: isDark ? '#A7F3D0' : '#047857',
    },
    submitBtn: {
      backgroundColor: '#10B981',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 20,
    },
    submitBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    candidateSearchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 8,
    },
    candidateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      padding: 10,
      marginBottom: 8,
    },
    candidateAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: '#059669',
      alignItems: 'center',
      justifyContent: 'center',
    },
    candidateAvatarText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 14,
    },
    candidateName: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    candidateEmail: {
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    candidatePhone: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    candidateBadge: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
    },
    candidateBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
  });
