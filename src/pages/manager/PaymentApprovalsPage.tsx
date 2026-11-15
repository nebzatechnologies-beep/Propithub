import React, { useMemo, useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { CashHandoverClaim, Invoice, PaymentTransaction } from '../../types';

/**
 * Payment Approvals (manager workspace).
 *
 * A tenant who pays by cash, UPI or bank transfer records the payment as "pending confirmation". It only counts
 * as paid once the owner or a manager approves it. Managers see the tenants of the properties they manage here;
 * they have no access to gateway keys, bank settings or the owner's financial reports.
 */
export const ManagerPaymentApprovalsPage: React.FC = () => {
  const { state, showToast, confirmCashClaim, rejectCashClaim, markInvoicePaid, saveInvoice } = useAppData();
  const { user } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const managerRecord = (state.propertyManagers || (state as any).managers || []).find(
    (m: any) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase() === user.email.toLowerCase())
  );
  const ownerId = user?.ownerId || (managerRecord as any)?.ownerId || '';

  // Same property scope as the manager dashboard: assigned properties if any, otherwise the owner's portfolio.
  const myPropertyIds = useMemo(() => {
    const ids = new Set<string>();
    const primary = (user as any)?.propertyId || (user as any)?.assignedPropertyId || managerRecord?.propertyId;
    if (primary) ids.add(String(primary));
    const extra = (user as any)?.assignedProperties || managerRecord?.assignedProperties;
    if (Array.isArray(extra)) extra.forEach((p: any) => p && ids.add(String(p)));
    state.properties.forEach((p) => {
      if (p.assignedManagerId === user?.id) ids.add(p.id);
    });
    return ids;
  }, [state.properties, user, managerRecord]);

  const inScope = (item: { ownerId?: string; propertyId?: string }) => {
    if (!ownerId || item.ownerId !== ownerId) return false;
    if (myPropertyIds.size === 0 || !item.propertyId) return true;
    return myPropertyIds.has(item.propertyId);
  };

  const claims = useMemo(
    () =>
      (state.cashClaims || []).filter(
        (c) =>
          c.status === 'pending_confirmation' &&
          c.direction === 'inflow' &&
          c.claimedByRole === 'tenant' &&
          inScope(c)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.cashClaims, ownerId, myPropertyIds]
  );

  const claimInvoiceIds = useMemo(() => new Set(claims.map((c) => c.invoiceId).filter(Boolean) as string[]), [claims]);

  const proofInvoices = useMemo(
    () =>
      state.invoices.filter(
        (i) => i.status === 'pending_confirmation' && inScope(i) && !claimInvoiceIds.has(i.id)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.invoices, ownerId, myPropertyIds, claimInvoiceIds]
  );

  const money = (amount: number, currency?: string) =>
    `${currency || ''} ${Number(amount || 0).toLocaleString('en-IN')}`.trim();

  const approveClaim = async (c: CashHandoverClaim) => {
    setBusyId(c.id);
    try {
      await confirmCashClaim(c.id);
    } finally {
      setBusyId(null);
    }
  };

  const declineClaim = async (c: CashHandoverClaim) => {
    if (!reason.trim()) {
      showToast('Please enter a reason for declining.');
      return;
    }
    setBusyId(c.id);
    try {
      await rejectCashClaim(c.id, reason.trim());
      setDeclineFor(null);
      setReason('');
    } finally {
      setBusyId(null);
    }
  };

  const linkedPayments = (inv: Invoice): PaymentTransaction[] =>
    (state.payments || []).filter(
      (p) =>
        p.status === 'pending_confirmation' &&
        (p.invoiceId === inv.id ||
          (p.tenantId === inv.tenantId && p.unit === inv.unit && (!p.propertyId || !inv.propertyId || p.propertyId === inv.propertyId)))
    );

  const approveInvoice = async (inv: Invoice) => {
    setBusyId(inv.id);
    try {
      const label = inv.paymentProofRef ? `Offline Ref: ${inv.paymentProofRef}` : 'Offline Proof Approved';
      await markInvoicePaid(inv.id, label, inv.paymentProofRef || undefined);
      if (isFirebaseConfigured) {
        for (const p of linkedPayments(inv)) {
          await setDoc(
            doc(db, 'payments', p.id),
            {
              status: 'paid',
              method: label,
              audit: {
                ...(p.audit || {}),
                confirmedBy: user?.id || 'manager',
                confirmedByName: user?.displayName || 'Property Manager',
                confirmedAt: new Date().toISOString(),
              },
            },
            { merge: true }
          );
        }
      }
      showToast(`Payment verified. Invoice ${inv.id} is now marked as paid.`);
    } catch (err: any) {
      showToast(`Could not approve: ${err?.message || err}`);
    } finally {
      setBusyId(null);
    }
  };

  const declineInvoice = async (inv: Invoice) => {
    if (!reason.trim()) {
      showToast('Please enter a reason for declining.');
      return;
    }
    setBusyId(inv.id);
    try {
      const reverted: Invoice = { ...inv, status: 'sent', paymentProofNotes: `Declined by manager: ${reason.trim()}` };
      delete (reverted as any).paymentMethodUsed;
      await saveInvoice(reverted);
      if (isFirebaseConfigured) {
        for (const p of linkedPayments(inv)) {
          await setDoc(
            doc(db, 'payments', p.id),
            { status: 'disputed', notes: `Declined by manager: ${reason.trim()}` },
            { merge: true }
          );
        }
      }
      setDeclineFor(null);
      setReason('');
      showToast('Payment declined. The tenant has been asked to resubmit.');
    } catch (err: any) {
      showToast(`Could not decline: ${err?.message || err}`);
    } finally {
      setBusyId(null);
    }
  };

  const declineBox = (id: string, onConfirm: () => void) =>
    declineFor === id ? (
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Reason (e.g. cash not received)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button className="btn small danger" disabled={busyId === id} onClick={onConfirm}>
          Confirm decline
        </button>
        <button
          className="btn small secondary"
          onClick={() => {
            setDeclineFor(null);
            setReason('');
          }}
        >
          Cancel
        </button>
      </div>
    ) : null;

  const total = claims.length + proofInvoices.length;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Payment Approvals</h1>
        <p style={{ color: 'var(--ink-soft)', margin: '4px 0 0' }}>
          Payments tenants recorded as cash, UPI or bank transfer. They count as paid only after you approve them.
        </p>
      </div>

      {!ownerId && (
        <div className="card" style={{ padding: 16 }}>
          Your account is not linked to a property owner yet, so there is nothing to approve.
        </div>
      )}

      {ownerId && total === 0 && (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)' }}>
          Nothing is waiting for approval.
        </div>
      )}

      {claims.map((c) => (
        <div className="card" key={c.id} style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <b>{c.tenantName}</b> · Unit {c.unit}
              {c.propertyName ? ` · ${c.propertyName}` : ''}
              <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
                Cash handover ({c.type === 'deposit' ? 'security deposit' : 'rent'}) on {c.handoverDate}
                {c.handoverLocation ? ` at ${c.handoverLocation}` : ''}
              </div>
              {c.notes && <div style={{ fontSize: 13, marginTop: 4 }}>{c.notes}</div>}
              {c.proofPhotoUrl && (
                <a href={c.proofPhotoUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                  View photo proof
                </a>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{money(c.amount, c.currency)}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                <button className="btn small brass" disabled={busyId === c.id} onClick={() => approveClaim(c)}>
                  Approve
                </button>
                <button className="btn small secondary" onClick={() => setDeclineFor(c.id)}>
                  Decline
                </button>
              </div>
            </div>
          </div>
          {declineBox(c.id, () => declineClaim(c))}
        </div>
      ))}

      {proofInvoices.map((inv) => (
        <div className="card" key={inv.id} style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <b>{inv.tenant}</b> · Unit {inv.unit}
              {inv.propertyName ? ` · ${inv.propertyName}` : ''}
              <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
                {String(inv.paymentMethodUsed || 'Offline transfer')} · Invoice {inv.id}
              </div>
              {inv.paymentProofRef && <div style={{ fontSize: 13 }}>Reference / UTR: {inv.paymentProofRef}</div>}
              {inv.paymentProofNotes && <div style={{ fontSize: 13 }}>{inv.paymentProofNotes}</div>}
              {inv.paymentProofUrl && (
                <a href={inv.paymentProofUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                  View payment screenshot
                </a>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{money(inv.total ?? inv.amount, inv.currency)}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                <button className="btn small brass" disabled={busyId === inv.id} onClick={() => approveInvoice(inv)}>
                  Approve
                </button>
                <button className="btn small secondary" onClick={() => setDeclineFor(inv.id)}>
                  Decline
                </button>
              </div>
            </div>
          </div>
          {declineBox(inv.id, () => declineInvoice(inv))}
        </div>
      ))}
    </div>
  );
};
