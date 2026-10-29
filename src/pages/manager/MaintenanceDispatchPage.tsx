import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { StaffMember, Ticket, UserProfile } from '../../types';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { PlanLimitModal } from '../../components/common/PlanLimitModal';
import { ButtonProcessing } from '../../components/common/Spinner';
import { DEFAULT_CURRENCY } from '../../lib/currencyService';

export const MaintenanceDispatchPage: React.FC = () => {
  const { state, updateState, saveStaff, saveTicket, showToast } = useAppData();
  const { user, provisionUser } = useAuth();
  const ownerId = user?.ownerId || '';

  const {
    currentPlan,
    currentPlanName,
    usage,
    limitModalResource,
    openLimitModal,
    closeLimitModal,
  } = usePlanLimits(ownerId);

  const maxStaff = usage.staff.max;
  const isStaffLimitReached = usage.staff.isFull;

  const [subTab, setSubTab] = useState<'tickets' | 'staff'>('tickets');
  const [isOnboardOpen, setIsOnboardOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [resolvingTicketId, setResolvingTicketId] = useState<string | null>(null);

  const [assigningTicket, setAssigningTicket] = useState<Ticket | null>(null);
  const [assigneeName, setAssigneeName] = useState('');
  const [assignPayer, setAssignPayer] = useState<'owner' | 'tenant'>('owner');
  const [assignAmount, setAssignAmount] = useState<number | ''>(500);

  const managerRecord = (state.managers || []).find(
    (m) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase() === user.email.toLowerCase())
  );
  const assignedPropertyId = (user as any)?.propertyId || (user as any)?.assignedPropertyId || managerRecord?.propertyId || '';

  const myProperties = useMemo(() => {
    if (!ownerId) return [];
    const props = state.properties.filter((p) => p.ownerId === ownerId);
    if (assignedPropertyId) {
      return props.filter((p) => p.id === assignedPropertyId || p.assignedManagerId === user?.id);
    }
    const explicitlyAssigned = props.filter((p) => p.assignedManagerId === user?.id);
    return explicitlyAssigned.length > 0 ? explicitlyAssigned : props;
  }, [state.properties, ownerId, assignedPropertyId, user?.id]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const getTicketCurrency = (t: Ticket | null | undefined): string => {
    if (!t) return myProperties[0]?.currency || DEFAULT_CURRENCY;
    return (t as any).currency || state.units.find((u) => u.unitNumber === t.unit || u.id === t.unit)?.currency || state.properties.find((p) => p.id === t.propertyId)?.currency || myProperties[0]?.currency || DEFAULT_CURRENCY;
  };

  const myStaff = ownerId ? state.staff.filter((s) => s.ownerId === ownerId) : [];

  const myTickets = useMemo(() => {
    if (!ownerId) return [];
    return state.tickets.filter((t) => t.ownerId === ownerId && (!t.propertyId || myPropertyIds.has(t.propertyId)));
  }, [state.tickets, ownerId, myPropertyIds]);

  const handleOnboardStaff = async () => {
    if (isStaffLimitReached) {
      openLimitModal('staff');
      showToast(`Staff quota reached (${usage.staff.used}/${maxStaff} on ${currentPlanName} plan). Contact your property owner to upgrade.`);
      return;
    }

    const name = newStaffName.trim();
    const role = newStaffRole.trim();
    const email = newStaffEmail.trim().toLowerCase();
    const password = newStaffPassword.trim();

    if (!name || !role) {
      showToast('Enter both name and trade/role.');
      return;
    }
    if (!email || !email.includes('@')) {
      showToast('A valid email address is required so this staff member can log in.');
      return;
    }
    if (!password || password.length < 6) {
      showToast('Password must be at least 6 characters.');
      return;
    }

    setIsProvisioning(true);
    const ownerName = state.users.find((u) => u.id === ownerId)?.displayName || user?.displayName || 'Property Owner';
    const res = await provisionUser({
      name,
      email,
      password,
      role: 'staff',
      phone: newStaffPhone.trim() || undefined,
      ownerId,
      ownerName,
    });
    setIsProvisioning(false);

    if (!res.success || !res.uid) {
      showToast(res.error || 'Failed to provision staff account.');
      return;
    }

    const newStaffMember: StaffMember = {
      id: res.uid,
      name,
      role,
      ownerId,
      ownerName,
      phone: newStaffPhone.trim(),
      email,
      activeTickets: 0,
      rating: 5.0,
      completed: 0,
      paymentDetails: {
        method: 'bank',
        bank: { accountName: name, accountNumber: '', country: 'India', routing: '' },
        upi: { upiId: '', qrImage: null },
        paypalEmail: '',
      },
    };

    await saveStaff(newStaffMember);
    setIsOnboardOpen(false);
    setNewStaffName('');
    setNewStaffEmail('');
    setNewStaffPhone('');
    setNewStaffRole('');
    setNewStaffPassword('');
    showToast(`${name} onboarded — login: ${email}`);
  };

  const handleAssignTicket = async () => {
    if (!assigningTicket || !assigneeName) {
      showToast('Choose a staff member first.');
      return;
    }

    setIsAssigning(true);
    try {
      const amt = typeof assignAmount === 'number' ? assignAmount : 0;
      const staffObj = myStaff.find((s) => s.name === assigneeName || s.id === assigneeName) ||
        state.staff.find((s) => s.id === assigneeName && (ownerId ? s.ownerId === ownerId : false));
      const updatedTicket: Ticket = {
        ...assigningTicket,
        assignedTo: staffObj?.name || assigneeName,
        assignedStaffId: staffObj?.id || null,
        status: 'assigned',
        payment: {
          payer: assignPayer,
          amount: amt,
          method: assigningTicket.payment?.method || null,
          status: amt ? (assigningTicket.payment?.status && assigningTicket.payment.status !== 'none' ? assigningTicket.payment.status : 'awaiting_payment') : 'none',
        },
      };
      await saveTicket(updatedTicket);

      showToast(
        `${assigningTicket.id} assigned to ${assigneeName}${
          amt ? ` • ${assignPayer === 'owner' ? 'Owner' : 'Tenant'} will pay ${getTicketCurrency(assigningTicket)}${amt.toLocaleString()}` : ''
        }.`
      );
      setAssigningTicket(null);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleResolveTicket = async (id: string) => {
    const target = state.tickets.find((t) => t.id === id);
    if (!target) return;
    setResolvingTicketId(id);
    try {
      const updatedTicket: Ticket = { ...target, status: 'resolved' };
      await saveTicket(updatedTicket);
      showToast(`${id} marked resolved. Tenant notified.`);
    } finally {
      setResolvingTicketId(null);
    }
  };

  return (
    <div>
      <div className="tabs">
        <div
          className={`tab ${subTab === 'tickets' ? 'active' : ''}`}
          onClick={() => setSubTab('tickets')}
        >
          Active Repair Tickets ({myTickets.filter((t) => t.status !== 'resolved').length})
        </div>
        <div
          className={`tab ${subTab === 'staff' ? 'active' : ''}`}
          onClick={() => setSubTab('staff')}
        >
          Staff & Technicians ({myStaff.length})
        </div>
      </div>

      {subTab === 'tickets' ? (
        <div className="panel">
          <div className="panel-body">
            {myTickets.length === 0 ? (
              <div style={{ color: 'var(--ink-soft)', padding: '24px 16px', textAlign: 'center' }}>
                No repair tickets reported for your managed units.
              </div>
            ) : (
              <>
                {/* Desktop / Tablet Table View (>640px) */}
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
                          <th>Payer &amp; Cost</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myTickets.map((t) => (
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
                                <span style={{ fontWeight: 600 }}>{t.assignedTo}</span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  onClick={() => {
                                    setAssigningTicket(t);
                                    setAssigneeName(t.assignedTo || myStaff[0]?.name || '');
                                    setAssignPayer(t.payment?.payer || 'owner');
                                    setAssignAmount(typeof t.payment?.amount === 'number' ? t.payment.amount : 500);
                                  }}
                                >
                                  Assign staff
                                </button>
                              )}
                            </td>
                            <td>
                              {t.payment?.payer ? (
                                <div>
                                  <span className={`badge ${t.payment.payer === 'owner' ? 'brass' : 'blue'}`} style={{ textTransform: 'capitalize' }}>
                                    {t.payment.payer} pays
                                  </span>
                                  {typeof t.payment?.amount === 'number' && t.payment.amount > 0 && (
                                    <div style={{ fontSize: '11.5px', color: 'var(--ledger)', fontWeight: 600, marginTop: '2px' }}>
                                      {getTicketCurrency(t)}{t.payment.amount.toLocaleString()}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>—</span>
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
                                  disabled={resolvingTicketId === t.id}
                                  onClick={() => handleResolveTicket(t.id)}
                                >
                                  <ButtonProcessing
                                    loading={resolvingTicketId === t.id}
                                    loadingText="Resolving..."
                                    defaultText="Mark resolved"
                                  />
                                </button>
                              ) : (
                                <span style={{ color: 'var(--ink-soft)', fontSize: '12px' }}>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Ticket Cards (<=640px) */}
                <div className="mobile-card-view">
                  {myTickets.map((t) => (
                    <div key={t.id} className="staff-card">
                      <div className="staff-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <b style={{ fontSize: '14px', color: 'var(--ink)' }}>{t.id}</b>
                          <span
                            className={`badge ${
                              t.priority === 'High' ? 'red' : t.priority === 'Medium' ? 'amber' : 'grey'
                            }`}
                          >
                            {t.priority}
                          </span>
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

                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)', margin: '4px 0' }}>
                        {t.issue}
                      </div>

                      <div className="staff-card-meta">
                        <div className="staff-card-meta-item">
                          <span>Unit: <b>{t.unit}</b></span>
                        </div>
                        <div className="staff-card-meta-item">
                          <span>Tenant: {t.tenant}</span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '8px 10px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px', marginTop: '8px' }}>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Technician</div>
                          <b style={{ color: 'var(--ink)' }}>{t.assignedTo || 'Unassigned'}</b>
                        </div>
                        <div>
                          <div style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Who Pays / Cost</div>
                          <b style={{ color: t.payment?.payer === 'tenant' ? 'var(--brass)' : 'var(--ink)' }}>
                            {t.payment?.payer ? `${t.payment.payer === 'owner' ? 'Owner' : 'Tenant'}${typeof t.payment?.amount === 'number' && t.payment.amount > 0 ? ` (${getTicketCurrency(t)}${t.payment.amount.toLocaleString()})` : ''}` : 'Unassigned'}
                          </b>
                        </div>
                      </div>

                      <div className="staff-card-footer">
                        {!t.assignedTo ? (
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            style={{ fontWeight: 600 }}
                            onClick={() => {
                              setAssigningTicket(t);
                              setAssigneeName(t.assignedTo || myStaff[0]?.name || '');
                              setAssignPayer(t.payment?.payer || 'owner');
                              setAssignAmount(typeof t.payment?.amount === 'number' ? t.payment.amount : 500);
                            }}
                          >
                            Assign Technician
                          </button>
                        ) : t.status !== 'resolved' ? (
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            style={{ fontWeight: 600 }}
                            disabled={resolvingTicketId === t.id}
                            onClick={() => handleResolveTicket(t.id)}
                          >
                            <ButtonProcessing
                              loading={resolvingTicketId === t.id}
                              loadingText="Resolving..."
                              defaultText="Mark As Resolved"
                            />
                          </button>
                        ) : (
                          <span style={{ color: 'var(--ledger)', fontSize: '12px', fontWeight: 600 }}>
                            ✓ Resolved
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink)' }}>Technicians &amp; Team Members</div>
              <div className="hint" style={{ fontSize: '12.5px' }}>
                {myStaff.length} active staff • Quota: {usage.staff.used} of {maxStaff >= 999 ? '∞' : maxStaff} used ({currentPlanName} Plan)
              </div>
            </div>
            <button
              type="button"
              className="btn brass btn-mobile-full"
              onClick={() => {
                if (isStaffLimitReached) {
                  openLimitModal('staff');
                  return;
                }
                setIsOnboardOpen(true);
              }}
            >
              + Onboard staff member
            </button>
          </div>

          {isStaffLimitReached && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                background: 'rgba(234, 88, 12, 0.08)',
                border: '1px solid rgba(234, 88, 12, 0.3)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '13px', color: '#c2410c' }}>
                ⚠️ <b>Staff limit reached:</b> {usage.staff.used} of {maxStaff} staff members used on the <b>{currentPlanName}</b> subscription plan.
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => openLimitModal('staff')}
              >
                View Quota Details
              </button>
            </div>
          )}

          <div className="grid grid-3">
            {myStaff.map((s) => (
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
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Active tickets</span>
                    <span>{s.activeTickets}</span>
                  </div>
                  <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Completed</span>
                    <span>{s.completed}</span>
                  </div>
                  <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                    <span className="k" style={{ color: 'var(--ink-soft)' }}>Rating</span>
                    <span>★ {s.rating}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Onboard Staff Modal */}
      {isOnboardOpen && (
        <div className="modal-backdrop" onClick={() => setIsOnboardOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '480px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ fontSize: '16px' }}>Onboard maintenance staff</h3>
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
                <label>Full name</label>
                <input
                  type="text"
                  placeholder="Full name"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Email (login)</label>
                <input
                  type="email"
                  placeholder="staff@example.com"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Phone</label>
                <input
                  type="tel"
                  placeholder="+91 98000 00000"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Specialty / Trade</label>
                <input
                  type="text"
                  placeholder="Electrician, Plumber, General…"
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Temporary password</label>
                <input
                  type="password"
                  placeholder="Min. 6 characters"
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setIsOnboardOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleOnboardStaff}
                disabled={isProvisioning}
              >
                <ButtonProcessing
                  loading={isProvisioning}
                  loadingText="Creating account…"
                  defaultText="Add to team"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Ticket Modal */}
      {assigningTicket && (
        <div className="modal-backdrop" onClick={() => setAssigningTicket(null)}>
          <div className="modal-card" style={{ maxWidth: '440px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ fontSize: '16px' }}>Assign staff &amp; set who pays</h3>
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
                <label>Assign to technician *</label>
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
                <label>Who pays for this task? *</label>
                <select
                  value={assignPayer}
                  onChange={(e) => setAssignPayer(e.target.value as 'owner' | 'tenant')}
                >
                  <option value="owner">Owner (Property Maintenance)</option>
                  <option value="tenant">Tenant (Resident Billed)</option>
                </select>
              </div>

              <div className="field">
                <label>Estimated Amount ({getTicketCurrency(assigningTicket)}, optional)</label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={assignAmount}
                  onChange={(e) => setAssignAmount(e.target.value ? Number(e.target.value) : '')}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setAssigningTicket(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleAssignTicket}
                disabled={isAssigning}
              >
                <ButtonProcessing
                  loading={isAssigning}
                  loadingText="Assigning Ticket..."
                  defaultText="Assign Ticket"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Limit Upgrade Modal for Staff */}
      {limitModalResource && (
        <PlanLimitModal
          resourceType={limitModalResource}
          currentUsage={usage[limitModalResource].used}
          limit={usage[limitModalResource].max}
          planName={currentPlanName}
          onClose={closeLimitModal}
          onUpgrade={() => {
            closeLimitModal();
            showToast('Staff limit reached. Please contact your property owner to upgrade their Propithub subscription.');
          }}
        />
      )}
    </div>
  );
};
