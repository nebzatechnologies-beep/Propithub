import React, { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { StaffMember } from '../../types';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import { ButtonProcessing } from '../../components/common/Spinner';
import { DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol } from '../../lib/currencyService';

export const StaffTaskPaymentsPage: React.FC = () => {
  const { state, saveTicket, sendStaffPaymentReminder, showToast } = useAppData();
  const { user } = useAuth();
  const staffId = user?.id || '';
  const staffEmail = user?.email?.toLowerCase() || '';
  const staffName = user?.displayName || '';

  // Resolve by UID first, then email, then displayName
  const matchedStaff: StaffMember | undefined =
    state.staff.find((s) => s.id === staffId) ||
    (staffEmail ? state.staff.find((s) => s.email?.toLowerCase() === staffEmail) : undefined) ||
    (staffName ? state.staff.find((s) => s.name.toLowerCase() === staffName.toLowerCase()) : undefined);

  // Dynamic fallback profile synthesis if staff document is still syncing or unseeded
  const currentStaff: StaffMember | undefined =
    matchedStaff ||
    (user && (user.role === 'staff' || (user as any).role === 'staff')
      ? {
          id: user.id,
          name: user.displayName || user.email?.split('@')[0] || 'Staff Member',
          role: (user as any).staffRole || 'Technician',
          ownerId: user.ownerId || '',
          ownerName: user.ownerName || 'Property Owner',
          phone: user.phone || '',
          email: user.email || '',
          activeTickets: 0,
          rating: (user as any).rating || 5.0,
          completed: (user as any).completed || 0,
          paymentDetails: {
            method: 'bank',
            bank: { accountName: user.displayName || '', accountNumber: '', country: 'India', routing: '' },
            upi: { upiId: '', qrImage: null },
            paypalEmail: '',
          },
        }
      : undefined);

  const [remindedTickets, setRemindedTickets] = useState<Record<string, boolean>>({});
  const [settlingTicketId, setSettlingTicketId] = useState<string | null>(null);
  const [remindingTicketId, setRemindingTicketId] = useState<string | null>(null);

  // Match by assignedStaffId (UID) only.
  // Name-based fallback removed — two staff members across different owner accounts with
  // the same display name would otherwise share each other's payment records.
  const myTickets = state.tickets.filter(
    (t) =>
      staffId &&
      t.assignedStaffId === staffId &&
      t.payment &&
      t.payment.status !== 'none'
  );

  const staffProperty = state.properties.find(
    (p) =>
      (currentStaff?.ownerId && p.ownerId === currentStaff.ownerId) ||
      myTickets.some((t) => t.propertyId === p.id)
  );
  const staffRawCurrency = staffProperty?.currency || (myTickets[0] as any)?.currency || DEFAULT_CURRENCY_SYMBOL;
  const staffCurrency = getCurrencySymbol(staffRawCurrency) || DEFAULT_CURRENCY_SYMBOL;
  const confirmedEarnings = myTickets
    .filter((t) => t.payment.status === 'confirmed')
    .reduce((sum, t) => sum + (t.payment.amount || 0), 0);

  const pendingConfirmAmount = myTickets
    .filter((t) => t.payment.status === 'pending_approval')
    .reduce((sum, t) => sum + (t.payment.amount || 0), 0);

  const awaitingPaymentAmount = myTickets
    .filter((t) => t.payment.status === 'awaiting_payment')
    .reduce((sum, t) => sum + (t.payment.amount || 0), 0);

  const handleSendPaymentReminder = async (ticket: any) => {
    setRemindingTicketId(ticket.id);
    try {
      sendStaffPaymentReminder(ticket.id);
      setRemindedTickets((prev) => ({ ...prev, [ticket.id]: true }));
    } finally {
      setRemindingTicketId(null);
    }
  };

  const handleMarkPaymentCompleted = async (ticketId: string) => {
    const target = state.tickets.find((t) => t.id === ticketId);
    if (!target) return;
    setSettlingTicketId(ticketId);
    try {
      const updatedTicket = {
        ...target,
        payment: {
          ...target.payment,
          status: 'confirmed' as const,
        },
      };
      await saveTicket(updatedTicket);
      showToast(`Task fee for ticket ${ticketId} marked as completed & settled.`);
    } finally {
      setSettlingTicketId(null);
    }
  };

  return (
    <div>
      {/* Metrics Row */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginBottom: '20px' }}>
        <div className="stat">
          <div className="num" style={{ color: 'var(--ledger)' }}>
            {staffCurrency}{confirmedEarnings.toLocaleString()}
          </div>
          <div className="lbl">Settled Earnings</div>
          <div className="delta">Received & verified</div>
        </div>

        <div className="stat">
          <div className="num" style={{ color: 'var(--brass)' }}>
            {staffCurrency}{pendingConfirmAmount.toLocaleString()}
          </div>
          <div className="lbl">Awaiting My Confirmation</div>
          <div className="delta">Payer submitted payment</div>
        </div>

        <div className="stat">
          <div className="num" style={{ color: 'var(--ink-soft)' }}>
            {staffCurrency}{awaitingPaymentAmount.toLocaleString()}
          </div>
          <div className="lbl">Awaiting Payment</div>
          <div className="delta">Work completed, invoice open</div>
        </div>
      </div>

      {/* Task Payments List */}
      <div className="section-title">Task Payment Records ({myTickets.length})</div>
      <div className="panel">
        <div className="panel-body">
          {myTickets.length === 0 ? (
            <div style={{ color: 'var(--ink-soft)', padding: '24px 16px', textAlign: 'center' }}>
              No task payments recorded yet. Completed repair tickets with fee charges will appear here.
            </div>
          ) : (
            <>
              {/* Desktop / Tablet Table (>640px) */}
              <div className="staff-desktop-table">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Payer</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myTickets.map((t) => {
                        const unitCurr = state.units.find((u) => u.unitNumber === t.unit || u.id === t.unit)?.currency;
                        const ticketDisplayCurr = getCurrencySymbol(unitCurr || (t as any).currency || staffCurrency) || staffCurrency;
                        return (
                          <tr key={t.id}>
                            <td><b>{t.id}</b></td>
                            <td style={{ textTransform: 'capitalize' }}>{t.payment.payer}</td>
                            <td style={{ fontWeight: 600 }}>{ticketDisplayCurr}{t.payment.amount?.toLocaleString()}</td>
                            <td>{t.payment.method || '—'}</td>
                            <td>
                              <span
                                className={`badge ${
                                  t.payment.status === 'confirmed'
                                    ? 'green'
                                    : t.payment.status === 'pending_approval'
                                    ? 'brass'
                                    : 'amber'
                                }`}
                              >
                                {t.payment.status === 'confirmed'
                                  ? 'Confirmed'
                                  : t.payment.status === 'pending_approval'
                                  ? 'Pending confirmation'
                                  : 'Awaiting payment'}
                              </span>
                            </td>
                            <td>
                              {t.payment.status === 'confirmed' ? (
                                <span style={{ color: 'var(--ledger)', fontSize: '12.5px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <CheckCircle2 size={14} /> Completed
                                </span>
                              ) : t.payment.status === 'pending_approval' ? (
                                <button
                                  type="button"
                                  className="btn brass small"
                                  disabled={settlingTicketId === t.id}
                                  onClick={() => handleMarkPaymentCompleted(t.id)}
                                  title="Confirm receipt of submitted payment proof"
                                  style={{ fontWeight: 600 }}
                                >
                                  <ButtonProcessing
                                    loading={settlingTicketId === t.id}
                                    loadingText="Settling..."
                                    defaultText="Confirm receipt"
                                  />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  disabled={remindedTickets[t.id] || remindingTicketId === t.id}
                                  onClick={() => handleSendPaymentReminder(t)}
                                  title="Send payment reminder to payer"
                                >
                                  <ButtonProcessing
                                    loading={remindingTicketId === t.id}
                                    loadingText="Sending..."
                                    defaultText={remindedTickets[t.id] ? 'Reminder sent' : 'Send reminder'}
                                  />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Payment Cards (<=640px) */}
              <div className="staff-mobile-cards">
                {myTickets.map((t) => {
                  const unitCurr = state.units.find((u) => u.unitNumber === t.unit || u.id === t.unit)?.currency;
                  const ticketDisplayCurr = getCurrencySymbol(unitCurr || (t as any).currency || staffCurrency) || staffCurrency;
                  return (
                    <div key={t.id} className="staff-card">
                      <div className="staff-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <b style={{ fontSize: '14px', color: 'var(--ink)' }}>{t.id}</b>
                          <span className="badge grey" style={{ textTransform: 'capitalize' }}>
                            Payer: {t.payment.payer}
                          </span>
                        </div>
                        <span
                          className={`badge ${
                            t.payment.status === 'confirmed'
                              ? 'green'
                              : t.payment.status === 'pending_approval'
                              ? 'brass'
                              : 'amber'
                          }`}
                        >
                          {t.payment.status === 'confirmed'
                            ? 'Settled'
                            : t.payment.status === 'pending_approval'
                            ? 'Action Needed'
                            : 'Unpaid'}
                        </span>
                      </div>

                      <div style={{ margin: '8px 0', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '22px', fontWeight: 700, color: t.payment.status === 'confirmed' ? 'var(--ledger)' : 'var(--ink)' }}>
                          {ticketDisplayCurr}{t.payment.amount?.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                          Method: <b>{t.payment.method || 'Standard'}</b>
                        </div>
                      </div>

                      <div className="staff-card-footer">
                        {t.payment.status === 'confirmed' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--ledger)', fontSize: '12.5px', fontWeight: 600 }}>
                            <CheckCircle2 size={15} /> Completed & Settled
                          </div>
                        ) : t.payment.status === 'pending_approval' ? (
                          <div style={{ width: '100%' }}>
                            <button
                              type="button"
                              className="btn brass small btn-mobile-full"
                              style={{ fontWeight: 600 }}
                              disabled={settlingTicketId === t.id}
                              onClick={() => handleMarkPaymentCompleted(t.id)}
                            >
                              <ButtonProcessing
                                loading={settlingTicketId === t.id}
                                loadingText="Settling..."
                                defaultText="✓ Confirm receipt"
                              />
                            </button>
                          </div>
                        ) : (
                          <div style={{ width: '100%' }}>
                            <button
                              type="button"
                              className="btn secondary small btn-mobile-full"
                              disabled={remindedTickets[t.id] || remindingTicketId === t.id}
                              onClick={() => handleSendPaymentReminder(t)}
                            >
                              <ButtonProcessing
                                loading={remindingTicketId === t.id}
                                loadingText="Sending..."
                                defaultText={remindedTickets[t.id] ? 'Reminder sent' : 'Send Payment Reminder'}
                              />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
