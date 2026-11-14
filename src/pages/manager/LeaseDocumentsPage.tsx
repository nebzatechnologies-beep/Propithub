import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import {
  Agreement,
  AgreementTemplate,
  RenewalItem,
  PropertyEnquiry,
  RequiredIdItem,
  TenancyRequest,
} from '../../types';
import { ButtonProcessing } from '../../components/common/Spinner';
import { OnboardResidentModal } from '../../components/owner/OnboardResidentModal';
import { downloadAgreementPDF } from '../../lib/pdf';
import {
  getNextMonthFirstDateString,
  getOneYearLaterDateString,
  getDaysFromNowString,
} from '../../lib/dates';
import {
  FileText,
  UserPlus,
  CheckCircle2,
  Phone,
  Clock,
  Calendar,
  Eye,
  Download,
  AlertTriangle,
  X,
  Plus,
  Search,
  Trash2,
  Mail,
  Building,
  Upload,
  Bookmark,
  Check,
  AlertCircle,
  FileCheck,
  CreditCard,
  Edit,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  DEFAULT_CURRENCY,
  DEFAULT_CURRENCY_SYMBOL,
  getCurrencySymbol,
  normalizeCurrencyCode,
} from '../../lib/currencyService';
import { useCurrency } from '../../context/CurrencyContext';
import { CurrencyAmount, getTableCurrencyHeader } from '../../components/common/CurrencyAmount';

export const LeaseDocumentsPage: React.FC = () => {
  const {
    state,
    updateState,
    saveAgreement,
    deleteAgreement,
    saveAgreementTemplate,
    deleteAgreementTemplate,
    approveSignedAgreement,
    rejectSignedAgreement,
    offerLeaseRenewal,
    approveLeaseRenewal,
    updateEnquiryStatus,
    showToast,
  } = useAppData();
  const { user } = useAuth();
  const { viewCurrency, convert, format } = useCurrency();
  const [searchParams] = useSearchParams();

  const initialTabParam = searchParams.get('tab');
  const validTabs = ['agreements', 'renewals', 'library', 'drafts', 'enquiries'] as const;
  type SubTabType = typeof validTabs[number];
  const initialSubTab: SubTabType =
    initialTabParam && validTabs.includes(initialTabParam as SubTabType)
      ? (initialTabParam as SubTabType)
      : 'agreements';

  const [subTab, setSubTab] = useState<SubTabType>(initialSubTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [leaseStatusFilter, setLeaseStatusFilter] = useState<'all' | 'active' | 'pending' | 'terminated'>('all');

  // Unified Onboard Resident Modal State
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [onboardEnquiryData, setOnboardEnquiryData] = useState<{
    unitId?: string;
    propertyId?: string;
    name?: string;
    phone?: string;
    email?: string;
    enquiryId?: string;
  } | null>(null);

  // Review & Inspect Signed Agreement State
  const [viewingAgreement, setViewingAgreement] = useState<Agreement | null>(null);
  const [inspectingSignedAgreement, setInspectingSignedAgreement] = useState<Agreement | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejectingModalOpen, setIsRejectingModalOpen] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Renewal Offer Modal State
  const [renewalModalItem, setRenewalModalItem] = useState<RenewalItem | null>(null);
  const [renewalCurrentRent, setRenewalCurrentRent] = useState<number>(0);
  const [renewalPercent, setRenewalPercent] = useState<number>(10);
  const [renewalNewRent, setRenewalNewRent] = useState<number>(0);
  const [renewalDurationMonths, setRenewalDurationMonths] = useState<number>(12);
  const [renewalStartDate, setRenewalStartDate] = useState<string>('');
  const [renewalEndDate, setRenewalEndDate] = useState<string>('');
  const [renewalManagerNotes, setRenewalManagerNotes] = useState<string>('');
  const [isSendingRenewalOffer, setIsSendingRenewalOffer] = useState(false);

  // Tenant-signed Renewal Inspection Modal State
  const [inspectingSignedRenewal, setInspectingSignedRenewal] = useState<RenewalItem | null>(null);
  const [isApprovingRenewal, setIsApprovingRenewal] = useState(false);

  // Agreement Templates Library State
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

  // Scope Resolution for Manager
  const managerRecord = (state.propertyManagers || (state as any).managers || []).find(
    (m: any) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase() === user.email.toLowerCase())
  );
  const assignedPropertyId =
    (user as any)?.propertyId || (user as any)?.assignedPropertyId || managerRecord?.propertyId || '';
  const ownerId = user?.ownerId || (managerRecord as any)?.ownerId || '';

  const myProperties = useMemo(() => {
    let props = state.properties;
    if (ownerId) {
      props = props.filter((p) => p.ownerId === ownerId);
    }
    if (assignedPropertyId) {
      return props.filter((p) => p.id === assignedPropertyId || p.assignedManagerId === user?.id);
    }
    const explicitlyAssigned = props.filter((p) => p.assignedManagerId === user?.id);
    return explicitlyAssigned.length > 0 ? explicitlyAssigned : props;
  }, [state.properties, ownerId, assignedPropertyId, user?.id]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    if (!ownerId && myPropertyIds.size === 0) return [];
    return state.units.filter((u) => {
      const matchOwner = ownerId ? u.ownerId === ownerId : false;
      const matchProp = Boolean(u.propertyId && myPropertyIds.has(u.propertyId));
      return matchOwner || matchProp;
    });
  }, [state.units, ownerId, myPropertyIds]);

  const defaultCurrency = getCurrencySymbol(
    myProperties.find((p) => p.currency)?.currency || myProperties[0]?.currency || DEFAULT_CURRENCY_SYMBOL
  );

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

  const viewingDepInv = viewingAgreement
    ? (state.invoices || []).find(
        (inv) =>
          viewingAgreement.depositInvoiceId
            ? inv.id === viewingAgreement.depositInvoiceId
            : inv.leaseAgreementId === viewingAgreement.id && (inv.invoiceType === 'deposit' || inv.type === 'deposit')
      )
    : null;
  const isViewingDepositPaid = viewingAgreement
    ? (viewingAgreement.depositStatus === 'paid' || viewingDepInv?.status === 'paid')
    : false;

  // 1. Scoped Agreements
  const myAgreements = useMemo(() => {
    const agList: Agreement[] = state.agreements.filter((a) => {
      const matchOwner = ownerId ? a.ownerId === ownerId : false;
      const matchProp = Boolean(a.propertyId && myPropertyIds.has(a.propertyId));
      const matchUnit = myUnits.some((u) => u.unitNumber === a.unit || u.id === a.unit);
      return matchOwner || matchProp || matchUnit;
    });

    const existingAgIds = new Set(agList.map((a) => a.id));
    (state.tenancyRequests || []).forEach((req) => {
      const matchProp = Boolean(req.propertyId && myPropertyIds.has(req.propertyId));
      const matchOwner = ownerId ? req.ownerId === ownerId : false;
      const matchUnit = myUnits.some((u) => u.unitNumber === req.unitNumber || u.id === req.unitId);

      if ((matchProp || matchOwner || matchUnit) && req.status === 'pending') {
        const reqAgId = (req as any).agreementId || `REQ-${req.id.slice(-6)}`;
        if (!existingAgIds.has(reqAgId)) {
          agList.push({
            id: reqAgId,
            ownerId: req.ownerId || ownerId,
            propertyId: req.propertyId || '',
            unit: req.unitNumber || req.unitId,
            tenant: req.tenantName || 'Prospective Resident',
            tenantId: req.tenantId || '',
            type: 'uploaded',
            contentHtml: null,
            fileName: req.agreementFileName || 'Digital Tenancy Agreement',
            fileData: req.agreementFileData || null,
            start: req.leaseStart || new Date().toISOString().split('T')[0],
            end: req.leaseEnd || new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
            rent: req.rent || 0,
            deposit: req.deposit || 0,
            status: 'pending_deposit' as any,
            tenantSignature: null,
            autoRenew: false,
          });
          existingAgIds.add(reqAgId);
        }
      }
    });

    return agList;
  }, [state.agreements, state.tenancyRequests, ownerId, myPropertyIds, myUnits]);

  const myIssuedAgreements = useMemo(() => {
    return myAgreements.filter((a) => a.status !== 'draft');
  }, [myAgreements]);

  const draftAgreements = useMemo(() => {
    return myAgreements.filter((a) => a.status === 'draft' || a.id.startsWith('DFT-'));
  }, [myAgreements]);

  const filteredAgreements = useMemo(() => {
    return myIssuedAgreements.filter((a) => {
      if (leaseStatusFilter === 'active' && a.status !== 'active' && a.status !== 'signed') return false;
      if (
        leaseStatusFilter === 'pending' &&
        !['awaiting_tenant_signature', 'awaiting_tenant_upload', 'pending_approval', 'awaiting_review', 'pending_deposit'].includes(a.status as any)
      ) {
        return false;
      }
      if (leaseStatusFilter === 'terminated' && a.status !== 'terminated') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchDoc = a.id.toLowerCase().includes(q);
      const matchTenant = (a.tenant || '').toLowerCase().includes(q);
      const matchUnit = (a.unit || '').toLowerCase().includes(q);
      return matchDoc || matchTenant || matchUnit;
    });
  }, [myIssuedAgreements, leaseStatusFilter, searchQuery]);

  // 2. Scoped Renewals Pipeline
  const myRenewals = useMemo(() => {
    return (state.renewals || []).filter((r) => {
      if (ownerId && r.ownerId && r.ownerId !== ownerId) return false;
      if (r.propertyId && !myPropertyIds.has(r.propertyId)) return false;
      if (ownerId && r.ownerId === ownerId) return true;
      if (r.propertyId && myPropertyIds.has(r.propertyId)) return true;
      const myUnitIds = new Set(myUnits.map((u) => u.id));
      if (r.unit && myUnitIds.has(r.unit)) return true;
      return false;
    });
  }, [state.renewals, ownerId, myPropertyIds, myUnits]);

  // 3. Scoped Templates Library (Shared Common Store with Owner)
  const myTemplates: AgreementTemplate[] = useMemo(() => {
    const customTemplates = (state.agreementTemplates || []).filter((t) => {
      if (ownerId && t.ownerId === ownerId) return true;
      if (t.propertyId && t.propertyId !== 'all' && myPropertyIds.has(t.propertyId)) return true;
      if (!t.ownerId && (!t.propertyId || t.propertyId === 'all')) return true;
      return false;
    });
    // Also include unique agreements uploaded during resident onboarding or offline execution
    const fromAgreements: AgreementTemplate[] = [];
    const seenNames = new Set(customTemplates.map((t) => (t.fileName || t.title).toLowerCase()));
    (state.agreements || []).forEach((a) => {
      const belongsToPortfolio =
        (Boolean(ownerId) && a.ownerId === ownerId) ||
        (Boolean(a.propertyId) && myPropertyIds.has(a.propertyId));
      if (belongsToPortfolio && a.fileData && a.fileName) {
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
  }, [state.agreementTemplates, state.agreements, ownerId, myPropertyIds]);

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

  // 4. Scoped Enquiries
  const myEnquiries = useMemo(() => {
    return (state.enquiries || []).filter((e) => {
      if (e.managerId && e.managerId === user?.id) return true;
      if (e.ownerId && ownerId && e.ownerId === ownerId) return true;
      if (myPropertyIds.has(e.propertyId)) return true;
      return false;
    });
  }, [state.enquiries, user?.id, ownerId, myPropertyIds]);

  // Status Badge Helper
  const renderAgreementBadge = (a: Agreement) => {
    const s = a.status;
    if (s === 'pending_approval' || s === 'awaiting_tenant_upload' || (s as any) === 'awaiting_review') {
      return (
        <span
          className="badge amber"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: '#FEF3C7',
            color: '#92400E',
            border: '1px solid #FCD34D',
            padding: '3px 8px',
            borderRadius: '6px',
          }}
        >
          <Clock size={11} /> Pending Approval
        </span>
      );
    }
    if (s === 'signed' || s === 'active') {
      const today = new Date().toISOString().split('T')[0];
      const isPast = Boolean(a.end && a.end < today);
      const isFuture = Boolean(a.start && a.start > today);

      if (isPast) {
        return (
          <span
            className="badge grey"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#F1F5F9',
              color: '#475569',
              border: '1px solid #CBD5E1',
              padding: '3px 8px',
              borderRadius: '6px',
            }}
          >
            <Clock size={11} /> Expired Term
          </span>
        );
      }

      if (isFuture) {
        return (
          <span
            className="badge blue"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#EFF6FF',
              color: '#1E40AF',
              border: '1px solid #BFDBFE',
              padding: '3px 8px',
              borderRadius: '6px',
            }}
          >
            <Calendar size={11} /> Scheduled (Starts {a.start})
          </span>
        );
      }

      return (
        <span
          className="badge green"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: '#ECFDF5',
            color: '#065F46',
            border: '1px solid #A7F3D0',
            padding: '3px 8px',
            borderRadius: '6px',
          }}
        >
          <CheckCircle2 size={11} /> {s === 'active' ? 'Active' : 'Signed'}
        </span>
      );
    }
    if (s === 'pending_deposit') {
      return (
        <span
          className="badge blue"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: '#EFF6FF',
            color: '#1E40AF',
            border: '1px solid #BFDBFE',
            padding: '3px 8px',
            borderRadius: '6px',
          }}
        >
          <Clock size={11} /> Pending Deposit
        </span>
      );
    }
    if (s === 'terminated') {
      return (
        <span className="badge red" style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px' }}>
          Terminated
        </span>
      );
    }
    return (
      <span className="badge grey" style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px' }}>
        {(s || 'Draft').replace(/_/g, ' ')}
      </span>
    );
  };

  // Approval and Rejection Handlers
  const handleApproveSignedLease = async () => {
    if (!inspectingSignedAgreement) return;
    setIsApproving(true);
    try {
      await approveSignedAgreement(
        inspectingSignedAgreement.id,
        user?.displayName || managerRecord?.name || 'Property Manager'
      );
      showToast(`✓ Signed lease for Unit ${inspectingSignedAgreement.unit} approved successfully!`);
      setInspectingSignedAgreement(null);
    } catch (err: any) {
      showToast(`❌ Error: ${err?.message || 'Failed to approve lease'}`);
    } finally {
      setIsApproving(false);
    }
  };

  const handleOpenRejectModal = () => {
    setRejectionReasonInput('');
    setIsRejectingModalOpen(true);
  };

  const handleConfirmRejectLease = async () => {
    if (!inspectingSignedAgreement) return;
    if (!rejectionReasonInput.trim()) {
      showToast('⚠️ Please provide a clear rejection reason for the resident.');
      return;
    }
    setIsRejecting(true);
    try {
      await rejectSignedAgreement(inspectingSignedAgreement.id, rejectionReasonInput.trim());
      showToast(`✓ Lease for Unit ${inspectingSignedAgreement.unit} rejected. Resident notified.`);
      setIsRejectingModalOpen(false);
      setInspectingSignedAgreement(null);
    } catch (err: any) {
      showToast(`❌ Rejection failed: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsRejecting(false);
    }
  };

  // Renewal Offer Handlers
  const openRenewalModalForUnit = (unitNumber: string, specificAgreement?: Agreement) => {
    const matchAgreement =
      specificAgreement ||
      myAgreements.find((a) => (a.unit === unitNumber || a.id === unitNumber) && (a.status === 'active' || a.status === 'signed'));
    const matchUnit = myUnits.find(
      (u) =>
        (u.id === unitNumber || u.unitNumber === unitNumber) &&
        (!specificAgreement?.propertyId || u.propertyId === specificAgreement.propertyId)
    );
    const rentVal = matchAgreement?.rent || matchUnit?.rent || 25000;
    const itemCurrency = matchAgreement?.currency || matchUnit?.currency || defaultCurrency;
    const currentEnd = matchAgreement?.end || new Date().toISOString().split('T')[0];

    const nextDay = new Date(new Date(currentEnd).getTime() + 86400000);
    const nextStartStr = nextDay.toISOString().split('T')[0];
    const endObj = new Date(nextDay);
    endObj.setFullYear(endObj.getFullYear() + 1);
    const nextEndStr = endObj.toISOString().split('T')[0];

    const pct = 10;
    const newRentCalc = Math.round(rentVal * (1 + pct / 100));

    setRenewalCurrentRent(rentVal);
    setRenewalPercent(pct);
    setRenewalNewRent(newRentCalc);
    setRenewalDurationMonths(12);
    setRenewalStartDate(nextStartStr);
    setRenewalEndDate(nextEndStr);
    setRenewalManagerNotes('');

    setRenewalModalItem({
      unit: unitNumber,
      tenant: matchAgreement?.tenant || 'Resident',
      tenantId: matchAgreement?.tenantId,
      ownerId: matchAgreement?.ownerId || ownerId,
      propertyId: matchAgreement?.propertyId || matchUnit?.propertyId,
      currency: itemCurrency,
      currentRent: rentVal,
      leaseEnd: currentEnd,
      daysLeft: Math.max(0, Math.ceil((new Date(currentEnd).getTime() - Date.now()) / (1000 * 3600 * 24))),
      status: 'pending_decision',
    });
  };

  const handleSendRenewalOffer = async () => {
    if (!renewalModalItem) return;
    setIsSendingRenewalOffer(true);
    try {
      await offerLeaseRenewal(renewalModalItem.unit, {
        currentRent: renewalCurrentRent,
        percentageIncrease: renewalPercent,
        proposedRent: renewalNewRent,
        termMonths: renewalDurationMonths,
        newLeaseStart: renewalStartDate,
        newLeaseEnd: renewalEndDate,
        ownerNotes: renewalManagerNotes.trim() || undefined,
        propertyId: renewalModalItem.propertyId,
        currency: (renewalModalItem as any).currency,
      });

      showToast(`✓ Renewal offer dispatched for Unit ${renewalModalItem.unit} at ${defaultCurrency}${renewalNewRent.toLocaleString()}/mo.`);
      setRenewalModalItem(null);
    } catch (err: any) {
      showToast(`❌ Failed to send renewal: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsSendingRenewalOffer(false);
    }
  };

  const handleApproveRenewal = async () => {
    if (!inspectingSignedRenewal) return;
    setIsApprovingRenewal(true);
    try {
      await approveLeaseRenewal(inspectingSignedRenewal.unit, inspectingSignedRenewal.propertyId);
      showToast(`✓ Renewal for Unit ${inspectingSignedRenewal.unit} approved & activated!`);
      setInspectingSignedRenewal(null);
    } catch (err: any) {
      showToast(`❌ Error activating renewal: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsApprovingRenewal(false);
    }
  };

  // Template Library Handlers
  const handleTemplateFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewTemplateFileName(file.name);
      setNewTemplateFileSize(Math.round(file.size / 1024));
      const reader = new FileReader();
      reader.onload = () => {
        setNewTemplateFileData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveNewTemplate = async () => {
    if (!newTemplateTitle.trim()) {
      showToast('⚠️ Please enter a template title.');
      return;
    }
    setIsUploadingTemplate(true);
    try {
      const targetProp = myProperties.find((p) => p.id === newTemplatePropertyId);
      const newTmpl: AgreementTemplate = {
        id: `tmpl-${Date.now()}`,
        ownerId: ownerId || user?.id || '',
        ownerName: user?.displayName || managerRecord?.name || 'Property Operations',
        title: newTemplateTitle.trim(),
        description: newTemplateDescription.trim(),
        propertyId: newTemplatePropertyId,
        propertyName: targetProp ? targetProp.name : 'All Managed Properties',
        fileName: newTemplateFileName || 'Standard_Lease_Template.pdf',
        fileData: newTemplateFileData || '',
        fileSizeKb: newTemplateFileSize || 250,
        fileType: 'pdf',
        uploadedBy: 'manager',
        uploadedByUserId: user?.id || '',
        uploadedAt: new Date().toISOString(),
        status: 'active',
      };

      await saveAgreementTemplate(newTmpl);
      showToast(`✓ Template "${newTmpl.title}" saved to library.`);
      setIsUploadTemplateOpen(false);
      setNewTemplateTitle('');
      setNewTemplateDescription('');
      setNewTemplateFileData(null);
    } catch (err: any) {
      showToast(`❌ Error saving template: ${err?.message || 'Error'}`);
    } finally {
      setIsUploadingTemplate(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    setIsDeletingTemplate(true);
    try {
      await deleteAgreementTemplate(deletingTemplate.id);
      showToast(`✓ Template "${deletingTemplate.title}" removed.`);
      setDeletingTemplate(null);
    } catch (err: any) {
      showToast(`❌ Failed to delete: ${err?.message || 'Error'}`);
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  return (
    <div>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Leasing & Legal Hub</h2>
        </div>
        <button
          type="button"
          className="btn brass"
          onClick={() => {
            setOnboardEnquiryData(null);
            setSelectedDraftId(null);
            setIsOnboardOpen(true);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <UserPlus size={16} /> Add Tenant
        </button>
      </div>

      {/* Segmented Subtabs Control */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          padding: '4px',
          background: 'var(--surface-sunken)',
          borderRadius: '10px',
          border: '1px solid var(--line)',
          marginBottom: '20px',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          className={`btn small ${subTab === 'agreements' ? 'brass' : 'secondary'}`}
          onClick={() => setSubTab('agreements')}
          style={{ border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600 }}
        >
          Leases ({myIssuedAgreements.length})
        </button>
        <button
          type="button"
          className={`btn small ${subTab === 'renewals' ? 'brass' : 'secondary'}`}
          onClick={() => setSubTab('renewals')}
          style={{ border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600 }}
        >
          Renewals  ({myRenewals.length})
        </button>
        <button
          type="button"
          className={`btn small ${subTab === 'library' ? 'brass' : 'secondary'}`}
          onClick={() => setSubTab('library')}
          style={{ border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600 }}
        >
          Lease Templates ({myTemplates.length})
        </button>
        <button
          type="button"
          className={`btn small ${subTab === 'drafts' ? 'brass' : 'secondary'}`}
          onClick={() => setSubTab('drafts')}
          style={{ border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600 }}
        >
          Drafts ({draftAgreements.length})
        </button>
        <button
          type="button"
          className={`btn small ${subTab === 'enquiries' ? 'brass' : 'secondary'}`}
          onClick={() => setSubTab('enquiries')}
          style={{
            border: 'none',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          Enquiries ({myEnquiries.length})
          {myEnquiries.some((e) => e.status === 'new') && (
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: LEASES (AGREEMENTS)                                             */}
      {/* ========================================================================= */}
      {subTab === 'agreements' && (
        <div>
          {/* Filters & Search */}
          <div
            className="card"
            style={{
              padding: '12px 16px',
              marginBottom: '18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', marginRight: '4px' }}>
                Status:
              </span>
              {(['all', 'active', 'pending', 'terminated'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`btn small ${leaseStatusFilter === filter ? 'brass' : 'secondary'}`}
                  onClick={() => setLeaseStatusFilter(filter)}
                  style={{ textTransform: 'capitalize', fontSize: '12px', padding: '4px 10px' }}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div style={{ position: 'relative', minWidth: '240px', flex: 1, maxWidth: '340px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
              <input
                type="text"
                placeholder="Search lease ID, resident, unit..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12.5px' }}
              />
            </div>
          </div>

          {filteredAgreements.length === 0 ? (
            <div className="panel" style={{ padding: '60px 24px', textAlign: 'center' }}>
              <FileText size={36} style={{ color: 'var(--ink-soft)', margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: 700 }}>No Leases Found</h3>
              <p style={{ margin: '0 0 16px 0', color: 'var(--ink-soft)', fontSize: '13px' }}>
                No lease agreements match your selected filter criteria.
              </p>
              <button
                type="button"
                className="btn brass small"
                onClick={() => setIsOnboardOpen(true)}
              >
                <Plus size={13} /> Onboard First Resident
              </button>
            </div>
          ) : (
            <div className="panel">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '120px' }}>Document</th>
                      <th>Resident</th>
                      <th style={{ width: '100px' }}>Unit</th>
                      <th style={{ width: '200px' }}>Term</th>
                      <th style={{ width: '110px' }}>{getTableCurrencyHeader('Rent', viewCurrency)}</th>
                      <th style={{ width: '130px' }}>Status</th>
                      <th style={{ width: '200px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgreements.map((a) => {
                      const isPendingApproval =
                        a.status === 'pending_approval' ||
                        a.status === 'awaiting_tenant_upload' ||
                        (a.status as any) === 'awaiting_review';

                      return (
                        <tr key={a.id}>
                          <td><b>{a.id}</b></td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{a.tenant || 'Resident'}</div>
                          </td>
                          <td><b>{a.unit}</b></td>
                          <td>
                            <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                              {a.start || 'Start'} → {a.end || 'End'}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                              <CurrencyAmount amount={a.rent} currency={a.currency || defaultCurrency} />
                              <span style={{ fontSize: '10.5px', color: 'var(--ink-soft)', marginLeft: '2px' }}>/mo</span>
                            </div>
                          </td>
                          <td>{renderAgreementBadge(a)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                              {isPendingApproval && (
                                <button
                                  type="button"
                                  className="btn brass small"
                                  onClick={() => setInspectingSignedAgreement(a)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: '#10B981',
                                    color: '#FFF',
                                    fontWeight: 700,
                                    fontSize: '11.5px',
                                  }}
                                >
                                  <CheckCircle2 size={13} /> Review & Approve
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn secondary small"
                                onClick={() => setViewingAgreement(a)}
                                title="View document details"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                className="btn secondary small"
                                onClick={() => downloadAgreementPDF(a, myProperties.find((p) => p.id === a.propertyId)?.name)}
                                title="Download PDF"
                              >
                                <Download size={12} />
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
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: RENEWALS PIPELINE                                               */}
      {/* ========================================================================= */}
      {subTab === 'renewals' && (
        <div>
          {/* Leases Expiring Soon Radar */}
          <div className="panel" style={{ marginBottom: '20px' }}>
            <div className="panel-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Leases Expiring Soon</h3>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              {myAgreements.filter((a) => (a.status === 'active' || a.status === 'signed')).length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                  No active leases in your managed portfolio.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Resident</th>
                        <th>Current Term Expiry</th>
                        <th>{getTableCurrencyHeader('Current Rent', viewCurrency)}</th>
                        <th>Days Remaining</th>
                        <th style={{ textAlign: 'right' }}>Renewal Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myAgreements
                        .filter((a) => a.status === 'active' || a.status === 'signed')
                        .map((ag) => {
                          const daysRemaining = ag.end
                            ? Math.ceil((new Date(ag.end).getTime() - Date.now()) / (1000 * 3600 * 24))
                            : 365;

                          return (
                            <tr key={ag.id}>
                              <td><b>Unit {ag.unit}</b></td>
                              <td>{ag.tenant || 'Resident'}</td>
                              <td>{ag.end || '—'}</td>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                                  <CurrencyAmount amount={ag.rent} currency={ag.currency || defaultCurrency} />
                                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)', marginLeft: '2px' }}>/mo</span>
                                </div>
                              </td>
                              <td>
                                <span
                                  className={`badge ${daysRemaining <= 30 ? 'red' : daysRemaining <= 90 ? 'amber' : 'grey'}`}
                                  style={{ fontSize: '11px' }}
                                >
                                  {daysRemaining > 0 ? `${daysRemaining} days left` : 'Expired'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="btn brass small"
                                  onClick={() => openRenewalModalForUnit(ag.unit, ag)}
                                >
                                  Offer Renewal
                                </button>
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

          {/* Outstanding Renewal Offers Tracked */}
          {myRenewals.length > 0 && (
            <div className="panel">
              <div className="panel-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Dispatched Renewal Offers</h3>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Resident</th>
                      <th>{getTableCurrencyHeader('Proposed Rent', viewCurrency)}</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRenewals.map((r, i) => (
                      <tr key={i}>
                        <td><b>Unit {r.unit}</b></td>
                        <td>{r.tenant}</td>
                        <td>
                          <b><CurrencyAmount amount={r.proposedRent || r.currentRent || 0} currency={r.currency || defaultCurrency} /></b>
                          <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>/mo</span>
                        </td>
                        <td>
                          <span className={`badge ${r.status === 'accepted' ? 'green' : r.status === 'rejected' ? 'red' : 'amber'}`}>
                            {r.status ? r.status.replace(/_/g, ' ').toUpperCase() : 'SENT'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {r.status === 'accepted' ? (
                            <button
                              type="button"
                              className="btn brass small"
                              onClick={() => setInspectingSignedRenewal(r)}
                            >
                              <CheckCircle2 size={12} /> Activate Renewal
                            </button>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Awaiting Resident</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: LEASE TEMPLATES LIBRARY                                         */}
      {/* ========================================================================= */}
      {subTab === 'library' && (
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
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
                  <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: 0 }}>
                    {myTemplates.length === 0 ? 'No Lease Templates in Library' : 'No Matching Templates Found'}
                  </h4>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Document &amp; Details</th>
                        <th>Applies To</th>
                        <th>Uploaded Date</th>
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
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                    <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: isPdf ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)', color: isPdf ? '#DC2626' : '#2563EB' }}>
                                      {isPdf ? 'PDF' : 'DOC'}
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                      {t.fileSizeKb ? `${t.fileSizeKb} KB` : 'Standard File'}
                                    </span>
                                    {t.description && (
                                      <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                                        • {t.description}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="badge" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}>
                                {t.propertyName || 'All Properties'}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontSize: '12.5px', color: 'var(--ink)' }}>
                                {new Date(t.uploadedAt).toLocaleDateString()}
                              </div>
                            </td>
                            <td>
                              {t.uploadedBy === 'admin' ? (
                                <span className="badge blue" style={{ fontSize: '11px' }}>Platform Admin</span>
                              ) : t.uploadedBy === 'manager' ? (
                                <span className="badge amber" style={{ fontSize: '11px' }}>Property Manager</span>
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
                                  title="Preview template"
                                >
                                  <Eye size={13} /> Preview
                                </button>
                                <a
                                  href={t.fileData || '#'}
                                  download={t.fileName || 'agreement.pdf'}
                                  className="btn secondary small"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                                  title="Download template"
                                >
                                  <Download size={13} /> Download
                                </a>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  title="Delete document from library"
                                  style={{ color: '#DC2626', borderColor: 'rgba(220, 38, 38, 0.3)', padding: '4px 8px' }}
                                  onClick={() => setDeletingTemplate(t)}
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 4: DRAFTS PIPELINE                                                 */}
      {/* ========================================================================= */}
      {subTab === 'drafts' && (
        <div>
          <div className="panel">
            <div className="panel-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>In-Progress Lease Drafts</h3>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              {draftAgreements.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                  No incomplete drafts on file.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Draft Ref</th>
                        <th>Unit</th>
                        <th>Prospective Resident</th>
                        <th>{getTableCurrencyHeader('Configured Rent', viewCurrency)}</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftAgreements.map((d) => (
                        <tr key={d.id}>
                          <td><b>{d.id}</b></td>
                          <td>Unit {d.unit}</td>
                          <td>{d.tenant || 'Pending Resident'}</td>
                          <td>
                            <b><CurrencyAmount amount={d.rent || 0} currency={d.currency || defaultCurrency} /></b>
                            <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>/mo</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn brass small"
                                onClick={() => {
                                  setSelectedDraftId(d.id);
                                  setIsOnboardOpen(true);
                                }}
                              >
                                Resume Onboarding
                              </button>
                              <button
                                type="button"
                                className="btn secondary small"
                                onClick={async () => {
                                  if (window.confirm(`Discard draft ${d.id}?`)) {
                                    await deleteAgreement(d.id);
                                    showToast(`Draft ${d.id} discarded.`);
                                  }
                                }}
                                style={{ color: '#DC2626' }}
                              >
                                Discard
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 5: PROSPECTIVE TENANT ENQUIRIES                                    */}
      {/* ========================================================================= */}
      {subTab === 'enquiries' && (
        <div>
          <div className="panel">
            <div className="panel-head" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Public Listing Inquiries</h3>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              {myEnquiries.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                  No applicant enquiries received yet.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Applicant</th>
                        <th>Target Unit</th>
                        <th>Notes / Message</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myEnquiries.map((enq) => (
                        <tr key={enq.id}>
                          <td>
                            <b>{enq.prospectName}</b>
                            <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                              {enq.prospectPhone} • {enq.prospectEmail || 'No email'}
                            </div>
                          </td>
                          <td>
                            <b>Unit {enq.unitNumber || enq.unitId}</b>
                          </td>
                          <td style={{ maxWidth: '300px', fontSize: '12.5px' }}>
                            {enq.notes || (enq as any).message || 'Interested in renting this unit.'}
                          </td>
                          <td>
                            <span className={`badge ${enq.status === 'new' ? 'red' : 'green'}`}>
                              {enq.status ? enq.status.toUpperCase() : 'NEW'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn brass small"
                              onClick={() => {
                                updateEnquiryStatus(enq.id, 'reviewed');
                                setOnboardEnquiryData({
                                  unitId: enq.unitId,
                                  propertyId: enq.propertyId,
                                  name: enq.prospectName,
                                  phone: enq.prospectPhone,
                                  email: enq.prospectEmail,
                                  enquiryId: enq.id,
                                });
                                setIsOnboardOpen(true);
                              }}
                            >
                              <UserPlus size={13} /> Onboard as Tenant
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review & Approve Signed Lease Modal — Full Owner Parity */}
      {inspectingSignedAgreement && (() => {
        const docUrl = inspectingSignedAgreement.signedDocumentUrl || inspectingSignedAgreement.initialAgreementUrl || inspectingSignedAgreement.fileData || (inspectingSignedAgreement as any).documentUrl;
        const docName = inspectingSignedAgreement.signedDocumentName || inspectingSignedAgreement.fileName || inspectingSignedAgreement.initialAgreementName || 'Signed_Lease_Agreement.pdf';

        const sigRaw = inspectingSignedAgreement.tenantSignature;
        const sigUrl = typeof sigRaw === 'string' ? sigRaw : sigRaw?.signatureDataUrl;
        const isSigImage = sigUrl && (sigUrl.startsWith('data:image') || sigUrl.startsWith('http://') || sigUrl.startsWith('https://') || sigUrl.startsWith('blob:'));
        const sigName = typeof sigRaw === 'string' ? sigRaw : ((sigRaw as any)?.signerName || (sigRaw as any)?.signatureDataUrl || inspectingSignedAgreement.tenant || 'Resident');
        const sigDate = (inspectingSignedAgreement as any).tenantSignedAt || (typeof sigRaw === 'object' ? (sigRaw as any)?.signedAt : undefined) || 'Timestamped on record';

        return (
          <div className="modal-backdrop" onClick={() => setInspectingSignedAgreement(null)}>
            <div
              className="modal-card"
              style={{ maxWidth: '780px', width: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
                    Review & Approve Signed Lease
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                    Document {inspectingSignedAgreement.id} • Unit {inspectingSignedAgreement.unit} • Resident: {inspectingSignedAgreement.tenant}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setInspectingSignedAgreement(null)}
                  style={{ borderRadius: '50%', width: '30px', height: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Key Summary Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <div style={{ padding: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Monthly Rent</div>
                    <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                      {getCurrencySymbol(inspectingSignedAgreement.currency || defaultCurrency)}{(inspectingSignedAgreement.rent || 0).toLocaleString()}/mo
                    </div>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Security Deposit</div>
                    <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                      {getCurrencySymbol(inspectingSignedAgreement.currency || defaultCurrency)}{(inspectingSignedAgreement.deposit || 0).toLocaleString()}
                    </div>
                    <span className={`badge ${isInspectingDepositPaid ? 'green' : 'amber'}`} style={{ fontSize: '10px', padding: '1px 5px', marginTop: '3px' }}>
                      {isInspectingDepositPaid ? '✓ Paid' : 'Unpaid'}
                    </span>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Rent Due Day</div>
                    <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                      Day {inspectingSignedAgreement.rentDueDay || (inspectingSignedAgreement as any).dueDay || 1}
                    </div>
                  </div>
                  <div style={{ padding: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Uploaded At</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>
                      {inspectingSignedAgreement.signedUploadedAt
                        ? new Date(inspectingSignedAgreement.signedUploadedAt).toLocaleDateString()
                        : 'Recently'}
                    </div>
                  </div>
                </div>

                {/* Tenant Uploaded Agreement Document Banner */}
                <div style={{ padding: '12px 16px', background: '#FAF8F4', border: '1px solid var(--brass)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileCheck size={20} color="var(--brass)" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)' }}>
                        {docName}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                        {docUrl ? 'Resident executed signed lease agreement' : 'Lease agreement record on file'}
                      </div>
                    </div>
                  </div>
                  {docUrl && (
                    <a
                      className="btn brass small"
                      href={docUrl}
                      download={docName}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                    >
                      <Download size={13} /> Download
                    </a>
                  )}
                </div>

                {/* Agreement Document Live Preview Box */}
                <div style={{ border: '1px solid var(--line)', borderRadius: '10px', overflow: 'hidden', background: '#F8FAFC', textAlign: 'center' }}>
                  {docUrl?.startsWith('data:image') || docUrl?.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) ? (
                    <div style={{ padding: '12px' }}>
                      <img
                        src={docUrl}
                        alt="Resident Signed Document Preview"
                        style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', display: 'block', margin: '0 auto', borderRadius: '6px' }}
                      />
                    </div>
                  ) : docUrl ? (
                    <iframe
                      src={docUrl}
                      style={{ width: '100%', height: '380px', border: 'none' }}
                      title="Signed Agreement Document Preview"
                    />
                  ) : inspectingSignedAgreement.contentHtml ? (
                    <div
                      style={{ padding: '16px', maxHeight: '300px', overflowY: 'auto', textAlign: 'left', background: '#FFF' }}
                      dangerouslySetInnerHTML={{ __html: inspectingSignedAgreement.contentHtml }}
                    />
                  ) : (
                    <div style={{ padding: '36px 16px', color: 'var(--ink-soft)', fontSize: '13px' }}>
                      Preview is not available in browser. Use the <b>Download</b> button above to view the resident's signed document.
                    </div>
                  )}
                </div>

                {/* Tenant Signature Verification */}
                {sigRaw && (
                  <div style={{ padding: '12px 14px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#065F46' }}>
                        Resident Digital Signature Verified
                      </span>
                      <span style={{ fontSize: '11px', color: '#065F46' }}>
                        Signed at: {sigDate}
                      </span>
                    </div>
                    {isSigImage ? (
                      <img
                        src={sigUrl}
                        alt="Tenant Signature"
                        style={{ maxHeight: '60px', maxWidth: '240px', background: '#FFF', padding: '6px', borderRadius: '6px', border: '1px solid #A7F3D0', objectFit: 'contain' }}
                      />
                    ) : (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: '#FFF', borderRadius: '6px', border: '1px solid #A7F3D0' }}>
                        <span style={{ fontFamily: 'Georgia, "Brush Script MT", cursive, serif', fontStyle: 'italic', fontSize: '18px', fontWeight: 700, color: '#065F46' }}>
                          {sigName}
                        </span>
                        <span style={{ fontSize: '10.5px', color: '#059669', background: '#D1FAE5', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          ✓ Verified E-Signature
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Uploaded ID Proofs Inspection */}
                {inspectingSignedAgreement.tenantUploadedIds && inspectingSignedAgreement.tenantUploadedIds.length > 0 ? (
                  <div style={{ padding: '14px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ledger)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <ShieldCheck size={16} color="var(--brass)" /> Uploaded Resident Identification Proofs ({inspectingSignedAgreement.tenantUploadedIds.length}):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {inspectingSignedAgreement.tenantUploadedIds.map((proof, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            background: 'var(--surface)',
                            borderRadius: '8px',
                            border: '1px solid var(--line)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="badge brass" style={{ fontSize: '10.5px', padding: '1px 6px' }}>{proof.name || 'ID Document'}</span>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{proof.fileName || 'Document File'}</span>
                          </div>
                          <a
                            href={proof.fileUrl}
                            download={proof.fileName || `${proof.name}.pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn secondary small"
                            style={{ fontSize: '11px', padding: '2px 8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Download size={11} /> Download ID
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : inspectingSignedAgreement.requireTenantId ? (
                  <div style={{ padding: '10px 14px', background: '#FFFDF5', border: '1px solid #FCD34D', borderRadius: '8px', fontSize: '12.5px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} color="#D97706" />
                    <span><b>Identity Verification Pending:</b> Landlord requested ID document(s) ({inspectingSignedAgreement.requiredIdList?.map(i => i.name).join(', ') || inspectingSignedAgreement.requiredIdType || 'IDs'}), but resident has not uploaded them yet.</span>
                  </div>
                ) : null}
              </div>

              <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleOpenRejectModal}
                  style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
                >
                  Reject / Request Revision
                </button>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {docUrl && (
                    <a
                      className="btn secondary"
                      href={docUrl}
                      download={docName}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Download size={14} /> Download Document
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setInspectingSignedAgreement(null)}
                    disabled={isApproving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn brass"
                    onClick={handleApproveSignedLease}
                    disabled={isApproving}
                    style={{ fontWeight: 700 }}
                  >
                    <ButtonProcessing
                      loading={isApproving}
                      loadingText="Approving Lease..."
                      defaultText={isInspectingDepositPaid ? "Approve Signed Lease & Activate" : "Approve Signed Lease & Request Deposit"}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reject Reason Modal */}
      {isRejectingModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsRejectingModalOpen(false)} style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: '440px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#DC2626' }}>
                Reject Signed Lease Agreement
              </h3>
              <button type="button" className="btn secondary small" onClick={() => setIsRejectingModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Reason for Rejection *</label>
              <textarea
                rows={4}
                placeholder="Explain what needs revision (e.g. ID document blurry, move-in date mismatch)..."
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px' }}
              />
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn secondary" onClick={() => setIsRejectingModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleConfirmRejectLease}
                disabled={isRejecting}
                style={{ background: '#DC2626', borderColor: '#DC2626' }}
              >
                <ButtonProcessing
                  loading={isRejecting}
                  loadingText="Rejecting..."
                  defaultText="Confirm Rejection"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offer Lease Renewal Modal */}
      {renewalModalItem && (
        <div className="modal-backdrop" onClick={() => setRenewalModalItem(null)}>
          <div className="modal-card" style={{ maxWidth: '500px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800 }}>
                  Offer Lease Renewal — Unit {renewalModalItem.unit}
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                  Resident: {renewalModalItem.tenant}
                </div>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setRenewalModalItem(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>Rent Escalation (%)</label>
                  <input
                    type="number"
                    value={renewalPercent}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value) || 0;
                      setRenewalPercent(pct);
                      setRenewalNewRent(Math.round(renewalCurrentRent * (1 + pct / 100)));
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>New Monthly Rent ({defaultCurrency})</label>
                  <input
                    type="number"
                    value={renewalNewRent}
                    onChange={(e) => setRenewalNewRent(parseInt(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>New Term Start</label>
                  <input
                    type="date"
                    value={renewalStartDate}
                    onChange={(e) => setRenewalStartDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>New Term End</label>
                  <input
                    type="date"
                    value={renewalEndDate}
                    onChange={(e) => setRenewalEndDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)' }}
                  />
                </div>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Manager Notes to Resident</label>
                <textarea
                  rows={3}
                  placeholder="Optional terms or message regarding this renewal offer..."
                  value={renewalManagerNotes}
                  onChange={(e) => setRenewalManagerNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12.5px' }}
                />
              </div>
            </div>

            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn secondary" onClick={() => setRenewalModalItem(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleSendRenewalOffer}
                disabled={isSendingRenewalOffer}
              >
                <ButtonProcessing
                  loading={isSendingRenewalOffer}
                  loadingText="Dispatching..."
                  defaultText="Dispatch Renewal Offer"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Signed Renewal Modal */}
      {inspectingSignedRenewal && (
        <div className="modal-backdrop" onClick={() => setInspectingSignedRenewal(null)}>
          <div className="modal-card" style={{ maxWidth: '480px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800 }}>
                Review Signed Renewal — Unit {inspectingSignedRenewal.unit}
              </h3>
              <button type="button" className="btn secondary small" onClick={() => setInspectingSignedRenewal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: 'var(--surface-sunken)', padding: '12px', borderRadius: '8px' }}>
                <b>{inspectingSignedRenewal.tenant}</b> accepted the renewal at{' '}
                <b>{defaultCurrency}{(inspectingSignedRenewal.proposedRent || inspectingSignedRenewal.currentRent || 0).toLocaleString()}/mo</b>.
              </div>
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn secondary" onClick={() => setInspectingSignedRenewal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleApproveRenewal}
                disabled={isApprovingRenewal}
              >
                <ButtonProcessing
                  loading={isApprovingRenewal}
                  loadingText="Activating..."
                  defaultText="Activate Renewal Contract"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Template Modal */}
      {isUploadTemplateOpen && (
        <div className="modal-backdrop" onClick={() => setIsUploadTemplateOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '480px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800 }}>
                Upload Agreement Template
              </h3>
              <button type="button" className="btn secondary small" onClick={() => setIsUploadTemplateOpen(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Template Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Standard 11-Month Residential Lease"
                  value={newTemplateTitle}
                  onChange={(e) => setNewTemplateTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Building Scope</label>
                <select
                  value={newTemplatePropertyId}
                  onChange={(e) => setNewTemplatePropertyId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}
                >
                  <option value="all">All Managed Properties</option>
                  {myProperties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Upload PDF File *</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleTemplateFileUpload}
                  style={{ width: '100%', padding: '8px 0' }}
                />
                {newTemplateFileName && (
                  <div style={{ fontSize: '12px', color: '#047857', marginTop: '4px' }}>
                    ✓ Attached: {newTemplateFileName} ({newTemplateFileSize || 0} KB)
                  </div>
                )}
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600 }}>Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief notes on applicable clauses or property usage..."
                  value={newTemplateDescription}
                  onChange={(e) => setNewTemplateDescription(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '12.5px' }}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn secondary" onClick={() => setIsUploadTemplateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleSaveNewTemplate}
                disabled={isUploadingTemplate}
              >
                <ButtonProcessing
                  loading={isUploadingTemplate}
                  loadingText="Uploading..."
                  defaultText="Save to Library"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Template Confirmation Modal */}
      {deletingTemplate && (
        <div className="modal-backdrop" onClick={() => setDeletingTemplate(null)}>
          <div className="modal-card" style={{ maxWidth: '420px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '14px 18px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#DC2626' }}>Delete Template</h3>
            </div>
            <div className="modal-body" style={{ padding: '18px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink)' }}>
                Are you sure you want to delete <b>{deletingTemplate.title}</b> from your template library?
              </p>
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn secondary" onClick={() => setDeletingTemplate(null)}>Cancel</button>
              <button
                type="button"
                className="btn brass"
                onClick={handleDeleteTemplate}
                disabled={isDeletingTemplate}
                style={{ background: '#DC2626', borderColor: '#DC2626' }}
              >
                <ButtonProcessing loading={isDeletingTemplate} loadingText="Deleting..." defaultText="Delete Template" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Agreement Details Modal — 1:1 Full Parity with Owner */}
      {viewingAgreement && (
        <div className="modal-backdrop" onClick={() => setViewingAgreement(null)}>
          <div className="modal-card" style={{ maxWidth: '680px', width: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>Lease #{viewingAgreement.id}</h3>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  {viewingAgreement.propertyName || 'Property'} • Unit {viewingAgreement.unit}
                </div>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setViewingAgreement(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink)' }}>{viewingAgreement.tenant}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Unit {viewingAgreement.unit}</div>
                </div>
                <span className={`badge ${
                  viewingAgreement.status === 'active' || viewingAgreement.status === 'signed'
                    ? 'green'
                    : viewingAgreement.status === 'pending_approval' || viewingAgreement.status === 'awaiting_tenant_upload'
                    ? 'amber'
                    : 'blue'
                }`}>
                  {viewingAgreement.status === 'active' ? '✓ Active Lease' : viewingAgreement.status === 'signed' ? '✓ Signed' : viewingAgreement.status === 'pending_approval' ? 'Pending Approval' : viewingAgreement.status === 'awaiting_tenant_upload' ? 'Awaiting Signature' : viewingAgreement.status || 'On Record'}
                </span>
              </div>

              {/* Key KV Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div style={{ padding: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Term</div>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '2px' }}>{viewingAgreement.start} → {viewingAgreement.end}</div>
                </div>
                <div style={{ padding: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Monthly Rent</div>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                    {getCurrencySymbol(viewingAgreement.currency || defaultCurrency)}{(viewingAgreement.rent || 0).toLocaleString()}/mo
                  </div>
                </div>
                <div style={{ padding: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Security Deposit</div>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                    {getCurrencySymbol(viewingAgreement.currency || defaultCurrency)}{(viewingAgreement.deposit || 0).toLocaleString()}
                  </div>
                  <span className={`badge ${isViewingDepositPaid ? 'green' : 'amber'}`} style={{ fontSize: '10px', padding: '1px 5px', marginTop: '3px' }}>
                    {isViewingDepositPaid ? '✓ Paid' : 'Unpaid'}
                  </span>
                </div>
                <div style={{ padding: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Rent Due Day</div>
                  <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                    Day {viewingAgreement.rentDueDay || (viewingAgreement as any).dueDay || 1}
                  </div>
                </div>
                <div style={{ padding: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Auto-Renew</div>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '2px' }}>
                    {viewingAgreement.autoRenew ? 'On' : 'Off'}
                  </div>
                </div>
                <div style={{ padding: '10px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Lock-in / Notice</div>
                  <div style={{ fontWeight: 600, fontSize: '12.5px', marginTop: '2px' }}>
                    {(viewingAgreement as any).lockInMonths || 11}m / {(viewingAgreement as any).noticePeriodDays || 30}d
                  </div>
                </div>
              </div>

              {/* Digital Signature Verification Card */}
              {viewingAgreement.tenantSignature && (() => {
                const sigRaw = viewingAgreement.tenantSignature;
                const sigUrl = typeof sigRaw === 'string' ? sigRaw : sigRaw?.signatureDataUrl;
                const isSigImage = sigUrl && (sigUrl.startsWith('data:image') || sigUrl.startsWith('http://') || sigUrl.startsWith('https://') || sigUrl.startsWith('blob:'));
                const sigName = typeof sigRaw === 'string' ? sigRaw : ((sigRaw as any)?.signerName || (sigRaw as any)?.signatureDataUrl || viewingAgreement.tenant || 'Resident');
                const sigDate = (viewingAgreement as any).tenantSignedAt || (typeof sigRaw === 'object' ? (sigRaw as any)?.signedAt : undefined) || 'Timestamped on record';

                return (
                  <div style={{ padding: '12px 14px', background: '#F2F8F4', border: '1px solid #B8DCBE', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--ledger)', fontSize: '12.5px' }}>
                        ✓ Resident Digitally Signed & Legally Verified
                      </span>
                      <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                        {sigDate}
                      </span>
                    </div>
                    {isSigImage ? (
                      <img
                        src={sigUrl}
                        alt="Tenant Digital Signature"
                        style={{ maxHeight: '50px', maxWidth: '240px', background: '#FFF', padding: '4px 8px', borderRadius: '6px', border: '1px solid #B8DCBE', objectFit: 'contain' }}
                      />
                    ) : (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: '#FFF', borderRadius: '6px', border: '1px solid #B8DCBE' }}>
                        <span style={{ fontFamily: 'Georgia, "Brush Script MT", cursive, serif', fontStyle: 'italic', fontSize: '17px', fontWeight: 700, color: '#065F46' }}>
                          {sigName}
                        </span>
                        <span style={{ fontSize: '10px', color: '#059669', background: '#D1FAE5', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                          ✓ Verified
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Dual-Document Repository in Details Modal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>
                  Tenancy Agreement Documents & Records
                </div>

                {/* Record 1: Before Resident Sign (Landlord Dispatched Copy) */}
                {(viewingAgreement.initialAgreementUrl || viewingAgreement.fileData || viewingAgreement.ownerSignedDocumentUrl) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#FAF9F5', border: '1.5px solid var(--brass)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileText size={18} color="var(--brass)" />
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
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                    >
                      <Download size={12} /> Download
                    </a>
                  </div>
                )}

                {/* Record 2: After Resident Sign (Resident Signed Copy) */}
                {viewingAgreement.signedDocumentUrl ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#F2F8F4', border: '1px solid #B8DCBE', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileCheck size={18} color="var(--ledger)" />
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
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                    >
                      <Download size={12} /> Download
                    </a>
                  </div>
                ) : (
                  <div style={{ padding: '10px 12px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', fontSize: '12px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} /> 2. Resident Signed Copy: Awaiting resident physical ink signature and upload.
                  </div>
                )}

                {/* Record 3: Resident Identification Documents */}
                {viewingAgreement.tenantUploadedIds && viewingAgreement.tenantUploadedIds.length > 0 ? (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ledger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={15} color="var(--brass)" /> 3. Resident Identity Verification Documents ({viewingAgreement.tenantUploadedIds.length})
                    </div>
                    {viewingAgreement.tenantUploadedIds.map((idDoc, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px' }}>
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
                  <div style={{ marginTop: '6px', padding: '10px 12px', background: '#FFFDF5', border: '1px solid #FCD34D', borderRadius: '8px', fontSize: '12px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={13} color="#D97706" />
                    <span>3. Identity Documents: Awaiting resident upload ({viewingAgreement.requiredIdList?.map(i => i.name).join(', ') || viewingAgreement.requiredIdType || 'ID Document'}).</span>
                  </div>
                ) : null}
              </div>

              {/* Document Preview Box if file attached */}
              {(() => {
                const docUrl = viewingAgreement.signedDocumentUrl || viewingAgreement.initialAgreementUrl || viewingAgreement.fileData;
                if (!docUrl && !viewingAgreement.contentHtml) return null;

                return (
                  <div style={{ marginTop: '4px', border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden', background: '#F8FAFC' }}>
                    {docUrl?.startsWith('data:image') || docUrl?.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) ? (
                      <div style={{ padding: '12px', textAlign: 'center' }}>
                        <img
                          src={docUrl}
                          alt="Agreement Document Preview"
                          style={{ maxWidth: '100%', maxHeight: '350px', objectFit: 'contain', margin: '0 auto', display: 'block' }}
                        />
                      </div>
                    ) : docUrl ? (
                      <iframe
                        src={docUrl}
                        style={{ width: '100%', height: '320px', border: 'none' }}
                        title="Agreement Document Preview"
                      />
                    ) : viewingAgreement.contentHtml ? (
                      <div
                        style={{ padding: '16px', maxHeight: '260px', overflowY: 'auto', background: '#FFF' }}
                        dangerouslySetInnerHTML={{ __html: viewingAgreement.contentHtml }}
                      />
                    ) : null}
                  </div>
                );
              })()}
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn brass small"
                onClick={() => downloadAgreementPDF(viewingAgreement, myProperties.find((p) => p.id === viewingAgreement.propertyId)?.name)}
              >
                <Download size={13} /> Download PDF
              </button>
              <button type="button" className="btn secondary" onClick={() => setViewingAgreement(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {previewingTemplate && (
        <div className="modal-backdrop" onClick={() => setPreviewingTemplate(null)}>
          <div className="modal" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{previewingTemplate.title}</h3>
              <button type="button" className="btn secondary small" onClick={() => setPreviewingTemplate(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '12px' }}>
                {previewingTemplate.fileName || 'Document'} • {previewingTemplate.fileSizeKb || 0} KB • Uploaded {new Date(previewingTemplate.uploadedAt).toLocaleDateString()}
              </div>
              {previewingTemplate.fileData ? (
                previewingTemplate.fileData.startsWith('data:image/') ? (
                  <img
                    src={previewingTemplate.fileData}
                    alt={previewingTemplate.title}
                    style={{ maxWidth: '100%', maxHeight: '480px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                  />
                ) : (
                  <iframe
                    src={previewingTemplate.fileData}
                    title={previewingTemplate.title}
                    style={{ width: '100%', height: '480px', border: '1px solid var(--line)', borderRadius: '8px' }}
                  />
                )
              ) : (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                  No previewable file data attached to this template.
                </div>
              )}
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {previewingTemplate.fileData && (
                <a
                  href={previewingTemplate.fileData}
                  download={previewingTemplate.fileName || 'agreement-template.pdf'}
                  className="btn brass small"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <Download size={13} /> Download
                </a>
              )}
              <button type="button" className="btn secondary" onClick={() => setPreviewingTemplate(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Onboard Resident Modal for Manager */}
      <OnboardResidentModal
        isOpen={isOnboardOpen}
        onClose={() => {
          setIsOnboardOpen(false);
          setOnboardEnquiryData(null);
          setSelectedDraftId(null);
        }}
        entryContext="leasing"
        draftAgreementId={selectedDraftId}
        preselectedUnitId={onboardEnquiryData?.unitId}
        preselectedPropertyId={onboardEnquiryData?.propertyId}
        prefilledTenantName={onboardEnquiryData?.name}
        prefilledTenantPhone={onboardEnquiryData?.phone}
        prefilledTenantEmail={onboardEnquiryData?.email}
        enquiryId={onboardEnquiryData?.enquiryId}
        onSuccess={(tenantName, unitLabel) => {
          showToast(`✓ Onboarding initiated for ${tenantName} (${unitLabel})!`);
          setIsOnboardOpen(false);
          setOnboardEnquiryData(null);
          setSelectedDraftId(null);
        }}
      />
    </div>
  );
};
