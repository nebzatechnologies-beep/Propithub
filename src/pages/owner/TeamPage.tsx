import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Key, Copy, Check, Eye, EyeOff, ShieldCheck, Building2, X } from 'lucide-react';
import { usePlanLimits } from '../../hooks/usePlanLimits';
import { PlanLimitModal } from '../../components/common/PlanLimitModal';
import { ButtonProcessing } from '../../components/common/Spinner';
import { DEFAULT_CURRENCY, DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol } from '../../lib/currencyService';

export const TeamPage: React.FC = () => {
  const { state, updateState, recordManagerPayout, saveManager, deleteManager, reassignManagerProperty, showToast } = useAppData();
  const { user, provisionUser, resetPassword } = useAuth();
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
  } | null>(null);

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
    };

    await saveManager(newPm);

    if (pmPropertyId) {
      updateState((prev) => ({
        ...prev,
        properties: prev.properties.map((p) => (p.id === pmPropertyId ? { ...p, assignedManagerId: pmUid } : p)),
      }));
    }

    const assignedPropObj = state.properties.find((p) => p.id === pmPropertyId);

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
    });

    showToast(`${name} onboarded successfully with login credentials.`);
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
                ? `${myManagers.length} of ${maxManagers} property managers used (${currentPlanName} plan)`
                : `Property managers not included in ${currentPlanName} plan (Limit: 0)`}
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

          {canHaveManagers ? (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
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
                    <div key={pm.id} className="panel">
                      <div className="panel-body">
                        <div className="person" style={{ marginBottom: '12px' }}>
                          <div className="avatar">{pm.name.slice(0, 2).toUpperCase()}</div>
                          <div className="who">
                            <b>{pm.name}</b>
                            <span>{pm.email}</span>
                          </div>
                        </div>
                        <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                          <span className="k" style={{ color: 'var(--ink-soft)' }}>Assigned Property</span>
                          <span style={{ fontWeight: 500 }}>{assignedProp?.name || 'All Properties'}</span>
                        </div>
                        <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                          <span className="k" style={{ color: 'var(--ink-soft)' }}>Phone</span>
                          <span>{pm.phone || '—'}</span>
                        </div>
                        <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '13px' }}>
                          <span className="k" style={{ color: 'var(--ink-soft)' }}>Financial records</span>
                          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>No access</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn secondary small"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={async () => {
                              const r = await resetPassword(pm.email);
                              if (r.success) {
                                showToast(`Password reset link dispatched to ${pm.email}`);
                              } else {
                                showToast(r.error || 'Failed to dispatch reset link');
                              }
                            }}
                          >
                            <Key size={12} /> Send Password Reset
                          </button>
                          <button
                            type="button"
                            className="btn secondary small"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => {
                              const currentPropId = pm.propertyId || state.properties.find((p) => p.assignedManagerId === pm.id)?.id || '';
                              setReassignModal({
                                isOpen: true,
                                manager: pm,
                                selectedPropertyId: currentPropId,
                              });
                            }}
                          >
                            <Building2 size={12} /> Assign / Unassign
                          </button>
                          <button
                            type="button"
                            className="btn brass small"
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
                <h3 style={{ marginBottom: '8px' }}>Property managers not included in {currentPlanName} plan</h3>
                <p className="hint" style={{ maxWidth: '440px', margin: '0 auto 16px' }}>
                  Your current subscription tier does not permit delegated property managers. Upgrade your plan to unlock manager accounts and delegation.
                </p>
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
          <div className="note-box">
            <b>Payment Architecture:</b> Tenants pay monthly rent and security deposits directly to you (the Property Owner) through your configured payment gateways. You compensate your Property Managers with a dedicated monthly fee or performance commission.
          </div>

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
                        <th>Amount</th>
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
                          <td style={{ fontWeight: 600 }}>{getCurrencySymbol(p.currency) || DEFAULT_CURRENCY_SYMBOL}{p.amount.toLocaleString('en-IN')}</td>
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
                        <b style={{ color: 'var(--ledger)', fontSize: '14px' }}>{getCurrencySymbol(p.currency) || DEFAULT_CURRENCY_SYMBOL}{p.amount.toLocaleString('en-IN')}</b>
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
              <p className="hint">
                They'll get access to listings, agreements, tenant reviews, and maintenance — not to payments or billing.
              </p>
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
                  <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Account provisioned for login</span>
                </div>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setCredentialsModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink)', marginBottom: '16px', lineHeight: 1.5 }}>
                Share these login details with <b>{credentialsModal.name}</b>. They can sign in immediately at the main login portal.
              </p>

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
              <p className="hint" style={{ marginBottom: '16px' }}>
                Record monthly fee or commission disbursement to your property manager. This creates an auditable record in your management ledger.
              </p>
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
              <div className="hint" style={{ marginBottom: '16px' }}>
                Manage delegated property operational scope for <b>{reassignModal.manager.name}</b> ({reassignModal.manager.email}).
              </div>

              <div className="field">
                <label>Assigned Portfolio Property</label>
                <select
                  value={reassignModal.selectedPropertyId}
                  onChange={(e) =>
                    setReassignModal((prev) => (prev ? { ...prev, selectedPropertyId: e.target.value } : null))
                  }
                >
                  <option value="">— None (Unassigned / Floating Manager) —</option>
                  {myProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.address ? (typeof p.address === 'string' ? p.address : p.address.city || p.address.formattedAddress) : 'Property'})
                    </option>
                  ))}
                </select>
              </div>

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
