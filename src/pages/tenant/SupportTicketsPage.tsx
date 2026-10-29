import React, { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Ticket } from '../../types';
import { ButtonProcessing } from '../../components/common/Spinner';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol } from '../../lib/currencyService';
import { generateTicketId } from '../../lib/idGenerators';


export const SupportTicketsPage: React.FC = () => {
  const { state, updateState, saveTicket, showToast } = useAppData();
  const { user } = useAuth();
  const tenantName = user?.displayName || 'Resident';

  const tenantEmail = user?.email?.toLowerCase() || '';
  // Prefer ID, then email — never name (prevents cross-tenant collision)
  const tenantRecord = state.tenants.find(
    (t) =>
      (user?.id && t.id === user.id) ||
      (tenantEmail && t.email.toLowerCase() === tenantEmail)
  );

  const myActiveUnits = state.units.filter(
    (u) =>
      (user?.id && u.currentTenantId === user.id) ||
      (tenantEmail && u.tenant?.toLowerCase() === tenantEmail)
  ).filter((u) => {
    if (u.status !== 'occupied' && u.status !== 'reserved') return false;
    const hasActiveAgreement = (state.agreements || []).some(
      (a) =>
        (a.tenantId === user?.id || (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)) &&
        (a.status === 'active' || a.status === 'pending_deposit') &&
        (a.unit === u.unitNumber || a.unit === u.id)
    );
    if (hasActiveAgreement) return true;
    const isCompleted = (state.moveouts || []).some(
      (m) =>
        m.tenantId === user?.id &&
        (m.unit === u.unitNumber || m.unit === u.id) &&
        m.status === 'refund_completed'
    );
    return !isCompleted;
  });

  // Comprehensive active tenancies across properties
  const myResidentTenancies = React.useMemo(() => {
    const list: Array<{
      key: string;
      unit: string;
      propertyId?: string;
      propertyName: string;
      ownerId: string;
      ownerName: string;
      currency?: string;
    }> = [];
    const seen = new Set<string>();

    // From active agreements
    (state.agreements || [])
      .filter((a) => {
        if (user?.id && a.tenantId === user.id) return true;
        if (tenantRecord?.id && a.tenantId === tenantRecord.id) return true;
        if (tenantEmail && (a.tenantEmail?.toLowerCase() === tenantEmail || a.tenant?.toLowerCase() === tenantEmail)) return true;
        return false;
      })
      .filter((a) => a.status === 'active' || a.status === 'pending_deposit')
      .forEach((ag) => {
        const prop = state.properties.find((p) => p.id === ag.propertyId);
        const pName = prop?.name || (ag as any).propertyName || tenantRecord?.propertyName || 'Residence';
        const key = `${ag.propertyId || ''}_${(ag.unit || '').replace(/^(unit|apt|#)\s*/i, '').trim().toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            key,
            unit: ag.unit,
            propertyId: ag.propertyId,
            propertyName: pName,
            ownerId: ag.ownerId || '',
            ownerName: ag.ownerName || 'Property Owner',
            currency: ag.currency,
          });
        }
      });

    // From myActiveUnits
    myActiveUnits.forEach((u) => {
      const prop = state.properties.find((p) => p.id === u.propertyId);
      const pName = prop?.name || u.propertyName || tenantRecord?.propertyName || 'Residence';
      const key = `${u.propertyId || ''}_${(u.unitNumber || '').replace(/^(unit|apt|#)\s*/i, '').trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push({
          key,
          unit: u.unitNumber,
          propertyId: u.propertyId,
          propertyName: pName,
          ownerId: u.ownerId,
          ownerName: (prop as any)?.owner || tenantRecord?.owner || 'Property Owner',
          currency: u.currency,
        });
      }
    });

    if (list.length === 0 && tenantRecord && tenantRecord.unit && tenantRecord.unit !== 'Unassigned') {
      list.push({
        key: `rec_${tenantRecord.unit}`,
        unit: tenantRecord.unit,
        propertyId: tenantRecord.propertyId,
        propertyName: tenantRecord.propertyName || 'Residence',
        ownerId: tenantRecord.ownerId || '',
        ownerName: tenantRecord.owner || 'Property Owner',
        currency: tenantRecord.currency,
      });
    }

    return list;
  }, [state.agreements, state.properties, myActiveUnits, user, tenantRecord, tenantEmail]);

  const hasActiveTenancy = myActiveUnits.length > 0 || myResidentTenancies.length > 0;
  const tenantUnit = myResidentTenancies[0]?.unit || myActiveUnits[0]?.unitNumber || (hasActiveTenancy && tenantRecord?.unit && tenantRecord.unit !== 'Unassigned' ? tenantRecord.unit : 'Unassigned');
  const resolvedOwnerId = myResidentTenancies[0]?.ownerId || myActiveUnits[0]?.ownerId || (hasActiveTenancy ? tenantRecord?.ownerId : '') || '';
  const resolvedOwnerName = myResidentTenancies[0]?.ownerName || (hasActiveTenancy ? tenantRecord?.owner : '') || 'Property Owner';

  const currentProperty = state.properties.find(
    (p) => p.id === myResidentTenancies[0]?.propertyId || p.id === myActiveUnits[0]?.propertyId || p.id === tenantRecord?.propertyId
  );
  const myAgreement = state.agreements.find(
    (a) =>
      (user?.id && a.tenantId === user.id) ||
      (tenantEmail && a.tenantEmail?.toLowerCase() === tenantEmail)
  );
  const resolvedCurrency =
    getCurrencySymbol(
      myResidentTenancies[0]?.currency ||
      myAgreement?.currency ||
      myActiveUnits[0]?.currency ||
      currentProperty?.currency ||
      tenantRecord?.currency
    ) || DEFAULT_CURRENCY_SYMBOL;

  // New ticket modal
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [ticketTenancyKey, setTicketTenancyKey] = useState<string>('');
  const [ticketIssue, setTicketIssue] = useState('');
  const [ticketPriority, setTicketPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [ticketDetail, setTicketDetail] = useState('');

  // Keep ticketTenancyKey initialized
  React.useEffect(() => {
    if (!ticketTenancyKey && myResidentTenancies.length > 0) {
      setTicketTenancyKey(myResidentTenancies[0].key);
    }
  }, [myResidentTenancies, ticketTenancyKey]);

  // Pay repair modal
  const [payingTicket, setPayingTicket] = useState<Ticket | null>(null);
  const [payMethod, setPayMethod] = useState('UPI');

  // Loading states
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  // Only match by tenantId or email — display-name match causes cross-tenant leakage
  const myTickets = state.tickets.filter(
    (t) =>
      (user?.id && t.tenantId === user.id) ||
      (tenantEmail && t.tenantContact?.email?.toLowerCase() === tenantEmail)
  );

  const handleCreateTicket = async () => {
    setIsSubmittingTicket(true);
    try {
      const activeT = myResidentTenancies.find((t) => t.key === ticketTenancyKey) || myResidentTenancies[0];
      const targetUnit = activeT?.unit || tenantUnit;
      const targetOwnerId = activeT?.ownerId || resolvedOwnerId;
      const targetPropertyId = activeT?.propertyId;

      const tickId = generateTicketId();
      const issueTitle = ticketIssue.trim() || 'Maintenance request';
      const description = ticketDetail.trim();
      const newTick: Ticket = {
        id: tickId,
        ownerId: targetOwnerId,
        propertyId: targetPropertyId,
        tenantId: user?.id || tenantRecord?.id || `usr_tenant_${Date.now()}`,
        tenantContact: {
          phone: user?.phone || tenantRecord?.phone || '',
          email: user?.email || tenantRecord?.email || '',
        },
        unit: targetUnit,
        tenant: tenantName,
        issue: description ? `${issueTitle}: ${description}` : issueTitle,
        notes: description,
        priority: ticketPriority,
        status: 'open',
        assignedTo: null,
        created: new Date().toISOString().split('T')[0],
        payment: {
          payer: null,
          amount: null,
          method: null,
          status: 'none',
        },
      };

      const notif = {
        id: `notif_${Date.now()}`,
        userId: targetOwnerId,
        title: 'New Maintenance Ticket Submitted',
        body: `${tenantName} submitted a ticket for Unit ${targetUnit} (${activeT?.propertyName || 'Residence'}): "${issueTitle}"`,
        link: '/owner/maintenance',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      await saveTicket(newTick);
      if (targetOwnerId) {
        updateState((prev) => ({
          ...prev,
          notifications: [...(prev.notifications || []), notif],
        }));
      }

      setIsNewTicketOpen(false);
      setTicketIssue('');
      setTicketDetail('');
      showToast('Ticket submitted. Your landlord has been notified.');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const handleConfirmTaskPay = async () => {
    if (!payingTicket) return;
    setIsSubmittingPay(true);
    try {
      const updatedTicket: Ticket = {
      ...payingTicket,
      payment: {
        ...payingTicket.payment,
        method: payMethod,
        status: 'pending_approval',
      },
    };
    await saveTicket(updatedTicket);

    setIsPayingTaskOpen(null);
    showToast(`Marked as paid — waiting for ${payingTicket.assignedTo} to confirm receipt.`);
    setPayingTicket(null);
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const [isPayingTaskOpen, setIsPayingTaskOpen] = useState<string | null>(null);

  // Rate Work Order modal state
  const [ratingTicket, setRatingTicket] = useState<Ticket | null>(null);
  const [ratingScore, setRatingScore] = useState<number>(5);
  const [ratingFeedback, setRatingFeedback] = useState<string>('');

  const handleSubmitTicketRating = async () => {
    if (!ratingTicket) return;
    setIsSubmittingRating(true);
    try {
      const updatedTicket: Ticket = {
        ...ratingTicket,
        rating: ratingScore,
        completionNotes: ratingFeedback.trim() || `Rated ${ratingScore}/5 stars by tenant`,
      } as any;
      await saveTicket(updatedTicket);

      // Recalculate staff member's live average rating and notify technician (scoped to owner to prevent cross-owner collision)
      const staffMember = state.staff.find(
        (s) =>
          (ratingTicket.assignedStaffId && s.id === ratingTicket.assignedStaffId) ||
          (ratingTicket.assignedTo &&
            s.name.toLowerCase() === ratingTicket.assignedTo.toLowerCase() &&
            (!ratingTicket.ownerId || s.ownerId === ratingTicket.ownerId))
      );

      if (staffMember) {
        const staffTickets = [...state.tickets.filter((t) => t.id !== ratingTicket.id), updatedTicket].filter(
          (t) =>
            t.status === 'resolved' &&
            ((staffMember.id && t.assignedStaffId === staffMember.id) ||
              (t.assignedTo &&
                t.assignedTo.toLowerCase() === staffMember.name.toLowerCase() &&
                (!staffMember.ownerId || t.ownerId === staffMember.ownerId))) &&
            (t as any).rating &&
            (t as any).rating > 0
        );
        const newAvg = staffTickets.length > 0
          ? parseFloat((staffTickets.reduce((acc, t) => acc + ((t as any).rating || 5), 0) / staffTickets.length).toFixed(1))
          : ratingScore;

        const updatedStaff = state.staff.map((s) => (s.id === staffMember.id ? { ...s, rating: newAvg } : s));
        const notif = {
          id: `notif-rating-${Date.now()}`,
          userId: staffMember.id,
          title: `★ New ${ratingScore}-Star Service Rating!`,
          body: `${tenantName} rated repair #${ratingTicket.id}: "${ratingFeedback.trim() || 'Service completed'}" (${ratingScore}/5 stars)`,
          link: '/staff/ratings',
          isRead: false,
          createdAt: new Date().toISOString(),
        };

        updateState((prev) => ({
          ...prev,
          staff: updatedStaff,
          notifications: [...(prev.notifications || []), notif],
        }));
      }

      showToast(`✓ Rating recorded for work order ${ratingTicket.id}! Thank you for your feedback.`);
      setRatingTicket(null);
      setRatingFeedback('');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  return (
    <div>
        <div>
          {!hasActiveTenancy && (
            <div style={{ background: '#FAF9F5', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: 'var(--ink-soft)' }}>
              ℹ️ <b>Tenancy Notice:</b> You do not currently have an active occupied unit. Past maintenance records remain viewable below. New maintenance tickets can be raised once an active lease is in effect.
            </div>
          )}

          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div className="hint">{myTickets.length} tickets raised</div>
            <button
              type="button"
              className={`btn ${hasActiveTenancy ? 'brass' : 'secondary'} btn-mobile-full`}
              onClick={() => {
                if (!hasActiveTenancy) {
                  showToast('Maintenance requests can only be submitted for an active, occupied unit.');
                  return;
                }
                setIsNewTicketOpen(true);
              }}
              style={!hasActiveTenancy ? { opacity: 0.7 } : undefined}
            >
              + Raise a ticket
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
                        <th>Ticket</th>
                        <th>Residence</th>
                        <th>Issue</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Payment</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myTickets.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ color: 'var(--ink-soft)', padding: '16px' }}>
                            No tickets yet.
                          </td>
                        </tr>
                      ) : (
                        myTickets.map((x) => {
                          const ticketProp = state.properties.find((p) => p.id === x.propertyId)?.name || 'Residence';
                          return (
                            <tr key={x.id}>
                              <td><b>{x.id}</b></td>
                              <td>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                                  Unit {x.unit.replace(/^unit\s*/i, '')} • {ticketProp}
                                </span>
                              </td>
                              <td>{x.issue}</td>
                              <td>
                                <span
                                  className={`badge ${
                                    x.priority === 'High' ? 'red' : x.priority === 'Medium' ? 'amber' : 'grey'
                                  }`}
                                >
                                  {x.priority}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`badge ${
                                    x.status === 'resolved'
                                      ? 'green'
                                      : x.status === 'assigned'
                                      ? 'brass'
                                      : 'amber'
                                  }`}
                                >
                                  {x.status.toUpperCase()}
                                </span>
                              </td>
                              <td>
                                {x.payment?.amount ? (
                                  <span>
                                    {resolvedCurrency}{x.payment.amount.toLocaleString()} ({x.payment.payer})
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--ink-soft)' }}>Included</span>
                                )}
                              </td>
                              <td>
                                {x.payment?.status === 'awaiting_payment' && x.payment?.payer === 'tenant' ? (
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => {
                                      setPayingTicket(x);
                                      setIsPayingTaskOpen(x.id);
                                    }}
                                  >
                                    Pay {resolvedCurrency}{x.payment.amount?.toLocaleString()}
                                  </button>
                                ) : x.status === 'resolved' ? (
                                  (x as any).rating ? (
                                    <span style={{ color: 'var(--brass)', fontSize: '13px', fontWeight: 700 }} title={`Rated ${(x as any).rating}/5`}>
                                      {'★'.repeat((x as any).rating)}
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn brass small"
                                      onClick={() => {
                                        setRatingTicket(x);
                                        setRatingScore(5);
                                        setRatingFeedback('');
                                      }}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px' }}
                                    >
                                      ★ Rate Work
                                    </button>
                                  )
                                ) : (
                                  '—'
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

              {/* Mobile Card View */}
              <div className="mobile-card-view">
                {myTickets.length === 0 ? (
                  <div style={{ color: 'var(--ink-soft)', padding: '16px', textAlign: 'center' }}>
                    No tickets yet.
                  </div>
                ) : (
                  myTickets.map((x) => (
                    <div key={x.id} className="staff-card">
                      <div className="staff-card-header">
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{x.id}</div>
                          <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '4px' }}>{x.issue}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span
                            className={`badge ${
                              x.priority === 'High' ? 'red' : x.priority === 'Medium' ? 'amber' : 'grey'
                            }`}
                          >
                            {x.priority}
                          </span>
                          <span
                            className={`badge ${
                              x.status === 'resolved'
                                ? 'green'
                                : x.status === 'assigned'
                                ? 'brass'
                                : 'amber'
                            }`}
                          >
                            {x.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="staff-card-meta">
                        <div className="staff-card-meta-item">
                          <b>Fee:</b>{' '}
                          {x.payment?.amount ? (
                            <span>{resolvedCurrency}{x.payment.amount.toLocaleString()} ({x.payment.payer})</span>
                          ) : (
                            <span style={{ color: 'var(--ink-soft)' }}>Included</span>
                          )}
                        </div>
                      </div>

                      {x.payment?.status === 'awaiting_payment' && x.payment?.payer === 'tenant' && (
                        <div className="staff-card-footer">
                          <button
                            type="button"
                            className="btn brass small btn-mobile-full"
                            onClick={() => {
                              setPayingTicket(x);
                              setIsPayingTaskOpen(x.id);
                            }}
                          >
                            Pay {resolvedCurrency}{x.payment.amount?.toLocaleString()}
                          </button>
                        </div>
                      )}

                      {x.status === 'resolved' && (
                        <div className="staff-card-footer" style={{ marginTop: '8px' }}>
                          {(x as any).rating ? (
                            <span style={{ color: 'var(--brass)', fontSize: '13px', fontWeight: 700 }}>
                              Rated: {'★'.repeat((x as any).rating)}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn brass small btn-mobile-full"
                              onClick={() => {
                                setRatingTicket(x);
                                setRatingScore(5);
                                setRatingFeedback('');
                              }}
                            >
                              ★ Rate Completed Work Order
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

      {/* Raise Ticket Modal */}
      {isNewTicketOpen && (
        <div className="modal-backdrop" onClick={() => setIsNewTicketOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Raise a maintenance ticket</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setIsNewTicketOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {myResidentTenancies.length > 1 && (
                <div className="field">
                  <label>Rented Residence / Unit</label>
                  <select
                    value={ticketTenancyKey}
                    onChange={(e) => setTicketTenancyKey(e.target.value)}
                  >
                    {myResidentTenancies.map((t) => (
                      <option key={t.key} value={t.key}>
                        Unit {t.unit.replace(/^unit\s*/i, '')} • {t.propertyName} ({t.ownerName})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label>Issue</label>
                <input
                  type="text"
                  placeholder="e.g. Leaking tap in kitchen"
                  value={ticketIssue}
                  onChange={(e) => setTicketIssue(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Priority</label>
                <select
                  value={ticketPriority}
                  onChange={(e) => setTicketPriority(e.target.value as any)}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div className="field">
                <label>Description</label>
                <textarea
                  rows={3}
                  placeholder="Any extra detail…"
                  value={ticketDetail}
                  onChange={(e) => setTicketDetail(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setIsNewTicketOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isSubmittingTicket ? 'btn-processing' : ''}`}
                onClick={handleCreateTicket}
                disabled={isSubmittingTicket}
              >
                <ButtonProcessing
                  loading={isSubmittingTicket}
                  loadingText="Submitting Ticket..."
                  defaultText="Submit ticket"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay for Repair Modal */}
      {payingTicket && (
        <div className="modal-backdrop" onClick={() => setPayingTicket(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Pay for repair</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setPayingTicket(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Amount</label>
                <input
                  type="text"
                  value={`${resolvedCurrency}${payingTicket.payment?.amount?.toLocaleString()}`}
                  disabled
                />
              </div>
              <div className="field">
                <label>Payment method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="UPI">UPI</option>
                  <option value="Bank transfer">Bank transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Razorpay">Razorpay</option>
                  <option value="Stripe">Stripe</option>
                </select>
              </div>
              <p className="hint">
                This marks the repair fee as paid and alerts the technician to confirm receipt.
              </p>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setPayingTicket(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isSubmittingPay ? 'btn-processing' : ''}`}
                onClick={handleConfirmTaskPay}
                disabled={isSubmittingPay}
              >
                <ButtonProcessing
                  loading={isSubmittingPay}
                  loadingText="Recording Payment..."
                  defaultText="Confirm payment"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rate Completed Work Order Modal */}
      {ratingTicket && (
        <div className="modal-backdrop" onClick={() => setRatingTicket(null)}>
          <div className="modal-card" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Rate Completed Repair ({ratingTicket.id})</h3>
              <button type="button" className="btn secondary small" onClick={() => setRatingTicket(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 14px', fontSize: '13.5px', color: 'var(--ink)' }}>
                How was the resolution for <b>"{ratingTicket.issue}"</b>?
                {ratingTicket.assignedTo && <span> Handled by <b>{ratingTicket.assignedTo}</b>.</span>}
              </p>

              <div className="field">
                <label>Overall Service Rating</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRatingScore(star)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '26px',
                        color: star <= ratingScore ? 'var(--brass)' : '#cbd5e1',
                        padding: '4px',
                        transition: 'transform 0.1s',
                      }}
                      title={`${star} Star${star > 1 ? 's' : ''}`}
                    >
                      ★
                    </button>
                  ))}
                  <span style={{ alignSelf: 'center', marginLeft: '6px', fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
                    {ratingScore} of 5
                  </span>
                </div>
              </div>

              <div className="field" style={{ marginTop: '14px' }}>
                <label>Review & Feedback Notes</label>
                <textarea
                  rows={3}
                  value={ratingFeedback}
                  onChange={(e) => setRatingFeedback(e.target.value)}
                  placeholder="e.g. Technician arrived on time and resolved the plumbing leak cleanly."
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn secondary" onClick={() => setRatingTicket(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass ${isSubmittingRating ? 'btn-processing' : ''}`}
                onClick={handleSubmitTicketRating}
                disabled={isSubmittingRating}
              >
                <ButtonProcessing
                  loading={isSubmittingRating}
                  loadingText="Saving Rating..."
                  defaultText="Submit Rating & Review"
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
