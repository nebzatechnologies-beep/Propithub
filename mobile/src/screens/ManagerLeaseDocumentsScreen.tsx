import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  Linking,
  ActivityIndicator,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import {
  MobileAgreement,
  MobileAgreementTemplate,
  MobileRenewalItem,
  MobilePropertyEnquiry,
} from '../types';
import { DocumentViewerModal } from '../components/DocumentViewerModal';
import { LeasingHubScreen } from './LeasingHubScreen';
import { downloadDocument, DocumentDownloadItem } from '../lib/documentService';
import { pickDocument } from '../lib/nativePicker';
import { uploadOrCompressDocument } from '../lib/imageUploader';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

interface ManagerLeaseDocumentsScreenProps {
  onProfilePress?: () => void;
  onViewPdfPress?: (documentUrl?: string) => void;
  onNavigate?: (screenKey: string) => void;
}

export const ManagerLeaseDocumentsScreen: React.FC<ManagerLeaseDocumentsScreenProps> = ({
  onProfilePress,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const {
    state,
    updateAgreement,
    deleteAgreement,
    updateTenancyRequest,
    saveUnit,
    approveSignedAgreement,
    rejectSignedAgreement,
    offerLeaseRenewal,
    approveLeaseRenewal,
    saveAgreementTemplate,
    deleteAgreementTemplate,
    updateEnquiryStatus,
  } = useMobileAppData();
  const { user } = useMobileAuth();
  const { viewCurrency, format } = useMobileCurrency();

  const managerRecord = (state.propertyManagers || []).find(
    (m) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase().trim() === user.email.toLowerCase().trim())
  );
  const assignedPropertyId =
    (user as any)?.propertyId ||
    (user as any)?.assignedPropertyId ||
    managerRecord?.propertyId ||
    '';
  const effectiveOwnerId =
    user?.ownerId && user.ownerId !== user.id
      ? user.ownerId
      : managerRecord?.ownerId || '';
  const assignedProps = [
    ...(user?.assignedProperties || []),
    ...(managerRecord?.assignedProperties || []),
    ...(assignedPropertyId ? [assignedPropertyId] : []),
  ];
  const ownerId = effectiveOwnerId;

  // Subtabs & Filters
  const [activeTab, setActiveTab] = useState<'agreements' | 'renewals' | 'library' | 'drafts' | 'enquiries'>('agreements');
  const [agreementFilter, setAgreementFilter] = useState<'all' | 'active' | 'pending' | 'terminated'>('all');
  const [search, setSearch] = useState('');
  const [templatePropFilter, setTemplatePropFilter] = useState<string>('all');
  const [onboardSignal, setOnboardSignal] = useState(0);

  // Scoped Properties and Units
  const myProperties = useMemo(() => {
    return (state.properties || []).filter((p) => {
      if (p.assignedManagerId === user?.id || (p as any).managerId === user?.id) return true;
      if (assignedProps.includes(p.id)) return true;
      if (assignedPropertyId && p.id === assignedPropertyId) return true;
      if (effectiveOwnerId && p.ownerId === effectiveOwnerId) {
        if (assignedProps.length === 0 && !assignedPropertyId) return true;
        if (assignedProps.includes(p.id)) return true;
      }
      return false;
    });
  }, [state.properties, effectiveOwnerId, assignedPropertyId, assignedProps, user?.id]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    return state.units.filter((u) => {
      if (u.propertyId && myPropertyIds.has(u.propertyId)) return true;
      if (ownerId && u.ownerId === ownerId) return true;
      return false;
    });
  }, [state.units, myPropertyIds, ownerId]);

  // Scoped Agreements + Pending Tenancy Requests (1-to-1 with Web LeaseDocumentsPage)
  const myAgreements = useMemo(() => {
    const baseAgreements = state.agreements.filter((a) => {
      const matchOwner = ownerId ? a.ownerId === ownerId : false;
      const matchProp = Boolean(a.propertyId && myPropertyIds.has(a.propertyId));
      const matchUnit = myUnits.some((u) => u.unitNumber === a.unit || u.id === a.unit);
      return matchOwner || matchProp || matchUnit;
    });

    const agreementUnits = new Set(baseAgreements.map((a) => `${a.propertyId || ''}_${a.unit}`));
    const syntheticFromRequests: MobileAgreement[] = (state.tenancyRequests || [])
      .filter((r) => {
        if (r.status !== 'pending' && (r.status as string) !== 'pending_deposit') return false;
        const matchOwner = ownerId ? r.ownerId === ownerId : false;
        const matchProp = Boolean(r.propertyId && myPropertyIds.has(r.propertyId));
        if (!matchOwner && !matchProp) return false;
        return !agreementUnits.has(`${r.propertyId || ''}_${r.unitNumber}`);
      })
      .map(
        (r) =>
          ({
            id: r.id,
            ownerId: r.ownerId,
            ownerName: r.ownerName,
            propertyId: r.propertyId,
            propertyName: r.propertyName,
            unit: r.unitNumber,
            tenant: r.tenantName || r.tenantEmail,
            tenantId: (r as any).tenantId || r.id,
            tenantEmail: r.tenantEmail,
            tenantPhone: r.tenantPhone,
            start: r.leaseStart,
            end: r.leaseEnd,
            rent: (r as any).rent ?? (r as any).rentAmount ?? 0,
            deposit: (r as any).deposit ?? (r as any).depositAmount ?? 0,
            currency: r.currency,
            escalationPercent: 5,
            lockInMonths: 6,
            noticePeriodDays: 30,
            status: 'pending_deposit' as any,
            documentUrl: r.agreementFileData,
            fileName: r.agreementFileName,
            fileData: r.agreementFileData,
          } as MobileAgreement)
      );

    return [...baseAgreements, ...syntheticFromRequests];
  }, [state.agreements, state.tenancyRequests, ownerId, myPropertyIds, myUnits]);

  const myIssuedAgreements = useMemo(() => {
    return myAgreements.filter((a) => a.status !== 'draft' && !a.id.startsWith('DFT-'));
  }, [myAgreements]);

  const myDrafts = useMemo(() => {
    return myAgreements.filter((a) => a.status === 'draft' || a.id.startsWith('DFT-'));
  }, [myAgreements]);

  const filteredAgreements = useMemo(() => {
    return myIssuedAgreements.filter((a) => {
      if (agreementFilter === 'active' && a.status !== 'active' && (a.status as any) !== 'signed') return false;
      if (
        agreementFilter === 'pending' &&
        !['pending_approval', 'awaiting_tenant_signature', 'awaiting_tenant_upload', 'pending_deposit', 'awaiting_review'].includes(a.status as any)
      ) {
        return false;
      }
      if (agreementFilter === 'terminated' && a.status !== 'terminated' && (a.status as any) !== 'expired') return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (a.tenant || '').toLowerCase().includes(q) ||
        (a.unit || '').toLowerCase().includes(q) ||
        (a.propertyName || '').toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    });
  }, [myIssuedAgreements, agreementFilter, search]);

  // Scoped Renewals
  const myRenewals = useMemo(() => {
    return (state.renewals || []).filter((r) => {
      if (r.propertyId && myPropertyIds.has(r.propertyId)) return true;
      if (ownerId && r.ownerId === ownerId) return true;
      return false;
    });
  }, [state.renewals, myPropertyIds, ownerId]);

  // Scoped Templates
  const myTemplates = useMemo(() => {
    const customTemplates = (state.agreementTemplates || []).filter((t) => {
      if (ownerId && t.ownerId === ownerId) return true;
      if (t.propertyId && t.propertyId !== 'all' && myPropertyIds.has(t.propertyId)) return true;
      if (!t.ownerId && (!t.propertyId || t.propertyId === 'all')) return true;
      return false;
    });
    const fromAgreements: MobileAgreementTemplate[] = [];
    const seenNames = new Set(customTemplates.map((t) => (t.fileName || t.title).toLowerCase()));
    (state.agreements || []).forEach((a) => {
      const belongsToPortfolio =
        (Boolean(ownerId) && a.ownerId === ownerId) ||
        (Boolean(a.propertyId) && myPropertyIds.has(a.propertyId));
      const docData = a.fileData || a.initialAgreementUrl || a.documentUrl;
      const docName = a.fileName || a.initialAgreementName;
      if (belongsToPortfolio && docData && docName) {
        const lower = docName.toLowerCase();
        if (!seenNames.has(lower)) {
          seenNames.add(lower);
          fromAgreements.push({
            id: `ag_tmpl_${a.id}`,
            ownerId: a.ownerId,
            ownerName: a.ownerName,
            title: docName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            propertyId: a.propertyId || 'all',
            propertyName: a.propertyName || 'All Properties',
            fileName: docName,
            fileData: docData,
            fileSizeKb: 450,
            uploadedAt: a.start || new Date().toISOString(),
            uploadedBy: 'owner',
            status: 'active',
          });
        }
      }
    });
    return [...customTemplates, ...fromAgreements].filter((t) => {
      if (templatePropFilter !== 'all' && t.propertyId && t.propertyId !== 'all' && t.propertyId !== templatePropFilter) {
        return false;
      }
      return true;
    });
  }, [state.agreementTemplates, state.agreements, ownerId, myPropertyIds, templatePropFilter]);

  // Scoped Enquiries
  const [localEnquiryStatuses, setLocalEnquiryStatuses] = useState<Record<string, string>>({});
  const myEnquiries = useMemo(() => {
    return (state.enquiries || [])
      .filter((e) => {
        if (e.managerId && e.managerId === user?.id) return true;
        if (e.ownerId && ownerId && e.ownerId === ownerId) return true;
        if (myPropertyIds.has(e.propertyId)) return true;
        return false;
      })
      .map((e) => ({
        ...e,
        status: (localEnquiryStatuses[e.id] as any) || e.status || 'new',
      }));
  }, [state.enquiries, user?.id, ownerId, myPropertyIds, localEnquiryStatuses]);

  const hasNewEnquiries = myEnquiries.some((e) => e.status === 'new');

  // Modals State
  const [viewingAgreement, setViewingAgreement] = useState<MobileAgreement | null>(null);
  const [inspectingSignedAgreement, setInspectingSignedAgreement] = useState<MobileAgreement | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [isUploadingAgreementDoc, setIsUploadingAgreementDoc] = useState(false);

  // Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState<DocumentDownloadItem | null>(null);

  // Renewal Offer State
  const [renewalModalItem, setRenewalModalItem] = useState<{
    unit: string;
    tenant: string;
    currentRent: number;
    leaseEnd: string;
    propertyId?: string;
    currency?: string;
  } | null>(null);
  const [renewalPercent, setRenewalPercent] = useState('10');
  const [renewalNewRent, setRenewalNewRent] = useState('');
  const [renewalStartDate, setRenewalStartDate] = useState('');
  const [renewalEndDate, setRenewalEndDate] = useState('');
  const [renewalNotes, setRenewalNotes] = useState('');
  const [isSendingRenewal, setIsSendingRenewal] = useState(false);

  // Signed Renewal Inspection
  const [inspectingRenewal, setInspectingRenewal] = useState<MobileRenewalItem | null>(null);
  const [isActivatingRenewal, setIsActivatingRenewal] = useState(false);

  // Add Template Modal State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [tmplTitle, setTmplTitle] = useState('');
  const [tmplDesc, setTmplDesc] = useState('');
  const [tmplPropId, setTmplPropId] = useState('all');
  const [tmplFileName, setTmplFileName] = useState('');
  const [tmplFileData, setTmplFileData] = useState('');
  const [isSavingTmpl, setIsSavingTmpl] = useState(false);

  // Days left helper for Renewals
  const getDaysRemaining = (endDateStr?: string) => {
    if (!endDateStr) return null;
    const diff = Math.ceil((new Date(endDateStr).getTime() - Date.now()) / 86400000);
    return Number.isNaN(diff) ? null : diff;
  };

  // Handlers
  const handleApproveSignedLease = async () => {
    if (!inspectingSignedAgreement) return;
    setIsApproving(true);
    try {
      await approveSignedAgreement(
        inspectingSignedAgreement.id,
        user?.displayName || 'Property Manager'
      );
      setInspectingSignedAgreement(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to approve lease');
    } finally {
      setIsApproving(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!inspectingSignedAgreement || !rejectReason.trim()) {
      Alert.alert('Required', 'Please enter a reason for rejection.');
      return;
    }
    setIsRejecting(true);
    try {
      await rejectSignedAgreement(inspectingSignedAgreement.id, rejectReason.trim());
      setShowRejectModal(false);
      setInspectingSignedAgreement(null);
      setRejectReason('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to reject lease');
    } finally {
      setIsRejecting(false);
    }
  };

  // Upload / Replace Signed Document on Agreement
  const handleUploadAgreementDoc = async (agreement: MobileAgreement) => {
    const picked = await pickDocument();
    if (!picked) return;
    setIsUploadingAgreementDoc(true);
    try {
      const uploaded = await uploadOrCompressDocument(
        picked.base64 || picked.uri,
        `agreements/${agreement.id}_${Date.now()}_${picked.name}`
      );
      const updates: Partial<MobileAgreement> = {
        fileName: picked.name,
        fileData: uploaded,
        documentUrl: uploaded,
      };
      updateAgreement(agreement.id, updates);
      if (viewingAgreement?.id === agreement.id) {
        setViewingAgreement({ ...viewingAgreement, ...updates });
      }
      Alert.alert('Uploaded ✓', `Document attached to ${agreement.id}.`);
    } catch (e: any) {
      Alert.alert('Upload Failed', e?.message || 'Could not upload document.');
    } finally {
      setIsUploadingAgreementDoc(false);
    }
  };

  // Download PDF for Agreement
  const handleDownloadAgreementPdf = (a: MobileAgreement) => {
    downloadDocument({
      title: `Lease_${a.unit}_${a.tenant || 'Resident'}`,
      docType: 'agreement',
      fileUrl: a.fileData || a.documentUrl || a.initialAgreementUrl,
      fileName: a.fileName || `Lease_${a.id}.pdf`,
      meta: {
        agreementId: a.id,
        tenantName: a.tenant || 'Resident',
        propertyName: a.propertyName || 'Managed Property',
        unit: a.unit,
        amount: format(a.rent || 0, a.currency),
        date: a.start || new Date().toISOString().split('T')[0],
        status: a.status,
      },
    });
  };

  // Terminate Active Agreement or Cancel Pending Request
  const handleTerminateLease = (a: MobileAgreement) => {
    const isReq = a.id.startsWith('REQ-') || (a.status as any) === 'pending_deposit';
    Alert.alert(
      isReq ? 'Cancel Invitation' : 'Terminate Lease',
      isReq
        ? `Cancel the pending lease invitation for ${a.tenant} (Unit ${a.unit})?`
        : `Terminate the active lease for ${a.tenant} (Unit ${a.unit}) and mark the unit vacant?`,
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: isReq ? 'Cancel Invite' : 'Terminate',
          style: 'destructive',
          onPress: () => {
            if (isReq) {
              updateTenancyRequest(a.id, 'cancelled');
            } else {
              updateAgreement(a.id, { status: 'terminated' });
            }
            const targetUnit = myUnits.find(
              (u) =>
                (u.unitNumber === a.unit || u.id === a.unit) &&
                (!a.propertyId || u.propertyId === a.propertyId)
            );
            if (targetUnit) {
              saveUnit({
                ...targetUnit,
                status: 'vacant',
                tenant: null,
                currentTenantId: null,
              });
            }
            setViewingAgreement(null);
          },
        },
      ]
    );
  };

  // Renewal Handlers
  const handleOpenRenewalModal = (
    unit: string,
    tenant: string,
    rent: number,
    leaseEnd: string,
    propId?: string,
    currency?: string
  ) => {
    const baseTime = leaseEnd ? new Date(leaseEnd).getTime() : Date.now();
    const nextDay = new Date((Number.isNaN(baseTime) ? Date.now() : baseTime) + 86400000);
    const startStr = nextDay.toISOString().split('T')[0];
    const endObj = new Date(nextDay);
    endObj.setFullYear(endObj.getFullYear() + 1);
    const endStr = endObj.toISOString().split('T')[0];

    const calcNewRent = Math.round(rent * 1.1).toString();
    setRenewalPercent('10');
    setRenewalNewRent(calcNewRent);
    setRenewalStartDate(startStr);
    setRenewalEndDate(endStr);
    setRenewalNotes('');
    setRenewalModalItem({ unit, tenant, currentRent: rent, leaseEnd, propertyId: propId, currency });
  };

  const handlePercentChange = (val: string) => {
    setRenewalPercent(val);
    const pct = parseFloat(val);
    if (!Number.isNaN(pct) && renewalModalItem) {
      const calc = Math.round(renewalModalItem.currentRent * (1 + pct / 100));
      setRenewalNewRent(String(calc));
    }
  };

  const handleSendRenewalOffer = async () => {
    if (!renewalModalItem) return;
    setIsSendingRenewal(true);
    try {
      await offerLeaseRenewal(renewalModalItem.unit, {
        currentRent: renewalModalItem.currentRent,
        percentageIncrease: parseFloat(renewalPercent) || 0,
        proposedRent: parseInt(renewalNewRent, 10) || renewalModalItem.currentRent,
        termMonths: 12,
        newLeaseStart: renewalStartDate,
        newLeaseEnd: renewalEndDate,
        ownerNotes: renewalNotes.trim() || undefined,
        propertyId: renewalModalItem.propertyId,
        currency: renewalModalItem.currency,
      });
      setRenewalModalItem(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send renewal');
    } finally {
      setIsSendingRenewal(false);
    }
  };

  const handleActivateRenewal = async () => {
    if (!inspectingRenewal) return;
    setIsActivatingRenewal(true);
    try {
      await approveLeaseRenewal(inspectingRenewal.unit, inspectingRenewal.propertyId);
      setInspectingRenewal(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to activate renewal');
    } finally {
      setIsActivatingRenewal(false);
    }
  };

  // Template Handlers
  const handlePickTemplateFile = async () => {
    const picked = await pickDocument();
    if (!picked) return;
    try {
      const uploaded = await uploadOrCompressDocument(
        picked.base64 || picked.uri,
        `templates/tmpl_${Date.now()}_${picked.name}`
      );
      setTmplFileName(picked.name);
      setTmplFileData(uploaded);
      if (!tmplTitle.trim()) {
        setTmplTitle(picked.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not attach template file.');
    }
  };

  const handleSaveTemplate = async () => {
    if (!tmplTitle.trim()) {
      Alert.alert('Required', 'Please enter a template title.');
      return;
    }
    setIsSavingTmpl(true);
    try {
      const propObj = myProperties.find((p) => p.id === tmplPropId);
      const newTmpl: MobileAgreementTemplate = {
        id: `tmpl-${Date.now()}`,
        ownerId: ownerId || user?.id || '',
        ownerName: user?.displayName || 'Operations',
        title: tmplTitle.trim(),
        description: tmplDesc.trim(),
        propertyId: tmplPropId,
        propertyName: propObj ? propObj.name : 'All Managed Properties',
        fileName: tmplFileName || `${tmplTitle.trim().replace(/\s+/g, '_')}.pdf`,
        fileData: tmplFileData,
        fileSizeKb: 320,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'manager',
        status: 'active',
      };
      await saveAgreementTemplate(newTmpl);
      setShowTemplateModal(false);
      setTmplTitle('');
      setTmplDesc('');
      setTmplFileName('');
      setTmplFileData('');
    } finally {
      setIsSavingTmpl(false);
    }
  };

  // Resume Draft or Onboard Prospect
  const handleResumeDraft = async (draft: MobileAgreement) => {
    try {
      await AsyncStorage.setItem(
        'propithub_mobile_lease_prefill',
        JSON.stringify({
          propertyId: draft.propertyId,
          propertyName: draft.propertyName,
          unitNumber: draft.unit,
          tenantName: draft.tenant,
          tenantEmail: draft.tenantEmail,
          tenantPhone: draft.tenantPhone,
          rent: draft.rent ? String(draft.rent) : '',
          deposit: draft.deposit ? String(draft.deposit) : '',
          startDate: draft.start,
          endDate: draft.end,
        })
      );
    } catch {
      // ignore
    }
    onNavigate?.('lease_drafting_builder');
  };

  const handleOnboardProspect = async (enq: MobilePropertyEnquiry) => {
    try {
      await AsyncStorage.setItem(
        'propithub_mobile_lease_prefill',
        JSON.stringify({
          propertyId: enq.propertyId,
          propertyName: enq.propertyName,
          unitNumber: enq.unitNumber || enq.unitId,
          tenantName: enq.prospectName,
          tenantEmail: enq.prospectEmail,
          tenantPhone: enq.prospectPhone,
        })
      );
      handleUpdateEnquiryStatus(enq, 'contacted');
    } catch {
      // ignore
    }
    onNavigate?.('lease_drafting_builder');
  };

  const handleUpdateEnquiryStatus = async (
    enq: MobilePropertyEnquiry,
    nextStatus: 'contacted' | 'archived'
  ) => {
    setLocalEnquiryStatuses((prev) => ({ ...prev, [enq.id]: nextStatus }));
    if (updateEnquiryStatus) {
      await updateEnquiryStatus(enq.id, nextStatus);
    } else if (isFirebaseConfigured) {
      await setDoc(doc(db, 'enquiries', enq.id), { status: nextStatus }, { merge: true }).catch(
        console.warn
      );
    }
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const getStatusLabelAndColor = (status?: string) => {
    const s = (status || 'draft').toLowerCase();
    if (s === 'active' || s === 'signed') {
      return { label: 'Active', bg: 'rgba(16, 185, 129, 0.14)', color: '#059669' };
    }
    if (s === 'pending_approval' || s === 'awaiting_review') {
      return { label: 'Pending Review', bg: 'rgba(245, 158, 11, 0.16)', color: '#D97706' };
    }
    if (s === 'pending_deposit' || s === 'awaiting_tenant_signature' || s === 'awaiting_tenant_upload') {
      return { label: 'Pending Deposit', bg: 'rgba(59, 130, 246, 0.14)', color: '#2563EB' };
    }
    if (s === 'terminated' || s === 'expired') {
      return { label: 'Terminated', bg: 'rgba(239, 68, 68, 0.14)', color: '#DC2626' };
    }
    return { label: s.toUpperCase(), bg: isDark ? '#1E293B' : '#F1F5F9', color: colors.inkSoft };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenStatusBar />

      <Header
        title="Leasing"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      {/* Top Navigation & Primary CTA Bar */}
      <View style={styles.subTabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabScroll}
        >
          {(
            [
              { key: 'agreements', label: `Leases (${myIssuedAgreements.length})`, dot: false },
              { key: 'renewals', label: `Renewals (${myRenewals.length})`, dot: false },
              { key: 'library', label: `Templates (${myTemplates.length})`, dot: false },
              { key: 'drafts', label: `Drafts (${myDrafts.length})`, dot: false },
              { key: 'enquiries', label: `Enquiries (${myEnquiries.length})`, dot: hasNewEnquiries },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.subTabPill, active && styles.subTabPillActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.subTabPillText, active && styles.subTabPillTextActive]}>
                  {tab.label}
                </Text>
                {tab.dot && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ============================================================== */}
        {/* TAB 1: LEASES / AGREEMENTS                                     */}
        {/* ============================================================== */}
        {activeTab === 'agreements' && (
          <View>
            {/* Search + Issue Lease Row */}
            <View style={styles.searchBarRow}>
              <View style={styles.searchBox}>
                <Feather name="search" size={14} color={colors.inkSoft} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search resident, unit, or ID..."
                  placeholderTextColor={colors.inkSoft}
                />
                {Boolean(search) && (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={15} color={colors.inkSoft} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={styles.issueLeaseBtn}
                onPress={() => setOnboardSignal((prev) => prev + 1)}
                activeOpacity={0.85}
              >
                <Feather name="user-plus" size={14} color="#FFFFFF" />
                <Text style={styles.issueLeaseBtnText}>Add Tenant</Text>
              </TouchableOpacity>
            </View>

            {/* Status Filter Chips */}
            <View style={styles.filterPillsRow}>
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'active', label: 'Active' },
                  { key: 'pending', label: 'Pending' },
                  { key: 'terminated', label: 'Terminated' },
                ] as const
              ).map((f) => {
                const active = agreementFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => setAgreementFilter(f.key)}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {filteredAgreements.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="file-text" size={30} color={colors.inkSoft} />
                <Text style={styles.emptyTitle}>No leases found</Text>
              </View>
            ) : (
              filteredAgreements.map((a) => {
                const isPendingReview =
                  a.status === 'pending_approval' ||
                  (a.status as any) === 'awaiting_review' ||
                  (a.status as any) === 'awaiting_tenant_upload';
                const badge = getStatusLabelAndColor(a.status);

                return (
                  <View key={a.id} style={styles.card}>
                    {/* Card Top Row */}
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardIdText}>
                          #{a.id} · Unit {a.unit}
                        </Text>
                        {Boolean(a.propertyName) && (
                          <Text style={styles.cardSubText} numberOfLines={1}>
                            {a.propertyName}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusPillText, { color: badge.color }]}>
                          {badge.label}
                        </Text>
                      </View>
                    </View>

                    {/* 2-Column Data Grid (Simulator Parity) */}
                    <View style={styles.gridRow}>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>RESIDENT</Text>
                        <Text style={styles.gridValue} numberOfLines={1}>
                          {a.tenant || 'Resident'}
                        </Text>
                      </View>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>RENT</Text>
                        <Text style={styles.gridValue}>
                          {format(a.rent || 0, a.currency)}
                          <Text style={styles.gridSub}>/mo</Text>
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.gridRow, { marginTop: 6, paddingTop: 0, borderTopWidth: 0 }]}>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>TERM</Text>
                        <Text style={styles.gridSubValue} numberOfLines={1}>
                          {a.start || '—'} → {a.end || '—'}
                        </Text>
                      </View>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>DEPOSIT</Text>
                        <Text style={styles.gridSubValue}>
                          {format(a.deposit || 0, a.currency)}
                        </Text>
                      </View>
                    </View>

                    {/* Clean Footer Actions */}
                    <View style={styles.cardFooter}>
                      {isPendingReview && (
                        <TouchableOpacity
                          style={styles.footerBtnPrimary}
                          onPress={() => setInspectingSignedAgreement(a)}
                        >
                          <Text style={styles.footerBtnPrimaryText}>Approve</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.footerBtn}
                        onPress={() => setViewingAgreement(a)}
                      >
                        <Text style={styles.footerBtnText}>Details</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.footerBtn}
                        onPress={() => handleDownloadAgreementPdf(a)}
                      >
                        <Text style={styles.footerBtnText}>PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.footerBtn}
                        onPress={() => handleUploadAgreementDoc(a)}
                        disabled={isUploadingAgreementDoc}
                      >
                        <Text style={styles.footerBtnText}>Upload</Text>
                      </TouchableOpacity>
                      {(a.status === 'active' || (a.status as any) === 'signed' || (a.status as any) === 'pending_deposit') && (
                        <TouchableOpacity
                          style={[styles.footerBtn, { borderColor: 'rgba(239, 68, 68, 0.35)' }]}
                          onPress={() => handleTerminateLease(a)}
                        >
                          <Text style={[styles.footerBtnText, { color: '#EF4444' }]}>
                            {(a.status as any) === 'pending_deposit' ? 'Cancel' : 'End'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 2: RENEWALS                                                */}
        {/* ============================================================== */}
        {activeTab === 'renewals' && (
          <View>
            <Text style={styles.sectionHeader}>Active Leases</Text>
            {myIssuedAgreements.filter((a) => a.status === 'active' || (a.status as any) === 'signed')
              .length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No active leases</Text>
              </View>
            ) : (
              myIssuedAgreements
                .filter((a) => a.status === 'active' || (a.status as any) === 'signed')
                .map((ag) => {
                  const daysLeft = getDaysRemaining(ag.end);
                  const urgent = daysLeft !== null && daysLeft <= 30;
                  const soon = daysLeft !== null && daysLeft <= 60;

                  return (
                    <View key={ag.id} style={styles.card}>
                      <View style={styles.cardTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardIdText}>Unit {ag.unit} · {ag.tenant}</Text>
                          <Text style={styles.cardSubText}>Ends {ag.end || '—'}</Text>
                        </View>
                        {daysLeft !== null && (
                          <View
                            style={[
                              styles.statusPill,
                              {
                                backgroundColor: urgent
                                  ? 'rgba(239, 68, 68, 0.14)'
                                  : soon
                                  ? 'rgba(245, 158, 11, 0.16)'
                                  : 'rgba(16, 185, 129, 0.14)',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusPillText,
                                {
                                  color: urgent ? '#DC2626' : soon ? '#D97706' : '#059669',
                                },
                              ]}
                            >
                              {daysLeft < 0 ? 'Expired' : `${daysLeft}d left`}
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.gridRow}>
                        <View style={styles.gridCol}>
                          <Text style={styles.gridLabel}>CURRENT RENT</Text>
                          <Text style={styles.gridValue}>
                            {format(ag.rent || 0, ag.currency)}/mo
                          </Text>
                        </View>
                        <View style={[styles.gridCol, { alignItems: 'flex-end', justifyContent: 'center' }]}>
                          <TouchableOpacity
                            style={styles.issueLeaseBtn}
                            onPress={() =>
                              handleOpenRenewalModal(
                                ag.unit,
                                ag.tenant,
                                ag.rent || 0,
                                ag.end || '',
                                ag.propertyId,
                                ag.currency
                              )
                            }
                          >
                            <Text style={styles.issueLeaseBtnText}>Offer Renewal</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })
            )}

            {myRenewals.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.sectionHeader}>Renewal Offers</Text>
                {myRenewals.map((r, i) => (
                  <View key={i} style={styles.card}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardIdText}>Unit {r.unit} · {r.tenant}</Text>
                        <Text style={styles.cardSubText}>
                          {r.newLeaseStart || '—'} → {r.newLeaseEnd || '—'}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          {
                            backgroundColor:
                              r.status === 'accepted'
                                ? 'rgba(16, 185, 129, 0.14)'
                                : r.status === 'rejected'
                                ? 'rgba(239, 68, 68, 0.14)'
                                : 'rgba(245, 158, 11, 0.16)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            {
                              color:
                                r.status === 'accepted'
                                  ? '#059669'
                                  : r.status === 'rejected'
                                  ? '#DC2626'
                                  : '#D97706',
                            },
                          ]}
                        >
                          {(r.status || 'offered').toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.gridRow}>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>PROPOSED RENT</Text>
                        <Text style={styles.gridValue}>
                          {format(r.proposedRent || r.currentRent || 0)}/mo
                        </Text>
                      </View>
                      <View style={[styles.gridCol, { alignItems: 'flex-end', justifyContent: 'center' }]}>
                        {r.status === 'accepted' ? (
                          <TouchableOpacity
                            style={styles.issueLeaseBtn}
                            onPress={() => setInspectingRenewal(r)}
                          >
                            <Text style={styles.issueLeaseBtnText}>Activate</Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.cardSubText}>Awaiting response</Text>
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 3: TEMPLATES                                               */}
        {/* ============================================================== */}
        {activeTab === 'library' && (
          <View>
            <View style={styles.searchBarRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, alignItems: 'center' }}
              >
                <TouchableOpacity
                  style={[styles.filterPill, templatePropFilter === 'all' && styles.filterPillActive]}
                  onPress={() => setTemplatePropFilter('all')}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      templatePropFilter === 'all' && styles.filterPillTextActive,
                    ]}
                  >
                    All Properties
                  </Text>
                </TouchableOpacity>
                {myProperties.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.filterPill, templatePropFilter === p.id && styles.filterPillActive]}
                    onPress={() => setTemplatePropFilter(p.id)}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        templatePropFilter === p.id && styles.filterPillTextActive,
                      ]}
                    >
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={styles.issueLeaseBtn}
                onPress={() => setShowTemplateModal(true)}
              >
                <Feather name="plus" size={14} color="#FFFFFF" />
                <Text style={styles.issueLeaseBtnText}>Template</Text>
              </TouchableOpacity>
            </View>

            {myTemplates.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="bookmark" size={30} color={colors.inkSoft} />
                <Text style={styles.emptyTitle}>No templates saved</Text>
              </View>
            ) : (
              myTemplates.map((tmpl) => (
                <View key={tmpl.id} style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardIdText}>{tmpl.title}</Text>
                      <Text style={styles.cardSubText}>
                        {tmpl.propertyName || 'All Properties'} · {tmpl.fileName}
                      </Text>
                    </View>
                  </View>
                  {Boolean(tmpl.description) && (
                    <Text style={[styles.cardSubText, { marginTop: 4 }]}>{tmpl.description}</Text>
                  )}
                  <View style={styles.cardFooter}>
                    {Boolean(tmpl.fileData) && (
                      <TouchableOpacity
                        style={styles.footerBtn}
                        onPress={() =>
                          setPreviewDoc({
                            title: tmpl.title,
                            fileUrl: tmpl.fileData,
                            fileName: tmpl.fileName || `${tmpl.title}.pdf`,
                            docType: 'agreement',
                          })
                        }
                      >
                        <Text style={styles.footerBtnText}>Preview</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.footerBtn}
                      onPress={() =>
                        downloadDocument({
                          title: tmpl.title,
                          docType: 'agreement',
                          fileUrl: tmpl.fileData,
                          fileName: tmpl.fileName || `${tmpl.title}.pdf`,
                          meta: {
                            date: tmpl.uploadedAt.split('T')[0],
                            propertyName: tmpl.propertyName,
                          },
                        })
                      }
                    >
                      <Text style={styles.footerBtnText}>Download</Text>
                    </TouchableOpacity>
                    {!tmpl.id.startsWith('ag_tmpl_') && (
                      <TouchableOpacity
                        style={[styles.footerBtn, { borderColor: 'rgba(239, 68, 68, 0.35)' }]}
                        onPress={() =>
                          Alert.alert('Delete Template?', `Remove "${(tmpl as any).title || (tmpl as any).name || 'this template'}" from the template library?`, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteAgreementTemplate(tmpl.id) },
                          ])
                        }
                      >
                        <Text style={[styles.footerBtnText, { color: '#EF4444' }]}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 4: DRAFTS                                                  */}
        {/* ============================================================== */}
        {activeTab === 'drafts' && (
          <View>
            {myDrafts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="edit" size={30} color={colors.inkSoft} />
                <Text style={styles.emptyTitle}>No saved drafts</Text>
              </View>
            ) : (
              myDrafts.map((d) => (
                <View key={d.id} style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardIdText}>#{d.id} · Unit {d.unit}</Text>
                      <Text style={styles.cardSubText}>
                        {d.tenant || 'Prospective Resident'} · {format(d.rent || 0, d.currency)}/mo
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardFooter}>
                    <TouchableOpacity
                      style={styles.footerBtnPrimary}
                      onPress={() => handleResumeDraft(d)}
                    >
                      <Text style={styles.footerBtnPrimaryText}>Resume</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.footerBtn, { borderColor: 'rgba(239, 68, 68, 0.35)' }]}
                      onPress={() =>
                        Alert.alert('Discard Draft?', `Discard draft agreement for Unit ${d.unit}?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Discard', style: 'destructive', onPress: () => deleteAgreement(d.id) },
                        ])
                      }
                    >
                      <Text style={[styles.footerBtnText, { color: '#EF4444' }]}>Discard</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 5: ENQUIRIES                                               */}
        {/* ============================================================== */}
        {activeTab === 'enquiries' && (
          <View>
            {myEnquiries.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="inbox" size={30} color={colors.inkSoft} />
                <Text style={styles.emptyTitle}>No prospect enquiries</Text>
              </View>
            ) : (
              myEnquiries.map((enq) => {
                const isNew = enq.status === 'new';
                return (
                  <View key={enq.id} style={styles.card}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardIdText}>{enq.prospectName}</Text>
                        <Text style={styles.cardSubText}>
                          {enq.propertyName} · Unit {enq.unitNumber || enq.unitId}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          {
                            backgroundColor: isNew
                              ? 'rgba(59, 130, 246, 0.14)'
                              : 'rgba(16, 185, 129, 0.14)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            { color: isNew ? '#2563EB' : '#059669' },
                          ]}
                        >
                          {(enq.status || 'new').toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.gridRow}>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>PHONE</Text>
                        <Text style={styles.gridSubValue}>{enq.prospectPhone || '—'}</Text>
                      </View>
                      <View style={styles.gridCol}>
                        <Text style={styles.gridLabel}>EMAIL</Text>
                        <Text style={styles.gridSubValue} numberOfLines={1}>
                          {enq.prospectEmail || '—'}
                        </Text>
                      </View>
                    </View>

                    {Boolean(enq.notes || (enq as any).message) && (
                      <Text style={[styles.cardSubText, { marginTop: 6 }]}>
                        "{enq.notes || (enq as any).message}"
                      </Text>
                    )}

                    <View style={styles.cardFooter}>
                      {Boolean(enq.prospectPhone) && (
                        <TouchableOpacity
                          style={styles.footerBtn}
                          onPress={() => Linking.openURL(`tel:${enq.prospectPhone}`)}
                        >
                          <Text style={styles.footerBtnText}>Call</Text>
                        </TouchableOpacity>
                      )}
                      {Boolean(enq.prospectEmail) && (
                        <TouchableOpacity
                          style={styles.footerBtn}
                          onPress={() => Linking.openURL(`mailto:${enq.prospectEmail}`)}
                        >
                          <Text style={styles.footerBtnText}>Email</Text>
                        </TouchableOpacity>
                      )}
                      {isNew && (
                        <TouchableOpacity
                          style={styles.footerBtn}
                          onPress={() => handleUpdateEnquiryStatus(enq, 'contacted')}
                        >
                          <Text style={styles.footerBtnText}>Contacted</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.footerBtnPrimary}
                        onPress={() => handleOnboardProspect(enq)}
                      >
                        <Text style={styles.footerBtnPrimaryText}>Onboard</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ================================================================== */}
      {/* LEASE DETAILS BOTTOM SHEET (Viewing Agreement)                     */}
      {/* ================================================================== */}
      <Modal visible={Boolean(viewingAgreement)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Lease #{viewingAgreement?.id} · Unit {viewingAgreement?.unit}
              </Text>
              <TouchableOpacity onPress={() => setViewingAgreement(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            {viewingAgreement && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detailsGrid}>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>RESIDENT</Text>
                    <Text style={styles.gridValue}>{viewingAgreement.tenant || '—'}</Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>STATUS</Text>
                    <Text style={styles.gridValue}>
                      {getStatusLabelAndColor(viewingAgreement.status).label}
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>PROPERTY</Text>
                    <Text style={styles.gridValue} numberOfLines={1}>
                      {viewingAgreement.propertyName || 'Managed Property'}
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>UNIT</Text>
                    <Text style={styles.gridValue}>Unit {viewingAgreement.unit}</Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>MONTHLY RENT</Text>
                    <Text style={styles.gridValue}>
                      {format(viewingAgreement.rent || 0, viewingAgreement.currency)}
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>DEPOSIT</Text>
                    <Text style={styles.gridValue}>
                      {format(viewingAgreement.deposit || 0, viewingAgreement.currency)}
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>START DATE</Text>
                    <Text style={styles.gridValue}>{viewingAgreement.start || '—'}</Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>END DATE</Text>
                    <Text style={styles.gridValue}>{viewingAgreement.end || '—'}</Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>LOCK-IN</Text>
                    <Text style={styles.gridValue}>
                      {viewingAgreement.lockInMonths ?? 6} Months
                    </Text>
                  </View>
                  <View style={styles.detailsCell}>
                    <Text style={styles.gridLabel}>NOTICE PERIOD</Text>
                    <Text style={styles.gridValue}>
                      {viewingAgreement.noticePeriodDays ?? 30} Days
                    </Text>
                  </View>
                </View>

                {viewingAgreement.specialClauses && viewingAgreement.specialClauses.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.inputLabel}>Special Clauses</Text>
                    {viewingAgreement.specialClauses.map((c, idx) => (
                      <Text key={idx} style={[styles.cardSubText, { marginTop: 3 }]}>
                        • {c}
                      </Text>
                    ))}
                  </View>
                )}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { flex: 1, marginTop: 0 }]}
                    onPress={() => handleDownloadAgreementPdf(viewingAgreement)}
                  >
                    <Text style={styles.primaryBtnText}>Download PDF</Text>
                  </TouchableOpacity>

                  {Boolean(
                    viewingAgreement.signedDocumentUrl ||
                      viewingAgreement.fileData ||
                      viewingAgreement.documentUrl ||
                      viewingAgreement.initialAgreementUrl
                  ) && (
                    <TouchableOpacity
                      style={[
                        styles.primaryBtn,
                        { flex: 1, marginTop: 0, backgroundColor: '#2563EB' },
                      ]}
                      onPress={() => {
                        const url =
                          viewingAgreement.signedDocumentUrl ||
                          viewingAgreement.fileData ||
                          viewingAgreement.documentUrl ||
                          viewingAgreement.initialAgreementUrl ||
                          '';
                        const name =
                          viewingAgreement.signedDocumentName ||
                          viewingAgreement.fileName ||
                          `Lease_${viewingAgreement.id}.pdf`;
                        setViewingAgreement(null);
                        setPreviewDoc({
                          title: `Lease ${viewingAgreement.id}`,
                          fileUrl: url,
                          fileName: name,
                          docType: 'agreement',
                        });
                      }}
                    >
                      <Text style={styles.primaryBtnText}>View Document</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.secondaryOutlineBtn}
                  onPress={() => handleUploadAgreementDoc(viewingAgreement)}
                  disabled={isUploadingAgreementDoc}
                >
                  {isUploadingAgreementDoc ? (
                    <ActivityIndicator size="small" color={colors.navy} />
                  ) : (
                    <>
                      <Feather name="upload" size={13} color={colors.navy} />
                      <Text style={styles.secondaryOutlineBtnText}>
                        {viewingAgreement.fileName
                          ? `Replace Document (${viewingAgreement.fileName})`
                          : 'Upload Signed Agreement'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ================================================================== */}
      {/* REVIEW & APPROVE SIGNED LEASE BOTTOM SHEET                         */}
      {/* ================================================================== */}
      <Modal visible={Boolean(inspectingSignedAgreement)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Approve Lease · Unit {inspectingSignedAgreement?.unit}
              </Text>
              <TouchableOpacity onPress={() => setInspectingSignedAgreement(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Resident Summary Info */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.navy }}>
                  {inspectingSignedAgreement?.tenant}
                </Text>
                <Text style={[styles.cardSubText, { marginTop: 2 }]}>
                  Term: {inspectingSignedAgreement?.start} → {inspectingSignedAgreement?.end} • Rent: {format(inspectingSignedAgreement?.rent || 0, inspectingSignedAgreement?.currency || viewCurrency)}/mo
                </Text>
              </View>

              {/* Resident Uploaded Signed Document */}
              {(() => {
                const docUrl = inspectingSignedAgreement?.signedDocumentUrl || inspectingSignedAgreement?.initialAgreementUrl || inspectingSignedAgreement?.fileData;
                const docName = inspectingSignedAgreement?.signedDocumentName || inspectingSignedAgreement?.fileName || inspectingSignedAgreement?.initialAgreementName || 'Signed_Lease_Agreement.pdf';

                return (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isDark ? colors.surfaceSunken : '#F0FDF4',
                      borderWidth: 1,
                      borderColor: '#A7F3D0',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <Ionicons name="document-text" size={24} color="#059669" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }} numberOfLines={1}>
                        {docName}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.inkSoft, marginTop: 1 }}>
                        {docUrl ? 'Resident uploaded signed agreement' : 'Lease agreement on file'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {Boolean(docUrl) && (
                        <TouchableOpacity
                          style={{ padding: 6, borderRadius: 6, backgroundColor: isDark ? colors.surface : '#FFFFFF', borderWidth: 1, borderColor: '#A7F3D0' }}
                          onPress={() => {
                            setPreviewDoc({
                              title: docName,
                              fileName: docName,
                              fileUrl: docUrl!,
                              docType: 'Signed Lease Agreement',
                              meta: {
                                tenantName: inspectingSignedAgreement?.tenant,
                                unit: inspectingSignedAgreement?.unit,
                                propertyName: inspectingSignedAgreement?.propertyName,
                              },
                            });
                          }}
                        >
                          <Ionicons name="eye-outline" size={17} color="#059669" />
                        </TouchableOpacity>
                      )}
                      {Boolean(docUrl) && (
                        <TouchableOpacity
                          style={{ padding: 6, borderRadius: 6, backgroundColor: isDark ? colors.surface : '#FFFFFF', borderWidth: 1, borderColor: '#A7F3D0' }}
                          onPress={() => {
                            downloadDocument({
                              title: docName,
                              fileName: docName,
                              fileUrl: docUrl!,
                              docType: 'Signed Lease Agreement',
                              meta: {
                                tenantName: inspectingSignedAgreement?.tenant,
                                unit: inspectingSignedAgreement?.unit,
                                propertyName: inspectingSignedAgreement?.propertyName,
                              },
                            });
                          }}
                        >
                          <Ionicons name="download-outline" size={17} color="#059669" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })()}

              {/* Tenant Digital Signature Verification */}
              {inspectingSignedAgreement?.tenantSignature && (() => {
                const sigRaw = inspectingSignedAgreement.tenantSignature;
                const sigUrl = typeof sigRaw === 'string' ? sigRaw : (sigRaw as any)?.signatureDataUrl;
                const isSigImage = sigUrl && (sigUrl.startsWith('data:image') || sigUrl.startsWith('http://') || sigUrl.startsWith('https://'));
                const sigName = typeof sigRaw === 'string' ? sigRaw : ((sigRaw as any)?.signerName || inspectingSignedAgreement?.tenant || 'Resident');

                return (
                  <View
                    style={{
                      padding: 10,
                      backgroundColor: isDark ? colors.surfaceSunken : '#F0FDF4',
                      borderWidth: 1,
                      borderColor: '#A7F3D0',
                      borderRadius: 8,
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#065F46', marginBottom: 4 }}>
                      ✓ Resident Digital Signature Verified
                    </Text>
                    {isSigImage ? (
                      <Image
                        source={{ uri: sigUrl }}
                        style={{ height: 44, width: 140, resizeMode: 'contain', backgroundColor: '#FFF', borderRadius: 4 }}
                      />
                    ) : (
                      <Text style={{ fontSize: 15, fontWeight: '700', fontStyle: 'italic', color: '#065F46' }}>
                        {sigName}
                      </Text>
                    )}
                  </View>
                );
              })()}

              {/* Uploaded Resident Identification Proofs */}
              {inspectingSignedAgreement?.tenantUploadedIds && inspectingSignedAgreement.tenantUploadedIds.length > 0 && (
                <View
                  style={{
                    padding: 10,
                    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 8,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy, marginBottom: 6 }}>
                    Resident Identity Proofs ({inspectingSignedAgreement.tenantUploadedIds.length})
                  </Text>
                  {inspectingSignedAgreement.tenantUploadedIds.map((proof, idx) => (
                    <View
                      key={idx}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 6,
                        borderBottomWidth: idx < inspectingSignedAgreement.tenantUploadedIds!.length - 1 ? 1 : 0,
                        borderBottomColor: colors.line,
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.navy }}>{proof.name || 'ID Document'}</Text>
                        <Text style={{ fontSize: 10.5, color: colors.inkSoft }}>{proof.fileName || 'Document on record'}</Text>
                      </View>
                      {Boolean(proof.fileUrl) && (
                        <TouchableOpacity
                          style={{ padding: 4 }}
                          onPress={() => {
                            setPreviewDoc({
                              title: proof.name || 'ID Document',
                              fileName: proof.fileName || `${proof.name}.pdf`,
                              fileUrl: proof.fileUrl,
                              docType: 'Government Identity Proof',
                            });
                          }}
                        >
                          <Ionicons name="eye-outline" size={17} color="#2563EB" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleApproveSignedLease}
                disabled={isApproving}
              >
                <Text style={styles.primaryBtnText}>
                  {isApproving ? 'Approving...' : 'Approve Signed Lease & Request Deposit'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dangerOutlineBtn}
                onPress={() => setShowRejectModal(true)}
              >
                <Text style={styles.dangerOutlineBtnText}>Reject / Request Revision</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================================================================== */}
      {/* REJECT LEASE MODAL                                                 */}
      {/* ================================================================== */}
      <Modal visible={showRejectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#DC2626' }]}>Reject Lease</Text>
              <TouchableOpacity onPress={() => setShowRejectModal(false)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.textInput, { minHeight: 76, textAlignVertical: 'top', marginBottom: 12 }]}
              placeholder="Reason for revision..."
              placeholderTextColor={colors.inkSoft}
              multiline
              value={rejectReason}
              onChangeText={setRejectReason}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#DC2626' }]}
              onPress={handleConfirmReject}
              disabled={isRejecting}
            >
              <Text style={styles.primaryBtnText}>
                {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================================================================== */}
      {/* OFFER RENEWAL BOTTOM SHEET (Full Web Parity)                       */}
      {/* ================================================================== */}
      <Modal visible={Boolean(renewalModalItem)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Offer Renewal · Unit {renewalModalItem?.unit}
              </Text>
              <TouchableOpacity onPress={() => setRenewalModalItem(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.row2}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>% Increase</Text>
                  <TextInput
                    style={styles.textInput}
                    value={renewalPercent}
                    onChangeText={handlePercentChange}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Proposed Rent</Text>
                  <TextInput
                    style={styles.textInput}
                    value={renewalNewRent}
                    onChangeText={setRenewalNewRent}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.row2}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>New Start Date</Text>
                  <TextInput
                    style={styles.textInput}
                    value={renewalStartDate}
                    onChangeText={setRenewalStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.inkSoft}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>New End Date</Text>
                  <TextInput
                    style={styles.textInput}
                    value={renewalEndDate}
                    onChangeText={setRenewalEndDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.inkSoft}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.textInput, { minHeight: 64, textAlignVertical: 'top' }]}
                  value={renewalNotes}
                  onChangeText={setRenewalNotes}
                  placeholder="Optional renewal terms..."
                  placeholderTextColor={colors.inkSoft}
                  multiline
                />
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleSendRenewalOffer}
                disabled={isSendingRenewal}
              >
                <Text style={styles.primaryBtnText}>
                  {isSendingRenewal ? 'Sending...' : 'Send Renewal Offer'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================================================================== */}
      {/* ACTIVATE RENEWAL MODAL                                             */}
      {/* ================================================================== */}
      <Modal visible={Boolean(inspectingRenewal)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Activate Renewal · Unit {inspectingRenewal?.unit}</Text>
              <TouchableOpacity onPress={() => setInspectingRenewal(null)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.cardSubText, { marginBottom: 14 }]}>
              {inspectingRenewal?.tenant} accepted the renewal at{' '}
              {format(inspectingRenewal?.proposedRent || inspectingRenewal?.currentRent || 0)}/mo.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleActivateRenewal}
              disabled={isActivatingRenewal}
            >
              <Text style={styles.primaryBtnText}>
                {isActivatingRenewal ? 'Activating...' : 'Activate Renewal'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================================================================== */}
      {/* ADD TEMPLATE BOTTOM SHEET                                          */}
      {/* ================================================================== */}
      <Modal visible={showTemplateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Template</Text>
              <TouchableOpacity onPress={() => setShowTemplateModal(false)}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Title *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 11-Month Residential Lease"
                  placeholderTextColor={colors.inkSoft}
                  value={tmplTitle}
                  onChangeText={setTmplTitle}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Property</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6 }}
                >
                  <TouchableOpacity
                    style={[styles.filterPill, tmplPropId === 'all' && styles.filterPillActive]}
                    onPress={() => setTmplPropId('all')}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        tmplPropId === 'all' && styles.filterPillTextActive,
                      ]}
                    >
                      All Properties
                    </Text>
                  </TouchableOpacity>
                  {myProperties.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.filterPill, tmplPropId === p.id && styles.filterPillActive]}
                      onPress={() => setTmplPropId(p.id)}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          tmplPropId === p.id && styles.filterPillTextActive,
                        ]}
                      >
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.textInput, { minHeight: 56, textAlignVertical: 'top' }]}
                  placeholder="Optional description..."
                  placeholderTextColor={colors.inkSoft}
                  multiline
                  value={tmplDesc}
                  onChangeText={setTmplDesc}
                />
              </View>

              <TouchableOpacity style={styles.secondaryOutlineBtn} onPress={handlePickTemplateFile}>
                <Feather name="paperclip" size={13} color={colors.navy} />
                <Text style={styles.secondaryOutlineBtnText}>
                  {tmplFileName ? `Attached: ${tmplFileName}` : 'Attach PDF / Document'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleSaveTemplate}
                disabled={isSavingTmpl}
              >
                <Text style={styles.primaryBtnText}>
                  {isSavingTmpl ? 'Saving...' : 'Save Template'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Document Viewer Modal */}
      {previewDoc && (
        <DocumentViewerModal
          visible={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          document={previewDoc}
        />
      )}

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
    scroll: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 24,
    },
    subTabBar: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      paddingVertical: 8,
    },
    subTabScroll: {
      paddingHorizontal: 14,
      gap: 6,
    },
    subTabPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
      gap: 5,
    },
    subTabPillActive: {
      backgroundColor: '#10B981',
    },
    subTabPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    subTabPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    unreadDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#EF4444',
    },
    searchBarRow: {
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
      paddingHorizontal: 10,
      height: 38,
      gap: 6,
    },
    searchInput: {
      flex: 1,
      fontSize: 12.5,
      color: colors.navy,
      paddingVertical: 0,
    },
    issueLeaseBtn: {
      backgroundColor: '#10B981',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      height: 36,
      borderRadius: 9,
      gap: 4,
    },
    issueLeaseBtnText: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '700',
    },
    filterPillsRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 10,
    },
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    filterPillActive: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },
    filterPillText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    filterPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    sectionHeader: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.inkSoft,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    emptyCard: {
      paddingVertical: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    cardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
    },
    cardIdText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
    },
    cardSubText: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 2,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    statusPillText: {
      fontSize: 10,
      fontWeight: '700',
    },
    gridRow: {
      flexDirection: 'row',
      marginTop: 9,
      paddingTop: 9,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      gap: 10,
    },
    gridCol: {
      flex: 1,
    },
    gridLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.3,
    },
    gridValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 2,
    },
    gridSubValue: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
      marginTop: 2,
    },
    gridSub: {
      fontSize: 10.5,
      fontWeight: '500',
      color: colors.inkSoft,
    },
    cardFooter: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    footerBtn: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: 7,
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerBtnText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.navy,
    },
    footerBtnPrimary: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: 7,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerBtnPrimaryText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.7)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 24,
      maxHeight: '85%',
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginBottom: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: 15.5,
      fontWeight: '700',
      color: colors.navy,
    },
    detailsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    detailsCell: {
      width: '48%',
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      padding: 10,
    },
    row2: {
      flexDirection: 'row',
      gap: 10,
    },
    inputGroup: {
      marginBottom: 12,
    },
    inputLabel: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
      marginBottom: 5,
    },
    textInput: {
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 11,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.navy,
    },
    primaryBtn: {
      backgroundColor: '#10B981',
      borderRadius: 9,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    primaryBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    secondaryOutlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 9,
      paddingVertical: 10,
      marginTop: 8,
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
    },
    secondaryOutlineBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
    },
    dangerOutlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: '#FCA5A5',
      borderRadius: 9,
      paddingVertical: 10,
      marginTop: 8,
    },
    dangerOutlineBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#DC2626',
    },
  });
