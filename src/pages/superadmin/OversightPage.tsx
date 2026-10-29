import React, { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { PlatformSupportTicket, InAppNotification } from '../../types';
import { isFirebaseConfigured, db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import {
  Search,
  LifeBuoy,
  Clock,
  CheckCircle2,
  MessageSquare,
  AlertTriangle,
  Eye,
  ShieldCheck,
} from 'lucide-react';

export const OversightPage: React.FC = () => {
  const { state, updateState, showToast, logAuditEvent } = useAppData();
  const [subTab, setSubTab] = useState<'audit' | 'support'>('audit');
  const [respondingTicket, setRespondingTicket] = useState<PlatformSupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');

  // Audit Log State
  const [auditActorFilter, setAuditActorFilter] = useState('all');
  const [auditCategoryFilter, setAuditCategoryFilter] = useState('all');
  const [auditSearch, setAuditSearch] = useState('');

  // Support Helpdesk State
  const [supportStatusFilter, setSupportStatusFilter] = useState<'all' | 'open' | 'waiting_on_us' | 'resolved'>('all');
  const [supportSearch, setSupportSearch] = useState('');

  const auditStats = {
    total: (state.auditLog || []).length,
    financial: (state.auditLog || []).filter((l) => (l.category || '').toLowerCase() === 'financial').length,
    lease: (state.auditLog || []).filter((l) => (l.category || '').toLowerCase() === 'lease').length,
    security: (state.auditLog || []).filter((l) => (l.category || '').toLowerCase() === 'security').length,
  };

  const filteredLogs = (state.auditLog || []).filter((log) => {
    const actorRole = (log.actorRole || '').toLowerCase();
    const actorName = (log.actor || '').toLowerCase();
    const filterRole = auditActorFilter.toLowerCase();
    const matchesActor =
      auditActorFilter === 'all' ||
      actorRole === filterRole ||
      actorName.includes(filterRole);

    const category = (log.category || 'system').toLowerCase();
    const matchesCategory =
      auditCategoryFilter === 'all' ||
      category === auditCategoryFilter.toLowerCase();

    const matchesSearch =
      !auditSearch ||
      log.action?.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.detail?.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.actor?.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.category?.toLowerCase().includes(auditSearch.toLowerCase()) ||
      (log.unit && log.unit.toLowerCase().includes(auditSearch.toLowerCase()));

    return matchesActor && matchesCategory && matchesSearch;
  });

  const formatAuditTime = (timeStr?: string, timestamp?: string) => {
    const raw = timestamp || timeStr;
    if (!raw) return '—';
    if (raw === 'Just now') return 'Just now';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getAuditCategoryBadge = (cat?: string) => {
    const c = (cat || 'system').toLowerCase();
    switch (c) {
      case 'financial':
        return <span className="badge green" style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', fontWeight: 600 }}>Financial</span>;
      case 'lease':
        return <span className="badge purple" style={{ background: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE', fontWeight: 600 }}>Leasing</span>;
      case 'support':
        return <span className="badge amber" style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A', fontWeight: 600 }}>Support</span>;
      case 'security':
        return <span className="badge red" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', fontWeight: 600 }}>Security</span>;
      case 'maintenance':
        return <span className="badge blue" style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontWeight: 600 }}>Maintenance</span>;
      case 'user':
        return <span className="badge cyan" style={{ background: '#ECFEFF', color: '#0E7490', border: '1px solid #A5F3FC', fontWeight: 600 }}>User / Plan</span>;
      default:
        return <span className="badge grey" style={{ background: 'var(--surface-hover, #F3F4F6)', color: 'var(--ink-soft)', border: '1px solid var(--line)', fontWeight: 500 }}>System</span>;
    }
  };

  const getActorRoleBadge = (role?: string) => {
    const r = (role || '').toLowerCase();
    switch (r) {
      case 'superadmin':
        return <span style={{ fontSize: '10px', background: '#4338CA', color: '#FFF', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Admin</span>;
      case 'owner':
        return <span style={{ fontSize: '10px', background: 'var(--brass, #C5A880)', color: '#000', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Owner</span>;
      case 'tenant':
        return <span style={{ fontSize: '10px', background: '#0284C7', color: '#FFF', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Tenant</span>;
      case 'staff':
        return <span style={{ fontSize: '10px', background: '#D97706', color: '#FFF', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Staff</span>;
      default:
        return null;
    }
  };

  const supportTickets = state.platformSupport || [];

  const supportStats = {
    total: supportTickets.length,
    open: supportTickets.filter((t) => t.status === 'open').length,
    waitingOnUs: supportTickets.filter((t) => t.status === 'waiting_on_us').length,
    resolved: supportTickets.filter((t) => t.status === 'resolved').length,
  };

  const filteredSupportTickets = supportTickets.filter((ticket) => {
    const matchesStatus = supportStatusFilter === 'all' || ticket.status === supportStatusFilter;
    const term = supportSearch.toLowerCase().trim();
    const matchesSearch =
      !term ||
      ticket.id.toLowerCase().includes(term) ||
      ticket.owner.toLowerCase().includes(term) ||
      (ticket.ownerEmail && ticket.ownerEmail.toLowerCase().includes(term)) ||
      ticket.topic.toLowerCase().includes(term) ||
      (ticket.detail && ticket.detail.toLowerCase().includes(term)) ||
      (ticket.category && ticket.category.toLowerCase().includes(term)) ||
      (ticket.reply && ticket.reply.toLowerCase().includes(term));
    return matchesStatus && matchesSearch;
  });

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return (
          <span className="badge red" style={{ background: '#FEE2E2', color: '#B91C1C', fontWeight: 600 }}>
            ⚡ Urgent
          </span>
        );
      case 'high':
        return (
          <span className="badge amber" style={{ background: '#FFEDD5', color: '#C2410C', fontWeight: 600 }}>
            High
          </span>
        );
      case 'low':
        return (
          <span className="badge grey" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-soft)' }}>
            Low
          </span>
        );
      default:
        return (
          <span className="badge blue" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
            Medium
          </span>
        );
    }
  };

  const getCategoryLabel = (cat?: string) => {
    switch (cat) {
      case 'billing':
        return 'Billing & Invoicing';
      case 'technical':
        return 'Technical / Bug';
      case 'subscription':
        return 'Subscription Plan';
      case 'leasing':
        return 'Lease Agreements';
      case 'feature_request':
        return 'Feature Suggestion';
      default:
        return 'General Assistance';
    }
  };

  const handleExportCsv = () => {
    const headers = 'Time,Timestamp,Actor,Role,Category,Action,Detail,Unit\n';
    const rows = filteredLogs
      .map(
        (l) =>
          `"${formatAuditTime(l.time, l.timestamp)}","${l.timestamp || l.time}","${l.actor}","${l.actorRole || ''}","${l.category || ''}","${l.action}","${(l.detail || '').replace(/"/g, '""')}","${l.unit || ''}"`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `propithub-audit-log-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Audit log exported as CSV.');
  };

  const handleSendReply = async (resolveStatus: 'waiting_on_us' | 'resolved' = 'waiting_on_us') => {
    if (!respondingTicket) return;

    const updatedTicket: PlatformSupportTicket = {
      ...respondingTicket,
      status: resolveStatus,
      reply: replyText,
      repliedAt: new Date().toISOString(),
      repliedBy: 'Platform Admin',
      resolvedAt: resolveStatus === 'resolved' ? new Date().toISOString() : respondingTicket.resolvedAt,
      resolvedBy: resolveStatus === 'resolved' ? 'admin' : respondingTicket.resolvedBy,
    };

    const targetOwner = state.users.find(
      (u) =>
        (respondingTicket.ownerId && u.id === respondingTicket.ownerId) ||
        (respondingTicket.ownerEmail && u.email?.toLowerCase() === respondingTicket.ownerEmail.toLowerCase()) ||
        u.displayName?.toLowerCase() === respondingTicket.owner.toLowerCase() ||
        (u as any).name?.toLowerCase() === respondingTicket.owner.toLowerCase()
    );

    const notif: InAppNotification | null = targetOwner
      ? {
          id: `notif_${Date.now()}`,
          userId: targetOwner.id,
          title: 'Platform Helpdesk: Response Received',
          body: `Platform Admin replied to your ticket ("${respondingTicket.topic}"): "${replyText.slice(0, 80)}..."`,
          link: '/owner/helpdesk',
          isRead: false,
          createdAt: new Date().toISOString(),
        }
      : null;

    updateState((prev) => ({
      ...prev,
      platformSupport: prev.platformSupport.map((s) =>
        s.id === respondingTicket.id ? updatedTicket : s
      ),
      notifications: notif ? [...(prev.notifications || []), notif] : prev.notifications,
    }));

    logAuditEvent({
      actor: 'Superadmin',
      actorRole: 'superadmin',
      action: resolveStatus === 'resolved' ? 'Support Ticket Resolved' : 'Support Ticket Replied',
      category: 'support',
      detail: `Replied to ${respondingTicket.owner} (#${respondingTicket.id}): "${replyText.slice(0, 50)}..."`,
    }).catch(console.warn);

    if (isFirebaseConfigured) {
      try {
        await setDoc(doc(db, 'platformSupport', respondingTicket.id), updatedTicket, { merge: true });
        if (notif) {
          await setDoc(doc(db, 'notifications', notif.id), notif);
        }
      } catch (err) {
        console.warn('Firestore platformSupport sync error:', err);
      }
    }

    showToast(`Reply sent to ${respondingTicket.owner}.`);
    setRespondingTicket(null);
    setReplyText('');
  };

  return (
    <div>
      <div className="tabs">
        <div
          className={`tab ${subTab === 'audit' ? 'active' : ''}`}
          onClick={() => setSubTab('audit')}
          style={{ flexShrink: 0 }}
        >
          Audit log
        </div>
        <div
          className={`tab ${subTab === 'support' ? 'active' : ''}`}
          onClick={() => setSubTab('support')}
          style={{ flexShrink: 0 }}
        >
          Platform support
        </div>
      </div>

      {subTab === 'audit' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Audit KPIs Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div className="panel" style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Audit Events</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: 'var(--ink)' }}>{auditStats.total}</div>
            </div>

            <div className="panel" style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Financial Operations</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: '#047857' }}>{auditStats.financial}</div>
            </div>

            <div className="panel" style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Lease & Tenancy</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: '#6D28D9' }}>{auditStats.lease}</div>
            </div>

            <div className="panel" style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Security & Platform</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: '#B91C1C' }}>{auditStats.security}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 500px' }}>
                <select
                  value={auditActorFilter}
                  onChange={(e) => setAuditActorFilter(e.target.value)}
                  style={{ minWidth: '130px' }}
                >
                  <option value="all">All Actors</option>
                  <option value="superadmin">Superadmin</option>
                  <option value="owner">Owner</option>
                  <option value="tenant">Tenant</option>
                  <option value="staff">Staff</option>
                  <option value="system">System</option>
                </select>

                <select
                  value={auditCategoryFilter}
                  onChange={(e) => setAuditCategoryFilter(e.target.value)}
                  style={{ minWidth: '140px' }}
                >
                  <option value="all">All Categories</option>
                  <option value="financial">Financial</option>
                  <option value="lease">Leasing</option>
                  <option value="support">Support</option>
                  <option value="security">Security</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="user">User / Plan</option>
                  <option value="system">System</option>
                </select>

                <input
                  type="text"
                  placeholder="Search actions, actors, units, details..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  style={{ flex: '1 1 200px', minWidth: '160px' }}
                />

                <span style={{ fontSize: '12px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                  {filteredLogs.length} event{filteredLogs.length === 1 ? '' : 's'}
                </span>
              </div>
              <button
                type="button"
                className="btn secondary small btn-mobile-full"
                onClick={handleExportCsv}
              >
                Export CSV
              </button>
            </div>
            <div className="panel-body">
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '160px' }}>Time</th>
                        <th style={{ width: '180px' }}>Actor</th>
                        <th style={{ width: '120px' }}>Category</th>
                        <th style={{ width: '180px' }}>Action</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '32px 16px' }}>
                            No audit events match current filter.
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map((log, idx) => (
                          <tr key={log.id || idx}>
                            <td style={{ fontSize: '12px', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                              {formatAuditTime(log.time, log.timestamp)}
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{log.actor}</span>
                                {getActorRoleBadge(log.actorRole)}
                              </div>
                            </td>
                            <td>
                              {getAuditCategoryBadge(log.category)}
                            </td>
                            <td>
                              <span className="badge grey" style={{ fontWeight: 600 }}>{log.action}</span>
                            </td>
                            <td style={{ color: 'var(--ink-soft)', fontSize: '13px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {log.unit && (
                                  <span style={{ fontSize: '11px', background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--line)', fontWeight: 600 }}>
                                    Unit {log.unit}
                                  </span>
                                )}
                                <span>{log.detail}</span>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mobile-card-view">
                {filteredLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px 16px' }}>
                    No audit events match current filter.
                  </div>
                ) : (
                  filteredLogs.map((log, idx) => (
                    <div key={log.id || idx} className="staff-card" style={{ padding: '14px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>{log.actor}</span>
                          {getActorRoleBadge(log.actorRole)}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                          {formatAuditTime(log.time, log.timestamp)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                        {getAuditCategoryBadge(log.category)}
                        <span className="badge grey">{log.action}</span>
                        {log.unit && (
                          <span style={{ fontSize: '11px', background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--line)', fontWeight: 600 }}>
                            Unit {log.unit}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                        {log.detail}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Support KPIs Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div className="panel" style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Inquiries</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: 'var(--ink)' }}>{supportStats.total}</div>
            </div>

            <div className="panel" style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Awaiting Admin</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: 'var(--amber)' }}>{supportStats.open}</div>
            </div>

            <div className="panel" style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--ledger)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Admin Replied</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: 'var(--ledger)' }}>{supportStats.waitingOnUs}</div>
            </div>

            <div className="panel" style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--teal-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resolved</div>
              <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: 'var(--teal-primary)' }}>{supportStats.resolved}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-body">
              <div style={{ marginBottom: '16px' }}>
                <p style={{ color: 'var(--ink-soft)', margin: '0 0 14px', fontSize: '13px' }}>
                  Platform Helpdesk: Direct administrative requests and platform inquiries submitted by property owners.
                </p>

                {/* Filter and Search Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(['all', 'open', 'waiting_on_us', 'resolved'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setSupportStatusFilter(st)}
                        className={`btn small ${supportStatusFilter === st ? 'brass' : 'secondary'}`}
                        style={{ textTransform: 'capitalize', fontWeight: supportStatusFilter === st ? 700 : 500 }}
                      >
                        {st === 'all' ? 'All Tickets' : st === 'open' ? 'Awaiting Review' : st === 'waiting_on_us' ? 'Admin Replied' : 'Resolved'}
                      </button>
                    ))}
                  </div>

                  <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '360px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
                    <input
                      type="text"
                      placeholder="Search ticket ID, owner, topic..."
                      value={supportSearch}
                      onChange={(e) => setSupportSearch(e.target.value)}
                      style={{ paddingLeft: '32px', width: '100%', fontSize: '13px' }}
                    />
                  </div>
                </div>
              </div>

              {filteredSupportTickets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink-soft)' }}>
                  <LifeBuoy size={40} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink)' }}>No support tickets found</div>
                  <p style={{ maxWidth: '380px', margin: '4px auto 0', fontSize: '13px' }}>
                    {supportSearch || supportStatusFilter !== 'all'
                      ? 'No tickets match your active filter. Try resetting search or switching status.'
                      : 'There are currently no open support requests in the platform queue.'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="desktop-table-view">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Ticket ID &amp; Date</th>
                            <th>Owner / Requester</th>
                            <th>Category</th>
                            <th>Priority</th>
                            <th>Status</th>
                            <th>Admin Response / Resolution</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSupportTickets.map((sup) => (
                            <tr key={sup.id}>
                              <td>
                                <b style={{ fontFamily: 'monospace', color: 'var(--ink)' }}>#{sup.id}</b>
                                {sup.createdAt && (
                                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                                    {new Date(sup.createdAt).toLocaleDateString()}
                                  </div>
                                )}
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{sup.owner}</div>
                                {sup.ownerEmail && (
                                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                                    {sup.ownerEmail}
                                  </div>
                                )}
                              </td>
                              <td>
                                <span style={{ fontSize: '12px', color: 'var(--ink)' }}>
                                  {getCategoryLabel(sup.category)}
                                </span>
                              </td>
                              <td>{getPriorityBadge(sup.priority)}</td>
                              <td>
                                <span
                                  className={`badge ${
                                    sup.status === 'resolved'
                                      ? 'green'
                                      : sup.status === 'waiting_on_us'
                                      ? 'blue'
                                      : 'amber'
                                  }`}
                                >
                                  {sup.status === 'resolved'
                                    ? '✓ Resolved'
                                    : sup.status === 'waiting_on_us'
                                    ? '💬 Replied'
                                    : '⏳ Awaiting Review'}
                                </span>
                              </td>
                              <td style={{ maxWidth: '240px' }}>
                                {sup.status === 'resolved' ? (
                                  <div style={{ fontSize: '12px', color: '#15803D' }}>
                                    ✓ Closed by {sup.resolvedBy === 'owner' ? 'Owner' : 'Admin'}
                                    {sup.resolutionNotes && (
                                      <div style={{ color: 'var(--ink-soft)', fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        Notes: "{sup.resolutionNotes}"
                                      </div>
                                    )}
                                  </div>
                                ) : sup.reply ? (
                                  <div style={{ fontSize: '12px', color: 'var(--ledger)', background: '#F0FDF4', padding: '5px 8px', borderRadius: '6px', border: '1px solid #DCFCE7' }}>
                                    ↳ <b>Admin:</b> "{sup.reply.length > 50 ? `${sup.reply.slice(0, 50)}...` : sup.reply}"
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Pending response</span>
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className={`btn small ${sup.status === 'open' ? 'brass' : 'secondary'}`}
                                  onClick={() => {
                                    setRespondingTicket(sup);
                                    setReplyText(sup.reply || '');
                                  }}
                                  style={{ whiteSpace: 'nowrap' }}
                                >
                                  {sup.status === 'resolved' ? 'View Details' : 'Respond'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mobile-card-view">
                    {filteredSupportTickets.map((sup) => (
                      <div key={sup.id} className="staff-card" style={{ padding: '14px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>{sup.owner}</div>
                            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--ink-soft)' }}>#{sup.id}</div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {getPriorityBadge(sup.priority)}
                            <span
                              className={`badge ${
                                sup.status === 'resolved'
                                  ? 'green'
                                  : sup.status === 'waiting_on_us'
                                  ? 'blue'
                                  : 'amber'
                              }`}
                            >
                              {sup.status === 'resolved'
                                ? 'Resolved'
                                : sup.status === 'waiting_on_us'
                                ? 'Replied'
                                : 'Awaiting Review'}
                            </span>
                          </div>
                        </div>

                        <div style={{ fontSize: '12px', color: 'var(--brass)', fontWeight: 600, marginBottom: '4px' }}>
                          {getCategoryLabel(sup.category)}
                        </div>

                        <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)', marginBottom: '4px' }}>
                          {sup.topic}
                        </div>

                        {sup.detail && (
                          <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginBottom: '10px', lineHeight: 1.4 }}>
                            {sup.detail}
                          </div>
                        )}

                        {sup.reply && (
                          <div style={{ fontSize: '12px', color: 'var(--ledger)', marginBottom: '10px', background: 'var(--surface-sunken)', padding: '6px 10px', borderRadius: '6px' }}>
                            ↳ Admin Reply: {sup.reply}
                          </div>
                        )}

                        <button
                          type="button"
                          className="btn secondary small btn-mobile-full"
                          onClick={() => {
                            setRespondingTicket(sup);
                            setReplyText(sup.reply || '');
                          }}
                        >
                          {sup.status === 'resolved' ? 'View Details' : 'Respond to Ticket'}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Respond & Detail Modal */}
      {respondingTicket && (
        <div className="modal-backdrop" onClick={() => setRespondingTicket(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
            <div className="modal-head">
              <div>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontFamily: 'monospace' }}>#{respondingTicket.id}</div>
                <h3 style={{ margin: 0, fontSize: '18px' }}>Support Ticket Details</h3>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setRespondingTicket(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Meta Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', background: 'var(--surface-sunken)', padding: '12px', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Owner</div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{respondingTicket.owner}</div>
                  {respondingTicket.ownerEmail && (
                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{respondingTicket.ownerEmail}</div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Category</div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{getCategoryLabel(respondingTicket.category)}</div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Priority</div>
                  <div style={{ marginTop: '2px' }}>{getPriorityBadge(respondingTicket.priority)}</div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Status</div>
                  <span
                    className={`badge ${
                      respondingTicket.status === 'resolved'
                        ? 'green'
                        : respondingTicket.status === 'waiting_on_us'
                        ? 'blue'
                        : 'amber'
                    }`}
                    style={{ marginTop: '2px' }}
                  >
                    {respondingTicket.status === 'resolved'
                      ? '✓ Resolved'
                      : respondingTicket.status === 'waiting_on_us'
                      ? '💬 Replied'
                      : '⏳ Awaiting Review'}
                  </span>
                </div>
              </div>

              {/* Subject & Inquiry Details */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '4px' }}>
                    Subject / Topic
                  </div>
                  <div style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--ink)' }}>
                    {respondingTicket.topic}
                  </div>
                </div>

                <div className="divider" style={{ margin: '12px 0' }} />

                <div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Inquiry Details &amp; Message
                  </div>
                  <div style={{ background: 'var(--surface-sunken, #F8F9FA)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '13.5px', color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {respondingTicket.detail || respondingTicket.topic || 'No additional details provided.'}
                  </div>
                </div>
              </div>

              {/* Resolution details if already closed */}
              {respondingTicket.status === 'resolved' && (
                <div style={{ background: '#F0FDF4', border: '1px solid #DCFCE7', borderRadius: '6px', padding: '12px' }}>
                  <div style={{ fontWeight: 600, color: '#15803D', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={16} /> Marked Resolved by {respondingTicket.resolvedBy === 'owner' ? 'Owner' : 'Admin'}
                  </div>
                  {respondingTicket.resolvedAt && (
                    <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                      Closed on {new Date(respondingTicket.resolvedAt).toLocaleString()}
                    </div>
                  )}
                  {respondingTicket.resolutionNotes && (
                    <div style={{ marginTop: '6px', fontSize: '12.5px', color: 'var(--ink)' }}>
                      <b>Closing Notes:</b> {respondingTicket.resolutionNotes}
                    </div>
                  )}
                </div>
              )}

              {/* Administrative Response Input */}
              <div className="field">
                <label style={{ fontWeight: 600 }}>Administrative Response</label>
                <textarea
                  rows={4}
                  placeholder="Provide resolution details or advice for the property owner…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  style={{ width: '100%', fontSize: '13px', lineHeight: 1.5 }}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', padding: '16px 20px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setRespondingTicket(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                style={{ fontWeight: 600 }}
                disabled={!replyText.trim()}
                onClick={() => handleSendReply('waiting_on_us')}
              >
                Send Reply (Keep Open)
              </button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                disabled={!replyText.trim()}
                onClick={() => handleSendReply('resolved')}
              >
                Send &amp; Mark Resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

