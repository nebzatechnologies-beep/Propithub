import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Copy, Check, Eye, EyeOff, ShieldCheck, Building2, X } from 'lucide-react';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { PlanLimitModal } from '../../components/common/PlanLimitModal';
import { ButtonProcessing } from '../../components/common/Spinner';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol } from '../../lib/currencyService';
import { useCurrency } from '../../context/CurrencyContext';
import { CurrencyAmount, getTableCurrencyHeader } from '../../components/common/CurrencyAmount';
import { getCleanAddressText } from '../../lib/addressUtils';

export const TeamPage: React.FC = () => {
  const { state, updateState, recordManagerPayout, saveManager, deleteManager, reassignManagerProperty, showToast } = useAppData();
  const { user, provisionUser } = useAuth();
  const { viewCurrency } = useCurrency();
  const navigate = useNavigate();

  const [subTab, setSubTab] = useState<'managers' | 'payouts'>('managers');
  const [isAddPmOpen, setIsAddPmOpen] = useState(false);
  const [pmName, setPmName] = useState('');
  const [pmEmail, setPmEmail] = useState('');
  const [pmPhone, setPmPhone] = useState('');
  const [pmPassword, setPmPassword] = useState('');
  const [showPmPassword, setShowPmPassword] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [pmPropertyId, setPmPropertyId] = useState('');
  const [pmToRemove, setPmToRemove] = useState<any | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  // Credentials dialog state
  const [credentialsModal, setCredentialsModal] = useState<{
    isOpen: boolean;
    name: string;
    email: string;
    password: string;
    role: string;
    property?: string;
    phone?: string;
    emailStatus?: 'delivered' | 'failed';
    birdStatus?: string;
    emailError?: string;
  } | null>(null);
  const [isResendingInvite, setIsResendingInvite] = useState(false);

  const shareCredentials = async (person: any, kind: 'staff' | 'manager', mode: 'copy') => {
    let pw: string = person.tempPassword || '';
    if (!pw) {
      // No saved password: set a fresh one so the details we share actually work.
      const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
      let rand = '';
      for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
      pw = `${kind === 'staff' ? 'Staff' : 'Manager'}#${rand}`;
      const r = await provisionUser({
        name: person.name, email: person.email, password: pw, role: kind,
        phone: person.phone || '', ownerId, ownerName: user?.displayName || 'Property Owner',
      });
      if (!r.success) { showToast(r.error || 'Could not prepare the credentials.'); return; }
      try { await saveManager({ ...person, tempPassword: pw }); } catch { /* best effort */ }
    }
    const text = `Propithub ${kind === 'staff' ? 'Staff' : 'Manager'} Access\nHello ${person.name},\nLogin: https://propithub.web.app/login\nEmail: ${person.email}\nPassword: ${pw}\nPlease change your password after signing in.`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Credentials copied. Paste them into WhatsApp or any chat.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showToast('Credentials copied.'); } catch { showToast(text); }
      document.body.removeChild(ta);
    }
  };

  const mailInviteToManager = async (pm: any) => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let rand = '';
    for (let i = 0; i < 6; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
    const pw = `Manager#${rand}`;
    setIsResendingInvite(true);
    const r = await provisionUser({
      name: pm.name, email: pm.email, password: pw, role: 'manager',
      phone: pm.phone || '', ownerId, ownerName: user?.displayName || 'Property Owner',
    });
    setIsResendingInvite(false);
    if (!r.success) { showToast(r.error || 'Could not send the invite.'); return; }
    try { await saveManager({ ...pm, tempPassword: pw }); } catch { /* record update is best effort */ }
    setCredentialsModal({
      isOpen: true, name: pm.name, email: pm.email, password: pw, role: 'Property Manager',
      property: '', phone: pm.phone || '',
      emailStatus: r.emailStatus, birdStatus: r.birdStatus, emailError: r.emailError,
    });
    showToast(r.emailStatus === 'failed'
      ? `Invite email to ${pm.email} failed${r.emailError ? ` (${r.emailError})` : ''}. Use Copy Credentials.`
      : `Invite emailed to ${pm.email} (${r.birdStatus || 'accepted'}).`);
  };
  const resendManagerInvite = async () => {
    if (!credentialsModal || !credentialsModal.password) {
      showToast('No saved password for this person. Add them again to send a fresh invite.');
      return;
    }
    setIsResendingInvite(true);
    const r = await provisionUser({
      name: credentialsModal.name,
      email: credentialsModal.email,
      password: credentialsModal.password,
      role: 'manager',
      phone: credentialsModal.phone || '',
      ownerId,
      ownerName: user?.displayName || 'Property Owner',
    });
    setIsResendingInvite(false);
    if (!r.success) { showToast(r.error || 'Could not resend the invite.'); return; }
    setCredentialsModal((m) => m ? { ...m, emailStatus: r.emailStatus, birdStatus: r.birdStatus, emailError: r.emailError } : m);
  };

  // Assign / Unassign modal state
  const [reassignModal, setReassignModal] = useState<{
    isOpen: boolean;
    manager: any;
    selectedPropertyId: string;
  } | null>(null);

  const handleSaveReassignment = async () => {
    if (!reassignModal) return;
    const { manager, selectedPropertyId } = reassignModal;
    await reassignManagerProperty(manager.id, selectedPropertyId || null);
    if (!selectedPropertyId) {
      showToast(`✓ Unassigned ${manager.name} from property. Buildings will remain under direct owner management.`);
    } else {
      const propObj = state.properties.find((p) => p.id === selectedPropertyId);
      showToast(`✓ Assigned ${manager.name} to ${propObj?.name || 'Property'}.`);
    }
    setReassignModal(null);
  };

  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let rand = '';
    for (let i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `Manager#${rand}`;
  };

  // Pay Manager modal state
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payingManager, setPayingManager] = useState<any | null>(null);
  const [payMonth, setPayMonth] = useState('September 2026');
  const [payAmount, setPayAmount] = useState(18000);
  const [payMethod, setPayMethod] = useState<'Bank Transfer' | 'UPI' | 'Cash'>('Bank Transfer');
  const [payUtr, setPayUtr] = useState('');
  const [payNotes, setPayNotes] = useState('Monthly management fee & operations commission');

  const ownerId = user?.id || '';
  const myProperties = state.properties.filter((p) => Boolean(ownerId) && p.ownerId === ownerId);
  const myManagers = (state.propertyManagers || []).filter(
    (pm: any) => Boolean(ownerId) && pm.ownerId === ownerId
  );
  const myPayouts = (state.managerPayouts || []).filter(
    (mp: any) => Boolean(ownerId) && mp.ownerId === ownerId
  );

  const {
    currentPlan,
    currentPlanName,
    usage,
    checkAndRun,
    limitModalResource,
    openLimitModal,
    closeLimitModal,
  } = usePlanLimits();

  const maxManagers = usage.managers.max;
  const canHaveManagers = maxManagers > 0;
  const isLimitReached = usage.managers.isFull;

  const handleAddPM = async () => {
    if (isLimitReached) {
      openLimitModal('managers');
      return;
    }
    const name = pmName.trim();
    if (!name) {
      showToast('Please enter the manager full name.');
      return;
    }
    const email = pmEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showToast('Please enter a valid email address.');
      return;
    }
    const phoneDigits = pmPhone.replace(/\D/g, '');
    if (pmPhone.trim() && (phoneDigits.length < 7 || phoneDigits.length > 15)) {
      showToast('Please enter a valid phone number (at least 7 digits with country code).');
      return;
    }
    const passwordToUse = pmPassword.trim() || generateRandomPassword();
    if (passwordToUse.length < 6) {
      showToast('Password must be at least 6 characters long.');
      return;
    }

    setIsProvisioning(true);
    const res = await provisionUser({
      name,
      email,
      password: passwordToUse,
      role: 'manager',
      phone: pmPhone.trim(),
      ownerId,
      ownerName: user?.displayName || 'Property Owner',
    });

    setIsProvisioning(false);

    if (!res.success || !res.uid) {
      showToast(res.error || 'Failed to provision manager. Please try again.');
      return;
    }

    const pmUid = res.uid;
    const newPm = {
      id: pmUid,
      name,
      email,
      phone: pmPhone.trim(),
      propertyId: pmPropertyId ? pmPropertyId : null,
      assignedProperties: pmPropertyId ? [pmPropertyId] : [],
      ownerName: user?.displayName || 'Property Owner',
      ownerId,
      tempPassword: passwordToUse,
    };

    await saveManager(newPm);

    if (pmPropertyId) {
      updateState((prev) => ({
        ...prev,
        properties: prev.properties.map((p) => (p.id === pmPropertyId ? { ...p, assignedManagerId: pmUid } : p)),
      }));
    }

    const assignedPropObj = state.properties.find((p) => p.id === pmPropertyId);

    const pmPhoneForModal = pmPhone.trim();
    setIsAddPmOpen(false);
    setPmName('');
    setPmEmail('');
    setPmPhone('');
    setPmPassword('');
    setPmPropertyId('');

    setCredentialsModal({
      isOpen: true,
      name,
      email,
      password: passwordToUse,
      role: 'Property Manager',
      property: assignedPropObj?.name || 'All Properties',
      phone: pmPhoneForModal,
      emailStatus: res.emailStatus,
      birdStatus: res.birdStatus,
      emailError: res.emailError,
    });

    showToast(res.emailStatus === 'failed'
      ? `${name} was added, but the invite email could not be sent${res.emailError ? ` (${res.emailError})` : ''}. Share the credentials shown.`
      : `${name} onboarded. Email to ${email}: ${res.birdStatus || 'accepted'}.`);
  };

  const handleRemovePM = async (id: number, name: string) => {
    await deleteManager(id);
    showToast(`${name} removed as property manager.`);
  };

  const handleConfirmManagerPayout = () => {
    if (!payingManager) return;
    recordManagerPayout({
      id: `MP-${Date.now()}`,
      managerId: String(payingManager.id || 'usr-pm-1'),
      managerName: payingManager.name,
      ownerId: user?.id || '',
      month: payMonth,
      amount: payAmount,
      currency: getCurrencySymbol(myProperties.find((p) => p.id === payingManager.assignedPropertyId || p.name === payingManager.assignedProperty)?.currency || myProperties[0]?.currency) || DEFAULT_CURRENCY_SYMBOL,
      status: 'paid',
      paymentMethod: payMethod,
      utrReference: payUtr || `TXN${Math.floor(100000 + Math.random() * 900000)}`,
      paidAt: new Date().toLocaleDateString('en-CA'),
      notes: payNotes,
    });
    setIsPayModalOpen(false);
    setPayingManager(null);
  };

  return (
    <div>
      <div className="tabs">
        <div
          className={`tab ${subTab === 'managers' ? 'active' : ''}`}
          onClick={() => setSubTab('managers')}
        >
          Delegated Managers
        </div>
        <div
          className={`tab ${subTab === 'payouts' ? 'active' : ''}`}
          onClick={() => setSubTab('payouts')}
        >
          Manager Compensation & Payouts
        </div>
      </div>

      {subTab === 'managers' ? (
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div className="hint">
              {canHaveManagers
                ? `${myManagers.length} of ${maxManagers} property managers used`
                : `Property managers not included in current plan`}
            </div>
            {canHaveManagers ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn brass btn-mobile-full"
                  title={isLimitReached ? `Plan limit reached (${maxManagers} managers) - Click to upgrade` : ''}
                  onClick={() => checkAndRun('managers', () => setIsAddPmOpen(true))}
                >
                  + Add property manager
                </button>
                {isLimitReached && (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => openLimitModal('managers')}
                  >
                    Upgrade for More Managers
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="btn secondary"
                onClick={() => openLimitModal('managers')}
              >
                Upgrade Plan to Add Managers
              </button>
            )}
          </div>

          {canHaveManagers && myProperties.length === 0 && myManagers.length > 0 && (
            <div
              style={{
                background: 'var(--surface-sunken)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>💡</span>
                <div style={{ fontSize: '13px', color: 'var(--ink)' }}>
                  <b>{myManagers.map((m: any) => m.name).join(', ')}</b> {myManagers.length === 1 ? 'is' : 'are'} currently unassigned because your portfolio has no properties yet.
                </div>
              </div>
              <Link to="/owner/properties" className="btn brass small" style={{ textDecoration: 'none', fontSize: '12px' }}>
                + Create Property to Assign
              </Link>
            </div>
          )}

          {canHaveManagers ? (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {myManagers.length === 0 ? (
                <div className="panel" style={{ gridColumn: '1 / -1' }}>
                  <div className="panel-body" style={{ color: 'var(--ink-soft)', padding: '24px' }}>
                    No property managers added yet. Click "+ Add property manager" above to delegate operations (Allowance: {maxManagers} managers).
                  </div>
                </div>
              ) : (
                myManagers.map((pm: any) => {
                  const assignedProp = state.properties.find(
                    (p) => p.id === pm.propertyId || p.assignedManagerId === pm.id
                  );
                  return (
                    <div key={pm.id} className="panel" style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
                      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, padding: '16px' }}>
                        <div>
                          <div className="person" style={{ marginBottom: '14px' }}>
                            <div className="avatar">{pm.name.slice(0, 2).toUpperCase()}</div>
                            <div className="who">
                              <b style={{ fontSize: '14px' }}>{pm.name}</b>
                              <span style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>{pm.email}</span>
                            </div>
                          </div>

                          <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                            <span className="k" style={{ color: 'var(--ink-soft)' }}>Assigned Property</span>
                            <span style={{ fontWeight: 600, color: assignedProp ? 'var(--ink)' : 'var(--amber, #D97706)' }}>
                              {assignedProp?.name || (myProperties.length === 0 ? 'Unassigned (No properties in portfolio)' : 'Unassigned (Floating Manager)')}
                            </span>
                          </div>

                          {pm.phone && (
                            <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                              <span className="k" style={{ color: 'var(--ink-soft)' }}>Phone</span>
                              <span style={{ color: 'var(--ink)' }}>{pm.phone}</span>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--line)', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn secondary small"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12.5px' }}
                            onClick={() => {
                              const currentPropId = pm.propertyId || state.properties.find((p) => p.assignedManagerId === pm.id)?.id || '';
                              setReassignModal({
                                isOpen: true,
                                manager: pm,
                                selectedPropertyId: currentPropId,
                              });
                            }}
                          >
                            <Building2 size={13} /> {assignedProp ? 'Reassign' : 'Assign'}
                          </button>

                          <button
                            type="button"
                            className="btn secondary small"
                            style={{ fontSize: '12.5px' }}
                            disabled={isResendingInvite}
                            onClick={() => mailInviteToManager(pm)}
                          >
                            ✉ Mail invite
                          </button>
                          <button type="button" className="btn secondary small" style={{ fontSize: '12.5px' }} onClick={() => shareCredentials(pm, 'manager', 'copy')}>
                      Copy credentials
                    </button>
                                              {pm.tempPassword && (
                            <button
                              type="button"
                              className="btn secondary small"
                              style={{ fontSize: '12.5px' }}
                              onClick={() => setCredentialsModal({
                                isOpen: true, name: pm.name, email: pm.email, password: pm.tempPassword,
                                role: 'Property Manager', property: '', phone: pm.phone || '',
                              })}
                            >
                              Credentials
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn brass small"
                            style={{ fontSize: '12.5px' }}
                            onClick={() => {
                              setPayingManager(pm);
                              setIsPayModalOpen(true);
                            }}
                          >
                            Disburse Pay
                          </button>

                          <button
                            type="button"
                            className="btn secondary small"
                            style={{ marginLeft: 'auto', fontSize: '12.5px', color: 'var(--danger)' }}
                            onClick={() => setPmToRemove(pm)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="panel">
              <div className="panel-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '32px', color: 'var(--ink-soft)', marginBottom: '8px' }}>—</div>
                <h3 style={{ marginBottom: '14px' }}>Property managers not included in {currentPlanName} plan</h3>
                <button
                  type="button"
                  className="btn brass"
                  onClick={() => navigate('/owner/plan')}
                >
                  Upgrade Subscription Plan
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="panel-head" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div className="hint">{myPayouts.length} compensation records on file</div>
            <button
              type="button"
              className="btn brass btn-mobile-full"
              onClick={() => {
                if (myManagers.length > 0) {
                  setPayingManager(myManagers[0]);
                  setIsPayModalOpen(true);
                } else {
                  showToast('Please add a property manager first.');
                }
              }}
            >
              Record Manager Payout
            </button>
          </div>

          <div className="panel">
            <div className="panel-body">
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Record ID</th>
                        <th>Manager</th>
                        <th>Period</th>
                        <th>{getTableCurrencyHeader('Amount', viewCurrency)}</th>
                        <th>Status</th>
                        <th>Method & UTR</th>
                        <th>Date Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myPayouts.map((p) => (
                        <tr key={p.id}>
                          <td><b>{p.id}</b></td>
                          <td>{p.managerName}</td>
                          <td>{p.month}</td>
                          <td style={{ fontWeight: 600 }}><CurrencyAmount amount={p.amount} currency={p.currency} /></td>
                          <td>
                            <span className={`badge ${p.status === 'paid' ? 'green' : 'amber'}`}>
                              {p.status === 'paid' ? '✓ Paid' : 'Pending'}
                            </span>
                          </td>
                          <td>
                            <span>{p.paymentMethod}</span>
                            {p.utrReference && (
                              <span style={{ fontSize: '11px', color: 'var(--ink-soft)', display: 'block' }}>
                                Ref: {p.utrReference}
                              </span>
                            )}
                          </td>
                          <td>{p.paidAt || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mobile-card-view">
                {myPayouts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-soft)' }}>
                    No manager compensation records on file.
                  </div>
                ) : (
                  myPayouts.map((p) => (
                    <div key={p.id} className="staff-card" style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{p.id}</span>
                          <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)', marginTop: '2px' }}>{p.managerName}</div>
                        </div>
                        <span className={`badge ${p.status === 'paid' ? 'green' : 'amber'}`}>
                          {p.status === 'paid' ? '✓ Paid' : 'Pending'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: '12.5px' }}>
                        <span style={{ color: 'var(--ink-soft)' }}>Period</span>
                        <span style={{ fontWeight: 500 }}>{p.month}</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: '12.5px' }}>
                        <span style={{ color: 'var(--ink-soft)' }}>Amount</span>
                        <b style={{ color: 'var(--ledger)', fontSize: '14px' }}><CurrencyAmount amount={p.amount} currency={p.currency} /></b>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: '12.5px' }}>
                        <span style={{ color: 'var(--ink-soft)' }}>Method</span>
                        <span>{p.paymentMethod}</span>
                      </div>

                      {p.utrReference && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: '12px' }}>
                          <span style={{ color: 'var(--ink-soft)' }}>UTR Ref</span>
                          <span style={{ fontFamily: 'monospace' }}>{p.utrReference}</span>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)', fontSize: '12px' }}>
                        <span style={{ color: 'var(--ink-soft)' }}>Date Paid</span>
                        <span>{p.paidAt || '—'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add PM Modal */}
      {isAddPmOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddPmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Add property manager</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsAddPmOpen(false)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Name</label>
                <input
                  type="text"
                  placeholder="Full name"
                  value={pmName}
                  onChange={(e) => setPmName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={pmEmail}
                  onChange={(e) => setPmEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Phone Number</label>
                <input
                  type="text"
                  placeholder="+91 98000 00000"
                  value={pmPhone}
                  onChange={(e) => setPmPhone(e.target.value)}
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
                      const pwd = generateRandomPassword();
                      setPmPassword(pwd);
                      setShowPmPassword(true);
                    }}
                  >
                    ⚡ Auto-Generate
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPmPassword ? 'text' : 'password'}
                    placeholder="Min 6 characters (e.g. Manager#9a4b2)"
                    value={pmPassword}
                    style={{ paddingRight: '40px' }}
                    onChange={(e) => setPmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPmPassword(!showPmPassword)}
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
                    title={showPmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '4px', display: 'block' }}>
                  The manager will use this password to sign in at /login. Leave blank to auto-generate.
                </span>
              </div>

              <div className="field">
                <label>Assign to Property (optional)</label>
                <select
                  value={pmPropertyId}
                  onChange={(e) => setPmPropertyId(e.target.value)}
                >
                  <option value="">All Managed Properties</option>
                  {state.properties
                    .filter((p) => Boolean(ownerId) && p.ownerId === ownerId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '16px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                disabled={isProvisioning}
                onClick={() => setIsAddPmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn brass btn-mobile-full ${isProvisioning ? 'btn-processing' : ''}`}
                disabled={isProvisioning}
                onClick={handleAddPM}
              >
                <ButtonProcessing
                  loading={isProvisioning}
                  loadingText="Provisioning Account..."
                  defaultText="Onboard & Provision Manager"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarded Credentials Modal */}
      {credentialsModal?.isOpen && (
        <div className="modal-backdrop" onClick={() => setCredentialsModal(null)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Manager Credentials Ready</h3>
                </div>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setCredentialsModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink)', marginBottom: '16px', lineHeight: 1.5 }}>
                Login details for <b>{credentialsModal.name}</b>.
              </p>
              <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.5,
                background: credentialsModal.emailStatus === 'failed' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                border: `1px solid ${credentialsModal.emailStatus === 'failed' ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)'}` }}>
                {credentialsModal.emailStatus === undefined
                  ? 'Press "Resend invite email" to email these credentials to the manager.'
                  : credentialsModal.emailStatus === 'failed'
                    ? <>The invite email could not be delivered{credentialsModal.emailError ? ` (${credentialsModal.emailError})` : ''}. Share the details below manually or resend.</>
                    : <>Credentials emailed to <b>{credentialsModal.email}</b> (status: {credentialsModal.birdStatus || 'accepted'}). Ask them to check spam if it is not in the inbox.</>}
                <div style={{ marginTop: '8px' }}>
                  <button type="button" className="btn secondary small" disabled={isResendingInvite} onClick={resendManagerInvite}>
                    {isResendingInvite ? 'Sending…' : 'Resend invite email'}
                  </button>
                </div>
              </div>

              <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Portal URL:</span>
                  <span style={{ fontWeight: 600, color: 'var(--brass)' }}>{window.location.origin}/login</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Email:</span>
                  <span style={{ fontWeight: 600 }}>{credentialsModal.email}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Password:</span>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '14px', background: 'var(--line-strong)', padding: '2px 8px', borderRadius: '4px' }}>
                    {credentialsModal.password}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--ink-soft)' }}>Assigned Scope:</span>
                  <span>{credentialsModal.property || 'All Properties'}</span>
                </div>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => {
                    const text = `PropHub Manager Access Credentials:\nURL: ${window.location.origin}/login\nEmail: ${credentialsModal.email}\nPassword: ${credentialsModal.password}\nAssigned Scope: ${credentialsModal.property || 'All Properties'}`;
                    navigator.clipboard.writeText(text);
                    setCopiedCredentials(true);
                    showToast('Credentials copied to clipboard!');
                    setTimeout(() => setCopiedCredentials(false), 3000);
                  }}
                >
                  {copiedCredentials ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                  {copiedCredentials ? 'Copied!' : 'Copy Credentials'}
                </button>
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={() => setCredentialsModal(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove PM Confirmation Modal */}
      {pmToRemove && (
        <div className="modal-backdrop" onClick={() => setPmToRemove(null)}>
          <div className="modal-card" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Remove Property Manager</h3>
              <button type="button" className="btn secondary small" onClick={() => setPmToRemove(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to revoke property management permissions for <b>{pmToRemove.name}</b> ({pmToRemove.email})?</p>
              <p className="hint" style={{ marginTop: '8px' }}>
                They will immediately lose access to your properties, listings, agreements, and maintenance tickets.
              </p>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setPmToRemove(null)}>Cancel</button>
              <button
                type="button"
                className="btn danger btn-mobile-full"
                onClick={() => {
                  handleRemovePM(pmToRemove.id, pmToRemove.name);
                  setPmToRemove(null);
                }}
              >
                Revoke Permissions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Manager Modal */}
      {isPayModalOpen && payingManager && (
        <div className="modal-backdrop" onClick={() => setIsPayModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Disburse Manager Payout: {payingManager.name}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsPayModalOpen(false)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="field" style={{ marginBottom: '16px' }}>
                <label style={{ fontWeight: 600, color: 'var(--ink)' }}>Select Property Manager</label>
                <select
                  value={payingManager?.id || ''}
                  onChange={(e) => {
                    const sel = myManagers.find((m: any) => String(m.id) === String(e.target.value));
                    if (sel) {
                      setPayingManager(sel);
                      if (sel.monthlySalary || sel.compensationAmount) {
                        setPayAmount(Number(sel.monthlySalary || sel.compensationAmount));
                      }
                    }
                  }}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid var(--line-strong)', background: 'var(--surface)', fontWeight: 500 }}
                >
                  {myManagers.map((m: any) => {
                    const assignedProp = myProperties.find((p) => p.id === m.assignedPropertyId || p.name === m.assignedProperty);
                    const propCurr = getCurrencySymbol(assignedProp?.currency || myProperties[0]?.currency) || DEFAULT_CURRENCY_SYMBOL;
                    return (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.email}) — Property: {m.assignedProperty || assignedProp?.name || 'Unassigned'} ({propCurr})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="row">
                <div className="field">
                  <label>Payout Month / Period</label>
                  <input
                    type="text"
                    value={payMonth}
                    onChange={(e) => setPayMonth(e.target.value)}
                    placeholder="e.g. September 2026"
                  />
                </div>
                <div className="field">
                  <label>Amount ({payingManager ? (getCurrencySymbol(myProperties.find((p) => p.id === payingManager.assignedPropertyId || p.name === payingManager.assignedProperty)?.currency || myProperties[0]?.currency) || DEFAULT_CURRENCY_SYMBOL) : DEFAULT_CURRENCY_SYMBOL})</label>
                  <input
                    type="number"
                    min="0"
                    value={payAmount === 0 ? '' : payAmount}
                    placeholder="0"
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/^0+(?=\d)/, '');
                      setPayAmount(cleaned === '' ? 0 : Number(cleaned));
                    }}
                  />
                </div>
              </div>

              <div className="field">
                <label>Payout Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                >
                  <option value="Bank Transfer">Bank Transfer (IMPS / NEFT)</option>
                  <option value="UPI">UPI Direct</option>
                  <option value="Cash">Cash / Cheque</option>
                </select>
              </div>

              <div className="field">
                <label>Transaction Reference / UTR Number</label>
                <input
                  type="text"
                  placeholder="e.g. UTR-982341002"
                  value={payUtr}
                  onChange={(e) => setPayUtr(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Notes & Settlement Remarks</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Full retainer for Sunview Residency operations"
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className="btn secondary btn-mobile-full" onClick={() => setIsPayModalOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={handleConfirmManagerPayout}
              >
                Confirm & Record Payout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign / Unassign Property Modal */}
      {reassignModal && reassignModal.isOpen && (
        <div className="modal-backdrop" onClick={() => setReassignModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-head">
              <h3>Assign or Unassign Property</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setReassignModal(null)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              {myProperties.length === 0 ? (
                <div style={{ padding: '14px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13px', color: 'var(--ink)' }}>
                  <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)' }}>
                    You haven't created any properties in your portfolio yet. Once you add a property, you can assign <b>{reassignModal.manager.name}</b> to manage units, tenants, and maintenance.
                  </p>
                  <Link
                    to="/owner/properties"
                    className="btn brass small"
                    onClick={() => setReassignModal(null)}
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    + Create Property First
                  </Link>
                </div>
              ) : (
                <div className="field">
                  <label>Assigned Portfolio Property</label>
                  <select
                    value={reassignModal.selectedPropertyId}
                    onChange={(e) =>
                      setReassignModal((prev) => (prev ? { ...prev, selectedPropertyId: e.target.value } : null))
                    }
                  >
                    <option value="">— None (Unassigned / Floating Manager) —</option>
                    {myProperties.map((p) => {
                      const cleanAddr = getCleanAddressText(p.address, '').text;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} {cleanAddr ? `(${cleanAddr})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="note-box" style={{ fontSize: '13px', marginTop: '12px' }}>
                <b>Note:</b> Selecting <i>"None (Unassigned)"</i> detaches this manager from active property duties without deleting their account. The buildings will remain under your direct owner oversight.
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              {reassignModal.selectedPropertyId ? (
                <button
                  type="button"
                  className="btn secondary btn-mobile-full"
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  onClick={() => {
                    setReassignModal((prev) => (prev ? { ...prev, selectedPropertyId: '' } : null));
                  }}
                >
                  Unassign from Property
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setReassignModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn brass"
                  onClick={handleSaveReassignment}
                >
                  Save Assignment
                </button>
              </div>
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
    </div>
  );
};
