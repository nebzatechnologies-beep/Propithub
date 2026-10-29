import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { getManagerReminders } from '../../lib/reminders';
import { DashboardReminderHub } from '../../components/dashboard/DashboardReminderHub';
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
  const { state } = useAppData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const ownerId = user?.ownerId || '';

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

  const myUnits = useMemo(() => {
    if (!ownerId) return [];
    return state.units.filter((u) => u.ownerId === ownerId && (!u.propertyId || myPropertyIds.has(u.propertyId)));
  }, [state.units, ownerId, myPropertyIds]);

  const myTickets = useMemo(() => {
    if (!ownerId) return [];
    return state.tickets.filter((t) => t.ownerId === ownerId && (!t.propertyId || myPropertyIds.has(t.propertyId)));
  }, [state.tickets, ownerId, myPropertyIds]);

  const myStaff = ownerId ? state.staff.filter((s) => s.ownerId === ownerId) : [];

  const occupiedUnits = myUnits.filter((u) => u.status === 'occupied').length;
  const vacantUnits = myUnits.filter((u) => u.status === 'vacant').length;
  const occupancyRate = myUnits.length > 0 ? Math.round((occupiedUnits / myUnits.length) * 100) : 0;
  const activeTickets = myTickets.filter((t) => t.status !== 'resolved');

  const managerReminders = useMemo(() => {
    return getManagerReminders(state, user);
  }, [state, user]);

  const managerAnnouncements = useMemo(() => {
    const managerIdSet = new Set<string>();
    if (user?.id) managerIdSet.add(user.id);
    if ((user as any)?.uid) managerIdSet.add((user as any).uid);
    const mgr = (state.managers || []).find(
      (m) => (user?.email && m.email?.toLowerCase() === user.email.toLowerCase()) || (user?.id && String(m.id) === user.id)
    );
    if (mgr?.id) managerIdSet.add(String(mgr.id));

    return (state.announcements || [])
      .filter((a) => {
        if (a.status !== 'published') return false;
        if (!a.targetScope?.targetRoles?.includes('manager')) return false;
        if (
          a.targetScope?.mode === 'specific_people' ||
          (a.targetScope?.targetUserIds && a.targetScope.targetUserIds.length > 0)
        ) {
          const targets = a.targetScope.targetUserIds || [];
          const isTargeted = targets.some((id) => managerIdSet.has(id));
          if (!isTargeted) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
      });
  }, [state.announcements, state.managers, user]);

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {managerAnnouncements.map((a) => {
              const isUrgent = a.priority === 'urgent' || a.priority === 'emergency';
              return (
                <div
                  key={a.id}
                  style={{
                    padding: '14px 18px',
                    borderRadius: '8px',
                    borderLeft: isUrgent ? '4px solid #dc2626' : a.isPinned ? '4px solid var(--brass, #c59b27)' : '4px solid var(--border)',
                    background: isUrgent ? '#fef2f2' : 'var(--surface-sunken)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="badge blue" style={{ fontSize: '11px', textTransform: 'capitalize' }}>
                        {a.category}
                      </span>
                      {isUrgent && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#dc2626', color: '#fff', padding: '2px 7px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>
                          <Flame size={11} /> Urgent
                        </span>
                      )}
                      {a.isPinned && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>
                          <Pin size={10} /> Pinned
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                      {new Date(a.publishedAt || a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <h4 style={{ margin: '0 0 6px', fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)' }}>
                    {a.title}
                  </h4>
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--ink)' }}>
                    {a.body}
                  </p>
                  <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                    Notice from <strong>{a.authorName}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Key Metrics Grid */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="stat" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="lbl" style={{ margin: 0, fontWeight: 600, fontSize: '12px' }}>Managed Occupancy</div>
            <Building2 size={18} style={{ color: 'var(--brass)' }} />
          </div>
          <div className="num" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)' }}>
            {occupancyRate}%
          </div>
          <div className="delta" style={{ marginTop: '4px', fontSize: '12px', color: 'var(--ink-soft)' }}>
            {occupiedUnits} occupied • {vacantUnits} vacant
          </div>
        </div>

        <div className="stat" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="lbl" style={{ margin: 0, fontWeight: 600, fontSize: '12px' }}>Active Work Orders</div>
            <Wrench size={18} style={{ color: activeTickets.length > 0 ? '#ea580c' : '#16a34a' }} />
          </div>
          <div className="num" style={{ fontSize: '28px', fontWeight: 800, color: activeTickets.length > 0 ? '#ea580c' : 'var(--ink)' }}>
            {activeTickets.length}
          </div>
          <div className="delta" style={{ marginTop: '4px', fontSize: '12px', color: 'var(--ink-soft)' }}>
            {activeTickets.filter((t) => t.priority === 'High').length} high priority tickets
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
          <div className="delta" style={{ marginTop: '4px', fontSize: '12px', color: 'var(--ink-soft)' }}>
            {myUnits.length} total units assigned
          </div>
        </div>

        <div className="stat" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="lbl" style={{ margin: 0, fontWeight: 600, fontSize: '12px' }}>On-Site Technicians</div>
            <Users size={18} style={{ color: '#16a34a' }} />
          </div>
          <div className="num" style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ink)' }}>
            {myStaff.length}
          </div>
          <div className="delta" style={{ marginTop: '4px', fontSize: '12px', color: 'var(--ink-soft)' }}>
            support team
          </div>
        </div>
      </div>

      {/* 3. Priority Work Orders & Properties Grid */}
      <div className="manager-dashboard-split-grid">
        {/* Active Repair Tickets */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Priority Maintenance Tickets</h3>
              <div className="hint" style={{ fontSize: '12px' }}>Latest open issues requiring operational attention</div>
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

        {/* Managed Properties Snapshot */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Managed Buildings</h3>
              <div className="hint" style={{ fontSize: '12px' }}>{myProperties.length} properties in portfolio</div>
            </div>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => navigate('/manager/properties')}
            >
              Details
            </button>
          </div>
          <div className="panel-body" style={{ padding: '12px 18px' }}>
            {myProperties.length === 0 ? (
              <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                No buildings assigned to this management portfolio.
              </div>
            ) : (
              myProperties.slice(0, 4).map((p) => {
                const unitsInProp = myUnits.filter((u) => u.propertyId === p.id);
                const occupiedInProp = unitsInProp.filter((u) => u.status === 'occupied').length;
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)' }}>{p.name}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                        {p.address?.city || 'Local Region'} • {unitsInProp.length} units
                      </div>
                    </div>
                    <span className="badge grey" style={{ fontSize: '11.5px', fontWeight: 600 }}>
                      {occupiedInProp}/{unitsInProp.length} Occ.
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
