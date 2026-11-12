import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { getManagerReminders } from '../../lib/reminders';
import { DashboardReminderHub } from '../../components/dashboard/DashboardReminderHub';
import { ButtonProcessing } from '../../components/common/Spinner';
import {
  Building2,
  Wrench,
  AlertTriangle,
  Users,
  CheckCircle2,
  ArrowRight,
  ClipboardList,
  Clock,
  Shield,
  Phone,
  Megaphone,
  Pin,
  Flame,
} from 'lucide-react';

export const ManagerDashboardPage: React.FC = () => {
  const { state, showToast, acknowledgeAnnouncement } = useAppData();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Announcement acknowledgment and smooth dismissal state
  const [ackingNoticeId, setAckingNoticeId] = useState<string | null>(null);
  const [justAckedIds, setJustAckedIds] = useState<Set<string>>(new Set());
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<Set<string>>(new Set());

  const managerRecord = (state.propertyManagers || (state as any).managers || []).find(
    (m: any) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase() === user.email.toLowerCase())
  );
  const assignedPropertyId = (user as any)?.propertyId || (user as any)?.assignedPropertyId || managerRecord?.propertyId || '';
  const ownerId = user?.ownerId || (managerRecord as any)?.ownerId || '';

  const myProperties = useMemo(() => {
    let props = state.properties;
    if (ownerId) {
      props = props.filter((p) => p.ownerId === ownerId);
    }
    if (assignedPropertyId) {
      return props.filter((p) => p.id === assignedPropertyId || p.assignedManagerId === user?.id);
    }
    const explicitlyAssigned = props.filter((p) => p.assignedManagerId === user?.id);
    return explicitlyAssigned.length > 0 ? explicitlyAssigned : props;
  }, [state.properties, ownerId, assignedPropertyId, user?.id]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    if (!ownerId && myPropertyIds.size === 0) return [];
    return state.units.filter((u) => {
      const matchOwner = ownerId ? u.ownerId === ownerId : false;
      const matchProp = Boolean(u.propertyId && myPropertyIds.has(u.propertyId));
      return matchOwner || matchProp;
    });
  }, [state.units, ownerId, myPropertyIds]);

  const myTickets = useMemo(() => {
    if (!ownerId && myPropertyIds.size === 0) return [];
    return state.tickets.filter((t) => {
      if (t.ownerId && ownerId && t.ownerId !== ownerId) return false;
      return !t.propertyId || myPropertyIds.has(t.propertyId);
    });
  }, [state.tickets, ownerId, myPropertyIds]);

  const myStaff = ownerId ? state.staff.filter((s) => s.ownerId === ownerId) : [];
  const activeTickets = myTickets.filter((t) => t.status !== 'resolved');

  const managerReminders = useMemo(() => {
    return getManagerReminders(state, user);
  }, [state, user]);

  const managerOwnerIds = useMemo(() => {
    const set = new Set<string>();
    if (ownerId) set.add(ownerId);
    if (user?.ownerId) set.add(user.ownerId);
    if ((managerRecord as any)?.ownerId) set.add((managerRecord as any).ownerId);
    myProperties.forEach((p) => {
      if (p.ownerId) set.add(p.ownerId);
    });
    return set;
  }, [ownerId, user?.ownerId, managerRecord, myProperties]);

  const managerIdSet = useMemo(() => {
    const set = new Set<string>();
    if (user?.id) set.add(user.id);
    if ((user as any)?.uid) set.add((user as any).uid);
    if (managerRecord?.id) set.add(String(managerRecord.id));
    return set;
  }, [user?.id, (user as any)?.uid, managerRecord?.id]);

  const handleManagerAcknowledge = async (announcementId: string, requireAck?: boolean) => {
    setAckingNoticeId(announcementId);
    try {
      await acknowledgeAnnouncement(announcementId, {
        tenantId: user?.id || String(managerRecord?.id || 'manager'),
        tenantName: user?.displayName || managerRecord?.name || 'Property Manager',
        tenantEmail: user?.email || managerRecord?.email || undefined,
        acknowledgedAt: new Date().toISOString(),
      });
      setJustAckedIds((prev) => new Set(prev).add(announcementId));
      showToast(requireAck ? '✓ Notice acknowledged. Thank you!' : '✓ Notice marked as read.');

      setTimeout(() => {
        setDismissedNoticeIds((prev) => new Set(prev).add(announcementId));
      }, 1500);
    } catch (err) {
      console.error('Failed to acknowledge bulletin:', err);
      showToast('Could not record acknowledgment.');
    } finally {
      setAckingNoticeId(null);
    }
  };

  const managerAnnouncements = useMemo(() => {
    return (state.announcements || [])
      .filter((a) => {
        if (a.status !== 'published') return false;
        if (dismissedNoticeIds.has(a.id)) return false;
        if (!a.targetScope?.targetRoles?.includes('manager')) return false;

        const isSystem = a.ownerId === 'system' || a.ownerId === 'superadmin' || (a.category as string) === 'system';
        // Strict landlord isolation: Block if manager has no owner association or if announcement belongs to another landlord
        if (!isSystem && (managerOwnerIds.size === 0 || !managerOwnerIds.has(a.ownerId))) {
          return false;
        }

        // Specific people targeting
        if (
          a.targetScope?.mode === 'specific_people' ||
          (a.targetScope?.targetUserIds && a.targetScope.targetUserIds.length > 0)
        ) {
          const targets = a.targetScope.targetUserIds || [];
          const isTargeted = targets.some((id) => managerIdSet.has(id));
          if (!isTargeted) return false;
        }

        // Property-level scoping
        const targetPropIds = new Set<string>();
        if (Array.isArray(a.targetScope?.propertyIds)) {
          a.targetScope.propertyIds.forEach((pid) => pid && targetPropIds.add(pid));
        }
        if (a.propertyId && a.propertyId !== 'all') {
          targetPropIds.add(a.propertyId);
        }

        if (targetPropIds.size > 0) {
          const isAssigned = Array.from(targetPropIds).some((pId) => myPropertyIds.has(pId));
          if (!isAssigned) return false;
        }

        // Acknowledgment check: hide if already acknowledged (unless in 1.5s grace window)
        const isAckedByArr = (a.acknowledgedBy || []).some((id) => managerIdSet.has(id));
        const isAckedByObj = (a.acknowledgments || []).some(
          (ack) =>
            (ack.tenantId && managerIdSet.has(ack.tenantId)) ||
            (ack.tenantEmail && user?.email && ack.tenantEmail.toLowerCase() === user.email.toLowerCase())
        );
        const hasAcked = isAckedByArr || isAckedByObj;
        if (hasAcked && !justAckedIds.has(a.id)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
      });
  }, [state.announcements, managerIdSet, managerOwnerIds, user, myPropertyIds, dismissedNoticeIds, justAckedIds]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Operations Action Center & Reminders */}
      <DashboardReminderHub
        reminders={managerReminders}
        role="manager"
        title="Operations Action Center & Reminders"
      />

      {/* Manager Operational Bulletins & Notices */}
      {managerAnnouncements.length > 0 && (
        <div className="panel" style={{ padding: '20px 24px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
            <Megaphone size={18} color="#10B981" />
            <span>Operations & Portfolio Bulletins ({managerAnnouncements.length})</span>
          </div>
          <div className="bulletins-scroll-container">
            {managerAnnouncements.map((a) => {
              const isUrgent = a.priority === 'urgent' || a.priority === 'emergency';
              const isAckedByArr = (a.acknowledgedBy || []).some((id) => managerIdSet.has(id));
              const isAckedByObj = (a.acknowledgments || []).some(
                (ack) =>
                  (ack.tenantId && managerIdSet.has(ack.tenantId)) ||
                  (ack.tenantEmail && user?.email && ack.tenantEmail.toLowerCase() === user.email.toLowerCase())
              );
              const hasAcked = isAckedByArr || isAckedByObj || justAckedIds.has(a.id);

              return (
                <div
                  key={a.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    borderLeft: isUrgent ? '3px solid #dc2626' : a.isPinned ? '3px solid var(--brass, #c59b27)' : '3px solid var(--border)',
                    background: isUrgent ? '#fef2f2' : 'var(--surface-sunken)',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      <span className="badge blue" style={{ fontSize: '10px', padding: '0px 5px', textTransform: 'capitalize', lineHeight: '16px' }}>
                        {a.category}
                      </span>
                      {isUrgent && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: '#dc2626', color: '#fff', padding: '0px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 700, lineHeight: '16px' }}>
                          <Flame size={9} /> Urgent
                        </span>
                      )}
                      {a.isPinned && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: '#fef3c7', color: '#92400e', padding: '0px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 700, lineHeight: '16px' }}>
                          <Pin size={8} /> Pinned
                        </span>
                      )}
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--ink)', display: 'inline' }}>
                        {a.title}
                      </h4>
                    </div>
                    <span style={{ fontSize: '10.5px', color: 'var(--ink-soft)', flexShrink: 0 }}>
                      {new Date(a.publishedAt || a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>

                  <p style={{ margin: '2px 0 4px', fontSize: '12px', lineHeight: 1.35, color: 'var(--ink)' }}>
                    {a.body}
                  </p>

                  {/* Compact Action Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ fontSize: '10.5px', color: 'var(--ink-soft)' }}>
                      Notice from <strong>{a.authorName}</strong>{a.requireAcknowledgment ? ' • Compliance acknowledgment required' : ''}
                    </div>

                    {hasAcked ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#16a34a', fontWeight: 600, fontSize: '10.5px', background: '#f0fdf4', padding: '1px 7px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                        <CheckCircle2 size={11} /> {a.requireAcknowledgment ? 'Acknowledged' : 'Read'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`btn ${a.requireAcknowledgment ? 'brass' : 'secondary'} small ${ackingNoticeId === a.id ? 'btn-processing' : ''}`}
                        onClick={() => handleManagerAcknowledge(a.id, a.requireAcknowledgment)}
                        disabled={ackingNoticeId === a.id}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, padding: '2px 9px', borderRadius: '9999px', fontSize: '10.5px', height: '23px' }}
                      >
                        <ButtonProcessing
                          loading={ackingNoticeId === a.id}
                          loadingText="Recording..."
                          defaultText={a.requireAcknowledgment ? 'Read & Acknowledge' : 'Mark as Read'}
                          spinnerSize="xs"
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Key Metrics Grid (3 Cards: Open Repairs, Managed Buildings, Support Team) */}
      <div className="grid grid-3" style={{ gap: '16px' }}>
        <div className="stat" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="lbl" style={{ margin: 0, fontWeight: 600, fontSize: '12px' }}>Open Repairs</div>
            <Wrench size={18} style={{ color: activeTickets.length > 0 ? '#ea580c' : '#16a34a' }} />
          </div>
          <div className="num" style={{ fontSize: '28px', fontWeight: 800, color: activeTickets.length > 0 ? '#ea580c' : 'var(--ink)' }}>
            {activeTickets.length}
          </div>
        </div>

        <div className="stat" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="lbl" style={{ margin: 0, fontWeight: 600, fontSize: '12px' }}>Managed Buildings</div>
            <Building2 size={18} style={{ color: 'var(--brass)' }} />
          </div>
          <div className="num" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)' }}>
            {myProperties.length}
          </div>
        </div>

        <div className="stat" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="lbl" style={{ margin: 0, fontWeight: 600, fontSize: '12px' }}>Support Team</div>
            <Users size={18} style={{ color: '#16a34a' }} />
          </div>
          <div className="num" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)' }}>
            {myStaff.length}
          </div>
        </div>
      </div>

      {/* 3. Priority Maintenance Tickets */}
      <div className="panel">
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Priority Maintenance Tickets</h3>
          </div>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => navigate('/manager/maintenance')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            View All ({activeTickets.length}) <ArrowRight size={13} />
          </button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {activeTickets.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-soft)' }}>
              <CheckCircle2 size={32} style={{ color: '#16a34a', marginBottom: '8px' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>All work orders are currently resolved!</p>
              <span style={{ fontSize: '12px' }}>New resident requests will appear here automatically.</span>
            </div>
          ) : (
            <div className="table-wrap">
              <table style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Unit / Resident</th>
                    <th>Issue</th>
                    <th>Priority</th>
                    <th>Assigned To</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTickets.slice(0, 5).map((t) => (
                    <tr key={t.id}>
                      <td><b>{t.id}</b></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>Unit {t.unit}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{t.tenant || 'Resident'}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.issue}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{t.category}</div>
                      </td>
                      <td>
                        <span
                          className={`badge ${t.priority === 'High' ? 'amber' : 'grey'
                            }`}
                          style={{ fontSize: '11px' }}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '12.5px', color: t.assignedTo ? 'inherit' : 'var(--ink-soft)' }}>
                          {t.assignedTo || 'Unassigned'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
