import React, { useState, useEffect } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { DepositSettlement, SettlementPayoutDetails } from '../../types';
import { downloadDepositSettlementPdf } from '../../lib/pdf';
import { normalizeCurrencyCode, getCurrencySymbol, getLocaleForCurrency, DEFAULT_CURRENCY_SYMBOL } from '../../lib/currencyService';
import {
  X,
  Check,
  AlertTriangle,
  Download,
  Landmark,
  CreditCard,
  Building,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  Shield,
  FileText,
  Clock,
  ExternalLink,
  XCircle,
  Info,
} from 'lucide-react';
import { ButtonProcessing } from './Spinner';

interface DepositSettlementReviewModalProps {
  settlement: DepositSettlement;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DepositSettlementReviewModal: React.FC<DepositSettlementReviewModalProps> = ({
  settlement,
  onClose,
  onSuccess,
}) => {
  const { state, respondToDepositSettlement, confirmRefundReceipt, confirmCashClaim, rejectCashClaim, showToast } = useAppData();
  const { user } = useAuth();

  const currencySymbol = getCurrencySymbol(settlement.currency) || DEFAULT_CURRENCY_SYMBOL;
  const locale = getLocaleForCurrency(settlement.currency);
  const liveSettlement = (state.depositSettlements || []).find((s) => s.id === settlement.id) || settlement;
  const activeSettle = liveSettlement;

  const [isConfirmingReceipt, setIsConfirmingReceipt] = useState(false);
  const isDisbursed = activeSettle.status === 'refunded' || Boolean(activeSettle.disbursedAt);
  const hasConfirmedReceipt = Boolean(activeSettle.tenantConfirmedReceipt);

  const cleanUnit = (u?: string) => (u || '').replace(/^(unit|apt|#)\s*/i, '').trim().toLowerCase();
  const matchingCashClaim = (state.cashClaims || []).find((c) => {
    const isPending = c.status === 'pending_confirmation' || (c as any).status === 'pending';
    if (!isPending) return false;
    if (c.settlementId && (c.settlementId === settlement.id || settlement.id.includes(c.settlementId) || c.settlementId.includes(settlement.id))) return true;
    if ((settlement as any).cashClaimId && c.id === (settlement as any).cashClaimId) return true;
    if (c.moveOutId && settlement.id.includes(c.moveOutId)) return true;
    if (c.unit && settlement.unit && cleanUnit(c.unit) === cleanUnit(settlement.unit) && (c.type === 'deposit_refund' || c.claimedByRole === 'owner')) return true;
    return false;
  });

  const isCashConfirmationPending =
    !hasConfirmedReceipt &&
    (activeSettle.status === 'awaiting_tenant_cash_confirmation' ||
      !!matchingCashClaim ||
      (activeSettle.chosenPayoutDetails?.method === 'cash' && activeSettle.status !== 'refunded'));
  const isAwaitingReview = activeSettle.status === 'awaiting_tenant_approval' || activeSettle.status === 'draft';
  const isAlreadyResolved =
    !isAwaitingReview &&
    (activeSettle.status === 'approved' ||
      activeSettle.status === 'refunded' ||
      Boolean(activeSettle.tenantConfirmedReceipt) ||
      Boolean(activeSettle.disbursedAt) ||
      isCashConfirmationPending);
  const isRejected = activeSettle.status === 'rejected' || activeSettle.status === 'contested';

  // Mode: 'approve' (accept & payout) vs 'reject' (reject deductions and request recalculation)
  const [activeTab, setActiveTab] = useState<'approve' | 'reject'>('approve');

  // Existing payout profile if configured
  const existingProfile = (state.payoutProfiles || []).find(
    (p) => p.tenantId === user?.id || p.tenantId === settlement.tenantId
  );

  // Form states - Payout
  const defaultMethod: 'upi' | 'bank_in' | 'iban' | 'paypal' | 'cash' = (() => {
    if (activeSettle.chosenPayoutDetails?.method) return activeSettle.chosenPayoutDetails.method;
    if (existingProfile?.channel === 'upi') return 'upi';
    if (existingProfile?.channel === 'bank_in') return 'bank_in';
    if (existingProfile?.channel === 'paypal') return 'paypal';
    if (existingProfile?.channel === 'iban_eu') return 'iban';
    const isIndia = normalizeCurrencyCode(settlement.currency) === 'INR';
    return isIndia ? 'upi' : 'paypal';
  })();

  const [payoutMethod, setPayoutMethod] = useState<'upi' | 'bank_in' | 'iban' | 'paypal' | 'cash'>(defaultMethod);
  const [accountHolderName, setAccountHolderName] = useState(
    activeSettle.chosenPayoutDetails?.accountHolderName || existingProfile?.accountHolderName || user?.displayName || settlement.tenantName || ''
  );
  const [upiId, setUpiId] = useState(activeSettle.chosenPayoutDetails?.upiId || existingProfile?.upiId || '');
  const [accountNumber, setAccountNumber] = useState(activeSettle.chosenPayoutDetails?.accountNumber || existingProfile?.accountNumber || '');
  const [ifscCode, setIfscCode] = useState(activeSettle.chosenPayoutDetails?.ifscCode || existingProfile?.ifscCode || '');
  const [bankName, setBankName] = useState(existingProfile?.bankName || '');
  const [paypalEmail, setPaypalEmail] = useState(activeSettle.chosenPayoutDetails?.paypalEmail || existingProfile?.paypalEmail || user?.email || '');
  const [iban, setIban] = useState(activeSettle.chosenPayoutDetails?.iban || existingProfile?.iban || '');
  const [swiftBic, setSwiftBic] = useState(activeSettle.chosenPayoutDetails?.swiftBic || existingProfile?.swiftBic || '');
  const [notes, setNotes] = useState('');

  // Form states - Reject
  const [rejectReason, setRejectReason] = useState(settlement.rejectionReason || settlement.notes || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCashConfirming, setIsCashConfirming] = useState(false);
  const [formError, setFormError] = useState('');

  // Handle Acceptance & Payout Submission
  const handleApproveSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!accountHolderName.trim()) {
      setFormError('Please enter the recipient account holder name.');
      return;
    }

    if (payoutMethod === 'upi') {
      const trimmedUpi = upiId.trim();
      if (!trimmedUpi || !trimmedUpi.includes('@')) {
        setFormError('Please enter a valid UPI ID (e.g., yourname@oksbi or 9876543210@paytm).');
        return;
      }
    } else if (payoutMethod === 'bank_in') {
      if (!accountNumber.trim()) {
        setFormError('Please enter the bank account number.');
        return;
      }
      if (!ifscCode.trim() || ifscCode.trim().length < 6) {
        setFormError('Please enter a valid IFSC code (e.g., HDFC0001234).');
        return;
      }
    } else if (payoutMethod === 'paypal') {
      const trimmedEmail = paypalEmail.trim();
      if (!trimmedEmail || !trimmedEmail.includes('@')) {
        setFormError('Please enter a valid PayPal account email address.');
        return;
      }
    } else if (payoutMethod === 'iban') {
      if (!iban.trim() || iban.trim().length < 8) {
        setFormError('Please enter a valid IBAN number.');
        return;
      }
    }

    const payoutDetails: SettlementPayoutDetails = {
      method: payoutMethod,
      accountHolderName: accountHolderName.trim(),
      upiId: payoutMethod === 'upi' ? upiId.trim() : undefined,
      accountNumber: payoutMethod === 'bank_in' ? accountNumber.trim() : undefined,
      ifscCode: payoutMethod === 'bank_in' ? ifscCode.trim().toUpperCase() : undefined,
      iban: payoutMethod === 'iban' ? iban.trim() : undefined,
      swiftBic: payoutMethod === 'iban' ? swiftBic.trim().toUpperCase() : undefined,
      paypalEmail: payoutMethod === 'paypal' ? paypalEmail.trim() : undefined,
      notes: notes.trim() || undefined,
    };

    try {
      setIsSubmitting(true);
      await respondToDepositSettlement(settlement.id, 'approved', notes.trim(), payoutDetails);
      showToast(
        `✓ Settlement accepted! Preferred refund destination registered. Landlord has been notified to disburse ${currencySymbol}${(Number(settlement.netRefundableAmount) || 0).toLocaleString(
          locale
        )}.`
      );
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to submit settlement response.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reject & Request for Recalculation (No dispute engine)
  const handleRejectSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!rejectReason.trim() || rejectReason.trim().length < 5) {
      setFormError('Please provide a reason for rejecting these deductions (minimum 5 characters).');
      return;
    }

    try {
      setIsSubmitting(true);
      await respondToDepositSettlement(settlement.id, 'rejected', rejectReason.trim());
      showToast('✓ Deductions rejected. Landlord notified to revise deductions and re-send recalculated refund.');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to submit rejection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal"
        style={{ maxWidth: '640px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', padding: '16px 20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Landmark size={20} color="var(--brass, #C59A45)" />
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                Review Move-Out Settlement
              </h3>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '3px' }}>
              Unit {settlement.unit} • {settlement.propertyName}
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Cash Refund Handover Confirmation Needed Card */}
          {isCashConfirmationPending && (
            <div
              style={{
                background: '#FFFBEB',
                border: '1.5px solid #F59E0B',
                borderRadius: '8px',
                padding: '16px 18px',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                <span style={{ background: '#FEF3C7', color: '#B45309', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                  ⚡ CASH REFUND HANDOVER CONFIRMATION NEEDED
                </span>
                {matchingCashClaim && <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Claim #{matchingCashClaim.id}</span>}
              </div>
              <h4 style={{ margin: '4px 0 6px', fontSize: '15px', color: 'var(--ink)' }}>
                {matchingCashClaim?.claimedByName || 'Property Owner'} reported handing you {matchingCashClaim?.currency || currencySymbol} {(Number(matchingCashClaim?.amount) || activeSettle.netRefundableAmount || 0).toLocaleString(locale)} in Cash
              </h4>
              <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '12px' }}>
                <b>Date:</b> {matchingCashClaim?.handoverDate || activeSettle.disbursedAt?.split('T')[0] || activeSettle.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]} • <b>Unit:</b> {activeSettle.unit} • <b>Location:</b> {matchingCashClaim?.handoverLocation || `Unit ${activeSettle.unit} Move-Out Inspection`}
                {(matchingCashClaim?.notes || activeSettle.paymentReference) && (
                  <span style={{ display: 'block', marginTop: '2px', fontStyle: 'italic' }}>
                    "{matchingCashClaim?.notes || `Ref: ${activeSettle.paymentReference}`}"
                  </span>
                )}
              </div>

              {/* Legal Confirmation Notice */}
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', color: '#78350F', marginBottom: '14px', lineHeight: 1.4 }}>
                ℹ️ <b>Legal Confirmation:</b> By confirming receipt, you acknowledge physical receipt of this {currencySymbol}{(Number(matchingCashClaim?.amount) || activeSettle.netRefundableAmount || 0).toLocaleString(locale)} cash refund. This formally settles and archives your tenancy for Unit {activeSettle.unit}.
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn ${isCashConfirming ? 'btn-processing' : ''}`}
                  disabled={isCashConfirming}
                  style={{ background: '#16A34A', color: '#fff', border: 'none', padding: '9px 18px', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                  onClick={async () => {
                    setIsCashConfirming(true);
                    try {
                      await new Promise((r) => setTimeout(r, 350));
                      if (matchingCashClaim) {
                        await confirmCashClaim(matchingCashClaim.id);
                      } else {
                        await confirmRefundReceipt(activeSettle.id);
                      }
                      showToast('✓ Cash refund confirmed! Security deposit settled.');
                      if (onSuccess) onSuccess();
                      onClose();
                    } catch (err: any) {
                      showToast(err?.message || 'Failed to confirm cash receipt.');
                    } finally {
                      setIsCashConfirming(false);
                    }
                  }}
                >
                  <ButtonProcessing
                    loading={isCashConfirming}
                    loadingText="Confirming Cash..."
                    defaultText={`✓ Confirm I Received ${currencySymbol}${(Number(matchingCashClaim?.amount) || activeSettle.netRefundableAmount || 0).toLocaleString(locale)} Cash`}
                    icon={<CheckCircle2 size={16} />}
                  />
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={isCashConfirming}
                  style={{ borderColor: '#DC2626', color: '#DC2626', padding: '9px 14px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                  onClick={async () => {
                    const reason = window.prompt('Please enter the reason for declining this cash refund (e.g. Cash not received, or discrepancy in amount):');
                    if (reason && reason.trim()) {
                      setIsCashConfirming(true);
                      try {
                        await new Promise((r) => setTimeout(r, 350));
                        if (matchingCashClaim) {
                          await rejectCashClaim(matchingCashClaim.id, reason.trim());
                        } else {
                          await respondToDepositSettlement(activeSettle.id, 'rejected', reason.trim());
                        }
                        showToast('✓ Notice sent: Cash refund handover declined.');
                        if (onSuccess) onSuccess();
                        onClose();
                      } catch (err: any) {
                        showToast(err?.message || 'Failed to decline handover.');
                      } finally {
                        setIsCashConfirming(false);
                      }
                    }
                  }}
                >
                  ✕ Decline / Not Received
                </button>
              </div>
            </div>
          )}

          {/* Status Alert Banner if already accepted or contested */}
          {activeSettle.status === 'approved' && !matchingCashClaim && (
            <div
              style={{
                background: '#EBF3EF',
                border: '1px solid #2F5D50',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                color: '#2F5D50',
              }}
            >
              <CheckCircle2 size={18} />
              <div>
                <b>Settlement Accepted:</b> You have confirmed these deductions. Your landlord has been authorized to disburse{' '}
                <b>
                  {currencySymbol}{(Number(activeSettle.netRefundableAmount) || 0).toLocaleString(locale)}
                </b>{' '}
                to your designated account.
              </div>
            </div>
          )}

          {(activeSettle.status === 'rejected' || activeSettle.status === 'contested') && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #DC2626',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '13px',
                color: '#B91C1C',
              }}
            >
              <XCircle size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <b>Deductions Rejected:</b> You have requested a recalculation.
                {(settlement.rejectionReason || settlement.notes) && (
                  <div style={{ marginTop: '4px', fontStyle: 'italic', color: 'var(--ink)' }}>
                    "{settlement.rejectionReason || settlement.notes}"
                  </div>
                )}
                <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--ink-soft)' }}>
                  Your landlord has been notified to review your feedback, recalculate the deductions, and send an updated settlement.
                </div>
              </div>
            </div>
          )}

          {settlement.revisionNotes && (
            <div
              style={{
                background: '#EFF6FF',
                border: '1px solid #3B82F6',
                borderRadius: '8px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '13px',
                color: '#1D4ED8',
              }}
            >
              <Info size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <b>Landlord Recalculation Note:</b>
                <div style={{ marginTop: '4px', fontStyle: 'italic', color: 'var(--ink)' }}>
                  "{settlement.revisionNotes}"
                </div>
              </div>
            </div>
          )}

          {/* 1. Deposit Breakdown Summary Box */}
          <div
            style={{
              background: 'var(--surface-sunken, #F9F8F5)',
              border: '1px solid var(--line)',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>Initial Security Deposit Held:</span>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                {currencySymbol}{Number(settlement.grossDepositHeld ?? (settlement as any).deposit ?? 0).toLocaleString(locale)}
              </span>
            </div>

            {/* Deductions breakdown */}
            {settlement.deductions && settlement.deductions.length > 0 ? (
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px', marginTop: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--danger)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Itemized Inspection Deductions ({settlement.deductions.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {settlement.deductions.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--line)',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span
                            className="badge red"
                            style={{ fontSize: '10.5px', textTransform: 'uppercase', padding: '1px 6px' }}
                          >
                            {item.category ? item.category.replace('_', ' ') : 'DEDUCTION'}
                          </span>
                          <b style={{ fontSize: '13px', color: 'var(--ink)' }}>{item.title}</b>
                        </div>
                        {item.description && (
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '3px' }}>
                            {item.description}
                          </div>
                        )}
                        {item.receiptProofUrl && (
                          <a
                            href={item.receiptProofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11.5px',
                              color: 'var(--brass, #C59A45)',
                              marginTop: '4px',
                              textDecoration: 'underline',
                            }}
                          >
                            <ExternalLink size={11} /> View Landlord Proof Document
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                        - {currencySymbol}{(Number(item.amount) || 0).toLocaleString(locale)}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '10px',
                  fontSize: '13px',
                  color: 'var(--danger)',
                  fontWeight: 600,
                  }}
                >
                  <span>Total Deductions Assessed:</span>
                  <span>- {currencySymbol}{(Number(settlement.totalDeductions) || 0).toLocaleString(locale)}</span>
                </div>
              </div>
            ) : (
              <div
                style={{
                  borderTop: '1px solid var(--line)',
                  paddingTop: '8px',
                  marginTop: '8px',
                  fontSize: '12.5px',
                  color: 'var(--ledger, #2F5D50)',
                  fontWeight: 600,
                }}
              >
                ✓ Zero deductions assessed by landlord. Full 100% deposit return approved!
              </div>
            )}

            {/* Net Refundable Highlight */}
            <div
              style={{
                marginTop: '14px',
                paddingTop: '12px',
                borderTop: '2px dashed var(--line)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600 }}>
                  FINAL NET REFUNDABLE BALANCE
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                  Payable directly to your selected destination
                </div>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ledger, #2F5D50)' }}>
                {currencySymbol}{(Number(settlement.netRefundableAmount) || 0).toLocaleString(locale)}
              </div>
            </div>
          </div>

          {/* If already finalized or already responded, show summary, disbursement proof, and receipt confirmation */}
          {isAlreadyResolved ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {activeSettle.chosenPayoutDetails && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, marginBottom: '6px' }}>
                    YOUR SELECTED REFUND DESTINATION:
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
                    {activeSettle.chosenPayoutDetails.method === 'upi' && `UPI ID: ${activeSettle.chosenPayoutDetails.upiId}`}
                    {activeSettle.chosenPayoutDetails.method === 'bank_in' &&
                      `Bank Acc: ${activeSettle.chosenPayoutDetails.accountNumber} • IFSC: ${activeSettle.chosenPayoutDetails.ifscCode} (${activeSettle.chosenPayoutDetails.accountHolderName})`}
                    {activeSettle.chosenPayoutDetails.method === 'paypal' && `PayPal: ${activeSettle.chosenPayoutDetails.paypalEmail}`}
                    {activeSettle.chosenPayoutDetails.method === 'iban' && `IBAN: ${activeSettle.chosenPayoutDetails.iban}`}
                    {activeSettle.chosenPayoutDetails.method === 'cash' && `On-Site Cash Handover (${activeSettle.chosenPayoutDetails.accountHolderName})`}
                  </div>
                </div>
              )}

              {/* Landlord Disbursement Details */}
              {isDisbursed && (
                <div
                  style={{
                    background: '#F0FDF4',
                    border: '1.5px solid #86EFAC',
                    borderRadius: '8px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <CheckCircle2 size={18} color="#15803D" />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Landlord Refund Disbursement Details
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '13px' }}>
                    <div>
                      <span style={{ color: 'var(--ink-soft)', fontSize: '11.5px', display: 'block' }}>Disbursed Amount</span>
                      <b style={{ color: '#15803D', fontSize: '15px' }}>
                        {currencySymbol}{(Number(activeSettle.netRefundableAmount) || 0).toLocaleString(locale)}
                      </b>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-soft)', fontSize: '11.5px', display: 'block' }}>Payment Method</span>
                      <b style={{ color: 'var(--ink)' }}>
                        {activeSettle.disbursementMethod === 'cash_handover'
                          ? 'In-Person Cash Handover'
                          : activeSettle.disbursementMethod === 'gateway_automated'
                          ? 'Payment Gateway'
                          : 'Bank Wire / Transfer'}
                      </b>
                    </div>
                    {activeSettle.paymentReference && (
                      <div>
                        <span style={{ color: 'var(--ink-soft)', fontSize: '11.5px', display: 'block' }}>Reference / UTR</span>
                        <code style={{ fontSize: '12.5px', background: '#DCFCE7', padding: '2px 6px', borderRadius: '4px', color: '#166534' }}>
                          {activeSettle.paymentReference}
                        </code>
                      </div>
                    )}
                    {activeSettle.disbursedAt && (
                      <div>
                        <span style={{ color: 'var(--ink-soft)', fontSize: '11.5px', display: 'block' }}>Disbursement Date</span>
                        <b style={{ color: 'var(--ink)' }}>{activeSettle.disbursedAt.split('T')[0]}</b>
                      </div>
                    )}
                  </div>

                  {activeSettle.proofDocumentUrl && (
                    <div style={{ marginTop: '12px', borderTop: '1px solid #BBF7D0', paddingTop: '10px' }}>
                      <a
                        href={activeSettle.proofDocumentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#15803D',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          textDecoration: 'underline',
                        }}
                      >
                        <ExternalLink size={13} /> View Landlord Disbursement Slip / Proof Screenshot
                      </a>
                    </div>
                  )}

                  {/* Confirmation Status / Action */}
                  <div style={{ marginTop: '14px', borderTop: '1px solid #BBF7D0', paddingTop: '12px' }}>
                    {hasConfirmedReceipt ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 600, fontSize: '13px' }}>
                        <CheckCircle2 size={16} color="#16A34A" />
                        ✓ Refund Receipt Confirmed by Resident{activeSettle.tenantConfirmedAt ? ` on ${activeSettle.tenantConfirmedAt.split('T')[0]}` : ''}. Tenancy fully concluded.
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: '12.5px', color: '#166534', marginBottom: '10px', lineHeight: 1.4 }}>
                          ⚡ <b>Action Required:</b> Please confirm that you have received this deposit refund in your designated account/handover. Confirming will clear active lease dues and archive your tenancy.
                        </div>
                        <button
                          type="button"
                          className={`btn ${isConfirmingReceipt ? 'btn-processing' : ''}`}
                          disabled={isConfirmingReceipt}
                          onClick={async () => {
                            try {
                              setIsConfirmingReceipt(true);
                              await confirmRefundReceipt(activeSettle.id);
                              if (onSuccess) onSuccess();
                              onClose();
                            } catch (err: any) {
                              setFormError(err?.message || 'Failed to confirm receipt.');
                            } finally {
                              setIsConfirmingReceipt(false);
                            }
                          }}
                          style={{
                            background: '#16A34A',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '10px 18px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '13.5px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          <ButtonProcessing
                            loading={isConfirmingReceipt}
                            loadingText="Confirming Receipt..."
                            defaultText="✓ Confirm Refund Received"
                            icon={<CheckCircle2 size={16} />}
                          />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!isDisbursed && activeSettle.status === 'approved' && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '14px', fontSize: '13px', color: '#92400E' }}>
                  ⏳ <b>Awaiting Owner Disbursement:</b> You have approved the settlement. Your landlord has been notified to disburse your refund of <b>{currencySymbol}{(Number(activeSettle.netRefundableAmount) || 0).toLocaleString(locale)}</b> via your preferred payout handle. Once sent, you can confirm receipt here.
                </div>
              )}
            </div>
          ) : (
            /* Interactive Decision Tabs */
            <div>
              {/* Decision Mode Toggle */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  background: 'var(--surface-sunken, #F4F4F5)',
                  padding: '4px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('approve');
                    setFormError('');
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: activeTab === 'approve' ? 'var(--surface, #FFFFFF)' : 'transparent',
                    color: activeTab === 'approve' ? 'var(--ledger, #2F5D50)' : 'var(--ink-soft)',
                    boxShadow: activeTab === 'approve' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <CheckCircle2 size={15} /> Accept Deductions &amp; Claim Refund
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('reject');
                    setFormError('');
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: activeTab === 'reject' ? 'var(--surface, #FFFFFF)' : 'transparent',
                    color: activeTab === 'reject' ? 'var(--danger, #DC2626)' : 'var(--ink-soft)',
                    boxShadow: activeTab === 'reject' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <XCircle size={15} /> Request Recalculation
                </button>
              </div>

              {formError && (
                <div
                  style={{
                    background: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    color: '#B91C1C',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    marginBottom: '14px',
                  }}
                >
                  ⚠️ {formError}
                </div>
              )}

              {/* TAB 1: ACCEPT & CLAIM REFUND */}
              {activeTab === 'approve' && (
                <form onSubmit={handleApproveSettlement} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
                    Choose where you would like the landlord to disburse your refund balance of{' '}
                    <b style={{ color: 'var(--ledger, #2F5D50)' }}>
                      {currencySymbol}{(Number(settlement.netRefundableAmount) || 0).toLocaleString(locale)}
                    </b>
                    :
                  </div>

                  {/* Payout Channel Selector Pills */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                    {[
                      { id: 'upi', label: 'UPI / VPA', sub: 'Instant (GPay, PhonePe)' },
                      { id: 'bank_in', label: 'Bank Wire', sub: 'NEFT / IMPS' },
                      { id: 'paypal', label: 'PayPal', sub: 'Global' },
                      { id: 'iban', label: 'IBAN', sub: 'Euro / Global Wire' },
                      { id: 'cash', label: 'Cash', sub: 'Physical Handover' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setPayoutMethod(item.id as any)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '8px',
                          border: payoutMethod === item.id ? '2px solid var(--brass, #C59A45)' : '1px solid var(--line)',
                          background: payoutMethod === item.id ? '#FFFDF8' : 'var(--surface)',
                          textAlign: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '12.5px', color: payoutMethod === item.id ? 'var(--brass, #C59A45)' : 'var(--ink)' }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                          {item.sub}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Channel Fields */}
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        Account Holder Full Name *
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Name as registered on account"
                        value={accountHolderName}
                        onChange={(e) => setAccountHolderName(e.target.value)}
                        required
                      />
                    </div>

                    {payoutMethod === 'upi' && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                          UPI ID / Virtual Payment Address *
                        </label>
                        <input
                          type="text"
                          className="input"
                          placeholder="e.g. resident@okhdfcbank or 9876543210@paytm"
                          value={upiId}
                          onChange={(e) => setUpiId(e.target.value)}
                          required
                        />
                        <span style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '3px', display: 'block' }}>
                          Compatible with Google Pay, PhonePe, Paytm, BHIM, Cred, and all UPI applications.
                        </span>
                      </div>
                    )}

                    {payoutMethod === 'bank_in' && (
                      <>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                            Bank Account Number *
                          </label>
                          <input
                            type="text"
                            className="input"
                            placeholder="Enter bank account number"
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            required
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                              IFSC Code *
                            </label>
                            <input
                              type="text"
                              className="input"
                              placeholder="e.g. HDFC0001234"
                              value={ifscCode}
                              onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                              required
                            />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                              Bank Name (Optional)
                            </label>
                            <input
                              type="text"
                              className="input"
                              placeholder="e.g. HDFC Bank"
                              value={bankName}
                              onChange={(e) => setBankName(e.target.value)}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {payoutMethod === 'paypal' && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                          PayPal Email Address *
                        </label>
                        <input
                          type="email"
                          className="input"
                          placeholder="e.g. user@example.com"
                          value={paypalEmail}
                          onChange={(e) => setPaypalEmail(e.target.value)}
                          required
                        />
                      </div>
                    )}

                    {payoutMethod === 'iban' && (
                      <>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                            IBAN Number *
                          </label>
                          <input
                            type="text"
                            className="input"
                            placeholder="e.g. DE89 3704 0044 0532 0130 00"
                            value={iban}
                            onChange={(e) => setIban(e.target.value.toUpperCase())}
                            required
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                            SWIFT / BIC Code (Optional)
                          </label>
                          <input
                            type="text"
                            className="input"
                            placeholder="e.g. DEUTDEDDFXX"
                            value={swiftBic}
                            onChange={(e) => setSwiftBic(e.target.value.toUpperCase())}
                          />
                        </div>
                      </>
                    )}

                    {payoutMethod === 'cash' && (
                      <div style={{ background: '#FFFDF8', border: '1px solid var(--brass, #C59A45)', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', color: 'var(--ink)' }}>
                        💵 <b>In-Person Cash Settlement:</b> You and the landlord will coordinate an on-site physical cash handover upon unit handover. A signed cash voucher will be recorded.
                      </div>
                    )}

                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                        Optional Memo to Landlord
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g., Kindly share the UTR reference once transferred"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Accept Submit Button */}
                  <button
                    type="submit"
                    className={`btn brass ${isSubmitting ? 'btn-processing' : ''}`}
                    disabled={isSubmitting}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 700,
                    }}
                  >
                    <ButtonProcessing
                      loading={isSubmitting}
                      loadingText="Submitting Acceptance..."
                      defaultText={`Accept Settlement & Authorize Refund (${currencySymbol}${(Number(settlement.netRefundableAmount) || 0).toLocaleString(locale)})`}
                      icon={<Check size={16} />}
                    />
                  </button>
                </form>
              )}

              {/* TAB 2: REJECT DEDUCTIONS & REQUEST RECALCULATION */}
              {activeTab === 'reject' && (
                <form onSubmit={handleRejectSettlement} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div
                    style={{
                      background: '#FFF7ED',
                      border: '1px solid #FDBA74',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '12.5px',
                      color: '#9A3412',
                    }}
                  >
                    ℹ️ <b>How rejection works:</b> If you disagree with the assessed deductions, provide your feedback below. Your landlord will receive your notes, adjust or waive charges, and re-send an updated settlement for you to accept or reject.
                  </div>

                  <div className="form-group" style={{ margin: 0, width: '100%' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                      Reason for Rejecting Deductions *
                    </label>
                    <textarea
                      className="input"
                      rows={5}
                      placeholder="Explain which deduction items you disagree with and why (e.g., 'The painting was not damaged; the cleaning charges are excessive because I already had the flat cleaned...')"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        minHeight: '120px',
                        resize: 'vertical',
                        fontSize: '13.5px',
                        lineHeight: 1.5,
                        padding: '10px 12px',
                        boxSizing: 'border-box',
                        display: 'block',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    className={`btn red ${isSubmitting ? 'btn-processing' : ''}`}
                    disabled={isSubmitting}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 700,
                      background: 'var(--danger, #DC2626)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                    }}
                  >
                    <ButtonProcessing
                      loading={isSubmitting}
                      loadingText="Sending Rejection..."
                      defaultText="Reject Deductions & Request Recalculated Settlement"
                      icon={<XCircle size={16} />}
                    />
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="modal-foot"
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-sunken, #F9F8F5)',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary small btn-mobile-full"
              onClick={() => downloadDepositSettlementPdf(settlement)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <Download size={13} /> Download PDF Voucher
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {isCashConfirmationPending && (
              <button
                type="button"
                className={`btn ${isCashConfirming ? 'btn-processing' : ''}`}
                disabled={isCashConfirming}
                style={{ background: '#16A34A', color: '#fff', border: 'none', padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                onClick={async () => {
                  setIsCashConfirming(true);
                  try {
                    await new Promise((r) => setTimeout(r, 350));
                    if (matchingCashClaim) {
                      await confirmCashClaim(matchingCashClaim.id);
                    } else {
                      await confirmRefundReceipt(activeSettle.id);
                    }
                    showToast('✓ Cash refund confirmed! Security deposit settled.');
                    if (onSuccess) onSuccess();
                    onClose();
                  } catch (err: any) {
                    showToast(err?.message || 'Failed to confirm cash receipt.');
                  } finally {
                    setIsCashConfirming(false);
                  }
                }}
              >
                <ButtonProcessing
                  loading={isCashConfirming}
                  loadingText="Confirming..."
                  defaultText={`✓ Confirm Cash Received (${currencySymbol}${(Number(matchingCashClaim?.amount) || activeSettle.netRefundableAmount || 0).toLocaleString(locale)})`}
                  icon={<CheckCircle2 size={15} />}
                />
              </button>
            )}
            <button type="button" className="btn secondary btn-mobile-full" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
