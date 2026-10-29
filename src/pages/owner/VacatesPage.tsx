import React, { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { MoveOut, MoveOutAmenityCheck, MoveOutDeduction, PaymentTransaction, DepositSettlement, CashHandoverClaim, DepositDeductionItem, InAppNotification } from '../../types';
import { Camera, Plus, Trash2, CheckCircle2, DollarSign, Download, Landmark, Printer, X } from 'lucide-react';
import { getDaysFromNowString } from '../../lib/dates';
import { downloadDepositSettlementPdf, downloadCashHandoverReceiptPdf } from '../../lib/pdf';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Spinner, ButtonProcessing } from '../../components/common/Spinner';
import { DEFAULT_CURRENCY, normalizeCurrencyCode, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol } from '../../lib/currencyService';

export const DEFAULT_INSPECTION_ITEMS: MoveOutAmenityCheck[] = [
  { room: 'Living Room', item: 'Paint, Walls & Ceilings', amenity: 'Paint, Walls & Ceilings', condition: 'good', deduction: 0, photos: [], notes: '' },
  { room: 'Kitchen', item: 'Counters, Cabinets & Appliances', amenity: 'Counters, Cabinets & Appliances', condition: 'good', deduction: 0, photos: [], notes: '' },
  { room: 'Bedrooms', item: 'Doors, Windows, Locks & Keys', amenity: 'Doors, Windows, Locks & Keys', condition: 'good', deduction: 0, photos: [], notes: '' },
  { room: 'Bathroom', item: 'Plumbing, Sanitary & Taps', amenity: 'Plumbing, Sanitary & Taps', condition: 'good', deduction: 0, photos: [], notes: '' },
  { room: 'Premises', item: 'Flooring, Tiles & Carpets', amenity: 'Flooring, Tiles & Carpets', condition: 'good', deduction: 0, photos: [], notes: '' },
  { room: 'Utility / Balcony', item: 'Electrical, Lighting & Fixtures', amenity: 'Electrical, Lighting & Fixtures', condition: 'good', deduction: 0, photos: [], notes: '' },
];

const DEFAULT_AMENITIES = [
  'Paint, Walls & Ceilings',
  'Counters, Cabinets & Appliances',
  'Doors, Windows, Locks & Keys',
  'Plumbing, Sanitary & Taps',
  'Flooring, Tiles & Carpets',
  'Electrical, Lighting & Fixtures',
];

export const VacatesPage: React.FC = () => {
  const { state, updateState, saveMoveout, createDepositSettlement, executeDepositRefund, submitCashClaim, showToast } = useAppData();
  const { user } = useAuth();
  const ownerId = user?.id || '';

  // Owner initiate notice modal state
  const [isInitiateNoticeOpen, setIsInitiateNoticeOpen] = useState(false);
  const [initiateUnitId, setInitiateUnitId] = useState('');
  const [initiateDate, setInitiateDate] = useState(getDaysFromNowString(30));
  const [initiateReason, setInitiateReason] = useState('Tenancy tenure conclusion / mutual vacate agreement');

  // Loading and action-in-progress state tracking
  const [isProcessingNotice, setIsProcessingNotice] = useState(false);
  const [isProcessingSchedule, setIsProcessingSchedule] = useState(false);
  const [isProcessingInspection, setIsProcessingInspection] = useState(false);
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const [isProcessingRecalculate, setIsProcessingRecalculate] = useState(false);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  // Schedule inspection modal state
  const [schedulingMoveOut, setSchedulingMoveOut] = useState<MoveOut | null>(null);
  const [scheduleInspectDate, setScheduleInspectDate] = useState(getDaysFromNowString(5));
  const [scheduleExpectedRefundDate, setScheduleExpectedRefundDate] = useState(getDaysFromNowString(10));

  // Inspection modal state
  const [inspectingMoveOut, setInspectingMoveOut] = useState<MoveOut | null>(null);
  const [inspectionChecklist, setInspectionChecklist] = useState<MoveOutAmenityCheck[]>([]);
  const [deductions, setDeductions] = useState<MoveOutDeduction[]>([]);
  const [customDeductReason, setCustomDeductReason] = useState('');
  const [customDeductAmount, setCustomDeductAmount] = useState<number | ''>('');
  const [customDeductAmenity, setCustomDeductAmenity] = useState(DEFAULT_AMENITIES[0]);
  const [inspectionDateInput, setInspectionDateInput] = useState(getDaysFromNowString(5));
  const [refundDateInput, setRefundDateInput] = useState(getDaysFromNowString(10));

  // Dynamic inspection item state
  const [showAddChecklistModal, setShowAddChecklistModal] = useState(false);
  const [newChecklistRoom, setNewChecklistRoom] = useState('Living Room');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [newChecklistCondition, setNewChecklistCondition] = useState<'good' | 'minor_wear' | 'damaged'>('good');
  const [newChecklistDeduction, setNewChecklistDeduction] = useState<number | ''>('');
  const [newChecklistNotes, setNewChecklistNotes] = useState('');

  // Refund completion modal state
  const [moveOutToComplete, setMoveOutToComplete] = useState<MoveOut | null>(null);
  const [refundPayoutMethod, setRefundPayoutMethod] = useState('UPI');
  const [refundTxRef, setRefundTxRef] = useState('');
  const [refundProofUrl, setRefundProofUrl] = useState('');
  const [tenantRating, setTenantRating] = useState(5);
  const [tenantReview, setTenantReview] = useState('');

  // Dynamic Payout Sub-Fields
  const [refundBankName, setRefundBankName] = useState('');
  const [refundUpiApp, setRefundUpiApp] = useState('Google Pay');
  const [refundChequeNo, setRefundChequeNo] = useState('');
  const [refundChequeDate, setRefundChequeDate] = useState('');
  const [refundCashDate, setRefundCashDate] = useState('');
  const [refundCashLocation, setRefundCashLocation] = useState('');
  const [refundCashWitness, setRefundCashWitness] = useState('');

  const handleRefundProofUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setRefundProofUrl(reader.result as string);
        showToast('✓ Payment proof receipt attached.');
      };
      reader.readAsDataURL(file);
    }
  };

  const openCompleteModal = (m: MoveOut, settleMatch?: DepositSettlement) => {
    setMoveOutToComplete(m);
    setRefundProofUrl('');
    setRefundTxRef(settleMatch?.paymentReference || '');
    setTenantReview('Tenant maintained property well and coordinated move-out inspection promptly.');
    setRefundBankName('');
    setRefundUpiApp('Google Pay');
    setRefundChequeNo('');
    setRefundChequeDate(new Date().toISOString().split('T')[0]);
    setRefundCashDate(new Date().toISOString().split('T')[0]);
    setRefundCashLocation(`Unit ${m.unit} Premises / Key Handover`);
    setRefundCashWitness('');

    if (settleMatch?.chosenPayoutDetails) {
      const mtd = settleMatch.chosenPayoutDetails.method;
      if (mtd === 'upi') setRefundPayoutMethod('UPI');
      else if (mtd === 'paypal') setRefundPayoutMethod('PayPal');
      else if (mtd === 'iban') setRefundPayoutMethod('SEPA Wire (IBAN)');
      else if (mtd === 'bank_in') setRefundPayoutMethod('Bank Wire');
      else if (mtd === 'cash') setRefundPayoutMethod('Cash');
    } else {
      const isIndia = normalizeCurrencyCode(m.currency) === 'INR';
      setRefundPayoutMethod(isIndia ? 'UPI' : 'PayPal');
    }
  };

  // Recalculate settlement modal state
  const [recalculatingMoveOut, setRecalculatingMoveOut] = useState<MoveOut | null>(null);
  const [recalculatingSettlement, setRecalculatingSettlement] = useState<DepositSettlement | null>(null);
  const [recalculatedDeductions, setRecalculatedDeductions] = useState<DepositDeductionItem[]>([]);
  const [ownerRevisionNotes, setOwnerRevisionNotes] = useState('');
  const [newDeductTitle, setNewDeductTitle] = useState('');
  const [newDeductAmount, setNewDeductAmount] = useState('');

  const openRecalculateModal = (m: MoveOut, s: DepositSettlement) => {
    setRecalculatingMoveOut(m);
    setRecalculatingSettlement(s);
    setRecalculatedDeductions(
      s.deductions && s.deductions.length > 0
        ? [...s.deductions]
        : (m.deductions || []).map((d, i) => ({
            id: `ded-${i}-${Date.now()}`,
            category: 'repair_damage' as const,
            title: d.reason || d.amenity || 'Deduction',
            amount: d.amount,
          }))
    );
    setOwnerRevisionNotes(s.revisionNotes || '');
    setNewDeductTitle('');
    setNewDeductAmount('');
  };

  const handleSaveRecalculatedSettlement = async () => {
    if (!recalculatingMoveOut || !recalculatingSettlement) return;
    setIsProcessingRecalculate(true);
    try {

    const totalDeductions = recalculatedDeductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const netRefund = Math.max(0, recalculatingMoveOut.deposit - totalDeductions);
    const now = new Date().toISOString();

    const updatedSettlement: DepositSettlement = {
      ...recalculatingSettlement,
      deductions: recalculatedDeductions,
      totalDeductions,
      netRefundableAmount: netRefund,
      status: 'awaiting_tenant_approval',
      revisionNotes: ownerRevisionNotes.trim() || undefined,
      revisedAt: now,
    };

    const updatedMoveout: MoveOut = {
      ...recalculatingMoveOut,
      status: 'refund_scheduled',
      deductions: recalculatedDeductions.map((d) => ({
        reason: d.title,
        amount: d.amount,
        amenity: (d as any).amenity || d.category,
      })),
      finalRefundAmount: netRefund,
    };

    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: recalculatingSettlement.tenantId || recalculatingMoveOut.tenantId || '',
      title: 'Recalculated Move-Out Settlement Available',
      body: `Your landlord has recalculated the deductions for Unit ${recalculatingSettlement.unit}. New net refundable balance: ${getCurrencySymbol(recalculatingSettlement.currency) || DEFAULT_CURRENCY_SYMBOL}${netRefund.toLocaleString('en-IN')}.${ownerRevisionNotes ? ` Note: "${ownerRevisionNotes.trim()}"` : ''} Please review to accept or reject.`,
      link: '/tenant/dashboard',
      isRead: false,
      createdAt: now,
    };

    updateState((prev) => ({
      ...prev,
      depositSettlements: (prev.depositSettlements || []).map((s) => (s.id === updatedSettlement.id ? updatedSettlement : s)),
      moveouts: (prev.moveouts || []).map((m) => (m.id === updatedMoveout.id ? updatedMoveout : m)),
      notifications: notif.userId ? [...(prev.notifications || []), notif] : prev.notifications,
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'depositSettlements', updatedSettlement.id), updatedSettlement, { merge: true });
        await setDoc(doc(db, 'moveouts', updatedMoveout.id), updatedMoveout, { merge: true });
        if (notif.userId) {
          await setDoc(doc(db, 'notifications', notif.id), notif);
        }
      } catch (err) {
        console.warn('Firestore recalculation sync error:', err);
      }
    }

    setRecalculatingMoveOut(null);
    setRecalculatingSettlement(null);
    showToast(`✓ Recalculated settlement dispatched to ${recalculatingMoveOut.tenant}.`);
    } finally {
      setIsProcessingRecalculate(false);
    }
  };

  const ownerEmail = user?.email?.toLowerCase() || '';
  const ownerName = user?.displayName?.toLowerCase() || '';

  const isGenericName = (name?: string) => {
    if (!name) return true;
    const n = name.trim().toLowerCase();
    return n === 'property owner' || n === 'landlord' || n === 'owner' || n === 'admin' || n === 'manager';
  };

  // All properties owned by this owner
  const myProperties = state.properties.filter(
    (p) =>
      (ownerId && p.ownerId === ownerId) ||
      (ownerEmail && (p as any).ownerEmail?.toLowerCase() === ownerEmail) ||
      (!isGenericName(ownerName) && (p as any).ownerName?.toLowerCase() === ownerName)
  );
  const myPropertyIds = new Set(myProperties.map((p) => p.id));

  // All units owned by this owner
  const myUnits = state.units.filter(
    (u) =>
      (ownerId && u.ownerId === ownerId) ||
      (u.propertyId && myPropertyIds.has(u.propertyId))
  );
  const myUnitNumbers = new Set(myUnits.map((u) => u.unitNumber));
  const myUnitIds = new Set(myUnits.map((u) => u.id));

  // All agreements belonging to this owner — require ownerId or propertyId match; unit-number fallback
  // only when the unit is in myUnitIds (already owner-scoped) to prevent cross-owner leakage.
  const myAgreements = state.agreements.filter((a) => {
    // Hard reject: different explicit owner
    if (ownerId && a.ownerId && a.ownerId !== ownerId) return false;
    // Hard reject: bound to a property not owned by this owner
    if (a.propertyId && !myPropertyIds.has(a.propertyId)) return false;
    if (ownerId && a.ownerId === ownerId) return true;
    if (a.propertyId && myPropertyIds.has(a.propertyId)) return true;
    // Unit ID match (already owner-scoped via myUnitIds)
    if (a.unit && myUnitIds.has(a.unit)) return true;
    // Unit number + property match (must be within this owner's properties)
    if (a.unit && myUnits.some((u) => u.unitNumber === a.unit && u.propertyId && myPropertyIds.has(u.propertyId))) return true;
    return false;
  });
  const myAgreementIds = new Set(myAgreements.map((a) => a.id));

  // All tenants belonging to this owner — never include by name alone.
  const myTenants = state.tenants.filter((t) => {
    if (ownerId && t.ownerId === ownerId) return true;
    if (t.propertyId && myPropertyIds.has(t.propertyId)) return true;
    if (myAgreements.some((a) => (a.tenantId && a.tenantId === t.id) || (a.tenantEmail && t.email && a.tenantEmail.toLowerCase() === t.email.toLowerCase()))) return true;
    if (myUnits.some((u) => u.currentTenantId === t.id)) return true;
    // Unit ID match (owner-scoped)
    if (t.unit && myUnitIds.has(t.unit)) return true;
    // Unit number + property match
    if (t.unit && myUnits.some((u) => u.unitNumber === t.unit && u.propertyId && myPropertyIds.has(u.propertyId))) return true;
    return false;
  });
  const myTenantIds = new Set(myTenants.map((t) => t.id));

  const myMoveouts = state.moveouts.filter((m) => {
    // 1. HARD DISQUALIFICATIONS:
    if (m.propertyId && !myPropertyIds.has(m.propertyId)) return false;
    if (ownerId && m.ownerId && m.ownerId !== ownerId && (!m.propertyId || !myPropertyIds.has(m.propertyId))) return false;

    // 2. POSITIVE INCLUSIONS — prefer explicit IDs, avoid name-only matches:
    // A. Owner ID match
    if (ownerId && m.ownerId === ownerId) return true;
    // B. Property ID match
    if (m.propertyId && myPropertyIds.has(m.propertyId)) return true;
    // C. Agreement ID match
    if ((m as any).agreementId && myAgreementIds.has((m as any).agreementId)) return true;
    // D. Unit document ID match (owner-scoped)
    if (m.unit && myUnitIds.has(m.unit)) return true;
    // E. Tenant ID match (most reliable tenant association)
    if (m.tenantId && myTenantIds.has(m.tenantId)) return true;
    // F. Unit number + verified tenant ID (requires tenantId to avoid name collision)
    if (m.unit && m.tenantId) {
      const unitObj = myUnits.find((u) => u.unitNumber === m.unit && myPropertyIds.has(u.propertyId));
      if (unitObj && myTenantIds.has(m.tenantId)) return true;
    }

    return false;
  });
  const occupiedUnits = myUnits.filter((u) => u.status === 'occupied');

  const openScheduleModal = (m: MoveOut) => {
    setSchedulingMoveOut(m);
    setScheduleInspectDate(m.inspectionDate || getDaysFromNowString(5));
    setScheduleExpectedRefundDate(m.refundDate || getDaysFromNowString(10));
  };

  const handleConfirmScheduleInspection = async () => {
    if (!schedulingMoveOut) return;
    setIsProcessingSchedule(true);
    try {

    const updatedMoveout: MoveOut = {
      ...schedulingMoveOut,
      status: 'inspection_scheduled',
      inspectionDate: scheduleInspectDate,
      refundDate: scheduleExpectedRefundDate,
    };

    const notif = schedulingMoveOut.tenantId
      ? {
        id: `notif_${Date.now()}`,
        userId: schedulingMoveOut.tenantId,
        title: 'Move-Out Inspection Scheduled',
        body: `Inspection for Unit ${schedulingMoveOut.unit} has been scheduled for ${scheduleInspectDate}. Estimated deposit settlement: ${scheduleExpectedRefundDate}.`,
        link: '/tenant/lease',
        isRead: false,
        createdAt: new Date().toISOString(),
      }
      : null;

    await saveMoveout(updatedMoveout);

    if (notif) {
      updateState((prev) => ({
        ...prev,
        notifications: [...(prev.notifications || []), notif],
      }));
    }

    setSchedulingMoveOut(null);
    showToast(`✓ Inspection scheduled for ${scheduleInspectDate}. Resident notified.`);
    } finally {
      setIsProcessingSchedule(false);
    }
  };

  const openInspectionModal = (m: MoveOut) => {
    setInspectingMoveOut(m);
    // Seed standard items if missing, or normalize existing items
    if (m.inspectionChecklist && m.inspectionChecklist.length > 0) {
      setInspectionChecklist(
        m.inspectionChecklist.map((item, idx) => ({
          ...item,
          id: item.id || `chk-${idx}-${Date.now()}`,
          room: item.room || 'General',
          item: item.item || item.amenity || 'Inspection Item',
          amenity: item.amenity || item.item || 'Inspection Item',
          condition: item.condition || 'good',
          deduction: Number(item.deduction) || 0,
          photos: item.photos || (item.photo ? [item.photo] : []),
          notes: item.notes || '',
        }))
      );
    } else {
      setInspectionChecklist(
        DEFAULT_INSPECTION_ITEMS.map((item, idx) => ({
          ...item,
          id: `chk-${idx}-${Date.now()}`,
        }))
      );
    }
    setDeductions(m.deductions || []);
    setInspectionDateInput(m.inspectionDate || getDaysFromNowString(5));
    setRefundDateInput(m.refundDate || getDaysFromNowString(10));
    setCustomDeductReason('');
    setCustomDeductAmount('');
  };

  const handleAddNewInspectionItem = () => {
    if (!newChecklistItem.trim()) {
      showToast('Please enter an amenity / item name.');
      return;
    }
    const created: MoveOutAmenityCheck = {
      id: `chk-${Date.now()}`,
      room: newChecklistRoom || 'General',
      item: newChecklistItem.trim(),
      amenity: newChecklistItem.trim(),
      condition: newChecklistCondition,
      deduction: newChecklistCondition === 'damaged' ? Number(newChecklistDeduction) || 0 : 0,
      notes: newChecklistNotes.trim(),
      photos: [],
    };
    setInspectionChecklist((prev) => [...prev, created]);
    setShowAddChecklistModal(false);
    setNewChecklistItem('');
    setNewChecklistCondition('good');
    setNewChecklistDeduction('');
    setNewChecklistNotes('');
    showToast(`✓ Added inspection item: ${created.room} — ${created.item}`);
  };

  const handleRemoveInspectionItem = (index: number) => {
    const itemToRemove = inspectionChecklist[index];
    setInspectionChecklist((prev) => prev.filter((_, i) => i !== index));
    showToast(`✓ Removed ${itemToRemove?.room || ''} ${itemToRemove?.item || itemToRemove?.amenity || 'item'}.`);
  };

  const handleUpdateItemCondition = (index: number, condition: 'good' | 'minor_wear' | 'damaged' | 'fair') => {
    setInspectionChecklist((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const isDamaged = condition === 'damaged';
        return {
          ...item,
          condition,
          deduction: isDamaged ? (item.deduction || 1000) : 0,
        };
      })
    );
  };

  const handleUpdateItemDeduction = (index: number, amount: number) => {
    setInspectionChecklist((prev) =>
      prev.map((item, i) => (i === index ? { ...item, deduction: Math.max(0, amount) } : item))
    );
  };

  const handleUpdateItemNotes = (index: number, notes: string) => {
    setInspectionChecklist((prev) =>
      prev.map((item, i) => (i === index ? { ...item, notes } : item))
    );
  };

  const handleAddCustomDeduction = () => {
    if (!customDeductReason.trim()) {
      showToast('Please enter a description for the deduction.');
      return;
    }
    const amt = Number(customDeductAmount);
    if (!amt || amt <= 0) {
      showToast('Please enter a valid deduction amount.');
      return;
    }

    setDeductions((prev) => [
      ...prev,
      {
        reason: customDeductReason.trim(),
        amount: amt,
        amenity: customDeductAmenity,
      },
    ]);
    setCustomDeductReason('');
    setCustomDeductAmount('');
    showToast(`✓ Added deduction of ${inspectingMoveOut?.currency || DEFAULT_CURRENCY_SYMBOL}${amt.toLocaleString('en-IN')}.`);
  };

  const handleAddPresetDeduction = (reason: string, amount: number, amenity: string) => {
    setDeductions((prev) => [
      ...prev,
      {
        reason,
        amount,
        amenity,
      },
    ]);
    showToast(`✓ Added preset: ${reason} (${getCurrencySymbol(inspectingMoveOut?.currency) || DEFAULT_CURRENCY_SYMBOL}${amount.toLocaleString('en-IN')}).`);
  };

  const handleRemoveDeduction = (index: number) => {
    setDeductions((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePhotoUpload = (itemIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = reader.result as string;
        setInspectionChecklist((prev) =>
          prev.map((item, idx) =>
            idx === itemIdx
              ? {
                ...item,
                photos: [...(item.photos || []), b64],
              }
              : item
          )
        );
        showToast(`✓ Photo attached for ${inspectionChecklist[itemIdx]?.item || inspectionChecklist[itemIdx]?.amenity}.`);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = (itemIdx: number, photoIdx: number) => {
    setInspectionChecklist((prev) =>
      prev.map((item, idx) =>
        idx === itemIdx
          ? {
            ...item,
            photos: (item.photos || []).filter((_, pIdx) => pIdx !== photoIdx),
          }
          : item
      )
    );
  };

  const handleCompleteInspection = async () => {
    if (!inspectingMoveOut) return;
    setIsProcessingInspection(true);
    try {

    const checklistDeductions: MoveOutDeduction[] = inspectionChecklist
      .filter((c) => (c.deduction || 0) > 0)
      .map((c) => ({
        reason: `${c.room || 'General'} - ${c.item || c.amenity}${c.notes ? ` (${c.notes})` : ''}`,
        amount: Number(c.deduction) || 0,
        amenity: c.item || c.amenity || 'Inspection Item',
      }));

    const allDeductions: MoveOutDeduction[] = [
      ...checklistDeductions,
      ...deductions.filter((d) => !checklistDeductions.some((cd) => cd.amenity === d.amenity && cd.amount === d.amount)),
    ];

    const totalDeductions = allDeductions.reduce((sum, d) => sum + d.amount, 0);
    const finalRefund = Math.max(0, inspectingMoveOut.deposit - totalDeductions);

    const updatedMoveout: MoveOut = {
      ...inspectingMoveOut,
      status: 'refund_scheduled',
      inspectionDate: inspectionDateInput,
      refundDate: refundDateInput,
      inspectionChecklist,
      deductions: allDeductions,
      finalRefundAmount: finalRefund,
    };

    // Resolve unit: strictly match unit number and propertyId
    const targetUnit =
      myUnits.find(
        (u) =>
          (u.unitNumber === inspectingMoveOut.unit || u.id === inspectingMoveOut.unit) &&
          (!inspectingMoveOut.propertyId || u.propertyId === inspectingMoveOut.propertyId)
      ) ||
      myUnits.find((u) => u.id === inspectingMoveOut.unit);

    // Resolve agreement: prefer agreementId, then unit strictly scoped to owner's property
    const targetAg = inspectingMoveOut.agreementId
      ? myAgreements.find((a) => a.id === inspectingMoveOut.agreementId)
      : myAgreements.find(
          (a) =>
            a.unit === inspectingMoveOut.unit &&
            (!inspectingMoveOut.propertyId || a.propertyId === inspectingMoveOut.propertyId) &&
            a.status !== 'terminated'
        ) ||
        myAgreements.find(
          (a) =>
            a.unit === inspectingMoveOut.unit &&
            (!inspectingMoveOut.propertyId || a.propertyId === inspectingMoveOut.propertyId)
        );

    // Resolve tenant: prefer tenantId (never name-match across owners)
    const targetTenant = inspectingMoveOut.tenantId
      ? myTenants.find((t) => t.id === inspectingMoveOut.tenantId)
      : undefined;

    const resolvedPropId = inspectingMoveOut.propertyId || targetUnit?.propertyId || targetAg?.propertyId || 'prop-1';
    const resolvedPropName =
      inspectingMoveOut.propertyName ||
      targetUnit?.propertyName ||
      (resolvedPropId ? state.properties.find((p) => p.id === resolvedPropId)?.name : '') ||
      targetAg?.propertyName ||
      'Residential Property';

    const settlementObj: DepositSettlement = {
      id: `DEP-SETTLE-${inspectingMoveOut.id}`,
      agreementId: targetAg?.id || (inspectingMoveOut.agreementId || `AG-${inspectingMoveOut.unit}`),
      propertyId: resolvedPropId,
      propertyName: resolvedPropName,
      unit: inspectingMoveOut.unit,
      tenantId: inspectingMoveOut.tenantId || targetTenant?.id || '',
      tenantName: inspectingMoveOut.tenant,
      tenantEmail: targetTenant?.email || '',
      ownerId,
      currency: inspectingMoveOut.currency || DEFAULT_CURRENCY,
      grossDepositHeld: inspectingMoveOut.deposit,
      deductions: allDeductions.map((d, idx) => ({
        id: `ded-${idx}-${Date.now()}`,
        category: 'repair_damage',
        title: d.reason || d.amenity || 'Move-out deduction',
        amount: d.amount,
      })),
      totalDeductions,
      netRefundableAmount: finalRefund,
      status: 'awaiting_tenant_approval',
      createdAt: new Date().toISOString(),
    };

    updateState((prev) => {
      const notif = inspectingMoveOut.tenantId
        ? {
          id: `notif_${Date.now()}`,
          userId: inspectingMoveOut.tenantId,
          title: 'Move-Out Inspection Completed — Settlement Ready',
          body: `Inspection for Unit ${inspectingMoveOut.unit} completed. Net refundable: ${settlementObj.currency}${finalRefund.toLocaleString('en-IN')}. Please review and submit your payout handle.`,
          link: '/tenant/dashboard',
          isRead: false,
          createdAt: new Date().toISOString(),
        }
        : null;

      return {
        ...prev,
        moveouts: prev.moveouts.map((m) => (m.id === inspectingMoveOut.id ? updatedMoveout : m)),
        depositSettlements: [
          ...(prev.depositSettlements || []).filter((s) => s.id !== settlementObj.id),
          settlementObj,
        ],
        notifications: notif ? [...(prev.notifications || []), notif] : prev.notifications,
      };
    });

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'moveouts', inspectingMoveOut.id), updatedMoveout, { merge: true });
        await setDoc(doc(db, 'depositSettlements', settlementObj.id), settlementObj, { merge: true });
      } catch (err) {
        console.warn('Firestore moveout and settlement sync warning:', err);
      }
    }

    setInspectingMoveOut(null);
    showToast(
      `✓ Inspection completed. Settlement of ${getCurrencySymbol(settlementObj.currency) || DEFAULT_CURRENCY_SYMBOL}${finalRefund.toLocaleString('en-IN')} sent to ${inspectingMoveOut.tenant} for review and payout selection.`
    );
    } finally {
      setIsProcessingInspection(false);
    }
  };

  const handleConfirmRefundAndReleaseUnit = async () => {
    if (!moveOutToComplete) return;
    setIsProcessingRefund(true);
    try {
    const targetMoveout = moveOutToComplete;
    const completedAt = new Date().toISOString();
    const finalAmount = targetMoveout.finalRefundAmount !== undefined ? targetMoveout.finalRefundAmount : targetMoveout.deposit;

    let finalTxRef = refundTxRef.trim();
    if (refundPayoutMethod === 'Cheque') {
      if (!refundChequeNo.trim()) {
        showToast('⚠️ Please enter the 6-digit Cheque Number.');
        return;
      }
      finalTxRef = `CHQ-${refundChequeNo.trim()}`;
    } else if (refundPayoutMethod === 'UPI') {
      if (!finalTxRef) {
        showToast('⚠️ Please enter the UPI Reference / 12-digit UTR Number.');
        return;
      }
    } else if (refundPayoutMethod === 'Bank Wire') {
      if (!finalTxRef) {
        showToast('⚠️ Please enter the Bank UTR / IMPS Reference Number.');
        return;
      }
    } else if (refundPayoutMethod === 'PayPal') {
      if (!finalTxRef) {
        showToast('⚠️ Please enter the PayPal Transaction ID.');
        return;
      }
    } else if (refundPayoutMethod === 'Cash') {
      finalTxRef = finalTxRef || `CASH-${refundCashDate || completedAt.split('T')[0]}`;
    }

    // Outflow Cash Protocol: If owner refunds deposit in cash, create claim awaiting tenant confirmation
    if (refundPayoutMethod === 'Cash') {
      const matchSettle =
        (state.depositSettlements || []).find(
          (s) => s.id === `DEP-SETTLE-${targetMoveout.id}` || (s.moveOutId && s.moveOutId === targetMoveout.id)
        ) ||
        (state.depositSettlements || []).find(
          (s) => s.unit === targetMoveout.unit && s.status !== 'refunded'
        );
      const claimId = await submitCashClaim({
        direction: 'outflow',
        type: 'deposit_refund',
        amount: finalAmount,
        currency: targetMoveout.currency || 'INR',
        ownerId,
        tenantId: targetMoveout.tenantId || '',
        tenantName: targetMoveout.tenant,
        unit: targetMoveout.unit,
        settlementId: matchSettle?.id || `DEP-SETTLE-${targetMoveout.id}`,
        moveOutId: targetMoveout.id,
        claimedBy: ownerId,
        claimedByRole: 'owner',
        claimedByName: user?.displayName || 'Property Owner',
        handoverDate: refundCashDate || completedAt.split('T')[0],
        handoverLocation: refundCashLocation || `Unit ${targetMoveout.unit} Move-Out Handover`,
        notes: `Physical cash handover${refundCashWitness ? ` (Witnessed by ${refundCashWitness})` : ''}${finalTxRef ? ` [Ref: ${finalTxRef}]` : ''}`,
      });

      if (!claimId) {
        return;
      }

      const updatedMoveout: MoveOut = {
        ...targetMoveout,
        status: 'refund_scheduled',
        finalRefundAmount: finalAmount,
      };
      await saveMoveout(updatedMoveout);
      setMoveOutToComplete(null);
      showToast(`✓ Cash refund claim #${claimId} recorded. Sent confirmation request to ${targetMoveout.tenant}.`);
      return;
    }

    const updatedMoveout: MoveOut = {
      ...targetMoveout,
      status: 'refund_completed',
      completedAt,
      finalRefundAmount: finalAmount,
    };

    const targetPropId = (targetMoveout as any).propertyId || targetMoveout.propertyId;
    // Resolve unit: scoped to owner's units only
    const targetUnit =
      myUnits.find((u) => u.id === targetMoveout.unit) ||
      myUnits.find(
        (u) =>
          u.unitNumber === targetMoveout.unit &&
          (!targetPropId || u.propertyId === targetPropId)
      ) ||
      (targetMoveout.tenantId
        ? myUnits.find((u) => u.currentTenantId === targetMoveout.tenantId)
        : undefined);
    const targetUnitId = targetUnit?.id;

    const cleanUnitStr = (s?: string) => (s || '').toLowerCase().replace(/unit\s*|-/g, '').trim();

    // Resolve ALL active and future renewal agreements for this specific vacated unit only
    const matchedAgreements = myAgreements.filter((a) => {
      if (a.status === 'terminated') return false;
      const isSameUnit =
        (targetUnitId && (a.unit === targetUnitId || cleanUnitStr(a.unit) === cleanUnitStr(targetUnit?.unitNumber))) ||
        a.unit === targetMoveout.unit ||
        cleanUnitStr(a.unit) === cleanUnitStr(targetMoveout.unit);
      if (!isSameUnit) return false;
      if (targetPropId && a.propertyId && a.propertyId !== targetPropId) return false;
      if (targetMoveout.tenantId && a.tenantId && a.tenantId !== targetMoveout.tenantId) return false;
      return true;
    });
    const matchedAgIds = new Set(matchedAgreements.map((a) => a.id));
    const targetAgId = matchedAgreements[0]?.id;

    // Resolve tenant: only by ID within this owner's tenant list
    const targetTenant = targetMoveout.tenantId
      ? myTenants.find((t) => t.id === targetMoveout.tenantId)
      : undefined;
    const targetTenantId = targetTenant?.id;

    updateState((prev) => {
      // 1. Mark moveout refund_completed
      const updatedMoveouts = prev.moveouts.map((m) =>
        m.id === targetMoveout.id ? updatedMoveout : m
      );

      // 2. Release unit to vacant — match by ID, clean unit number, or currentTenantId
      const updatedUnits = prev.units.map((u) => {
        const matchesUnit =
          (targetUnitId && u.id === targetUnitId) ||
          cleanUnitStr(u.unitNumber) === cleanUnitStr(targetMoveout.unit) ||
          u.id === targetMoveout.unit ||
          (targetMoveout.tenantId && u.currentTenantId === targetMoveout.tenantId);
        if (matchesUnit) {
          return {
            ...u,
            status: 'vacant' as const,
            tenant: null,
            currentTenantId: null,
          };
        }
        return u;
      });

      // 3. Recalculate property occupied count
      const updatedProperties = prev.properties.map((p) => {
        const occupied = updatedUnits.filter((u) => u.propertyId === p.id && u.status === 'occupied').length;
        return { ...p, occupied };
      });

      // 4. Terminate all active lease agreements for this specific vacated unit only
      const updatedAgreements = prev.agreements.map((a) => {
        if (matchedAgIds.has(a.id) && a.status !== 'terminated') {
          return { ...a, status: 'terminated' as const };
        }
        return a;
      });

      // 5. Update tenant record: clear active unit or shift to remaining rented unit
      // Only match by tenantId — never by name or unit number alone (prevents cross-owner collision)
      const updatedTenants = prev.tenants.map((t) => {
        if (targetMoveout.tenantId && t.id === targetMoveout.tenantId) {
          const pastItem = {
            unit: targetMoveout.unit,
            owner: targetMoveout.ownerName || targetMoveout.owner || user?.displayName || 'Property Owner',
            property: targetUnit?.propertyId || 'Residential Property',
            period: `${t.leaseStart || 'Past'} - ${completedAt.split('T')[0]}`,
            leaseStart: t.leaseStart || '',
            leaseEnd: completedAt.split('T')[0],
            rent: t.rent || 0,
            paymentScore: 100,
            flags: [],
            disputes: 0,
          };
          const remainingUnits = (t.unitsRented || []).filter((u) => u !== targetMoveout.unit && u !== targetUnitId);
          const nextUnit = remainingUnits[0] || 'Unassigned';
          return {
            ...t,
            unit: nextUnit,
            owner: nextUnit === 'Unassigned' ? 'Unassigned' : t.owner,
            ownerId: nextUnit === 'Unassigned' ? '' : t.ownerId,
            leaseStart: nextUnit === 'Unassigned' ? '' : t.leaseStart,
            leaseEnd: nextUnit === 'Unassigned' ? '' : t.leaseEnd,
            unitsRented: remainingUnits,
            history: [pastItem, ...(t.history || [])],
          };
        }
        return t;
      });

      const methodLabel =
        refundPayoutMethod === 'Cash'
          ? `Cash Handover (${refundCashLocation || 'On-Site'}${refundCashWitness ? ` • Witness: ${refundCashWitness}` : ''})`
          : refundPayoutMethod === 'Cheque'
          ? `Cheque #${refundChequeNo || finalTxRef} (${refundBankName || 'Bank Cheque'})`
          : refundPayoutMethod === 'UPI'
          ? `UPI (${refundUpiApp || 'UPI'} • UTR: ${finalTxRef})`
          : refundPayoutMethod === 'Bank Wire'
          ? `Bank Wire (${refundBankName || 'NEFT/IMPS'} • UTR: ${finalTxRef})`
          : `${refundPayoutMethod} (Ref: ${finalTxRef})`;

      // 6. Create refund payment transaction record
      const refundTx: PaymentTransaction = {
        id: `TXN-REFUND-${Date.now().toString().slice(-6)}`,
        ownerId,
        tenant: targetMoveout.tenant,
        tenantId: targetMoveout.tenantId || '',
        unit: targetMoveout.unit,
        amount: finalAmount,
        date: completedAt.split('T')[0],
        dueDate: targetMoveout.refundDate || completedAt.split('T')[0],
        status: 'paid',
        method: methodLabel,
        type: 'deposit',
        notes: `Final security deposit refund settlement for Unit ${targetMoveout.unit}. Deductions applied: ${getCurrencySymbol(targetMoveout.currency) || DEFAULT_CURRENCY_SYMBOL}${(targetMoveout.deductions || []).reduce((s, d) => s + d.amount, 0).toLocaleString('en-IN')}.${refundProofUrl ? ' Proof receipt attached.' : ''}`,
      };

      // 7. Record tenant review
      const newReview = {
        id: `rev-${Date.now()}`,
        tenant: targetMoveout.tenant,
        by: user?.displayName || 'Property Owner',
        rating: tenantRating,
        text: tenantReview.trim() || 'Tenancy concluded smoothly. Move-out inspection and deposit refund completed.',
        createdAt: completedAt.split('T')[0],
      };

      // 8. Construct Deposit Settlement entity
      const existingSettle = (state.depositSettlements || []).find(
        (s) =>
          s.id === `DEP-SETTLE-${targetMoveout.id}` ||
          (targetMoveout.agreementId && s.agreementId === targetMoveout.agreementId)
      );
      const settlementId = existingSettle?.id || `DEP-SETTLE-${targetMoveout.id}`;
      const settlementObj: DepositSettlement = {
        ...(existingSettle || {}),
        id: settlementId,
        agreementId: targetAgId || existingSettle?.agreementId || `AG-${targetMoveout.unit}`,
        propertyId: targetUnit?.propertyId || existingSettle?.propertyId || 'prop-1',
        propertyName: targetUnit?.propertyName || existingSettle?.propertyName || 'Residential Property',
        unit: targetMoveout.unit,
        tenantId: targetMoveout.tenantId || targetTenantId || existingSettle?.tenantId || '',
        tenantName: targetMoveout.tenant || existingSettle?.tenantName || 'Resident',
        tenantEmail: targetTenant?.email || existingSettle?.tenantEmail || '',
        ownerId,
        currency: targetMoveout.currency || existingSettle?.currency || DEFAULT_CURRENCY,
        grossDepositHeld: targetMoveout.deposit || existingSettle?.grossDepositHeld || targetUnit?.deposit || 0,
        deductions: (targetMoveout.deductions || existingSettle?.deductions || []).map((d: any, idx: number) => ({
          id: d.id || `ded-${idx}`,
          category: d.category || 'repair_damage',
          title: d.reason || d.amenity || d.title || 'Move-out deduction',
          amount: d.amount,
        })),
        totalDeductions: (targetMoveout.deductions || existingSettle?.deductions || []).reduce((s: number, d: any) => s + d.amount, 0),
        netRefundableAmount: finalAmount,
        status: 'refunded',
        chosenPayoutDetails: existingSettle?.chosenPayoutDetails,
        disbursementMethod: refundPayoutMethod === 'Cash' ? 'cash_handover' : refundPayoutMethod.toLowerCase().includes('gateway') ? 'gateway_automated' : 'bank_manual_transfer',
        paymentReference: finalTxRef || `UTR-${Math.floor(100000 + Math.random() * 900000)}`,
        proofDocumentUrl: refundProofUrl || undefined,
        disbursedAt: completedAt,
        createdAt: existingSettle?.createdAt || completedAt,
      };

      // 9. Notify tenant
      const notif = targetMoveout.tenantId
        ? {
          id: `notif_${Date.now()}`,
          userId: targetMoveout.tenantId,
          title: 'Security Deposit Refund Settled',
          body: `Your deposit refund of ${getCurrencySymbol(targetMoveout.currency) || DEFAULT_CURRENCY_SYMBOL}${finalAmount.toLocaleString('en-IN')} has been disbursed via ${refundPayoutMethod}. Tenancy concluded.`,
          link: '/tenant/payments?tab=deposit',
          isRead: false,
          createdAt: completedAt,
        }
        : null;

      // Void any pending/overdue rent/deposit invoices for this tenant & unit upon moveout refund
      const updatedInvoices = (prev.invoices || []).map((inv) => {
        const isForThisUnit =
          inv.unit === targetMoveout.unit ||
          cleanUnitStr(inv.unit) === cleanUnitStr(targetMoveout.unit) ||
          inv.unit === targetUnitId ||
          (targetMoveout.agreementId && inv.leaseAgreementId === targetMoveout.agreementId);
        const isForThisTenant =
          (targetMoveout.tenantId && inv.tenantId === targetMoveout.tenantId) ||
          (targetMoveout.tenantEmail && inv.tenantEmail?.toLowerCase() === targetMoveout.tenantEmail.toLowerCase()) ||
          (targetMoveout.tenant && inv.tenant?.toLowerCase() === targetMoveout.tenant.toLowerCase());
        if (isForThisUnit && isForThisTenant && inv.status !== 'paid') {
          return {
            ...inv,
            status: 'void' as const,
            notes: 'Voided automatically upon move-out deposit refund disbursement and tenancy conclusion.',
          };
        }
        return inv;
      });

      return {
        ...prev,
        moveouts: updatedMoveouts,
        units: updatedUnits,
        properties: updatedProperties,
        agreements: updatedAgreements,
        tenants: updatedTenants,
        invoices: updatedInvoices,
        renewals: (prev.renewals || []).filter((r) => r.unit !== targetMoveout.unit),
        depositSettlements: [
          ...(prev.depositSettlements || []).filter((s) =>
            s.id !== settlementId &&
            s.id !== `DEP-SETTLE-${targetMoveout.id}` &&
            !(existingSettle && s.id === existingSettle.id) &&
            !(targetMoveout.agreementId && s.agreementId === targetMoveout.agreementId)
          ),
          settlementObj,
        ],
        payments: [refundTx, ...prev.payments],
        reviews: {
          ...prev.reviews,
          tenants: [newReview, ...prev.reviews.tenants],
        },
        notifications: notif ? [...(prev.notifications || []), notif] : prev.notifications,
      };
    });

    if (isFirebaseConfigured) {
      try {
        deleteDoc(doc(db, 'renewals', targetMoveout.unit)).catch(console.warn);
        const existingSettle = (state.depositSettlements || []).find(
          (s) =>
            s.id === `DEP-SETTLE-${targetMoveout.id}` ||
            (targetMoveout.agreementId && s.agreementId === targetMoveout.agreementId)
        );
        const settlementId = existingSettle?.id || `DEP-SETTLE-${targetMoveout.id}`;
        const settlementObj: DepositSettlement = {
          ...(existingSettle || {}),
          id: settlementId,
          agreementId: targetAgId || existingSettle?.agreementId || `AG-${targetMoveout.unit}`,
          propertyId: targetUnit?.propertyId || existingSettle?.propertyId || 'prop-1',
          propertyName: targetUnit?.propertyName || existingSettle?.propertyName || 'Residential Property',
          unit: targetMoveout.unit,
          tenantId: targetMoveout.tenantId || targetTenantId || existingSettle?.tenantId || '',
          tenantName: targetMoveout.tenant || existingSettle?.tenantName || 'Resident',
          tenantEmail: targetTenant?.email || existingSettle?.tenantEmail || '',
          ownerId,
          currency: targetMoveout.currency || existingSettle?.currency || DEFAULT_CURRENCY,
          grossDepositHeld: targetMoveout.deposit || existingSettle?.grossDepositHeld || targetUnit?.deposit || 0,
          deductions: (targetMoveout.deductions || existingSettle?.deductions || []).map((d: any, idx: number) => ({
            id: d.id || `ded-${idx}`,
            category: d.category || 'repair_damage',
            title: d.reason || d.amenity || d.title || 'Move-out deduction',
            amount: d.amount,
          })),
          totalDeductions: (targetMoveout.deductions || existingSettle?.deductions || []).reduce((s: number, d: any) => s + d.amount, 0),
          netRefundableAmount: finalAmount,
          status: 'refunded',
          chosenPayoutDetails: existingSettle?.chosenPayoutDetails,
          disbursementMethod: refundPayoutMethod === 'Cash' ? 'cash_handover' : refundPayoutMethod.toLowerCase().includes('gateway') ? 'gateway_automated' : 'bank_manual_transfer',
          paymentReference: refundTxRef || `UTR-${Math.floor(100000 + Math.random() * 900000)}`,
          proofDocumentUrl: refundProofUrl || undefined,
          disbursedAt: completedAt,
          createdAt: existingSettle?.createdAt || completedAt,
        };
        await setDoc(doc(db, 'depositSettlements', settlementObj.id), settlementObj, { merge: true });
        if (existingSettle && existingSettle.id !== settlementObj.id) {
          await setDoc(doc(db, 'depositSettlements', existingSettle.id), { ...settlementObj, id: existingSettle.id }, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore depositSettlement sync error:', err);
      }
    }

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'moveouts', targetMoveout.id), updatedMoveout, { merge: true });
        if (targetUnitId) {
          await setDoc(doc(db, 'units', targetUnitId), { status: 'vacant', tenant: null, currentTenantId: null }, { merge: true });
          if (targetUnit?.propertyId) {
            const propUnits = state.units
              .map((u) => (u.id === targetUnitId ? { ...u, status: 'vacant' as const } : u))
              .filter((u) => u.propertyId === targetUnit.propertyId);
            const occ = propUnits.filter((u) => u.status === 'occupied').length;
            const total = propUnits.length || 1;
            await setDoc(
              doc(db, 'properties', targetUnit.propertyId),
              {
                occupied: occ,
                unitCount: total,
              },
              { merge: true }
            );
          }
        }
        for (const ag of matchedAgreements) {
          await setDoc(doc(db, 'agreements', ag.id), { status: 'terminated' }, { merge: true });
        }
        if (targetTenantId) {
          const remainingUnits = (targetTenant?.unitsRented || []).filter((u) => u !== targetMoveout.unit && u !== targetUnitId);
          const nextUnit = remainingUnits[0] || 'Unassigned';
          await setDoc(doc(db, 'tenants', targetTenantId), {
            unit: nextUnit,
            owner: nextUnit === 'Unassigned' ? 'Unassigned' : (targetTenant?.owner || 'Unassigned'),
            ownerId: nextUnit === 'Unassigned' ? '' : (targetTenant?.ownerId || ''),
            leaseStart: nextUnit === 'Unassigned' ? '' : (targetTenant?.leaseStart || ''),
            leaseEnd: nextUnit === 'Unassigned' ? '' : (targetTenant?.leaseEnd || ''),
            unitsRented: remainingUnits,
          }, { merge: true });
        }
      } catch (err) {
        console.warn('Firestore vacate settlement warning:', err);
      }
    }

    showToast(
      `✓ Deposit refund of ${getCurrencySymbol(targetMoveout.currency) || DEFAULT_CURRENCY_SYMBOL}${finalAmount.toLocaleString('en-IN')} recorded. Unit ${targetMoveout.unit} is now VACANT & ready for new leasing.`
    );
    setMoveOutToComplete(null);
    } finally {
      setIsProcessingRefund(false);
    }
  };

  const handleInitiateOwnerMoveout = async () => {
    if (!initiateUnitId) {
      showToast('Please select an occupied unit.');
      return;
    }
    setIsProcessingNotice(true);
    try {
    // Resolve unit: scoped to owner's units only (prevents picking another owner's same-numbered unit)
    const unitObj = myUnits.find((u) => u.id === initiateUnitId) ||
      myUnits.find((u) => u.unitNumber === initiateUnitId);
    if (!unitObj) return;

    const moveOutId = `MO-${Math.floor(1000 + Math.random() * 9000)}`;
    const agMatch =
      state.agreements.find(
        (a) =>
          (!unitObj.propertyId || a.propertyId === unitObj.propertyId) &&
          (unitObj.currentTenantId ? a.tenantId === unitObj.currentTenantId : true) &&
          (a.unit === unitObj.unitNumber || a.unit === unitObj.id) &&
          (a.status === 'active' || a.status === 'signed' || a.status === 'pending_deposit')
      ) ||
      state.agreements.find(
        (a) =>
          (a.unit === unitObj.unitNumber || a.unit === unitObj.id) &&
          (!unitObj.propertyId || a.propertyId === unitObj.propertyId) &&
          a.status !== 'terminated'
      );
    const depositAmount = agMatch?.deposit || unitObj.deposit || 0;
    const initialChecklist = DEFAULT_INSPECTION_ITEMS.map((item, idx) => ({
      ...item,
      id: `chk-${idx}-${Date.now()}`,
    }));

    const newMoveOut: MoveOut = {
      id: moveOutId,
      ownerId,
      ownerName: user?.displayName || 'Property Owner',
      owner: user?.displayName || 'Property Owner',
      unit: unitObj.unitNumber,
      propertyId: unitObj.propertyId,
      agreementId: agMatch?.id,
      tenant: unitObj.tenant || 'Resident',
      tenantId: unitObj.currentTenantId || undefined,
      status: 'requested',
      moveOutDate: initiateDate,
      inspectionDate: null,
      refundDate: null,
      deposit: depositAmount,
      currency: unitObj.currency || DEFAULT_CURRENCY,
      inspectionChecklist: initialChecklist,
      deductions: [],
      amenityPhotos: [],
      createdAt: new Date().toISOString(),
    };

    updateState((prev) => {
      const notif = unitObj.currentTenantId
        ? {
          id: `notif_${Date.now()}`,
          userId: unitObj.currentTenantId,
          title: 'Move-Out Notice Initiated',
          body: `Your landlord has scheduled move-out for Unit ${unitObj.unitNumber} effective ${initiateDate}. Inspection will be scheduled soon.`,
          link: '/tenant/lease',
          isRead: false,
          createdAt: new Date().toISOString(),
        }
        : null;

      return {
        ...prev,
        moveouts: [newMoveOut, ...prev.moveouts],
        notifications: notif ? [...(prev.notifications || []), notif] : prev.notifications,
      };
    });

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'moveouts', moveOutId), newMoveOut, { merge: true });
      } catch (err) {
        console.warn('Firestore initiate moveout warning:', err);
      }
    }

    setIsInitiateNoticeOpen(false);
    showToast(`✓ Move-out notice ${moveOutId} registered for Unit ${unitObj.unitNumber}.`);
    } finally {
      setIsProcessingNotice(false);
    }
  };

  return (
    <div>
      <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3>Move-Outs</h3>
        </div>
        <div>
          <button
            type="button"
            className="btn brass btn-mobile-full"
            onClick={() => {
              if (occupiedUnits.length > 0) {
                setInitiateUnitId(occupiedUnits[0].id);
              }
              setIsInitiateNoticeOpen(true);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={15} /> Initiate Move-Out Notice
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body">
          {/* Desktop Table View */}
          <div className="desktop-table-view">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Unit</th>
                    <th>Tenant</th>
                    <th>Move-Out Date</th>
                    <th>Inspection Date</th>
                    <th>Refund Date</th>
                    <th>Deposit Held</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myMoveouts.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px 16px' }}>
                        No active vacate notices on file. Click "+ Initiate Move-Out Notice" or await tenant notice.
                      </td>
                    </tr>
                  ) : (
                    myMoveouts.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <b>{m.id}</b>
                        </td>
                        <td><b>{m.unit}</b></td>
                        <td>{m.tenant}</td>
                        <td>{m.moveOutDate}</td>
                        <td>{m.inspectionDate || 'Awaiting schedule'}</td>
                        <td>{m.refundDate || 'Awaiting inspection'}</td>
                        <td>
                          {getCurrencySymbol(m.currency)}
                          {(m.deposit ?? 0).toLocaleString()}
                        </td>
                        <td>
                          {(() => {
                            const settleMatch = (state.depositSettlements || []).find(
                              (s) =>
                                s.id === `DEP-SETTLE-${m.id}` ||
                                s.id.replace(/^DEP-SETTLE-/i, '') === m.id ||
                                (s.moveOutId && s.moveOutId === m.id) ||
                                ((m as any).agreementId && s.agreementId === (m as any).agreementId)
                            );
                            const isSettled =
                              m.status === 'refund_completed' ||
                              (m as any).status === 'settled' ||
                              settleMatch?.status === 'refunded' ||
                              Boolean(m.tenantConfirmedReceipt) ||
                              Boolean(settleMatch?.tenantConfirmedReceipt);
                            if (isSettled) {
                              return <span className="badge green">✓ SETTLED</span>;
                            }
                            if (m.status === 'refund_scheduled') {
                              const pendingCashClaim = (state.cashClaims || []).find(
                                (c) =>
                                  (c.status === 'pending_confirmation' || (c as any).status === 'pending') &&
                                  c.direction === 'outflow' &&
                                  (c.moveOutId === m.id || (settleMatch && c.settlementId === settleMatch.id) || (m.unit && c.unit === m.unit))
                              );
                              if (settleMatch?.status === 'awaiting_tenant_cash_confirmation' || pendingCashClaim) {
                                return (
                                  <span className="badge amber" style={{ background: '#FEF3C7', color: '#B45309' }}>
                                    ⏳ AWAITING TENANT CASH CONFIRMATION
                                  </span>
                                );
                              }
                              if (settleMatch?.status === 'awaiting_tenant_approval') {
                                return <span className="badge amber">AWAITING TENANT ACCEPTANCE</span>;
                              }
                              if (settleMatch?.status === 'rejected' || settleMatch?.status === 'contested') {
                                return <span className="badge red" style={{ background: '#FEE2E2', color: '#B91C1C' }}>❌ DEDUCTIONS REJECTED BY TENANT</span>;
                              }
                              if (settleMatch?.status === 'approved') {
                                return <span className="badge brass">TENANT ACCEPTED — READY TO PAY</span>;
                              }
                              return <span className="badge brass">REFUND SCHEDULED</span>;
                            }
                            return (
                              <span className="badge amber">
                                {m.status.replace(/_/g, ' ').toUpperCase()}
                              </span>
                            );
                          })()}
                        </td>
                        <td>
                          {(() => {
                            const settleMatch = (state.depositSettlements || []).find(
                              (s) =>
                                s.id === `DEP-SETTLE-${m.id}` ||
                                s.id.replace(/^DEP-SETTLE-/i, '') === m.id ||
                                (s.moveOutId && s.moveOutId === m.id) ||
                                ((m as any).agreementId && s.agreementId === (m as any).agreementId)
                            );
                            const isSettled =
                              m.status === 'refund_completed' ||
                              (m as any).status === 'settled' ||
                              settleMatch?.status === 'refunded' ||
                              Boolean(m.tenantConfirmedReceipt) ||
                              Boolean(settleMatch?.tenantConfirmedReceipt);

                            if (m.status === 'requested' || (m as any).status === 'notice_filed') {
                              return (
                                <button
                                  type="button"
                                  className="btn brass small"
                                  onClick={() => openScheduleModal(m)}
                                >
                                  Schedule Inspection
                                </button>
                              );
                            }

                            if (m.status === 'inspection_scheduled') {
                              return (
                                <button
                                  type="button"
                                  className="btn brass small"
                                  onClick={() => openInspectionModal(m)}
                                >
                                  Conduct Inspection
                                </button>
                              );
                            }

                            if (m.status === 'refund_scheduled' && !isSettled) {
                              const pendingCashClaim = (state.cashClaims || []).find(
                                (c) =>
                                  (c.status === 'pending_confirmation' || (c as any).status === 'pending') &&
                                  c.direction === 'outflow' &&
                                  (c.moveOutId === m.id || (settleMatch && c.settlementId === settleMatch.id) || (m.unit && c.unit === m.unit))
                              );
                              if (settleMatch?.status === 'awaiting_tenant_cash_confirmation' || pendingCashClaim) {
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <span className="badge amber" style={{ fontSize: '11px', width: 'fit-content', background: '#FEF3C7', color: '#B45309' }}>
                                      ⏳ Cash Handed Over
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                      Awaiting tenant confirmation
                                    </span>
                                  </div>
                                );
                              }
                              if (settleMatch?.status === 'awaiting_tenant_approval') {
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <span className="badge amber" style={{ fontSize: '11px', width: 'fit-content' }}>
                                      ⏳ Awaiting Tenant
                                    </span>
                                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                      Reviewing deductions
                                    </span>
                                  </div>
                                );
                              }
                              if (settleMatch?.status === 'rejected' || settleMatch?.status === 'contested') {
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <button
                                      type="button"
                                      className="btn brass small"
                                      style={{ fontWeight: 600 }}
                                      onClick={() => openRecalculateModal(m, settleMatch)}
                                    >
                                      Recalculate &amp; Re-send Settlement
                                    </button>
                                    {(settleMatch.rejectionReason || settleMatch.notes) && (
                                      <span
                                        style={{ fontSize: '11px', color: 'var(--danger)', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        title={settleMatch.rejectionReason || settleMatch.notes}
                                      >
                                        Reason: "{settleMatch.rejectionReason || settleMatch.notes}"
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                              return (
                                <button
                                  type="button"
                                  className="btn brass small"
                                  onClick={() => openCompleteModal(m, settleMatch)}
                                >
                                  Disburse Refund & Upload Proof
                                </button>
                              );
                            }

                            // Concluded / Settled
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: 'var(--ledger)', fontSize: '12px', fontWeight: 600 }}>✓ Settled</span>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  title="Download Security Deposit Settlement Certificate (PDF)"
                                  onClick={() => {
                                    const voucherObj = settleMatch || {
                                      id: `DEP-SETTLE-${m.id}`,
                                      agreementId: m.agreementId || (m as any).leaseAgreementId || m.id,
                                      propertyId: m.propertyId || '',
                                      propertyName: m.propertyName || 'Property',
                                      unit: m.unit,
                                      tenantId: m.tenantId || '',
                                      tenantName: m.tenant,
                                      tenantEmail: '',
                                      ownerId,
                                      currency: m.currency || DEFAULT_CURRENCY,
                                      originalDeposit: m.deposit,
                                      totalDeductions: m.deductions ? m.deductions.reduce((s, d) => s + d.amount, 0) : 0,
                                      deductions: m.deductions || [],
                                      netRefundAmount: m.finalRefundAmount !== undefined ? m.finalRefundAmount : m.deposit,
                                      status: 'refunded',
                                      inspectionDate: m.inspectionDate || '',
                                      settlementDate: m.refundDate || new Date().toISOString().split('T')[0],
                                      paymentReference: 'SETTLED-DIRECT',
                                    };
                                    downloadDepositSettlementPdf(voucherObj as DepositSettlement, user?.displayName || 'Property Owner');
                                  }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <Download size={12} /> Voucher
                                </button>
                              </div>
                            );
                          })()}
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
            {myMoveouts.length === 0 ? (
              <div className="staff-card" style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 16px' }}>
                No active vacate notices on file. Click "+ Initiate Move-Out Notice" or await tenant notice.
              </div>
            ) : (
              myMoveouts.map((m) => {
                const settleMatch = (state.depositSettlements || []).find(
                  (s) =>
                    s.id === `DEP-SETTLE-${m.id}` ||
                    s.id.replace(/^DEP-SETTLE-/i, '') === m.id ||
                    (s.moveOutId && s.moveOutId === m.id) ||
                    ((m as any).agreementId && s.agreementId === (m as any).agreementId)
                );
                const isSettled =
                  m.status === 'refund_completed' ||
                  (m as any).status === 'settled' ||
                  settleMatch?.status === 'refunded' ||
                  Boolean(m.tenantConfirmedReceipt) ||
                  Boolean(settleMatch?.tenantConfirmedReceipt);

                return (
                  <div key={m.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <b style={{ fontSize: '14px' }}>Unit {m.unit}</b>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{m.tenant} • {m.id}</div>
                      </div>
                      <div>
                        {isSettled ? (
                          <span className="badge green">✓ SETTLED</span>
                        ) : m.status === 'refund_scheduled' ? (
                          settleMatch?.status === 'awaiting_tenant_cash_confirmation' ? (
                            <span className="badge amber" style={{ background: '#FEF3C7', color: '#B45309' }}>⏳ AWAITING CASH CONFIRMATION</span>
                          ) : settleMatch?.status === 'awaiting_tenant_approval' ? (
                            <span className="badge amber">AWAITING TENANT</span>
                          ) : settleMatch?.status === 'rejected' || settleMatch?.status === 'contested' ? (
                            <span className="badge red" style={{ background: '#FEE2E2', color: '#B91C1C' }}>❌ REJECTED</span>
                          ) : settleMatch?.status === 'approved' ? (
                            <span className="badge brass">TENANT ACCEPTED</span>
                          ) : (
                            <span className="badge brass">REFUND SCHEDULED</span>
                          )
                        ) : (
                          <span className="badge amber">{m.status.replace(/_/g, ' ').toUpperCase()}</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                      <div>
                        <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Move-Out Date</div>
                        <b>{m.moveOutDate}</b>
                      </div>
                      <div>
                        <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Deposit Held</div>
                        <b style={{ color: 'var(--ledger)' }}>{getCurrencySymbol(m.currency)}{(m.deposit ?? 0).toLocaleString()}</b>
                      </div>
                      <div>
                        <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Inspection</div>
                        <span>{m.inspectionDate || 'Awaiting schedule'}</span>
                      </div>
                      <div>
                        <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Refund Target</div>
                        <span>{m.refundDate || 'Awaiting inspection'}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(m.status === 'requested' || (m as any).status === 'notice_filed') && (
                        <button
                          type="button"
                          className="btn brass small btn-mobile-full"
                          onClick={() => openScheduleModal(m)}
                        >
                          Schedule Inspection
                        </button>
                      )}
                      {m.status === 'inspection_scheduled' && (
                        <button
                          type="button"
                          className="btn brass small btn-mobile-full"
                          onClick={() => openInspectionModal(m)}
                        >
                          Conduct Inspection
                        </button>
                      )}
                      {m.status === 'refund_scheduled' && !isSettled && (
                        settleMatch?.status === 'awaiting_tenant_cash_confirmation' ? (
                          <div style={{ padding: '6px 8px', background: '#FEF3C7', borderRadius: '6px', fontSize: '12px', color: '#B45309', textAlign: 'center' }}>
                            ⏳ Cash Handed Over — Awaiting Tenant Confirmation
                          </div>
                        ) : settleMatch?.status === 'rejected' || settleMatch?.status === 'contested' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn brass small btn-mobile-full"
                              style={{ fontWeight: 600 }}
                              onClick={() => openRecalculateModal(m, settleMatch)}
                            >
                              Recalculate &amp; Re-send Settlement
                            </button>
                            {(settleMatch.rejectionReason || settleMatch.notes) && (
                              <div style={{ padding: '6px 8px', background: '#FEE2E2', borderRadius: '6px', fontSize: '11px', color: '#B91C1C' }}>
                                Reason: "{settleMatch.rejectionReason || settleMatch.notes}"
                              </div>
                            )}
                          </div>
                        ) : settleMatch?.status === 'awaiting_tenant_approval' ? (
                          <div style={{ padding: '6px 8px', background: '#FEF3C7', borderRadius: '6px', fontSize: '12px', color: '#B45309', textAlign: 'center' }}>
                            ⏳ Awaiting Tenant Review
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn brass small btn-mobile-full"
                            onClick={() => openCompleteModal(m, settleMatch)}
                          >
                            Disburse Refund &amp; Upload Proof
                          </button>
                        )
                      )}
                      {isSettled && (
                        <button
                          type="button"
                          className="btn secondary small btn-mobile-full"
                          onClick={() => {
                            const voucherObj = settleMatch || {
                              id: `DEP-SETTLE-${m.id}`,
                              agreementId: m.agreementId || (m as any).leaseAgreementId || m.id,
                              propertyId: m.propertyId || '',
                              propertyName: m.propertyName || 'Property',
                              unit: m.unit,
                              tenantId: m.tenantId || '',
                              tenantName: m.tenant,
                              tenantEmail: '',
                              ownerId,
                              currency: m.currency || DEFAULT_CURRENCY,
                              originalDeposit: m.deposit,
                              totalDeductions: m.deductions ? m.deductions.reduce((s, d) => s + d.amount, 0) : 0,
                              deductions: m.deductions || [],
                              netRefundAmount: m.finalRefundAmount !== undefined ? m.finalRefundAmount : m.deposit,
                              status: 'refunded',
                              inspectionDate: m.inspectionDate || '',
                              settlementDate: m.refundDate || new Date().toISOString().split('T')[0],
                              paymentReference: 'SETTLED-DIRECT',
                            };
                            downloadDepositSettlementPdf(voucherObj as DepositSettlement, user?.displayName || 'Property Owner');
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        >
                          <Download size={13} /> Download Voucher (PDF)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* MODAL: SCHEDULE MOVE-OUT INSPECTION */}
      {schedulingMoveOut && (
        <div className="modal-backdrop" onClick={() => setSchedulingMoveOut(null)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Schedule Inspection — Unit {schedulingMoveOut.unit}</h3>
              <button type="button" className="modal-close" onClick={() => setSchedulingMoveOut(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="hint" style={{ marginBottom: '16px' }}>
                Set the physical walkthrough inspection date for resident <b>{schedulingMoveOut.tenant}</b>.
              </p>
              <div className="field">
                <label>Walkthrough Inspection Date</label>
                <input
                  type="date"
                  value={scheduleInspectDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setScheduleInspectDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Target Deposit Settlement Date</label>
                <input
                  type="date"
                  value={scheduleExpectedRefundDate}
                  min={scheduleInspectDate || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setScheduleExpectedRefundDate(e.target.value)}
                />
              </div>
              <div className="note-box" style={{ marginTop: '12px' }}>
                Both the scheduled inspection date and tentative deposit refund date will be updated in the resident's portal immediately.
              </div>
            </div>
            <div className="modal-foot" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setSchedulingMoveOut(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isProcessingSchedule ? 'btn-processing' : ''}`}
                onClick={handleConfirmScheduleInspection}
                disabled={isProcessingSchedule}
              >
                <ButtonProcessing
                  loading={isProcessingSchedule}
                  loadingText="Scheduling & Notifying..."
                  defaultText="Confirm Schedule & Notify Resident"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: OWNER INITIATE MOVE-OUT NOTICE */}
      {isInitiateNoticeOpen && (
        <div className="modal-backdrop" onClick={() => setIsInitiateNoticeOpen(false)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Initiate Move-Out Notice</h3>
              <button type="button" className="modal-close" onClick={() => setIsInitiateNoticeOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              {occupiedUnits.length === 0 ? (
                <p style={{ color: 'var(--ink-soft)' }}>No occupied units currently available to vacate.</p>
              ) : (
                <>
                  <div className="field">
                    <label>Select Occupied Residence / Unit</label>
                    <select value={initiateUnitId} onChange={(e) => setInitiateUnitId(e.target.value)}>
                      {occupiedUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          Unit {u.unitNumber} — {u.tenant || 'Resident'} (Deposit: {getCurrencySymbol(u.currency) || DEFAULT_CURRENCY_SYMBOL}{(u.deposit || 0).toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Target Move-Out Date</label>
                    <input
                      type="date"
                      value={initiateDate}
                      onChange={(e) => setInitiateDate(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label>Reason / Notes</label>
                    <textarea
                      rows={2}
                      value={initiateReason}
                      onChange={(e) => setInitiateReason(e.target.value)}
                      placeholder="e.g. End of 12-month lease tenure"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="modal-foot" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setIsInitiateNoticeOpen(false)}>Cancel</button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isProcessingNotice ? 'btn-processing' : ''}`}
                disabled={occupiedUnits.length === 0 || isProcessingNotice}
                onClick={handleInitiateOwnerMoveout}
              >
                <ButtonProcessing
                  loading={isProcessingNotice}
                  loadingText="Registering Notice..."
                  defaultText="Register Move-Out Notice"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: 6-POINT AMENITY INSPECTION & DAMAGE DEDUCTIONS CALCULATOR */}
      {inspectingMoveOut && (
        <div className="modal-backdrop" onClick={() => setInspectingMoveOut(null)}>
          <div className="modal" style={{ maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3>Move-Out Amenity Inspection: Unit {inspectingMoveOut.unit}</h3>
                <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                  Tenant: <b>{inspectingMoveOut.tenant}</b> • Deposit Held: <b>{getCurrencySymbol(inspectingMoveOut.currency)}{(inspectingMoveOut.deposit ?? 0).toLocaleString()}</b>
                </span>
              </div>
              <button type="button" className="modal-close" onClick={() => setInspectingMoveOut(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Schedule row */}
              <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Inspection Completed Date</label>
                  <input
                    type="date"
                    value={inspectionDateInput}
                    onChange={(e) => setInspectionDateInput(e.target.value)}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Disbursement / Refund Date</label>
                  <input
                    type="date"
                    value={refundDateInput}
                    onChange={(e) => setRefundDateInput(e.target.value)}
                  />
                </div>
              </div>

              {/* Dynamic Amenity Inspection Checklist */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} color="var(--brass)" />
                    Amenity Inspection & Photo Proof ({inspectionChecklist.length} Items)
                  </div>
                  <button
                    type="button"
                    className="btn secondary small"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '4px 10px', height: '30px' }}
                    onClick={() => setShowAddChecklistModal(true)}
                  >
                    <Plus size={13} /> Add Item
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {inspectionChecklist.map((item, idx) => {
                    const isDamaged = item.condition === 'damaged';
                    const isFair = item.condition === 'minor_wear' || item.condition === 'fair';
                    return (
                      <div
                        key={item.id || idx}
                        style={{
                          background: 'var(--surface)',
                          border: isDamaged ? '1px solid #FCA5A5' : '1px solid var(--line)',
                          borderRadius: 'var(--radius)',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
                            <span
                              style={{
                                background: '#EEF2F6',
                                color: 'var(--ink)',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: '4px',
                                letterSpacing: '0.4px',
                                textTransform: 'uppercase',
                              }}
                            >
                              {item.room || 'General'}
                            </span>
                            <b style={{ fontSize: '13.5px' }}>
                              {item.item || item.amenity}
                            </b>
                            {isDamaged && (Number(item.deduction) || 0) > 0 && (
                              <span
                                style={{
                                  background: '#FEE2E2',
                                  color: '#DC2626',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                }}
                              >
                                - {getCurrencySymbol(inspectingMoveOut.currency)}{Number(item.deduction).toLocaleString()}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <select
                              value={isFair ? 'minor_wear' : item.condition}
                              onChange={(e) => {
                                const cond = e.target.value as any;
                                handleUpdateItemCondition(idx, cond);
                              }}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontWeight: 600,
                                fontSize: '12px',
                                borderColor: isDamaged ? 'var(--danger)' : 'var(--line-strong)',
                                color: isDamaged ? 'var(--danger)' : 'var(--ink)',
                              }}
                            >
                              <option value="good">Good (No damage)</option>
                              <option value="minor_wear">Wear (Normal wear)</option>
                              <option value="damaged">Damaged (Requires deduction)</option>
                            </select>

                            <label
                              style={{
                                background: '#F0F4F1',
                                border: '1px solid var(--line-strong)',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Camera size={13} /> Photo
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => handlePhotoUpload(idx, e)}
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() => handleRemoveInspectionItem(idx)}
                              style={{
                                background: '#FFF1F2',
                                border: '1px solid #FECDD3',
                                color: '#E11D48',
                                borderRadius: '4px',
                                padding: '4px 7px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="Remove item"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Deduction Input if Damaged */}
                        {isDamaged && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEF2F2', padding: '8px 12px', borderRadius: '4px', border: '1px solid #FEE2E2', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#991B1B', margin: 0 }}>
                              Repair Cost Deduction ({getCurrencySymbol(inspectingMoveOut.currency)}):
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={item.deduction === 0 ? '' : item.deduction}
                              placeholder="0"
                              onChange={(e) => handleUpdateItemDeduction(idx, Number(e.target.value) || 0)}
                              style={{ width: '130px', padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #FCA5A5', background: 'var(--surface)' }}
                            />
                          </div>
                        )}

                        {/* Notes Input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="text"
                            placeholder="Inspection notes or remarks (optional)..."
                            value={item.notes || ''}
                            onChange={(e) => handleUpdateItemNotes(idx, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '5px 8px',
                              fontSize: '12px',
                              borderRadius: '4px',
                              border: '1px solid var(--line)',
                              background: '#FAFBFB',
                            }}
                          />
                        </div>

                        {/* Photo Thumbnails */}
                        {item.photos && item.photos.length > 0 && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                            {item.photos.map((photo, pIdx) => (
                              <div
                                key={pIdx}
                                style={{
                                  position: 'relative',
                                  width: '64px',
                                  height: '64px',
                                  borderRadius: '4px',
                                  overflow: 'hidden',
                                  border: '1px solid var(--line)',
                                }}
                              >
                                <img src={photo} alt="Amenity Condition" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhoto(idx, pIdx)}
                                  style={{
                                    position: 'absolute',
                                    top: 2,
                                    right: 2,
                                    background: 'rgba(0,0,0,0.6)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '18px',
                                    height: '18px',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Security Deposit Deductions Calculator */}
              <div style={{ background: '#F8F9FA', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <DollarSign size={16} color="var(--danger)" />
                  Security Deposit Deductions Calculator
                </div>

                {/* Preset Buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ink-soft)', alignSelf: 'center' }}>Quick Presets:</span>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => handleAddPresetDeduction('Deep cleaning & sanitization', 2500, 'General Cleaning')}
                  >
                    + Deep Cleaning ({getCurrencySymbol(inspectingMoveOut?.currency) || DEFAULT_CURRENCY_SYMBOL}2,500)
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => handleAddPresetDeduction('Wall repaint & patching', 3500, 'Paint, Walls & Ceilings')}
                  >
                    + Wall Repaint ({getCurrencySymbol(inspectingMoveOut?.currency) || DEFAULT_CURRENCY_SYMBOL}3,500)
                  </button>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => handleAddPresetDeduction('Lock & key replacement', 1200, 'Doors, Windows, Locks & Keys')}
                  >
                    + Lock Change ({getCurrencySymbol(inspectingMoveOut?.currency) || DEFAULT_CURRENCY_SYMBOL}1,200)
                  </button>
                </div>

                {/* Custom Deduction Input Form */}
                <div className="vacate-deduction-grid">
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11.5px' }}>Damage / Repair Description</label>
                    <input
                      type="text"
                      placeholder="e.g. Broken bathroom tile repair"
                      value={customDeductReason}
                      onChange={(e) => setCustomDeductReason(e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11.5px' }}>Amenity Category</label>
                    <select value={customDeductAmenity} onChange={(e) => setCustomDeductAmenity(e.target.value)}>
                      {DEFAULT_AMENITIES.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                      <option value="General Cleaning">General Cleaning</option>
                      <option value="Utilities / Unpaid Bills">Utilities / Unpaid Bills</option>
                    </select>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11.5px' }}>Deduction Amount ({getCurrencySymbol(inspectingMoveOut?.currency) || DEFAULT_CURRENCY_SYMBOL})</label>
                    <input
                      type="number"
                      placeholder="0"
                      min="0"
                      value={customDeductAmount === 0 ? '' : customDeductAmount}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                        setCustomDeductAmount(cleaned === '' ? '' : Number(cleaned));
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn brass"
                    style={{ height: '38px', padding: '0 14px' }}
                    onClick={handleAddCustomDeduction}
                  >
                    + Add
                  </button>
                </div>

                {/* Itemized Deductions List */}
                {deductions.length > 0 && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '6px' }}>Itemized Deductions:</div>
                    {deductions.map((d, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: i === deductions.length - 1 ? 'none' : '1px dashed var(--line)' }}>
                        <div>
                          <b>{d.reason}</b> <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>({d.amenity})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                            - {getCurrencySymbol(inspectingMoveOut?.currency) || DEFAULT_CURRENCY_SYMBOL}{d.amount.toLocaleString('en-IN')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveDeduction(i)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px' }}
                            title="Remove deduction"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Balance Summary */}
                {(() => {
                  const chkDeductTotal = (inspectionChecklist || []).reduce((s, c) => s + (Number(c.deduction) || 0), 0);
                  const extraDeductTotal = (deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
                  const totalDeductionsVal = chkDeductTotal + extraDeductTotal;
                  const finalRefundVal = Math.max(0, (inspectingMoveOut.deposit ?? 0) - totalDeductionsVal);
                  return (
                    <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span>Security Deposit Held:</span>
                        <b>{getCurrencySymbol(inspectingMoveOut.currency)}{(inspectingMoveOut.deposit ?? 0).toLocaleString()}</b>
                      </div>
                      {chkDeductTotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--danger)' }}>
                          <span>Inspection Checklist Deductions ({inspectionChecklist.filter(c => (Number(c.deduction) || 0) > 0).length} items):</span>
                          <b>- {getCurrencySymbol(inspectingMoveOut.currency)}{chkDeductTotal.toLocaleString()}</b>
                        </div>
                      )}
                      {extraDeductTotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--danger)' }}>
                          <span>Additional / Preset Deductions ({deductions.length} items):</span>
                          <b>- {getCurrencySymbol(inspectingMoveOut.currency)}{extraDeductTotal.toLocaleString()}</b>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--danger)', fontWeight: 700 }}>
                        <span>Total Damage Deductions:</span>
                        <b>- {getCurrencySymbol(inspectingMoveOut.currency)}{totalDeductionsVal.toLocaleString()}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 800, marginTop: '4px', borderTop: '1px solid var(--line)', paddingTop: '6px' }}>
                        <span>Final Refund Balance to Tenant:</span>
                        <span style={{ color: 'var(--ledger)' }}>
                          {getCurrencySymbol(inspectingMoveOut.currency)}{finalRefundVal.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="modal-foot" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setInspectingMoveOut(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isProcessingInspection ? 'btn-processing' : ''}`}
                onClick={handleCompleteInspection}
                disabled={isProcessingInspection}
              >
                <ButtonProcessing
                  loading={isProcessingInspection}
                  loadingText="Finalizing & Generating Settlement..."
                  defaultText="Finalize Inspection & Schedule Refund"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD INSPECTION ITEM MODAL */}
      {showAddChecklistModal && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }} onClick={() => setShowAddChecklistModal(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Add Inspection Item</h3>
              <button type="button" className="modal-close" onClick={() => setShowAddChecklistModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Room / Area</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {['Living Room', 'Kitchen', 'Master Bedroom', 'Bedrooms', 'Bathroom', 'Premises', 'Utility / Balcony'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`btn small ${newChecklistRoom === r ? 'brass' : 'secondary'}`}
                      style={{ fontSize: '11px', padding: '3px 8px', height: '26px' }}
                      onClick={() => setNewChecklistRoom(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Or enter custom room name..."
                  value={newChecklistRoom}
                  onChange={(e) => setNewChecklistRoom(e.target.value)}
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label>Amenity / Inspection Item Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Geyser & Water Heater, Curtain Rods, AC Remote"
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label>Condition</label>
                <select
                  value={newChecklistCondition}
                  onChange={(e) => setNewChecklistCondition(e.target.value as any)}
                >
                  <option value="good">Good (No damage)</option>
                  <option value="minor_wear">Wear (Normal wear)</option>
                  <option value="damaged">Damaged (Requires deduction)</option>
                </select>
              </div>

              {newChecklistCondition === 'damaged' && (
                <div className="field" style={{ margin: 0 }}>
                  <label>Estimated Repair Deduction ({getCurrencySymbol(inspectingMoveOut?.currency)})</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="1000"
                    value={newChecklistDeduction}
                    onChange={(e) => setNewChecklistDeduction(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
              )}

              <div className="field" style={{ margin: 0 }}>
                <label>Notes / Remarks (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Broken knob, needs replacement"
                  value={newChecklistNotes}
                  onChange={(e) => setNewChecklistNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setShowAddChecklistModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn brass"
                  onClick={handleAddNewInspectionItem}
                >
                  Add Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CONFIRM REFUND COMPLETED & RELEASE UNIT */}
      {moveOutToComplete && (
        <div className="modal-backdrop" onClick={() => setMoveOutToComplete(null)}>
          <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Confirm Deposit Refund & Release Unit</h3>
              <button type="button" className="modal-close" onClick={() => setMoveOutToComplete(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#F8F9FA', padding: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Tenant:</span>
                  <b>{moveOutToComplete.tenant}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Residence Unit:</span>
                  <b>Unit {moveOutToComplete.unit}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Original Deposit:</span>
                  <span>{getCurrencySymbol(moveOutToComplete?.currency) || DEFAULT_CURRENCY_SYMBOL}{(moveOutToComplete.deposit ?? 0).toLocaleString()}</span>
                </div>
                {moveOutToComplete.deductions && moveOutToComplete.deductions.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--danger)' }}>
                    <span>Total Deductions:</span>
                    <span>- {getCurrencySymbol(moveOutToComplete?.currency) || DEFAULT_CURRENCY_SYMBOL}{(moveOutToComplete.deductions || []).reduce((s, d) => s + (d.amount || 0), 0).toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '6px', marginTop: '6px' }}>
                  <b>Final Refund Payable:</b>
                  <b style={{ color: 'var(--ledger)', fontSize: '15px' }}>
                    {getCurrencySymbol(moveOutToComplete?.currency) || DEFAULT_CURRENCY_SYMBOL}{(moveOutToComplete.finalRefundAmount !== undefined ? moveOutToComplete.finalRefundAmount : (moveOutToComplete.deposit ?? 0)).toLocaleString()}
                  </b>
                </div>
              </div>

              {/* Verified Receiving Payout Account from Tenant */}
              {(() => {
                const settleMatch = (state.depositSettlements || []).find(
                  (s) =>
                    s.id === `DEP-SETTLE-${moveOutToComplete.id}` ||
                    ((moveOutToComplete as any).agreementId && s.agreementId === (moveOutToComplete as any).agreementId)
                );
                const chosen = settleMatch?.chosenPayoutDetails;
                const tenantPayoutProfile = (state.payoutProfiles || []).find(
                  (p) => p.tenantId === moveOutToComplete.tenantId
                );

                if (chosen) {
                  return (
                    <div style={{ background: '#EBF3EF', border: '1px solid #2F5D50', padding: '12px 14px', borderRadius: '8px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <b style={{ color: '#2F5D50', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle2 size={15} /> Tenant's Selected Payout Destination:
                        </b>
                        <span className="badge green" style={{ fontSize: '11px' }}>Accepted by Tenant</span>
                      </div>

                      {chosen.method === 'upi' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'block' }}>UPI ID (Google Pay / PhonePe / Paytm):</span>
                            <b style={{ fontSize: '14px', color: 'var(--ledger)' }}>{chosen.upiId}</b>
                          </div>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => {
                              navigator.clipboard.writeText(chosen.upiId || '');
                              showToast('✓ UPI ID copied to clipboard!');
                            }}
                          >
                            Copy UPI
                          </button>
                        </div>
                      )}

                      {chosen.method === 'paypal' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'block' }}>PayPal Email Address:</span>
                            <b style={{ fontSize: '14px', color: 'var(--ledger)' }}>{chosen.paypalEmail}</b>
                          </div>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => {
                              navigator.clipboard.writeText(chosen.paypalEmail || '');
                              showToast('✓ PayPal email copied to clipboard!');
                            }}
                          >
                            Copy Email
                          </button>
                        </div>
                      )}

                      {chosen.method === 'iban' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'block' }}>IBAN / Global Wire:</span>
                            <b style={{ fontSize: '13.5px', color: 'var(--ledger)' }}>{chosen.iban}</b>
                            {chosen.swiftBic && (
                              <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginLeft: '8px' }}>
                                (SWIFT: {chosen.swiftBic})
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => {
                              navigator.clipboard.writeText(chosen.iban || '');
                              showToast('✓ IBAN copied to clipboard!');
                            }}
                          >
                            Copy IBAN
                          </button>
                        </div>
                      )}

                      {chosen.method === 'bank_in' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                          <div>
                            <span style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'block' }}>Indian Bank Account:</span>
                            <b style={{ fontSize: '13.5px', color: 'var(--ledger)' }}>{chosen.accountNumber}</b>
                            <span style={{ fontSize: '12px', color: 'var(--ink-soft)', marginLeft: '8px' }}>
                              IFSC: <b>{chosen.ifscCode}</b>
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => {
                              navigator.clipboard.writeText(`${chosen.accountNumber} IFSC: ${chosen.ifscCode}`);
                              showToast('✓ Bank details copied!');
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      )}

                      {chosen.method === 'cash' && (
                        <div style={{ background: 'var(--surface)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                          <b>💵 In-Person Hand Cash Handover:</b> Tenant confirmed they will receive physical cash during final key return.
                        </div>
                      )}

                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '6px' }}>
                        Beneficiary Legal Name: <b>{chosen.accountHolderName}</b>
                        {chosen.notes && ` • Note: "${chosen.notes}"`}
                      </div>
                    </div>
                  );
                }

                if (tenantPayoutProfile) {
                  return (
                    <div style={{ background: '#EBF3EF', border: '1px solid #2F5D50', padding: '10px 14px', borderRadius: '6px', fontSize: '12.5px' }}>
                      <b style={{ color: '#2F5D50', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={14} /> Tenant's Registered Payout Profile:
                      </b>
                      <div style={{ marginTop: '4px' }}>
                        {tenantPayoutProfile.channel === 'upi' && `UPI ID: ${tenantPayoutProfile.upiId}`}
                        {tenantPayoutProfile.channel === 'bank_in' && `Bank: ${tenantPayoutProfile.bankName || 'Bank Account'} (IFSC: ${tenantPayoutProfile.ifscCode}, Acct: ••••${tenantPayoutProfile.accountNumber?.slice(-4)})`}
                        {tenantPayoutProfile.channel === 'ach_us' && `US ACH Routing: ${tenantPayoutProfile.routingNumber} (Acct: ••••${tenantPayoutProfile.accountNumber?.slice(-4)})`}
                        {tenantPayoutProfile.channel === 'uk_sort' && `UK Sort Code: ${tenantPayoutProfile.sortCode} (Acct: ••••${tenantPayoutProfile.accountNumber?.slice(-4)})`}
                        {tenantPayoutProfile.channel === 'iban_eu' && `IBAN: ${tenantPayoutProfile.iban}`}
                        {tenantPayoutProfile.channel === 'paypal' && `PayPal: ${tenantPayoutProfile.paypalEmail}`}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        Beneficiary: <b>{tenantPayoutProfile.accountHolderName}</b> • Currency: {tenantPayoutProfile.currency}
                      </div>
                    </div>
                  );
                }

                return (
                  <div style={{ background: '#FFF8E6', border: '1px solid var(--brass, #C59A45)', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', color: '#7C5E10' }}>
                    ℹ️ Tenant has not saved a payout account in their resident settings. You may disburse via standard bank transfer or direct check and record the reference below.
                  </div>
                );
              })()}

              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ margin: 0, fontWeight: 600 }}>Payout Method Used</label>
                  {(() => {
                    const settleMatch = (state.depositSettlements || []).find(
                      (s) =>
                        s.id === `DEP-SETTLE-${moveOutToComplete.id}` ||
                        ((moveOutToComplete as any).agreementId && s.agreementId === (moveOutToComplete as any).agreementId)
                    );
                    const chosen = settleMatch?.chosenPayoutDetails;
                    const matchesTenant =
                      (chosen?.method === 'upi' && refundPayoutMethod === 'UPI') ||
                      (chosen?.method === 'bank_in' && refundPayoutMethod === 'Bank Wire') ||
                      (chosen?.method === 'paypal' && refundPayoutMethod === 'PayPal') ||
                      (chosen?.method === 'iban' && refundPayoutMethod === 'SEPA Wire (IBAN)') ||
                      (chosen?.method === 'cash' && refundPayoutMethod === 'Cash');

                    return matchesTenant ? (
                      <span className="badge green" style={{ fontSize: '10.5px' }}>
                        ✓ Matches Tenant's Preferred Selection
                      </span>
                    ) : null;
                  })()}
                </div>
                <select value={refundPayoutMethod} onChange={(e) => setRefundPayoutMethod(e.target.value)}>
                  <option value="UPI">UPI / Instant Transfer (GPay, PhonePe, Paytm)</option>
                  <option value="Bank Wire">Bank Wire / Direct Transfer (NEFT / IMPS)</option>
                  <option value="Cash">Cash Handover (Physical In-Person Settlement)</option>
                  <option value="Cheque">Bank Cheque Handover</option>
                  <option value="PayPal">PayPal Payout</option>
                  <option value="SEPA Wire (IBAN)">SEPA / International Wire (IBAN)</option>
                  <option value="US ACH Transfer">US ACH Direct Deposit</option>
                </select>
              </div>

              {/* DYNAMIC FIELDS ACCORDING TO PAYOUT METHOD */}
              {refundPayoutMethod === 'UPI' && (
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        UPI Reference / 12-digit UTR *
                      </label>
                      <input
                        type="text"
                        value={refundTxRef}
                        onChange={(e) => setRefundTxRef(e.target.value)}
                        placeholder="e.g. 425619882201 (12 digits)"
                        required
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Payment App Used
                      </label>
                      <select value={refundUpiApp} onChange={(e) => setRefundUpiApp(e.target.value)}>
                        <option value="Google Pay">Google Pay</option>
                        <option value="PhonePe">PhonePe</option>
                        <option value="Paytm">Paytm</option>
                        <option value="Cred">Cred</option>
                        <option value="BHIM">BHIM UPI</option>
                        <option value="Direct Bank App">Direct Bank App</option>
                        <option value="Other">Other UPI</option>
                      </select>
                    </div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>
                      Upload UPI Transfer Screenshot Proof (Recommended)
                    </label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleRefundProofUpload}
                    />
                    {refundProofUrl && (
                      <div style={{ fontSize: '12px', color: 'var(--ledger)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={13} /> Screenshot attached successfully
                      </div>
                    )}
                  </div>
                </div>
              )}

              {refundPayoutMethod === 'Bank Wire' && (
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '10px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Bank UTR / IMPS Reference *
                      </label>
                      <input
                        type="text"
                        value={refundTxRef}
                        onChange={(e) => setRefundTxRef(e.target.value)}
                        placeholder="e.g. HDFCR52024092400192"
                        required
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Remitting Bank / A/c
                      </label>
                      <input
                        type="text"
                        value={refundBankName}
                        onChange={(e) => setRefundBankName(e.target.value)}
                        placeholder="e.g. HDFC •••4012"
                      />
                    </div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>
                      Upload Bank Wire Advice / Debit Slip (Recommended)
                    </label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleRefundProofUpload}
                    />
                    {refundProofUrl && (
                      <div style={{ fontSize: '12px', color: 'var(--ledger)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={13} /> Bank wire receipt attached
                      </div>
                    )}
                  </div>
                </div>
              )}

              {refundPayoutMethod === 'Cash' && (
                <div style={{ background: '#FFFDF8', border: '1px solid var(--brass, #C59A45)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#92400E', background: '#FEF3C7', padding: '8px 10px', borderRadius: '6px' }}>
                    💵 <b>Physical Cash Handover Protocol:</b> After confirming, an outflow cash claim will be generated for the tenant to acknowledge receipt. You can print a dual-signed handover voucher below.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Handover Date *
                      </label>
                      <input
                        type="date"
                        value={refundCashDate}
                        onChange={(e) => setRefundCashDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Handover Location *
                      </label>
                      <input
                        type="text"
                        value={refundCashLocation}
                        onChange={(e) => setRefundCashLocation(e.target.value)}
                        placeholder="e.g. Unit Premises / Office"
                        required
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Staff / Co-Witness (Optional)
                      </label>
                      <input
                        type="text"
                        value={refundCashWitness}
                        onChange={(e) => setRefundCashWitness(e.target.value)}
                        placeholder="e.g. Property Manager John"
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Voucher / Receipt Serial # (Optional)
                      </label>
                      <input
                        type="text"
                        value={refundTxRef}
                        onChange={(e) => setRefundTxRef(e.target.value)}
                        placeholder="e.g. CASH-VOUCHER-001"
                      />
                    </div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>
                      Upload Signed Handover Paper Receipt Photo (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleRefundProofUpload}
                    />
                    {refundProofUrl && (
                      <div style={{ fontSize: '12px', color: 'var(--ledger)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={13} /> Signed receipt attached successfully
                      </div>
                    )}
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => {
                        const finalAmt = moveOutToComplete.finalRefundAmount !== undefined ? moveOutToComplete.finalRefundAmount : moveOutToComplete.deposit;
                        const voucherClaim: CashHandoverClaim = {
                          id: `CLAIM-CASH-${Date.now().toString().slice(-6)}`,
                          direction: 'outflow',
                          type: 'deposit_refund',
                          amount: finalAmt,
                          currency: moveOutToComplete.currency || 'INR',
                          ownerId,
                          tenantId: moveOutToComplete.tenantId || '',
                          tenantName: moveOutToComplete.tenant,
                          unit: moveOutToComplete.unit,
                          claimedBy: ownerId,
                          claimedByRole: 'owner',
                          claimedByName: user?.displayName || 'Property Owner',
                          handoverDate: refundCashDate || new Date().toISOString().split('T')[0],
                          handoverLocation: refundCashLocation || `Unit ${moveOutToComplete.unit} Premises`,
                          notes: 'Security deposit refund physical cash handover voucher',
                          status: 'pending_confirmation',
                          claimedAt: new Date().toISOString(),
                        };
                        downloadCashHandoverReceiptPdf(voucherClaim);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Printer size={13} /> Print Dual-Signed Cash Handover Voucher (PDF)
                    </button>
                  </div>
                </div>
              )}

              {refundPayoutMethod === 'Cheque' && (
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="vacate-cheque-grid">
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Cheque # (6 Digits) *
                      </label>
                      <input
                        type="text"
                        value={refundChequeNo}
                        onChange={(e) => setRefundChequeNo(e.target.value)}
                        placeholder="e.g. 004521"
                        required
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Drawee / Issuing Bank *
                      </label>
                      <input
                        type="text"
                        value={refundBankName}
                        onChange={(e) => setRefundBankName(e.target.value)}
                        placeholder="e.g. SBI / HDFC"
                        required
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Cheque Date *
                      </label>
                      <input
                        type="date"
                        value={refundChequeDate}
                        onChange={(e) => setRefundChequeDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>
                      Upload Cheque Leaf / Counterfoil Photo (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleRefundProofUpload}
                    />
                    {refundProofUrl && (
                      <div style={{ fontSize: '12px', color: 'var(--ledger)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={13} /> Cheque photo attached
                      </div>
                    )}
                  </div>
                </div>
              )}

              {refundPayoutMethod === 'PayPal' && (
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>
                      PayPal Transaction ID / Payout Batch ID *
                    </label>
                    <input
                      type="text"
                      value={refundTxRef}
                      onChange={(e) => setRefundTxRef(e.target.value)}
                      placeholder="e.g. 8RT9281729019283K"
                      required
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>
                      Upload PayPal Payout Receipt Screenshot (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleRefundProofUpload}
                    />
                    {refundProofUrl && (
                      <div style={{ fontSize: '12px', color: 'var(--ledger)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={13} /> PayPal receipt attached
                      </div>
                    )}
                  </div>
                </div>
              )}

              {refundPayoutMethod === 'SEPA Wire (IBAN)' && (
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '10px' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        SWIFT / MT103 Wire Ref *
                      </label>
                      <input
                        type="text"
                        value={refundTxRef}
                        onChange={(e) => setRefundTxRef(e.target.value)}
                        placeholder="e.g. FT24268001928374"
                        required
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '12px', fontWeight: 600 }}>
                        Remitting Bank
                      </label>
                      <input
                        type="text"
                        value={refundBankName}
                        onChange={(e) => setRefundBankName(e.target.value)}
                        placeholder="e.g. Deutsche Bank"
                      />
                    </div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>
                      Upload International Wire Remittance Slip (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleRefundProofUpload}
                    />
                    {refundProofUrl && (
                      <div style={{ fontSize: '12px', color: 'var(--ledger)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={13} /> Wire slip attached
                      </div>
                    )}
                  </div>
                </div>
              )}

              {refundPayoutMethod === 'US ACH Transfer' && (
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>
                      ACH Trace Number / Direct Deposit ID *
                    </label>
                    <input
                      type="text"
                      value={refundTxRef}
                      onChange={(e) => setRefundTxRef(e.target.value)}
                      placeholder="e.g. 091000018273645"
                      required
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px', fontWeight: 600 }}>
                      Upload ACH Confirmation Receipt (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleRefundProofUpload}
                    />
                    {refundProofUrl && (
                      <div style={{ fontSize: '12px', color: 'var(--ledger)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={13} /> ACH receipt attached
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="field">
                <label>Tenant Experience Rating (1 to 5 Stars)</label>
                <select value={tenantRating} onChange={(e) => setTenantRating(Number(e.target.value))}>
                  <option value={5}>★★★★★ (5 - Excellent resident)</option>
                  <option value={4}>★★★★☆ (4 - Very Good)</option>
                  <option value={3}>★★★☆☆ (3 - Good)</option>
                  <option value={2}>★★☆☆☆ (2 - Fair)</option>
                  <option value={1}>★☆☆☆☆ (1 - Poor)</option>
                </select>
              </div>

              <div className="field">
                <label>End-of-Tenancy Review / Endorsement</label>
                <textarea
                  rows={2}
                  value={tenantReview}
                  onChange={(e) => setTenantReview(e.target.value)}
                  placeholder="How was this tenancy overall?"
                />
              </div>

              <div style={{ background: '#EBF3ED', padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid #C4DFC8', fontSize: '12px', color: '#1B4D27' }}>
                ✓ <b>Immediate Action on Confirmation:</b> The security deposit refund will be recorded on ledger, the active lease will be terminated, and <b>Unit {moveOutToComplete.unit} will be marked VACANT</b> for immediate new leasing.
              </div>
            </div>

            <div className="modal-foot" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setMoveOutToComplete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isProcessingRefund ? 'btn-processing' : ''}`}
                onClick={handleConfirmRefundAndReleaseUnit}
                disabled={isProcessingRefund}
              >
                <ButtonProcessing
                  loading={isProcessingRefund}
                  loadingText="Executing Refund & Updating Unit..."
                  defaultText="Confirm Refund & Release Unit"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recalculate & Re-send Settlement Modal */}
      {recalculatingMoveOut && recalculatingSettlement && (
        <div className="modal-backdrop" onClick={() => setRecalculatingMoveOut(null)}>
          <div className="modal" style={{ maxWidth: '640px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h3 style={{ margin: 0 }}>Recalculate Settlement &amp; Deductions</h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--ink-soft)' }}>
                  Unit {recalculatingMoveOut.unit} • Tenant: {recalculatingMoveOut.tenant}
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setRecalculatingMoveOut(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
              {/* Tenant Rejection Reason Alert */}
              <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Resident's Feedback / Reason for Rejection
                </div>
                <div style={{ fontSize: '13.5px', color: '#7F1D1D', marginTop: '4px', fontStyle: 'italic' }}>
                  "{recalculatingSettlement.rejectionReason || recalculatingSettlement.notes || 'Resident requested review of deductions'}"
                </div>
              </div>

              {/* Deposit Overview */}
              <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>Original Security Deposit Held:</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                  {getCurrencySymbol(recalculatingSettlement.currency)}{(recalculatingMoveOut.deposit ?? 0).toLocaleString('en-IN')}
                </span>
              </div>

              {/* Editable Deductions List */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: 'var(--ink)' }}>
                  Itemized Deductions ({recalculatedDeductions.length})
                </div>
                {recalculatedDeductions.length === 0 ? (
                  <div style={{ fontSize: '12.5px', color: 'var(--ledger)', background: '#F0FDF4', padding: '10px 12px', borderRadius: '6px' }}>
                    ✓ No deductions assessed. 100% of the security deposit will be refunded.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recalculatedDeductions.map((d, idx) => (
                      <div key={d.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--line)', padding: '8px 12px', borderRadius: '6px' }}>
                        <input
                          type="text"
                          className="input"
                          style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }}
                          value={d.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRecalculatedDeductions((prev) => prev.map((item, i) => (i === idx ? { ...item, title: val } : item)));
                          }}
                          placeholder="Deduction reason / item"
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>{getCurrencySymbol(recalculatingSettlement.currency)}</span>
                          <input
                            type="number"
                            className="input"
                            style={{ width: '100px', padding: '6px 10px', fontSize: '13px', fontWeight: 600 }}
                            value={d.amount === 0 ? '' : d.amount}
                            placeholder="0"
                            min="0"
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                              const val = Math.max(0, Number(cleaned) || 0);
                              setRecalculatedDeductions((prev) => prev.map((item, i) => (i === idx ? { ...item, amount: val } : item)));
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ color: '#DC2626', borderColor: '#FCA5A5', padding: '6px 8px' }}
                          title="Remove Deduction"
                          onClick={() => setRecalculatedDeductions((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add New Deduction Field */}
              <div style={{ background: '#FAF9F6', border: '1px dashed var(--line)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: 'var(--ink-soft)' }}>
                  Add Another Deduction Item (Optional)
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="input"
                    style={{ flex: 1, fontSize: '12.5px' }}
                    placeholder="e.g. Wall patch touch-up"
                    value={newDeductTitle}
                    onChange={(e) => setNewDeductTitle(e.target.value)}
                  />
                  <input
                    type="number"
                    className="input"
                    style={{ width: '100px', fontSize: '12.5px' }}
                    placeholder="0"
                    min="0"
                    value={newDeductAmount === '0' ? '' : newDeductAmount}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setNewDeductAmount(cleaned);
                    }}
                  />
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      if (!newDeductTitle.trim() || !newDeductAmount || Number(newDeductAmount) <= 0) {
                        showToast('Please enter both deduction description and amount.');
                        return;
                      }
                      setRecalculatedDeductions((prev) => [
                        ...prev,
                        {
                          id: `ded-${Date.now()}`,
                          category: 'repair_damage',
                          title: newDeductTitle.trim(),
                          amount: Number(newDeductAmount),
                        },
                      ]);
                      setNewDeductTitle('');
                      setNewDeductAmount('');
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Recalculated Summary Highlight */}
              {(() => {
                const totalDeductions = recalculatedDeductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
                const finalRefund = Math.max(0, recalculatingMoveOut.deposit - totalDeductions);
                return (
                  <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: '8px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                        Recalculated Net Refund Amount
                      </div>
                      <div style={{ fontSize: '11px', color: '#15803D' }}>
                        Total Revised Deductions: {getCurrencySymbol(recalculatingSettlement.currency)}{totalDeductions.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#166534' }}>
                      {getCurrencySymbol(recalculatingSettlement.currency)}{finalRefund.toLocaleString('en-IN')}
                    </div>
                  </div>
                );
              })()}

              {/* Landlord Revision Note to Resident */}
              <div className="field" style={{ margin: 0 }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600 }}>
                  Note to Resident Regarding Recalculation (Optional)
                </label>
                <textarea
                  className="input"
                  rows={2}
                  value={ownerRevisionNotes}
                  onChange={(e) => setOwnerRevisionNotes(e.target.value)}
                  placeholder={`e.g. 'We reviewed your feedback and reduced the cleaning fee to ${getCurrencySymbol(recalculatingSettlement?.currency || recalculatingMoveOut?.currency) || DEFAULT_CURRENCY_SYMBOL}1,500 and waived painting charges.'`}
                />
              </div>
            </div>

            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn secondary" onClick={() => setRecalculatingMoveOut(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass ${isProcessingRecalculate ? 'btn-processing' : ''}`}
                onClick={handleSaveRecalculatedSettlement}
                disabled={isProcessingRecalculate}
              >
                <ButtonProcessing
                  loading={isProcessingRecalculate}
                  loadingText="Dispatching Recalculated Settlement..."
                  defaultText="Re-send Recalculated Settlement to Resident"
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
