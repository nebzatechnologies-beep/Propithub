import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Ticket, StaffMember } from '../../types';
import { isFirebaseConfigured, db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Phone, Mail, MapPin, Clock, AlertCircle, Megaphone, Pin, Flame, CheckCircle2 } from 'lucide-react';
import { ButtonProcessing } from '../../components/common/Spinner';
import { getStaffReminders } from '../../lib/reminders';
import { DashboardReminderHub } from '../../components/dashboard/DashboardReminderHub';

export const StaffDashboardQueuePage: React.FC = () => {
  const { state, updateState, saveTicket, saveStaff, showToast, acknowledgeAnnouncement } = useAppData();
  const { user } = useAuth();
  const staffId = user?.id || '';
  const staffEmail = user?.email?.toLowerCase() || '';
  const staffName = user?.displayName || '';

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [statusInput, setStatusInput] = useState<'In progress' | 'Completed'>('In progress');
  const [completionNotes, setCompletionNotes] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  // Announcement acknowledgment and smooth dismissal state
  const [ackingNoticeId, setAckingNoticeId] = useState<string | null>(null);
  const [justAckedIds, setJustAckedIds] = useState<Set<string>>(new Set());
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<Set<string>>(new Set());

  const [queueFilter, setQueueFilter] = useState<'all' | 'active' | 'resolved'>('all');

  // Resolve by UID first, then email, then displayName.
  // If state.staff hasn't synced the document yet, dynamically synthesize from authenticated UserProfile.
  const currentStaff: StaffMember | undefined = useMemo(() => {
    const found =
      state.staff.find((s) => s.id === staffId) ||
      (staffEmail ? state.staff.find((s) => s.email?.toLowerCase() === staffEmail) : undefined) ||
      (staffName ? state.staff.find((s) => s.name.toLowerCase() === staffName.toLowerCase()) : undefined);
    if (found) return found;

    if (user && (user.role === 'staff' || (user as any).role === 'staff')) {
      return {
        id: user.id,
        name: user.displayName || user.email?.split('@')[0] || 'Technician',
        role: (user as any).staffRole || 'Maintenance Staff',
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
      };
    }
    return undefined;
  }, [state.staff, staffId, staffEmail, staffName, user]);

  // Tickets: match by assignedStaffId (UID)
  const myTickets = useMemo(() => {
    return state.tickets.filter(
      (t) =>
        (staffId && t.assignedStaffId === staffId) ||
        (currentStaff?.id && t.assignedStaffId === currentStaff.id)
    );
  }, [state.tickets, staffId, currentStaff?.id]);

  const activeTickets = useMemo(() => myTickets.filter((t) => t.status !== 'resolved'), [myTickets]);
  const resolvedTickets = useMemo(() => myTickets.filter((t) => t.status === 'resolved'), [myTickets]);

  const filteredQueue = useMemo(() => {
    if (queueFilter === 'active') return activeTickets;
    if (queueFilter === 'resolved') return resolvedTickets;
    return myTickets;
  }, [queueFilter, activeTickets, resolvedTickets, myTickets]);

  const handleSaveTicketStatus = async () => {
    if (!selectedTicket || !currentStaff) return;
    setIsSavingStatus(true);
    try {
      const isCompleted = statusInput === 'Completed';

      const updatedTicket: Ticket = {
        ...selectedTicket,
        status: isCompleted ? 'resolved' : 'in_progress',
        completionNotes: completionNotes.trim() || undefined,
      };
      await saveTicket(updatedTicket);

      if (currentStaff && isCompleted) {
        await saveStaff({
          ...currentStaff,
          completed: (currentStaff.completed || 0) + 1,
        });
      }

      showToast(`Ticket ${selectedTicket.id} updated. Tenant and owner notified.`);
      setSelectedTicket(null);
      setCompletionNotes('');
    } finally {
      setIsSavingStatus(false);
    }
  };

  const staffReminders = useMemo(() => {
    return getStaffReminders(state, user);
  }, [state, user]);

  const staffIdSet = useMemo(() => {
    const set = new Set<string>();
    if (staffId) set.add(staffId);
    if (user?.id) set.add(user.id);
    if (currentStaff?.id) set.add(currentStaff.id);
    return set;
  }, [staffId, user?.id, currentStaff?.id]);

  const handleStaffAcknowledge = async (announcementId: string, requireAck?: boolean) => {
    setAckingNoticeId(announcementId);
    try {
      await acknowledgeAnnouncement(announcementId, {
        tenantId: user?.id || staffId || 'staff',
        tenantName: staffName || user?.displayName || currentStaff?.name || 'Staff Member',
        tenantEmail: staffEmail || user?.email || undefined,
        acknowledgedAt: new Date().toISOString(),
      });
      setJustAckedIds((prev) => new Set(prev).add(announcementId));
      showToast(requireAck ? '✓ Notice acknowledged. Thank you!' : '✓ Notice marked as read.');

      // Smoothly dismiss the notice from dashboard view after confirmation grace period
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

  const staffAnnouncements = useMemo(() => {
    const staffOwnerIds = new Set<string>();
    if (currentStaff?.ownerId) staffOwnerIds.add(currentStaff.ownerId);
    if (user?.ownerId) staffOwnerIds.add(user.ownerId);
    myTickets.forEach((t) => {
      if (t.ownerId) staffOwnerIds.add(t.ownerId);
    });

    const assignedPropertyIds = new Set<string>();
    myTickets.forEach((t) => {
      if (t.propertyId) assignedPropertyIds.add(t.propertyId);
    });
    if ((currentStaff as any)?.assignedProperties && Array.isArray((currentStaff as any).assignedProperties)) {
      (currentStaff as any).assignedProperties.forEach((pId: string) => assignedPropertyIds.add(pId));
    }
    if ((user as any)?.assignedProperties && Array.isArray((user as any).assignedProperties)) {
      (user as any).assignedProperties.forEach((pId: string) => assignedPropertyIds.add(pId));
    }

    return (state.announcements || [])
      .filter((a) => {
        if (a.status !== 'published') return false;
        if (dismissedNoticeIds.has(a.id)) return false;

        if (!a.targetScope?.targetRoles?.includes('staff') && !a.targetScope?.targetRoles?.includes('manager')) {
          return false;
        }

        const isSystem = a.ownerId === 'system' || a.ownerId === 'superadmin' || (a.category as string) === 'system';
        // Strict landlord isolation: Block if staff has no owner association or if announcement belongs to another landlord
        if (!isSystem && (staffOwnerIds.size === 0 || !staffOwnerIds.has(a.ownerId))) {
          return false;
        }

        // Property-level scoping: If targeted to specific properties, verify staff works on at least one
        if (a.targetScope && !a.targetScope.allProperties && a.targetScope.propertyIds && a.targetScope.propertyIds.length > 0) {
          if (assignedPropertyIds.size > 0 && !a.targetScope.propertyIds.some((pId) => assignedPropertyIds.has(pId))) {
            return false;
          }
        }

        // Specific user targeting
        if (
          a.targetScope?.mode === 'specific_people' ||
          (a.targetScope?.targetUserIds && a.targetScope.targetUserIds.length > 0)
        ) {
          const targets = a.targetScope.targetUserIds || [];
          const isTargeted = targets.some((id) => staffIdSet.has(id));
          if (!isTargeted) return false;
        }

        // Acknowledgment check: hide if already acknowledged (unless in 1.5s grace window)
        const isAckedByArr = (a.acknowledgedBy || []).some((id) => staffIdSet.has(id));
        const isAckedByObj = (a.acknowledgments || []).some(
          (ack) =>
            (ack.tenantId && staffIdSet.has(ack.tenantId)) ||
            (ack.tenantEmail && staffEmail && ack.tenantEmail.toLowerCase() === staffEmail)
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
  }, [state.announcements, staffIdSet, user, currentStaff, myTickets, dismissedNoticeIds, justAckedIds, staffEmail]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {!currentStaff && (
        <div className="note-box">
          Your staff profile is not yet set up. Please contact your property owner to complete onboarding.
        </div>
      )}

      {/* Technician Action Center & Reminders */}
      <DashboardReminderHub
        reminders={staffReminders}
        role="staff"
        title="Technician Action Center & Reminders"
      />

      {/* Staff Operational Announcements & Bulletins */}
      {staffAnnouncements.length > 0 && (
        <div className="panel" style={{ borderRadius: '12px' }}>
          <div className="panel-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
            <Megaphone size={18} color="#10B981" />
            <span>Staff & Operational Bulletins ({staffAnnouncements.length})</span>
          </div>
          <div className="bulletins-scroll-container">
            {staffAnnouncements.map((a) => {
              const isUrgent = a.priority === 'urgent' || a.priority === 'emergency';
              const isAckedByArr = (a.acknowledgedBy || []).some((id) => staffIdSet.has(id));
              const isAckedByObj = (a.acknowledgments || []).some(
                (ack) =>
                  (ack.tenantId && staffIdSet.has(ack.tenantId)) ||
                  (ack.tenantEmail && staffEmail && ack.tenantEmail.toLowerCase() === staffEmail)
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
                      <span className="badge green" style={{ fontSize: '10px', padding: '0px 5px', textTransform: 'capitalize', lineHeight: '16px' }}>
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
                        onClick={() => handleStaffAcknowledge(a.id, a.requireAcknowledgment)}
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
      </div>
      )}


      <div className="panel">
        <div className="panel-body">
          {myTickets.length === 0 ? (
              <div style={{ color: 'var(--ink-soft)', padding: '24px 16px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '14px' }}>No tickets currently assigned to you.</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn small ${queueFilter === 'all' ? 'brass' : 'secondary'}`}
                    onClick={() => setQueueFilter('all')}
                  >
                    All ({myTickets.length})
                  </button>
                  <button
                    type="button"
                    className={`btn small ${queueFilter === 'active' ? 'brass' : 'secondary'}`}
                    onClick={() => setQueueFilter('active')}
                  >
                    Active ({activeTickets.length})
                  </button>
                  <button
                    type="button"
                    className={`btn small ${queueFilter === 'resolved' ? 'brass' : 'secondary'}`}
                    onClick={() => setQueueFilter('resolved')}
                  >
                    Resolved ({resolvedTickets.length})
                  </button>
                </div>

                {filteredQueue.length === 0 ? (
                  <div style={{ color: 'var(--ink-soft)', padding: '24px 16px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '14px' }}>No {queueFilter} tickets found.</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop / Tablet Table View (>640px) */}
                    <div className="staff-desktop-table">
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Ticket</th>
                          <th>Unit</th>
                          <th>Tenant & Contact</th>
                          <th>Issue</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQueue.map((t) => (
                          <tr key={t.id}>
                            <td><b>{t.id}</b></td>
                            <td>{t.unit}</td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{t.tenant || 'Tenant'}</div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                {t.tenantContact?.phone ? t.tenantContact.phone : '—'}
                                {t.tenantContact?.email ? ` • ${t.tenantContact.email}` : ''}
                              </div>
                            </td>
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
                              <span
                                className={`badge ${
                                  t.status === 'resolved'
                                    ? 'green'
                                    : t.status === 'in_progress'
                                    ? 'brass'
                                    : 'amber'
                                }`}
                              >
                                {t.status.toUpperCase()}
                              </span>
                            </td>
                            <td>
                              {t.status !== 'resolved' ? (
                                <button
                                  type="button"
                                  className="btn secondary small"
                                  onClick={() => {
                                    setSelectedTicket(t);
                                    setStatusInput(
                                      t.status === 'in_progress' ? 'In progress' : 'Completed'
                                    );
                                  }}
                                >
                                  Update
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

                {/* Mobile Touch-Optimized Cards (<=640px) */}
                <div className="staff-mobile-cards">
                  {filteredQueue.map((t) => (
                    <div key={t.id} className="staff-card">
                      <div className="staff-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 1, minWidth: 0, flexWrap: 'wrap' }}>
                          <b style={{ fontSize: '13px', color: 'var(--ink)' }}>{t.id}</b>
                          <span
                            className={`badge ${
                              t.priority === 'High' ? 'red' : t.priority === 'Medium' ? 'amber' : 'grey'
                            }`}
                            style={{ flexShrink: 0 }}
                          >
                            {t.priority}
                          </span>
                        </div>
                        <span
                          className={`badge ${
                            t.status === 'resolved'
                              ? 'green'
                              : t.status === 'in_progress'
                              ? 'brass'
                              : 'amber'
                          }`}
                          style={{ flexShrink: 0 }}
                        >
                          {t.status.toUpperCase()}
                        </span>
                      </div>

                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)', margin: '4px 0 6px', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {t.issue}
                      </div>

                      <div className="staff-card-meta">
                        <div className="staff-card-meta-item">
                          <MapPin size={13} style={{ color: 'var(--ink-soft)' }} />
                          <span>Unit <b>{t.unit}</b></span>
                        </div>
                        <div className="staff-card-meta-item">
                          <span>Resident: <b>{t.tenant || 'Tenant'}</b></span>
                        </div>
                      </div>

                      {t.tenantContact?.phone && (
                        <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '12px' }}>
                          <a
                            href={`tel:${t.tenantContact.phone}`}
                            className="btn secondary small"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none', padding: '4px 8px' }}
                          >
                            <Phone size={12} /> {t.tenantContact.phone}
                          </a>
                          {t.tenantContact.email && (
                            <a
                              href={`mailto:${t.tenantContact.email}`}
                              className="btn secondary small"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none', padding: '4px 8px' }}
                            >
                              <Mail size={12} /> Email
                            </a>
                          )}
                        </div>
                      )}

                      {t.status !== 'resolved' && (
                        <div className="staff-card-footer">
                          <button
                            type="button"
                            className="btn secondary small btn-mobile-full"
                            style={{ fontWeight: 600 }}
                            onClick={() => {
                              setSelectedTicket(t);
                              setStatusInput(
                                t.status === 'in_progress' ? 'In progress' : 'Completed'
                              );
                            }}
                          >
                            Update Ticket Status
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
              </>
            )}
          </div>
        </div>

      {/* Update Ticket Modal */}
      {selectedTicket && (
        <div className="modal-backdrop" onClick={() => setSelectedTicket(null)}>
          <div className="modal-card" style={{ maxWidth: '460px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ fontSize: '16px' }}>Update ticket {selectedTicket.id}</h3>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setSelectedTicket(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Status</label>
                <select
                  value={statusInput}
                  onChange={(e) => setStatusInput(e.target.value as any)}
                >
                  <option value="In progress">In progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea
                  rows={3}
                  placeholder="What was done…"
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Photo proof</label>
                <input type="file" accept="image/*" />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setSelectedTicket(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass"
                onClick={handleSaveTicketStatus}
                disabled={isSavingStatus}
              >
                <ButtonProcessing
                  loading={isSavingStatus}
                  loadingText="Saving update..."
                  defaultText="Save update"
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
