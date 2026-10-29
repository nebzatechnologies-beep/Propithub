import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { StaffMember, Ticket } from '../../types';
import { Key, Copy, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { PlanLimitModal } from '../../components/common/PlanLimitModal';
import { FloatingActionButton } from '../../components/common/FloatingActionButton';
import { ButtonProcessing } from '../../components/common/Spinner';
import { Wrench, Plus, UserPlus } from 'lucide-react';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol } from '../../lib/currencyService';

export const MaintenancePage: React.FC = () => {
  const { state, updateState, createOwnerMaintenanceTicket, saveTicket, saveStaff, deleteStaff, showToast } = useAppData();
  const { user, provisionUser } = useAuth();
  const navigate = useNavigate();
  const ownerId = user?.id || '';

  const [subTab, setSubTab] = useState<'staff' | 'tickets' | 'payments'>('tickets');

  // Manual owner ticket modal state
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [newTicketUnit, setNewTicketUnit] = useState('A-101');
  const [newTicketIssue, setNewTicketIssue] = useState('');
  const [newTicketCategory, setNewTicketCategory] = useState('Plumbing');
  const [newTicketPriority, setNewTicketPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [newTicketAssignee, setNewTicketAssignee] = useState('');
  const [newTicketCost, setNewTicketCost] = useState(1200);

  // Onboard staff modal
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [isProvisioningStaff, setIsProvisioningStaff] = useState(false);
  const [copiedStaffCredentials, setCopiedStaffCredentials] = useState(false);

  // Staff credentials modal
  const [staffCredentialsModal, setStaffCredentialsModal] = useState<{
    isOpen: boolean;
    name: string;
    email: string;
    password: string;
    role: string;
  } | null>(null);

  const generateRandomStaffPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let rand = '';
    for (let i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `Staff#${rand}`;
  };

  // Assign ticket modal
  const [assigningTicket, setAssigningTicket] = useState<Ticket | null>(null);
  const [assigneeName, setAssigneeName] = useState('');
  const [assignPayer, setAssignPayer] = useState<'owner' | 'tenant'>('owner');
  const [assignAmount, setAssignAmount] = useState<number | ''>(500);

  // Mark task paid modal
  const [payingTicket, setPayingTicket] = useState<Ticket | null>(null);
  const [payMethod, setPayMethod] = useState('Cash');

  // Remove staff confirmation
  const [staffToRemove, setStaffToRemove] = useState<StaffMember | null>(null);

  // Resolve ticket modal
  const [ticketToResolve, setTicketToResolve] = useState<Ticket | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const myStaff = state.staff.filter((s) => Boolean(ownerId) && s.ownerId === ownerId);
  const myTickets = state.tickets.filter((t) => Boolean(ownerId) && t.ownerId === ownerId);
  const myProperties = state.properties.filter((p) => Boolean(ownerId) && p.ownerId === ownerId);
  const myPropertyIds = new Set(myProperties.map((p) => p.id));
  const myUnits = state.units.filter(
    (u) => (ownerId && u.ownerId === ownerId) || (u.propertyId && myPropertyIds.has(u.propertyId))
  );

  const resolveTicketCurrency = (ticket?: Ticket | null) => {
    if (!ticket) return DEFAULT_CURRENCY_SYMBOL;
    const unitMatch = state.units.find(
      (u) => (!ticket.propertyId || u.propertyId === ticket.propertyId) && (u.unitNumber === ticket.unit || u.id === ticket.unit)
    );
    const propMatch = ticket.propertyId ? state.properties.find((p) => p.id === ticket.propertyId) : null;
    return getCurrencySymbol(unitMatch?.currency || propMatch?.currency) || DEFAULT_CURRENCY_SYMBOL;
  };

  const {
    currentPlan,
    currentPlanName,
    usage,
    checkAndRun,
    limitModalResource,
    openLimitModal,
    closeLimitModal,
    isExpired,
  } = usePlanLimits();

  const maxStaff = usage.staff.max;
  const isStaffLimitReached = usage.staff.isFull;

  const handleAddStaff = async () => {
    if (isStaffLimitReached) {
      openLimitModal('staff');
      return;
    }
    const name = newStaffName.trim();
    if (!name) {
      showToast('Please enter the technician full name.');
      return;
    }
    const staffEmail = newStaffEmail.trim().toLowerCase();
    if (!staffEmail || !staffEmail.includes('@')) {
      showToast('Please enter a valid email address.');
      return;
    }
    const passwordToUse = newStaffPassword.trim() || generateRandomStaffPassword();
    if (passwordToUse.length < 6) {
      showToast('Password must be at least 6 characters long.');
      return;
    }

    setIsProvisioningStaff(true);
    const res = await provisionUser({
      name,
      email: staffEmail,
      password: passwordToUse,
      role: 'staff',
      phone: newStaffPhone.trim(),
      ownerId,
      ownerName: user?.displayName || 'Property Owner',
    });

    setIsProvisioningStaff(false);

    if (!res.success || !res.uid) {
      showToast(res.error || 'Failed to onboard staff member.');
      return;
    }

    const staffId = res.uid;
    const newStaff: StaffMember = {
      id: staffId,
      name,
      role: newStaffRole.trim() || 'General maintenance',
      ownerName: user?.displayName || 'Property Owner',
      ownerId,
      phone: newStaffPhone.trim(),
      email: staffEmail,
      activeTickets: 0,
      completed: 0,
      rating: 5.0,
      tempPassword: passwordToUse,
      paymentDetails: {
        method: 'bank',
        bank: { accountName: '', accountNumber: '', country: '', routing: '' },
        upi: { upiId: '', qrImage: null },
        paypalEmail: '',
      },
    };

    await saveStaff(newStaff);

    setIsOnboardOpen(false);
    setNewStaffName('');
    setNewStaffEmail('');
    setNewStaffRole('');
    setNewStaffPhone('');
    setNewStaffPassword('');

    setStaffCredentialsModal({
      isOpen: true,
      name,
      email: staffEmail,
      password: passwordToUse,
      role: newStaff.role,
    });
    showToast(`${name} onboarded with login credentials.`);
  };

  const handleRemoveStaff = async (id: string, name: string) => {
    // Match by staff ID first (authoritative), name only as a secondary safety net
    const activeTicketsToUpdate = state.tickets.filter(
      (t) =>
        (t.assignedStaffId === id) &&
        t.status !== 'resolved'
    );

    for (const t of activeTicketsToUpdate) {
      await saveTicket({
        ...t,
        assignedTo: null,
        assignedStaffId: null,
        status: 'open',
      });
    }

    await deleteStaff(id);
    showToast(
      activeTicketsToUpdate.length > 0
        ? `${name} removed from your team. ${activeTicketsToUpdate.length} active ticket(s) unassigned.`
        : `${name} removed from your team.`
    );
  };

  const handleCreateTicket = () => {
    if (!newTicketIssue.trim()) {
      showToast('Please describe the maintenance issue.');
      return;
    }
    // Scope unit lookup to owner's units — prevents linking ticket to another owner's same-numbered unit
    const unitObj = myUnits.find((u) => u.id === newTicketUnit) ||
      myUnits.find((u) => u.unitNumber === newTicketUnit);
    const staffObj = newTicketAssignee
      ? myStaff.find((s) => s.name === newTicketAssignee || s.id === newTicketAssignee) ||
        state.staff.find((s) => s.id === newTicketAssignee && s.ownerId === ownerId)
      : null;

    const resolvedPropId = unitObj?.propertyId || myProperties[0]?.id || '';

    createOwnerMaintenanceTicket({
      ownerId,
      propertyId: resolvedPropId,
      unit: unitObj?.unitNumber || newTicketUnit,
      unitId: unitObj?.id || undefined,
      tenant: unitObj?.tenant || 'Direct Owner Ticket',
      issue: `[${newTicketCategory}] ${newTicketIssue.trim()}`,
      priority: newTicketPriority,
      assignedTo: staffObj?.name || newTicketAssignee || null,
      assignedStaffId: staffObj?.id || null,
      payment: {
        payer: 'owner',
        amount: newTicketCost,
        method: null,
        status: 'awaiting_payment',
      },
    });
    setIsNewTicketOpen(false);
    setNewTicketIssue('');
  };

  const handleAssignTicket = async () => {
    if (!assigningTicket || !assigneeName) {
      showToast('Choose a staff member first.');
      return;
    }

    const amt = typeof assignAmount === 'number' ? assignAmount : 0;
    const staffObj = myStaff.find((s) => s.name === assigneeName || s.id === assigneeName) ||
      state.staff.find((s) => s.id === assigneeName && s.ownerId === ownerId);

    const updatedTicket: Ticket = {
      ...assigningTicket,
      assignedTo: staffObj?.name || assigneeName,
      assignedStaffId: staffObj?.id || null,
      status: 'assigned',
      payment: {
        payer: assignPayer,
        amount: amt,
        method: null,
        status: amt ? 'awaiting_payment' : 'none',
      },
    };

    await saveTicket(updatedTicket);

    const assignCurr = resolveTicketCurrency(assigningTicket);
    showToast(
      `${assigningTicket.id} assigned to ${assigneeName}${
        amt ? ` • ${assignPayer} will pay ${assignCurr}${amt.toLocaleString()}` : ''
      }.`
    );
    setAssigningTicket(null);
  };

  const handleResolveTicket = async (id: string) => {
    const targetTicket = state.tickets.find((t) => t.id === id);
    if (!targetTicket) return;
    const updatedTicket: Ticket = { ...targetTicket, status: 'resolved' };
    await saveTicket(updatedTicket);

    const tenantId = targetTicket?.tenantId;
    const notif = tenantId
      ? {
          id: `notif_${Date.now()}`,
          userId: tenantId,
          title: 'Maintenance Ticket Resolved',
          body: `Ticket ${id} for Unit ${targetTicket?.unit || 'Unit'} ("${targetTicket?.issue || 'Maintenance issue'}") has been marked resolved.`,
          link: '/tenant/support',
          isRead: false,
          createdAt: new Date().toISOString(),
        }
      : null;

    if (notif) {
      updateState((prev) => ({
        ...prev,
        notifications: [...(prev.notifications || []), notif],
      }));
    }
    showToast(`${id} marked resolved. Tenant notified.`);
  };

  const handleSubmitTaskPayment = async () => {
    if (!payingTicket) return;
    const updatedTicket: Ticket = {
      ...payingTicket,
      payment: {
        ...payingTicket.payment,
        method: payMethod,
        status: 'pending_approval',
      },
    };
    await saveTicket(updatedTicket);

    showToast(`Marked as paid — waiting for ${payingTicket.assignedTo} to confirm receipt.`);
    setPayingTicket(null);
  };

  const renderStars = (rating: number = 5.0) => {
    const fullStars = Math.floor(rating);
    return (
      <span style={{ color: 'var(--brass)', letterSpacing: '1px' }}>
        {'★'.repeat(fullStars)}
        {rating % 1 !== 0 ? '½' : ''}
        <span style={{ color: 'var(--ink-soft)', fontSize: '12px', marginLeft: '4px' }}>
          ({rating.toFixed(1)})
        </span>
      </span>
    );
  };

  return (
    <div>
      <div className="tabs">
        <div
          className={`tab ${subTab === 'staff' ? 'active' : ''}`}
          onClick={() => setSubTab('staff')}
        >
          Staff
        </div>
        <div
          className={`tab ${subTab === 'tickets' ? 'active' : ''}`}
          onClick={() => setSubTab('tickets')}
        >
          Tickets
        </div>
        <div
          className={`tab ${subTab === 'payments' ? 'active' : ''}`}
          onClick={() => setSubTab('payments')}
        >
          Task payments
        </div>
      </div>

      {subTab === 'staff' && (
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div className="hint">{myStaff.length} of {maxStaff} team members used ({currentPlanName} plan)</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                title={isStaffLimitReached ? `Staff limit reached (${maxStaff} max) - Click to upgrade` : ''}
                onClick={() => checkAndRun('staff', () => setIsOnboardOpen(true))}
              >
                + Onboard staff member
              </button>
              {isStaffLimitReached && (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => openLimitModal('staff')}
                >
                  Upgrade for More Staff
                </button>
              )}
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {myStaff.length === 0 ? (
              <div className="panel" style={{ gridColumn: '1 / -1' }}>
                <div className="panel-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <h3 style={{ marginBottom: '6px' }}>No maintenance staff onboarded</h3>
                  <p className="hint" style={{ marginBottom: '0' }}>Click &quot;+ Onboard staff member&quot; above to add technicians to your portfolio (Allowance: {maxStaff} members).</p>
                </div>
              </div>
            ) : (
              myStaff.map((s) => (
                <div key={s.id} className="panel">
                <div className="panel-body">
                  <div className="person" style={{ marginBottom: '12px' }}>
                    <div className="avatar">{s.name.slice(0, 2).toUpperCase()}</div>
                    <div className="who">
                      <b>{s.name}</b>
                      <span>{s.role}</span>
                    </div>
                  </div>
                  <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Email</span>
                    <span>{s.email}</span>
                  </div>
                  <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Phone</span>
                    <span>{s.phone || '—'}</span>
                  </div>
                  <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Active tickets</span>
                    <span>{s.activeTickets}</span>
                  </div>
                  <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Completed</span>
                    <span>{s.completed}</span>
                  </div>
                  <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Rating</span>
                    <span>{(() => {
                      const staffTickets = state.tickets.filter(
                        (t) =>
                          t.status === 'resolved' &&
                          ((s.id && t.assignedStaffId === s.id) ||
                            (t.assignedTo && t.assignedTo.toLowerCase() === s.name.toLowerCase())) &&
                          (t as any).rating &&
                          (t as any).rating > 0
                      );
                      const dynamicRating = staffTickets.length > 0
                        ? staffTickets.reduce((acc, t) => acc + ((t as any).rating || 5), 0) / staffTickets.length
                        : (s.rating || 5.0);
                      return renderStars(dynamicRating);
                    })()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                    {s.tempPassword && (
                      <button
                        type="button"
                        className="btn secondary small"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => {
                          setStaffCredentialsModal({
                            isOpen: true,
                            name: s.name,
                            email: s.email,
                            password: s.tempPassword || '',
                            role: s.role,
                          });
                        }}
                      >
                        <Key size={12} /> Credentials
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setStaffToRemove(s)}
                    >
                      Remove from team
                    </button>
                  </div>
                </div>
              </div>
            )))}
          </div>
        </div>
      )}

      {subTab === 'tickets' && (
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div className="hint">{myTickets.length} active and historic tickets</div>
            <button
              type="button"
              className="btn brass btn-mobile-full"
              onClick={() => setIsNewTicketOpen(true)}
            >
              + Raise Maintenance Ticket
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
                      <th>Unit</th>
                      <th>Tenant</th>
                      <th>Issue</th>
                      <th>Priority</th>
                      <th>Assigned to</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myTickets.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px 16px' }}>
                          No maintenance tickets on record. Click "+ Raise Maintenance Ticket" above to report an issue.
                        </td>
                      </tr>
                    ) : (
                      myTickets.map((t) => (
                      <tr key={t.id}>
                        <td><b>{t.id}</b></td>
                        <td>{t.unit}</td>
                        <td>{t.tenant}</td>
                        <td>{t.issue}</td>
                        <td>
                          <span
                            className={`badge ${
                              t.priority === 'High' ? 'red' : t.priority === 'Medium' ? 'amber' : 'grey'
                            }`}
                          >
                            {t.priority}
                          </span>
                        </td>
                        <td>
                          {t.assignedTo ? (
                            t.assignedTo
                          ) : (
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => {
                                setAssigningTicket(t);
                                setAssigneeName(myStaff[0]?.name || '');
                              }}
                            >
                              Assign & set who pays
                            </button>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              t.status === 'resolved'
                                ? 'green'
                                : t.status === 'assigned'
                                ? 'brass'
                                : 'amber'
                            }`}
                          >
                            {t.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {t.status !== 'resolved' && t.assignedTo ? (
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => {
                                setTicketToResolve(t);
                                setResolutionNotes('Repairs completed and tested in accordance with building standards.');
                              }}
                            >
                              Mark resolved
                            </button>
                          ) : (
                            <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>—</span>
                          )}
                        </td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="mobile-card-view">
              {myTickets.length === 0 ? (
                <div className="staff-card" style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 16px' }}>
                  No maintenance tickets on record. Click "+ Raise Maintenance Ticket" above to report an issue.
                </div>
              ) : (
                myTickets.map((t) => (
                  <div key={t.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <b style={{ fontSize: '14px' }}>{t.id}</b>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Unit {t.unit} • {t.tenant}</div>
                      </div>
                      <span
                        className={`badge ${
                          t.status === 'resolved'
                            ? 'green'
                            : t.status === 'assigned'
                            ? 'brass'
                            : 'amber'
                        }`}
                      >
                        {t.status.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ padding: '8px 10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '13px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>{t.issue}</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
                        <span className="badge grey">{(t as any).category || 'General'}</span>
                        <span className={`badge ${t.priority === 'High' ? 'red' : t.priority === 'Medium' ? 'amber' : 'grey'}`}>
                          {t.priority} Priority
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <span style={{ color: 'var(--ink-soft)' }}>Assigned to:</span>
                      <b>{t.assignedTo || 'Unassigned'}</b>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {!t.assignedTo ? (
                        <button
                          type="button"
                          className="btn secondary small btn-mobile-full"
                          onClick={() => {
                            setAssigningTicket(t);
                            setAssigneeName(myStaff[0]?.name || '');
                          }}
                        >
                          Assign &amp; set who pays
                        </button>
                      ) : t.status !== 'resolved' ? (
                        <button
                          type="button"
                          className="btn brass small btn-mobile-full"
                          onClick={() => {
                            setTicketToResolve(t);
                            setResolutionNotes('Repairs completed and tested in accordance with building standards.');
                          }}
                        >
                          Mark resolved
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {subTab === 'payments' && (
        <div>
          <div className="panel">
            <div className="panel-body">
              {/* Desktop Table View */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Staff</th>
                        <th>Payer</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myTickets.filter((t) => t.payment && t.payment.status !== 'none').length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ color: 'var(--ink-soft)', padding: '16px 10px' }}>
                            No task payments yet.
                          </td>
                        </tr>
                      ) : (
                        myTickets
                          .filter((t) => t.payment && t.payment.status !== 'none')
                          .map((t) => (
                            <tr key={t.id}>
                              <td><b>{t.id}</b></td>
                              <td>{t.assignedTo}</td>
                              <td style={{ textTransform: 'capitalize' }}>{t.payment.payer}</td>
                              <td>{t.payment?.amount ? `${resolveTicketCurrency(t)}${(t.payment.amount ?? 0).toLocaleString()}` : '—'}</td>
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
                                  {t.payment.status === 'awaiting_payment'
                                    ? 'Awaiting payment'
                                    : t.payment.status === 'pending_approval'
                                    ? 'Pending confirmation'
                                    : 'Paid'}
                                </span>
                              </td>
                              <td>
                                {t.payment.status === 'awaiting_payment' && t.payment.payer === 'owner' ? (
                                  <button
                                    type="button"
                                    className="btn secondary small"
                                    onClick={() => setPayingTicket(t)}
                                  >
                                    Mark as paid
                                  </button>
                                ) : (
                                  <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>—</span>
                                )}
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
                {myTickets.filter((t) => t.payment && t.payment.status !== 'none').length === 0 ? (
                  <div className="staff-card" style={{ color: 'var(--ink-soft)', padding: '24px 16px', textAlign: 'center' }}>
                    No task payments yet.
                  </div>
                ) : (
                  myTickets
                    .filter((t) => t.payment && t.payment.status !== 'none')
                    .map((t) => (
                      <div key={t.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div>
                            <b style={{ fontSize: '14px' }}>{t.id}</b>
                            <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Staff: {t.assignedTo}</div>
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
                            {t.payment.status === 'awaiting_payment'
                              ? 'Awaiting payment'
                              : t.payment.status === 'pending_approval'
                              ? 'Pending confirmation'
                              : 'Paid'}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                          <div>
                            <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Payer</div>
                            <b style={{ textTransform: 'capitalize' }}>{t.payment.payer}</b>
                          </div>
                          <div>
                            <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Amount</div>
                            <b style={{ color: 'var(--ledger)' }}>{t.payment?.amount ? `${resolveTicketCurrency(t)}${(t.payment.amount ?? 0).toLocaleString()}` : '—'}</b>
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Payment Method</div>
                            <span>{t.payment.method || 'Not specified'}</span>
                          </div>
                        </div>

                        {t.payment.status === 'awaiting_payment' && t.payment.payer === 'owner' && (
                          <button
                            type="button"
                            className="btn brass small btn-mobile-full"
                            onClick={() => setPayingTicket(t)}
                          >
                            Mark as paid
                          </button>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onboard Staff Modal */}
      {isOnboardOpen && (
        <div className="modal-backdrop" onClick={() => setIsOnboardOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Onboard maintenance staff</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setIsOnboardOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Name</label>
                <input
                  type="text"
                  placeholder="Full name"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Specialty</label>
                <input
                  type="text"
                  placeholder="Electrician, Plumber, General…"
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. staff@example.com"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Phone</label>
                <input
                  type="text"
                  placeholder="e.g. +91 98000 00000"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                />
              </div>

              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ margin: 0 }}>Login Password / Temporary Password</label>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--brass)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      padding: 0,
                    }}
                    onClick={() => {
                      const pwd = generateRandomStaffPassword();
                      setNewStaffPassword(pwd);
                      setShowStaffPassword(true);
                    }}
                  >
                    ⚡ Auto-Generate
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showStaffPassword ? 'text' : 'password'}
                    placeholder="Min 6 characters (e.g. Staff#3f8a1)"
                    value={newStaffPassword}
                    style={{ paddingRight: '40px' }}
                    onChange={(e) => setNewStaffPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowStaffPassword(!showStaffPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--ink-soft)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={showStaffPassword ? 'Hide password' : 'Show password'}
                  >
                    {showStaffPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '4px', display: 'block' }}>
                  The technician will use this password to log in at /login. Leave blank to auto-generate.
                </span>
              </div>

              <p className="hint">
                This person will be available for tickets across all of your properties.
              </p>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', padding: '16px 20px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                disabled={isProvisioningStaff}
                onClick={() => setIsOnboardOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isProvisioningStaff ? 'btn-processing' : ''}`}
                disabled={isProvisioningStaff}
                onClick={handleAddStaff}
              >
                <ButtonProcessing
                  loading={isProvisioningStaff}
                  loadingText="Provisioning Staff..."
                  defaultText="Onboard & Provision Staff"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Credentials Ready Modal */}
      {staffCredentialsModal?.isOpen && (
        <div className="modal-backdrop" onClick={() => setStaffCredentialsModal(null)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Staff Credentials Ready</h3>
                  <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Technician account provisioned</span>
                </div>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setStaffCredentialsModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink)', marginBottom: '16px', lineHeight: 1.5 }}>
                Share these login details with <b>{staffCredentialsModal.name}</b> ({staffCredentialsModal.role}). They can sign in immediately at the portal to access their maintenance queue.
              </p>

              <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Portal URL:</span>
                  <span style={{ fontWeight: 600, color: 'var(--brass)' }}>{window.location.origin}/login</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Email:</span>
                  <span style={{ fontWeight: 600 }}>{staffCredentialsModal.email}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Password:</span>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '14px', background: 'var(--line-strong)', padding: '2px 8px', borderRadius: '4px' }}>
                    {staffCredentialsModal.password}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Role:</span>
                  <span>{staffCredentialsModal.role}</span>
                </div>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => {
                    const text = `PropHub Staff Access Credentials:\nURL: ${window.location.origin}/login\nEmail: ${staffCredentialsModal.email}\nPassword: ${staffCredentialsModal.password}\nRole: ${staffCredentialsModal.role}`;
                    navigator.clipboard.writeText(text);
                    setCopiedStaffCredentials(true);
                    showToast('Staff credentials copied to clipboard!');
                    setTimeout(() => setCopiedStaffCredentials(false), 3000);
                  }}
                >
                  {copiedStaffCredentials ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                  {copiedStaffCredentials ? 'Copied!' : 'Copy Credentials'}
                </button>
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn brass"
                onClick={() => setStaffCredentialsModal(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Ticket & Set Who Pays Modal */}
      {assigningTicket && (
        <div className="modal-backdrop" onClick={() => setAssigningTicket(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Assign staff & set who pays</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setAssigningTicket(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Assign to</label>
                <select
                  value={assigneeName}
                  onChange={(e) => setAssigneeName(e.target.value)}
                >
                  <option value="">Choose staff member…</option>
                  {myStaff.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Who pays for this task?</label>
                <select
                  value={assignPayer}
                  onChange={(e) => setAssignPayer(e.target.value as 'owner' | 'tenant')}
                >
                  <option value="owner">Owner</option>
                  <option value="tenant">Tenant</option>
                </select>
              </div>
              <div className="field">
                <label>Amount ({resolveTicketCurrency(assigningTicket)}, optional)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={assignAmount === 0 ? '' : assignAmount}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                    setAssignAmount(cleaned ? Number(cleaned) : '');
                  }}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', padding: '16px 20px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setAssigningTicket(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={handleAssignTicket}
              >
                Assign ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Task Paid Modal */}
      {payingTicket && (
        <div className="modal-backdrop" onClick={() => setPayingTicket(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Mark task payment as paid</h3>
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
                <label>Payment method used</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank transfer">Bank transfer</option>
                  <option value="PayPal">PayPal</option>
                  <option value="Razorpay">Razorpay</option>
                  <option value="Stripe">Stripe</option>
                </select>
              </div>
              <p className="hint">
                This sends a confirmation request to {payingTicket.assignedTo} — they'll mark it received on their end.
              </p>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', padding: '16px 20px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setPayingTicket(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={handleSubmitTaskPayment}
              >
                Confirm I've paid
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Remove Staff Confirmation Modal */}
      {staffToRemove && (
        <div className="modal-backdrop" onClick={() => setStaffToRemove(null)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Remove Staff Member</h3>
              <button type="button" className="btn secondary small" onClick={() => setStaffToRemove(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to remove <b>{staffToRemove.name}</b> ({staffToRemove.role}) from your maintenance team?</p>
              <p className="hint" style={{ marginTop: '8px' }}>
                Any active tickets currently assigned to {staffToRemove.name} will require reassignment.
              </p>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setStaffToRemove(null)}>Cancel</button>
              <button
                type="button"
                className="btn danger btn-mobile-full"
                onClick={() => {
                  handleRemoveStaff(staffToRemove.id, staffToRemove.name);
                  setStaffToRemove(null);
                }}
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Ticket with Notes Modal */}
      {ticketToResolve && (
        <div className="modal-backdrop" onClick={() => setTicketToResolve(null)}>
          <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Resolve Ticket: {ticketToResolve.id}</h3>
              <button type="button" className="btn secondary small" onClick={() => setTicketToResolve(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Issue:</span>
                <b>{ticketToResolve.issue}</b>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Unit:</span>
                <span>{ticketToResolve.unit}</span>
              </div>
              <div className="field" style={{ marginTop: '12px' }}>
                <label>Resolution Summary (visible to tenant)</label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Describe the fix or replacement performed..."
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setTicketToResolve(null)}>Cancel</button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={async () => {
                  await saveTicket({ ...ticketToResolve, status: 'resolved' });
                  showToast(`${ticketToResolve.id} resolved. Tenant notified.`);
                  setTicketToResolve(null);
                }}
              >
                Confirm & Resolve Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Limit Paywall Modal */}
      {limitModalResource && (
        <PlanLimitModal
          resourceType={limitModalResource}
          currentUsage={usage[limitModalResource].used}
          limit={usage[limitModalResource].max}
          planName={currentPlanName}
          onClose={closeLimitModal}
          onUpgrade={() => navigate('/owner/subscription')}
        />
      )}

      {/* Dynamic Mobile Floating Action Button */}
      {subTab === 'staff' && (
        <FloatingActionButton
          label="Onboard Staff"
          icon={UserPlus}
          onClick={() => checkAndRun('staff', () => setIsOnboardOpen(true))}
          disabled={isExpired}
          mobileOnly={true}
        />
      )}

      {subTab === 'tickets' && (
        <FloatingActionButton
          label="New Ticket"
          icon={Wrench}
          onClick={() => setIsNewTicketOpen(true)}
          disabled={isExpired}
          mobileOnly={true}
        />
      )}
    </div>
  );
};
