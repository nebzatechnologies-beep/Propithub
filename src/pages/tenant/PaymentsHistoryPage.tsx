import React, { useState, useEffect, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Building,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  FlaskConical,
  Home,
  Lock,
  History,
  Info,
  Printer,
  QrCode,
  Receipt,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Agreement, Invoice, PaymentTransaction, TenantRecord, DepositSettlement } from '../../types';
import { buildRentSchedule, RentScheduleResult, RentCycleItem } from '../../lib/rentScheduleUtils';
import { DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol } from '../../lib/currencyService';
import { downloadCashHandoverReceiptPdf, downloadSingleInvoicePDF } from '../../lib/pdf';
import { compressImage } from '../../lib/imageUploader';
import { generateTransactionId, generateInvoiceId, generateReceiptId } from '../../lib/idGenerators';
import { dispatchRentPaymentReceiptEmail } from '../../lib/receiptMailer';
import {
  launchRazorpayPayment,
  launchStripePayment,
  launchPayPalPayment,
  launchEasebuzzPayment,
  launchStripeRecurringMandate,
  launchRazorpayRecurringMandate,
  launchPayPalRecurringMandate,
  launchEasebuzzRecurringMandate,
} from '../../lib/payments';
import { DepositSettlementReviewModal } from '../../components/common/DepositSettlementReviewModal';
import { RentalInvoiceDocument } from '../../components/invoices/RentalInvoiceDocument';
import { CurrencyConverterTrigger } from '../../components/common/CurrencyConverterTrigger';
import { ButtonProcessing } from '../../components/common/Spinner';

export const PaymentsHistoryPage: React.FC = () => {
  const {
    state,
    updateState,
    markInvoicePaid,
    saveInvoice,
    savePayment,
    submitCashClaim,
    confirmCashClaim,
    rejectCashClaim,
    confirmRefundReceipt,
    showToast,
    updateAgreementAutopay,
    cancelAgreementAutopay,
  } = useAppData();
  const { user } = useAuth();
  const tenantName = user?.displayName || 'Resident';
  const tenantEmail = user?.email?.toLowerCase() || '';

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');

  const { convert, format } = useCurrency();
  const [isConfirmingRefundReceipt, setIsConfirmingRefundReceipt] = useState(false);
  const [confirmedSettlementIds, setConfirmedSettlementIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('propithub_confirmed_settlements');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (_) {
      return new Set();
    }
  });

  const handleDirectConfirmReceipt = async (settlementId: string) => {
    try {
      setIsConfirmingRefundReceipt(true);
      setConfirmedSettlementIds((prev) => {
        const next = new Set(prev);
        next.add(settlementId);
        try {
          localStorage.setItem('propithub_confirmed_settlements', JSON.stringify(Array.from(next)));
        } catch (_) {}
        return next;
      });
      await confirmRefundReceipt(settlementId);
      showToast('✓ Deposit refund receipt confirmed! Tenancy concluded and lease dues cleared.');
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to confirm receipt.');
    } finally {
      setIsConfirmingRefundReceipt(false);
    }
  };

  const [subTab, setSubTab] = useState<'rent_due' | 'invoices' | 'ledger' | 'deposit'>(() => {
    if (urlTab === 'rent_due' || urlTab === 'invoices' || urlTab === 'ledger' || urlTab === 'deposit') {
      return urlTab;
    }
    return 'ledger';
  });

  const [rentDueView, setRentDueView] = useState<'upcoming' | 'history'>('upcoming');
  const [depositFilter, setDepositFilter] = useState<'all' | 'paid' | 'due' | 'refunded' | 'moveout'>('all');
  const [selectedResidenceId, setSelectedResidenceId] = useState<string>('all');
  const [selectedInvoiceForReceipt, setSelectedInvoiceForReceipt] = useState<Invoice | null>(null);
  const [selectedDepositRecordForView, setSelectedDepositRecordForView] = useState<any | null>(null);
  const [settlementForReview, setSettlementForReview] = useState<DepositSettlement | null>(null);
  const [activePayingInvoice, setActivePayingInvoice] = useState<Invoice | null>(null);
  const [isPayNowOpen, setIsPayNowOpen] = useState<boolean>(false);
  const [selectedMethod, setSelectedMethod] = useState<string>('card');
  const [cashHandoverLocation, setCashHandoverLocation] = useState<string>('');
  const [cashHandoverDate, setCashHandoverDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [offlineRef, setOfflineRef] = useState<string>('');
  const [offlineProofUrl, setOfflineProofUrl] = useState<string>('');
  const [offlineNotes, setOfflineNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [enableAutopayInCheckout, setEnableAutopayInCheckout] = useState<boolean>(true);

  const prepareInvoiceForPayment = (inv: Invoice): Invoice => {
    return { ...inv, total: inv.total || inv.amount || 0 };
  };

  const cleanUnitStr = (u?: string) => (u || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();

  // Tenant Record from state
  const tenantRecord = useMemo(() => {
    return state.tenants.find(
      (t) =>
        t.id === user?.id ||
        (tenantEmail && t.email?.toLowerCase() === tenantEmail)
    );
  }, [state.tenants, user, tenantEmail]);

  const resolvedUnit = tenantRecord?.unit || (user as any)?.unitNumber || '';
  const hasAssignedUnit = Boolean(resolvedUnit && resolvedUnit !== 'Unassigned');
  const resolvedOwnerId = tenantRecord?.ownerId || '';

  // All payments scoped for this tenant
  const myPayments = useMemo(() => {
    const rawList = (state.payments || []).filter((p) => {
      if (user?.id && p.tenantId === user.id) return true;
      if (tenantRecord?.id && p.tenantId === tenantRecord.id) return true;
      if (tenantEmail && ((p as any).tenantEmail?.toLowerCase() === tenantEmail || p.tenant?.toLowerCase() === tenantEmail)) return true;
      if (hasAssignedUnit && p.unit === resolvedUnit && (!p.tenantId || p.tenantId === user?.id || p.tenantId === tenantRecord?.id)) return true;
      return false;
    });

    const seen = new Set<string>();
    return rawList.filter((p) => {
      const dedupKey = p.invoiceId || p.id;
      if (seen.has(dedupKey)) return false;
      seen.add(dedupKey);
      return true;
    });
  }, [state.payments, user, tenantRecord, tenantEmail, hasAssignedUnit, resolvedUnit]);

  // Cash claims submitted by me pending owner action
  const pendingInflowClaimsSubmittedByMe = useMemo(() => {
    return (state.cashClaims || []).filter(
      (c: any) =>
        c.status === 'pending_confirmation' &&
        c.claimedByRole === 'tenant' &&
        (c.tenantId === user?.id || (tenantEmail && c.tenantEmail?.toLowerCase() === tenantEmail))
    );
  }, [state.cashClaims, user, tenantEmail]);

  // All agreements strictly scoped for this resident
  const myAgreements = useMemo(() => {
    return (state.agreements || []).filter((a) => {
      if (user?.id && a.tenantId === user.id) return true;
      if (tenantRecord?.id && a.tenantId === tenantRecord.id) return true;
      if (tenantEmail) {
        if (a.tenantEmail && a.tenantEmail.toLowerCase() === tenantEmail) return true;
        if (a.tenant && a.tenant.toLowerCase() === tenantEmail) return true;
      }
      return false;
    });
  }, [state.agreements, user, tenantRecord, tenantEmail]);

  // All deposit invoices strictly scoped for this resident
  const myDepositInvoices = useMemo(() => {
    return state.invoices.filter((inv) => {
      if (inv.invoiceType !== 'deposit') return false;
      if (user?.id && inv.tenantId === user.id) return true;
      if (tenantRecord?.id && inv.tenantId === tenantRecord.id) return true;
      if (tenantEmail && (inv.tenantEmail?.toLowerCase() === tenantEmail || inv.tenant?.toLowerCase() === tenantEmail)) return true;
      return false;
    });
  }, [state.invoices, user, tenantRecord, tenantEmail]);

  // All move-outs strictly scoped for this resident
  const myMoveOuts = useMemo(() => {
    return (state.moveouts || []).filter((m) => {
      if (user?.id && m.tenantId === user.id) return true;
      if (tenantEmail && (m.tenant?.toLowerCase() === tenantEmail || (m as any).tenantEmail?.toLowerCase() === tenantEmail)) return true;
      return false;
    });
  }, [state.moveouts, user, tenantEmail]);

  // All deposit settlements strictly scoped for this resident
  const mySettlements = useMemo(() => {
    return (state.depositSettlements || []).filter((s) => {
      if (user?.id && s.tenantId === user.id) return true;
      if (tenantRecord?.id && s.tenantId === tenantRecord.id) return true;
      if (tenantEmail && s.tenantEmail && s.tenantEmail.toLowerCase() === tenantEmail) return true;

      if (
        hasAssignedUnit &&
        s.unit === resolvedUnit &&
        (!s.propertyId || !tenantRecord?.propertyId || s.propertyId === tenantRecord.propertyId) &&
        (!s.tenantId || s.tenantId === user?.id || s.tenantId === tenantRecord?.id)
      ) {
        return true;
      }
      return false;
    });
  }, [state.depositSettlements, user, tenantRecord, tenantEmail, hasAssignedUnit, resolvedUnit]);

  // Unified multi-property Security Deposit records
  const unifiedDepositRecords = useMemo(() => {
    const list: any[] = [];
    const seenTenancyKeys = new Set<string>();
    const mappedInvoiceIds = new Set<string>();

    // Deduplication tracking sets
    const seenUnits = new Set<string>();
    const cleanUnitStr = (u?: string) => (u || '').toLowerCase().replace(/^(unit|apt|flat|#)\s*/i, '').trim();

    // Sort agreements so active ones take priority over terminated/historical ones
    const sortedAgreements = [...myAgreements].sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return new Date(b.createdAt || b.start || 0).getTime() - new Date(a.createdAt || a.start || 0).getTime();
    });

    // 1. Map from active / signed agreements
    sortedAgreements.forEach((ag) => {
      const cleanU = cleanUnitStr(ag.unit);
      const tenancyKey = `${ag.propertyId || ''}_${cleanU}`.toLowerCase();
      if (seenTenancyKeys.has(tenancyKey)) return;
      seenTenancyKeys.add(tenancyKey);

      const depInv = myDepositInvoices.find(
        (i) => i.leaseAgreementId === ag.id || (i.unit === ag.unit && (!i.propertyId || i.propertyId === ag.propertyId))
      );
      if (depInv) mappedInvoiceIds.add(depInv.id);

      const mo = myMoveOuts.find((m) => {
        if ((m as any).agreementId) return (m as any).agreementId === ag.id;
        const matchesUnit = cleanUnitStr(m.unit) === cleanU;
        const matchesProp = !m.propertyId || !ag.propertyId || m.propertyId === ag.propertyId;
        if (!matchesUnit || !matchesProp) return false;
        if (ag.status === 'terminated') return true;
        const moTime = new Date((m as any).settledAt || (m as any).refundDate || (m as any).updatedAt || m.moveOutDate || (m as any).createdAt || 0).getTime();
        const agTime = new Date(ag.createdAt || ag.start || 0).getTime();
        if (agTime > 0 && moTime > 0 && agTime > moTime) return false;
        return false;
      });

      const settle = mySettlements.find((s) => {
        if (s.agreementId) return s.agreementId === ag.id;
        const matchesUnit = cleanUnitStr(s.unit) === cleanU;
        const matchesProp = !s.propertyId || !ag.propertyId || s.propertyId === ag.propertyId;
        if (!matchesUnit || !matchesProp) return false;
        if (ag.status === 'terminated') return true;
        const sTime = new Date(s.disbursedAt || (s as any).updatedAt || s.createdAt || 0).getTime();
        const agTime = new Date(ag.createdAt || ag.start || 0).getTime();
        if (agTime > 0 && sTime > 0 && agTime > sTime) return false;
        return false;
      });

      const prop = state.properties.find((p) => p.id === ag.propertyId);
      const propName = prop?.name || depInv?.propertyName || tenantRecord?.propertyName || 'Rental Property';
      const agUnit = state.units.find(
        (u) => (u.unitNumber === ag.unit || u.id === ag.unit) && (!ag.propertyId || u.propertyId === ag.propertyId)
      );
      const currency = getCurrencySymbol(ag.currency || agUnit?.currency || prop?.currency || depInv?.currency || tenantRecord?.currency) || DEFAULT_CURRENCY_SYMBOL;
      const amount = ag.deposit || depInv?.total || depInv?.amount || tenantRecord?.deposit || agUnit?.deposit || 0;

      let status: 'paid' | 'due' | 'pending_confirmation' | 'refund_scheduled' | 'refund_completed' = 'due';
      let statusCategory: 'all' | 'paid' | 'due' | 'refunded' = 'due';
      let statusBadgeText = 'Deposit Due';
      let statusBg = '#EFF6FF';
      let statusColor = '#1D4ED8';

      const isAgTerminatedOrVacated =
        ag.status === 'terminated' ||
        ag.depositStatus === 'refunded' ||
        Boolean(mo && (mo.status === 'refund_completed' || (mo as any).tenantConfirmedReceipt)) ||
        Boolean(settle && (settle.status === 'refunded' || settle.tenantConfirmedReceipt));

      if (isAgTerminatedOrVacated) {
        if (settle && !settle.tenantConfirmedReceipt && !((mo as any)?.tenantConfirmedReceipt) && settle.status !== 'refunded') {
          status = 'refund_scheduled';
          statusCategory = 'refunded';
          statusBadgeText = '⚡ Disbursed (Confirm Receipt)';
          statusBg = '#FEF3C7';
          statusColor = '#B45309';
        } else {
          status = 'refund_completed';
          statusCategory = 'refunded';
          statusBadgeText = '✓ Settled & Refunded';
          statusBg = '#F3E8FF';
          statusColor = '#7E22CE';
        }
      } else if (ag.status === 'active' || ag.depositStatus === 'paid' || depInv?.status === 'paid') {
        status = 'paid';
        statusCategory = 'paid';
        statusBadgeText = '✓ Paid & Secured';
        statusBg = '#DCFCE7';
        statusColor = '#15803D';
      } else if (depInv?.status === 'pending_confirmation') {
        status = 'pending_confirmation';
        statusCategory = 'due';
        statusBadgeText = 'Awaiting Confirmation';
        statusBg = '#FEF3C7';
        statusColor = '#B45309';
      }

      const isLeaseApproved = ag.status === 'pending_deposit' || ag.status === 'active';
      if (!isLeaseApproved && !isAgTerminatedOrVacated && status === 'due') {
        statusBadgeText = 'Awaiting Lease Approval';
        statusBg = '#FEF3C7';
        statusColor = '#B45309';
      }

      list.push({
        id: `dep_ag_${ag.id}`,
        reference: `#DEP-${ag.unit}`,
        unit: ag.unit,
        propertyName: propName,
        propertyId: ag.propertyId,
        ownerName: ag.ownerName || tenantRecord?.owner || 'Property Owner',
        ownerId: ag.ownerId,
        amount,
        currency,
        status,
        statusCategory,
        statusBadgeText,
        statusBg,
        statusColor,
        isLeaseApproved,
        paidAt: depInv?.paidAt || (ag.depositStatus === 'paid' ? (ag.approvedAt || ag.counterSignedAt) : undefined),
        dueDate: depInv?.due,
        depositInvoice: depInv,
        agreement: ag,
        moveOut: mo,
        settlement: settle,
      });
    });

    // 2. Map remaining deposit invoices
    myDepositInvoices.forEach((depInv) => {
      if (mappedInvoiceIds.has(depInv.id)) return;
      mappedInvoiceIds.add(depInv.id);

      const cleanU = cleanUnitStr(depInv.unit);
      const tenancyKey = `${depInv.propertyId || ''}_${depInv.unit || ''}`.toLowerCase();
      if (seenUnits.has(cleanU) || seenTenancyKeys.has(tenancyKey)) return;
      seenUnits.add(cleanU);
      seenTenancyKeys.add(tenancyKey);

      const mo = myMoveOuts.find(
        (m) =>
          m.unit === depInv.unit &&
          (!((m as any).propertyId) || !depInv.propertyId || (m as any).propertyId === depInv.propertyId)
      );

      const settle = mySettlements.find(
        (s) =>
          (s.agreementId && depInv.leaseAgreementId === s.agreementId) ||
          (s.unit === depInv.unit && (!s.propertyId || !depInv.propertyId || s.propertyId === depInv.propertyId))
      );

      const prop = state.properties.find((p) => p.id === depInv.propertyId);
      const propName = prop?.name || depInv.propertyName || 'Rental Property';
      const depUnit = state.units.find(
        (u) => (u.unitNumber === depInv.unit || u.id === depInv.unit) && (!depInv.propertyId || u.propertyId === depInv.propertyId)
      );
      const currency = getCurrencySymbol(depInv.currency || depUnit?.currency || prop?.currency || tenantRecord?.currency) || DEFAULT_CURRENCY_SYMBOL;
      const amount = depInv.total || depInv.amount || depUnit?.deposit || 0;

      let status: 'paid' | 'due' | 'pending_confirmation' | 'refund_scheduled' | 'refund_completed' = 'due';
      let statusCategory: 'all' | 'paid' | 'due' | 'refunded' = 'due';
      let statusBadgeText = 'Deposit Due';
      let statusBg = '#EFF6FF';
      let statusColor = '#1D4ED8';

      if (mo) {
        if (settle?.status === 'awaiting_tenant_approval') {
          status = 'refund_scheduled';
          statusCategory = 'refunded';
          statusBadgeText = '⚠️ Action: Review Deductions';
          statusBg = '#FEF3C7';
          statusColor = '#B45309';
        } else if (settle?.status === 'rejected' || settle?.status === 'contested') {
          status = 'refund_scheduled';
          statusCategory = 'refunded';
          statusBadgeText = '❌ Deductions Rejected';
          statusBg = '#FEE2E2';
          statusColor = '#DC2626';
        } else if (settle?.status === 'refunded' || mo.status === 'refund_completed') {
          if (settle && !settle.tenantConfirmedReceipt && !((mo as any).tenantConfirmedReceipt)) {
            status = 'refund_scheduled';
            statusCategory = 'refunded';
            statusBadgeText = '⚡ Disbursed (Confirm Receipt)';
            statusBg = '#FEF3C7';
            statusColor = '#B45309';
          } else {
            status = 'refund_completed';
            statusCategory = 'refunded';
            statusBadgeText = '✓ Settled & Refunded';
            statusBg = '#F3E8FF';
            statusColor = '#7E22CE';
          }
        }
      } else if (depInv.status === 'paid') {
        status = 'paid';
        statusCategory = 'paid';
        statusBadgeText = '✓ Paid & Secured';
        statusBg = '#DCFCE7';
        statusColor = '#15803D';
      }

      const matchingAg = state.agreements.find(
        (a) => a.id === depInv.leaseAgreementId || (a.unit === depInv.unit && (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)))
      );
      const isLeaseApproved = !matchingAg || matchingAg.status === 'pending_deposit' || matchingAg.status === 'active';
      if (!isLeaseApproved && !mo && depInv.status !== 'paid' && status === 'due') {
        statusBadgeText = 'Awaiting Lease Approval';
        statusBg = '#FEF3C7';
        statusColor = '#B45309';
      }

      list.push({
        id: `dep_inv_${depInv.id}`,
        reference: `#${depInv.id}`,
        unit: depInv.unit || '—',
        propertyName: propName,
        propertyId: depInv.propertyId,
        ownerName: depInv.issuerName || tenantRecord?.owner || 'Property Owner',
        ownerId: depInv.ownerId,
        amount,
        currency,
        status,
        statusCategory,
        statusBadgeText,
        statusBg,
        statusColor,
        isLeaseApproved,
        paidAt: depInv.paidAt,
        dueDate: depInv.due,
        depositInvoice: depInv,
        moveOut: mo,
        settlement: settle,
      });
    });

    // 3. Map any remaining settlements not yet included
    mySettlements.forEach((s) => {
      const settleAmt = s.grossDepositHeld || (s as any).depositTotal || 0;
      if (settleAmt <= 0) return;
      const sClean = cleanUnitStr(s.unit);
      if (seenUnits.has(sClean)) return;
      const alreadyIncluded = list.some((item) => item.settlement?.id === s.id);
      if (!alreadyIncluded) {
        list.push({
          id: `dep_settle_${s.id}`,
          reference: `#SETTLE-${s.unit}`,
          unit: s.unit || '—',
          propertyName: s.propertyName || 'Rental Property',
          propertyId: s.propertyId,
          ownerName: 'Property Landlord',
          ownerId: s.ownerId,
          amount: s.grossDepositHeld || (s as any).depositTotal || 0,
          currency: getCurrencySymbol(s.currency) || DEFAULT_CURRENCY_SYMBOL,
          status: s.status === 'refunded' ? 'refund_completed' : 'refund_scheduled',
          statusCategory: 'refunded',
          statusBadgeText:
            s.status === 'awaiting_tenant_approval'
              ? '⚠️ Action: Review Deductions'
              : s.status === 'rejected' || s.status === 'contested'
              ? '❌ Deductions Rejected'
              : s.status === 'approved'
              ? 'Refund Scheduled'
              : s.status === 'refunded'
              ? (!s.tenantConfirmedReceipt
                  ? '⚡ Disbursed (Confirm Receipt)'
                  : '✓ Settled & Refunded')
              : 'Settlement Pending',
          statusBg:
            s.status === 'awaiting_tenant_approval'
              ? '#FEF3C7'
              : s.status === 'rejected' || s.status === 'contested'
              ? '#FEE2E2'
              : s.status === 'refunded'
              ? (!s.tenantConfirmedReceipt ? '#FEF3C7' : '#DCFCE7')
              : '#EFF6FF',
          statusColor:
            s.status === 'awaiting_tenant_approval'
              ? '#B45309'
              : s.status === 'rejected' || s.status === 'contested'
              ? '#DC2626'
              : s.status === 'refunded'
              ? (!s.tenantConfirmedReceipt ? '#B45309' : '#15803D')
              : '#0369A1',
          settlement: s,
        });
      }
    });

    return list;
  }, [myAgreements, myDepositInvoices, myMoveOuts, mySettlements, state.properties, state.units, tenantRecord]);

  const pendingDepositRecord = useMemo(() => {
    return (
      unifiedDepositRecords.find(
        (r) => r.status === 'due' || (r.statusCategory === 'due' && r.status !== 'paid')
      ) || null
    );
  }, [unifiedDepositRecords]);

  const isAgreementVacated = (a: Agreement) => {
    if (a.status === 'terminated') return true;
    const hasRefundedMoveout = (state.moveouts || []).some((m) => {
      const isDone = m.status === 'refund_completed' || Boolean((m as any).tenantConfirmedReceipt);
      if (!isDone) return false;
      const matchesTenant = m.tenantId === user?.id || (tenantEmail && (m.tenant?.toLowerCase() === tenantEmail || (m as any).tenantEmail?.toLowerCase() === tenantEmail));
      if (!matchesTenant) return false;
      if ((m as any).agreementId) return (m as any).agreementId === a.id;
      const matchesUnit = cleanUnitStr(m.unit) === cleanUnitStr(a.unit);
      const matchesProp = !m.propertyId || !a.propertyId || m.propertyId === a.propertyId;
      if (!matchesUnit || !matchesProp) return false;
      const moTime = new Date((m as any).settledAt || (m as any).refundDate || (m as any).updatedAt || m.moveOutDate || (m as any).createdAt || 0).getTime();
      const agTime = new Date(a.createdAt || a.start || 0).getTime();
      if (agTime > 0 && moTime > 0 && agTime > moTime) return false;
      return a.status === 'terminated';
    });

    const hasRefundedSettlement = (state.depositSettlements || []).some((s) => {
      const isDone = s.status === 'refunded' || Boolean(s.tenantConfirmedReceipt);
      if (!isDone) return false;
      const matchesTenant = s.tenantId === user?.id || (tenantEmail && s.tenantEmail?.toLowerCase() === tenantEmail);
      if (!matchesTenant) return false;
      if (s.agreementId) return s.agreementId === a.id;
      const matchesUnit = cleanUnitStr(s.unit) === cleanUnitStr(a.unit);
      const matchesProp = !s.propertyId || !a.propertyId || s.propertyId === a.propertyId;
      if (!matchesUnit || !matchesProp) return false;
      const sTime = new Date(s.disbursedAt || (s as any).updatedAt || s.createdAt || 0).getTime();
      const agTime = new Date(a.createdAt || a.start || 0).getTime();
      if (agTime > 0 && sTime > 0 && agTime > sTime) return false;
      return a.status === 'terminated';
    });

    return hasRefundedMoveout || hasRefundedSettlement;
  };

  const hasPendingInviteForMe = (state.tenancyRequests || []).some(
    (r) =>
      r.status === 'pending' &&
      (r.tenantId === user?.id || (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail))
  );

  const activeAgreements = myAgreements.filter((a) => {
    if (a.status === 'terminated' || (a.status as string) === 'cancelled') return false;
    if (isAgreementVacated(a)) return false;

    // Check if there is an unaccepted/pending invitation for this agreement/unit
    const hasPendingInvite = (state.tenancyRequests || []).some(
      (r) =>
        r.status === 'pending' &&
        (cleanUnitStr(r.unitNumber) === cleanUnitStr(a.unit) || r.unitId === a.unit) &&
        (r.tenantId === user?.id || (tenantEmail && r.tenantEmail?.toLowerCase() === tenantEmail))
    );
    if (hasPendingInvite) return false;

    // Strictly active leases with confirmed deposit
    return a.status === 'active' && a.depositStatus === 'paid';
  });

  const hasSettledMoveout = (
    (state.moveouts || []).some(
      (m) =>
        (m.status === 'refund_completed' || m.tenantConfirmedReceipt) &&
        (m.tenantId === user?.id || (tenantEmail && (m.tenant?.toLowerCase() === tenantEmail || (m as any).tenantEmail?.toLowerCase() === tenantEmail)))
    ) ||
    (state.depositSettlements || []).some(
      (s) =>
        (s.status === 'refunded' || s.tenantConfirmedReceipt) &&
        (s.tenantId === user?.id || (tenantEmail && s.tenantEmail?.toLowerCase() === tenantEmail))
    )
  );

  const isResidentFullyVacated = (hasSettledMoveout || hasPendingInviteForMe) && activeAgreements.length === 0;

  const effectiveAgreements: Agreement[] = activeAgreements;

  const targetAgreement =
    selectedResidenceId !== 'all'
      ? effectiveAgreements.find((a) => a.id === selectedResidenceId) || null
      : null;

  const activeAgreement = targetAgreement || effectiveAgreements[0] || null;

  const resolvedMonthlyRent = targetAgreement
    ? (targetAgreement.rent || 0)
    : effectiveAgreements.reduce((sum, a) => sum + (a.rent || 0), 0) || (tenantRecord?.rent || 0);

  const fallbackAgreement = activeAgreement || myAgreements[0] || null;
  const currentProperty = state.properties.find(
    (p) => p.id === activeAgreement?.propertyId || p.id === fallbackAgreement?.propertyId || p.id === tenantRecord?.propertyId
  );
  const currentUnit = state.units.find(
    (u) =>
      (activeAgreement?.unit && (u.unitNumber === activeAgreement.unit || u.id === activeAgreement.unit)) ||
      (fallbackAgreement?.unit && (u.unitNumber === fallbackAgreement.unit || u.id === fallbackAgreement.unit)) ||
      (resolvedUnit && (u.unitNumber === resolvedUnit || u.id === resolvedUnit))
  );
  const resolvedCurrency =
    getCurrencySymbol(
      activeAgreement?.currency ||
      fallbackAgreement?.currency ||
      currentUnit?.currency ||
      currentProperty?.currency ||
      tenantRecord?.currency
    ) || DEFAULT_CURRENCY_SYMBOL;

  const getInvoiceCurrencySymbol = (inv: Invoice) => {
    if (inv.currency) return getCurrencySymbol(inv.currency);
    const matchingAg = state.agreements.find(
      (a) => a.id === inv.leaseAgreementId || (a.unit === inv.unit && (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)))
    );
    const matchingUnit = state.units.find(
      (u) => (u.unitNumber === inv.unit || u.id === inv.unit) && (!inv.propertyId || u.propertyId === inv.propertyId)
    );
    const matchingProp = state.properties.find(
      (p) => p.id === inv.propertyId || p.id === matchingAg?.propertyId || p.id === matchingUnit?.propertyId
    );
    return getCurrencySymbol(matchingAg?.currency || matchingUnit?.currency || matchingProp?.currency) || resolvedCurrency;
  };

  const [isTenantAutopayModalOpen, setIsTenantAutopayModalOpen] = useState(false);
  const [selectedTenantGateway, setSelectedTenantGateway] = useState<'stripe' | 'razorpay' | 'easebuzz' | 'paypal'>('razorpay');
  const [mandateCardName, setMandateCardName] = useState(user?.displayName || 'Resident');
  const [mandateCardNumber, setMandateCardNumber] = useState('');
  const [mandateCardExpiry, setMandateCardExpiry] = useState('');
  const [mandateCardCvv, setMandateCardCvv] = useState('');
  const [mandateRzpSubMode, setMandateRzpSubMode] = useState<'upi' | 'card'>('upi');
  const [mandateUpiId, setMandateUpiId] = useState('');
  const [mandateBankName, setMandateBankName] = useState('HDFC Bank');
  const [mandateAccountNum, setMandateAccountNum] = useState('');
  const [mandateIfsc, setMandateIfsc] = useState('');
  const [mandatePaypalEmail, setMandatePaypalEmail] = useState(user?.email || '');
  const [mandateConsentChecked, setMandateConsentChecked] = useState(true);

  const availableTenantGateways = useMemo(() => {
    const list: Array<{
      key: 'stripe' | 'razorpay' | 'paypal' | 'easebuzz';
      name: string;
      shortTitle: string;
      icon: string;
      description: string;
    }> = [];
    const g = state.platformGateways;
    if (g?.razorpay?.enabled !== false) {
      list.push({
        key: 'razorpay',
        name: 'Razorpay',
        shortTitle: 'Razorpay',
        icon: '',
        description: 'Instant automated recurring debits via UPI (GPay, PhonePe, Paytm) or Cards',
      });
    }
    if (g?.stripe?.enabled !== false) {
      list.push({
        key: 'stripe',
        name: 'Credit / Debit Card',
        shortTitle: 'Credit / Debit Card',
        icon: '',
        description: 'Global Visa / MasterCard / Amex recurring auto-debit',
      });
    }
    if (g?.easebuzz?.enabled !== false) {
      list.push({
        key: 'easebuzz',
        name: 'Easebuzz',
        shortTitle: 'Easebuzz',
        icon: '',
        description: 'Domestic recurring settlement via e-Mandate and NetBanking',
      });
    }
    if (g?.paypal?.enabled !== false) {
      list.push({
        key: 'paypal',
        name: 'PayPal',
        shortTitle: 'PayPal',
        icon: '',
        description: 'Automated recurring billing via PayPal',
      });
    }
    return list;
  }, [state.platformGateways]);

  const handleToggleTenantAutopay = async () => {
    if (!activeAgreement) return;
    const isCurrentlyActive = Boolean(activeAgreement.autopay?.status === 'active');
    if (isCurrentlyActive) {
      await cancelAgreementAutopay(activeAgreement.id);
      showToast('Rent Autopay disabled. You can pay your rent manually each month.');
    } else {
      const activeGw = (activeAgreement.autopay?.activeGateway || (availableTenantGateways[0]?.key || 'razorpay')) as any;
      const rentAmount = Number(activeAgreement.rent) || 0;
      const dueDay = activeAgreement.rentDueDay || 1;
      const nextDate = new Date();
      nextDate.setDate(dueDay);
      if (nextDate.getTime() <= Date.now()) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      await updateAgreementAutopay(activeAgreement.id, {
        activeGateway: activeGw,
        mandateId: activeAgreement.autopay?.mandateId || `mandate_rent_${activeAgreement.id.slice(-6)}_${Date.now()}`,
        status: 'active',
        optedInAt: new Date().toISOString(),
        paymentMethodDisplay: `${activeGw.toUpperCase()} AutoPay`,
        rentAmount,
        currency: activeAgreement.currency || 'INR',
        rentDueDay: dueDay,
        nextDebitDate: nextDate.toISOString().split('T')[0],
        advanceNoticeSent: false,
        failureCount: 0,
        updatedAt: new Date().toISOString(),
      });
      showToast(`✓ Rent Autopay activated via ${activeGw.toUpperCase()}! Advance notice will be sent 48 hours before each debit.`);
    }
  };

  const handleLaunchLiveStripeMandate = async () => {
    if (!activeAgreement) return;
    if (!mandateConsentChecked) {
      showToast('⚠️ Please check the e-Mandate authorization checkbox to proceed.');
      return;
    }
    const m = state.platformGateways;
    const stripePub = m.stripe?.pubKey || '';
    setIsProcessing(true);
    await launchStripeRecurringMandate({
      publishableKey: stripePub,
      customerName: tenantName,
      customerEmail: user?.email || tenantEmail,
      role: 'tenant',
      entityId: activeAgreement.id,
      ownerId: activeAgreement.ownerId || resolvedOwnerId,
      onSuccess: async (res) => {
        setIsProcessing(false);
        const rentAmount = Number(activeAgreement.rent) || 0;
        const dueDay = activeAgreement.rentDueDay || 1;
        const nextDate = new Date();
        nextDate.setDate(dueDay);
        if (nextDate.getTime() <= Date.now()) {
          nextDate.setMonth(nextDate.getMonth() + 1);
        }
        await updateAgreementAutopay(activeAgreement.id, {
          activeGateway: 'stripe',
          mandateId: res.paymentMethodId,
          mandateToken: res.paymentMethodId,
          customerId: res.customerId,
          status: 'active',
          paymentMethodDisplay: res.displayDetails,
          displayDetails: res.displayDetails,
          rentAmount,
          currency: activeAgreement.currency || 'INR',
          rentDueDay: dueDay,
          nextDebitDate: nextDate.toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
        });
        showToast(`✓ Stripe card mandate verified with issuing bank! ${res.displayDetails}`);
        setIsTenantAutopayModalOpen(false);
      },
      onError: (err) => {
        setIsProcessing(false);
        showToast(err);
      },
    });
  };

  const handleLaunchLiveRazorpayMandate = async () => {
    if (!activeAgreement) return;
    if (!mandateConsentChecked) {
      showToast('⚠️ Please check the e-Mandate authorization checkbox to proceed.');
      return;
    }
    const m = state.platformGateways;
    const rzpKey = m.razorpay?.keyId || '';
    setIsProcessing(true);
    await launchRazorpayRecurringMandate({
      keyId: rzpKey,
      customerName: tenantName,
      customerEmail: user?.email || tenantEmail,
      customerPhone: user?.phone || '',
      role: 'tenant',
      entityId: activeAgreement.id,
      ownerId: activeAgreement.ownerId || resolvedOwnerId,
      maxCap: (Number(activeAgreement.rent) || 0) * 2 || 50000,
      onSuccess: async (res) => {
        setIsProcessing(false);
        const rentAmount = Number(activeAgreement.rent) || 0;
        const dueDay = activeAgreement.rentDueDay || 1;
        const nextDate = new Date();
        nextDate.setDate(dueDay);
        if (nextDate.getTime() <= Date.now()) {
          nextDate.setMonth(nextDate.getMonth() + 1);
        }
        await updateAgreementAutopay(activeAgreement.id, {
          activeGateway: 'razorpay',
          mandateId: res.mandateToken,
          mandateToken: res.mandateToken,
          status: 'active',
          paymentMethodDisplay: res.displayDetails,
          displayDetails: res.displayDetails,
          rentAmount,
          currency: activeAgreement.currency || 'INR',
          rentDueDay: dueDay,
          nextDebitDate: nextDate.toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
        });
        showToast(`✓ Razorpay mandate authorized via UPI PIN / 3DS! ${res.displayDetails}`);
        setIsTenantAutopayModalOpen(false);
      },
      onError: (err) => {
        setIsProcessing(false);
        showToast(err);
      },
    });
  };

  const handleLaunchLivePayPalMandate = async () => {
    if (!activeAgreement) return;
    if (!mandateConsentChecked) {
      showToast('⚠️ Please check the e-Mandate authorization checkbox to proceed.');
      return;
    }
    const m = state.platformGateways;
    const clientId = m.paypal?.clientId || '';
    setIsProcessing(true);
    await launchPayPalRecurringMandate({
      clientId,
      customerName: tenantName,
      customerEmail: user?.email || tenantEmail,
      role: 'tenant',
      entityId: activeAgreement.id,
      ownerId: activeAgreement.ownerId || resolvedOwnerId,
      onSuccess: async (res) => {
        setIsProcessing(false);
        const rentAmount = Number(activeAgreement.rent) || 0;
        const dueDay = activeAgreement.rentDueDay || 1;
        const nextDate = new Date();
        nextDate.setDate(dueDay);
        if (nextDate.getTime() <= Date.now()) {
          nextDate.setMonth(nextDate.getMonth() + 1);
        }
        await updateAgreementAutopay(activeAgreement.id, {
          activeGateway: 'paypal',
          mandateId: res.mandateToken,
          mandateToken: res.mandateToken,
          status: 'active',
          paymentMethodDisplay: res.displayDetails,
          displayDetails: res.displayDetails,
          rentAmount,
          currency: activeAgreement.currency || 'USD',
          rentDueDay: dueDay,
          nextDebitDate: nextDate.toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
        });
        showToast(`✓ PayPal Vault recurring mandate authorized! ${res.displayDetails}`);
        setIsTenantAutopayModalOpen(false);
      },
      onError: (err) => {
        setIsProcessing(false);
        showToast(err);
      },
    });
  };

  const handleLaunchLiveEasebuzzMandate = async () => {
    if (!activeAgreement) return;
    if (!mandateConsentChecked) {
      showToast('⚠️ Please check the e-Mandate authorization checkbox to proceed.');
      return;
    }
    const m = state.platformGateways;
    const merchantKey = m.easebuzz?.merchantKey || '';
    setIsProcessing(true);
    await launchEasebuzzRecurringMandate({
      merchantKey,
      customerName: tenantName,
      customerEmail: user?.email || tenantEmail,
      customerPhone: user?.phone || '',
      role: 'tenant',
      entityId: activeAgreement.id,
      ownerId: activeAgreement.ownerId || resolvedOwnerId,
      bankName: mandateBankName,
      accountNum: mandateAccountNum,
      onSuccess: async (res) => {
        setIsProcessing(false);
        const rentAmount = Number(activeAgreement.rent) || 0;
        const dueDay = activeAgreement.rentDueDay || 1;
        const nextDate = new Date();
        nextDate.setDate(dueDay);
        if (nextDate.getTime() <= Date.now()) {
          nextDate.setMonth(nextDate.getMonth() + 1);
        }
        await updateAgreementAutopay(activeAgreement.id, {
          activeGateway: 'easebuzz',
          mandateId: res.mandateToken,
          mandateToken: res.mandateToken,
          status: 'active',
          paymentMethodDisplay: res.displayDetails,
          displayDetails: res.displayDetails,
          rentAmount,
          currency: activeAgreement.currency || 'INR',
          rentDueDay: dueDay,
          nextDebitDate: nextDate.toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
        });
        showToast(`✓ Easebuzz e-NACH mandate verified with bank! ${res.displayDetails}`);
        setIsTenantAutopayModalOpen(false);
      },
      onError: (err) => {
        setIsProcessing(false);
        showToast(err);
      },
    });
  };

  const handleSwitchTenantGateway = async (newGateway: 'stripe' | 'razorpay' | 'easebuzz' | 'paypal') => {
    if (!activeAgreement) return;

    if (!mandateConsentChecked) {
      showToast('⚠️ Please check the e-Mandate authorization checkbox to authorize recurring debits.');
      return;
    }

    let displayDetails = `${newGateway.toUpperCase()} AutoPay`;
    let token = `mandate_${newGateway}_${Date.now()}`;
    const cleanCard = mandateCardNumber.replace(/\s+/g, '');

    if (newGateway === 'stripe') {
      if (!cleanCard || cleanCard.length < 15) {
        showToast('⚠️ Please enter a valid 16-digit card number.');
        return;
      }
      if (!mandateCardExpiry || !mandateCardExpiry.includes('/')) {
        showToast('⚠️ Please enter card expiry in MM/YY format.');
        return;
      }
      if (!mandateCardCvv || mandateCardCvv.length < 3) {
        showToast('⚠️ Please enter a valid 3-digit CVV/CVC.');
        return;
      }
      const last4 = cleanCard.slice(-4);
      const brand = cleanCard.startsWith('4') ? 'Visa' : cleanCard.startsWith('5') ? 'Mastercard' : 'Card';
      displayDetails = `${brand} ending in •••• ${last4}`;
      token = `pm_stripe_${last4}_${Date.now()}`;
    } else if (newGateway === 'razorpay') {
      if (mandateRzpSubMode === 'upi') {
        if (!mandateUpiId || !mandateUpiId.includes('@')) {
          showToast('⚠️ Please enter a valid UPI ID (e.g. yourname@okhdfcbank).');
          return;
        }
        displayDetails = `UPI AutoPay (${mandateUpiId.trim()})`;
        token = `rzp_upi_${mandateUpiId.split('@')[0]}_${Date.now()}`;
      } else {
        if (!cleanCard || cleanCard.length < 15) {
          showToast('⚠️ Please enter a valid card number.');
          return;
        }
        const last4 = cleanCard.slice(-4);
        displayDetails = `RuPay/Debit ending in •••• ${last4}`;
        token = `rzp_card_${last4}_${Date.now()}`;
      }
    } else if (newGateway === 'easebuzz') {
      if (!mandateAccountNum || mandateAccountNum.length < 6) {
        showToast('⚠️ Please enter your valid bank account number.');
        return;
      }
      const last4 = mandateAccountNum.slice(-4);
      displayDetails = `e-NACH (${mandateBankName} •••• ${last4})`;
      token = `eb_nach_${last4}_${Date.now()}`;
    } else if (newGateway === 'paypal') {
      if (!mandatePaypalEmail || !mandatePaypalEmail.includes('@')) {
        showToast('⚠️ Please enter your PayPal billing email address.');
        return;
      }
      displayDetails = `PayPal (${mandatePaypalEmail.trim()})`;
      token = `B-${Date.now().toString(36).toUpperCase()}`;
    }

    setIsProcessing(true);
    try {
      const rentAmount = Number(activeAgreement.rent) || 0;
      const dueDay = activeAgreement.rentDueDay || 1;
      const nextDate = new Date();
      nextDate.setDate(dueDay);
      if (nextDate.getTime() <= Date.now()) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      await updateAgreementAutopay(activeAgreement.id, {
        activeGateway: newGateway,
        mandateId: token,
        mandateToken: token,
        status: 'active',
        paymentMethodDisplay: displayDetails,
        displayDetails,
        rentAmount,
        currency: activeAgreement.currency || 'INR',
        rentDueDay: dueDay,
        nextDebitDate: nextDate.toISOString().split('T')[0],
        updatedAt: new Date().toISOString(),
      });
      showToast(`✓ Payment method switched to ${displayDetails}! Previous mandate cancelled with zero double-billing.`);
      setIsTenantAutopayModalOpen(false);
    } catch (err: any) {
      showToast(`Failed to update autopay method: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const isInvoiceForVacatedTenancy = (inv: Invoice) => {
    if (inv.status === 'paid') return false;
    const hasActiveAgreementForInv = effectiveAgreements.some(
      (a) =>
        (a.id === inv.leaseAgreementId || ((a.unit === inv.unit || a.id === inv.unit) && (!inv.propertyId || !a.propertyId || a.propertyId === inv.propertyId))) &&
        a.status !== 'terminated'
    ) || (state.agreements || []).some(
      (a) =>
        (a.id === inv.leaseAgreementId ||
          (((a.unit === inv.unit || a.id === inv.unit) && (!inv.propertyId || !a.propertyId || a.propertyId === inv.propertyId)) &&
            (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)))) &&
        a.status !== 'terminated'
    );
    if (hasActiveAgreementForInv) return false;

    return (
      (state.moveouts || []).some(
        (m) =>
          m.status === 'refund_completed' &&
          ((m as any).agreementId === inv.leaseAgreementId || (!inv.leaseAgreementId && (m.unit === inv.unit || (m as any).unitId === inv.unit))) &&
          (!inv.propertyId || !((m as any).propertyId) || (m as any).propertyId === inv.propertyId) &&
          (m.tenantId === user?.id || (tenantEmail && (m.tenant?.toLowerCase() === tenantEmail || (m as any).tenantEmail?.toLowerCase() === tenantEmail)))
      ) ||
      (state.depositSettlements || []).some(
        (s) =>
          s.status === 'refunded' &&
          (s.agreementId === inv.leaseAgreementId || (!inv.leaseAgreementId && s.unit === inv.unit)) &&
          (!inv.propertyId || !s.propertyId || s.propertyId === inv.propertyId) &&
          (s.tenantId === user?.id || (tenantEmail && s.tenantEmail?.toLowerCase() === tenantEmail))
      )
    );
  };

  const myTenantInvoices = state.invoices.filter((inv) => {
    if (user?.id && inv.tenantId === user.id) return true;
    if (tenantRecord?.id && inv.tenantId === tenantRecord.id) return true;
    if (tenantEmail && (inv.tenantEmail?.toLowerCase() === tenantEmail || inv.tenant?.toLowerCase() === tenantEmail)) return true;
    if (hasAssignedUnit && inv.unit === resolvedUnit && inv.tenantId === user?.id) return true;
    return false;
  });

  const rentSchedule: RentScheduleResult = useMemo(() => {
    if (targetAgreement) {
      return buildRentSchedule(
        targetAgreement,
        state.properties,
        state.invoices,
        myPayments,
        undefined,
        state.ownerSettings,
        isResidentFullyVacated
      );
    }

    if (effectiveAgreements.length === 0) {
      return buildRentSchedule(
        null,
        state.properties,
        state.invoices,
        myPayments,
        null,
        state.ownerSettings,
        true
      );
    }

    if (effectiveAgreements.length === 1) {
      return buildRentSchedule(
        effectiveAgreements[0],
        state.properties,
        state.invoices,
        myPayments,
        tenantRecord,
        state.ownerSettings,
        isResidentFullyVacated
      );
    }

    // Multi-property aggregation: compile all cycles across all active residences
    const combinedUpcoming: RentCycleItem[] = [];
    const combinedHistory: RentCycleItem[] = [];
    let totalCycles = 0;
    let paidCycles = 0;
    let pendingCycles = 0;

    effectiveAgreements.forEach((ag) => {
      const res = buildRentSchedule(
        ag,
        state.properties,
        state.invoices,
        myPayments,
        undefined,
        state.ownerSettings,
        false
      );
      combinedUpcoming.push(...res.upcomingDues);
      combinedHistory.push(...res.historyDues);
      totalCycles += res.totalCyclesCount;
      paidCycles += res.paidCyclesCount;
      pendingCycles += res.pendingCyclesCount;
    });

    const statusPriority = (s: string) => {
      if (s === 'overdue') return 1;
      if (s === 'due_now') return 2;
      if (s === 'due_soon') return 3;
      if (s === 'pending_confirmation') return 4;
      return 5;
    };

    combinedUpcoming.sort((a, b) => {
      const pDiff = statusPriority(a.status) - statusPriority(b.status);
      if (pDiff !== 0) return pDiff;
      return a.dueDate.localeCompare(b.dueDate);
    });

    combinedHistory.sort((a, b) => (b.paidAt || b.dueDate).localeCompare(a.paidAt || a.dueDate));

    const currentDue = combinedUpcoming.length > 0 ? combinedUpcoming[0] : null;

    return {
      currentDueItem: currentDue,
      upcomingDues: combinedUpcoming,
      historyDues: combinedHistory,
      totalCyclesCount: totalCycles,
      paidCyclesCount: paidCycles,
      pendingCyclesCount: pendingCycles,
    };
  }, [
    targetAgreement,
    effectiveAgreements,
    state.properties,
    state.invoices,
    myPayments,
    tenantRecord,
    state.ownerSettings,
    isResidentFullyVacated,
  ]);

  const { currentDueItem, upcomingDues, historyDues } = rentSchedule;

  const currentDueAgreement = useMemo(() => {
    if (!currentDueItem) return effectiveAgreements[0] || null;
    return (
      effectiveAgreements.find(
        (a) =>
          (currentDueItem.propertyId && a.propertyId === currentDueItem.propertyId && a.unit === currentDueItem.unitNumber) ||
          (a.unit === currentDueItem.unitNumber && (!currentDueItem.propertyId || !a.propertyId || a.propertyId === currentDueItem.propertyId)) ||
          (currentDueItem.propertyId && a.propertyId === currentDueItem.propertyId)
      ) || effectiveAgreements[0] || null
    );
  }, [currentDueItem, effectiveAgreements]);

  const m = (resolvedOwnerId && state.ownerSettings[resolvedOwnerId]?.paymentMethods) || state.ownerPaymentMethods || {};

  // Dynamically resolve all available payment gateways configured by the landlord
  const availableGateways = useMemo(() => {
    const list: Array<{
      key: 'razorpay' | 'stripe' | 'paypal' | 'easebuzz' | 'upi' | 'bank' | 'cash';
      name: string;
      shortTitle: string;
      icon: string;
      badge: string;
      badgeClass: string;
      subtitle: string;
      isDefault: boolean;
    }> = [];

    // 0. Easebuzz (Full live production gateway)
    const isEbOwner = m.easebuzz?.enabled !== false && m.easebuzz?.merchantKey;
    const isEbPlatform = state.platformGateways.easebuzz?.enabled !== false && state.platformGateways.easebuzz?.merchantKey;
    if (isEbOwner || isEbPlatform || m.easebuzz?.enabled) {
      list.push({
        key: 'easebuzz',
        name: 'Easebuzz (UPI, Cards, 50+ Banks Netbanking)',
        shortTitle: 'Easebuzz',
        icon: '⚡',
        badge: 'Live Production',
        badgeClass: 'green',
        subtitle: 'UPI, Netbanking & Cards',
        isDefault: false,
      });
    }

    // 1. UPI Direct
    if (m.upi?.enabled !== false) {
      list.push({
        key: 'upi',
        name: 'UPI Direct',
        shortTitle: 'UPI Direct',
        icon: '',
        badge: 'Instant QR',
        badgeClass: 'brass',
        subtitle: m.upi?.upiId || 'Direct UPI / QR Transfer',
        isDefault: false,
      });
    }

    // 2. Razorpay
    if (m.razorpay?.enabled !== false && (m.razorpay?.enabled || state.platformGateways.razorpay?.enabled)) {
      list.push({
        key: 'razorpay',
        name: 'Razorpay',
        shortTitle: 'Razorpay',
        icon: '',
        badge: 'Instant SSL',
        badgeClass: 'brass',
        subtitle: 'Cards, Netbanking & Wallets',
        isDefault: false,
      });
    }

    // 3. Stripe
    if (m.stripe?.enabled !== false && (m.stripe?.enabled || state.platformGateways.stripe?.enabled)) {
      list.push({
        key: 'stripe',
        name: 'Credit / Debit Card',
        shortTitle: 'Credit / Debit Card',
        icon: '',
        badge: 'Global Card',
        badgeClass: 'brass',
        subtitle: 'Visa, Mastercard, Amex',
        isDefault: false,
      });
    }

    // 4. PayPal
    if (m.paypal?.enabled !== false && (m.paypal?.enabled || state.platformGateways.paypal?.enabled)) {
      list.push({
        key: 'paypal',
        name: 'PayPal',
        shortTitle: 'PayPal',
        icon: '',
        badge: 'PayPal Wallet',
        badgeClass: 'brass',
        subtitle: m.paypal?.email || 'International Checkout',
        isDefault: false,
      });
    }

    // 5. Direct Bank Wire
    if (m.bank?.enabled !== false) {
      list.push({
        key: 'bank',
        name: 'Bank Transfer',
        shortTitle: 'Bank Transfer',
        icon: '',
        badge: 'Wire Transfer',
        badgeClass: 'brass',
        subtitle: m.bank?.accountNumber ? `${m.bank.bankName ? m.bank.bankName + ' • ' : ''}A/c: ${m.bank.accountNumber}` : 'Direct Bank / NEFT / IMPS Transfer',
        isDefault: false,
      });
    }

    // 6. Direct Cash Handover
    if (m.cash?.enabled !== false) {
      list.push({
        key: 'cash',
        name: 'Cash',
        shortTitle: 'Cash',
        icon: '',
        badge: 'Handover',
        badgeClass: 'amber',
        subtitle: 'In-person physical voucher handover',
        isDefault: false,
      });
    }

    return list;
  }, [m, state.platformGateways]);

  // First available active gateway option
  const ownerActiveGateway: 'stripe' | 'razorpay' | 'paypal' | 'upi' | 'bank' | 'cash' = (() => {
    return (availableGateways[0]?.key || 'upi') as any;
  })();

  // Synchronize selected method with available gateways
  useEffect(() => {
    if (availableGateways.length > 0 && !availableGateways.some((g) => g.key === selectedMethod)) {
      setSelectedMethod(availableGateways[0].key);
    }
  }, [availableGateways, selectedMethod]);

  const getGatewayDisplayName = (gw: string) => {
    switch (gw) {
      case 'razorpay':
        return 'Razorpay';
      case 'stripe':
        return 'Credit / Debit Card';
      case 'paypal':
        return 'PayPal';
      case 'upi':
        return 'UPI Direct';
      case 'bank':
        return 'Bank Transfer';
      case 'cash':
        return 'Cash';
      default:
        return 'Online Gateway';
    }
  };

  const getGatewayShortTitle = (gw: string) => {
    switch (gw) {
      case 'razorpay':
        return 'Razorpay Online';
      case 'stripe':
        return 'Stripe Online';
      case 'paypal':
        return 'PayPal';
      case 'upi':
        return 'UPI Direct';
      case 'bank':
        return 'Bank Wire';
      case 'cash':
        return 'Direct Cash';
      default:
        return 'Online Gateway';
    }
  };

  const handlePayRentCycle = async (item: RentCycleItem) => {
    // Look for real existing invoice matching this rent cycle strictly matching unit and property
    let invoiceToPay: Invoice | undefined = state.invoices.find(
      (inv) =>
        inv.id === item.invoiceId ||
        (inv.invoiceType === 'rent' &&
          inv.unit === item.unitNumber &&
          (!inv.propertyId || !item.propertyId || inv.propertyId === item.propertyId) &&
          (inv.due === item.dueDate || inv.items?.some((it) => it.description?.includes(item.monthName))) &&
          inv.status !== 'paid')
    );

    const itemAgreement = effectiveAgreements.find(
      (a) =>
        (item.propertyId && a.propertyId === item.propertyId && a.unit === item.unitNumber) ||
        (a.unit === item.unitNumber && (!item.propertyId || !a.propertyId || a.propertyId === item.propertyId)) ||
        (item.propertyId && a.propertyId === item.propertyId)
    ) || effectiveAgreements[0];

    const targetOwnerId = itemAgreement?.ownerId || (item.propertyId ? state.properties.find(p => p.id === item.propertyId)?.ownerId : '') || resolvedOwnerId;

    if (!invoiceToPay) {
      // Create official invoice for this real cycle in state/firestore
      const newInvId = `INV-RENT-${item.cycleNumber}-${Date.now().toString().slice(-4)}`;
      const generatedInvoice: Invoice = {
        id: newInvId,
        ownerId: targetOwnerId,
        tenant: tenantName,
        tenantId: user?.id || tenantRecord?.id || `usr_tenant_${Date.now()}`,
        unit: item.unitNumber,
        propertyId: item.propertyId || itemAgreement?.propertyId,
        propertyName: item.propertyName,
        invoiceType: 'rent',
        amount: item.amount,
        tax: 0,
        total: item.amount,
        due: item.dueDate,
        issueDate: new Date().toISOString().split('T')[0],
        status: 'sent',
        items: [
          {
            description: `Monthly Rent — ${item.cycleLabel} (${item.monthName}) for Unit ${item.unitNumber}`,
            amount: item.amount,
          },
        ],
        leaseAgreementId: itemAgreement?.id || activeAgreement?.id,
        notes: item.isMoveInMonth ? 'Immediate First Month Rent' : undefined,
      };
      await saveInvoice(generatedInvoice);
      invoiceToPay = generatedInvoice;
    }

    if (invoiceToPay) {
      setActivePayingInvoice(prepareInvoiceForPayment(invoiceToPay));
      setSelectedMethod(ownerActiveGateway);
      setCashHandoverLocation(`Unit ${item.unitNumber || resolvedUnit || invoiceToPay.unit || 'Premises'} / On-Site Handover`);
      setCashHandoverDate(new Date().toISOString().split('T')[0]);
      setIsPayNowOpen(true);
    }
  };

  const handleViewCycleReceipt = (item: RentCycleItem) => {
    const matchedInvoice = state.invoices.find((inv) => inv.id === item.invoiceId);
    if (matchedInvoice) {
      setSelectedInvoiceForReceipt(matchedInvoice);
    } else {
      const fallbackInv: Invoice = {
        id: item.invoiceId || `INV-${item.id.replace(/[^0-9]/g, '').slice(-4) || 'RENT'}`,
        ownerId: resolvedOwnerId,
        tenant: tenantName,
        tenantId: user?.id || tenantRecord?.id || '',
        unit: item.unitNumber,
        propertyName: item.propertyName,
        invoiceType: 'rent',
        amount: item.amount,
        tax: 0,
        total: item.amount,
        due: item.dueDate,
        issueDate: item.dueDate,
        paidAt: item.paidAt || item.dueDate,
        paymentMethodUsed: item.paymentMethod || 'DIRECT_SETTLEMENT',
        receiptNumber: item.transactionRef || `REC-${item.cycleNumber}`,
        status: 'paid',
        items: [
          {
            description: `Monthly Rent Settlement — ${item.cycleLabel} (${item.monthName}) — Unit ${item.unitNumber} (${item.propertyName})`,
            amount: item.amount,
          },
        ],
      };
      setSelectedInvoiceForReceipt(fallbackInv);
    }
  };

  const finalizePaymentRecord = async (
    payId: string,
    amount: number,
    method: string,
    status: 'paid' | 'pending_confirmation',
    externalRef?: string,
    proofUrl?: string,
    proofNotes?: string
  ) => {
    const overduePay = state.payments.find(
      (p) =>
        p.status === 'overdue' &&
        ((user?.id && p.tenantId === user.id) ||
          (tenantEmail && p.tenant?.toLowerCase() === tenantEmail) ||
          (resolvedUnit && p.unit === resolvedUnit)) &&
        (!resolvedOwnerId || !p.ownerId || p.ownerId === resolvedOwnerId)
    );
    const newPayment: PaymentTransaction = {
      id: payId,
      ownerId: resolvedOwnerId,
      tenant: tenantName,
      tenantId: user?.id || tenantRecord?.id || `usr_tenant_${Date.now()}`,
      unit: resolvedUnit,
      amount,
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date().toISOString().split('T')[0],
      status,
      method: method.toUpperCase(),
      type: 'rent',
      notes: externalRef ? `Ref: ${externalRef}` : undefined,
    };

    // 1. Reconcile existing invoice or auto-generate formal settled invoice
    const matchingInvoice = activePayingInvoice || state.invoices.find((inv) => {
      const matchesTenant =
        (user?.id && inv.tenantId === user.id) ||
        (tenantRecord?.id && inv.tenantId === tenantRecord.id) ||
        (tenantEmail && (inv.tenantEmail?.toLowerCase() === tenantEmail || inv.tenant?.toLowerCase() === tenantEmail));
      const matchesUnit = hasAssignedUnit && inv.unit === resolvedUnit && inv.tenantId === user?.id;
      return (matchesTenant || matchesUnit) && inv.status !== 'paid';
    });

    let effectiveInvoiceId = matchingInvoice?.id;
    let targetInvoiceForReceipt: Invoice | undefined = undefined;

    if (matchingInvoice) {
      if (status === 'paid') {
        await markInvoicePaid(matchingInvoice.id, method.toUpperCase(), externalRef, payId, {
          lateFeeApplied: activePayingInvoice?.lateFeeApplied,
          lateFeeCalculation: activePayingInvoice?.lateFeeCalculation,
          finalTotal: activePayingInvoice?.total,
        });
        targetInvoiceForReceipt = {
          ...matchingInvoice,
          status: 'paid',
          paidAt: new Date().toISOString(),
          paymentMethodUsed: method.toUpperCase(),
          receiptNumber: matchingInvoice.receiptNumber || generateReceiptId(),
          lateFeeApplied: activePayingInvoice?.lateFeeApplied,
          total: activePayingInvoice?.total || matchingInvoice.total,
        };

        if (enableAutopayInCheckout && activeAgreement?.id) {
          const mLower = method.toLowerCase();
          const gwKey = (mLower.includes('stripe') ? 'stripe' : mLower.includes('razorpay') ? 'razorpay' : mLower.includes('easebuzz') ? 'easebuzz' : 'paypal') as any;
          updateAgreementAutopay(activeAgreement.id, {
            activeGateway: gwKey,
            mandateId: externalRef || `mandate_${gwKey}_${Date.now()}`,
            status: 'active',
            paymentMethodDisplay: `${gwKey.toUpperCase()} AutoPay`,
            rentAmount: activePayingInvoice?.total || matchingInvoice.total,
            currency: activePayingInvoice?.currency || activeAgreement?.currency || 'INR',
            nextDebitDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            updatedAt: new Date().toISOString(),
          }).catch(console.warn);
        }
      } else {
        const updatedPendingInvoice: Invoice = {
          ...matchingInvoice,
          status: 'pending_confirmation',
          paymentProofRef: externalRef,
          paymentProofUrl: proofUrl,
          paymentProofDate: new Date().toISOString(),
          paymentProofNotes: proofNotes,
        };
        await saveInvoice(updatedPendingInvoice);

        // Persist offline payment transaction in pending_confirmation state
        const finalPaymentDoc: PaymentTransaction = {
          ...newPayment,
          invoiceId: effectiveInvoiceId,
          type: matchingInvoice?.invoiceType === 'deposit' ? 'deposit' : matchingInvoice?.invoiceType === 'late_fee' ? 'late_fee' : 'rent',
          notes: proofNotes ? (externalRef ? `Ref: ${externalRef} — ${proofNotes}` : proofNotes) : (externalRef ? `Ref: ${externalRef}` : undefined),
          audit: {
            claimedBy: user?.id || tenantRecord?.id || 'tenant',
            claimedByRole: 'tenant',
            claimedByName: tenantName,
            claimedAt: new Date().toISOString(),
            proofPhotoUrl: proofUrl,
          },
        };
        await savePayment(finalPaymentDoc);
      }
    } else {
      // Direct payment with no prior invoice: Auto-generate official invoice in Firestore
      const autoInvId = generateInvoiceId();
      effectiveInvoiceId = autoInvId;
      const targetOwnerId = activeAgreement?.ownerId || resolvedOwnerId;
      const targetUnit = activeAgreement?.unit || resolvedUnit;
      const targetPropertyName = currentProperty?.name || tenantRecord?.propertyName || 'Rental Property';
      const autoInvoice: Invoice = {
        id: autoInvId,
        ownerId: targetOwnerId,
        tenant: tenantName,
        tenantId: user?.id || tenantRecord?.id || `usr_tenant_${Date.now()}`,
        unit: targetUnit,
        propertyName: targetPropertyName,
        invoiceType: 'rent',
        amount,
        tax: 0,
        total: amount,
        issueDate: new Date().toISOString(),
        due: new Date().toISOString().split('T')[0],
        status,
        items: [{ description: `Monthly Rent — Unit ${targetUnit}`, amount }],
        paymentProofRef: externalRef,
        paymentProofUrl: proofUrl,
        paymentProofDate: status === 'pending_confirmation' ? new Date().toISOString() : undefined,
        paymentProofNotes: proofNotes,
        ...(status === 'paid'
          ? {
              paidAt: new Date().toISOString(),
              paymentMethodUsed: method.toUpperCase(),
              receiptNumber: generateReceiptId(),
            }
          : {}),
      };
      await saveInvoice(autoInvoice);
      targetInvoiceForReceipt = autoInvoice;

      const finalPaymentDoc: PaymentTransaction = {
        ...newPayment,
        invoiceId: effectiveInvoiceId,
        type: 'rent',
      };
      await savePayment(finalPaymentDoc);
    }

    // 2. Automated Confirmation Email with PDF Invoice/Receipt attached to BOTH Tenant & Owner
    const finalTargetOwnerId = targetInvoiceForReceipt?.ownerId || activePayingInvoice?.ownerId || activeAgreement?.ownerId || resolvedOwnerId;
    const finalTargetUnit = targetInvoiceForReceipt?.unit || activePayingInvoice?.unit || activeAgreement?.unit || resolvedUnit;
    const finalTargetPropName = targetInvoiceForReceipt?.propertyName || activePayingInvoice?.propertyName || currentProperty?.name || tenantRecord?.propertyName || 'Rental Property';

    if (status === 'paid') {
      const ownerUser = state.users?.find((u) => u.id === finalTargetOwnerId);
      const effectiveOwnerEmail = ownerUser?.email || '';
      const effectiveOwnerName = ownerUser?.displayName || 'Property Owner';

      dispatchRentPaymentReceiptEmail({
        invoice: targetInvoiceForReceipt,
        payment: {
          ...newPayment,
          invoiceId: effectiveInvoiceId,
        },
        tenantEmail: tenantEmail || tenantRecord?.email || user?.email || '',
        tenantName,
        tenantId: user?.id || tenantRecord?.id,
        ownerEmail: effectiveOwnerEmail,
        ownerName: effectiveOwnerName,
        ownerId: finalTargetOwnerId,
        propertyName: finalTargetPropName,
        unit: finalTargetUnit,
        currencySymbol: getCurrencySymbol(targetInvoiceForReceipt?.currency || activePayingInvoice?.currency || resolvedCurrency) || DEFAULT_CURRENCY_SYMBOL,
      }).then((res) => {
        if (res.success) {
          showToast('✓ Official tax invoice & receipt emailed to you and your landlord.');
        }
      }).catch((err) => {
        console.warn('[PaymentsHistoryPage] Payment receipt email dispatch error:', err);
      });
    }

    // 3. Notify owner in Firestore/local state
    if (finalTargetOwnerId) {
      const notif = {
        id: `notif_${Date.now()}`,
        userId: finalTargetOwnerId,
        title: status === 'paid' ? 'Rent Payment Received' : 'Payment Proof Submitted (Pending Confirmation)',
        body:
          status === 'paid'
            ? `${tenantName} paid ${getCurrencySymbol(activePayingInvoice?.currency || resolvedCurrency)}${amount.toLocaleString('en-IN')} for Unit ${finalTargetUnit} via ${method.toUpperCase()}.`
            : `${tenantName} uploaded offline proof (Ref: ${externalRef || 'Direct Transfer'}) for Unit ${finalTargetUnit}. Please review and confirm receipt.`,
        link: '/owner/payments',
        isRead: false,
        createdAt: new Date().toISOString(),
      };
      updateState((prev) => ({
        ...prev,
        notifications: [...(prev.notifications || []), notif],
      }));
    }

    // Reset modal state
    setOfflineRef('');
    setOfflineProofUrl('');
    setOfflineNotes('');
    setIsPayNowOpen(false);
    setIsProcessing(false);
    setActivePayingInvoice(null);
  };

  const handleConfirmPay = async () => {
    const overduePay = state.payments.find(
      (p) =>
        p.status === 'overdue' &&
        ((user?.id && p.tenantId === user.id) ||
          (tenantEmail && p.tenant?.toLowerCase() === tenantEmail) ||
          (resolvedUnit && p.unit === resolvedUnit)) &&
        (!resolvedOwnerId || !p.ownerId || p.ownerId === resolvedOwnerId)
    );
    const payId = overduePay?.id || generateTransactionId();
    const payAmount = activePayingInvoice ? activePayingInvoice.total : (overduePay ? overduePay.amount : (resolvedMonthlyRent || tenantRecord?.rent || 0));

    // Resolve the currency code for payment gateway APIs (they need codes, not symbols)
    const rawCurr = getCurrencySymbol(activePayingInvoice?.currency || activeAgreement?.currency || resolvedCurrency) || DEFAULT_CURRENCY_SYMBOL;
    const symbolToCode: Record<string, string> = { '₹': 'INR', '$': 'USD', '€': 'EUR', '£': 'GBP', 'S$': 'SGD', 'CA$': 'CAD', 'A$': 'AUD', '¥': 'JPY' };
    const resolvedCurrencyCode = (rawCurr.length <= 3 && rawCurr === rawCurr.toUpperCase() && /^[A-Z]/.test(rawCurr))
      ? rawCurr  // already a proper code like INR, USD, EUR
      : (symbolToCode[rawCurr] || 'INR');

    // Live Easebuzz Flow (Full production gateway)
    if (selectedMethod === 'easebuzz') {
      setIsProcessing(true);
      const ebKey = (m.easebuzz?.merchantKey && m.easebuzz?.enabled)
        ? m.easebuzz.merchantKey
        : (state.platformGateways.easebuzz?.merchantKey || '');
      const ebSalt = (m.easebuzz?.salt && m.easebuzz?.enabled)
        ? m.easebuzz.salt
        : (state.platformGateways.easebuzz?.salt || '');
      const ebSub = m.easebuzz?.subMerchantId || state.platformGateways.easebuzz?.subMerchantId;

      if (!ebKey || !ebSalt) {
        setIsProcessing(false);
        showToast('⚠️ Easebuzz live credentials are not configured by landlord or platform administrator.');
        return;
      }

      const targetOwnerId = activePayingInvoice?.ownerId || activeAgreement?.ownerId || resolvedOwnerId;
      const targetUnit = activePayingInvoice?.unit || activeAgreement?.unit || resolvedUnit;

      await launchEasebuzzPayment({
        merchantKey: ebKey,
        salt: ebSalt,
        subMerchantId: ebSub,
        amount: payAmount,
        currency: resolvedCurrencyCode,
        name: m.upi?.merchantName || 'Propithub Rent Settlement',
        description: `Rent for Unit ${targetUnit || 'Residence'} (Invoice ${activePayingInvoice?.id || payId})`,
        paymentRecordId: payId,
        customerName: tenantName,
        customerEmail: user?.email || '',
        customerPhone: user?.phone || '9876543210',
        ownerId: targetOwnerId,
        onSuccess: (res) => {
          finalizePaymentRecord(payId, payAmount, 'EASEBUZZ', 'paid', res.paymentId || res.txnid);
          showToast(`✓ Easebuzz payment confirmed! ID: ${res.paymentId || res.txnid}`);
        },
        onError: (err) => {
          setIsProcessing(false);
          showToast(`Easebuzz payment notice: ${err}`);
        },
      });
      return;
    }

    // Live Razorpay Flow
    if (selectedMethod === 'razorpay') {
      setIsProcessing(true);
      const rzpKey = (m.razorpay?.keyId && m.razorpay?.enabled)
        ? m.razorpay.keyId
        : (state.platformGateways.razorpay?.keyId || '');
      if (!rzpKey) {
        setIsProcessing(false);
        showToast('⚠️ Razorpay payment gateway is not configured by landlord or platform administrator.');
        return;
      }
      const targetOwnerId = activePayingInvoice?.ownerId || activeAgreement?.ownerId || resolvedOwnerId;
      const targetUnit = activePayingInvoice?.unit || activeAgreement?.unit || resolvedUnit;
      await launchRazorpayPayment({
        keyId: rzpKey,
        amount: payAmount,
        currency: resolvedCurrencyCode,
        name: m.upi?.merchantName || 'Propithub Rent Settlement',
        description: `Rent for Unit ${targetUnit || 'Residence'}`,
        paymentRecordId: payId,
        customerName: tenantName,
        customerEmail: user?.email || '',
        customerPhone: user?.phone || '',
        ownerId: targetOwnerId,
        onSuccess: (res) => {
          finalizePaymentRecord(payId, payAmount, 'RAZORPAY', 'paid', res.paymentId);
          showToast(`Razorpay payment successful! ID: ${res.paymentId}`);
        },
        onError: (err) => {
          setIsProcessing(false);
          showToast(err);
        },
      });
      return;
    }

    // Live Stripe Flow
    if (selectedMethod === 'stripe') {
      setIsProcessing(true);
      const stripePub = (m.stripe?.pubKey && m.stripe?.enabled)
        ? m.stripe.pubKey
        : (state.platformGateways.stripe?.pubKey || '');
      if (!stripePub) {
        setIsProcessing(false);
        showToast('⚠️ Stripe payment gateway is not configured by landlord or platform administrator.');
        return;
      }
      const targetOwnerId = activePayingInvoice?.ownerId || activeAgreement?.ownerId || resolvedOwnerId;
      await launchStripePayment({
        publishableKey: stripePub,
        amount: payAmount,
        currency: resolvedCurrencyCode.toLowerCase(),
        paymentRecordId: payId,
        customerName: tenantName,
        customerEmail: user?.email || '',
        ownerId: targetOwnerId,
        onSuccess: (res) => {
          finalizePaymentRecord(payId, payAmount, 'STRIPE', 'paid', res.paymentIntentId);
          showToast(`Stripe payment confirmed! ID: ${res.paymentIntentId}`);
        },
        onError: (err) => {
          setIsProcessing(false);
          showToast(err);
        },
      });
      return;
    }

    // Live PayPal Flow
    if (selectedMethod === 'paypal') {
      setIsProcessing(true);
      const paypalClientId = (m.paypal?.clientId && m.paypal?.enabled)
        ? m.paypal.clientId
        : (state.platformGateways.paypal?.clientId || '');

      const invCurr = (activePayingInvoice?.currency || tenantRecord?.currency || 'INR').toUpperCase();
      const paypalAmount = Math.max(1, Math.round(convert(payAmount, invCurr, 'USD')));
      const targetOwnerId = activePayingInvoice?.ownerId || activeAgreement?.ownerId || resolvedOwnerId;
      const targetUnit = activePayingInvoice?.unit || activeAgreement?.unit || resolvedUnit;

      await launchPayPalPayment({
        clientId: paypalClientId,
        amount: paypalAmount,
        currency: 'USD',
        name: m.upi?.merchantName || 'Propithub Rent Settlement',
        description: `Rent for Unit ${targetUnit || 'Residence'}${invCurr === 'INR' ? ` (Approx. ₹${payAmount.toLocaleString('en-IN')})` : ''}`,
        paymentRecordId: payId,
        customerEmail: user?.email || '',
        ownerId: targetOwnerId,
        onSuccess: (res) => {
          finalizePaymentRecord(payId, payAmount, 'PAYPAL', 'paid', res.paymentId);
          showToast(`✓ PayPal payment successful! Transaction ID: ${res.paymentId}`);
        },
        onError: (err) => {
          setIsProcessing(false);
          showToast(`PayPal checkout: ${err}`);
        },
      });
      return;
    }

    // Cash Handover Protocol (Inflow Claim & Dual Confirmation)
    if (selectedMethod === 'cash') {
      setIsProcessing(true);
      try {
        const targetOwnerId = activePayingInvoice?.ownerId || activeAgreement?.ownerId || resolvedOwnerId;
        const targetUnit = activePayingInvoice?.unit || activeAgreement?.unit || resolvedUnit;
        const targetPropertyName = activePayingInvoice?.propertyName || currentProperty?.name || tenantRecord?.propertyName;
        await submitCashClaim({
          direction: 'inflow',
          type: activePayingInvoice?.invoiceType === 'deposit' ? 'deposit' : 'rent',
          amount: payAmount,
          currency: resolvedCurrencyCode,
          ownerId: targetOwnerId,
          tenantId: user?.id || tenantRecord?.id || `usr_tenant_${Date.now()}`,
          tenantName,
          unit: targetUnit,
          propertyName: targetPropertyName,
          invoiceId: activePayingInvoice?.id,
          claimedBy: user?.id || tenantRecord?.id || '',
          claimedByRole: 'tenant',
          claimedByName: tenantName,
          handoverDate: cashHandoverDate || new Date().toISOString().split('T')[0],
          handoverLocation: cashHandoverLocation || `Unit ${targetUnit || 'Premises'} / On-Site Handover`,
          notes: offlineNotes ? (offlineRef ? `Ref: ${offlineRef} — ${offlineNotes}` : offlineNotes) : (offlineRef ? `Ref: ${offlineRef}` : undefined),
          proofPhotoUrl: offlineProofUrl || undefined,
        });
        setOfflineRef('');
        setOfflineProofUrl('');
        setOfflineNotes('');
        setIsPayNowOpen(false);
        setIsProcessing(false);
        setActivePayingInvoice(null);
      } catch (err: any) {
        setIsProcessing(false);
        showToast(`Failed to record cash claim: ${err?.message || err}`);
      }
      return;
    }

    // Direct / Offline Methods (UPI, Bank)
    await finalizePaymentRecord(
      payId,
      payAmount,
      selectedMethod.toUpperCase(),
      'pending_confirmation',
      offlineRef || undefined,
      offlineProofUrl || undefined,
      offlineNotes || undefined
    );
    showToast('✓ Payment proof submitted! Your landlord will verify and settle the invoice.');
  };

  const getMoveoutBadge = (s: string) => {
    switch (s) {
      case 'requested':
        return <span className="badge amber">Notice received</span>;
      case 'inspection_scheduled':
        return <span className="badge amber">Inspection scheduled</span>;
      case 'inspected':
        return <span className="badge amber">Inspected</span>;
      case 'refund_scheduled':
        return <span className="badge amber">Refund scheduled</span>;
      case 'refund_completed':
        return <span className="badge green">Refund completed</span>;
      default:
        return <span className="badge grey">{s}</span>;
    }
  };

  return (
    <div>
      <div className="tenant-payments-main-view">
        <div className="tabs">
        <div
          className={`tab ${subTab === 'ledger' ? 'active' : ''}`}
          onClick={() => {
            setSubTab('ledger');
            setSearchParams({ tab: 'ledger' });
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Receipt size={15} />
          Payment Ledger
        </div>
        <div
          className={`tab ${subTab === 'rent_due' ? 'active' : ''}`}
          onClick={() => {
            setSubTab('rent_due');
            setSearchParams({ tab: 'rent_due' });
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Calendar size={15} />
          Rent Due
          {upcomingDues.length > 0 && (
            <span
              style={{
                marginLeft: '4px',
                fontSize: '11px',
                padding: '1px 7px',
                borderRadius: '10px',
                background: currentDueItem?.status === 'overdue' ? '#FEE2E2' : 'var(--brass-soft)',
                color: currentDueItem?.status === 'overdue' ? '#DC2626' : 'var(--brass-dark, #92400E)',
                fontWeight: 700,
              }}
            >
              {upcomingDues.length}
            </span>
          )}
        </div>
        <div
          className={`tab ${subTab === 'invoices' ? 'active' : ''}`}
          onClick={() => {
            setSubTab('invoices');
            setSearchParams({ tab: 'invoices' });
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <FileText size={15} />
          Invoices & Bills
          {myTenantInvoices.length > 0 && (
            <span
              style={{
                marginLeft: '4px',
                fontSize: '11px',
                padding: '1px 7px',
                borderRadius: '10px',
                background: 'var(--surface-sunken)',
                color: 'var(--ink)',
                fontWeight: 700,
              }}
            >
              {myTenantInvoices.length}
            </span>
          )}
        </div>
        <div
          className={`tab ${subTab === 'deposit' ? 'active' : ''}`}
          onClick={() => {
            setSubTab('deposit');
            setSearchParams({ tab: 'deposit' });
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ShieldCheck size={15} />
          Security Deposit
        </div>
      </div>

      {/* TAB 1: Rent Due */}
      {subTab === 'rent_due' && (
        <div>
          {/* Multi-Residence Filter Bar */}
          {effectiveAgreements.length > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '12px 18px',
                background: 'var(--surface-sunken)',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Home size={18} color="var(--brass)" />
                <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)' }}>
                  Active Residences ({effectiveAgreements.length}):
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setSelectedResidenceId('all')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '999px',
                    fontSize: '12.5px',
                    fontWeight: selectedResidenceId === 'all' ? 700 : 500,
                    border: selectedResidenceId === 'all' ? '1.5px solid var(--brass)' : '1px solid var(--line)',
                    background: selectedResidenceId === 'all' ? 'var(--brass)' : '#ffffff',
                    color: selectedResidenceId === 'all' ? '#ffffff' : 'var(--ink)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  All Properties ({effectiveAgreements.length})
                </button>
                {effectiveAgreements.map((ag) => {
                  const propName = state.properties.find((p) => p.id === ag.propertyId)?.name || 'Residence';
                  const isSelected = selectedResidenceId === ag.id;
                  return (
                    <button
                      key={ag.id}
                      type="button"
                      onClick={() => setSelectedResidenceId(ag.id)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '999px',
                        fontSize: '12.5px',
                        fontWeight: isSelected ? 700 : 500,
                        border: isSelected ? '1.5px solid var(--brass)' : '1px solid var(--line)',
                        background: isSelected ? 'var(--brass)' : '#ffffff',
                        color: isSelected ? '#ffffff' : 'var(--ink)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{propName}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: isSelected ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                          color: isSelected ? '#ffffff' : 'var(--ink-soft)',
                          fontWeight: 600,
                        }}
                      >
                        Unit {ag.unit}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 1 HERO BANNER: Security Deposit Prerequisite */}
          {pendingDepositRecord && (
            <div
              className="panel"
              style={{
                background: '#FFFBEB',
                border: '2px solid var(--brass, #C59A45)',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span
                      className="badge amber"
                      style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                    >
                      Step 1: Mandatory Move-In Security Deposit
                    </span>
                    <span className="badge grey" style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                      {pendingDepositRecord.reference}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', margin: '0 0 6px 0' }}>
                    <h2 style={{ fontSize: '26px', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
                      {getCurrencySymbol(pendingDepositRecord.currency) || resolvedCurrency}{pendingDepositRecord.amount.toLocaleString('en-IN')}
                    </h2>
                    <CurrencyConverterTrigger
                      amount={pendingDepositRecord.amount}
                      currency={pendingDepositRecord.currency || resolvedCurrency}
                      label="View in your currency"
                    />
                  </div>
                  <div
                    style={{
                      fontSize: '13.5px',
                      color: 'var(--ink-soft)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      <b>Property:</b> {pendingDepositRecord.propertyName}
                    </span>
                    <span>•</span>
                    <span>
                      <b>Unit:</b> {pendingDepositRecord.unit}
                    </span>
                    <span>•</span>
                    <span>
                      <b>Status:</b> Deposit Due (Pending Payment)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn brass btn-mobile-full"
                    style={{
                      padding: '11px 22px',
                      fontSize: '14.5px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    onClick={() => {
                      if (pendingDepositRecord.depositInvoice) {
                        setActivePayingInvoice(pendingDepositRecord.depositInvoice);
                        setSelectedMethod(ownerActiveGateway);
                        setCashHandoverLocation(`Unit ${pendingDepositRecord.unit || 'Premises'} / On-Site Handover`);
                        setCashHandoverDate(new Date().toISOString().split('T')[0]);
                        setIsPayNowOpen(true);
                      } else {
                        const fallbackDepInv: Invoice = {
                          id: pendingDepositRecord.reference.replace(/^#/, ''),
                          ownerId: pendingDepositRecord.ownerId || resolvedOwnerId,
                          tenant: tenantName,
                          tenantId: user?.id || '',
                          unit: pendingDepositRecord.unit,
                          propertyName: pendingDepositRecord.propertyName,
                          propertyId: pendingDepositRecord.propertyId,
                          invoiceType: 'deposit',
                          amount: pendingDepositRecord.amount,
                          tax: 0,
                          total: pendingDepositRecord.amount,
                          due: pendingDepositRecord.dueDate || new Date().toISOString().split('T')[0],
                          issueDate: new Date().toISOString().split('T')[0],
                          status: 'sent',
                          currency: pendingDepositRecord.currency || resolvedCurrency,
                          items: [
                            {
                              description: `Refundable Security Deposit — Unit ${pendingDepositRecord.unit}`,
                              amount: pendingDepositRecord.amount,
                            },
                          ],
                        };
                        saveInvoice(fallbackDepInv);
                        setActivePayingInvoice(fallbackDepInv);
                        setSelectedMethod(ownerActiveGateway);
                        setCashHandoverLocation(`Unit ${pendingDepositRecord.unit || 'Premises'} / On-Site Handover`);
                        setCashHandoverDate(new Date().toISOString().split('T')[0]);
                        setIsPayNowOpen(true);
                      }
                    }}
                  >
                    <ShieldCheck size={18} /> Pay Security Deposit Now ({getCurrencySymbol(pendingDepositRecord.currency) || resolvedCurrency}{pendingDepositRecord.amount.toLocaleString('en-IN')})
                  </button>
                </div>
              </div>

              {/* Explanatory Prerequisite Note */}
              <div
                style={{
                  marginTop: '16px',
                  paddingTop: '14px',
                  borderTop: '1px solid rgba(197, 154, 69, 0.25)',
                  fontSize: '12.5px',
                  color: 'var(--ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} style={{ color: '#D97706', flexShrink: 0 }} />
                <span>
                  <b>Move-in Prerequisite Flow:</b> Signed lease agreement is approved. The refundable security deposit must be paid and secured in trust before recurring first month rent can be paid and residency keys handed over.
                </span>
              </div>
            </div>
          )}

          {/* Hero Card: Current / Immediate Payable Rent Cycle */}
          {currentDueItem ? (
            <div
              className="panel"
              style={{
                background:
                  currentDueItem.isDepositPending || pendingDepositRecord
                    ? 'var(--surface-sunken)'
                    : currentDueItem.status === 'overdue'
                    ? 'var(--danger-soft)'
                    : currentDueItem.status === 'due_now'
                    ? 'var(--amber-soft)'
                    : 'var(--surface)',
                border:
                  currentDueItem.isDepositPending || pendingDepositRecord
                    ? '1.5px solid var(--line-strong)'
                    : currentDueItem.status === 'overdue'
                    ? '1.5px solid var(--danger)'
                    : currentDueItem.status === 'due_now'
                    ? '1.5px solid var(--amber)'
                    : '1px solid var(--line)',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span
                      className={`badge ${
                        currentDueItem.isDepositPending || pendingDepositRecord
                          ? 'amber'
                          : currentDueItem.status === 'overdue'
                          ? 'red'
                          : currentDueItem.status === 'due_now'
                          ? 'amber'
                          : currentDueItem.status === 'due_soon'
                          ? 'amber'
                          : currentDueItem.status === 'pending_confirmation'
                          ? 'blue'
                          : 'grey'
                      }`}
                      style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                    >
                      {currentDueItem.isDepositPending || pendingDepositRecord
                        ? 'Step 2: Recurring Rent (Awaiting Deposit)'
                        : currentDueItem.status === 'overdue'
                        ? 'Overdue Rent'
                        : currentDueItem.status === 'due_now'
                        ? 'Rent Due Now'
                        : currentDueItem.status === 'due_soon'
                        ? 'Rent Due Soon'
                        : currentDueItem.status === 'pending_confirmation'
                        ? 'Payment Awaiting Confirmation'
                        : 'Next Rent Due'}
                    </span>
                    {currentDueItem.isMoveInMonth && (
                      <span className="badge brass" style={{ fontSize: '11px' }}>
                        First Month Rent (Move-in)
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', margin: '0 0 6px 0' }}>
                    <h2 style={{ fontSize: '26px', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
                      {getCurrencySymbol(currentDueItem.currency) || resolvedCurrency}{currentDueItem.amount.toLocaleString('en-IN')}
                    </h2>
                    <CurrencyConverterTrigger
                      amount={currentDueItem.amount}
                      currency={currentDueItem.currency || resolvedCurrency}
                      label="View in your currency"
                    />
                  </div>
                  <div
                    style={{
                      fontSize: '13.5px',
                      color: 'var(--ink-soft)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      <b>Property:</b> {currentDueItem.propertyName}
                    </span>
                    <span>•</span>
                    <span>
                      <b>Unit:</b> {currentDueItem.unitNumber}
                    </span>
                    <span>•</span>
                    <span>
                      <b>Due Date:</b>{' '}
                      {new Date(currentDueItem.dueDate).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span>•</span>
                    <span>
                      <b>Cycle:</b> {currentDueItem.cycleLabel} ({currentDueItem.monthName})
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {currentDueItem.status === 'pending_confirmation' ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#D97706',
                        fontWeight: 600,
                        fontSize: '13px',
                        background: '#FEF3C7',
                        padding: '8px 14px',
                        borderRadius: '6px',
                      }}
                    >
                      <Clock size={16} /> Verification Pending
                    </div>
                  ) : currentDueItem.isDepositPending || pendingDepositRecord ? (
                    <button
                      type="button"
                      className="btn secondary btn-mobile-full"
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#B45309',
                        borderColor: '#FDE68A',
                        background: '#FEF3C7',
                        fontWeight: 600,
                      }}
                      onClick={() => {
                        if (pendingDepositRecord?.depositInvoice) {
                          setActivePayingInvoice(pendingDepositRecord.depositInvoice);
                          setSelectedMethod(ownerActiveGateway);
                          setCashHandoverLocation(`Unit ${pendingDepositRecord.unit || 'Premises'} / On-Site Handover`);
                          setCashHandoverDate(new Date().toISOString().split('T')[0]);
                          setIsPayNowOpen(true);
                        } else {
                          setSubTab('deposit');
                        }
                      }}
                    >
                      <Lock size={16} /> Pay Security Deposit First ({getCurrencySymbol(pendingDepositRecord?.currency || currentDueItem.currency || resolvedCurrency)}{(pendingDepositRecord?.amount || currentDueAgreement?.deposit || 0).toLocaleString('en-IN')})
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn brass btn-mobile-full"
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      onClick={() => handlePayRentCycle(currentDueItem)}
                    >
                      <CreditCard size={16} /> Pay Rent Now ({getCurrencySymbol(currentDueItem.currency) || resolvedCurrency}{currentDueItem.amount.toLocaleString('en-IN')})
                    </button>
                  )}
                </div>
              </div>

              {/* Policy & Trust Note */}
              <div
                style={{
                  marginTop: '16px',
                  paddingTop: '14px',
                  borderTop: '1px solid rgba(0,0,0,0.06)',
                  fontSize: '12.5px',
                  color: 'var(--ink-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <ShieldCheck size={16} style={{ color: '#10B981', flexShrink: 0 }} />
                <span>
                  <b>Security Deposit Separation:</b> Refundable security deposit ({getCurrencySymbol(currentDueAgreement?.currency || currentDueItem.currency || resolvedCurrency)}
                  {(currentDueAgreement?.deposit || activeAgreement?.deposit || tenantRecord?.deposit || 0).toLocaleString('en-IN')}) is held separately as security deposit and is not applied towards recurring monthly rent.
                  {currentDueItem.isMoveInMonth
                    ? ' Immediate first month rent covers your initial 30 days of occupancy.'
                    : ` Recurring monthly rent is due on day ${currentDueAgreement?.rentDueDay || activeAgreement?.rentDueDay || 1} of each month.`}
                </span>
              </div>
            </div>
          ) : isResidentFullyVacated ? (
            <div
              className="panel"
              style={{
                background: 'var(--ledger-soft)',
                border: '1px solid var(--ledger)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <CheckCircle2 size={28} style={{ color: 'var(--ledger)', flexShrink: 0 }} />
              <div>
                <h4 style={{ margin: 0, color: 'var(--ledger)', fontSize: '15px' }}>Tenancy Concluded & All Dues Settled</h4>
                <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>
                  You have successfully vacated and your tenancy obligations are complete. No further rent payments are due. Historical payment records remain accessible in "Rent Due History" below.
                </div>
              </div>
            </div>
          ) : historyDues.length > 0 ? (
            <div
              className="panel"
              style={{
                background: 'var(--ledger-soft)',
                border: '1px solid var(--ledger)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <CheckCircle2 size={28} style={{ color: 'var(--ledger)', flexShrink: 0 }} />
              <div>
                <h4 style={{ margin: 0, color: 'var(--ledger)', fontSize: '15px' }}>All Rent Dues Settled</h4>
                <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>
                  There are no pending or overdue rent cycles for your active lease. You can review all completed payments under the "Rent Due History" CTA below.
                </div>
              </div>
            </div>
          ) : (
            <div
              className="panel"
              style={{
                background: 'var(--surface-sunken)',
                border: '1px dashed #CBD5E1',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px',
                textAlign: 'center',
              }}
            >
              <Calendar size={32} style={{ margin: '0 auto 8px', color: 'var(--ink-soft)', opacity: 0.6 }} />
              <h4 style={{ margin: '0 0 4px', color: 'var(--ink)' }}>No Active Rent Schedule Found</h4>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', maxWidth: '460px', margin: '0 auto' }}>
                Once your tenancy agreement is active, your real monthly rent schedule will automatically appear here with all upcoming due dates and amounts.
              </div>
            </div>
          )}

          {/* Tenant Rent Autopay Card */}
          {activeAgreement && !isResidentFullyVacated && (
            <div
              className="panel"
              style={{
                borderRadius: '12px',
                border: '1px solid var(--line)',
                marginBottom: '20px',
                background: 'var(--surface)',
                overflow: 'hidden',
              }}
            >
              <div
                className="panel-head"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  padding: '16px 20px',
                  background: 'var(--surface-sunken)',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '24px' }}>🔄</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Rent Autopay</h3>
                    <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                      Overall single active mandate — guaranteed zero double debits
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {activeAgreement.autopay?.status === 'active' ? (
                    <span
                      className="badge green"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 600,
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E' }}></span>
                      Autopay Active
                    </span>
                  ) : (
                    <span className="badge amber" style={{ fontWeight: 600 }}>
                      Autopay Inactive (Manual Rent Pay)
                    </span>
                  )}
                </div>
              </div>

              <div className="panel-body" style={{ padding: '20px' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                    gap: '16px',
                    alignItems: 'center',
                  }}
                >
                  {/* Active Gateway */}
                  <div
                    style={{
                      background: 'var(--surface-sunken)',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', fontWeight: 700, marginBottom: '6px' }}>
                      Active Payment Method
                    </div>
                    {(() => {
                      const gwKey = activeAgreement.autopay?.activeGateway || 'razorpay';
                      const gw = availableTenantGateways.find((g) => g.key === gwKey) || {
                        name: gwKey.toUpperCase(),
                        icon: '💳',
                        shortTitle: gwKey.toUpperCase(),
                      };
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '26px' }}>{gw.icon}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>
                              {gw.name}
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                              Mandate: {activeAgreement.autopay?.mandateId || 'Not registered'}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Scheduled Next Debit */}
                  <div
                    style={{
                      background: 'var(--surface-sunken)',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', fontWeight: 700, marginBottom: '6px' }}>
                      Scheduled Auto-Debit
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--ink)' }}>
                      {resolvedCurrency}{(activeAgreement.rent || 0).toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                      {activeAgreement.autopay?.status === 'active' && activeAgreement.autopay?.nextDebitDate
                        ? `Next Debit: ${activeAgreement.autopay.nextDebitDate} (Due day ${activeAgreement.rentDueDay || 1})`
                        : `Due on day ${activeAgreement.rentDueDay || 1} of each month`}
                    </div>
                  </div>

                  {/* Controls */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px' }}>
                    <button
                      type="button"
                      className="btn brass"
                      style={{ fontWeight: 600, fontSize: '13px' }}
                      onClick={() => {
                        setSelectedTenantGateway((activeAgreement.autopay?.activeGateway || 'razorpay') as any);
                        setIsTenantAutopayModalOpen(true);
                      }}
                    >
                      Change Payment Method
                    </button>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'var(--surface-sunken)',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)' }}>
                          Rent Auto-Debit
                        </span>
                        <span style={{ fontSize: '11px', color: activeAgreement.autopay?.status === 'active' ? '#10B981' : 'var(--ink-soft)', fontWeight: activeAgreement.autopay?.status === 'active' ? 600 : 400 }}>
                          {activeAgreement.autopay?.status === 'active' ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <label
                        className={`toggle ${activeAgreement.autopay?.status === 'active' ? 'on' : ''}`}
                        onClick={handleToggleTenantAutopay}
                        title={activeAgreement.autopay?.status === 'active' ? 'Click to disable autopay' : 'Click to enable autopay'}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="track" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sub-Navigation CTAs: Upcoming vs History */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '14px',
            }}
          >
            <div style={{ display: 'inline-flex', background: 'var(--surface-sunken)', padding: '4px', borderRadius: '8px', gap: '4px' }}>
              <button
                type="button"
                className={`btn small ${rentDueView === 'upcoming' ? 'brass' : 'secondary'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                  border: 'none',
                }}
                onClick={() => setRentDueView('upcoming')}
              >
                <Calendar size={14} /> Upcoming Rent Dues ({upcomingDues.length})
              </button>
              <button
                type="button"
                className={`btn small ${rentDueView === 'history' ? 'brass' : 'secondary'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                  border: 'none',
                }}
                onClick={() => setRentDueView('history')}
              >
                <History size={14} /> Rent Due History ({historyDues.length})
              </button>
            </div>

            <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>
              Lease Term Cycles: <b>{rentSchedule.totalCyclesCount}</b> • Settled:{' '}
              <b style={{ color: '#16A34A' }}>{rentSchedule.paidCyclesCount}</b> • Remaining:{' '}
              <b style={{ color: '#D97706' }}>{rentSchedule.pendingCyclesCount}</b>
              {selectedResidenceId === 'all' && effectiveAgreements.length > 1 && (
                <span style={{ marginLeft: '8px', color: 'var(--brass)', fontWeight: 600 }}>
                  ({effectiveAgreements.length} Properties Unified)
                </span>
              )}
            </div>
          </div>

          {/* VIEW 1: Upcoming Rent Dues Table */}
          {rentDueView === 'upcoming' && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Upcoming Rent Schedule</h3>
                  <div className="hint">Record of all upcoming monthly rent dues with date, amount, property, and cycle details</div>
                </div>
              </div>
              <div className="panel-body">
                <div className="desktop-table-view">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Billing Cycle</th>
                          <th>Property & Unit</th>
                          <th>Due Date</th>
                          <th>Amount</th>
                          <th>Important Details</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcomingDues.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px' }}>
                              {rentSchedule.totalCyclesCount > 0 ? (
                                <>
                                  <CheckCircle2 size={32} style={{ margin: '0 auto 8px', color: '#16A34A', display: 'block' }} />
                                  No upcoming rent dues remaining. All rent cycles for this agreement are settled!
                                </>
                              ) : (
                                <>
                                  <Info size={32} style={{ margin: '0 auto 8px', color: 'var(--ink-soft)', display: 'block' }} />
                                  No active rent schedule found. Monthly rent dues will be scheduled once your tenancy lease is finalized and active.
                                </>
                              )}
                            </td>
                          </tr>
                        ) : (
                          upcomingDues.map((item) => {
                            const isPayableNow = currentDueItem?.id === item.id;
                            return (
                              <tr key={item.id} style={{ background: isPayableNow ? 'rgba(217, 119, 6, 0.03)' : undefined }}>
                                <td>
                                  <b>{item.cycleLabel}</b>
                                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{item.monthName}</div>
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.propertyName}</div>
                                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Unit {item.unitNumber}</div>
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600 }}>
                                    {new Date(item.dueDate).toLocaleDateString('en-IN', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </div>
                                </td>
                                <td>
                                  <b style={{ fontSize: '14.5px', color: 'var(--ink)' }}>
                                    {getCurrencySymbol(item.currency) || resolvedCurrency}{item.amount.toLocaleString('en-IN')}
                                  </b>
                                </td>
                                <td>
                                  {item.isMoveInMonth ? (
                                    <span style={{ fontSize: '12px', color: 'var(--brass-dark, #92400E)', fontWeight: 600 }}>
                                      Immediate First Month Rent (Move-in)
                                    </span>
                                  ) : item.isRenewalCycle ? (
                                    <span style={{ fontSize: '12px', color: '#1E40AF', fontWeight: 600, background: '#EFF6FF', padding: '2px 8px', borderRadius: '4px', display: 'inline-block' }}>
                                      Renewed Term ({item.percentageIncrease ? `+${item.percentageIncrease}%` : 'New Rate'})
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                                      Standard Monthly Cycle • 5-day grace period
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <span
                                    className={`badge ${
                                      item.isDepositPending || pendingDepositRecord
                                        ? 'amber'
                                        : item.status === 'overdue'
                                        ? 'red'
                                        : item.status === 'due_now'
                                        ? 'amber'
                                        : item.status === 'pending_confirmation'
                                        ? 'amber'
                                        : item.status === 'due_soon'
                                        ? 'blue'
                                        : 'grey'
                                    }`}
                                  >
                                    {item.isDepositPending || pendingDepositRecord
                                      ? 'AWAITING DEPOSIT'
                                      : item.status === 'overdue'
                                      ? 'OVERDUE'
                                      : item.status === 'due_now'
                                      ? 'DUE NOW'
                                      : item.status === 'pending_confirmation'
                                      ? 'PENDING VERIFICATION'
                                      : item.status === 'due_soon'
                                      ? 'DUE SOON'
                                      : 'SCHEDULED'}
                                  </span>
                                </td>
                                <td>
                                  {item.status === 'pending_confirmation' ? (
                                    <span style={{ fontSize: '11.5px', color: '#D97706', fontWeight: 600 }}>
                                      Awaiting Approval
                                    </span>
                                  ) : isPayableNow ? (
                                    item.isDepositPending || pendingDepositRecord ? (
                                      <button
                                        type="button"
                                        className="btn secondary small"
                                        style={{ color: '#B45309', borderColor: '#FDE68A', background: '#FEF3C7', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        onClick={() => {
                                          if (pendingDepositRecord?.depositInvoice) {
                                            setActivePayingInvoice(pendingDepositRecord.depositInvoice);
                                            setIsPayNowOpen(true);
                                          } else {
                                            setSubTab('deposit');
                                          }
                                        }}
                                      >
                                        <Lock size={12} /> Pay Deposit First
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn brass small"
                                        onClick={() => handlePayRentCycle(item)}
                                      >
                                        Pay Rent
                                      </button>
                                    )
                                  ) : (
                                    <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                                      Scheduled
                                    </span>
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

                <div className="mobile-card-view">
                  {upcomingDues.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '28px 16px' }}>
                      {rentSchedule.totalCyclesCount > 0 ? (
                        <>
                          <CheckCircle2 size={30} style={{ margin: '0 auto 8px', color: '#16A34A', display: 'block' }} />
                          No upcoming rent dues remaining. All rent cycles for this agreement are settled!
                        </>
                      ) : (
                        <>
                          <Info size={30} style={{ margin: '0 auto 8px', color: 'var(--ink-soft)', display: 'block' }} />
                          No active rent schedule found. Monthly rent dues will be scheduled once your tenancy lease is finalized and active.
                        </>
                      )}
                    </div>
                  ) : (
                    upcomingDues.map((item) => {
                      const isPayableNow = currentDueItem?.id === item.id;
                      return (
                        <div key={item.id} className="staff-card" style={{ borderLeft: isPayableNow ? '4px solid var(--amber)' : undefined }}>
                          <div className="staff-card-header">
                            <div>
                              <div className="staff-card-title">{item.cycleLabel}</div>
                              <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                                {item.propertyName} • Unit {item.unitNumber}
                              </div>
                            </div>
                            <span
                              className={`badge ${
                                item.isDepositPending || pendingDepositRecord
                                  ? 'amber'
                                  : item.status === 'overdue'
                                  ? 'red'
                                  : item.status === 'due_now'
                                  ? 'amber'
                                  : item.status === 'pending_confirmation'
                                  ? 'amber'
                                  : item.status === 'due_soon'
                                  ? 'blue'
                                  : 'grey'
                              }`}
                            >
                              {item.isDepositPending || pendingDepositRecord
                                ? 'AWAITING DEPOSIT'
                                : item.status === 'overdue'
                                ? 'OVERDUE'
                                : item.status === 'due_now'
                                ? 'DUE NOW'
                                : item.status === 'pending_confirmation'
                                ? 'PENDING VERIFICATION'
                                : item.status === 'due_soon'
                                ? 'DUE SOON'
                                : 'SCHEDULED'}
                            </span>
                          </div>
                          <div className="staff-card-meta">
                            <div className="staff-card-meta-item">
                              <Calendar size={13} />
                              Due: {new Date(item.dueDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </div>
                            {item.isMoveInMonth ? (
                              <span style={{ fontSize: '11.5px', color: 'var(--brass-dark, #92400E)', fontWeight: 600 }}>
                                First Month Rent (Move-in)
                              </span>
                            ) : item.isRenewalCycle ? (
                              <span style={{ fontSize: '11.5px', color: '#1E40AF', fontWeight: 600 }}>
                                Renewed ({item.percentageIncrease ? `+${item.percentageIncrease}%` : 'New Rate'})
                              </span>
                            ) : null}
                          </div>
                          <div className="staff-card-footer">
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Cycle Amount</div>
                              <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--ink)' }}>
                                {getCurrencySymbol(item.currency) || resolvedCurrency}{item.amount.toLocaleString('en-IN')}
                              </div>
                            </div>
                            {item.status === 'pending_confirmation' ? (
                              <span style={{ fontSize: '12px', color: '#D97706', fontWeight: 600 }}>
                                Awaiting Approval
                              </span>
                            ) : isPayableNow ? (
                              item.isDepositPending || pendingDepositRecord ? (
                                <button
                                  type="button"
                                  className="btn secondary small btn-mobile-full"
                                  style={{ color: '#B45309', borderColor: '#FDE68A', background: '#FEF3C7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                  onClick={() => {
                                    if (pendingDepositRecord?.depositInvoice) {
                                      setActivePayingInvoice(pendingDepositRecord.depositInvoice);
                                      setIsPayNowOpen(true);
                                    } else {
                                      setSubTab('deposit');
                                    }
                                  }}
                                >
                                  <Lock size={12} /> Pay Deposit First
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn brass small btn-mobile-full"
                                  onClick={() => handlePayRentCycle(item)}
                                >
                                  Pay Rent
                                </button>
                              )
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                                Scheduled
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: Rent Due History Table */}
          {rentDueView === 'history' && (
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Rent Due Settlement History</h3>
                  <div className="hint">Historical record of all completed rent payments and official vouchers</div>
                </div>
              </div>
              <div className="panel-body">
                <div className="desktop-table-view">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Billing Cycle</th>
                          <th>Property & Unit</th>
                          <th>Amount Paid</th>
                          <th>Paid Date</th>
                          <th>Payment Method</th>
                          <th>Status</th>
                          <th>Invoice / Voucher</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyDues.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px' }}>
                              <History size={32} style={{ margin: '0 auto 8px', color: 'var(--ink-soft)', opacity: 0.5, display: 'block' }} />
                              No completed rent cycles on record yet. Settled rent payments will be archived here.
                            </td>
                          </tr>
                        ) : (
                          historyDues.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <b>{item.cycleLabel}</b>
                                <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>{item.monthName}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.propertyName}</div>
                                <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Unit {item.unitNumber}</div>
                              </td>
                              <td>
                                <b style={{ fontSize: '14.5px', color: '#166534' }}>
                                  {getCurrencySymbol(item.currency) || resolvedCurrency}{item.amount.toLocaleString('en-IN')}
                                </b>
                              </td>
                              <td>
                                {item.paidAt
                                  ? new Date(item.paidAt).toLocaleDateString('en-IN', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : item.dueDate}
                              </td>
                              <td>
                                <span style={{ fontWeight: 600, fontSize: '12px' }}>{item.paymentMethod || 'ONLINE'}</span>
                              </td>
                              <td>
                                <span className="badge green">Paid & Settled</span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    fontSize: '11.5px',
                                    padding: '4px 8px',
                                  }}
                                  onClick={() => handleViewCycleReceipt(item)}
                                >
                                  <FileText size={13} /> View Voucher
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mobile-card-view">
                  {historyDues.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '28px 16px' }}>
                      <History size={30} style={{ margin: '0 auto 8px', color: 'var(--ink-soft)', opacity: 0.5, display: 'block' }} />
                      No completed rent cycles on record yet. Settled rent payments will be archived here.
                    </div>
                  ) : (
                    historyDues.map((item) => (
                      <div key={item.id} className="staff-card">
                        <div className="staff-card-header">
                          <div>
                            <div className="staff-card-title">{item.cycleLabel}</div>
                            <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                              {item.propertyName} • Unit {item.unitNumber}
                            </div>
                          </div>
                          <span className="badge green">Paid & Settled</span>
                        </div>
                        <div className="staff-card-meta">
                          <div className="staff-card-meta-item">
                            <Calendar size={13} />
                            Paid:{' '}
                            {item.paidAt
                              ? new Date(item.paidAt).toLocaleDateString('en-IN', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : item.dueDate}
                          </div>
                          <div className="staff-card-meta-item">
                            <CreditCard size={13} />
                            {item.paymentMethod || 'ONLINE'}
                          </div>
                        </div>
                        <div className="staff-card-footer">
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Paid Amount</div>
                            <div style={{ fontWeight: 800, fontSize: '16px', color: '#166534' }}>
                              {getCurrencySymbol(item.currency) || resolvedCurrency}{item.amount.toLocaleString('en-IN')}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            onClick={() => handleViewCycleReceipt(item)}
                          >
                            <FileText size={13} /> View Voucher
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Payment Ledger */}
      {subTab === 'ledger' && (
        <div>




          {pendingInflowClaimsSubmittedByMe.map((c) => (
            <div
              key={c.id}
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)' }}>
                  Cash Handover Submitted — {getCurrencySymbol(c.currency)} {c.amount.toLocaleString('en-IN')} on {c.handoverDate} (Unit {c.unit})
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--ink-soft)' }}>
                  Claim #{c.id} • Awaiting landlord confirmation
                </span>
              </div>
              <span style={{ fontSize: '11px', background: '#DBEAFE', color: '#1E40AF', padding: '3px 8px', borderRadius: '12px', fontWeight: 600 }}>
                Pending Landlord Confirmation
              </span>
            </div>
          ))}

          <div className="panel">
            <div className="panel-body">
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Transaction ID</th>
                        <th>Direction</th>
                        <th>Property</th>
                        <th>Unit</th>
                        <th>Amount</th>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Status</th>
                        <th>Invoice / Voucher</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myPayments.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px' }}>
                            No payment transactions recorded yet.
                          </td>
                        </tr>
                      ) : (
                        myPayments.map((p) => {
                          const matchedInvoice = state.invoices.find(
                            (inv) =>
                              (p.invoiceId && inv.id === p.invoiceId) ||
                              (p.id && (inv.receiptNumber === p.id || p.id === `PAY-${inv.id}`)) ||
                              (inv.unit === p.unit &&
                                inv.total === p.amount &&
                                ((p.tenantId && inv.tenantId === p.tenantId) ||
                                  (user?.id && inv.tenantId === user.id) ||
                                  (!inv.tenantId && !p.tenantId && (!p.ownerId || inv.ownerId === p.ownerId))))
                          );

                          const matchedUnit = state.units.find(
                            (u) =>
                              (u.unitNumber === p.unit || u.id === p.unit) &&
                              (!p.ownerId || u.ownerId === p.ownerId) &&
                              (!matchedInvoice?.propertyId || u.propertyId === matchedInvoice.propertyId)
                          );
                          const matchedProp =
                            state.properties.find((prop) => prop.id === matchedUnit?.propertyId) ||
                            state.properties.find((prop) => prop.id === matchedInvoice?.propertyId);
                          const resolvedPropertyName =
                            matchedProp?.name ||
                            matchedUnit?.propertyName ||
                            matchedInvoice?.propertyName ||
                            tenantRecord?.propertyName ||
                            tenantRecord?.history?.[0]?.property ||
                            'Residential Complex';

                          const displayDate = p.date?.includes('T')
                            ? new Date(p.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
                            : p.date;

                          const isOutflow = p.direction === 'outflow' || p.type === 'deposit_refund';

                          const linkedClaim = p.cashClaimId ? (state.cashClaims || []).find((c) => c.id === p.cashClaimId) : null;
                          const isClaimRejected = linkedClaim?.status === 'rejected';
                          const isInvoiceReverted = Boolean(
                            matchedInvoice &&
                            matchedInvoice.status === 'sent' &&
                            (matchedInvoice.paymentProofNotes?.toLowerCase().includes('reject') ||
                             matchedInvoice.paymentProofNotes?.toLowerCase().includes('decline'))
                          );
                          const isDisputedOrDeclined = p.status === 'disputed' || isClaimRejected || isInvoiceReverted;
                          const rejectionReasonText =
                            linkedClaim?.rejectionReason ||
                            p.audit?.rejectionReason ||
                            (isInvoiceReverted ? matchedInvoice?.paymentProofNotes : null);

                          return (
                            <tr key={p.id}>
                              <td>
                                <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '12.5px', color: 'var(--ink)' }}>
                                  {p.id}
                                </div>
                                {p.invoiceId && (
                                  <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                                    Doc: <b style={{ color: p.invoiceId.startsWith('DEP-') ? '#B45309' : 'var(--ink)' }}>{p.invoiceId}</b>
                                  </div>
                                )}
                              </td>
                              <td>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    background: isOutflow ? '#F3E8FF' : '#DCFCE7',
                                    color: isOutflow ? '#7E22CE' : '#15803D',
                                  }}
                                >
                                  {isOutflow ? '↓ Outflow / Refund' : '↑ Inflow / Payment'}
                                </span>
                              </td>
                              <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{resolvedPropertyName}</td>
                              <td>Unit {p.unit}</td>
                              <td style={{ fontWeight: 700, color: isOutflow ? '#7E22CE' : 'var(--ink)' }}>
                                {isOutflow ? `+ ${getCurrencySymbol(p.currency) || resolvedCurrency}${p.amount?.toLocaleString('en-IN')}` : `${getCurrencySymbol(p.currency) || resolvedCurrency}${p.amount?.toLocaleString('en-IN')}`}
                              </td>
                              <td>{displayDate}</td>
                              <td>
                                <span style={{ fontWeight: 600, fontSize: '12px' }}>{p.method}</span>
                              </td>
                              <td>
                                <span
                                  className={`badge ${
                                    p.status === 'paid'
                                      ? 'green'
                                      : isDisputedOrDeclined
                                      ? 'red'
                                      : p.status === 'pending_confirmation'
                                      ? 'amber'
                                      : 'red'
                                  }`}
                                >
                                  {p.status === 'paid'
                                    ? 'Reconciled / Settled'
                                    : isDisputedOrDeclined
                                    ? 'Declined by Landlord'
                                    : p.status === 'pending_confirmation'
                                    ? 'Awaiting Confirmation'
                                    : 'Overdue'}
                                </span>
                                {isDisputedOrDeclined && rejectionReasonText && (
                                  <div
                                    style={{
                                      fontSize: '11px',
                                      color: '#DC2626',
                                      marginTop: '3px',
                                      maxWidth: '180px',
                                      lineHeight: 1.25,
                                    }}
                                    title={rejectionReasonText}
                                  >
                                    {rejectionReasonText.length > 50 ? `${rejectionReasonText.slice(0, 50)}...` : rejectionReasonText}
                                  </div>
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', padding: '4px 8px' }}
                                  onClick={() => {
                                    if (matchedInvoice) {
                                      setSelectedInvoiceForReceipt(matchedInvoice);
                                    } else {
                                      // Synthesize official payment voucher on-the-fly if standalone transaction
                                      const fallbackInv: Invoice = {
                                        id: p.invoiceId || `INV-${p.id.replace(/[^0-9]/g, '').slice(-4) || 'REC'}`,
                                        ownerId: p.ownerId || resolvedOwnerId,
                                        tenant: p.tenant || tenantName,
                                        tenantId: p.tenantId || user?.id || '',
                                        unit: p.unit || resolvedUnit,
                                        propertyName: resolvedPropertyName,
                                        invoiceType: p.type === 'deposit' ? 'deposit' : p.type === 'late_fee' ? 'late_fee' : 'rent',
                                        amount: p.amount,
                                        tax: 0,
                                        total: p.amount,
                                        due: p.dueDate || p.date,
                                        issueDate: p.date,
                                        paidAt: p.date,
                                        paymentMethodUsed: p.method,
                                        receiptNumber: p.id,
                                        status: p.status === 'paid' ? 'paid' : 'pending_confirmation',
                                        items: [
                                          {
                                            description: `${p.type === 'deposit' ? 'Security Deposit' : 'Monthly Rent'} Settlement — Unit ${p.unit} (${resolvedPropertyName})`,
                                            amount: p.amount,
                                          },
                                        ],
                                      };
                                      setSelectedInvoiceForReceipt(fallbackInv);
                                    }
                                  }}
                                >
                                  <FileText size={13} />
                                  {matchedInvoice ? `View ${matchedInvoice.id}` : 'View Voucher'}
                                </button>
                                {p.cashClaimId && (
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 7px', marginLeft: '5px' }}
                                    onClick={() => {
                                      const claim = (state.cashClaims || []).find((c) => c.id === p.cashClaimId);
                                      if (claim) {
                                        downloadCashHandoverReceiptPdf(claim, p);
                                      } else {
                                        showToast('Cash claim voucher data not found.');
                                      }
                                    }}
                                    title="Download Dual-Party Cash Handover Certificate"
                                  >
                                    <Download size={12} /> Cash Receipt
                                  </button>
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

              <div className="mobile-card-view">
                {myPayments.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '28px 16px' }}>
                    No payment transactions recorded yet.
                  </div>
                ) : (
                  myPayments.map((p) => {
                    const matchedInvoice = state.invoices.find(
                      (inv) =>
                        (p.invoiceId && inv.id === p.invoiceId) ||
                        (p.id && (inv.receiptNumber === p.id || p.id === `PAY-${inv.id}`)) ||
                        (inv.unit === p.unit &&
                          inv.total === p.amount &&
                          ((p.tenantId && inv.tenantId === p.tenantId) ||
                            (user?.id && inv.tenantId === user.id) ||
                            (!inv.tenantId && !p.tenantId && (!p.ownerId || inv.ownerId === p.ownerId))))
                    );

                    const matchedUnit = state.units.find(
                      (u) =>
                        (u.unitNumber === p.unit || u.id === p.unit) &&
                        (!p.ownerId || u.ownerId === p.ownerId) &&
                        (!matchedInvoice?.propertyId || u.propertyId === matchedInvoice.propertyId)
                    );
                    const matchedProp =
                      state.properties.find((prop) => prop.id === matchedUnit?.propertyId) ||
                      state.properties.find((prop) => prop.id === matchedInvoice?.propertyId);
                    const resolvedPropertyName =
                      matchedProp?.name ||
                      matchedUnit?.propertyName ||
                      matchedInvoice?.propertyName ||
                      tenantRecord?.propertyName ||
                      tenantRecord?.history?.[0]?.property ||
                      'Residential Complex';

                    const displayDate = p.date?.includes('T')
                      ? new Date(p.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
                      : p.date;

                    const isOutflow = p.direction === 'outflow' || p.type === 'deposit_refund';

                    const linkedClaim = p.cashClaimId ? (state.cashClaims || []).find((c) => c.id === p.cashClaimId) : null;
                    const isClaimRejected = linkedClaim?.status === 'rejected';
                    const isInvoiceReverted = Boolean(
                      matchedInvoice &&
                      matchedInvoice.status === 'sent' &&
                      (matchedInvoice.paymentProofNotes?.toLowerCase().includes('reject') ||
                       matchedInvoice.paymentProofNotes?.toLowerCase().includes('decline'))
                    );
                    const isDisputedOrDeclined = p.status === 'disputed' || isClaimRejected || isInvoiceReverted;
                    const rejectionReasonText =
                      linkedClaim?.rejectionReason ||
                      p.audit?.rejectionReason ||
                      (isInvoiceReverted ? matchedInvoice?.paymentProofNotes : null);

                    return (
                      <div key={p.id} className="staff-card">
                        <div className="staff-card-header">
                          <div>
                            <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '13px', color: 'var(--ink)' }}>
                              {p.id}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                              {resolvedPropertyName} • Unit {p.unit}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: isOutflow ? '#F3E8FF' : '#DCFCE7',
                              color: isOutflow ? '#7E22CE' : '#15803D',
                            }}
                          >
                            {isOutflow ? '↓ Refund' : '↑ Payment'}
                          </span>
                        </div>
                        <div className="staff-card-meta">
                          <div className="staff-card-meta-item">
                            <Calendar size={13} />
                            {displayDate}
                          </div>
                          <div className="staff-card-meta-item">
                            <CreditCard size={13} />
                            {p.method}
                          </div>
                          <span
                            className={`badge ${
                              p.status === 'paid'
                                ? 'green'
                                : isDisputedOrDeclined
                                ? 'red'
                                : p.status === 'pending_confirmation'
                                ? 'amber'
                                : 'red'
                            }`}
                          >
                            {p.status === 'paid'
                              ? 'Reconciled / Settled'
                              : isDisputedOrDeclined
                              ? 'Declined by Landlord'
                              : p.status === 'pending_confirmation'
                              ? 'Awaiting Confirmation'
                              : 'Overdue'}
                          </span>
                        </div>
                        {isDisputedOrDeclined && rejectionReasonText && (
                          <div
                            style={{
                              fontSize: '11.5px',
                              color: '#DC2626',
                              marginTop: '6px',
                              lineHeight: 1.3,
                              background: '#FEF2F2',
                              padding: '6px 10px',
                              borderRadius: '6px',
                            }}
                          >
                            <b>Reason:</b> {rejectionReasonText}
                          </div>
                        )}
                        <div className="staff-card-footer">
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Amount</div>
                            <div style={{ fontWeight: 800, fontSize: '16px', color: isOutflow ? '#7E22CE' : 'var(--ink)' }}>
                              {isOutflow ? `+ ${getCurrencySymbol(p.currency) || resolvedCurrency}${p.amount?.toLocaleString('en-IN')}` : `${getCurrencySymbol(p.currency) || resolvedCurrency}${p.amount?.toLocaleString('en-IN')}`}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn secondary small btn-mobile-full"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                              onClick={() => {
                                if (matchedInvoice) {
                                  setSelectedInvoiceForReceipt(matchedInvoice);
                                } else {
                                  const fallbackInv: Invoice = {
                                    id: p.invoiceId || `INV-${p.id.replace(/[^0-9]/g, '').slice(-4) || 'REC'}`,
                                    ownerId: p.ownerId || resolvedOwnerId,
                                    tenant: p.tenant || tenantName,
                                    tenantId: p.tenantId || user?.id || '',
                                    unit: p.unit || resolvedUnit,
                                    propertyName: resolvedPropertyName,
                                    invoiceType: p.type === 'deposit' ? 'deposit' : p.type === 'late_fee' ? 'late_fee' : 'rent',
                                    amount: p.amount,
                                    tax: 0,
                                    total: p.amount,
                                    due: p.dueDate || p.date,
                                    issueDate: p.date,
                                    paidAt: p.date,
                                    paymentMethodUsed: p.method,
                                    receiptNumber: p.id,
                                    status: p.status === 'paid' ? 'paid' : 'pending_confirmation',
                                    items: [
                                      {
                                        description: `${p.type === 'deposit' ? 'Security Deposit' : 'Monthly Rent'} Settlement — Unit ${p.unit} (${resolvedPropertyName})`,
                                        amount: p.amount,
                                      },
                                    ],
                                  };
                                  setSelectedInvoiceForReceipt(fallbackInv);
                                }
                              }}
                            >
                              <FileText size={13} /> View Voucher
                            </button>
                            {p.cashClaimId && (
                              <button
                                type="button"
                                className="btn secondary small btn-mobile-full"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => {
                                  const claim = (state.cashClaims || []).find((c) => c.id === p.cashClaimId);
                                  if (claim) {
                                    downloadCashHandoverReceiptPdf(claim, p);
                                  } else {
                                    showToast('Cash claim voucher data not found.');
                                  }
                                }}
                              >
                                <Download size={12} /> Cash Receipt
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {myPayments.some((p) => p.status === 'overdue') && (
            <div style={{ marginTop: '14px' }}>
              <button
                type="button"
                className="btn brass"
                onClick={() => {
                  const overdueInvoice = state.invoices.find((i) => {
                    const matchesTenant =
                      i.tenantId === user?.id ||
                      (user?.displayName && i.tenant?.toLowerCase() === user.displayName.toLowerCase()) ||
                      (tenantRecord && i.unit === tenantRecord.unit);
                    return matchesTenant && i.status !== 'paid' && i.status !== 'pending_confirmation';
                  });
                  if (overdueInvoice) {
                    setActivePayingInvoice(prepareInvoiceForPayment(overdueInvoice));
                  }
                  setSelectedMethod(ownerActiveGateway);
                  setCashHandoverLocation(`Unit ${resolvedUnit || 'Premises'} / On-Site Handover`);
                  setCashHandoverDate(new Date().toISOString().split('T')[0]);
                  setIsPayNowOpen(true);
                }}
              >
                Pay overdue balance
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Invoices & Bills */}
      {subTab === 'invoices' && (
        <div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Invoices & Billing Documents</h3>
                <div className="hint">
                  Official tax invoices and vouchers issued by your landlord for security deposit trust, utilities, and maintenance. For recurring monthly rent, visit the <b>Rent Due</b> tab.
                </div>
              </div>
            </div>
            <div className="panel-body">
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice ID</th>
                        <th>Description</th>
                        <th>Unit</th>
                        <th>Amount</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myTenantInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '40px' }}>
                            <FileText size={32} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                            No pending or past invoices issued for your unit yet. When your landlord issues an invoice, it will appear here.
                          </td>
                        </tr>
                      ) : (
                        myTenantInvoices.map((inv) => {
                          const isPaid = inv.status === 'paid';
                          const isOverdue = inv.status === 'overdue';

                          return (
                            <tr key={inv.id}>
                              <td>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.id}</span>
                              </td>
                              <td>
                                <b>
                                  {inv.invoiceType === 'deposit'
                                    ? 'Security Deposit'
                                    : inv.invoiceType === 'utility'
                                    ? 'Electricity & Water Utility'
                                    : inv.invoiceType === 'maintenance'
                                    ? 'Maintenance Deductions'
                                    : inv.invoiceType === 'late_fee'
                                    ? 'Late Fee Penalty'
                                    : 'Monthly Rent'}
                                </b>
                                <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                                  {inv.items?.[0]?.description || `Rental billing for unit ${inv.unit}`}
                                </div>
                              </td>
                              <td>Unit {inv.unit}</td>
                              <td>
                                <b style={{ fontSize: '15px' }}>{getInvoiceCurrencySymbol(inv)}{inv.total.toLocaleString()}</b>
                              </td>
                              <td>{inv.due}</td>
                              <td>
                                {isInvoiceForVacatedTenancy(inv) ? (
                                  <span className="badge grey" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-soft)', borderColor: 'var(--line)' }}>
                                    VOID / CONCLUDED
                                  </span>
                                ) : (
                                  <span className={`badge ${isPaid ? 'green' : isOverdue ? 'red' : inv.status === 'pending_confirmation' ? 'amber' : 'amber'}`}>
                                    {inv.status === 'pending_confirmation' ? 'PENDING VERIFICATION' : inv.status.toUpperCase()}
                                  </span>
                                )}
                                {inv.status === 'pending_confirmation' && inv.paymentProofRef && (
                                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px', fontFamily: 'monospace' }}>
                                    Ref: {inv.paymentProofRef}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => setSelectedInvoiceForReceipt(inv)}
                                  >
                                    View Voucher
                                  </button>
                                  {!isPaid && inv.status !== 'pending_confirmation' && !isInvoiceForVacatedTenancy(inv) && (
                                    (() => {
                                      const matchingAgForInvoice = inv.leaseAgreementId
                                        ? state.agreements.find((a) => a.id === inv.leaseAgreementId)
                                        : state.agreements.find(
                                            (a) => (a.unit === inv.unit || a.id === inv.unit) && (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail))
                                          );
                                      const isDepositAwaitingLeaseApproval =
                                        inv.invoiceType === 'deposit' &&
                                        matchingAgForInvoice &&
                                        matchingAgForInvoice.status !== 'pending_deposit' &&
                                        matchingAgForInvoice.status !== 'active';

                                      if (isDepositAwaitingLeaseApproval) {
                                        return (
                                          <span className="badge amber" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                                            Awaiting Lease Approval
                                          </span>
                                        );
                                      }

                                      return (
                                        <button
                                          type="button"
                                          className="btn brass small"
                                          onClick={() => {
                                            setActivePayingInvoice(prepareInvoiceForPayment(inv));
                                            setSelectedMethod(ownerActiveGateway);
                                            setCashHandoverLocation(`Unit ${resolvedUnit || inv.unit || 'Premises'} / On-Site Handover`);
                                            setCashHandoverDate(new Date().toISOString().split('T')[0]);
                                            setIsPayNowOpen(true);
                                          }}
                                        >
                                          Pay Now
                                        </button>
                                      );
                                    })()
                                  )}
                                  {isInvoiceForVacatedTenancy(inv) && !isPaid && (
                                    <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 500 }}>
                                      Concluded on Move-Out
                                    </span>
                                  )}
                                  {inv.status === 'pending_confirmation' && (
                                    <span style={{ fontSize: '11.5px', color: '#D97706', fontWeight: 600 }}>
                                      Awaiting Approval
                                    </span>
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

              <div className="mobile-card-view">
                {myTenantInvoices.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '28px 16px' }}>
                    <FileText size={30} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                    No pending or past invoices issued for your unit yet.
                  </div>
                ) : (
                  myTenantInvoices.map((inv) => {
                    const isPaid = inv.status === 'paid';
                    const isOverdue = inv.status === 'overdue';

                    return (
                      <div key={inv.id} className="staff-card">
                        <div className="staff-card-header">
                          <div>
                            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>
                              {inv.id}
                            </div>
                            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', marginTop: '2px' }}>
                              {inv.invoiceType === 'deposit'
                                ? 'Security Deposit'
                                : inv.invoiceType === 'utility'
                                ? 'Electricity & Water Utility'
                                : inv.invoiceType === 'maintenance'
                                ? 'Maintenance Deductions'
                                : inv.invoiceType === 'late_fee'
                                ? 'Late Fee Penalty'
                                : 'Monthly Rent'}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Unit {inv.unit}</div>
                          </div>
                          {isInvoiceForVacatedTenancy(inv) ? (
                            <span className="badge grey" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-soft)', borderColor: 'var(--line)' }}>
                              VOID
                            </span>
                          ) : (
                            <span className={`badge ${isPaid ? 'green' : isOverdue ? 'red' : inv.status === 'pending_confirmation' ? 'amber' : 'amber'}`}>
                              {inv.status === 'pending_confirmation' ? 'VERIFICATION' : inv.status.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="staff-card-meta">
                          <div className="staff-card-meta-item">
                            <Calendar size={13} />
                            Due: {inv.due}
                          </div>
                          {inv.status === 'pending_confirmation' && inv.paymentProofRef && (
                            <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontFamily: 'monospace' }}>
                              Ref: {inv.paymentProofRef}
                            </div>
                          )}
                        </div>
                        <div className="staff-card-footer">
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Total Amount</div>
                            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--ink)' }}>
                              {getInvoiceCurrencySymbol(inv)}{inv.total.toLocaleString()}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn secondary small btn-mobile-full"
                              onClick={() => setSelectedInvoiceForReceipt(inv)}
                            >
                              View Voucher
                            </button>
                            {!isPaid && inv.status !== 'pending_confirmation' && !isInvoiceForVacatedTenancy(inv) && (
                              (() => {
                                const matchingAgForInvoice = inv.leaseAgreementId
                                  ? state.agreements.find((a) => a.id === inv.leaseAgreementId)
                                  : state.agreements.find(
                                      (a) => (a.unit === inv.unit || a.id === inv.unit) && (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail))
                                    );
                                const isDepositAwaitingLeaseApproval =
                                  inv.invoiceType === 'deposit' &&
                                  matchingAgForInvoice &&
                                  matchingAgForInvoice.status !== 'pending_deposit' &&
                                  matchingAgForInvoice.status !== 'active';

                                if (isDepositAwaitingLeaseApproval) {
                                  return (
                                    <span className="badge amber btn-mobile-full" style={{ fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                      Awaiting Lease Approval
                                    </span>
                                  );
                                }

                                return (
                                  <button
                                    type="button"
                                    className="btn brass small btn-mobile-full"
                                    onClick={() => {
                                      setActivePayingInvoice(inv);
                                      setSelectedMethod(ownerActiveGateway);
                                      setCashHandoverLocation(`Unit ${resolvedUnit || inv.unit || 'Premises'} / On-Site Handover`);
                                      setCashHandoverDate(new Date().toISOString().split('T')[0]);
                                      setIsPayNowOpen(true);
                                    }}
                                  >
                                    Pay Now
                                  </button>
                                );
                              })()
                            )}
                            {isInvoiceForVacatedTenancy(inv) && !isPaid && (
                              <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 500 }}>
                                Concluded on Move-Out
                              </span>
                            )}
                            {inv.status === 'pending_confirmation' && (
                              <span style={{ fontSize: '11.5px', color: '#D97706', fontWeight: 600 }}>
                                Awaiting Approval
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Security Deposit */}
      {subTab === 'deposit' && (() => {
        const counts = {
          all: unifiedDepositRecords.length,
          paid: unifiedDepositRecords.filter((r) => r.statusCategory === 'paid' && (!r.moveOut || r.moveOut.status === 'refund_completed')).length,
          due: unifiedDepositRecords.filter((r) => r.statusCategory === 'due').length,
          moveout: unifiedDepositRecords.filter((r) => r.moveOut && r.moveOut.status !== 'refund_completed').length,
          refunded: unifiedDepositRecords.filter((r) => r.statusCategory === 'refunded' || r.status === 'refund_completed').length,
        };

        const filteredDeposits = unifiedDepositRecords.filter((rec) => {
          if (depositFilter === 'all') return true;
          if (depositFilter === 'paid') return rec.statusCategory === 'paid' && (!rec.moveOut || rec.moveOut.status === 'refund_completed');
          if (depositFilter === 'due') return rec.statusCategory === 'due';
          if (depositFilter === 'moveout') return Boolean(rec.moveOut && rec.moveOut.status !== 'refund_completed');
          if (depositFilter === 'refunded') return rec.statusCategory === 'refunded' || rec.status === 'refund_completed';
          return true;
        });

        const totalSecuredHeld = unifiedDepositRecords
          .filter((r) => r.status === 'paid')
          .reduce((sum, r) => sum + r.amount, 0);

        const activePropertiesCount = new Set(
          unifiedDepositRecords.filter((r) => r.status === 'paid').map((r) => r.propertyName)
        ).size;

        const pendingActionCount = unifiedDepositRecords.filter(
          (r) => r.status === 'due' || r.status === 'pending_confirmation' || (r.moveOut && r.moveOut.status !== 'refund_completed')
        ).length;

        return (
          <div>
            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Deposit Held</span>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', marginTop: '2px' }}>
                    {resolvedCurrency}{totalSecuredHeld.toLocaleString('en-IN')}
                  </div>
                  <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 500 }}>Secured in trust ledger</span>
                </div>
              </div>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--brass-soft)', color: 'var(--brass)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Building size={20} />
                </div>
                <div>
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Properties Covered</span>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', marginTop: '2px' }}>
                    {activePropertiesCount} {activePropertiesCount === 1 ? 'Property' : 'Properties'}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 500 }}>Active lease residences</span>
                </div>
              </div>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: pendingActionCount > 0 ? '#FEF3C7' : '#F1F5F9', color: pendingActionCount > 0 ? '#D97706' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Clock size={20} />
                </div>
                <div>
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending Actions</span>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: pendingActionCount > 0 ? '#D97706' : 'var(--ink)', marginTop: '2px' }}>
                    {pendingActionCount} {pendingActionCount === 1 ? 'Action' : 'Actions'}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 500 }}>
                    {pendingActionCount > 0 ? 'Payment or move-out resolution' : 'All deposits up-to-date'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Required: Awaiting Settlement Review Banner (ONLY before tenant submits claim) */}
            {unifiedDepositRecords.some((r) =>
              Boolean(
                r.settlement &&
                r.settlement.status === 'awaiting_tenant_approval' &&
                !r.settlement.tenantConfirmedReceipt &&
                !r.settlement.disbursedAt &&
                r.moveOut?.status !== 'refund_completed'
              )
            ) && (() => {
              const pendingSettleRec = unifiedDepositRecords.find((r) =>
                Boolean(
                  r.settlement &&
                  r.settlement.status === 'awaiting_tenant_approval' &&
                  !r.settlement.tenantConfirmedReceipt &&
                  !r.settlement.disbursedAt &&
                  r.moveOut?.status !== 'refund_completed'
                )
              );
              if (!pendingSettleRec || !pendingSettleRec.settlement) return null;
              const s = pendingSettleRec.settlement;
              return (
                <div
                  style={{
                    background: '#FFFBEB',
                    border: '2px solid var(--brass, #C59A45)',
                    borderRadius: '10px',
                    padding: '16px 20px',
                    marginBottom: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '14px',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#FEF3C7', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <AlertTriangle size={22} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#92400E' }}>
                        Action Required: Move-Out Settlement Awaiting Your Review
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>
                        Unit {s.unit} • {s.propertyName} — Net Refundable Balance: <b>{getCurrencySymbol(s.currency)}{s.netRefundableAmount.toLocaleString('en-IN')}</b>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        Please review landlord deductions and select your refund payout destination (UPI, Bank Wire, PayPal, or Cash) to enable disbursement.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn brass btn-mobile-full"
                    onClick={() => setSettlementForReview(s)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, padding: '10px 18px' }}
                  >
                    <CheckCircle2 size={16} /> Review Settlement &amp; Claim Refund →
                  </button>
                </div>
              );
            })()}

            {/* Action Required: Refund Disbursed - Awaiting Receipt Confirmation Banner */}
            {unifiedDepositRecords.some((r) =>
              Boolean(
                r.settlement &&
                r.status !== 'refund_completed' &&
                (r.settlement.status === 'refunded' || r.settlement.disbursedAt || r.moveOut?.status === 'refund_completed') &&
                !r.settlement.tenantConfirmedReceipt &&
                !((r.moveOut as any)?.tenantConfirmedReceipt) &&
                !confirmedSettlementIds.has(r.settlement.id) &&
                !confirmedSettlementIds.has(r.unit)
              )
            ) && (() => {
              const disbursedRec = unifiedDepositRecords.find((r) =>
                Boolean(
                  r.settlement &&
                  r.status !== 'refund_completed' &&
                  (r.settlement.status === 'refunded' || r.settlement.disbursedAt || r.moveOut?.status === 'refund_completed') &&
                  !r.settlement.tenantConfirmedReceipt &&
                  !((r.moveOut as any)?.tenantConfirmedReceipt) &&
                  !confirmedSettlementIds.has(r.settlement.id) &&
                  !confirmedSettlementIds.has(r.unit)
                )
              );
              if (!disbursedRec || !disbursedRec.settlement) return null;
              const s = disbursedRec.settlement;
              return (
                <div
                  style={{
                    background: '#F0FDF4',
                    border: '2px solid #16A34A',
                    borderRadius: '10px',
                    padding: '16px 20px',
                    marginBottom: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '14px',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#DCFCE7', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckCircle2 size={22} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#166534' }}>
                        ⚡ Refund Disbursed — Action Required: Confirm Receipt
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>
                        Unit {s.unit} • {s.propertyName} — Disbursed: <b>{getCurrencySymbol(s.currency)}{s.netRefundableAmount.toLocaleString('en-IN')}</b> via {(s.disbursementMethod || 'Direct Transfer').toUpperCase()}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        Your landlord has disbursed your refund. Please confirm receipt to conclude your tenancy.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn brass btn-mobile-full ${isConfirmingRefundReceipt ? 'btn-processing' : ''}`}
                      disabled={isConfirmingRefundReceipt}
                      onClick={() => handleDirectConfirmReceipt(s.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, padding: '10px 18px', background: '#16A34A', color: '#fff', border: 'none' }}
                    >
                      <CheckCircle2 size={16} /> {isConfirmingRefundReceipt ? 'Confirming...' : 'Confirm Receipt ✓'}
                    </button>
                    <button
                      type="button"
                      className="btn secondary btn-mobile-full"
                      onClick={() => setSettlementForReview(s)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 14px' }}
                    >
                      <Eye size={14} /> View
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Unified Security Deposit Table Panel */}
            <div className="panel" style={{ marginBottom: '22px' }}>
              <div className="panel-body">
                {/* Table Header & Filter Tabs */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '14px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShieldCheck size={18} color="var(--brass)" />
                      Security Deposit Ledger across Properties
                    </h4>
                    <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--ink-soft)' }}>
                      Complete records of refundable security deposits held in trust, settlement vouchers, and move-out refund status
                    </p>
                  </div>

                  {/* Filter Pills */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                      { id: 'all', label: 'All Deposits', count: counts.all },
                      { id: 'paid', label: 'Paid & Secured', count: counts.paid },
                      { id: 'due', label: 'Deposit Due', count: counts.due },
                      { id: 'moveout', label: 'Move-Out & Resolution', count: counts.moveout },
                      { id: 'refunded', label: 'Refunded / Settled', count: counts.refunded },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setDepositFilter(f.id as any)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: depositFilter === f.id ? 700 : 500,
                          border: depositFilter === f.id ? '1px solid var(--brass)' : '1px solid var(--line)',
                          background: depositFilter === f.id ? 'var(--brass)' : '#ffffff',
                          color: depositFilter === f.id ? '#ffffff' : 'var(--ink)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>{f.label}</span>
                        <span
                          style={{
                            fontSize: '10.5px',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: depositFilter === f.id ? 'rgba(255, 255, 255, 0.25)' : 'var(--surface-sunken, #f1f0eb)',
                            color: depositFilter === f.id ? '#ffffff' : 'var(--ink-soft)',
                          }}
                        >
                          {f.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table Content */}
                {filteredDeposits.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px 20px', background: '#FAFAF7', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <ShieldCheck size={36} style={{ margin: '0 auto 10px', display: 'block', color: 'var(--brass)', opacity: 0.6 }} />
                    <h4 style={{ margin: '0 0 6px', fontSize: '15px', color: 'var(--ink)' }}>
                      {depositFilter === 'moveout' ? 'No Move-Out in Progress' : 'No Security Deposits Found'}
                    </h4>
                    <p style={{ fontSize: '12.5px', color: 'var(--ink-soft)', maxWidth: '460px', margin: '0 auto 14px', lineHeight: 1.5 }}>
                      {depositFilter === 'moveout'
                        ? "You do not have any pending move-out notices or deposit refund settlements underway. When you're ready to vacate any of your units, you can initiate notice from My lease → Renew or vacate."
                        : `There are no security deposit records matching the selected filter (${depositFilter}).`}
                    </p>
                    {depositFilter === 'moveout' && (
                      <button
                        type="button"
                        className="btn brass small"
                        onClick={() => {
                          window.location.href = '/tenant/lease?tab=renew';
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Calendar size={13} /> Go to Renew or Vacate
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="desktop-table-view">
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                          <thead>
                            <tr style={{ background: 'var(--surface-sunken, #f9f8f5)' }}>
                              {['Reference', 'Unit & Property', 'Landlord / Owner', 'Deposit Amount', 'Status', 'Action'].map((h) => (
                                <th key={h} style={{ textAlign: 'left', padding: '9px 12px', fontWeight: 600, color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDeposits.map((rec, idx) => (
                              <tr key={rec.id} style={{ borderBottom: '1px solid var(--line)', background: idx % 2 === 0 ? '#ffffff' : 'var(--surface-sunken, #fbfaf8)' }}>
                                <td style={{ padding: '12px', fontWeight: 600, color: 'var(--brass)', whiteSpace: 'nowrap' }}>
                                  {rec.reference}
                                </td>
                                <td style={{ padding: '12px' }}>
                                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Unit {rec.unit}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{rec.propertyName}</div>
                                </td>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{rec.ownerName}</div>
                                </td>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)' }}>
                                    {getCurrencySymbol(rec.currency)}{(rec.amount || 0).toLocaleString('en-IN')}
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                    {rec.status === 'refund_completed'
                                      ? 'Refunded & Settled'
                                      : rec.status === 'due'
                                      ? 'Pending Payment'
                                      : rec.status === 'pending_confirmation'
                                      ? 'Awaiting Confirmation'
                                      : rec.moveOut
                                      ? 'Held in Trust (Move-Out)'
                                      : 'Held in Trust'}
                                  </div>
                                </td>
                                <td style={{ padding: '12px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '3px 10px',
                                        borderRadius: '999px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        background: rec.statusBg,
                                        color: rec.statusColor,
                                        width: 'fit-content',
                                      }}
                                    >
                                      {rec.statusBadgeText}
                                    </span>
                                    {rec.moveOut ? (
                                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Calendar size={11} />
                                        {rec.moveOut.status === 'requested'
                                          ? `Notice: Vacate ${rec.moveOut.moveOutDate || 'Pending'}`
                                          : rec.moveOut.status === 'inspection_scheduled'
                                          ? `Inspection: ${rec.moveOut.inspectionDate || 'Scheduled'}`
                                          : rec.moveOut.status === 'inspected'
                                          ? 'Inspection Completed • Settlement Pending'
                                          : rec.moveOut.status === 'refund_scheduled' || rec.moveOut.status === 'awaiting_tenant_approval' || rec.moveOut.status === 'settlement_pending'
                                          ? `Refund target: ${rec.moveOut.refundDate || 'Pending'}`
                                          : rec.moveOut.status === 'refund_completed'
                                          ? `Disbursed: ${getCurrencySymbol(rec.currency) || resolvedCurrency}${(rec.moveOut.finalRefundAmount || rec.amount).toLocaleString('en-IN')}`
                                          : `Move-Out: ${rec.moveOut.moveOutDate || '—'}`}
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                        {rec.status === 'paid'
                                          ? 'Active tenancy • Secured'
                                          : rec.status === 'pending_confirmation'
                                          ? 'Payment verification in review'
                                          : 'Pending payment'}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <button
                                      type="button"
                                      className="btn secondary small"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                      onClick={() => setSelectedDepositRecordForView(rec)}
                                    >
                                      <Eye size={13} /> View
                                    </button>
                                    {/* 1. Review & Claim - ONLY if awaiting tenant review, not yet refunded/disbursed, and receipt not confirmed */}
                                    {rec.settlement &&
                                      rec.settlement.status === 'awaiting_tenant_approval' &&
                                      !rec.settlement.tenantConfirmedReceipt &&
                                      !rec.settlement.disbursedAt &&
                                      rec.moveOut?.status !== 'refund_completed' && (
                                        <button
                                          type="button"
                                          className="btn brass small"
                                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                                          onClick={() => setSettlementForReview(rec.settlement!)}
                                        >
                                          <CheckCircle2 size={13} /> Review &amp; Claim
                                        </button>
                                      )}
                                     {/* 2. Confirm Receipt - ONLY if refunded / disbursed AND tenant has NOT confirmed receipt yet */}
                                     {rec.settlement &&
                                       rec.status !== 'refund_completed' &&
                                       (rec.settlement.status === 'refunded' || rec.settlement.disbursedAt || rec.moveOut?.status === 'refund_completed') &&
                                       !rec.settlement.tenantConfirmedReceipt &&
                                       !((rec.moveOut as any)?.tenantConfirmedReceipt) &&
                                       !confirmedSettlementIds.has(rec.settlement.id) &&
                                       !confirmedSettlementIds.has(rec.unit) && (
                                         <button
                                           type="button"
                                           className={`btn brass small ${isConfirmingRefundReceipt ? "btn-processing" : ""}`}
                                           disabled={isConfirmingRefundReceipt}
                                           style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, background: '#16A34A', color: '#fff', border: 'none' }}
                                           onClick={() => handleDirectConfirmReceipt(rec.settlement!.id)}
                                         >
                                           <CheckCircle2 size={13} /> {isConfirmingRefundReceipt ? "Confirming..." : "Confirm Receipt"}
                                         </button>
                                       )}
                                     {/* 3. Settlement Voucher / Settlement Breakdown */}
                                     {rec.settlement &&
                                       (rec.status === 'refund_completed' ||
                                         rec.settlement.tenantConfirmedReceipt ||
                                         Boolean((rec.moveOut as any)?.tenantConfirmedReceipt) ||
                                         confirmedSettlementIds.has(rec.settlement.id) ||
                                         confirmedSettlementIds.has(rec.unit) ||
                                         (rec.settlement.status === 'approved' && !rec.settlement.disbursedAt && rec.moveOut?.status !== 'refund_completed') ||
                                         (Boolean(rec.settlement.chosenPayoutDetails) && !rec.settlement.disbursedAt && rec.settlement.status !== 'refunded' && rec.moveOut?.status !== 'refund_completed') ||
                                         rec.settlement.status === 'rejected' ||
                                         rec.settlement.status === 'contested') && (
                                         <button
                                           type="button"
                                           className="btn secondary small"
                                           style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                           onClick={() => setSettlementForReview(rec.settlement!)}
                                         >
                                           {rec.status === 'refund_completed' || rec.settlement.tenantConfirmedReceipt || Boolean((rec.moveOut as any)?.tenantConfirmedReceipt) || confirmedSettlementIds.has(rec.settlement.id) || confirmedSettlementIds.has(rec.unit)
                                             ? 'Settlement Voucher'
                                             : 'Settlement'}
                                         </button>
                                       )}
                                    {rec.status === 'due' && rec.depositInvoice && (
                                      rec.isLeaseApproved === false ? (
                                        <span className="badge amber" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                                          Awaiting Lease Approval
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="btn brass small"
                                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                          onClick={() => {
                                            setActivePayingInvoice(rec.depositInvoice!);
                                            setSelectedMethod(ownerActiveGateway);
                                            setCashHandoverLocation(`Unit ${rec.unit || 'Premises'} / On-Site Handover`);
                                            setCashHandoverDate(new Date().toISOString().split('T')[0]);
                                            setIsPayNowOpen(true);
                                          }}
                                        >
                                          <CreditCard size={12} /> Pay Now
                                        </button>
                                      )
                                    )}
                                    {rec.depositInvoice && (
                                      <button
                                        type="button"
                                        className="btn secondary small"
                                        title="View Official Voucher / Tax Receipt"
                                        style={{ padding: '5px 8px' }}
                                        onClick={() => setSelectedInvoiceForReceipt(rec.depositInvoice!)}
                                      >
                                        <Receipt size={13} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="mobile-card-view">
                      {filteredDeposits.map((rec) => (
                        <div key={rec.id} className="staff-card">
                          <div className="staff-card-header">
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--brass)', fontSize: '13px' }}>
                                {rec.reference}
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginTop: '2px' }}>
                                Unit {rec.unit} • {rec.propertyName}
                              </div>
                              <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>Owner: {rec.ownerName}</div>
                            </div>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 10px',
                                borderRadius: '999px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: rec.statusBg,
                                color: rec.statusColor,
                                width: 'fit-content',
                              }}
                            >
                              {rec.statusBadgeText}
                            </span>
                          </div>
                          <div className="staff-card-meta">
                            {rec.moveOut ? (
                              <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Calendar size={12} />
                                {rec.moveOut.status === 'requested'
                                  ? `Notice: Vacate ${rec.moveOut.moveOutDate || 'Pending'}`
                                  : rec.moveOut.status === 'inspection_scheduled'
                                  ? `Inspection: ${rec.moveOut.inspectionDate || 'Scheduled'}`
                                  : rec.moveOut.status === 'inspected'
                                  ? 'Inspection Completed • Settlement Pending'
                                  : rec.moveOut.status === 'refund_scheduled' || rec.moveOut.status === 'awaiting_tenant_approval' || rec.moveOut.status === 'settlement_pending'
                                  ? `Refund target: ${rec.moveOut.refundDate || 'Pending'}`
                                  : rec.moveOut.status === 'refund_completed'
                                  ? `Disbursed: ${getCurrencySymbol(rec.currency) || resolvedCurrency}${(rec.moveOut.finalRefundAmount || rec.amount).toLocaleString('en-IN')}`
                                  : `Move-Out: ${rec.moveOut.moveOutDate || '—'}`}
                              </div>
                            ) : (
                              <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                                {rec.status === 'paid'
                                  ? 'Active tenancy • Secured'
                                  : rec.status === 'pending_confirmation'
                                  ? 'Payment verification in review'
                                  : 'Pending payment'}
                              </div>
                            )}
                          </div>
                          <div className="staff-card-footer">
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>Deposit Amount</div>
                              <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--ink)' }}>
                                {getCurrencySymbol(rec.currency)}{(rec.amount || 0).toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn secondary small btn-mobile-full"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => setSelectedDepositRecordForView(rec)}
                              >
                                <Eye size={13} /> View
                              </button>
                              {/* 1. Review & Claim Refund - Mobile */}
                              {rec.settlement &&
                                rec.settlement.status === 'awaiting_tenant_approval' &&
                                !rec.settlement.tenantConfirmedReceipt &&
                                !rec.settlement.disbursedAt &&
                                rec.moveOut?.status !== 'refund_completed' && (
                                  <button
                                    type="button"
                                    className="btn brass small btn-mobile-full"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                                    onClick={() => setSettlementForReview(rec.settlement!)}
                                  >
                                    <CheckCircle2 size={13} /> Review &amp; Claim Refund
                                  </button>
                                )}
                              {/* 2. Confirm Receipt - Mobile */}
                              {rec.settlement &&
                                rec.status !== 'refund_completed' &&
                                (rec.settlement.status === 'refunded' || rec.settlement.disbursedAt || rec.moveOut?.status === 'refund_completed') &&
                                !rec.settlement.tenantConfirmedReceipt &&
                                !((rec.moveOut as any)?.tenantConfirmedReceipt) &&
                                !confirmedSettlementIds.has(rec.settlement.id) &&
                                !confirmedSettlementIds.has(rec.unit) && (
                                  <button
                                    type="button"
                                    className={`btn brass small btn-mobile-full ${isConfirmingRefundReceipt ? 'btn-processing' : ''}`}
                                    disabled={isConfirmingRefundReceipt}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, background: '#16A34A', color: '#fff', border: 'none' }}
                                    onClick={() => handleDirectConfirmReceipt(rec.settlement!.id)}
                                  >
                                    <CheckCircle2 size={13} /> {isConfirmingRefundReceipt ? 'Confirming...' : 'Confirm Receipt'}
                                  </button>
                                )}
                              {/* 3. Settlement Voucher / Settlement Breakdown - Mobile */}
                              {rec.settlement &&
                                (rec.settlement.tenantConfirmedReceipt ||
                                  (rec.settlement.status === 'approved' && !rec.settlement.disbursedAt && rec.moveOut?.status !== 'refund_completed') ||
                                  (Boolean(rec.settlement.chosenPayoutDetails) && !rec.settlement.disbursedAt && rec.settlement.status !== 'refunded' && rec.moveOut?.status !== 'refund_completed') ||
                                  rec.settlement.status === 'rejected' ||
                                  rec.settlement.status === 'contested') && (
                                  <button
                                    type="button"
                                    className="btn secondary small btn-mobile-full"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => setSettlementForReview(rec.settlement!)}
                                  >
                                    {rec.settlement.tenantConfirmedReceipt ? 'Settlement Voucher' : 'Settlement'}
                                  </button>
                                )}
                              {rec.status === 'due' && rec.depositInvoice && (
                                rec.isLeaseApproved === false ? (
                                  <span className="badge amber btn-mobile-full" style={{ fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                    Awaiting Lease Approval
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn brass small btn-mobile-full"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => {
                                      setActivePayingInvoice(rec.depositInvoice!);
                                      setSelectedMethod(ownerActiveGateway);
                                      setCashHandoverLocation(`Unit ${rec.unit || 'Premises'} / On-Site Handover`);
                                      setCashHandoverDate(new Date().toISOString().split('T')[0]);
                                      setIsPayNowOpen(true);
                                    }}
                                  >
                                    <CreditCard size={12} /> Pay Now
                                  </button>
                                )
                              )}
                              {rec.depositInvoice && (
                                <button
                                  type="button"
                                  className="btn secondary small btn-mobile-full"
                                  title="View Official Voucher / Tax Receipt"
                                  style={{ padding: '5px 8px' }}
                                  onClick={() => setSelectedInvoiceForReceipt(rec.depositInvoice!)}
                                >
                                  <Receipt size={13} /> Voucher
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Dynamic Pay Rent / Settle Invoice Modal */}
      {isPayNowOpen && (() => {
        const overduePay = state.payments.find(
          (p) =>
            p.status === 'overdue' &&
            ((user?.id && p.tenantId === user.id) ||
              (tenantEmail && p.tenant?.toLowerCase() === tenantEmail) ||
              (resolvedUnit && p.unit === resolvedUnit)) &&
            (!resolvedOwnerId || !p.ownerId || p.ownerId === resolvedOwnerId)
        );
        const effectiveAmount = activePayingInvoice
          ? activePayingInvoice.total
          : (overduePay ? overduePay.amount : (resolvedMonthlyRent || tenantRecord?.rent || 0));
        const effectiveCurrency = getCurrencySymbol(activePayingInvoice?.currency || currentDueItem?.currency || overduePay?.currency || resolvedCurrency) || DEFAULT_CURRENCY_SYMBOL;
        const effectiveInvoiceType = activePayingInvoice?.invoiceType || (overduePay ? 'overdue_balance' : 'rent');
        const modalTitle =
          effectiveInvoiceType === 'deposit'
            ? 'Pay Security Deposit'
            : effectiveInvoiceType === 'utility'
            ? 'Pay Utility Invoice'
            : effectiveInvoiceType === 'maintenance'
            ? 'Settle Maintenance Invoice'
            : effectiveInvoiceType === 'late_fee'
            ? 'Pay Late Fee Penalty'
            : effectiveInvoiceType === 'overdue_balance'
            ? 'Pay Overdue Balance'
            : 'Pay Monthly Rent';

        const hasMethodCredentials = (methodKey: string) => {
          if (methodKey === 'cash') return true;
          if (methodKey === 'upi') return !!(m.upi?.upiId);
          if (methodKey === 'bank') return !!(m.bank?.accountNumber);
          if (methodKey === 'easebuzz') return !!((m.easebuzz?.merchantKey && m.easebuzz?.salt) || (state.platformGateways.easebuzz?.merchantKey && state.platformGateways.easebuzz?.salt));
          if (methodKey === 'paypal') return !!(m.paypal?.email || m.paypal?.clientId || state.platformGateways.paypal?.clientId);
          if (methodKey === 'razorpay') return !!(m.razorpay?.keyId || state.platformGateways.razorpay?.keyId);
          if (methodKey === 'stripe') return !!(m.stripe?.pubKey || state.platformGateways.stripe?.pubKey);
          return true;
        };

        const upiPayLink = m.upi?.upiId
          ? `upi://pay?pa=${encodeURIComponent(m.upi.upiId)}&pn=${encodeURIComponent(m.upi?.merchantName || tenantRecord?.owner || 'Propithub Property Owner')}&am=${effectiveAmount}&cu=INR&tn=${encodeURIComponent(`Invoice ${activePayingInvoice?.id || resolvedUnit}`)}`
          : null;

        return (
          <div className="modal-backdrop" onClick={() => setIsPayNowOpen(false)}>
            <div className="modal-card" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h3 style={{ margin: 0 }}>{modalTitle}</h3>
                  <div className="hint" style={{ fontSize: '12px', marginTop: '2px' }}>
                    {activePayingInvoice ? `Invoice Ref: ${activePayingInvoice.id}` : `Unit ${resolvedUnit} • ${tenantRecord?.propertyName || 'Rental Property'}`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setIsPayNowOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                {/* Dynamic itemized invoice summary card */}
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px dashed var(--line)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600 }}>Billing Destination</span>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>
                      {tenantRecord?.owner || 'Property Management'} (Unit {resolvedUnit})
                    </span>
                  </div>

                  {activePayingInvoice ? (
                    <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)' }}>
                        <span>Subtotal / Base Charge:</span>
                        <span>{effectiveCurrency}{activePayingInvoice.amount?.toLocaleString('en-IN')}</span>
                      </div>
                      {(activePayingInvoice.tax || 0) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)' }}>
                          <span>Tax / GST:</span>
                          <span>+ {effectiveCurrency}{activePayingInvoice.tax?.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {(activePayingInvoice.lateFeeApplied || 0) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                          <span>Late Fee Penalty ({activePayingInvoice.lateFeeCalculation || 'Overdue'}):</span>
                          <span>+ {effectiveCurrency}{activePayingInvoice.lateFeeApplied?.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {activePayingInvoice.lateFeeWaived && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--green)', fontSize: '11.5px' }}>
                          <span>Late Fee Status:</span>
                          <span>✓ Waived by Landlord</span>
                        </div>
                      )}
                      {activePayingInvoice.due && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)', fontSize: '11.5px' }}>
                          <span>Due Date:</span>
                          <span>{activePayingInvoice.due}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-soft)' }}>
                        <span>Charge Description:</span>
                        <span>{overduePay ? 'Outstanding Ledger Balance' : 'Monthly Scheduled Rent'}</span>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--line)', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700 }}>Total Payable Amount:</span>
                      <CurrencyConverterTrigger amount={effectiveAmount} currency={effectiveCurrency} label="Convert" />
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)' }}>
                      {effectiveCurrency}{effectiveAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Dynamic Multi-Gateway Payment Choices */}
                <div style={{ marginTop: '14px', marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span>Choose Payment Gateway / Channel</span>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 500 }}>
                      {availableGateways.length} active settlement option{availableGateways.length === 1 ? '' : 's'}
                    </span>
                  </label>

                  {/* Interactive Dynamic Gateway Cards Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: availableGateways.length > 2 ? 'repeat(auto-fill, minmax(145px, 1fr))' : 'repeat(2, 1fr)',
                      gap: '10px',
                      marginBottom: '10px',
                    }}
                  >
                    {availableGateways.map((gw) => {
                      const isSelected = selectedMethod === gw.key;
                      return (
                        <div
                          key={gw.key}
                          onClick={() => setSelectedMethod(gw.key)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: isSelected ? '2px solid var(--primary)' : '1px solid var(--line)',
                            background: isSelected ? 'rgba(47, 93, 80, 0.06)' : 'var(--bg)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '4px' }}>
                              <span style={{ fontSize: '12.5px', fontWeight: 700, color: isSelected ? 'var(--primary)' : 'var(--ink)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span>{gw.icon}</span> {gw.shortTitle}
                              </span>
                              <span className={`badge ${gw.badgeClass}`} style={{ fontSize: '9px', padding: '1px 5px', flexShrink: 0 }}>
                                {gw.badge}
                              </span>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--ink-soft)', lineHeight: 1.3 }}>
                              {gw.subtitle}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Synchronized Select Dropdown */}
                  <select
                    value={selectedMethod}
                    onChange={(e) => setSelectedMethod(e.target.value)}
                    style={{ fontWeight: 600, fontSize: '13px', padding: '9px 12px' }}
                  >
                    {availableGateways.map((gw) => (
                      <option key={gw.key} value={gw.key}>
                        {gw.icon} {gw.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Conditional UI based on Selection */}
                {selectedMethod === 'cash' ? (
                  /* DIRECT CASH HANDOVER PROTOCOL */
                  <div style={{ marginTop: '10px', padding: '14px', background: '#FEFDF8', border: '1px solid #FEF08A', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <AlertCircle size={16} color="#CA8A04" style={{ flexShrink: 0 }} />
                      <b style={{ fontSize: '13px', color: '#854D0E' }}>Direct Cash Handover Protocol</b>
                    </div>
                    <p className="hint" style={{ fontSize: '12px', marginBottom: '12px', color: '#713F12', lineHeight: 1.4 }}>
                      {m.cash?.instructions || `Hand physical cash of ${effectiveCurrency}${effectiveAmount.toLocaleString('en-IN')} directly to your landlord or property manager. Once submitted, your landlord will receive a confirmation alert with one-click approval to generate your official voucher.`}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '10px', marginBottom: '10px' }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                          Handover Date <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <input
                          type="date"
                          value={cashHandoverDate}
                          onChange={(e) => setCashHandoverDate(e.target.value)}
                          required
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                          Handover Location / Premises <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={cashHandoverLocation}
                          onChange={(e) => setCashHandoverLocation(e.target.value)}
                          placeholder="e.g. Unit 102 / Leasing Office"
                          required
                        />
                      </div>
                    </div>

                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                        Cash Receipt / Voucher Slip Reference <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={offlineRef}
                        onChange={(e) => setOfflineRef(e.target.value)}
                        placeholder="e.g. Cash Voucher #, Slip #, or 'In-Person Handover'"
                        required
                      />
                    </div>

                    <div className="field" style={{ marginBottom: '10px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 600 }}>
                        Upload Signed Cash Slip / Receipt Photo (Optional)
                      </label>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              const compressed = await compressImage(file, 1000, 1000, 0.7);
                              if (compressed) {
                                setOfflineProofUrl(compressed);
                              } else {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  if (typeof reader.result === 'string') {
                                    setOfflineProofUrl(reader.result);
                                  }
                                };
                                reader.readAsDataURL(file);
                              }
                            } catch (_) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === 'string') {
                                  setOfflineProofUrl(reader.result);
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }
                        }}
                      />
                      {offlineProofUrl && (
                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img
                            src={offlineProofUrl}
                            alt="Receipt Preview"
                            style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--line)' }}
                          />
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => setOfflineProofUrl('')}
                            style={{ color: 'var(--danger)', fontSize: '11px' }}
                          >
                            Remove Photo
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 600 }}>Handover Notes / Remarks (Optional)</label>
                      <input
                        type="text"
                        value={offlineNotes}
                        onChange={(e) => setOfflineNotes(e.target.value)}
                        placeholder="e.g. Handed cash to building manager in lobby"
                      />
                    </div>
                  </div>
                ) : (
                  /* DYNAMICALLY SELECTED GATEWAY DETAILS */
                  <div>
                    <div style={{ marginTop: '10px', background: 'var(--bg)', padding: '12px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
                      {selectedMethod === 'upi' && (
                        <div>
                          {m.upi?.upiId ? (
                            <div>
                              <p className="hint" style={{ margin: '0 0 8px 0', fontSize: '12.5px', color: 'var(--ink)' }}>
                                Pay <b>{effectiveCurrency}{effectiveAmount.toLocaleString('en-IN')}</b> to UPI VPA: <b style={{ color: 'var(--primary)' }}>{m.upi.upiId}</b>
                                {m.upi?.merchantName ? ` (${m.upi.merchantName})` : ''}
                              </p>
                              {m.upi?.qrImage ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px' }}>
                                  <img
                                    src={m.upi.qrImage}
                                    alt="Landlord UPI QR"
                                    style={{ width: '120px', height: '120px', objectFit: 'contain', border: '1px solid var(--line)', borderRadius: '6px', background: 'var(--surface)', padding: '4px' }}
                                  />
                                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                                      <QrCode size={14} /> Landlord's Official Payment QR
                                    </div>
                                    Scan with any UPI app (Google Pay, PhonePe, Paytm) to transfer directly to the landlord's account.
                                  </div>
                                </div>
                              ) : upiPayLink ? (
                                <p className="hint" style={{ margin: '6px 0 0 0', fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                                  Open your UPI app and transfer exactly {effectiveCurrency}{effectiveAmount.toLocaleString('en-IN')} to <code>{m.upi.upiId}</code>, then submit the 12-digit UTR below.
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#B45309' }}>
                              <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                              <div style={{ fontSize: '12px' }}>
                                <b>UPI Details Not Configured</b>: The landlord has not saved a UPI VPA. Please select another method or Direct Cash.
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {selectedMethod === 'bank' && (
                        <div>
                          {m.bank?.accountNumber ? (
                            <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div><b>Account Name:</b> {m.bank?.accountName || tenantRecord?.owner || 'Property Owner'}</div>
                              {m.bank?.bankName && <div><b>Bank Name:</b> {m.bank.bankName}</div>}
                              <div><b>Account Number:</b> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{m.bank.accountNumber}</span></div>
                              {m.bank?.routing && <div><b>IFSC / Routing:</b> <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{m.bank.routing}</span></div>}
                              <div style={{ color: 'var(--ink-soft)', fontSize: '11.5px', marginTop: '4px' }}>
                                Transfer {effectiveCurrency}{effectiveAmount.toLocaleString('en-IN')} via IMPS/NEFT/RTGS, then paste your transfer reference number below.
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#B45309' }}>
                              <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                              <div style={{ fontSize: '12px' }}>
                                <b>Bank Details Not Configured</b>: The landlord has not configured bank transfer coordinates. Please select another method or Direct Cash.
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {selectedMethod === 'paypal' && (
                        <div>
                          {m.paypal?.email ? (
                            <p className="hint" style={{ margin: 0, fontSize: '12.5px' }}>
                              Send payment to Landlord PayPal: <b style={{ color: 'var(--primary)' }}>{m.paypal.email}</b>
                            </p>
                          ) : (
                            <p className="hint" style={{ margin: 0, fontSize: '12.5px' }}>
                              You will be connected to PayPal's secure checkout window to authorize {effectiveCurrency}{effectiveAmount.toLocaleString('en-IN')}.
                            </p>
                          )}
                        </div>
                      )}

                      {(selectedMethod === 'razorpay' || selectedMethod === 'stripe' || selectedMethod === 'easebuzz') && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShieldCheck size={16} color="var(--primary)" />
                            <p className="hint" style={{ margin: 0, fontSize: '12px', color: 'var(--ink)' }}>
                              Secure SSL checkout. Clicking below will open verified {selectedMethod === 'easebuzz' ? 'Easebuzz (Cards, Netbanking & UPI)' : selectedMethod === 'razorpay' ? 'Razorpay' : 'Stripe'} window for {effectiveCurrency}{effectiveAmount.toLocaleString('en-IN')}.
                            </p>
                          </div>
                          {!hasMethodCredentials(selectedMethod) && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#B45309', marginTop: '8px' }}>
                              <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                              <div style={{ fontSize: '12px' }}>
                                <b>Gateway Keys Not Configured</b>: Your landlord enabled this gateway, but has not entered live API credentials yet. Please choose another active method (such as Cash or Bank Wire) or contact your landlord.
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Offline Remittance Proof & UTR Inputs (For UPI / Bank only) */}
                    {(selectedMethod === 'upi' || selectedMethod === 'bank') && (
                      <div style={{ marginTop: '14px', padding: '12px 14px', background: '#FFFDF5', border: '1px solid #FEF08A', borderRadius: 'var(--radius)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                          <AlertCircle size={14} color="#CA8A04" />
                          <b style={{ fontSize: '12.5px', color: '#854D0E' }}>Bank / UPI Remittance Reference Required</b>
                        </div>
                        <p className="hint" style={{ fontSize: '11.5px', marginBottom: '10px', color: '#713F12' }}>
                          This submission marks the payment as <b>Pending Verification</b> until confirmed by your landlord.
                        </p>

                        <div className="field" style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600 }}>
                            Transaction Reference / 12-digit UTR <span style={{ color: 'var(--danger)' }}>*</span>
                          </label>
                          <input
                            type="text"
                            value={offlineRef}
                            onChange={(e) => setOfflineRef(e.target.value)}
                            placeholder="e.g. 12-digit UPI UTR or IMPS Ref"
                            required
                          />
                        </div>

                        <div className="field" style={{ marginBottom: '10px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600 }}>
                            Upload Transfer Screenshot / Receipt (Optional)
                          </label>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                try {
                                  const compressed = await compressImage(file, 1000, 1000, 0.7);
                                  if (compressed) {
                                    setOfflineProofUrl(compressed);
                                  } else {
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      if (typeof reader.result === 'string') {
                                        setOfflineProofUrl(reader.result);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                } catch (_) {
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    if (typeof reader.result === 'string') {
                                      setOfflineProofUrl(reader.result);
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }
                            }}
                          />
                          {offlineProofUrl && (
                            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <img
                                src={offlineProofUrl}
                                alt="Proof Preview"
                                style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--line)' }}
                              />
                              <button
                                type="button"
                                className="btn secondary small"
                                onClick={() => setOfflineProofUrl('')}
                                style={{ color: 'var(--danger)', fontSize: '11px' }}
                              >
                                Remove Proof
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="field" style={{ margin: 0 }}>
                          <label style={{ fontSize: '12px', fontWeight: 600 }}>Payment Remarks / Note</label>
                          <input
                            type="text"
                            value={offlineNotes}
                            onChange={(e) => setOfflineNotes(e.target.value)}
                            placeholder="e.g. Paid via PhonePe / GPay"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {['stripe', 'razorpay', 'easebuzz', 'paypal'].includes(selectedMethod) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px 14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius)', border: '1px solid var(--line)', marginTop: '14px' }}>
                    <input
                      type="checkbox"
                      checked={enableAutopayInCheckout}
                      onChange={(e) => setEnableAutopayInCheckout(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>Save as Active Mandate for Monthly Autopay</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                        Automatically debit future monthly rent via {selectedMethod.toUpperCase()} (T-48h advance notice before each debit).
                      </div>
                    </div>
                  </label>
                )}
              </div>

              <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn secondary btn-mobile-full"
                  onClick={() => setIsPayNowOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn brass btn-mobile-full ${isProcessing ? 'btn-processing' : ''}`}
                  onClick={handleConfirmPay}
                  disabled={
                    isProcessing ||
                    (selectedMethod === 'cash' && !offlineRef.trim()) ||
                    ((selectedMethod === 'upi' || selectedMethod === 'bank') && !offlineRef.trim()) ||
                    !hasMethodCredentials(selectedMethod)
                  }
                >
                  <ButtonProcessing
                    loading={isProcessing}
                    loadingText="Connecting & Processing..."
                    defaultText={
                      selectedMethod === 'cash'
                        ? `Submit Cash Handover Claim (${effectiveCurrency}${effectiveAmount.toLocaleString('en-IN')})`
                        : selectedMethod === 'upi'
                        ? `Submit UPI Remittance (${effectiveCurrency}${effectiveAmount.toLocaleString('en-IN')})`
                        : selectedMethod === 'bank'
                        ? `Submit Bank Wire Proof (${effectiveCurrency}${effectiveAmount.toLocaleString('en-IN')})`
                        : selectedMethod === 'easebuzz'
                        ? `Pay ${effectiveCurrency}${effectiveAmount.toLocaleString('en-IN')} via Easebuzz`
                        : selectedMethod === 'razorpay'
                        ? `Pay ${effectiveCurrency}${effectiveAmount.toLocaleString('en-IN')} via Razorpay`
                        : selectedMethod === 'stripe'
                        ? `Pay ${effectiveCurrency}${effectiveAmount.toLocaleString('en-IN')} via Stripe`
                        : `Pay ${effectiveCurrency}${effectiveAmount.toLocaleString('en-IN')} via PayPal`
                    }
                  />
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      </div>

      {/* View / Print Tenant Rental Invoice & Receipt Modal */}
      {selectedInvoiceForReceipt && (
        <div className="modal-backdrop tenant-invoice-modal-backdrop" onClick={() => setSelectedInvoiceForReceipt(null)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '840px',
              width: '100%',
              padding: 0,
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Top Controls Bar */}
            <div
              className="no-print"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 24px',
                background: 'var(--surface)',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="var(--brass)" />
                <span style={{ fontWeight: 700, fontSize: '15px' }}>Official Tax Invoice & Receipt Voucher</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={14} /> Print / Save PDF
                </button>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setSelectedInvoiceForReceipt(null)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Canvas */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 20px',
                background: '#EEF0EC',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              {/* Payment Proof / Settlement Status Banner */}
              {selectedInvoiceForReceipt.status === 'paid' ? (
                <div className="no-print" style={{ width: '100%', maxWidth: '820px', background: 'var(--ledger-soft)', border: '1px solid var(--ledger)', padding: '14px 18px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px', boxSizing: 'border-box' }}>
                  <CheckCircle2 size={20} color="var(--ledger)" />
                  <div>
                    <b>Payment Confirmed:</b> Settled via {selectedInvoiceForReceipt.paymentMethodUsed || 'Online Payment Gateway'}.<br />
                    <span style={{ fontSize: '12px', color: 'var(--ink)' }}>Receipt Ref: {selectedInvoiceForReceipt.receiptNumber || 'RCPT-CONFIRMED'}</span>
                  </div>
                </div>
              ) : selectedInvoiceForReceipt.status === 'pending_confirmation' ? (
                <div className="no-print" style={{ width: '100%', maxWidth: '820px', background: 'var(--amber-soft)', border: '1px solid var(--amber)', padding: '14px 18px', borderRadius: '8px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={18} color="var(--amber)" />
                    <b style={{ color: 'var(--amber)' }}>Offline Payment Proof Submitted — Pending Landlord Confirmation</b>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: '1.5' }}>
                    <div>Transaction UTR / Reference: <b>{selectedInvoiceForReceipt.paymentProofRef || 'Direct Transfer'}</b></div>
                    {selectedInvoiceForReceipt.paymentProofDate && (
                      <div>Submitted on: {new Date(selectedInvoiceForReceipt.paymentProofDate).toLocaleDateString()}</div>
                    )}
                    {selectedInvoiceForReceipt.paymentProofNotes && (
                      <div>Remarks: {selectedInvoiceForReceipt.paymentProofNotes}</div>
                    )}
                  </div>
                  {selectedInvoiceForReceipt.paymentProofUrl && (
                    <div style={{ marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-soft)' }}>Uploaded Proof:</span>
                      <div style={{ marginTop: '4px' }}>
                        <img
                          src={selectedInvoiceForReceipt.paymentProofUrl}
                          alt="Submitted Proof"
                          style={{ maxWidth: '140px', maxHeight: '100px', objectFit: 'contain', border: '1px solid var(--line)', borderRadius: '4px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="no-print" style={{ width: '100%', maxWidth: '820px', background: '#FFFBEB', border: '1px solid #FDE68A', padding: '14px 18px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px', boxSizing: 'border-box' }}>
                  <Clock size={20} color="#D97706" />
                  <div>
                    <b>Payment Pending:</b> Please pay before {selectedInvoiceForReceipt.due} to avoid automatic late fee penalties.
                  </div>
                </div>
              )}

              {/* Exact Same Official Tax Invoice Document as Owner Portal */}
              <RentalInvoiceDocument invoice={selectedInvoiceForReceipt} />
            </div>

            {/* Modal Bottom Actions */}
            <div
              className="no-print"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 24px',
                background: 'var(--surface)',
                borderTop: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => downloadSingleInvoicePDF(selectedInvoiceForReceipt)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={14} /> Download PDF
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => window.print()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={14} /> Print / Save PDF
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedInvoiceForReceipt.status !== 'paid' && selectedInvoiceForReceipt.status !== 'pending_confirmation' && (
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      const inv = selectedInvoiceForReceipt;
                      setSelectedInvoiceForReceipt(null);
                      setActivePayingInvoice(inv);
                      setSelectedMethod(ownerActiveGateway);
                      setCashHandoverLocation(`Unit ${resolvedUnit || inv.unit || 'Premises'} / On-Site Handover`);
                      setCashHandoverDate(new Date().toISOString().split('T')[0]);
                      setIsPayNowOpen(true);
                    }}
                  >
                    Pay Invoice Now
                  </button>
                )}
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => setSelectedInvoiceForReceipt(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Security Deposit Record Detail Modal */}
      {selectedDepositRecordForView && (
        <div className="modal-backdrop" onClick={() => setSelectedDepositRecordForView(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={22} color="var(--brass)" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px' }}>Security Deposit Record Details</h3>
                  <span className="hint" style={{ fontSize: '12px' }}>
                    Unit {selectedDepositRecordForView.unit} • {selectedDepositRecordForView.propertyName} ({selectedDepositRecordForView.reference})
                  </span>
                </div>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setSelectedDepositRecordForView(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Status Header */}
              <div
                style={{
                  background: selectedDepositRecordForView.statusBg,
                  border: `1px solid ${selectedDepositRecordForView.statusColor}33`,
                  borderRadius: 'var(--radius)',
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: selectedDepositRecordForView.statusColor }}>
                      {selectedDepositRecordForView.statusBadgeText}
                    </h4>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--ink)' }}>
                      {selectedDepositRecordForView.status === 'refund_completed' &&
                        `Security deposit of ${getCurrencySymbol(selectedDepositRecordForView.currency)}${(selectedDepositRecordForView.amount || 0).toLocaleString('en-IN')} has been settled and refunded upon concluded tenancy.`}
                      {selectedDepositRecordForView.status === 'refund_scheduled' &&
                        `Move-out inspection concluded. Refund settlement of ${getCurrencySymbol(selectedDepositRecordForView.currency)}${(selectedDepositRecordForView.amount || 0).toLocaleString('en-IN')} is scheduled for disbursement.`}
                      {selectedDepositRecordForView.status === 'paid' &&
                        `Refundable security deposit of ${getCurrencySymbol(selectedDepositRecordForView.currency)}${(selectedDepositRecordForView.amount || 0).toLocaleString('en-IN')} is secured in the platform client trust ledger.`}
                      {selectedDepositRecordForView.status === 'pending_confirmation' &&
                        'Payment proof submitted by resident. Landlord is verifying bank transfer receipt before issuing finalized confirmation.'}
                      {selectedDepositRecordForView.status === 'due' &&
                        `Move-in deposit of ${getCurrencySymbol(selectedDepositRecordForView.currency)}${(selectedDepositRecordForView.amount || 0).toLocaleString('en-IN')} is due pursuant to the approved tenancy agreement.`}
                    </p>
                  </div>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: 'var(--surface)',
                      color: selectedDepositRecordForView.statusColor,
                      border: `1px solid ${selectedDepositRecordForView.statusColor}44`,
                    }}
                  >
                    {selectedDepositRecordForView.statusBadgeText}
                  </span>
                </div>
              </div>

              {/* Deposit Key Information Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-soft)', fontSize: '12px', marginBottom: '4px' }}>
                    <Building size={14} /> Leased Property &amp; Unit
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                    Unit {selectedDepositRecordForView.unit}
                  </div>
                  <div className="hint" style={{ fontSize: '11.5px', marginTop: '2px' }}>
                    {selectedDepositRecordForView.propertyName}
                  </div>
                </div>

                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-soft)', fontSize: '12px', marginBottom: '4px' }}>
                    <ShieldCheck size={14} /> Custodian / Landlord
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
                    {selectedDepositRecordForView.ownerName}
                  </div>
                  <div className="hint" style={{ fontSize: '11.5px', marginTop: '2px' }}>
                    Direct trust holder
                  </div>
                </div>

                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-soft)', fontSize: '12px', marginBottom: '4px' }}>
                    <CreditCard size={14} /> Deposit Amount Held
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--brass)' }}>
                    {getCurrencySymbol(selectedDepositRecordForView.currency)}{(selectedDepositRecordForView.amount || 0).toLocaleString('en-IN')}
                  </div>
                  <div className="hint" style={{ fontSize: '11.5px', marginTop: '2px' }}>
                    Refundable upon checkout
                  </div>
                </div>

                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ink-soft)', fontSize: '12px', marginBottom: '4px' }}>
                    <Calendar size={14} /> Timeline &amp; Dates
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                    {selectedDepositRecordForView.paidAt
                      ? `Paid on ${new Date(selectedDepositRecordForView.paidAt).toLocaleDateString()}`
                      : selectedDepositRecordForView.dueDate
                      ? `Due on ${selectedDepositRecordForView.dueDate}`
                      : 'Pending Execution'}
                  </div>
                  <div className="hint" style={{ fontSize: '11.5px', marginTop: '2px' }}>
                    {selectedDepositRecordForView.depositInvoice?.id || selectedDepositRecordForView.reference}
                  </div>
                </div>
              </div>

              {/* Trust Details Breakdown */}
              <div className="panel" style={{ background: '#FAF9F5', border: '1px solid var(--line)' }}>
                <div className="panel-body" style={{ padding: '16px 20px' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700 }}>
                    Platform Trust Ledger &amp; Custody Terms
                  </h4>
                  <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Security Deposit Classification</span>
                    <span>100% Refundable Security Deposit</span>
                  </div>
                  <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Custody Mechanism</span>
                    <span>Held by Landlord directly with cryptographic platform timestamping</span>
                  </div>
                  {selectedDepositRecordForView.depositInvoice?.receiptNumber && (
                    <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                      <span className="k" style={{ color: 'var(--ink-soft)' }}>Official Receipt Voucher Number</span>
                      <span style={{ fontWeight: 600, color: 'var(--brass)' }}>{selectedDepositRecordForView.depositInvoice.receiptNumber}</span>
                    </div>
                  )}
                  {selectedDepositRecordForView.depositInvoice?.paymentMethodUsed && (
                    <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                      <span className="k" style={{ color: 'var(--ink-soft)' }}>Settlement Channel</span>
                      <span>{selectedDepositRecordForView.depositInvoice.paymentMethodUsed}</span>
                    </div>
                  )}
                  <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Refund Eligibility</span>
                    <span>Full refund disbursed upon move-out walkthrough inspection and keys handover</span>
                  </div>
                </div>
              </div>

              {/* Move-out deduction breakdown if applicable */}
              {selectedDepositRecordForView.moveOut?.outcome && (
                <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 20px', background: 'var(--surface)' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 700 }}>
                    Move-Out Settlement &amp; Deduction Summary
                  </h4>
                  {selectedDepositRecordForView.moveOut.outcome.type === 'refund' ? (
                    <p style={{ margin: 0, fontSize: '13px', color: '#16A34A', fontWeight: 600 }}>
                      ✓ Full deposit refund of {getCurrencySymbol(selectedDepositRecordForView.currency)}{(selectedDepositRecordForView.amount || 0).toLocaleString('en-IN')} approved without deductions.
                    </p>
                  ) : (
                    <div>
                      <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: 'var(--danger)', fontSize: '13px' }}>
                        <span className="k">Itemized Deduction</span>
                        <span>-{getCurrencySymbol(selectedDepositRecordForView.currency)}{(selectedDepositRecordForView.moveOut.outcome.amount || 0).toLocaleString('en-IN')} ({selectedDepositRecordForView.moveOut.outcome.reason || 'Restoration/cleaning'})</span>
                      </div>
                      <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 700, fontSize: '13.5px' }}>
                        <span className="k">Final Disbursed Refund</span>
                        <span style={{ color: '#16A34A' }}>{getCurrencySymbol(selectedDepositRecordForView.currency)}{(selectedDepositRecordForView.moveOut.outcome.refundRemaining || 0).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Move-out deposit settlement breakdown if applicable */}
              {selectedDepositRecordForView.settlement && (
                <div style={{ border: '2px solid var(--brass, #C59A45)', borderRadius: 'var(--radius)', padding: '16px 20px', background: '#FFFDF9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--brass)' }}>
                      Move-Out Security Deposit Settlement
                    </h4>
                    <span className={`badge ${selectedDepositRecordForView.settlement.tenantConfirmedReceipt ? 'green' : (selectedDepositRecordForView.settlement.status === 'refunded' || selectedDepositRecordForView.settlement.disbursedAt) ? 'amber' : selectedDepositRecordForView.settlement.status === 'approved' ? 'brass' : selectedDepositRecordForView.settlement.status === 'contested' ? 'red' : 'amber'}`}>
                      {selectedDepositRecordForView.settlement.tenantConfirmedReceipt
                        ? '✓ Confirmed & Settled'
                        : (selectedDepositRecordForView.settlement.status === 'refunded' || selectedDepositRecordForView.settlement.disbursedAt)
                        ? '⚡ Refund Disbursed'
                        : selectedDepositRecordForView.settlement.status === 'approved' || selectedDepositRecordForView.settlement.chosenPayoutDetails
                        ? '✓ Accepted by Tenant'
                        : selectedDepositRecordForView.settlement.status === 'contested'
                        ? '⚠️ Deductions Contested'
                        : '⚠️ Action Required'}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '10px' }}>
                    Initial Deposit: <b>{getCurrencySymbol(selectedDepositRecordForView.settlement.currency)}{selectedDepositRecordForView.settlement.grossDepositHeld.toLocaleString('en-IN')}</b> • Deductions: <b style={{ color: 'var(--danger)' }}>- {getCurrencySymbol(selectedDepositRecordForView.settlement.currency)}{selectedDepositRecordForView.settlement.totalDeductions.toLocaleString('en-IN')}</b> • Net Refund: <b style={{ color: 'var(--ledger)' }}>{getCurrencySymbol(selectedDepositRecordForView.settlement.currency)}{selectedDepositRecordForView.settlement.netRefundableAmount.toLocaleString('en-IN')}</b>
                  </div>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      const s = selectedDepositRecordForView.settlement;
                      setSelectedDepositRecordForView(null);
                      setSettlementForReview(s);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontWeight: 600,
                      background: (selectedDepositRecordForView.settlement.status === 'refunded' || selectedDepositRecordForView.settlement.disbursedAt) && !selectedDepositRecordForView.settlement.tenantConfirmedReceipt ? '#16A34A' : undefined,
                      color: (selectedDepositRecordForView.settlement.status === 'refunded' || selectedDepositRecordForView.settlement.disbursedAt) && !selectedDepositRecordForView.settlement.tenantConfirmedReceipt ? '#FFFFFF' : undefined,
                    }}
                  >
                    <CheckCircle2 size={13} />
                    {selectedDepositRecordForView.settlement.status === 'awaiting_tenant_approval'
                      ? 'Review & Claim Refund Now →'
                      : (selectedDepositRecordForView.settlement.status === 'refunded' || selectedDepositRecordForView.settlement.disbursedAt) && !selectedDepositRecordForView.settlement.tenantConfirmedReceipt
                      ? 'Confirm Receipt Now →'
                      : 'View Settlement Breakdown'}
                  </button>
                </div>
              )}
            </div>

            {/* Modal Foot Actions */}
            <div
              className="modal-foot"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 24px',
                background: 'var(--surface-sunken)',
                borderTop: '1px solid var(--line)',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div>
                {selectedDepositRecordForView.depositInvoice && (
                  <button
                    type="button"
                    className="btn secondary small btn-mobile-full"
                    onClick={() => {
                      const inv = selectedDepositRecordForView.depositInvoice;
                      setSelectedDepositRecordForView(null);
                      setSelectedInvoiceForReceipt(inv);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Receipt size={14} /> View Official Tax Voucher
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedDepositRecordForView.status === 'due' && selectedDepositRecordForView.depositInvoice && (
                  <button
                    type="button"
                    className="btn brass small btn-mobile-full"
                    onClick={() => {
                      const inv = selectedDepositRecordForView.depositInvoice;
                      setSelectedDepositRecordForView(null);
                      setActivePayingInvoice(inv);
                      setSelectedMethod(ownerActiveGateway);
                      setCashHandoverLocation(`Unit ${inv.unit || 'Premises'} / On-Site Handover`);
                      setCashHandoverDate(new Date().toISOString().split('T')[0]);
                      setIsPayNowOpen(true);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <CreditCard size={14} /> Pay Deposit Now
                  </button>
                )}
                <button
                  type="button"
                  className="btn secondary btn-mobile-full"
                  onClick={() => setSelectedDepositRecordForView(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Settlement Review & Dispute Modal */}
      {settlementForReview && (
        <DepositSettlementReviewModal
          settlement={settlementForReview}
          onClose={() => setSettlementForReview(null)}
        />
      )}

      {/* Change Tenant Autopay Payment Method Modal */}
      {isTenantAutopayModalOpen && activeAgreement && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '520px' }}>
            <div className="modal-head">
              <h3>Change Rent Autopay Payment Method</h3>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => setIsTenantAutopayModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                Choose your preferred payment method for recurring monthly rent debits. 
                Propithub automatically cancels your previous mandate to guarantee <strong>zero double-charging</strong>.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {availableTenantGateways.map((gw) => {
                  const isSelected = selectedTenantGateway === gw.key;
                  return (
                    <div
                      key={gw.key}
                      onClick={() => setSelectedTenantGateway(gw.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid var(--brass, #c5a059)' : '1px solid var(--line)',
                        background: isSelected ? 'rgba(197, 160, 89, 0.08)' : 'var(--surface-sunken)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {gw.icon ? <span style={{ fontSize: '24px' }}>{gw.icon}</span> : null}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>
                            {gw.name}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                            {gw.description}
                          </div>
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="tenantAutopayGateway"
                        checked={isSelected}
                        onChange={() => setSelectedTenantGateway(gw.key)}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Interactive Mandate Authorization Form */}
              <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px' }}>
                {selectedTenantGateway === 'stripe' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Credit / Debit Card
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Name on Card</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Cardholder Full Name"
                        value={mandateCardName}
                        onChange={(e) => setMandateCardName(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Card Number</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="4242 •••• •••• 4242"
                        maxLength={19}
                        value={mandateCardNumber}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                          const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
                          setMandateCardNumber(formatted);
                        }}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', letterSpacing: '1px' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Expiry</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="MM/YY"
                          maxLength={5}
                          value={mandateCardExpiry}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                            if (val.length >= 3) val = `${val.slice(0, 2)}/${val.slice(2)}`;
                            setMandateCardExpiry(val);
                          }}
                          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>CVV / CVC</label>
                        <input
                          type="password"
                          className="input"
                          placeholder="•••"
                          maxLength={4}
                          value={mandateCardCvv}
                          onChange={(e) => setMandateCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleLaunchLiveStripeMandate}
                      disabled={isProcessing}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #635BFF, #4F46E5)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        boxShadow: '0 2px 8px rgba(99, 91, 255, 0.25)',
                      }}
                    >
                      Authorize
                    </button>
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <Lock size={12} color="var(--teal-primary)" /> 256-bit SSL tokenization. Raw card details are never stored on Propithub servers.
                    </div>
                  </div>
                )}

                {selectedTenantGateway === 'razorpay' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setMandateRzpSubMode('upi')}
                        style={{
                          flex: 1,
                          padding: '7px 12px',
                          borderRadius: '6px',
                          border: mandateRzpSubMode === 'upi' ? '1.5px solid var(--teal-primary)' : '1px solid var(--line)',
                          background: mandateRzpSubMode === 'upi' ? 'var(--teal-light)' : 'var(--surface)',
                          color: mandateRzpSubMode === 'upi' ? 'var(--teal-primary)' : 'var(--ink-soft)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        UPI AutoPay
                      </button>
                      <button
                        type="button"
                        onClick={() => setMandateRzpSubMode('card')}
                        style={{
                          flex: 1,
                          padding: '7px 12px',
                          borderRadius: '6px',
                          border: mandateRzpSubMode === 'card' ? '1.5px solid var(--teal-primary)' : '1px solid var(--line)',
                          background: mandateRzpSubMode === 'card' ? 'var(--teal-light)' : 'var(--surface)',
                          color: mandateRzpSubMode === 'card' ? 'var(--teal-primary)' : 'var(--ink-soft)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Debit / Credit Card
                      </button>
                    </div>

                    {mandateRzpSubMode === 'upi' ? (
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>
                          UPI ID / Virtual Payment Address (VPA)
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. mobile@okhdfcbank or rahul@paytm"
                          value={mandateUpiId}
                          onChange={(e) => setMandateUpiId(e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)', marginBottom: '8px' }}
                        />
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {['@okhdfcbank', '@okicici', '@okaxis', '@ybl', '@paytm'].map((handle) => (
                            <button
                              key={handle}
                              type="button"
                              onClick={() => {
                                const userPart = mandateUpiId.includes('@') ? mandateUpiId.split('@')[0] : mandateUpiId || 'resident';
                                setMandateUpiId(`${userPart}${handle}`);
                              }}
                              style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', color: 'var(--ink)', cursor: 'pointer' }}
                            >
                              {handle}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--teal-primary)', marginTop: '6px' }}>
                          ✓ An authorization request for recurring debits will be approved securely via your UPI app (Google Pay / PhonePe / BHIM).
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Card Number</label>
                          <input
                            type="text"
                            className="input"
                            placeholder="RuPay / Visa / Mastercard"
                            maxLength={19}
                            value={mandateCardNumber}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                              const formatted = val.match(/.{1,4}/g)?.join(' ') || val;
                              setMandateCardNumber(formatted);
                            }}
                            style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Expiry</label>
                            <input
                              type="text"
                              className="input"
                              placeholder="MM/YY"
                              maxLength={5}
                              value={mandateCardExpiry}
                              onChange={(e) => {
                                let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                if (val.length >= 3) val = `${val.slice(0, 2)}/${val.slice(2)}`;
                                setMandateCardExpiry(val);
                              }}
                              style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>CVV</label>
                            <input
                              type="password"
                              className="input"
                              placeholder="•••"
                              maxLength={3}
                              value={mandateCardCvv}
                              onChange={(e) => setMandateCardCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
                              style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleLaunchLiveRazorpayMandate}
                      disabled={isProcessing}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #10B981, #059669)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      Authorize
                    </button>
                  </div>
                )}

                {selectedTenantGateway === 'easebuzz' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      e-NACH NetBanking
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Primary Bank</label>
                      <select
                        className="input"
                        value={mandateBankName}
                        onChange={(e) => setMandateBankName(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                      >
                        <option value="HDFC Bank">HDFC Bank</option>
                        <option value="State Bank of India">State Bank of India</option>
                        <option value="ICICI Bank">ICICI Bank</option>
                        <option value="Axis Bank">Axis Bank</option>
                        <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                        <option value="Punjab National Bank">Punjab National Bank</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Savings Account Number</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Bank Account Number"
                        value={mandateAccountNum}
                        onChange={(e) => setMandateAccountNum(e.target.value.replace(/\D/g, ''))}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>Bank IFSC Code</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g. HDFC0001234"
                        value={mandateIfsc}
                        onChange={(e) => setMandateIfsc(e.target.value.toUpperCase())}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleLaunchLiveEasebuzzMandate}
                      disabled={isProcessing}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #0A58CA, #084298)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        boxShadow: '0 2px 8px rgba(10, 88, 202, 0.25)',
                      }}
                    >
                      Authorize
                    </button>
                  </div>
                )}

                {selectedTenantGateway === 'paypal' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      PayPal
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)', marginBottom: '4px' }}>PayPal Account Email</label>
                      <input
                        type="email"
                        className="input"
                        placeholder="user@example.com"
                        value={mandatePaypalEmail}
                        onChange={(e) => setMandatePaypalEmail(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', color: 'var(--ink)' }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleLaunchLivePayPalMandate}
                      disabled={isProcessing}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        background: 'linear-gradient(135deg, #003087, #0079C1)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '6px',
                        boxShadow: '0 2px 8px rgba(0, 48, 135, 0.25)',
                      }}
                    >
                      Authorize
                    </button>
                  </div>
                )}
              </div>

              {/* Legal e-Mandate Consent Checkbox */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12px', color: 'var(--ink)', cursor: 'pointer', lineHeight: 1.5 }}>
                <input
                  type="checkbox"
                  checked={mandateConsentChecked}
                  onChange={(e) => setMandateConsentChecked(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  I authorize automatic monthly rent payments of <strong>{activeAgreement.currency || '₹'}{(activeAgreement.rent || 0).toLocaleString()}</strong> on my rent due date (day {activeAgreement.rentDueDay || 1}). You can pause or cancel anytime.
                </span>
              </label>

              <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', color: 'var(--ink)' }}>
                ℹ️ Strictly 1 active mandate per lease agreement. Switching payment methods seamlessly updates your bank authorization with zero interruption.
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setIsTenantAutopayModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                disabled={isProcessing}
                onClick={() => handleSwitchTenantGateway(selectedTenantGateway)}
              >
                {isProcessing ? 'Authorizing...' : 'Authorize'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
