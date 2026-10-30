import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { Ticket, StaffMember, StaffScheduleItem } from '../../types';
import { isFirebaseConfigured, db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Phone, Mail, MapPin, Clock, Calendar, AlertCircle, Megaphone, Pin, Flame } from 'lucide-react';
import { ButtonProcessing } from '../../components/common/Spinner';
import { getStaffReminders } from '../../lib/reminders';
import { DashboardReminderHub } from '../../components/dashboard/DashboardReminderHub';

export const StaffDashboardQueuePage: React.FC = () => {
  const { state, updateState, saveTicket, saveStaff, showToast } = useAppData();
  const { user } = useAuth();
  const staffId = user?.id || '';
  const staffEmail = user?.email?.toLowerCase() || '';
  const staffName = user?.displayName || '';

  const [subTab, setSubTab] = useState<'queue' | 'schedule'>('queue');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [statusInput, setStatusInput] = useState<'In progress' | 'Completed'>('In progress');
  const [completionNotes, setCompletionNotes] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Schedule management state
  const [isAddScheduleOpen, setIsAddScheduleOpen] = useState(false);
  const [schedDay, setSchedDay] = useState('Today');
  const [schedJob, setSchedJob] = useState('');
  const [schedUnit, setSchedUnit] = useState('');
  const [schedTime, setSchedTime] = useState('09:00 AM - 11:00 AM');

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
  const dynamicCompleted = Math.max(currentStaff?.completed || 0, resolvedTickets.length);

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

  const staffAnnouncements = useMemo(() => {
    const staffIdSet = new Set<string>();
    if (staffId) staffIdSet.add(staffId);
    if (user?.id) staffIdSet.add(user.id);
    if (currentStaff?.id) staffIdSet.add(currentStaff.id);

    return (state.announcements || [])
      .filter((a) => {
        if (a.status !== 'published') return false;
        if (!a.targetScope?.targetRoles?.includes('staff') && !a.targetScope?.targetRoles?.includes('manager')) {
          return false;
        }
        if (
          a.targetScope?.mode === 'specific_people' ||
          (a.targetScope?.targetUserIds && a.targetScope.targetUserIds.length > 0)
        ) {
          const targets = a.targetScope.targetUserIds || [];
          const isTargeted = targets.some((id) => staffIdSet.has(id));
          if (!isTargeted) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
      });
  }, [state.announcements, staffId, user, currentStaff]);

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
        <div className="panel" style={{ padding: '18px 20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
            <Megaphone size={18} color="#10B981" />
            <span>Staff & Operational Bulletins ({staffAnnouncements.length})</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {staffAnnouncements.map((a) => {
              const isUrgent = a.priority === 'urgent' || a.priority === 'emergency';
              return (
                <div
                  key={a.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '8px',
                    borderLeft: isUrgent ? '4px solid #dc2626' : a.isPinned ? '4px solid var(--brass, #c59b27)' : '4px solid var(--border)',
                    background: isUrgent ? '#fef2f2' : 'var(--surface-sunken)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="badge green" style={{ fontSize: '11px', textTransform: 'capitalize' }}>
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

      <div className="grid grid-3" style={{ marginBottom: '20px' }}>
        <div className="stat">
          <div className="num">
            {activeTickets.length}
          </div>
          <div className="lbl">Active tickets</div>
        </div>
        <div className="stat">
          <div className="num">{dynamicCompleted}</div>
          <div className="lbl">Completed all-time</div>
        </div>
        <div className="stat">
          <div className="num">★ {currentStaff?.rating ? Number(currentStaff.rating).toFixed(1) : '5.0'}</div>
          <div className="lbl">Rating</div>
        </div>
      </div>

      <div className="tabs">
        <div
          className={`tab ${subTab === 'queue' ? 'active' : ''}`}
          onClick={() => setSubTab('queue')}
        >
          Ticket queue ({myTickets.length})
        </div>
        <div
          className={`tab ${subTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setSubTab('schedule')}
        >
          Work Schedule
        </div>
      </div>

      {subTab === 'queue' ? (
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <b style={{ fontSize: '13.5px', color: 'var(--ink)' }}>{t.id}</b>
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
                              : t.status === 'in_progress'
                              ? 'brass'
                              : 'amber'
                          }`}
                        >
                          {t.status.toUpperCase()}
                        </span>
                      </div>

                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)', margin: '4px 0 6px' }}>
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
      ) : (
        <div className="panel">
          <div
            className="panel-head"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Work Schedule & Maintenance Dispatch</h3>
              <div className="hint" style={{ marginTop: '2px' }}>Your upcoming shifts and dispatched unit appointments</div>
            </div>
            <button
              type="button"
              className="btn brass small btn-mobile-full"
              onClick={() => setIsAddScheduleOpen(true)}
            >
              + Add Schedule Entry
            </button>
          </div>
          <div className="panel-body">
            {(() => {
              const unifiedSchedule: StaffScheduleItem[] = [
                ...(state.staffSchedules || []).filter((s) => !s.staffId || s.staffId === staffId),
                ...myTickets
                  .filter((t) => t.status === 'in_progress')
                  .map((t) => ({
                    day: 'Ongoing',
                    job: `${t.priority.toUpperCase()}: ${t.issue}`,
                    unit: `Unit ${t.unit}`,
                    time: 'Active Dispatch',
                  })),
              ];

              if (unifiedSchedule.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--ink-soft)' }}>
                    <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>No scheduled tasks or appointments for this week.</p>
                    <button
                      type="button"
                      className="btn secondary small btn-mobile-full"
                      onClick={() => setIsAddScheduleOpen(true)}
                    >
                      + Add your first schedule block
                    </button>
                  </div>
                );
              }

              return (
                <>
                  {/* Desktop / Tablet Schedule Table (>640px) */}
                  <div className="staff-desktop-table">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Day / Window</th>
                            <th>Job Description</th>
                            <th>Unit / Premises</th>
                            <th>Time Slot</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unifiedSchedule.map((s, idx) => (
                            <tr key={idx}>
                              <td><b>{s.day}</b></td>
                              <td>{s.job}</td>
                              <td>{s.unit}</td>
                              <td style={{ color: 'var(--ink-soft)' }}>{s.time}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile Schedule Cards (<=640px) */}
                  <div className="staff-mobile-cards">
                    {unifiedSchedule.map((s, idx) => (
                      <div key={idx} className="staff-card">
                        <div className="staff-card-header">
                          <span className="badge brass" style={{ fontWeight: 700 }}>
                            <Calendar size={12} style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: '4px' }} />
                            {s.day}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--ink-soft)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} />
                            {s.time}
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)', marginTop: '4px' }}>
                          {s.job}
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={13} />
                          {s.unit}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

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

      {/* Add Schedule Modal */}
      {isAddScheduleOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddScheduleOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '440px', width: '92vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ fontSize: '16px' }}>Add Work Schedule Entry</h3>
              <button type="button" className="btn secondary small" onClick={() => setIsAddScheduleOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Day / Date</label>
                <select value={schedDay} onChange={(e) => setSchedDay(e.target.value)}>
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                  <option value="Today">Today</option>
                  <option value="Tomorrow">Tomorrow</option>
                </select>
              </div>
              <div className="field">
                <label>Job Description</label>
                <input
                  type="text"
                  placeholder="e.g. Electrical wiring inspection / AC repair"
                  value={schedJob}
                  onChange={(e) => setSchedJob(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Unit / Premises</label>
                <input
                  type="text"
                  placeholder="e.g. Unit 204, Tower B"
                  value={schedUnit}
                  onChange={(e) => setSchedUnit(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Time Slot</label>
                <input
                  type="text"
                  placeholder="e.g. 10:00 AM - 12:00 PM"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button type="button" className="btn secondary" onClick={() => setIsAddScheduleOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn brass"
                disabled={isSavingSchedule}
                onClick={async () => {
                  if (!schedJob.trim()) {
                    showToast('Please enter a job description.');
                    return;
                  }
                  setIsSavingSchedule(true);
                  try {
                    const newEntry: StaffScheduleItem = {
                      day: schedDay,
                      job: schedJob.trim(),
                      unit: schedUnit.trim() || 'General Premises',
                      time: schedTime.trim() || 'Flexible Window',
                    };
                    updateState((prev) => ({
                      ...prev,
                      staffSchedules: [...(prev.staffSchedules || []), newEntry],
                    }));
                    if (isFirebaseConfigured) {
                      await setDoc(doc(db, 'staffSchedules', `SCHED-${Date.now()}`), { ...newEntry, staffId }, { merge: true }).catch(console.warn);
                    }
                    showToast('✓ Schedule entry added.');
                    setIsAddScheduleOpen(false);
                    setSchedJob('');
                    setSchedUnit('');
                  } finally {
                    setIsSavingSchedule(false);
                  }
                }}
              >
                <ButtonProcessing
                  loading={isSavingSchedule}
                  loadingText="Saving to Schedule..."
                  defaultText="Save to Schedule"
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
