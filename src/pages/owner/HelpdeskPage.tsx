import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { PlatformSupportTicket } from '../../types';
import {
  HelpCircle,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  ShieldCheck,
  X,
  Send,
  Building2,
  Calendar,
  Tag,
  ArrowRight,
  LifeBuoy
} from 'lucide-react';
import { ButtonProcessing } from '../../components/common/Spinner';

export const HelpdeskPage: React.FC = () => {
  const { state, createPlatformSupportTicket, resolvePlatformSupportTicket } = useAppData();
  const { user } = useAuth();
  const ownerName = user?.displayName || 'Property Owner';
  const ownerEmail = user?.email?.toLowerCase() || '';
  const ownerId = user?.id || '';

  // Filter & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'waiting_on_us' | 'resolved'>('all');

  // Modal states
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<PlatformSupportTicket | null>(null);
  const [resolvingTicket, setResolvingTicket] = useState<PlatformSupportTicket | null>(null);
  const [closingNotes, setClosingNotes] = useState('');

  // New Ticket Form State
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState<'billing' | 'technical' | 'subscription' | 'leasing' | 'feature_request' | 'general'>('technical');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [detail, setDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tickets strictly scoped to this owner
  const myTickets = useMemo(() => {
    return (state.platformSupport || []).filter((sup) => {
      const matchOwnerId = ownerId && sup.ownerId === ownerId;
      const matchName = ownerName && sup.owner?.toLowerCase() === ownerName.toLowerCase();
      const matchEmail = ownerEmail && sup.ownerEmail?.toLowerCase() === ownerEmail;
      return matchOwnerId || matchName || matchEmail;
    }).sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [state.platformSupport, ownerId, ownerName, ownerEmail]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return myTickets.filter((t) => {
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesSearch =
        !searchTerm.trim() ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.detail && t.detail.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.reply && t.reply.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [myTickets, statusFilter, searchTerm]);

  // Metrics
  const stats = useMemo(() => {
    return {
      total: myTickets.length,
      open: myTickets.filter((t) => t.status === 'open').length,
      replied: myTickets.filter((t) => t.status === 'waiting_on_us' || (t.reply && t.status !== 'resolved')).length,
      resolved: myTickets.filter((t) => t.status === 'resolved').length,
    };
  }, [myTickets]);

  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setIsSubmitting(true);
    try {
      await createPlatformSupportTicket({
        owner: ownerName,
        ownerId,
        ownerEmail,
        topic: topic.trim(),
        detail: detail.trim(),
        category,
        priority,
      });
      setTopic('');
      setDetail('');
      setCategory('technical');
      setPriority('medium');
      setIsNewTicketOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveTicketConfirm = async () => {
    if (!resolvingTicket) return;
    await resolvePlatformSupportTicket(resolvingTicket.id, closingNotes.trim());
    setResolvingTicket(null);
    setClosingNotes('');
    if (selectedTicket?.id === resolvingTicket.id) {
      setSelectedTicket((prev) => (prev ? { ...prev, status: 'resolved', resolvedBy: 'owner' } : null));
    }
  };

  const getPriorityBadge = (p?: string) => {
    switch (p) {
      case 'urgent':
        return <span className="badge red" style={{ background: '#FEE2E2', color: '#B91C1C' }}>⚡ Urgent</span>;
      case 'high':
        return <span className="badge amber" style={{ background: '#FFEDD5', color: '#C2410C' }}>High</span>;
      case 'low':
        return <span className="badge grey" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-soft)' }}>Low</span>;
      default:
        return <span className="badge blue" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>Medium</span>;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner / Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            Platform Helpdesk
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)', fontSize: '14px' }}>
            Direct administrative support between property owners and Propithub platform admins.
          </p>
        </div>

        <button
          type="button"
          className="btn brass"
          onClick={() => setIsNewTicketOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
        >
          <Plus size={16} /> Raise Support Ticket
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <div className="panel" style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Tickets</div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: 'var(--ink)' }}>{stats.total}</div>
        </div>

        <div className="panel" style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Awaiting Admin</div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: 'var(--amber)' }}>{stats.open}</div>
        </div>

        <div className="panel" style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: 'var(--ledger)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Admin Replied</div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: 'var(--ledger)' }}>{stats.replied}</div>
        </div>

        <div className="panel" style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: 'var(--teal-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resolved Tickets</div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: 'var(--teal-primary)' }}>{stats.resolved}</div>
        </div>
      </div>

      {/* Main Filter & Content Panel */}
      <div className="panel">
        <div className="panel-body">
          {/* Controls Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['all', 'open', 'waiting_on_us', 'resolved'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`btn small ${statusFilter === st ? 'brass' : 'secondary'}`}
                  style={{ textTransform: 'capitalize', fontWeight: statusFilter === st ? 700 : 500 }}
                >
                  {st === 'all' ? 'All Tickets' : st === 'open' ? 'Awaiting Review' : st === 'waiting_on_us' ? 'Admin Replied' : 'Resolved'}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '260px', maxWidth: '100%' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
              <input
                type="text"
                placeholder="Search ticket, topic, or keyword..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '32px', width: '100%', fontSize: '13px' }}
              />
            </div>
          </div>

          {/* Ticket Listing */}
          {filteredTickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink-soft)' }}>
              <HelpCircle size={42} color="#CBD5E1" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--ink)' }}>No support tickets found</div>
              <p style={{ maxWidth: '420px', margin: '6px auto 0', fontSize: '13px' }}>
                {searchTerm || statusFilter !== 'all'
                  ? 'No tickets match your active filter. Try resetting search or switching status.'
                  : 'Have a question or encounter an issue? Use the top "+ Raise Support Ticket" button to request assistance.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ticket ID</th>
                        <th>Subject &amp; Summary</th>
                        <th>Category</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Admin Response</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTickets.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <b style={{ color: 'var(--ink)', fontFamily: 'monospace' }}>#{t.id}</b>
                            {t.createdAt && (
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                {new Date(t.createdAt).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                          <td style={{ maxWidth: '280px' }}>
                            <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--ink)' }}>{t.topic}</div>
                            {t.detail && (
                              <div style={{ fontSize: '12px', color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.detail}
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: '12px', color: 'var(--ink)' }}>{getCategoryLabel(t.category)}</span>
                          </td>
                          <td>{getPriorityBadge(t.priority)}</td>
                          <td>
                            <span
                              className={`badge ${t.status === 'resolved'
                                ? 'green'
                                : t.reply
                                  ? 'brass'
                                  : 'amber'
                                }`}
                            >
                              {t.status === 'resolved'
                                ? '✓ Resolved'
                                : t.reply
                                  ? '💬 Response Received'
                                  : '⏳ In Review'}
                            </span>
                          </td>
                          <td style={{ maxWidth: '220px' }}>
                            {t.reply ? (
                              <div style={{ fontSize: '12px', color: 'var(--ledger)', background: '#F0FDF4', padding: '6px 10px', borderRadius: '6px', border: '1px solid #DCFCE7' }}>
                                ↳ <b>Admin:</b> "{t.reply.length > 50 ? `${t.reply.slice(0, 50)}...` : t.reply}"
                              </div>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Awaiting admin review</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn secondary small"
                                onClick={() => setSelectedTicket(t)}
                              >
                                View Ticket
                              </button>
                              {t.status !== 'resolved' && (
                                <button
                                  type="button"
                                  className="btn green small"
                                  style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}
                                  title="Mark issue resolved"
                                  onClick={() => setResolvingTicket(t)}
                                >
                                  ✓ Resolve
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-card-view">
                {filteredTickets.map((t) => (
                  <div key={t.id} className="staff-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--ink-soft)' }}>#{t.id}</div>
                        <b style={{ fontSize: '15px' }}>{t.topic}</b>
                      </div>
                      <span
                        className={`badge ${t.status === 'resolved'
                          ? 'green'
                          : t.reply
                            ? 'brass'
                            : 'amber'
                          }`}
                      >
                        {t.status === 'resolved' ? '✓ Resolved' : t.reply ? '💬 Response' : 'In Review'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {getPriorityBadge(t.priority)}
                      <span style={{ fontSize: '11px', color: 'var(--ink-soft)', background: 'var(--surface-sunken)', padding: '2px 8px', borderRadius: '4px' }}>
                        {getCategoryLabel(t.category)}
                      </span>
                      {t.createdAt && (
                        <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                          {new Date(t.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {t.detail && (
                      <p style={{ fontSize: '12.5px', color: 'var(--ink)', margin: 0 }}>
                        {t.detail}
                      </p>
                    )}

                    {t.reply && (
                      <div style={{ background: '#F0FDF4', padding: '8px 10px', borderRadius: '6px', fontSize: '12px', color: 'var(--ledger)', border: '1px solid #DCFCE7' }}>
                        <b>↳ Platform Response:</b> "{t.reply}"
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        className="btn secondary small btn-mobile-full"
                        onClick={() => setSelectedTicket(t)}
                      >
                        View Full Thread
                      </button>
                      {t.status !== 'resolved' && (
                        <button
                          type="button"
                          className="btn green small btn-mobile-full"
                          style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}
                          onClick={() => setResolvingTicket(t)}
                        >
                          ✓ Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL 1: RAISE SUPPORT TICKET */}
      {isNewTicketOpen && (
        <div className="modal-backdrop" onClick={() => setIsNewTicketOpen(false)}>
          <div className="modal" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LifeBuoy size={20} color="var(--brass)" />
                Raise Support Ticket
              </h3>
              <button type="button" className="modal-close" onClick={() => setIsNewTicketOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateTicketSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ background: 'var(--surface-sunken)', padding: '10px 14px', borderRadius: '6px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                  This ticket will be dispatched straight to the <b>Propithub Platform Admin Team</b>. You can review updates and resolve the ticket whenever satisfied.
                </div>

                <div className="field">
                  <label>Subject / Topic Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Question regarding automated rent reminder gateway"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label>Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value as any)}>
                      <option value="technical">Technical / Platform Bug</option>
                      <option value="billing">Billing &amp; Invoices</option>
                      <option value="subscription">Subscription Plan</option>
                      <option value="leasing">Lease Agreement / Legal</option>
                      <option value="feature_request">Feature Request</option>
                      <option value="general">General Support</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Priority</label>
                    <select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                      <option value="low">Low — General inquiry</option>
                      <option value="medium">Medium — Standard help</option>
                      <option value="high">High — Impeding operations</option>
                      <option value="urgent">Urgent — Critical blocker</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Detailed Description *</label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Provide specific details, unit IDs, agreement numbers, or error details to help the admin team assist you faster..."
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-foot">
                <button type="button" className="btn secondary" onClick={() => setIsNewTicketOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn brass ${isSubmitting ? 'btn-processing' : ''}`}
                  disabled={isSubmitting}
                >
                  <ButtonProcessing
                    loading={isSubmitting}
                    loadingText="Submitting..."
                    defaultText="Submit Ticket"
                  />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: VIEW TICKET DETAILS & THREAD */}
      {selectedTicket && (
        <div className="modal-backdrop" onClick={() => setSelectedTicket(null)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--ink-soft)' }}>
                  #{selectedTicket.id}
                </div>
                <h3 style={{ margin: '2px 0 0' }}>{selectedTicket.topic}</h3>
              </div>
              <button type="button" className="modal-close" onClick={() => setSelectedTicket(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', padding: '10px 14px', background: 'var(--surface-sunken)', borderRadius: '6px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: 'var(--ink-soft)' }}>Category: </span>
                  <b>{getCategoryLabel(selectedTicket.category)}</b>
                </div>
                <div>
                  <span style={{ color: 'var(--ink-soft)' }}>Priority: </span>
                  {getPriorityBadge(selectedTicket.priority)}
                </div>
                <div>
                  <span style={{ color: 'var(--ink-soft)' }}>Status: </span>
                  <span className={`badge ${selectedTicket.status === 'resolved' ? 'green' : 'amber'}`}>
                    {selectedTicket.status === 'resolved' ? '✓ Resolved' : 'Open'}
                  </span>
                </div>
              </div>

              {/* Owner Issue Description */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  YOUR REQUEST:
                </div>
                <div style={{ background: '#F8F9FA', padding: '14px', borderRadius: '8px', border: '1px solid var(--line)', fontSize: '13.5px', lineHeight: '1.5' }}>
                  {selectedTicket.detail || selectedTicket.topic}
                </div>
                {selectedTicket.createdAt && (
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                    Submitted on {new Date(selectedTicket.createdAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Platform Admin Response Box */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', marginBottom: '6px' }}>
                  ADMINISTRATIVE RESPONSE:
                </div>
                {selectedTicket.reply ? (
                  <div style={{ background: '#F0FDF4', padding: '14px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: '#166534', fontWeight: 600, fontSize: '13px' }}>
                      <ShieldCheck size={16} /> Propithub Platform Admin Reply
                    </div>
                    <div style={{ fontSize: '13.5px', color: '#14532D', lineHeight: '1.5' }}>
                      {selectedTicket.reply}
                    </div>
                    {selectedTicket.repliedAt && (
                      <div style={{ fontSize: '11px', color: '#166534', marginTop: '6px' }}>
                        Replied on {new Date(selectedTicket.repliedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ background: '#FEF3C7', padding: '12px 14px', borderRadius: '6px', color: '#B45309', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} /> Awaiting administrative review. The platform support desk typically responds within a few hours.
                  </div>
                )}
              </div>

              {/* Resolution Status Box */}
              {selectedTicket.status === 'resolved' && (
                <div style={{ background: '#DCFCE7', padding: '12px 14px', borderRadius: '6px', color: '#15803D', fontSize: '12.5px' }}>
                  ✓ <b>Ticket Closed:</b> {selectedTicket.resolutionNotes || 'This issue has been resolved by the property owner.'}
                  {selectedTicket.resolvedAt && (
                    <span style={{ display: 'block', fontSize: '11px', marginTop: '2px' }}>
                      Resolved at: {new Date(selectedTicket.resolvedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="modal-foot">
              <button type="button" className="btn secondary" onClick={() => setSelectedTicket(null)}>
                Close
              </button>
              {selectedTicket.status !== 'resolved' && (
                <button
                  type="button"
                  className="btn green"
                  style={{ background: '#15803D', color: '#FFF' }}
                  onClick={() => {
                    setResolvingTicket(selectedTicket);
                    setSelectedTicket(null);
                  }}
                >
                  ✓ Mark Resolved by Owner
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: OWNER CONFIRM RESOLUTION */}
      {resolvingTicket && (
        <div className="modal-backdrop" onClick={() => setResolvingTicket(null)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#15803D' }}>
                <CheckCircle2 size={20} />
                Resolve Ticket #{resolvingTicket.id}
              </h3>
              <button type="button" className="modal-close" onClick={() => setResolvingTicket(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink)' }}>
                Are you satisfied with the resolution for <b>"{resolvingTicket.topic}"</b>?
                Marking this ticket resolved closes the thread.
              </p>

              <div className="field">
                <label>Resolution Notes / Feedback (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Issue verified fixed. Thank you for the prompt assistance."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-foot">
              <button type="button" className="btn secondary" onClick={() => setResolvingTicket(null)}>
                Keep Ticket Open
              </button>
              <button
                type="button"
                className="btn green"
                style={{ background: '#15803D', color: '#FFF' }}
                onClick={handleResolveTicketConfirm}
              >
                Confirm &amp; Close Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
