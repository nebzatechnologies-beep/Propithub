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

  // Reconciled owner status & MRR matching MasterUsersPage logic exactly
  const ownerStats = useMemo(() => {
    let activeCount = 0;
    let trialCount = 0;
    let sumMrrUSD = 0;

    ownerUsers.forEach((u) => {
      const ownerSettings = state.ownerSettings[u.id];
      const hasPaid = (state.platformInvoices || []).some(
        (inv) => inv.ownerId === u.id && inv.status === 'paid'
      );
      const isTrial =
        !hasPaid &&
        (ownerSettings?.planStatus === 'trialing' ||
          (!ownerSettings?.planStatus && (u as any).planStatus === 'trialing') ||
          (u.plan && u.plan.toLowerCase().includes('trial')));

      if (isTrial) {
        trialCount++;
      } else {
        activeCount++;
        const activePlanName = ownerSettings?.planName || u.plan || 'Growth';
        const planObj = state.plans.find(
          (p) => p.name.toLowerCase() === activePlanName.toLowerCase()
        );
        const planPrice = planObj ? planObj.price : 79;
        sumMrrUSD += planPrice;
      }
    });

    return { activeCount, trialCount, totalMrrInUSD: sumMrrUSD };
  }, [ownerUsers, state.ownerSettings, state.platformInvoices, state.plans]);

  const convertedMrr = convert(ownerStats.totalMrrInUSD, 'USD', viewCurrency);
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
        </div>
        <div className="stat">
          <div className="num">
            {ownerStats.activeCount}
            {ownerStats.trialCount > 0 && (
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink-soft)', marginLeft: '6px' }}>
                ({ownerStats.trialCount} Trial)
              </span>
            )}
          </div>
          <div className="lbl">Active owner accounts</div>
        </div>
        <div className="stat">
          <div className="num">{totalProperties}</div>
          <div className="lbl">Properties on platform</div>
        </div>
        <div className="stat">
          <div className="num">{state.platformInvoices?.length || 0}</div>
          <div className="lbl">Platform Invoices</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: '20px 24px' }}>
          <h3 style={{ margin: '0 0 18px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
            Owners by plan
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {(() => {
              const plansWithCounts = state.plans
                .filter((p) => !p.isTrialOnly && p.id !== 'free_trial')
                .map((p) => {
                  const count = ownerUsers.filter((u) => {
                    const ownerSettings = state.ownerSettings[u.id];
                    const hasPaid = (state.platformInvoices || []).some(
                      (inv) => inv.ownerId === u.id && inv.status === 'paid'
                    );
                    const isTrial =
                      !hasPaid &&
                      (ownerSettings?.planStatus === 'trialing' ||
                        (!ownerSettings?.planStatus && (u as any).planStatus === 'trialing') ||
                        (u.plan && u.plan.toLowerCase().includes('trial')));
                    if (isTrial) return false;
                    const uPlan = ownerSettings?.planName || u.plan || 'Growth';
                    return uPlan.toLowerCase() === p.name.toLowerCase();
                  }).length;
                  return { id: p.id, name: p.name, price: p.price, count, isTrial: false };
                });

              if (ownerStats.trialCount > 0) {
                plansWithCounts.push({
                  id: 'free_trial',
                  name: 'Free Trial',
                  price: 0,
                  count: ownerStats.trialCount,
                  isTrial: true,
                });
              }

              const totalOwners = ownerUsers.length || 1;

              return plansWithCounts.map((p) => {
                const pct = p.count > 0 ? Math.min(100, Math.round((p.count / totalOwners) * 100)) : 0;

                return (
                  <div key={p.id}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <span style={{ fontSize: '13.5px', color: 'var(--ink-soft)' }}>
                        {p.name} · {p.isTrial ? 'Free ($0/mo)' : format(convert(p.price, 'USD', viewCurrency), viewCurrency, { maximumFractionDigits: 0 })}
                      </span>
                      <b style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                        {p.count} {p.count === 1 ? 'owner' : 'owners'}
                      </b>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: '7px',
                        borderRadius: '999px',
                        background: 'var(--surface-sunken, #F1F5F9)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          borderRadius: '999px',
                          background: p.isTrial ? '#94A3B8' : 'var(--primary, #10B981)',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};
