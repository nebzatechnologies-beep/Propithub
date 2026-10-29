import React, { useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { Link } from 'react-router-dom';
import { isFirebaseConfigured, db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { InAppNotification } from '../../types';
import { getSuperadminReminders } from '../../lib/reminders';
import { DashboardReminderHub } from '../../components/dashboard/DashboardReminderHub';

export const OverviewPage: React.FC = () => {
  const { state, updateState, logCommunication, showToast } = useAppData();
  const { user } = useAuth();
  const { viewCurrency, convert, format } = useCurrency();

  const ownerUsers = state.users.filter((u) => u.role === 'owner');
  const pastDueOwners = ownerUsers.filter((u) => u.status === 'past_due');

  const getOwnersCountForPlan = (planName: string) => {
    return ownerUsers.filter((u) => {
      const uPlan = u.plan || state.ownerSettings[u.id]?.planName || 'Growth';
      return uPlan.toLowerCase() === planName.toLowerCase();
    }).length;
  };

  // MRR calculated from PlatformInvoices or estimated from active plan distribution, normalized to USD then converted to viewCurrency
  const totalMrrInUSD = useMemo(() => {
    let sumUSD = 0;
    if (state.platformInvoices && state.platformInvoices.length > 0) {
      const latestByOwner: Record<string, typeof state.platformInvoices[0]> = {};
      for (const inv of state.platformInvoices) {
        if (inv.status === 'paid' || inv.status === 'issued') {
          const existing = latestByOwner[inv.ownerId];
          if (!existing || inv.issueDate > existing.issueDate) {
            latestByOwner[inv.ownerId] = inv;
          }
        }
      }
      for (const inv of Object.values(latestByOwner)) {
        const curr = inv.currency || 'USD';
        sumUSD += convert(inv.total || inv.amount || 0, curr, 'USD');
      }
    }
    if (sumUSD === 0) {
      sumUSD = state.plans.reduce(
        (sum, p) => sum + p.price * getOwnersCountForPlan(p.name),
        0
      );
    }
    return sumUSD;
  }, [state.platformInvoices, state.plans, ownerUsers, convert]);

  const convertedMrr = convert(totalMrrInUSD, 'USD', viewCurrency);
  const totalProperties = state.properties.length;

  const handleSendReminder = async (ownerId: string, ownerName: string) => {
    const ownerUser = state.users.find((u) => u.id === ownerId);
    const notif: InAppNotification = {
      id: `notif_${Date.now()}`,
      userId: ownerId,
      title: '🚨 Action Required: Platform Subscription Past Due',
      body: `Your PropItHub subscription payment is overdue. Please settle your outstanding platform invoice to ensure uninterrupted access.`,
      link: '/owner/plan',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    updateState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === ownerId ? { ...u, reminded: true } : u)),
      notifications: [...(prev.notifications || []), notif],
    }));

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'users', ownerId), { reminded: true }, { merge: true });
        await setDoc(doc(db, 'notifications', notif.id), notif);
      } catch (err) {
        console.warn('Firestore reminder sync error:', err);
      }
    }

    // Fire SMS + Email via configured Twilio / SendGrid
    try {
      await logCommunication({
        type: 'subscription_reminder',
        category: 'subscription',
        title: 'Platform Subscription Payment Overdue',
        body: notif.body,
        channels: ['in_app', 'sms', 'email'],
        recipientId: ownerId,
        recipientName: ownerName,
        recipientRole: 'owner',
        recipientContact: {
          email: ownerUser?.email,
          phone: ownerUser?.phone,
        },
        senderId: 'superadmin',
        senderName: 'Platform Admin',
        senderRole: 'superadmin',
        deliveryStatus: { inApp: 'delivered', email: 'skipped', sms: 'skipped' },
      });
    } catch (err) {
      console.warn('External reminder dispatch error:', err);
    }

    showToast(`✓ Subscription reminder dispatched to ${ownerName} via SMS, Email & In-App.`);
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  const superadminReminders = useMemo(() => {
    return getSuperadminReminders(state, user);
  }, [state, user]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Superadmin Platform Action Center & Reminders */}
      <DashboardReminderHub
        reminders={superadminReminders}
        role="superadmin"
        title="Platform Console Action Center & Alerts"
      />

      <div className="grid grid-4">
        <div className="stat">
          <div className="num">
            {format(convertedMrr, viewCurrency, { maximumFractionDigits: 0 })}
          </div>
          <div className="lbl">Monthly recurring revenue</div>
          <div className="delta">
            {format(convertedMrr * 12, viewCurrency, { maximumFractionDigits: 0 })} ARR run-rate (est.)
          </div>
        </div>
        <div className="stat">
          <div className="num">{ownerUsers.length}</div>
          <div className="lbl">Active owner accounts</div>
          <div className="delta">
            {pastDueOwners.length > 0 ? `${pastDueOwners.length} past due` : '100% in good standing'}
          </div>
        </div>
        <div className="stat">
          <div className="num">{totalProperties}</div>
          <div className="lbl">Properties on platform</div>
          <div className="delta">
            {state.units.length > 0 ? `${state.units.length} total units` : 'Live portfolio count'}
          </div>
        </div>
        <div className="stat">
          <div className="num">{state.platformInvoices?.length || 0}</div>
          <div className="lbl">Platform Invoices</div>
          <div className="delta" style={{ color: 'var(--ink-soft)' }}>
            {state.platformInvoices?.filter((i) => i.status === 'paid').length || 0} settled
          </div>
        </div>
      </div>

      <div className="section-title">Plan distribution</div>
      <div className="panel">
        <div className="panel-body">
          <div className="desktop-table-view">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Price / mo</th>
                    <th>Limits</th>
                    <th>Owners on plan</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {state.plans.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.name}</b>
                      </td>
                      <td>{format(convert(p.price, 'USD', viewCurrency), viewCurrency)}</td>
                      <td>
                        {p.properties >= 999 ? 'Unlimited' : p.properties} properties ·{' '}
                        {p.units >= 9999 ? 'Unlimited' : p.units} units ·{' '}
                        {p.tenants >= 9999 ? 'Unlimited' : p.tenants} tenants
                      </td>
                      <td>{getOwnersCountForPlan(p.name)}</td>
                      <td>
                        <Link to="/superadmin/plans" className="btn secondary small">
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mobile-card-view">
            {state.plans.map((p) => (
              <div key={p.id} className="staff-card" style={{ padding: '14px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--ink)' }}>{p.name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--brass)', fontWeight: 700 }}>
                      {format(convert(p.price, 'USD', viewCurrency), viewCurrency)} / mo
                    </div>
                  </div>
                  <span className="badge grey">{getOwnersCountForPlan(p.name)} owners</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '12px', lineHeight: 1.4 }}>
                  {p.properties >= 999 ? 'Unlimited' : p.properties} properties · {p.units >= 9999 ? 'Unlimited' : p.units} units · {p.tenants >= 9999 ? 'Unlimited' : p.tenants} tenants
                </div>
                <Link to="/superadmin/plans" className="btn secondary small btn-mobile-full" style={{ textAlign: 'center' }}>
                  Edit Plan
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-title">Accounts needing attention</div>
      <div className="panel">
        <div className="panel-body">
          <div className="desktop-table-view">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pastDueOwners.length > 0 ? (
                    pastDueOwners.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <div className="person">
                            <div className="avatar">{getInitials(o.displayName)}</div>
                            <div className="who">
                              <b>{o.displayName}</b>
                              <span>{o.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>{o.plan || 'Growth'}</td>
                        <td>
                          <span className="badge amber">Payment past due</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn secondary small"
                              disabled={o.reminded}
                              onClick={() => handleSendReminder(o.id, o.displayName)}
                            >
                              {o.reminded ? 'Reminder sent' : 'Send reminder'}
                            </button>
                            <Link
                              to="/superadmin/users"
                              className="btn secondary small"
                              style={{ textDecoration: 'none' }}
                            >
                              Manage →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--ink-soft)', padding: '16px 10px' }}>
                        All accounts in good standing.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mobile-card-view">
            {pastDueOwners.length > 0 ? (
              pastDueOwners.map((o) => (
                <div key={o.id} className="staff-card" style={{ padding: '14px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div className="avatar">{getInitials(o.displayName)}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{o.displayName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{o.email}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className="badge grey">{o.plan || 'Growth'}</span>
                    <span className="badge amber">Payment past due</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn secondary small btn-mobile-full"
                      style={{ flex: '1 1 auto' }}
                      disabled={o.reminded}
                      onClick={() => handleSendReminder(o.id, o.displayName)}
                    >
                      {o.reminded ? 'Reminder sent' : 'Send reminder'}
                    </button>
                    <Link
                      to="/superadmin/users"
                      className="btn secondary small btn-mobile-full"
                      style={{ textDecoration: 'none', textAlign: 'center', flex: '1 1 auto' }}
                    >
                      Manage →
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--ink-soft)', padding: '16px 10px', textAlign: 'center' }}>
                All accounts in good standing.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
