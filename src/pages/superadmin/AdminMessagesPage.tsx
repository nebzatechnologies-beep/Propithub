import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { CommunicationLog, CommunicationCategory, CommunicationChannel, InAppNotification, Announcement } from '../../types';
import { isFirebaseConfigured, db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import {
  MessageSquare,
  Mail,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  X,
  FileText,
  Key,
  CreditCard,
  Wrench,
  ShieldAlert,
  Send,
  Search,
  Building2,
  Server,
  User,
  Plus,
} from 'lucide-react';

export const AdminMessagesPage: React.FC = () => {
  const { state, updateState, logCommunication, showToast } = useAppData();

  // All communication logs across the entire platform
  const allLogs = useMemo(() => {
    return state.communicationLogs || [];
  }, [state.communicationLogs]);

  // Registered Owners list for the dropdown filter
  const ownerUsers = useMemo(() => {
    return (state.users || []).filter((u) => u.role === 'owner');
  }, [state.users]);

  // Primary Scope Filter: 'all' | 'admin_only' | specific ownerId
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectedMessage, setInspectedMessage] = useState<CommunicationLog | null>(null);

  // Broadcast State
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [broadcastAudience, setBroadcastAudience] = useState<'all_owners' | 'all_tenants' | 'all_users' | 'selected_people'>('all_owners');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [recipientSearchQuery, setRecipientSearchQuery] = useState('');
  const [recipientRoleFilter, setRecipientRoleFilter] = useState<'all' | 'owner' | 'tenant' | 'staff' | 'manager'>('all');
  const [broadcastCategory, setBroadcastCategory] = useState<CommunicationCategory>('announcement');
  const [broadcastChannels, setBroadcastChannels] = useState<CommunicationChannel[]>(['in_app', 'email']);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Candidate pool for individual / multi-select broadcast
  const candidateRecipients = useMemo(() => {
    const list: Array<{ id: string; name: string; role: 'owner' | 'tenant' | 'manager' | 'staff'; email?: string; phone?: string; detail?: string }> = [];
    const seen = new Set<string>();

    (state.users || []).forEach((u) => {
      if (u.role === 'superadmin') return;
      seen.add(u.id);
      list.push({
        id: u.id,
        name: u.displayName || u.email || 'User',
        role: (u.role as any) || 'tenant',
        email: u.email,
        phone: u.phone,
        detail: u.role === 'owner' ? 'Property Owner' : u.role === 'manager' ? 'Property Manager' : u.role === 'staff' ? 'Field Staff' : 'Resident',
      });
    });

    (state.tenants || []).forEach((t) => {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        list.push({
          id: t.id,
          name: t.name || 'Tenant',
          role: 'tenant',
          email: t.email,
          phone: t.phone,
          detail: t.unit ? `Unit ${t.unit} • ${t.propertyName || 'Resident'}` : 'Resident',
        });
      }
    });

    return list;
  }, [state.users, state.tenants]);

  const filteredCandidates = useMemo(() => {
    const q = recipientSearchQuery.toLowerCase().trim();
    return candidateRecipients.filter((c) => {
      const matchesRole = recipientRoleFilter === 'all' || c.role === recipientRoleFilter;
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.detail && c.detail.toLowerCase().includes(q));
      return matchesRole && matchesSearch;
    });
  }, [candidateRecipients, recipientSearchQuery, recipientRoleFilter]);

  const handleSendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      showToast('Please enter both a title and message body.');
      return;
    }
    if (broadcastChannels.length === 0) {
      showToast('Please select at least one delivery channel.');
      return;
    }
    if (broadcastAudience === 'selected_people' && selectedRecipientIds.length === 0) {
      showToast('Please search and select at least one recipient.');
      return;
    }
    setIsSending(true);
    try {
      let targets: Array<{ id: string; name: string; role: 'owner' | 'tenant' | 'manager' | 'staff' | 'superadmin'; email?: string; phone?: string }> = [];

      if (broadcastAudience === 'all_owners') {
        targets = (state.users || []).filter((u) => u.role === 'owner').map((u) => ({
          id: u.id,
          name: u.displayName || u.email,
          role: 'owner' as const,
          email: u.email,
          phone: u.phone,
        }));
      } else if (broadcastAudience === 'all_tenants') {
        targets = (state.tenants || []).map((t) => ({
          id: t.id,
          name: t.name,
          role: 'tenant' as const,
          email: t.email,
          phone: t.phone,
        }));
      } else if (broadcastAudience === 'all_users') {
        const userMap = new Map<string, any>();
        (state.users || []).forEach((u) => userMap.set(u.id, { id: u.id, name: u.displayName || u.email, role: u.role || 'tenant', email: u.email, phone: u.phone }));
        (state.tenants || []).forEach((t) => {
          if (!userMap.has(t.id)) {
            userMap.set(t.id, { id: t.id, name: t.name, role: 'tenant', email: t.email, phone: t.phone });
          }
        });
        targets = Array.from(userMap.values());
      } else if (broadcastAudience === 'selected_people') {
        targets = candidateRecipients.filter((c) => selectedRecipientIds.includes(c.id));
      }

      if (targets.length === 0) {
        showToast('No target recipients found.');
        setIsSending(false);
        return;
      }

      const newNotifs: InAppNotification[] = [];

      for (const tgt of targets) {
        if (broadcastChannels.includes('in_app')) {
          const notif: InAppNotification = {
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            userId: tgt.id,
            title: broadcastTitle.trim(),
            body: broadcastBody.trim(),
            link: tgt.role === 'owner' ? '/owner/dashboard' : '/tenant/dashboard',
            isRead: false,
            createdAt: new Date().toISOString(),
          };
          newNotifs.push(notif);
          if (isFirebaseConfigured) {
            setDoc(doc(db, 'notifications', notif.id), notif).catch(console.warn);
          }
        }

        await logCommunication({
          type: 'platform_broadcast',
          category: broadcastCategory,
          title: broadcastTitle.trim(),
          body: broadcastBody.trim(),
          channels: broadcastChannels,
          recipientId: tgt.id,
          recipientName: tgt.name,
          recipientRole: tgt.role as any,
          recipientContact: {
            email: tgt.email,
            phone: tgt.phone,
          },
          senderId: 'superadmin',
          senderName: 'Platform Superadmin',
          senderRole: 'superadmin',
          deliveryStatus: {
            inApp: broadcastChannels.includes('in_app') ? 'delivered' : 'not_requested',
            email: broadcastChannels.includes('email') ? 'delivered' : 'not_requested',
            sms: broadcastChannels.includes('sms') ? 'delivered' : 'not_requested',
          },
        });
      }

      const targetRoles: ('tenant' | 'staff' | 'manager' | 'owner')[] =
        broadcastAudience === 'all_owners'
          ? ['owner']
          : broadcastAudience === 'all_tenants'
          ? ['tenant']
          : ['owner', 'tenant', 'manager', 'staff'];

      const anncCategory =
        broadcastCategory === 'maintenance'
          ? 'maintenance'
          : broadcastCategory === 'dispute'
          ? 'policy'
          : broadcastCategory === 'subscription' || broadcastCategory === 'rent'
          ? 'policy'
          : 'general';

      const newAnnouncement: Announcement = {
        id: `annc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ownerId: 'superadmin',
        authorName: 'Platform Superadmin',
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        category: anncCategory,
        priority: 'important',
        status: 'published',
        targetScope: {
          allProperties: true,
          propertyIds: [],
          targetRoles,
          mode: broadcastAudience === 'selected_people' ? 'specific_people' : 'all',
          targetUserIds: broadcastAudience === 'selected_people' ? selectedRecipientIds : undefined,
        },
        isPinned: true,
        requireAcknowledgment: false,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (isFirebaseConfigured) {
        setDoc(doc(db, 'announcements', newAnnouncement.id), newAnnouncement).catch(console.warn);
      }

      updateState((prev) => ({
        ...prev,
        announcements: [newAnnouncement, ...(prev.announcements || [])],
        notifications: [...(prev.notifications || []), ...newNotifs],
      }));

      showToast(`✓ Broadcast dispatched successfully to ${targets.length} user(s).`);
      setIsBroadcastOpen(false);
      setBroadcastTitle('');
      setBroadcastBody('');
    } catch (err) {
      console.error('Broadcast error:', err);
      showToast('Failed to send broadcast.');
    } finally {
      setIsSending(false);
    }
  };

  // Filtered dataset
  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      // 1. Primary Scope Filter ("admin should have everything plus a filter for his")
      if (scopeFilter === 'admin_only') {
        const isAdminLog =
          log.senderRole === 'superadmin' ||
          log.category === 'subscription' ||
          !log.ownerId ||
          log.recipientRole === 'owner';
        if (!isAdminLog) return false;
      } else if (scopeFilter !== 'all') {
        // Specific Owner filter
        if (log.ownerId !== scopeFilter) return false;
      }

      // 2. Category filter
      if (selectedCategory !== 'all' && log.category !== selectedCategory) {
        return false;
      }

      // 3. Channel filter
      if (selectedChannel !== 'all' && !log.channels?.includes(selectedChannel as CommunicationChannel)) {
        return false;
      }

      // 4. Status filter
      if (selectedStatus !== 'all') {
        const statuses = Object.values(log.deliveryStatus || {});
        if (selectedStatus === 'delivered' && !statuses.includes('delivered')) return false;
        if (selectedStatus === 'failed' && !statuses.some((s) => s && s.startsWith('failed'))) return false;
        if (selectedStatus === 'skipped' && !statuses.includes('skipped')) return false;
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRecipient = log.recipientName?.toLowerCase().includes(q) ||
          log.recipientContact?.email?.toLowerCase().includes(q) ||
          log.recipientContact?.phone?.toLowerCase().includes(q);
        const matchesOwner = log.ownerName?.toLowerCase().includes(q) || log.ownerId?.toLowerCase().includes(q);
        const matchesContent = log.title?.toLowerCase().includes(q) || log.body?.toLowerCase().includes(q);
        const matchesSid = log.smsSid?.toLowerCase().includes(q);
        if (!matchesRecipient && !matchesOwner && !matchesContent && !matchesSid) {
          return false;
        }
      }

      return true;
    });
  }, [allLogs, scopeFilter, selectedCategory, selectedChannel, selectedStatus, searchQuery]);

  // KPI Metrics
  const stats = useMemo(() => {
    const total = allLogs.length;
    let smsCount = 0;
    let emailCount = 0;
    let adminOnlyCount = 0;
    let deliveredCount = 0;

    allLogs.forEach((log) => {
      if (log.channels?.includes('sms')) smsCount++;
      if (log.channels?.includes('email')) emailCount++;
      if (log.senderRole === 'superadmin' || log.category === 'subscription' || !log.ownerId) {
        adminOnlyCount++;
      }
      const statuses = Object.values(log.deliveryStatus || {});
      if (statuses.includes('delivered')) deliveredCount++;
    });

    const successRate = total > 0 ? Math.round((deliveredCount / total) * 100) : 100;
    return { total, smsCount, emailCount, adminOnlyCount, successRate };
  }, [allLogs]);

  const getCategoryBadge = (category: CommunicationCategory) => {
    switch (category) {
      case 'rent':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#dbeafe', color: '#1e40af', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            <CreditCard size={12} /> Rent & Billing
          </span>
        );
      case 'leasing':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            <Key size={12} /> Lease Agreement
          </span>
        );
      case 'deposit':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            <FileText size={12} /> Deposit Settlement
          </span>
        );
      case 'maintenance':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            <Wrench size={12} /> Maintenance
          </span>
        );
      case 'subscription':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#e0e7ff', color: '#3730a3', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            <Server size={12} /> Platform SaaS
          </span>
        );
      case 'dispute':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#ede9fe', color: '#5b21b6', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            <ShieldAlert size={12} /> Disputes
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-sunken)', color: 'var(--ink-soft)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            <MessageSquare size={12} /> Broadcast
          </span>
        );
    }
  };

  const getStatusBadge = (statusObj: CommunicationLog['deliveryStatus']) => {
    const statuses = Object.values(statusObj || {});
    if (statuses.includes('delivered')) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 600, fontSize: '12px' }}>
          <CheckCircle2 size={14} /> Delivered
        </span>
      );
    }
    if (statuses.some((s) => s && s.startsWith('failed'))) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontWeight: 600, fontSize: '12px' }}>
          <XCircle size={14} /> Failed
        </span>
      );
    }
    if (statuses.includes('skipped')) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#d97706', fontWeight: 600, fontSize: '12px' }}>
          <AlertTriangle size={14} /> Skipped
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--ink-soft)', fontSize: '12px' }}>
        Pending
      </span>
    );
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: 'var(--ink-base)' }}>
            Platform Communications & Outbound Audit Hub
          </h1>
        </div>
        <button
          type="button"
          className="btn brass btn-mobile-full"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          onClick={() => setIsBroadcastOpen(true)}
        >
          <Plus size={16} /> Broadcast Message
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="panel" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: '#eff6ff', color: '#2563eb', padding: '12px', borderRadius: '8px' }}>
            <Send size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase' }}>Total Platform Dispatches</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink-base)' }}>{stats.total}</div>
          </div>
        </div>

        <div className="panel" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '12px', borderRadius: '8px' }}>
            <Smartphone size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase' }}>Twilio SMS</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink-base)' }}>{stats.smsCount}</div>
          </div>
        </div>

        <div className="panel" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: '#faf5ff', color: '#9333ea', padding: '12px', borderRadius: '8px' }}>
            <Mail size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase' }}>SendGrid Emails</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink-base)' }}>{stats.emailCount}</div>
          </div>
        </div>

        <div className="panel" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: '#fdf4ff', color: '#c026d3', padding: '12px', borderRadius: '8px' }}>
            <Server size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase' }}>Admin & SaaS Notices</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink-base)' }}>{stats.adminOnlyCount}</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar with Dedicated "Filter For His" scope */}
      <div className="panel" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', flex: 1, minWidth: '300px' }}>
            
            {/* Dedicated Primary Filter: Everything vs Platform/Admin Only vs Specific Owner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Scope:</span>
              <select
                value={scopeFilter}
                onChange={(e) => setScopeFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1.5px solid #2563eb',
                  background: '#eff6ff',
                  color: '#1e40af',
                }}
              >
                <option value="all">All Platform Traffic (Everything)</option>
                <option value="admin_only">Platform & Admin Only (My Notices)</option>
                <optgroup label="Filter by Specific Landlord / Owner">
                  {ownerUsers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.displayName || o.email} ({o.email})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Search Box */}
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '300px' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
              <input
                type="text"
                placeholder="Search recipient, SID, or text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border)' }}
              />
            </div>

            {/* Category selector */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <option value="all">All Categories</option>
              <option value="rent">Rent & Billing</option>
              <option value="leasing">Lease Agreements</option>
              <option value="deposit">Deposit Settlements</option>
              <option value="maintenance">Maintenance Tickets</option>
              <option value="subscription">Platform SaaS</option>
              <option value="dispute">Disputes</option>
              <option value="custom">Custom Broadcasts</option>
            </select>

            {/* Channel selector */}
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <option value="all">All Channels</option>
              <option value="sms">Twilio SMS</option>
              <option value="email">SendGrid Email</option>
              <option value="in_app">In-App Notification</option>
            </select>

            {/* Status selector */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <option value="all">All Statuses</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>

          {(scopeFilter !== 'all' || selectedCategory !== 'all' || selectedChannel !== 'all' || selectedStatus !== 'all' || searchQuery) && (
            <button
              type="button"
              className="btn secondary small"
              onClick={() => {
                setScopeFilter('all');
                setSelectedCategory('all');
                setSelectedChannel('all');
                setSelectedStatus('all');
                setSearchQuery('');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="panel">
        <div className="desktop-table-view">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: '130px' }}>Time</th>
                  <th style={{ minWidth: '130px' }}>Category</th>
                  <th style={{ minWidth: '100px' }}>Channels</th>
                  <th style={{ minWidth: '160px' }}>Owner Portfolio</th>
                  <th style={{ minWidth: '170px' }}>Recipient & Contact</th>
                  <th>Message Content</th>
                  <th style={{ minWidth: '110px' }}>Status</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ink-soft)' }}>
                      <MessageSquare size={36} style={{ margin: '0 auto 12px auto', opacity: 0.3 }} />
                      <div style={{ fontSize: '15px', fontWeight: 600 }}>No communication dispatches recorded</div>
                      <div style={{ fontSize: '13px', marginTop: '4px' }}>
                        {allLogs.length === 0
                          ? 'Automated Cloud Function triggers will stream communication logs here in real-time.'
                          : 'No messages match current filter criteria.'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const dateStr = log.createdAt
                      ? new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                      : 'Recent';

                    const isPlatformNotice = log.senderRole === 'superadmin' || log.category === 'subscription' || !log.ownerId;

                    return (
                      <tr key={log.id}>
                        <td style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                          {dateStr}
                        </td>
                        <td>
                          {getCategoryBadge(log.category)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {log.channels?.includes('sms') && (
                              <span title="Twilio SMS" style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                                SMS
                              </span>
                            )}
                            {log.channels?.includes('email') && (
                              <span title="SendGrid Email" style={{ background: '#f3e8ff', color: '#7e22ce', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                                Email
                              </span>
                            )}
                            {log.channels?.includes('in_app') && (
                              <span title="In-App" style={{ background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                                App
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          {isPlatformNotice ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-sunken)', color: 'var(--ink)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                              <Server size={11} /> Platform System
                            </span>
                          ) : (
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--ink-base)' }}>
                                {log.ownerName || log.ownerId || 'Assigned Landlord'}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                {log.propertyName ? log.propertyName : 'Portfolio Property'}
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink-base)' }}>
                            {log.recipientName || 'Resident'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                            {log.recipientContact?.phone || log.recipientContact?.email || ''}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink-base)' }}>
                            {log.title}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px', maxHeight: '36px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {log.body}
                          </div>
                        </td>
                        <td>
                          {getStatusBadge(log.deliveryStatus)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => setInspectedMessage(log)}
                            title="Inspect raw payload and details"
                            style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={13} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="mobile-card-view" style={{ padding: '12px' }}>
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-soft)' }}>
              No messages match current filter criteria.
            </div>
          ) : (
            filteredLogs.map((log) => {
              const dateStr = log.createdAt
                ? new Date(log.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                : 'Recent';
              const isPlatformNotice = log.senderRole === 'superadmin' || log.category === 'subscription' || !log.ownerId;

              return (
                <div key={log.id} className="staff-card" style={{ padding: '14px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                    <div>
                      {getCategoryBadge(log.category)}
                    </div>
                    <div>
                      {getStatusBadge(log.deliveryStatus)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '11px', color: 'var(--ink-soft)' }}>
                    <span>{dateStr}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {log.channels?.includes('sms') && (
                        <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>SMS</span>
                      )}
                      {log.channels?.includes('email') && (
                        <span style={{ background: '#f3e8ff', color: '#7e22ce', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>Email</span>
                      )}
                      {log.channels?.includes('in_app') && (
                        <span style={{ background: '#fef3c7', color: '#b45309', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>App</span>
                      )}
                    </div>
                  </div>

                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)' }}>
                      To: {log.recipientName || 'Resident'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                      {log.recipientContact?.phone || log.recipientContact?.email || ''}
                    </div>
                  </div>

                  {isPlatformNotice ? (
                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-sunken)', color: 'var(--ink)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                        <Server size={11} /> Platform System Notice
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '8px' }}>
                      <b>Owner:</b> {log.ownerName || log.ownerId || 'Landlord'} {log.propertyName && `(${log.propertyName})`}
                    </div>
                  )}

                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)', marginBottom: '4px' }}>
                    {log.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '12px', lineHeight: 1.4 }}>
                    {log.body}
                  </div>

                  <button
                    type="button"
                    className="btn secondary small btn-mobile-full"
                    onClick={() => setInspectedMessage(log)}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <Eye size={13} /> Inspect Diagnostics
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Technical Inspection Modal */}
      {inspectedMessage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            className="panel"
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '8px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Server size={18} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Outbound Dispatch Diagnostic Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedMessage(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {/* Diagnostic Grid */}
              <div
                style={{
                  background: 'var(--surface-sunken, #f8fafc)',
                  padding: '14px',
                  borderRadius: '6px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                  gap: '12px',
                  marginBottom: '18px',
                  fontSize: '12px',
                }}
              >
                <div>
                  <div style={{ color: 'var(--ink-soft)' }}>Dispatch ID</div>
                  <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{inspectedMessage.id}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--ink-soft)' }}>Timestamp</div>
                  <div style={{ fontWeight: 600 }}>{new Date(inspectedMessage.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--ink-soft)' }}>Recipient ({inspectedMessage.recipientRole})</div>
                  <div style={{ fontWeight: 600 }}>{inspectedMessage.recipientName}</div>
                  <div style={{ color: 'var(--ink-soft)' }}>{inspectedMessage.recipientContact?.phone || inspectedMessage.recipientContact?.email || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--ink-soft)' }}>Sender ({inspectedMessage.senderRole})</div>
                  <div style={{ fontWeight: 600 }}>{inspectedMessage.senderName} ({inspectedMessage.senderId})</div>
                </div>
                <div>
                  <div style={{ color: 'var(--ink-soft)' }}>Owner / Portfolio Scoping</div>
                  <div style={{ fontWeight: 600 }}>{inspectedMessage.ownerName || inspectedMessage.ownerId || 'Platform-wide (No Owner Scoping)'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--ink-soft)' }}>Channels Active</div>
                  <div style={{ fontWeight: 600, textTransform: 'uppercase' }}>{inspectedMessage.channels?.join(', ')}</div>
                </div>
                {inspectedMessage.smsSid && (
                  <div>
                    <div style={{ color: 'var(--ink-soft)' }}>Twilio Message SID</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#2563eb' }}>{inspectedMessage.smsSid}</div>
                  </div>
                )}
                {inspectedMessage.errorMessage && (
                  <div style={{ gridColumn: 'span 2', color: '#dc2626' }}>
                    <div style={{ fontWeight: 700 }}>Delivery Warning / Error:</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px' }}>{inspectedMessage.errorMessage}</div>
                  </div>
                )}
              </div>

              {/* Title / Subject */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Subject / Headline</label>
                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px', color: 'var(--ink-base)' }}>{inspectedMessage.title}</div>
              </div>

              {/* Body Content */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Message Body (SMS / Text)</label>
                <div
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '14px',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    marginTop: '4px',
                    color: '#1e293b',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {inspectedMessage.body}
                </div>
              </div>

              {/* Rendered HTML Email Preview */}
              {inspectedMessage.htmlContent && (
                <div style={{ marginTop: '18px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Rendered SendGrid HTML Email Voucher</label>
                  <div
                    style={{
                      marginTop: '6px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      maxHeight: '260px',
                      overflowY: 'auto',
                    }}
                    dangerouslySetInnerHTML={{ __html: inspectedMessage.htmlContent }}
                  />
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', textAlign: 'right' }}>
              <button type="button" className="btn secondary small btn-mobile-full" onClick={() => setInspectedMessage(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Platform Broadcast Modal */}
      {isBroadcastOpen && (
        <div className="modal-backdrop" onClick={() => setIsBroadcastOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Compose Platform Broadcast</h3>
              <button type="button" className="btn secondary small" onClick={() => setIsBroadcastOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label>Target Audience</label>
                <select
                  value={broadcastAudience}
                  onChange={(e) => setBroadcastAudience(e.target.value as any)}
                >
                  <option value="all_owners">All Property Owners ({ownerUsers.length} registered owners)</option>
                  <option value="all_tenants">All Active Tenants ({(state.tenants || []).length} tenants)</option>
                  <option value="all_users">Entire Platform (All Users & Residents)</option>
                  <option value="selected_people">🎯 Specific Individuals & Custom Groups ({selectedRecipientIds.length} selected)</option>
                </select>
              </div>

              {/* Dynamic Searchable Recipient Selector */}
              {broadcastAudience === 'selected_people' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--surface-sunken, #f8fafc)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                      Search & Select People ({selectedRecipientIds.length} selected)
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn secondary small"
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                        onClick={() => {
                          const idsToAdd = filteredCandidates.map((c) => c.id);
                          setSelectedRecipientIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
                        }}
                      >
                        Select All Filtered ({filteredCandidates.length})
                      </button>
                      {selectedRecipientIds.length > 0 && (
                        <button
                          type="button"
                          className="btn secondary small"
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                          onClick={() => setSelectedRecipientIds([])}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter & Search Controls */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Search candidate by name, email, phone, unit..."
                      value={recipientSearchQuery}
                      onChange={(e) => setRecipientSearchQuery(e.target.value)}
                      style={{ flex: '1 1 180px', minWidth: '140px', fontSize: '12.5px', padding: '6px 10px' }}
                    />
                    <select
                      value={recipientRoleFilter}
                      onChange={(e) => setRecipientRoleFilter(e.target.value as any)}
                      style={{ minWidth: '115px', fontSize: '12.5px', padding: '6px 10px' }}
                    >
                      <option value="all">All Roles</option>
                      <option value="owner">Owners</option>
                      <option value="tenant">Tenants</option>
                      <option value="manager">Managers</option>
                      <option value="staff">Staff</option>
                    </select>
                  </div>

                  {/* Selected Chips */}
                  {selectedRecipientIds.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '80px', overflowY: 'auto', padding: '6px', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      {candidateRecipients.filter((c) => selectedRecipientIds.includes(c.id)).map((c) => (
                        <span
                          key={c.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'var(--surface-hover)',
                            border: '1px solid var(--line)',
                            borderRadius: '12px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: 500,
                            color: 'var(--ink)',
                          }}
                        >
                          <span>{c.name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--ink-soft)' }}>({c.role})</span>
                          <button
                            type="button"
                            onClick={() => setSelectedRecipientIds((prev) => prev.filter((id) => id !== c.id))}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '11px', color: 'var(--ink-soft)' }}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Candidate List with Checkboxes */}
                  <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px' }}>
                    {filteredCandidates.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '16px', fontSize: '12px', color: 'var(--ink-soft)' }}>
                        No recipients match the search query.
                      </div>
                    ) : (
                      filteredCandidates.map((c) => {
                        const isSelected = selectedRecipientIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              setSelectedRecipientIds((prev) =>
                                isSelected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                              );
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              background: isSelected ? 'var(--surface-hover)' : 'transparent',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                style={{ cursor: 'pointer' }}
                              />
                              <div>
                                <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)' }}>{c.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                  {c.email || c.phone || 'No direct contact'} {c.detail ? `• ${c.detail}` : ''}
                                </div>
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '10px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.4px',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background:
                                  c.role === 'owner' ? '#FEF3C7' : c.role === 'tenant' ? '#E0F2FE' : '#F1F5F9',
                                color:
                                  c.role === 'owner' ? '#92400E' : c.role === 'tenant' ? '#0369A1' : '#475569',
                              }}
                            >
                              {c.role}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div className="field">
                  <label>Broadcast Category</label>
                  <select
                    value={broadcastCategory}
                    onChange={(e) => setBroadcastCategory(e.target.value as any)}
                  >
                    <option value="announcement">Platform Announcement</option>
                    <option value="subscription">Billing / Subscription Notice</option>
                    <option value="custom">General Service Update</option>
                  </select>
                </div>

                <div className="field">
                  <label>Dispatched Channels</label>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', height: '38px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={broadcastChannels.includes('in_app')}
                        onChange={(e) => {
                          if (e.target.checked) setBroadcastChannels((prev) => [...prev, 'in_app']);
                          else setBroadcastChannels((prev) => prev.filter((c) => c !== 'in_app'));
                        }}
                      />
                      In-App
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={broadcastChannels.includes('email')}
                        onChange={(e) => {
                          if (e.target.checked) setBroadcastChannels((prev) => [...prev, 'email']);
                          else setBroadcastChannels((prev) => prev.filter((c) => c !== 'email'));
                        }}
                      />
                      SendGrid Email
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={broadcastChannels.includes('sms')}
                        onChange={(e) => {
                          if (e.target.checked) setBroadcastChannels((prev) => [...prev, 'sms']);
                          else setBroadcastChannels((prev) => prev.filter((c) => c !== 'sms'));
                        }}
                      />
                      Twilio SMS
                    </label>
                  </div>
                </div>
              </div>

              <div className="field">
                <label>Broadcast Title / Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Scheduled System Maintenance & Security Enhancements"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Message Body Content</label>
                <textarea
                  rows={5}
                  placeholder="Enter the broadcast message to send across selected channels..."
                  value={broadcastBody}
                  onChange={(e) => setBroadcastBody(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <button
                type="button"
                className="btn secondary btn-mobile-full"
                onClick={() => setIsBroadcastOpen(false)}
                disabled={isSending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn brass btn-mobile-full"
                onClick={handleSendBroadcast}
                disabled={isSending}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Send size={15} />
                {isSending ? 'Broadcasting...' : 'Broadcast to Selected Users'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
