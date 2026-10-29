import React, { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import {
  Announcement,
  AnnouncementCategory,
  AnnouncementPriority,
  AnnouncementStatus,
  InAppNotification,
} from '../../types';
import {
  Megaphone,
  Pin,
  CheckCircle2,
  Clock,
  FileEdit,
  Trash2,
  Archive,
  Search,
  Filter,
  Plus,
  Eye,
  AlertTriangle,
  Flame,
  Wrench,
  ShieldCheck,
  Sparkles,
  Users,
  Building,
  Calendar,
  X,
  Send,
  Check,
  ChevronRight,
  Info,
  Layers,
} from 'lucide-react';
import { ButtonProcessing } from '../../components/common/Spinner';

export const OwnerMessagesPage: React.FC = () => {
  const { state, updateState, saveAnnouncement, deleteAnnouncement, togglePinAnnouncement, archiveAnnouncement, logCommunication, showToast } = useAppData();
  const { user } = useAuth();

  // 1. Owner Identification & Scoping
  const ownerIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (user?.id) ids.add(user.id);
    if ((user as any)?.uid) ids.add((user as any).uid);
    if (state.currentUserId) ids.add(state.currentUserId);
    const ownerEntry = state.users?.find((u) => u.id === user?.id || u.email === user?.email);
    if (ownerEntry?.id) ids.add(ownerEntry.id);
    return ids;
  }, [user, state.currentUserId, state.users]);

  const currentOwnerId = user?.id || Array.from(ownerIdSet)[0] || 'owner';
  const currentOwnerName = user?.displayName || 'Property Management';

  // 2. Owner Properties, Tenants, and Staff
  const myProperties = useMemo(() => {
    return (state.properties || []).filter((p) => Boolean(p.ownerId) && ownerIdSet.has(p.ownerId));
  }, [state.properties, ownerIdSet]);

  const myTenants = useMemo(() => {
    const myPropIds = new Set(myProperties.map((p) => p.id));
    return (state.tenants || []).filter(
      (t) => (Boolean(t.ownerId) && ownerIdSet.has(t.ownerId!)) || (Boolean(t.propertyId) && myPropIds.has(t.propertyId!))
    );
  }, [state.tenants, ownerIdSet, myProperties]);

  const myTeam = useMemo(() => {
    const staff = (state.staff || []).filter((s) => Boolean(s.ownerId) && ownerIdSet.has(s.ownerId));
    const managers = (state.managers || []).filter((m) => Boolean(m.ownerId) && ownerIdSet.has(m.ownerId));
    return [...staff, ...managers];
  }, [state.staff, state.managers, ownerIdSet]);

  // Only show announcements that are explicitly owned by this owner.
  // Removed !a.ownerId catch-all — it exposed legacy/seed announcements to ALL owners.
  const ownerAnnouncements = useMemo(() => {
    return (state.announcements || []).filter(
      (a) =>
        (Boolean(a.ownerId) && ownerIdSet.has(a.ownerId)) ||
        a.ownerId === 'superadmin' ||
        a.targetScope?.targetRoles?.includes('owner')
    );
  }, [state.announcements, ownerIdSet]);

  // Status & Filter States
  const [activeTab, setActiveTab] = useState<'published' | 'scheduled' | 'draft' | 'archived'>('published');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('all');

  // Modals
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [inspectedAnnouncement, setInspectedAnnouncement] = useState<Announcement | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formCategory, setFormCategory] = useState<AnnouncementCategory>('general');
  const [formPriority, setFormPriority] = useState<AnnouncementPriority>('normal');
  const [formScopeType, setFormScopeType] = useState<'all' | 'specific' | 'specific_people'>('all');
  const [formSelectedPropertyId, setFormSelectedPropertyId] = useState('');
  const [formSelectedRecipientIds, setFormSelectedRecipientIds] = useState<string[]>([]);
  const [announcementSearchQuery, setAnnouncementSearchQuery] = useState('');
  const [announcementPropertyFilter, setAnnouncementPropertyFilter] = useState('all');
  const [formTargetRoles, setFormTargetRoles] = useState<('tenant' | 'staff' | 'manager')[]>(['tenant']);
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [formRequireAck, setFormRequireAck] = useState(false);
  const [formPublishMode, setFormPublishMode] = useState<'now' | 'scheduled' | 'draft'>('now');
  const [formScheduledDate, setFormScheduledDate] = useState('');
  const [formExpiresDate, setFormExpiresDate] = useState('');
  const [formSendSms, setFormSendSms] = useState(false);
  const [formSendEmail, setFormSendEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Candidate pool of tenants and staff for owner
  const ownerCandidates = useMemo(() => {
    const list: Array<{ id: string; name: string; role: 'tenant' | 'staff' | 'manager'; propertyId?: string; propertyName?: string; unit?: string; email?: string; phone?: string }> = [];

    // Tenants
    myTenants.forEach((t) => {
      const prop = state.properties.find((p) => p.id === t.propertyId);
      list.push({
        id: t.id,
        name: t.name,
        role: 'tenant',
        propertyId: t.propertyId,
        propertyName: prop?.name || t.propertyName || 'Property',
        unit: t.unit,
        email: t.email,
        phone: t.phone,
      });
    });

    // Staff
    (state.staff || []).filter((s) => Boolean(s.ownerId) && ownerIdSet.has(s.ownerId)).forEach((s) => {
      list.push({
        id: String(s.id),
        name: s.name,
        role: 'staff',
        propertyName: 'Maintenance Staff',
        email: s.email,
        phone: s.phone,
      });
    });

    // Managers
    (state.managers || []).filter((m) => Boolean(m.ownerId) && ownerIdSet.has(m.ownerId)).forEach((m) => {
      list.push({
        id: String(m.id),
        name: m.name,
        role: 'manager',
        propertyName: 'Property Manager',
        email: m.email,
        phone: m.phone,
      });
    });

    return list;
  }, [myTenants, state.staff, state.managers, ownerIdSet, state.properties]);

  const filteredOwnerCandidates = useMemo(() => {
    const q = announcementSearchQuery.toLowerCase().trim();
    return ownerCandidates.filter((c) => {
      const matchesProperty =
        announcementPropertyFilter === 'all' ||
        c.propertyId === announcementPropertyFilter;
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.unit && c.unit.toLowerCase().includes(q)) ||
        (c.propertyName && c.propertyName.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q));
      return matchesProperty && matchesSearch;
    });
  }, [ownerCandidates, announcementSearchQuery, announcementPropertyFilter]);

  // Open Editor
  const handleOpenEditor = (existing?: Announcement) => {
    if (existing) {
      setEditingAnnouncement(existing);
      setFormTitle(existing.title);
      setFormBody(existing.body);
      setFormCategory(existing.category);
      setFormPriority(existing.priority);
      const mode = existing.targetScope?.mode || (existing.targetScope?.targetUserIds?.length ? 'specific_people' : existing.targetScope?.allProperties ? 'all' : 'specific');
      setFormScopeType(mode);
      setFormSelectedPropertyId(existing.targetScope.propertyIds?.[0] || '');
      setFormSelectedRecipientIds(existing.targetScope.targetUserIds || []);
      setFormTargetRoles(
        (existing.targetScope.targetRoles?.filter((r): r is ('tenant' | 'staff' | 'manager') => r !== 'owner')) || ['tenant']
      );
      setFormIsPinned(existing.isPinned || false);
      setFormRequireAck(existing.requireAcknowledgment || false);
      setFormPublishMode(existing.status === 'scheduled' ? 'scheduled' : existing.status === 'draft' ? 'draft' : 'now');
      setFormScheduledDate(existing.scheduledFor ? existing.scheduledFor.substring(0, 16) : '');
      setFormExpiresDate(existing.expiresAt ? existing.expiresAt.substring(0, 16) : '');
      setFormSendSms(false);
      setFormSendEmail(false);
    } else {
      setEditingAnnouncement(null);
      setFormTitle('');
      setFormBody('');
      setFormCategory('general');
      setFormPriority('normal');
      setFormScopeType('all');
      setFormSelectedPropertyId(myProperties[0]?.id || '');
      setFormSelectedRecipientIds([]);
      setFormTargetRoles(['tenant']);
      setFormIsPinned(false);
      setFormRequireAck(false);
      setFormPublishMode('now');
      setFormScheduledDate('');
      setFormExpiresDate('');
      setFormSendSms(false);
      setFormSendEmail(false);
    }
    setAnnouncementSearchQuery('');
    setAnnouncementPropertyFilter('all');
    setIsEditorOpen(true);
  };

  // Submit Announcement
  const handleSaveAnnouncement = async (asDraftOverride = false) => {
    if (!formTitle.trim() || !formBody.trim()) {
      showToast('Please enter both an announcement title and message content.');
      return;
    }

    if (formScopeType === 'specific' && !formSelectedPropertyId) {
      showToast('Please select a target property.');
      return;
    }

    if (formScopeType === 'specific_people' && formSelectedRecipientIds.length === 0) {
      showToast('Please select at least one resident or recipient.');
      return;
    }

    if (formScopeType !== 'specific_people' && formTargetRoles.length === 0) {
      showToast('Please select at least one target audience role.');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const status: AnnouncementStatus = asDraftOverride
        ? 'draft'
        : formPublishMode === 'scheduled'
          ? 'scheduled'
          : formPublishMode === 'draft'
            ? 'draft'
            : 'published';

      const announcementId = editingAnnouncement ? editingAnnouncement.id : `ANN-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      const newAnnouncement: Announcement = {
        id: announcementId,
        ownerId: currentOwnerId,
        authorName: currentOwnerName,
        title: formTitle.trim(),
        body: formBody.trim(),
        category: formCategory,
        priority: formPriority,
        status,
        targetScope: {
          allProperties: formScopeType === 'all',
          propertyIds: formScopeType === 'specific' && formSelectedPropertyId ? [formSelectedPropertyId] : [],
          targetRoles: formTargetRoles,
          mode: formScopeType,
          targetUserIds: formScopeType === 'specific_people' ? formSelectedRecipientIds : undefined,
        },
        isPinned: formIsPinned,
        requireAcknowledgment: formRequireAck,
        acknowledgments: editingAnnouncement?.acknowledgments || [],
        publishedAt: status === 'published' ? (editingAnnouncement?.publishedAt || now) : '',
        scheduledFor: status === 'scheduled' && formScheduledDate ? new Date(formScheduledDate).toISOString() : undefined,
        expiresAt: formExpiresDate ? new Date(formExpiresDate).toISOString() : undefined,
        viewsCount: editingAnnouncement?.viewsCount || 0,
        createdAt: editingAnnouncement?.createdAt || now,
        updatedAt: now,
      };

      await saveAnnouncement(newAnnouncement);

      // If publishing immediately, dispatch in-app notifications to target residents/staff
      if (status === 'published' && (!editingAnnouncement || editingAnnouncement.status !== 'published')) {
        let recipientIds: string[] = [];

        if (formScopeType === 'specific_people') {
          recipientIds = formSelectedRecipientIds;
        } else {
          if (formTargetRoles.includes('tenant')) {
            const matchedTenants = formScopeType === 'all'
              ? myTenants
              : myTenants.filter((t) => t.propertyId === formSelectedPropertyId || !t.propertyId);
            matchedTenants.forEach((t) => recipientIds.push(t.id));
          }

          if (formTargetRoles.includes('staff') || formTargetRoles.includes('manager')) {
            myTeam.forEach((member) => recipientIds.push(String(member.id)));
          }
        }

        recipientIds = Array.from(new Set(recipientIds));

        if (recipientIds.length > 0) {
          const newNotifs: InAppNotification[] = recipientIds.map((recId) => ({
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            userId: recId,
            title: `📢 Announcement: ${formTitle.trim()}`,
            body: formBody.trim().substring(0, 160) + (formBody.trim().length > 160 ? '...' : ''),
            link: '/tenant/dashboard',
            isRead: false,
            createdAt: now,
          }));

          updateState((prev) => ({
            ...prev,
            notifications: [...(prev.notifications || []), ...newNotifs],
          }));
        }

        // If external SMS or Email dispatch requested, dispatch via admin gateways
        if (formSendSms || formSendEmail) {
          const channels: ('in_app' | 'email' | 'sms')[] = ['in_app'];
          if (formSendEmail) channels.push('email');
          if (formSendSms) channels.push('sms');

          const contacts: { id: string; name: string; phone?: string; email?: string; role: 'tenant' | 'staff' | 'manager' }[] = [];
          if (formTargetRoles.includes('tenant')) {
            const matchedTenants = formScopeType === 'all'
              ? myTenants
              : myTenants.filter((t) => t.propertyId === formSelectedPropertyId || !t.propertyId);
            matchedTenants.forEach((t) => contacts.push({ id: t.id, name: t.name, phone: t.phone, email: t.email, role: 'tenant' }));
          }
          if (formTargetRoles.includes('staff') || formTargetRoles.includes('manager')) {
            myTeam.forEach((member) => contacts.push({
              id: String(member.id),
              name: member.name,
              phone: member.phone,
              email: member.email,
              role: 'role' in member ? 'staff' : 'manager',
            }));
          }

          for (const c of contacts) {
            logCommunication({
              type: 'announcement_broadcast',
              category: 'announcement',
              recipientId: c.id,
              recipientName: c.name,
              recipientRole: c.role,
              recipientContact: {
                phone: c.phone,
                email: c.email,
              },
              senderId: user?.id || 'owner',
              senderName: currentOwnerName,
              senderRole: 'owner',
              ownerId: user?.id || null,
              ownerName: currentOwnerName,
              propertyId: formScopeType === 'specific' ? formSelectedPropertyId : undefined,
              title: `📢 Announcement: ${formTitle.trim()}`,
              body: formBody.trim(),
              channels,
              deliveryStatus: {
                inApp: 'delivered',
                email: formSendEmail ? 'delivered' : 'not_requested',
                sms: formSendSms ? 'delivered' : 'not_requested',
              },
            }).catch(console.warn);
          }
        }
      }

      showToast(
        status === 'published'
          ? '✓ Announcement published live across selected properties!'
          : status === 'scheduled'
            ? '✓ Announcement scheduled successfully.'
            : '✓ Announcement saved as draft.'
      );
      setIsEditorOpen(false);
    } catch (err) {
      console.error('Error saving announcement:', err);
      showToast('Failed to save announcement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Announcement
  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${title}"?`)) return;
    try {
      await deleteAnnouncement(id);
      showToast('Announcement deleted.');
      if (inspectedAnnouncement?.id === id) setInspectedAnnouncement(null);
    } catch (err) {
      console.error('Failed to delete announcement:', err);
      showToast('Failed to delete.');
    }
  };

  // Quick Publish
  const handleQuickPublish = async (announcement: Announcement) => {
    try {
      const now = new Date().toISOString();
      const updated: Announcement = {
        ...announcement,
        status: 'published',
        publishedAt: now,
        updatedAt: now,
      };
      await saveAnnouncement(updated);
      showToast('✓ Announcement is now live!');
    } catch (err) {
      console.error('Quick publish failed:', err);
      showToast('Could not publish announcement.');
    }
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = ownerAnnouncements.length;
    const published = ownerAnnouncements.filter((a) => a.status === 'published');
    const scheduled = ownerAnnouncements.filter((a) => a.status === 'scheduled');
    const drafts = ownerAnnouncements.filter((a) => a.status === 'draft');
    const archived = ownerAnnouncements.filter((a) => a.status === 'archived');
    const pinnedCount = published.filter((a) => a.isPinned).length;

    // Calculate total reach (active residents across all owned units)
    const totalTenantsReach = myTenants.length;
    const totalStaffReach = myTeam.length;

    // Compliance / Acknowledgment rate
    const ackRequiredAnnouncements = published.filter((a) => a.requireAcknowledgment);
    let totalExpectedAcks = 0;
    let totalCompletedAcks = 0;

    ackRequiredAnnouncements.forEach((a) => {
      const targetCount = a.targetScope.allProperties
        ? myTenants.length
        : myTenants.filter((t) => a.targetScope.propertyIds.includes(t.propertyId || '')).length;
      totalExpectedAcks += Math.max(targetCount, 1);
      totalCompletedAcks += (a.acknowledgments || []).length;
    });

    const complianceRate = ackRequiredAnnouncements.length > 0 && totalExpectedAcks > 0
      ? Math.min(100, Math.round((totalCompletedAcks / totalExpectedAcks) * 100))
      : 0;

    return {
      total,
      publishedCount: published.length,
      scheduledCount: scheduled.length,
      draftsCount: drafts.length,
      archivedCount: archived.length,
      pinnedCount,
      totalReach: totalTenantsReach + totalStaffReach,
      complianceRate,
      hasAckRequired: ackRequiredAnnouncements.length > 0,
    };
  }, [ownerAnnouncements, myTenants, myTeam]);

  // Filtered dataset
  const filteredAnnouncements = useMemo(() => {
    return ownerAnnouncements
      .filter((a) => {
        // Tab filter
        if (a.status !== activeTab) return false;

        // Property filter
        if (selectedPropertyFilter !== 'all') {
          if (!a.targetScope.allProperties && !a.targetScope.propertyIds.includes(selectedPropertyFilter)) {
            return false;
          }
        }

        // Category filter
        if (selectedCategoryFilter !== 'all' && a.category !== selectedCategoryFilter) {
          return false;
        }

        // Priority filter
        if (selectedPriorityFilter !== 'all' && a.priority !== selectedPriorityFilter) {
          return false;
        }

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = a.title.toLowerCase().includes(q);
          const matchBody = a.body.toLowerCase().includes(q);
          const matchCategory = a.category.toLowerCase().includes(q);
          if (!matchTitle && !matchBody && !matchCategory) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Pinned items first when viewing published
        if (activeTab === 'published') {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [ownerAnnouncements, activeTab, selectedPropertyFilter, selectedCategoryFilter, selectedPriorityFilter, searchQuery]);

  // Helper UI Badges
  const getCategoryBadge = (category: AnnouncementCategory) => {
    switch (category) {
      case 'maintenance':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#eff6ff', color: '#1d4ed8', padding: '4px 9px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600 }}>
            <Wrench size={13} /> Maintenance
          </span>
        );
      case 'policy':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fef3c7', color: '#b45309', padding: '4px 9px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600 }}>
            <ShieldCheck size={13} /> Building Policy
          </span>
        );
      case 'security':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fee2e2', color: '#b91c1c', padding: '4px 9px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600 }}>
            <AlertTriangle size={13} /> Safety & Security
          </span>
        );
      case 'community':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#faf5ff', color: '#7e22ce', padding: '4px 9px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600 }}>
            <Sparkles size={13} /> Community Event
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'var(--surface-sunken)', color: 'var(--ink)', padding: '4px 9px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600 }}>
            <Megaphone size={13} /> General Notice
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: AnnouncementPriority) => {
    switch (priority) {
      case 'emergency':
      case 'urgent':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            <Flame size={12} /> Urgent
          </span>
        );
      case 'important':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            Important
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-sunken)', color: 'var(--ink-soft)', border: '1px solid #e2e8f0', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
            Standard
          </span>
        );
    }
  };

  const getPropertyScopeName = (scope: Announcement['targetScope']) => {
    if (scope.allProperties) return 'All Properties (Portfolio-Wide)';
    const prop = myProperties.find((p) => scope.propertyIds.includes(p.id));
    return prop ? prop.name : `${scope.propertyIds.length} Selected Properties`;
  };

  // Targeted tenants for inspection modal
  const inspectedTargetTenants = useMemo(() => {
    if (!inspectedAnnouncement) return [];
    if (inspectedAnnouncement.targetScope.allProperties) {
      return myTenants;
    }
    return myTenants.filter((t) => inspectedAnnouncement.targetScope.propertyIds.includes(t.propertyId || ''));
  }, [inspectedAnnouncement, myTenants]);

  return (
    <div style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

            {/* <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: 'var(--ink-base)' }}>
              Announcements
            </h1> */}
          </div>
        </div>

        <button
          type="button"
          className="btn brass"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700, fontSize: '14px' }}
          onClick={() => handleOpenEditor()}
        >
          <Plus size={16} /> New Announcement
        </button>
      </div>

      {/* Top Executive KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="panel" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'var(--surface-sunken)', color: 'var(--teal-primary)', padding: '12px', borderRadius: '8px' }}>
            <Megaphone size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase' }}>Active Bulletins</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)' }}>{stats.publishedCount}</div>
          </div>
        </div>

        <div className="panel" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'var(--surface-sunken)', color: 'var(--amber)', padding: '12px', borderRadius: '8px' }}>
            <Pin size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase' }}>Pinned Notices</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)' }}>{stats.pinnedCount}</div>
          </div>
        </div>

        <div className="panel" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'var(--surface-sunken)', color: 'var(--ledger)', padding: '12px', borderRadius: '8px' }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase' }}>Resident Reach</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--ink)' }}>{stats.totalReach} members</div>
          </div>
        </div>

        <div className="panel" style={{ padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'var(--surface-sunken)', color: '#A855F7', padding: '12px', borderRadius: '8px' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ink-soft)', fontWeight: 600, textTransform: 'uppercase' }}>Acknowledgment Rate</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#A855F7' }}>{stats.hasAckRequired ? `${stats.complianceRate}%` : 'N/A'}</div>
          </div>
        </div>
      </div>

      {/* Tabs & Filter Bar */}
      <div className="panel" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '16px' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn small ${activeTab === 'published' ? 'brass' : 'secondary'}`}
              onClick={() => setActiveTab('published')}
              style={{ fontWeight: 600 }}
            >
              Published ({stats.publishedCount})
            </button>
            <button
              type="button"
              className={`btn small ${activeTab === 'scheduled' ? 'brass' : 'secondary'}`}
              onClick={() => setActiveTab('scheduled')}
              style={{ fontWeight: 600 }}
            >
              Scheduled ({stats.scheduledCount})
            </button>
            <button
              type="button"
              className={`btn small ${activeTab === 'draft' ? 'brass' : 'secondary'}`}
              onClick={() => setActiveTab('draft')}
              style={{ fontWeight: 600 }}
            >
              Drafts ({stats.draftsCount})
            </button>
            <button
              type="button"
              className={`btn small ${activeTab === 'archived' ? 'brass' : 'secondary'}`}
              onClick={() => setActiveTab('archived')}
              style={{ fontWeight: 600 }}
            >
              Archived ({stats.archivedCount})
            </button>
          </div>

          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '340px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-soft)' }} />
            <input
              type="text"
              placeholder="Search announcements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '7px 12px 7px 32px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border)' }}
            />
          </div>
        </div>

        {/* Filters Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--ink-soft)', fontWeight: 600 }}>
            <Filter size={14} /> Filter By:
          </div>

          {/* Property Selector */}
          <select
            value={selectedPropertyFilter}
            onChange={(e) => setSelectedPropertyFilter(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <option value="all">All Properties</option>
            {myProperties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Category Selector */}
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <option value="all">All Categories</option>
            <option value="general">General Notices</option>
            <option value="maintenance">Maintenance</option>
            <option value="policy">Building Policy</option>
            <option value="security">Safety & Security</option>
            <option value="community">Community Events</option>
          </select>

          {/* Priority Selector */}
          <select
            value={selectedPriorityFilter}
            onChange={(e) => setSelectedPriorityFilter(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)' }}
          >
            <option value="all">All Priorities</option>
            <option value="normal">Standard Priority</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent / Emergency</option>
          </select>

          {(selectedPropertyFilter !== 'all' || selectedCategoryFilter !== 'all' || selectedPriorityFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              className="btn secondary small"
              onClick={() => {
                setSelectedPropertyFilter('all');
                setSelectedCategoryFilter('all');
                setSelectedPriorityFilter('all');
                setSearchQuery('');
              }}
              style={{ fontSize: '12px' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Announcement Feed / Cards */}
      {filteredAnnouncements.length === 0 ? (
        <div className="panel" style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--ink-soft)' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--surface-sunken)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <Megaphone size={28} style={{ opacity: 0.5 }} />
          </div>
          <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink-base)' }}>
            No {activeTab} announcements found
          </h3>
          <p style={{ margin: 0, fontSize: '13.5px', maxWidth: '440px', marginLeft: 'auto', marginRight: 'auto' }}>
            {activeTab === 'published'
              ? 'Keep your residents and building staff updated by creating an official announcement using the top "+ New Announcement" button.'
              : `There are currently no announcements under the "${activeTab}" status.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredAnnouncements.map((announcement) => {
            const pubDateStr = announcement.publishedAt
              ? new Date(announcement.publishedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : 'Unpublished';

            const scheduledDateStr = announcement.scheduledFor
              ? new Date(announcement.scheduledFor).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : null;

            const expiresDateStr = announcement.expiresAt
              ? new Date(announcement.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
              : null;

            const acksCount = (announcement.acknowledgments || []).length;
            const targetCount = announcement.targetScope.allProperties
              ? myTenants.length
              : myTenants.filter((t) => announcement.targetScope.propertyIds.includes(t.propertyId || '')).length;

            const ackPercent = targetCount > 0 ? Math.min(100, Math.round((acksCount / targetCount) * 100)) : 0;

            const isUrgent = announcement.priority === 'urgent' || announcement.priority === 'emergency';

            return (
              <div
                key={announcement.id}
                className="panel"
                style={{
                  padding: '22px 24px',
                  borderRadius: '10px',
                  borderLeft: isUrgent
                    ? '4px solid #dc2626'
                    : announcement.isPinned
                      ? '4px solid var(--brass, #c59b27)'
                      : '4px solid var(--line)',
                  position: 'relative',
                  transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                }}
              >
                {/* Header Badges & Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {getCategoryBadge(announcement.category)}
                    {getPriorityBadge(announcement.priority)}

                    {announcement.isPinned && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        <Pin size={11} /> Pinned to Top
                      </span>
                    )}

                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'var(--surface-sunken)', color: 'var(--ink-soft)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                      <Building size={12} /> {getPropertyScopeName(announcement.targetScope)}
                    </span>

                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--surface-sunken)', color: 'var(--ink-soft)', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                      <Users size={12} /> {announcement.targetScope.targetRoles.includes('tenant') && announcement.targetScope.targetRoles.includes('staff') ? 'Tenants & Staff' : announcement.targetScope.targetRoles.includes('staff') ? 'Staff & Managers Only' : 'All Tenants'}
                    </span>
                  </div>

                  {/* Actions Dropdown / Quick Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {announcement.status === 'published' && (
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => togglePinAnnouncement(announcement.id)}
                        title={announcement.isPinned ? 'Unpin announcement' : 'Pin to top of resident dashboard'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                      >
                        <Pin size={13} style={{ transform: announcement.isPinned ? 'rotate(45deg)' : 'none', color: announcement.isPinned ? '#b45309' : 'inherit' }} />
                        {announcement.isPinned ? 'Unpin' : 'Pin'}
                      </button>
                    )}

                    {(announcement.status === 'draft' || announcement.status === 'scheduled') && (
                      <button
                        type="button"
                        className="btn brass small"
                        onClick={() => handleQuickPublish(announcement)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                      >
                        <Send size={13} /> Publish Now
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => handleOpenEditor(announcement)}
                      title="Edit Notice"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                    >
                      <FileEdit size={13} /> Edit
                    </button>

                    {announcement.status === 'published' && (
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => archiveAnnouncement(announcement.id)}
                        title="Archive notice"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
                      >
                        <Archive size={13} /> Archive
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => handleDelete(announcement.id, announcement.title)}
                      title="Delete notice"
                      style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Announcement Headline */}
                <h2 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 800, color: 'var(--ink-base)', lineHeight: 1.3 }}>
                  {announcement.title}
                </h2>

                {/* Timestamp & Metadata */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: 'var(--ink-soft)', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <span>
                    By <strong style={{ color: 'var(--ink-base)' }}>{announcement.authorName}</strong>
                  </span>
                  <span>•</span>
                  {announcement.status === 'scheduled' && scheduledDateStr ? (
                    <span style={{ color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                      <Clock size={12} /> Scheduled for {scheduledDateStr}
                    </span>
                  ) : (
                    <span>Published: {pubDateStr}</span>
                  )}
                  {expiresDateStr && (
                    <>
                      <span>•</span>
                      <span style={{ color: '#d97706' }}>Expires: {expiresDateStr}</span>
                    </>
                  )}
                </div>

                {/* Body Content */}
                <div
                  style={{
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    fontSize: '13.5px',
                    lineHeight: '1.6',
                    color: 'var(--ink-base)',
                    whiteSpace: 'pre-wrap',
                    marginBottom: '16px',
                  }}
                >
                  {announcement.body}
                </div>

                {/* Compliance & Acknowledgment Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
                  {announcement.requireAcknowledgment ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
                      <div style={{ flex: '1', maxWidth: '300px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--ink-base)' }}>
                            Resident Acknowledgment
                          </span>
                          <span style={{ fontWeight: 700, color: ackPercent === 100 ? '#16a34a' : 'var(--ink-base)' }}>
                            {acksCount} / {targetCount} ({ackPercent}%)
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'var(--line-strong)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${ackPercent}%`,
                              height: '100%',
                              background: ackPercent === 100 ? '#16a34a' : 'var(--brass, #c59b27)',
                              borderRadius: '4px',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={() => setInspectedAnnouncement(announcement)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', whiteSpace: 'nowrap' }}
                      >
                        <Eye size={12} /> View Sign-Offs
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ink-soft)' }}>
                      <Eye size={14} /> Read receipts enabled • Informational notice
                    </div>
                  )}

                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                    ID: <code style={{ fontFamily: 'monospace' }}>{announcement.id}</code>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Announcement Modal */}
      {isEditorOpen && (
        <div className="modal-backdrop" onClick={() => setIsEditorOpen(false)}>
          <div className="modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editingAnnouncement ? 'Edit Announcement' : 'Compose New Announcement'}</h3>
              <button type="button" className="btn secondary small" onClick={() => setIsEditorOpen(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Title */}
              <div className="field">
                <label>Announcement Title / Headline *</label>
                <input
                  type="text"
                  placeholder="e.g. Scheduled Water Maintenance & Pressure Testing"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              {/* Category & Priority */}
              <div className="grid grid-2" style={{ gap: '12px' }}>
                <div className="field">
                  <label>Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as AnnouncementCategory)}
                  >
                    <option value="general">General Notice</option>
                    <option value="maintenance">Maintenance & Repairs</option>
                    <option value="policy">Building Policy & Rules</option>
                    <option value="security">Safety & Security</option>
                    <option value="community">Community Event</option>
                  </select>
                </div>

                <div className="field">
                  <label>Priority Level</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as AnnouncementPriority)}
                  >
                    <option value="normal">Standard Notice</option>
                    <option value="important">Important (Highlighted)</option>
                    <option value="urgent">Urgent / Emergency (Top Warning)</option>
                  </select>
                </div>
              </div>

              {/* Property Scope & Audience */}
              <div className="field">
                <label>Target Scope</label>
                <select
                  value={formScopeType}
                  onChange={(e) => {
                    const val = e.target.value as 'all' | 'specific' | 'specific_people';
                    setFormScopeType(val);
                    if (val === 'all') {
                      setFormSelectedPropertyId('');
                    } else if (val === 'specific' && !formSelectedPropertyId && myProperties.length > 0) {
                      setFormSelectedPropertyId(myProperties[0].id);
                    }
                  }}
                >
                  <option value="all">Entire Portfolio (All Properties & Residents)</option>
                  <option value="specific">Filter by Property (All Units in Building)</option>
                  <option value="specific_people">🎯 Specific Residents, Units & Staff ({formSelectedRecipientIds.length} selected)</option>
                </select>
              </div>

              {formScopeType === 'specific' && (
                <div className="grid grid-2" style={{ gap: '12px' }}>
                  <div className="field">
                    <label>Select Property</label>
                    <select
                      value={formSelectedPropertyId}
                      onChange={(e) => setFormSelectedPropertyId(e.target.value)}
                    >
                      {myProperties.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Audience Roles</label>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', height: '38px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formTargetRoles.includes('tenant')}
                          onChange={(e) => {
                            if (e.target.checked) setFormTargetRoles((prev) => [...prev, 'tenant']);
                            else setFormTargetRoles((prev) => prev.filter((r) => r !== 'tenant'));
                          }}
                        />
                        Tenants
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formTargetRoles.includes('staff')}
                          onChange={(e) => {
                            if (e.target.checked) setFormTargetRoles((prev) => [...prev, 'staff', 'manager']);
                            else setFormTargetRoles((prev) => prev.filter((r) => r !== 'staff' && r !== 'manager'));
                          }}
                        />
                        Staff & Team
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {formScopeType === 'all' && (
                <div className="field">
                  <label>Audience Roles</label>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', height: '38px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formTargetRoles.includes('tenant')}
                        onChange={(e) => {
                          if (e.target.checked) setFormTargetRoles((prev) => [...prev, 'tenant']);
                          else setFormTargetRoles((prev) => prev.filter((r) => r !== 'tenant'));
                        }}
                      />
                      Tenants
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formTargetRoles.includes('staff')}
                        onChange={(e) => {
                          if (e.target.checked) setFormTargetRoles((prev) => [...prev, 'staff', 'manager']);
                          else setFormTargetRoles((prev) => prev.filter((r) => r !== 'staff' && r !== 'manager'));
                        }}
                      />
                      Staff & Team
                    </label>
                  </div>
                </div>
              )}

              {formScopeType === 'specific_people' && (
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                      Select Specific Individuals ({formSelectedRecipientIds.length} selected)
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const ids = filteredOwnerCandidates.map((c) => c.id);
                          setFormSelectedRecipientIds((prev) => Array.from(new Set([...prev, ...ids])));
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: 0 }}
                      >
                        Select All Filtered ({filteredOwnerCandidates.length})
                      </button>
                      {formSelectedRecipientIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setFormSelectedRecipientIds([])}
                          style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter & Search Controls */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 180px', minWidth: '140px', position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Search resident name, unit #, phone, email..."
                        value={announcementSearchQuery}
                        onChange={(e) => setAnnouncementSearchQuery(e.target.value)}
                        style={{ width: '100%', fontSize: '12.5px', padding: '6px 10px' }}
                      />
                    </div>
                    <select
                      value={announcementPropertyFilter}
                      onChange={(e) => setAnnouncementPropertyFilter(e.target.value)}
                      style={{ minWidth: '130px', fontSize: '12.5px', padding: '6px 10px' }}
                    >
                      <option value="all">All Properties</option>
                      {myProperties.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Selected Chips */}
                  {formSelectedRecipientIds.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '85px', overflowY: 'auto', padding: '6px', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      {ownerCandidates.filter((c) => formSelectedRecipientIds.includes(c.id)).map((c) => (
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
                          {c.unit && (
                            <span style={{ background: 'var(--brand-surface, #e0f2fe)', color: 'var(--brand, #0284c7)', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
                              {c.unit}
                            </span>
                          )}
                          <span style={{ fontSize: '10px', color: 'var(--ink-soft)' }}>({c.role})</span>
                          <button
                            type="button"
                            onClick={() => setFormSelectedRecipientIds((prev) => prev.filter((id) => id !== c.id))}
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
                    {filteredOwnerCandidates.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '16px', fontSize: '12px', color: 'var(--ink-soft)' }}>
                        No residents or staff match your search filter.
                      </div>
                    ) : (
                      filteredOwnerCandidates.map((c) => {
                        const isSelected = formSelectedRecipientIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              setFormSelectedRecipientIds((prev) =>
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
                                <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{c.name}</span>
                                  {c.unit && (
                                    <span style={{ background: 'var(--brand-surface, #e0f2fe)', color: 'var(--brand, #0284c7)', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
                                      {c.unit}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                  {c.propertyName} {c.email || c.phone ? `• ${c.email || c.phone}` : ''}
                                </div>
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '10.5px',
                                textTransform: 'capitalize',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: c.role === 'tenant' ? 'var(--success-surface, #ecfdf5)' : 'var(--brand-surface, #e0f2fe)',
                                color: c.role === 'tenant' ? 'var(--success, #059669)' : 'var(--brand, #0284c7)',
                                fontWeight: 600,
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

              {/* Message Content */}
              <div className="field">
                <label>Announcement Content *</label>
                <textarea
                  rows={5}
                  placeholder="Type clear instructions, schedule times, policy details, or emergency contacts..."
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  style={{ lineHeight: '1.5' }}
                />
              </div>

              {/* Controls: Pinning & Acknowledgment */}
              <div style={{ background: 'var(--surface-sunken)', padding: '14px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={formIsPinned}
                    onChange={(e) => setFormIsPinned(e.target.checked)}
                  />
                  <span>📌 Pin to top of resident portal / dashboard</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={formRequireAck}
                    onChange={(e) => setFormRequireAck(e.target.checked)}
                  />
                  <span>📋 Require resident acknowledgment (sign-off confirmation)</span>
                </label>
                {formRequireAck && (
                  <div style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginLeft: '24px' }}>
                    Tenants will see an explicit button to acknowledge that they have read and agreed to this notice.
                  </div>
                )}

                {/* External Gateway Dispatch Controls */}
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '10px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink)' }}>
                    External Gateway Broadcast (Twilio SMS & SendGrid Email)
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={formSendSms}
                      onChange={(e) => setFormSendSms(e.target.checked)}
                    />
                    <span>📱 Dispatch Instant SMS Alert to Resident Phones (via Twilio Gateway)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={formSendEmail}
                      onChange={(e) => setFormSendEmail(e.target.checked)}
                    />
                    <span>✉️ Dispatch Email Broadcast to Inboxes (via SendGrid Gateway)</span>
                  </label>
                </div>
              </div>

              {/* Scheduling & Expiration Controls */}
              <div className="grid grid-2" style={{ gap: '12px' }}>
                <div className="field">
                  <label>Publish Timing</label>
                  <select
                    value={formPublishMode}
                    onChange={(e) => setFormPublishMode(e.target.value as any)}
                  >
                    <option value="now">Publish Immediately</option>
                    <option value="scheduled">Schedule for Future Date</option>
                    <option value="draft">Save as Draft</option>
                  </select>
                </div>

                {formPublishMode === 'scheduled' ? (
                  <div className="field">
                    <label>Schedule Publication Date & Time</label>
                    <input
                      type="datetime-local"
                      value={formScheduledDate}
                      onChange={(e) => setFormScheduledDate(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label>Auto-Expire Date (Optional)</label>
                    <input
                      type="date"
                      value={formExpiresDate ? formExpiresDate.substring(0, 10) : ''}
                      onChange={(e) => setFormExpiresDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 20px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setIsEditorOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn secondary"
                onClick={() => handleSaveAnnouncement(true)}
                disabled={isSubmitting}
              >
                Save as Draft
              </button>

              <button
                type="button"
                className={`btn brass ${isSubmitting ? 'btn-processing' : ''}`}
                onClick={() => handleSaveAnnouncement(false)}
                disabled={isSubmitting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ButtonProcessing
                  loading={isSubmitting}
                  loadingText="Publishing..."
                  defaultText={formPublishMode === 'scheduled' ? 'Schedule Notice' : 'Publish Announcement'}
                  icon={<Send size={15} />}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Acknowledgment Sign-Off Inspector Modal */}
      {inspectedAnnouncement && (
        <div className="modal-backdrop" onClick={() => setInspectedAnnouncement(null)}>
          <div className="modal-card" style={{ maxWidth: '680px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#16a34a" />
                <h3 style={{ margin: 0 }}>Resident Acknowledgment Audit</h3>
              </div>
              <button type="button" className="btn secondary small" onClick={() => setInspectedAnnouncement(null)}>
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ overflowY: 'auto', padding: '20px' }}>
              <div style={{ background: 'var(--surface-sunken)', padding: '14px', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase' }}>
                  Announcement
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink-base)', marginTop: '2px' }}>
                  {inspectedAnnouncement.title}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '4px' }}>
                  {inspectedAnnouncement.acknowledgments?.length || 0} of {inspectedTargetTenants.length} target residents have acknowledged this notice.
                </div>
              </div>

              {/* Table of Tenants */}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Resident Name</th>
                      <th>Unit / Property</th>
                      <th>Status</th>
                      <th>Acknowledged At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspectedTargetTenants.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-soft)' }}>
                          No active residents found for this target scope.
                        </td>
                      </tr>
                    ) : (
                      inspectedTargetTenants.map((t) => {
                        const ack = (inspectedAnnouncement.acknowledgments || []).find((a) => a.tenantId === t.id);
                        const hasAcked = !!ack;

                        return (
                          <tr key={t.id}>
                            <td style={{ fontWeight: 600, fontSize: '13px' }}>
                              {t.name}
                              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 400 }}>
                                {t.email || t.phone || ''}
                              </div>
                            </td>
                            <td style={{ fontSize: '12.5px' }}>
                              Unit {t.unit || 'N/A'}
                            </td>
                            <td>
                              {hasAcked ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 700, fontSize: '12px' }}>
                                  <Check size={14} /> Confirmed
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#d97706', fontWeight: 600, fontSize: '12px' }}>
                                  <Clock size={13} /> Pending
                                </span>
                              )}
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                              {hasAcked && ack.acknowledgedAt
                                ? new Date(ack.acknowledgedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                                : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn secondary small" onClick={() => setInspectedAnnouncement(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
