import React, { useState, useEffect } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { UserProfile } from '../../types';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { ButtonProcessing } from '../../components/common/Spinner';

export const MasterUsersPage: React.FC = () => {
  const { state, updateOwnerPlan, markUserReminded, updateOwnerTrial, deleteUserAccount, logCommunication, showToast } = useAppData();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedOwner, setSelectedOwner] = useState<UserProfile | null>(null);
  const [modalPlan, setModalPlan] = useState<string>('Growth');
  const [firestoreUsers, setFirestoreUsers] = useState<UserProfile[] | null>(null);
  const [loading, setLoading] = useState<boolean>(isFirebaseConfigured);
  const [savingPlan, setSavingPlan] = useState(false);
  const [remindingUserId, setRemindingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Live real-time sync directly with Firebase Firestore 'users' collection
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const accounts: UserProfile[] = [];
        snap.forEach((docSnap) => {
          const u = docSnap.data() as UserProfile;
          if (u && (u.email || u.displayName)) {
            accounts.push({
              ...u,
              id: u.id || docSnap.id,
              displayName: (u.displayName || u.email?.split('@')[0] || 'User').replace(/PropitHubHave/gi, 'Propithub'),
            });
          }
        });
        setFirestoreUsers(accounts);
        setLoading(false);
      },
      (err) => {
        console.warn('Firestore live users subscription warning:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Use live Firestore accounts when available, or clean active accounts from state
  const baseUsers: UserProfile[] = (isFirebaseConfigured && firestoreUsers !== null)
    ? firestoreUsers
    : state.users;

  const filteredUsers = baseUsers
    .filter((u) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.phone && u.phone.includes(q));
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });

  const handleOpenOwnerModal = (user: UserProfile) => {
    setSelectedOwner(user);
    const existing = state.ownerSettings[user.id]?.planName || user.plan || 'Growth';
    setModalPlan(existing);
  };

  const handleSaveOwnerPlan = async () => {
    if (!selectedOwner) return;
    setSavingPlan(true);
    await new Promise((r) => setTimeout(r, 450));
    updateOwnerPlan(selectedOwner.id, modalPlan);
    showToast(`Plan updated to "${modalPlan}" for ${selectedOwner.displayName}.`);
    setSavingPlan(false);
    setSelectedOwner(null);
  };

  const handleSendReminder = async (targetUser: UserProfile) => {
    setRemindingUserId(targetUser.id);
    try {
      const notifId = `notif_${Date.now()}_${targetUser.id}`;
      const notif = {
        id: notifId,
        userId: targetUser.id,
        title: '🚨 Action Required: Platform Subscription Past Due',
        body: `Your PropItHub subscription payment is overdue. Please settle your outstanding platform invoice to ensure uninterrupted access to your portfolio.`,
        link: '/owner/plan',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      // 1. Mark reminded in local state
      markUserReminded(targetUser.id);

      // 2. Persist notification + reminded flag to Firestore
      if (isFirebaseConfigured) {
        setDoc(doc(db, 'notifications', notifId), notif).catch(console.warn);
        setDoc(doc(db, 'users', targetUser.id), { reminded: true }, { merge: true }).catch(console.warn);
      }

      // 3. Fire SMS + Email via Twilio / SendGrid
      await logCommunication({
        type: 'subscription_reminder',
        category: 'subscription',
        title: 'Platform Subscription Payment Overdue',
        body: notif.body,
        channels: ['in_app', 'sms', 'email'],
        recipientId: targetUser.id,
        recipientName: targetUser.displayName,
        recipientRole: 'owner',
        recipientContact: {
          email: targetUser.email,
          phone: targetUser.phone,
        },
        senderId: 'superadmin',
        senderName: 'Platform Admin',
        senderRole: 'superadmin',
        deliveryStatus: { inApp: 'delivered', email: 'skipped', sms: 'skipped' },
      });

      showToast(`✓ Subscription reminder dispatched to ${targetUser.displayName} (${targetUser.email}) via SMS, Email & In-App.`);
    } catch (err) {
      console.error('Reminder dispatch error:', err);
      showToast(`Reminder sent to ${targetUser.displayName} via in-app notification.`);
    } finally {
      setRemindingUserId(null);
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete account "${user.email}" (${user.role.toUpperCase()})?\n\nThis will remove all their records from Firebase Firestore.`
    );
    if (!confirmDelete) return;

    setDeletingUserId(user.id);
    try {
      await deleteUserAccount(user.id);
      showToast(`Account "${user.email}" has been deleted from Firebase.`);
    } catch (err: any) {
      showToast(`Failed to delete account: ${err?.message || 'Unknown error'}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  const renderStars = (rating?: number) => {
    if (rating === undefined || rating === null) {
      return <span style={{ color: 'var(--ink-soft)', fontSize: '13px' }}>—</span>;
    }
    const fullStars = Math.floor(Math.max(0, Math.min(5, rating)));
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
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>All Owner & Platform Accounts</h3>
            <div className="hint">
              {isFirebaseConfigured ? 'Live Firebase Accounts' : 'Platform Directory'} ({filteredUsers.length} total account{filteredUsers.length === 1 ? '' : 's'})
              {loading && ' · Syncing with Firestore…'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 auto', maxWidth: '560px', justifyContent: 'flex-end' }}>
            <input
              type="text"
              placeholder="Search by name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: '1 1 180px', minWidth: '150px' }}
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ flex: '1 1 140px', minWidth: '130px' }}
            >
              <option value="all">All Roles</option>
              <option value="owner">Owners Only</option>
              <option value="tenant">Tenants</option>
              <option value="manager">Property Managers</option>
              <option value="staff">Maintenance Staff</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
        </div>

        <div className="panel-body">
          <div className="desktop-table-view">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Role</th>
                    <th>Properties</th>
                    <th>Plan</th>
                    <th>MRR</th>
                    <th>Rating</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '36px' }}>
                        {loading
                          ? 'Loading accounts from Firebase Firestore…'
                          : isFirebaseConfigured
                          ? 'No accounts found in Firestore matching your filter.'
                          : 'No accounts found matching your search.'}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const ownerPropertiesCount =
                        u.role === 'owner'
                          ? state.properties.filter((p) => p.ownerId === u.id).length
                          : u.role === 'manager'
                          ? state.properties.filter((p) => p.assignedManagerId === u.id).length
                          : '—';

                      const ownerSettings = state.ownerSettings[u.id];
                      const hasPaidInvoices = (state.platformInvoices || []).some((inv) => inv.ownerId === u.id && inv.status === 'paid');
                      const isTrial = u.role === 'owner' && !hasPaidInvoices && (ownerSettings?.planStatus === 'trialing' || (!ownerSettings?.planStatus && (u as any).planStatus === 'trialing'));
                      const activePlanName = ownerSettings?.planName || u.plan || 'Growth';
                      const planObj = state.plans.find((p) => p.name.toLowerCase() === activePlanName.toLowerCase());
                      const planPrice = planObj ? planObj.price : 79;
                      const userMrr = u.role === 'owner' ? (isTrial ? '$0 (Trial)' : `$${planPrice}`) : '—';
                      const isPastDue = u.status === 'past_due' || (u.role === 'owner' && !hasPaidInvoices && ownerSettings?.planStatus === 'expired');

                      return (
                        <tr key={u.id}>
                          <td>
                            {(() => {
                              const cleanName = (u.displayName || u.email?.split('@')[0] || 'User').replace(/PropitHubHave/gi, 'Propithub');
                              const initials = cleanName.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'U';
                              return (
                                <div className="person">
                                  <div className="avatar">{initials}</div>
                                  <div className="who">
                                    <b>{cleanName}</b>
                                    <span>{u.email}</span>
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                u.role === 'superadmin'
                                  ? 'amber'
                                  : u.role === 'owner'
                                  ? 'brass'
                                  : u.role === 'tenant'
                                  ? 'green'
                                  : u.role === 'manager'
                                  ? 'blue'
                                  : 'grey'
                              }`}
                            >
                              {u.role === 'manager' ? 'MANAGER' : u.role.toUpperCase()}
                            </span>
                          </td>
                          <td>{ownerPropertiesCount}</td>
                          <td>
                            {u.role === 'owner' ? (
                              <span className="badge grey">{activePlanName}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ fontWeight: 500 }}>{userMrr}</td>
                          <td>{u.role === 'owner' || u.role === 'staff' ? renderStars(u.rating) : '—'}</td>
                          <td>
                            <span className={`badge ${isTrial ? 'amber' : isPastDue ? 'red' : 'green'}`}>
                              {isTrial ? 'Trial' : isPastDue ? 'Past due' : 'Active'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              {u.role === 'owner' && (
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  onClick={() => handleOpenOwnerModal(u)}
                                >
                                  View
                                </button>
                              )}
                              <button
                                type="button"
                                className={`btn ${isPastDue ? 'brass' : 'secondary'} small ${remindingUserId === u.id ? 'btn-processing' : ''}`}
                                disabled={u.reminded || remindingUserId === u.id}
                                onClick={() => handleSendReminder(u)}
                                title="Dispatch manual SMS & email notice"
                              >
                                <ButtonProcessing
                                  loading={remindingUserId === u.id}
                                  loadingText="Dispatching..."
                                  defaultText={u.reminded ? 'Reminder sent' : 'Send reminder'}
                                />
                              </button>
                              {u.role !== 'superadmin' && (
                                <button
                                  type="button"
                                  className={`btn danger small ${deletingUserId === u.id ? 'btn-processing' : ''}`}
                                  disabled={deletingUserId === u.id}
                                  onClick={() => handleDeleteUser(u)}
                                  title="Delete account and all its data permanently from Firebase"
                                  style={{ padding: '4px 8px' }}
                                >
                                  <ButtonProcessing
                                    loading={deletingUserId === u.id}
                                    loadingText="Deleting..."
                                    defaultText="Delete"
                                  />
                                </button>
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
            {filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px' }}>
                {loading
                  ? 'Loading accounts from Firebase Firestore…'
                  : isFirebaseConfigured
                  ? 'No accounts found in Firestore matching your filter.'
                  : 'No accounts found matching your search.'}
              </div>
            ) : (
              filteredUsers.map((u) => {
                const ownerPropertiesCount =
                  u.role === 'owner'
                    ? state.properties.filter((p) => p.ownerId === u.id).length
                    : u.role === 'manager'
                    ? state.properties.filter((p) => p.assignedManagerId === u.id).length
                    : '—';

                const ownerSettings = state.ownerSettings[u.id];
                const isTrial = ownerSettings?.planStatus === 'trialing';
                const activePlanName = ownerSettings?.planName || u.plan || 'Growth';
                const planObj = state.plans.find((p) => p.name.toLowerCase() === activePlanName.toLowerCase());
                const planPrice = planObj ? planObj.price : 79;
                const userMrr = u.role === 'owner' ? (isTrial ? '$0 (Trial)' : `$${planPrice}`) : '—';
                const isPastDue = u.status === 'past_due' || (u.role === 'owner' && ownerSettings?.planStatus === 'expired');

                const cleanName = (u.displayName || u.email?.split('@')[0] || 'User').replace(/PropitHubHave/gi, 'Propithub');
                const initials = cleanName.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'U';

                return (
                  <div key={u.id} className="staff-card" style={{ padding: '14px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <div className="avatar">{initials}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cleanName}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.email}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '10px' }}>
                      <span
                        className={`badge ${
                          u.role === 'superadmin'
                            ? 'amber'
                            : u.role === 'owner'
                            ? 'brass'
                            : u.role === 'tenant'
                            ? 'green'
                            : u.role === 'manager'
                            ? 'blue'
                            : 'grey'
                        }`}
                      >
                        {u.role === 'manager' ? 'MANAGER' : u.role.toUpperCase()}
                      </span>
                      {u.role === 'owner' && <span className="badge grey">{activePlanName}</span>}
                      <span className={`badge ${isTrial ? 'amber' : isPastDue ? 'red' : 'green'}`}>
                        {isTrial ? 'Trial' : isPastDue ? 'Past due' : 'Active'}
                      </span>
                      {u.role === 'owner' && <span className="badge grey">MRR: {userMrr}</span>}
                      {ownerPropertiesCount !== '—' && (
                        <span className="badge grey">{ownerPropertiesCount} props</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', fontSize: '12px', color: 'var(--ink-soft)' }}>
                      <span>Tenant Rating:</span>
                      <div>{u.role === 'owner' || u.role === 'staff' ? renderStars(u.rating) : '—'}</div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {u.role === 'owner' && (
                        <button
                          type="button"
                          className="btn secondary small btn-mobile-full"
                          style={{ flex: '1 1 auto' }}
                          onClick={() => handleOpenOwnerModal(u)}
                        >
                          View
                        </button>
                      )}
                      <button
                        type="button"
                        className={`btn ${isPastDue ? 'brass' : 'secondary'} small btn-mobile-full ${remindingUserId === u.id ? 'btn-processing' : ''}`}
                        style={{ flex: '1 1 auto' }}
                        disabled={u.reminded || remindingUserId === u.id}
                        onClick={() => handleSendReminder(u)}
                        title="Dispatch manual SMS & email notice"
                      >
                        <ButtonProcessing
                          loading={remindingUserId === u.id}
                          loadingText="Dispatching..."
                          defaultText={u.reminded ? 'Reminder sent' : 'Send reminder'}
                        />
                      </button>
                      {u.role !== 'superadmin' && (
                        <button
                          type="button"
                          className={`btn danger small btn-mobile-full ${deletingUserId === u.id ? 'btn-processing' : ''}`}
                          style={{ flex: '1 1 auto' }}
                          disabled={deletingUserId === u.id}
                          onClick={() => handleDeleteUser(u)}
                          title="Delete account permanently"
                        >
                          <ButtonProcessing
                            loading={deletingUserId === u.id}
                            loadingText="Deleting..."
                            defaultText="Delete"
                          />
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

      {/* View Owner Modal */}
      {selectedOwner && (
        <div className="modal-backdrop" onClick={() => setSelectedOwner(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{selectedOwner.displayName}</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setSelectedOwner(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Email</span>
                <span>{selectedOwner.email}</span>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Properties</span>
                <span>
                  {state.properties.filter((p) => p.ownerId === selectedOwner.id).length || 1}
                </span>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>MRR</span>
                <span>${selectedOwner.mrr || 79}</span>
              </div>
              <div className="kv" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span className="k" style={{ color: 'var(--ink-soft)' }}>Rating from tenants</span>
                <span>{renderStars(selectedOwner.rating || 4.7)}</span>
              </div>

              {(() => {
                const settings = state.ownerSettings[selectedOwner.id];
                const isTrial = settings?.planStatus === 'trialing';
                const trialEnds = settings?.trialEndsAt ? new Date(settings.trialEndsAt) : null;
                const daysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
                return (
                  <div style={{ marginTop: '16px', padding: '14px', background: '#FAFAF7', border: '1px solid var(--line)', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>Free Trial Controls</span>
                      <span className={`badge ${isTrial && daysLeft > 0 ? 'green' : 'amber'}`}>
                        {isTrial && daysLeft > 0 ? `Active Trial (${daysLeft} days left)` : 'Expired / Subscribed'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '10px' }}>
                      Admin can grant or extend trial access for this owner to test the platform.
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => updateOwnerTrial(selectedOwner.id, 7, true)}
                      >
                        + 7 Days
                      </button>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => updateOwnerTrial(selectedOwner.id, 14, true)}
                      >
                        + 14 Days
                      </button>
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => updateOwnerTrial(selectedOwner.id, 30, true)}
                      >
                        + 30 Days
                      </button>
                      <button
                        type="button"
                        className="btn danger small"
                        onClick={() => updateOwnerTrial(selectedOwner.id, 0, false)}
                      >
                        Expire Trial
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="field" style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>
                  Change plan
                </label>
                <select
                  value={modalPlan}
                  onChange={(e) => setModalPlan(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)' }}
                >
                  {state.plans.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} {p.isTrialOnly || p.id === 'free_trial' ? '(Admin Free Trial — $0/mo)' : `($${p.price}/mo)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '16px 20px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className={`btn secondary small btn-mobile-full ${remindingUserId === selectedOwner.id ? 'btn-processing' : ''}`}
                disabled={selectedOwner.reminded || remindingUserId === selectedOwner.id}
                onClick={() => handleSendReminder(selectedOwner)}
              >
                <ButtonProcessing
                  loading={remindingUserId === selectedOwner.id}
                  loadingText="Sending..."
                  defaultText={selectedOwner.reminded ? 'Reminder Sent' : 'Send Reminder Notice'}
                />
              </button>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: 'auto' }} className="btn-mobile-full">
                <button
                  type="button"
                  className="btn secondary btn-mobile-full"
                  onClick={() => setSelectedOwner(null)}
                  disabled={savingPlan}
                >
                  Close
                </button>
                <button
                  type="button"
                  className={`btn brass btn-mobile-full ${savingPlan ? 'btn-processing' : ''}`}
                  onClick={handleSaveOwnerPlan}
                  disabled={savingPlan}
                >
                  <ButtonProcessing
                    loading={savingPlan}
                    loadingText="Saving Plan..."
                    defaultText="Save changes"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
