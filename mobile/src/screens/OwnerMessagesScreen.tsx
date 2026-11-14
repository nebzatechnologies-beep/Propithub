import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { ScreenContainer } from '../components/ScreenContainer';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { MobileAnnouncement } from '../types';
import { useMobileTheme } from '../context/MobileThemeContext';

type AnnouncementWithMeta = MobileAnnouncement & {
  authorName?: string;
  publishedAt?: string;
  scheduledFor?: string;
  expiresAt?: string;
  updatedAt?: string;
  viewsCount?: number;
};

type CategoryOption = MobileAnnouncement['category'];
type PriorityOption = MobileAnnouncement['priority'];
type ScopeMode = 'all' | 'specific' | 'specific_people';
type TargetRole = 'tenant' | 'staff' | 'manager';

const normalizeCategory = (raw?: string): CategoryOption => {
  switch (raw) {
    case 'maintenance':
      return 'maintenance';
    case 'emergency':
    case 'security':
      return 'emergency';
    case 'rules':
    case 'policy':
      return 'rules';
    case 'event':
    case 'community':
      return 'event';
    default:
      return 'general';
  }
};

const normalizePriority = (raw?: string): PriorityOption => {
  switch (raw) {
    case 'urgent':
    case 'emergency':
      return 'urgent';
    case 'high':
    case 'important':
      return 'high';
    default:
      return 'normal';
  }
};

const parseValidatedDateTime = (raw: string): Date | null => {
  const val = raw.trim();
  if (!val) return null;

  // Accept YYYY-MM-DD
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const d = new Date(year, month - 1, day, 9, 0, 0, 0);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return d;
    }
    return null;
  }

  // Accept YYYY-MM-DD HH:mm or YYYY-MM-DDTHH:mm(:ss)?
  const dateTime = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(val);
  if (dateTime) {
    const year = Number(dateTime[1]);
    const month = Number(dateTime[2]);
    const day = Number(dateTime[3]);
    const hour = Number(dateTime[4]);
    const min = Number(dateTime[5]);
    const sec = dateTime[6] ? Number(dateTime[6]) : 0;
    if (hour > 23 || min > 59 || sec > 59) return null;
    const d = new Date(year, month - 1, day, hour, min, sec, 0);
    if (
      d.getFullYear() === year &&
      d.getMonth() === month - 1 &&
      d.getDate() === day &&
      d.getHours() === hour &&
      d.getMinutes() === min
    ) {
      return d;
    }
    return null;
  }

  // Fallback for full ISO-8601 strings
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const formatDateTimeInput = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface OwnerMessagesScreenProps {
  onProfilePress?: () => void;
  onNavigate?: (screenKey: string) => void;
}

export const OwnerMessagesScreen: React.FC<OwnerMessagesScreenProps> = ({
  onProfilePress,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { user } = useMobileAuth();
  const {
    state,
    saveAnnouncement,
    togglePinAnnouncement,
    archiveAnnouncement,
    deleteAnnouncement,
  } = useMobileAppData();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'published' | 'scheduled' | 'draft' | 'archived'>('published');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState<string>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Create / Edit Modal State
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementWithMeta | null>(null);
  const [inspectedAnnouncement, setInspectedAnnouncement] = useState<AnnouncementWithMeta | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<CategoryOption>('general');
  const [priority, setPriority] = useState<PriorityOption>('normal');
  const [scopeType, setScopeType] = useState<ScopeMode>('all');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [targetRoles, setTargetRoles] = useState<TargetRole[]>(['tenant']);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [recipientSearchQuery, setRecipientSearchQuery] = useState('');
  const [pinToTop, setPinToTop] = useState(false);
  const [ackRequired, setAckRequired] = useState(true);
  const [publishStatus, setPublishStatus] = useState<'published' | 'scheduled' | 'draft'>('published');
  const [scheduledDateInput, setScheduledDateInput] = useState('');
  const [expiresDateInput, setExpiresDateInput] = useState('');

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const ownerIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (user?.id) ids.add(user.id);
    if ((user as any)?.uid) ids.add((user as any).uid);
    const currentUserId = (state as any)?.currentUserId;
    if (currentUserId) ids.add(currentUserId);
    const ownerEntry = (state.users || []).find((u) => u.id === user?.id || (user?.email && u.email?.toLowerCase() === user.email.toLowerCase()));
    if (ownerEntry?.id) ids.add(ownerEntry.id);
    return ids;
  }, [user, state]);

  const isSuperAdmin = (user?.role as string) === 'superadmin';
  const currentOwnerId = user?.id || Array.from(ownerIdSet)[0] || '';
  const currentOwnerName = user?.displayName || 'Property Management';

  const myProperties = useMemo(() => {
    if (isSuperAdmin) return state.properties || [];
    if (ownerIdSet.size === 0) return [];
    return (state.properties || []).filter((p) => Boolean(p.ownerId) && ownerIdSet.has(p.ownerId));
  }, [state.properties, ownerIdSet, isSuperAdmin]);

  const myTenants = useMemo(() => {
    const myPropIds = new Set(myProperties.map((p) => p.id));
    return (state.tenants || []).filter(
      (t) =>
        isSuperAdmin ||
        (Boolean(t.ownerId) && ownerIdSet.has(t.ownerId)) ||
        (Boolean(t.propertyId) && myPropIds.has(t.propertyId))
    );
  }, [state.tenants, myProperties, ownerIdSet, isSuperAdmin]);

  const myStaff = useMemo(() => {
    return (state.staff || []).filter(
      (s) => isSuperAdmin || (Boolean(s.ownerId) && ownerIdSet.has(s.ownerId))
    );
  }, [state.staff, ownerIdSet, isSuperAdmin]);

  const myManagers = useMemo(() => {
    return (state.propertyManagers || []).filter(
      (m) => isSuperAdmin || (Boolean(m.ownerId) && ownerIdSet.has(m.ownerId))
    );
  }, [state.propertyManagers, ownerIdSet, isSuperAdmin]);

  const ownerCandidates = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      role: TargetRole;
      propertyId?: string;
      propertyName?: string;
      unit?: string;
      subtitle?: string;
    }> = [];

    myTenants.forEach((t) => {
      const prop = myProperties.find((p) => p.id === t.propertyId);
      list.push({
        id: t.id,
        name: t.name,
        role: 'tenant',
        propertyId: t.propertyId,
        propertyName: prop?.name || t.propertyName || 'Property',
        unit: t.unit,
        subtitle: t.email || t.phone,
      });
    });

    myStaff.forEach((s) => {
      list.push({
        id: String(s.id),
        name: s.name,
        role: 'staff',
        propertyId: s.assignedProperties?.[0],
        propertyName: s.role || 'Maintenance Staff',
        subtitle: s.email || s.phone,
      });
    });

    myManagers.forEach((m) => {
      list.push({
        id: String(m.id),
        name: m.name,
        role: 'manager',
        propertyId: m.propertyId || m.assignedProperties?.[0],
        propertyName: 'Property Manager',
        subtitle: m.email || m.phone,
      });
    });

    return list;
  }, [myTenants, myStaff, myManagers, myProperties]);

  const filteredCandidates = useMemo(() => {
    const q = recipientSearchQuery.trim().toLowerCase();
    if (!q) return ownerCandidates;
    return ownerCandidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.unit && c.unit.toLowerCase().includes(q)) ||
        (c.propertyName && c.propertyName.toLowerCase().includes(q)) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q))
    );
  }, [ownerCandidates, recipientSearchQuery]);

  // Scope announcements to owner (plus superadmin / owner-targeted broadcasts)
  const myAnnouncements = useMemo<AnnouncementWithMeta[]>(() => {
    const list = (state.announcements || []) as AnnouncementWithMeta[];
    if (isSuperAdmin) return list;
    if (ownerIdSet.size === 0) return [];
    return list.filter(
      (a) =>
        (Boolean(a.ownerId) && ownerIdSet.has(a.ownerId)) ||
        a.ownerId === 'superadmin' ||
        a.targetScope?.targetRoles?.includes('owner')
    );
  }, [state.announcements, ownerIdSet, isSuperAdmin]);

  // Filtered & sorted announcements (pinned first, then newest)
  const displayedAnnouncements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return myAnnouncements
      .filter((a) => {
        if (a.status !== activeTab) return false;

        if (selectedPropertyFilter !== 'all') {
          const scope = a.targetScope;
          const matchesProp = scope
            ? Boolean(scope.allProperties) ||
              (Array.isArray(scope.propertyIds) && scope.propertyIds.includes(selectedPropertyFilter))
            : !a.propertyId || a.propertyId === selectedPropertyFilter;
          if (!matchesProp) return false;
        }

        if (selectedCategoryFilter !== 'all') {
          if (normalizeCategory(a.category) !== selectedCategoryFilter) return false;
        }

        if (selectedPriorityFilter !== 'all') {
          if (normalizePriority(a.priority) !== selectedPriorityFilter) return false;
        }

        if (q) {
          const matchTitle = (a.title || '').toLowerCase().includes(q);
          const matchBody = (a.body || '').toLowerCase().includes(q);
          const matchCat = (a.category || '').toLowerCase().includes(q);
          if (!matchTitle && !matchBody && !matchCat) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [
    myAnnouncements,
    activeTab,
    selectedPropertyFilter,
    selectedCategoryFilter,
    selectedPriorityFilter,
    searchQuery,
  ]);

  const handleOpenEditor = (existing?: AnnouncementWithMeta) => {
    if (existing) {
      setEditingAnnouncement(existing);
      setTitle(existing.title || '');
      setBody(existing.body || '');
      setCategory(normalizeCategory(existing.category));
      setPriority(normalizePriority(existing.priority));

      const scope = existing.targetScope;
      const mode: ScopeMode =
        scope?.mode ||
        (scope?.targetUserIds?.length
          ? 'specific_people'
          : scope?.allProperties === false || Boolean(existing.propertyId)
          ? 'specific'
          : 'all');
      setScopeType(mode);
      setSelectedPropertyId(scope?.propertyIds?.[0] || existing.propertyId || myProperties[0]?.id || '');
      setSelectedRecipientIds(scope?.targetUserIds || []);

      const rawRoles = (scope?.targetRoles || existing.targetRoles || ['tenant']).filter(
        (r: string): r is TargetRole => r === 'tenant' || r === 'staff' || r === 'manager'
      );
      setTargetRoles(rawRoles.length > 0 ? rawRoles : ['tenant']);

      setPinToTop(Boolean(existing.isPinned));
      setAckRequired(Boolean(existing.requireAcknowledgment ?? existing.requireAck));
      setPublishStatus(
        existing.status === 'scheduled'
          ? 'scheduled'
          : existing.status === 'draft'
          ? 'draft'
          : 'published'
      );
      setScheduledDateInput(formatDateTimeInput(existing.scheduledFor));
      setExpiresDateInput(formatDateTimeInput(existing.expiresAt));
    } else {
      setEditingAnnouncement(null);
      setTitle('');
      setBody('');
      setCategory('general');
      setPriority('normal');
      setScopeType('all');
      setSelectedPropertyId(myProperties[0]?.id || '');
      setSelectedRecipientIds([]);
      setTargetRoles(['tenant']);
      setPinToTop(false);
      setAckRequired(true);
      setPublishStatus('published');
      setScheduledDateInput('');
      setExpiresDateInput('');
    }
    setRecipientSearchQuery('');
    setShowEditorModal(true);
  };

  const toggleTargetRole = (role: TargetRole) => {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSaveAnnouncement = (asDraftOverride = false) => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Missing Fields', 'Please enter an announcement title and message content.');
      return;
    }

    if (scopeType === 'specific' && !selectedPropertyId) {
      Alert.alert('Select Property', 'Please select a target property.');
      return;
    }

    if (scopeType === 'specific_people' && selectedRecipientIds.length === 0) {
      Alert.alert('Select Recipients', 'Please select at least one recipient.');
      return;
    }

    if (scopeType !== 'specific_people' && targetRoles.length === 0) {
      Alert.alert('Select Audience', 'Please select at least one target role (Tenants, Staff, or Managers).');
      return;
    }

    const finalStatus: MobileAnnouncement['status'] = asDraftOverride ? 'draft' : publishStatus;

    let scheduledIso: string | undefined;
    if (finalStatus === 'scheduled') {
      const parsedSched = parseValidatedDateTime(scheduledDateInput);
      if (!parsedSched) {
        Alert.alert(
          'Invalid Schedule Date',
          'Please enter a valid schedule date/time in YYYY-MM-DD HH:mm format (e.g. 2026-11-25 09:00).'
        );
        return;
      }
      scheduledIso = parsedSched.toISOString();
    }

    let expiresIso: string | undefined;
    if (expiresDateInput.trim()) {
      const parsedExp = parseValidatedDateTime(expiresDateInput);
      if (!parsedExp) {
        Alert.alert(
          'Invalid Expiry Date',
          'Please enter a valid expiration date in YYYY-MM-DD or YYYY-MM-DD HH:mm format.'
        );
        return;
      }
      if (scheduledIso && parsedExp.getTime() <= new Date(scheduledIso).getTime()) {
        Alert.alert('Invalid Expiry Date', 'Expiration date must be after the scheduled publication time.');
        return;
      }
      expiresIso = parsedExp.toISOString();
    }

    const now = new Date().toISOString();
    const targetProp = myProperties.find((p) => p.id === selectedPropertyId);
    const annId = editingAnnouncement
      ? editingAnnouncement.id
      : `ANN-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const targetScope = {
      allProperties: scopeType === 'all',
      propertyIds: scopeType === 'specific' && selectedPropertyId ? [selectedPropertyId] : [],
      targetRoles: scopeType === 'specific_people' ? [] : targetRoles,
      mode: scopeType,
      ...(scopeType === 'specific_people' ? { targetUserIds: selectedRecipientIds } : {}),
    };

    const payload: AnnouncementWithMeta = {
      id: annId,
      ownerId: editingAnnouncement?.ownerId || currentOwnerId,
      authorId: user?.id,
      authorName: editingAnnouncement?.authorName || currentOwnerName,
      title: title.trim(),
      body: body.trim(),
      category,
      priority,
      propertyId: scopeType === 'specific' ? selectedPropertyId : undefined,
      propertyName:
        scopeType === 'all'
          ? 'All Properties'
          : scopeType === 'specific'
          ? targetProp?.name || 'Selected Property'
          : `${selectedRecipientIds.length} Specific Recipient(s)`,
      targetRoles: scopeType === 'specific_people' ? [] : targetRoles,
      targetScope,
      isPinned: pinToTop,
      requireAck: ackRequired,
      requireAcknowledgment: ackRequired,
      acknowledgments: editingAnnouncement?.acknowledgments || [],
      acknowledgedBy: editingAnnouncement?.acknowledgedBy || [],
      status: finalStatus,
      publishedAt:
        finalStatus === 'published'
          ? editingAnnouncement?.publishedAt || now
          : editingAnnouncement?.publishedAt || '',
      scheduledFor: scheduledIso,
      expiresAt: expiresIso,
      viewsCount: editingAnnouncement?.viewsCount || 0,
      createdAt: editingAnnouncement?.createdAt || now,
      updatedAt: now,
    };

    saveAnnouncement(payload);
    setShowEditorModal(false);
    setEditingAnnouncement(null);

    Alert.alert(
      editingAnnouncement ? 'Announcement Updated ✓' : 'Announcement Saved ✓',
      finalStatus === 'published'
        ? 'Your broadcast is live across selected properties.'
        : finalStatus === 'scheduled'
        ? 'Your announcement has been scheduled.'
        : 'Your announcement has been saved as draft.'
    );
  };

  const handleQuickPublish = (ann: AnnouncementWithMeta) => {
    const now = new Date().toISOString();
    saveAnnouncement({
      ...ann,
      status: 'published',
      publishedAt: now,
      updatedAt: now,
    } as AnnouncementWithMeta);
    Alert.alert('Published Live ✓', `"${ann.title}" is now live.`);
  };

  const handleDelete = (id: string, annTitle: string) => {
    Alert.alert(
      'Delete Announcement',
      `Are you sure you want to permanently remove "${annTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAnnouncement(id);
            if (inspectedAnnouncement?.id === id) setInspectedAnnouncement(null);
          },
        },
      ]
    );
  };

  const getScopeSummary = (ann: AnnouncementWithMeta) => {
    const scope = ann.targetScope;
    if (scope?.mode === 'specific_people' || (scope?.targetUserIds && scope.targetUserIds.length > 0)) {
      return `${scope?.targetUserIds?.length || 0} Specific Recipient(s)`;
    }
    if (scope?.allProperties) return 'All Properties';
    if (scope?.propertyIds?.length) {
      const prop = myProperties.find((p) => scope.propertyIds.includes(p.id));
      return prop?.name || ann.propertyName || `${scope.propertyIds.length} Property`;
    }
    return ann.propertyName || 'All Properties';
  };

  const getAudienceSummary = (ann: AnnouncementWithMeta) => {
    const roles: string[] = ann.targetScope?.targetRoles || ann.targetRoles || ['tenant'];
    if (ann.targetScope?.mode === 'specific_people') return 'Direct';
    const labels: string[] = [];
    if (roles.includes('tenant')) labels.push('Tenants');
    if (roles.includes('staff')) labels.push('Staff');
    if (roles.includes('manager')) labels.push('Managers');
    if (roles.includes('owner')) labels.push('Owners');
    return labels.length > 0 ? labels.join(', ') : 'Tenants';
  };

  const inspectedAuditRecipients = useMemo(() => {
    if (!inspectedAnnouncement) return [];
    const scope = inspectedAnnouncement.targetScope;
    const ackObjs: any[] = inspectedAnnouncement.acknowledgments || [];
    const ackIds = new Set<string>(inspectedAnnouncement.acknowledgedBy || []);

    let pool = ownerCandidates;
    if (scope?.mode === 'specific_people' && Array.isArray(scope.targetUserIds)) {
      const targetSet = new Set<string>(scope.targetUserIds);
      pool = ownerCandidates.filter((c) => targetSet.has(c.id));
    } else {
      const roles: string[] = scope?.targetRoles || inspectedAnnouncement.targetRoles || ['tenant'];
      pool = ownerCandidates.filter((c) => roles.includes(c.role));
      if (scope && !scope.allProperties && Array.isArray(scope.propertyIds) && scope.propertyIds.length > 0) {
        const propSet = new Set<string>(scope.propertyIds);
        pool = pool.filter((c) => !c.propertyId || propSet.has(c.propertyId));
      } else if (inspectedAnnouncement.propertyId) {
        pool = pool.filter((c) => !c.propertyId || c.propertyId === inspectedAnnouncement.propertyId);
      }
    }

    return pool.map((c) => {
      const ackMatch = ackObjs.find((a) => a.tenantId === c.id || a.userId === c.id);
      const confirmed = Boolean(ackMatch || ackIds.has(c.id));
      return {
        ...c,
        confirmed,
        acknowledgedAt: ackMatch?.acknowledgedAt as string | undefined,
      };
    });
  }, [inspectedAnnouncement, ownerCandidates]);

  const hasActiveFilters =
    selectedPropertyFilter !== 'all' ||
    selectedCategoryFilter !== 'all' ||
    selectedPriorityFilter !== 'all' ||
    searchQuery.trim().length > 0;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const fabButton = (
    <TouchableOpacity
      style={styles.fabButton}
      onPress={() => handleOpenEditor()}
      activeOpacity={0.85}
    >
      <Feather name="plus" size={14} color="#FFFFFF" />
      <Text style={styles.fabButtonText}>New Broadcast</Text>
    </TouchableOpacity>
  );

  return (
    <ScreenContainer
      scrollable
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={styles.content}
      header={
        <>
          <ScreenStatusBar />
          <Header
            title="Announcements"
            onNotificationPress={() => onNavigate?.('notifications_center')}
            onProfilePress={onProfilePress}
          />
        </>
      }
      footer={fabButton}
    >
      {/* Navigation Tabs Capsule */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.tabContainer, { flexGrow: 1 }]}
        style={{
          flexGrow: 0,
          flexShrink: 0,
          marginBottom: 12,
          backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {(['published', 'scheduled', 'draft', 'archived'] as const).map((tab) => {
          const isSelected = activeTab === tab;
          const count = myAnnouncements.filter((a) => a.status === tab).length;
          const label = tab.charAt(0).toUpperCase() + tab.slice(1);
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                isSelected && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }],
              ]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, isSelected && [styles.tabTextActive, { color: colors.navy }]]} numberOfLines={1}>
                {label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Search + Filter Toggle Bar */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Feather name="search" size={15} color={colors.inkSoft} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.navy }]}
            placeholder="Search notices..."
            placeholderTextColor={colors.inkSoft}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={15} color={colors.inkSoft} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.filterToggleBtn,
            {
              backgroundColor: showFilters || hasActiveFilters ? (isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5') : colors.surface,
              borderColor: showFilters || hasActiveFilters ? '#10B981' : colors.line,
            },
          ]}
          onPress={() => setShowFilters((p) => !p)}
          activeOpacity={0.8}
        >
          <Feather name="sliders" size={15} color={showFilters || hasActiveFilters ? '#10B981' : colors.inkSoft} />
        </TouchableOpacity>
      </View>

      {/* Collapsible Filter Pills */}
      {showFilters && (
        <View style={[styles.filtersPanel, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.filterGroupLabel, { color: colors.inkSoft }]}>Property</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[styles.pillOption, selectedPropertyFilter === 'all' && styles.pillOptionActive]}
                onPress={() => setSelectedPropertyFilter('all')}
              >
                <Text style={[styles.pillOptionText, selectedPropertyFilter === 'all' && styles.pillOptionTextActive]}>
                  All Properties
                </Text>
              </TouchableOpacity>
              {myProperties.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.pillOption, selectedPropertyFilter === p.id && styles.pillOptionActive]}
                  onPress={() => setSelectedPropertyFilter(p.id)}
                >
                  <Text style={[styles.pillOptionText, selectedPropertyFilter === p.id && styles.pillOptionTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[styles.filterGroupLabel, { color: colors.inkSoft }]}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {(['all', 'general', 'maintenance', 'emergency', 'rules', 'event'] as const).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.pillOption, selectedCategoryFilter === cat && styles.pillOptionActive]}
                  onPress={() => setSelectedCategoryFilter(cat)}
                >
                  <Text style={[styles.pillOptionText, selectedCategoryFilter === cat && styles.pillOptionTextActive]}>
                    {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[styles.filterGroupLabel, { color: colors.inkSoft }]}>Priority</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {(['all', 'normal', 'high', 'urgent'] as const).map((pri) => (
                <TouchableOpacity
                  key={pri}
                  style={[styles.pillOption, selectedPriorityFilter === pri && styles.pillOptionActive]}
                  onPress={() => setSelectedPriorityFilter(pri)}
                >
                  <Text style={[styles.pillOptionText, selectedPriorityFilter === pri && styles.pillOptionTextActive]}>
                    {pri === 'all' ? 'All' : pri.charAt(0).toUpperCase() + pri.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {hasActiveFilters && (
              <TouchableOpacity
                onPress={() => {
                  setSelectedPropertyFilter('all');
                  setSelectedCategoryFilter('all');
                  setSelectedPriorityFilter('all');
                  setSearchQuery('');
                }}
              >
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#10B981' }}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Announcements List */}
      {displayedAnnouncements.length === 0 ? (
        <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Feather name="bell" size={32} color={colors.inkSoft} />
          <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Announcements in {activeTab}</Text>
          <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
            {hasActiveFilters
              ? 'No broadcasts match your active search or filters.'
              : 'Tap "+ New Broadcast" to send an update to residents or staff.'}
          </Text>
        </View>
      ) : (
        displayedAnnouncements.map((ann) => {
          const normPriority = normalizePriority(ann.priority);
          const normCat = normalizeCategory(ann.category);
          const isUrgent = normPriority === 'urgent';
          const isHigh = normPriority === 'high';
          const isEmergency = normCat === 'emergency';
          const isRequireAck = Boolean(ann.requireAcknowledgment ?? ann.requireAck);
          const ackCount = Math.max(ann.acknowledgments?.length || 0, ann.acknowledgedBy?.length || 0);
          const isOwnAnnouncement = isSuperAdmin || ownerIdSet.has(ann.ownerId);
          const isPlatformNotice = ann.ownerId === 'superadmin' && !ownerIdSet.has(ann.ownerId);

          return (
            <View
              key={ann.id}
              style={[
                styles.annCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
                ann.isPinned && styles.annCardPinned,
                isUrgent && { borderLeftWidth: 3, borderLeftColor: '#DC2626' },
              ]}
            >
              {/* Top Meta Row */}
              <View style={styles.annTopRow}>
                <View style={styles.badgesCluster}>
                  {ann.isPinned && (
                    <View style={styles.pinnedPill}>
                      <Ionicons name="pin" size={10} color={isDark ? '#34D399' : '#059669'} />
                      <Text style={styles.pinnedText}>PINNED</Text>
                    </View>
                  )}

                  {isPlatformNotice && (
                    <View style={[styles.catBadge, { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#EDE9FE' }]}>
                      <Text style={{ fontSize: 9.5, fontWeight: '700', color: isDark ? '#C4B5FD' : '#6D28D9' }}>
                        PLATFORM
                      </Text>
                    </View>
                  )}

                  <View style={[styles.catBadge, isEmergency ? styles.catEmergency : styles.catGeneral]}>
                    <Text style={isEmergency ? styles.catEmergencyText : styles.catGeneralText}>
                      {normCat.toUpperCase()}
                    </Text>
                  </View>

                  {(isUrgent || isHigh) && (
                    <View style={isUrgent ? styles.priUrgent : styles.priHigh}>
                      <Text style={isUrgent ? styles.priUrgentText : styles.priHighText}>
                        {normPriority.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.annDate, { color: colors.inkSoft }]}>
                  {new Date(ann.createdAt).toLocaleDateString()}
                </Text>
              </View>

              <Text style={[styles.annTitle, { color: colors.navy }]}>{ann.title}</Text>
              <Text style={[styles.annBody, { color: colors.inkSoft }]}>{ann.body}</Text>

              {(ann.scheduledFor || ann.expiresAt) && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                  {ann.scheduledFor && (
                    <Text style={{ fontSize: 11, color: isDark ? '#60A5FA' : '#2563EB', fontWeight: '600' }}>
                      Scheduled: {formatDateTimeInput(ann.scheduledFor)}
                    </Text>
                  )}
                  {ann.expiresAt && (
                    <Text style={{ fontSize: 11, color: colors.inkSoft, fontWeight: '600' }}>
                      Expires: {formatDateTimeInput(ann.expiresAt)}
                    </Text>
                  )}
                </View>
              )}

              {/* Scope & Acknowledgment Bar */}
              <View style={[styles.annMetaRow, { backgroundColor: colors.surfaceSunken }]}>
                <View style={styles.metaLeft}>
                  <Feather name="home" size={12} color={colors.inkSoft} />
                  <Text style={[styles.metaText, { color: colors.inkSoft }]} numberOfLines={1}>
                    {getScopeSummary(ann)} • {getAudienceSummary(ann)}
                  </Text>
                </View>

                {isRequireAck && (
                  <TouchableOpacity
                    style={styles.ackStatRow}
                    onPress={() => setInspectedAnnouncement(ann)}
                    activeOpacity={0.75}
                  >
                    <Feather name="check-circle" size={12} color={isDark ? '#34D399' : '#059669'} />
                    <Text style={[styles.ackStatText, { color: isDark ? '#34D399' : '#059669' }]}>
                      {ackCount} Ack Audit →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Action Buttons Row */}
              {isOwnAnnouncement && (
                <View style={[styles.cardActionsRow, { borderTopColor: colors.line }]}>
                  {(ann.status === 'draft' || ann.status === 'scheduled') && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#059669' }]}
                      onPress={() => handleQuickPublish(ann)}
                      activeOpacity={0.8}
                    >
                      <Feather name="send" size={12} color="#FFFFFF" />
                      <Text style={[styles.actionBtnText, { color: '#FFFFFF', fontWeight: '700' }]}>Publish</Text>
                    </TouchableOpacity>
                  )}

                  {ann.status === 'published' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.surfaceSunken }]}
                      onPress={() => togglePinAnnouncement(ann.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={ann.isPinned ? 'pin' : 'pin-outline'}
                        size={14}
                        color={ann.isPinned ? (isDark ? '#34D399' : '#059669') : colors.inkSoft}
                      />
                      <Text
                        style={[
                          styles.actionBtnText,
                          { color: colors.inkSoft },
                          ann.isPinned && { color: isDark ? '#34D399' : '#059669', fontWeight: '700' },
                        ]}
                      >
                        {ann.isPinned ? 'Unpin' : 'Pin'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.surfaceSunken }]}
                    onPress={() => handleOpenEditor(ann)}
                    activeOpacity={0.8}
                  >
                    <Feather name="edit-2" size={12} color={colors.inkSoft} />
                    <Text style={[styles.actionBtnText, { color: colors.inkSoft }]}>Edit</Text>
                  </TouchableOpacity>

                  {ann.status === 'published' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.surfaceSunken }]}
                      onPress={() => archiveAnnouncement(ann.id)}
                      activeOpacity={0.8}
                    >
                      <Feather name="archive" size={13} color={colors.inkSoft} />
                      <Text style={[styles.actionBtnText, { color: colors.inkSoft }]}>Archive</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => handleDelete(ann.id, ann.title)}
                    activeOpacity={0.8}
                  >
                    <Feather name="trash-2" size={13} color={isDark ? '#F87171' : '#DC2626'} />
                    <Text style={[styles.actionBtnText, { color: isDark ? '#F87171' : '#DC2626' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })
      )}
      <View style={{ height: 90 }} />

      {/* CREATE / EDIT ANNOUNCEMENT MODAL */}
      <Modal
        visible={showEditorModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditorModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          enabled={Platform.OS !== 'web'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>
                  {editingAnnouncement ? 'Edit Announcement' : 'New Broadcast'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowEditorModal(false)}>
                <Ionicons name="close" size={24} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: colors.ink }]}>Announcement Title *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, color: colors.navy }]}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Scheduled Lift Maintenance"
                placeholderTextColor={colors.inkSoft}
              />

              <Text style={[styles.fieldLabel, { color: colors.ink }]}>Category</Text>
              <View style={styles.pillSelectorRow}>
                {(['general', 'maintenance', 'emergency', 'rules', 'event'] as const).map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.pillOption, category === c && styles.pillOptionActive]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={[styles.pillOptionText, category === c && styles.pillOptionTextActive]}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.ink }]}>Priority</Text>
              <View style={styles.pillSelectorRow}>
                {(['normal', 'high', 'urgent'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.pillOption,
                      priority === p && (p === 'urgent' ? styles.pillUrgentActive : styles.pillOptionActive),
                    ]}
                    onPress={() => setPriority(p)}
                  >
                    <Text
                      style={[
                        styles.pillOptionText,
                        priority === p && (p === 'urgent' ? styles.pillUrgentTextActive : styles.pillOptionTextActive),
                      ]}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.ink }]}>Target Scope</Text>
              <View style={styles.pillSelectorRow}>
                {(
                  [
                    { key: 'all', label: 'All Properties' },
                    { key: 'specific', label: 'Specific Property' },
                    { key: 'specific_people', label: `Specific People (${selectedRecipientIds.length})` },
                  ] as const
                ).map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.pillOption, scopeType === item.key && styles.pillOptionActive]}
                    onPress={() => {
                      setScopeType(item.key);
                      if (item.key === 'specific' && !selectedPropertyId && myProperties.length > 0) {
                        setSelectedPropertyId(myProperties[0].id);
                      }
                    }}
                  >
                    <Text style={[styles.pillOptionText, scopeType === item.key && styles.pillOptionTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {scopeType === 'specific' && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.ink }]}>Select Property</Text>
                  <View style={styles.pillSelectorRow}>
                    {myProperties.map((prop) => (
                      <TouchableOpacity
                        key={prop.id}
                        style={[styles.pillOption, selectedPropertyId === prop.id && styles.pillOptionActive]}
                        onPress={() => setSelectedPropertyId(prop.id)}
                      >
                        <Text style={[styles.pillOptionText, selectedPropertyId === prop.id && styles.pillOptionTextActive]}>
                          {prop.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {scopeType !== 'specific_people' && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.ink }]}>Target Audience Roles</Text>
                  <View style={styles.pillSelectorRow}>
                    {(
                      [
                        { key: 'tenant', label: 'Tenants' },
                        { key: 'staff', label: 'Staff' },
                        { key: 'manager', label: 'Managers' },
                      ] as const
                    ).map((r) => {
                      const active = targetRoles.includes(r.key);
                      return (
                        <TouchableOpacity
                          key={r.key}
                          style={[styles.pillOption, active && styles.pillOptionActive]}
                          onPress={() => toggleTargetRole(r.key)}
                        >
                          <Text style={[styles.pillOptionText, active && styles.pillOptionTextActive]}>
                            {active ? '✓ ' : ''}{r.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {scopeType === 'specific_people' && (
                <View style={[styles.recipientBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy }}>
                      Select Recipients ({selectedRecipientIds.length})
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity
                        onPress={() => {
                          const ids = filteredCandidates.map((c) => c.id);
                          setSelectedRecipientIds((prev) => Array.from(new Set([...prev, ...ids])));
                        }}
                      >
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#10B981' }}>
                          Select All ({filteredCandidates.length})
                        </Text>
                      </TouchableOpacity>
                      {selectedRecipientIds.length > 0 && (
                        <TouchableOpacity onPress={() => setSelectedRecipientIds([])}>
                          <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.inkSoft }}>Clear</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.navy, marginBottom: 8 }]}
                    value={recipientSearchQuery}
                    onChangeText={setRecipientSearchQuery}
                    placeholder="Search tenant, staff, unit..."
                    placeholderTextColor={colors.inkSoft}
                  />

                  <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                    {filteredCandidates.length === 0 ? (
                      <Text style={{ fontSize: 12, color: colors.inkSoft, textAlign: 'center', paddingVertical: 12 }}>
                        No recipients match your search.
                      </Text>
                    ) : (
                      filteredCandidates.map((c) => {
                        const isSelected = selectedRecipientIds.includes(c.id);
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={[
                              styles.candidateRow,
                              { borderBottomColor: colors.line },
                              isSelected && { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5' },
                            ]}
                            onPress={() =>
                              setSelectedRecipientIds((prev) =>
                                isSelected ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                              )
                            }
                          >
                            <Feather
                              name={isSelected ? 'check-square' : 'square'}
                              size={16}
                              color={isSelected ? '#10B981' : colors.inkSoft}
                            />
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.navy }}>
                                {c.name} {c.unit ? `• Unit ${c.unit}` : ''}
                              </Text>
                              <Text style={{ fontSize: 11, color: colors.inkSoft }}>
                                {c.propertyName} ({c.role})
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}

              <Text style={[styles.fieldLabel, { color: colors.ink }]}>Message Content *</Text>
              <TextInput
                style={[styles.input, { height: 90, textAlignVertical: 'top', backgroundColor: colors.surfaceSunken, borderColor: colors.line, color: colors.navy }]}
                value={body}
                onChangeText={setBody}
                placeholder="Write the full announcement details..."
                placeholderTextColor={colors.inkSoft}
                multiline
              />

              <View style={[styles.toggleRow, { borderBottomColor: colors.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toggleTitle, { color: colors.navy }]}>Pin to Top</Text>
                  <Text style={[styles.toggleSub, { color: colors.inkSoft }]}>Keep at the top of resident dashboard</Text>
                </View>
                <Switch
                  value={pinToTop}
                  onValueChange={setPinToTop}
                  trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                />
              </View>

              <View style={[styles.toggleRow, { borderBottomColor: colors.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toggleTitle, { color: colors.navy }]}>Require Acknowledgment</Text>
                  <Text style={[styles.toggleSub, { color: colors.inkSoft }]}>Recipients must confirm they read it</Text>
                </View>
                <Switch
                  value={ackRequired}
                  onValueChange={setAckRequired}
                  trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                />
              </View>

              <Text style={[styles.fieldLabel, { color: colors.ink }]}>Publish Mode</Text>
              <View style={styles.pillSelectorRow}>
                {(['published', 'draft', 'scheduled'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.pillOption, publishStatus === m && styles.pillOptionActive]}
                    onPress={() => setPublishStatus(m)}
                  >
                    <Text style={[styles.pillOptionText, publishStatus === m && styles.pillOptionTextActive]}>
                      {m === 'published' ? 'Publish Now' : m === 'draft' ? 'Save Draft' : 'Schedule'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {publishStatus === 'scheduled' && (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.ink }]}>
                    Scheduled For * (YYYY-MM-DD HH:mm)
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, color: colors.navy }]}
                    value={scheduledDateInput}
                    onChangeText={setScheduledDateInput}
                    placeholder="e.g. 2026-11-25 09:00"
                    placeholderTextColor={colors.inkSoft}
                    autoCapitalize="none"
                  />
                </>
              )}

              <Text style={[styles.fieldLabel, { color: colors.ink }]}>
                Expires At (Optional, YYYY-MM-DD or YYYY-MM-DD HH:mm)
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, color: colors.navy }]}
                value={expiresDateInput}
                onChangeText={setExpiresDateInput}
                placeholder="e.g. 2026-12-01 23:59"
                placeholderTextColor={colors.inkSoft}
                autoCapitalize="none"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <TouchableOpacity
                  style={[styles.draftSecondaryBtn, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}
                  onPress={() => handleSaveAnnouncement(true)}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: colors.navy, fontSize: 13, fontWeight: '700' }}>Save Draft</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 1, marginTop: 0 }]}
                  onPress={() => handleSaveAnnouncement(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.submitBtnText}>
                    {editingAnnouncement
                      ? 'Update Announcement'
                      : publishStatus === 'published'
                      ? 'Broadcast Now'
                      : publishStatus === 'scheduled'
                      ? 'Schedule Notice'
                      : 'Save Draft'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ACKNOWLEDGMENT AUDIT MODAL */}
      <Modal
        visible={Boolean(inspectedAnnouncement)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setInspectedAnnouncement(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Acknowledgment Audit</Text>
                <Text style={[styles.modalSub, { color: colors.inkSoft }]} numberOfLines={1}>
                  {inspectedAnnouncement?.title}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setInspectedAnnouncement(null)}>
                <Ionicons name="close" size={24} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <View style={[styles.auditSummaryBox, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>
                {inspectedAuditRecipients.filter((r) => r.confirmed).length} of {inspectedAuditRecipients.length} Confirmed
              </Text>
              <Text style={{ fontSize: 11.5, color: colors.inkSoft, marginTop: 2 }}>
                Scope: {inspectedAnnouncement ? getScopeSummary(inspectedAnnouncement) : ''}
              </Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
              {inspectedAuditRecipients.length === 0 ? (
                <Text style={{ fontSize: 12.5, color: colors.inkSoft, textAlign: 'center', paddingVertical: 20 }}>
                  No target recipients found for this scope.
                </Text>
              ) : (
                inspectedAuditRecipients.map((r) => (
                  <View key={r.id} style={[styles.auditRow, { borderBottomColor: colors.line }]}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>{r.name}</Text>
                      <Text style={{ fontSize: 11, color: colors.inkSoft }}>
                        {r.unit ? `Unit ${r.unit} • ` : ''}{r.role}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: '700',
                          color: r.confirmed ? (isDark ? '#34D399' : '#059669') : isDark ? '#FBBF24' : '#D97706',
                        }}
                      >
                        {r.confirmed ? '✓ Confirmed' : '⏳ Pending'}
                      </Text>
                      {r.confirmed && r.acknowledgedAt ? (
                        <Text style={{ fontSize: 10, color: colors.inkSoft, marginTop: 2 }}>
                          {new Date(r.acknowledgedAt).toLocaleDateString()}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 24,
    },
    fabButton: {
      position: 'absolute',
      bottom: 16,
      right: 14,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#059669',
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 20,
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    fabButtonText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
      marginLeft: 5,
    },
    tabContainer: {
      flexDirection: 'row',
      borderRadius: 10,
      padding: 3,
      gap: 2,
    },
    tabButton: {
      paddingVertical: 6,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    tabButtonActive: {
      borderWidth: 1,
    },
    tabText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    tabTextActive: {
      fontWeight: '700',
    },
    searchRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
      alignItems: 'center',
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      padding: 0,
    },
    filterToggleBtn: {
      width: 40,
      height: 38,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filtersPanel: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
    },
    filterGroupLabel: {
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 1,
      marginTop: 10,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginTop: 12,
    },
    emptySub: {
      fontSize: 12.5,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 18,
    },
    annCard: {
      borderRadius: 12,
      borderWidth: 1,
      padding: 14,
      marginBottom: 12,
    },
    annCardPinned: {
      borderColor: isDark ? 'rgba(16, 185, 129, 0.5)' : '#A7F3D0',
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.06)' : '#FAFCFA',
    },
    annTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    badgesCluster: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      flex: 1,
    },
    pinnedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    pinnedText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: isDark ? '#34D399' : '#059669',
    },
    catBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 4,
    },
    catGeneral: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.18)' : '#EFF6FF',
    },
    catGeneralText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: isDark ? '#60A5FA' : '#2563EB',
    },
    catEmergency: {
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.18)' : '#FEF2F2',
    },
    catEmergencyText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: isDark ? '#F87171' : '#DC2626',
    },
    priUrgent: {
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.18)' : '#FEF2F2',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    priUrgentText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: isDark ? '#F87171' : '#DC2626',
    },
    priHigh: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.18)' : '#FEF3C7',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    priHighText: {
      fontSize: 9.5,
      fontWeight: '700',
      color: isDark ? '#FBBF24' : '#D97706',
    },
    annDate: {
      fontSize: 11,
      marginLeft: 6,
    },
    annTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    annBody: {
      fontSize: 12.5,
      lineHeight: 18,
      marginBottom: 10,
    },
    annMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      marginBottom: 10,
      gap: 8,
    },
    metaLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flex: 1,
    },
    metaText: {
      fontSize: 11.5,
      flex: 1,
    },
    ackStatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    ackStatText: {
      fontSize: 11.5,
      fontWeight: '700',
    },
    cardActionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      borderTopWidth: 1,
      paddingTop: 10,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 6,
    },
    actionBtnText: {
      fontSize: 12,
      fontWeight: '600',
    },
    deleteBtn: {
      marginLeft: 'auto',
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.15)' : '#FEF2F2',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 28,
      maxHeight: '88%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
    },
    modalSub: {
      fontSize: 12,
      marginTop: 2,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 6,
      marginTop: 10,
    },
    input: {
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
    },
    pillSelectorRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 4,
    },
    pillOption: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: colors.surfaceSunken,
      borderWidth: 1,
      borderColor: colors.line,
    },
    pillOptionActive: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5',
      borderColor: '#059669',
    },
    pillOptionText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    pillOptionTextActive: {
      color: isDark ? '#34D399' : '#059669',
      fontWeight: '700',
    },
    pillUrgentActive: {
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.18)' : '#FEF2F2',
      borderColor: '#DC2626',
    },
    pillUrgentTextActive: {
      color: isDark ? '#F87171' : '#DC2626',
      fontWeight: '700',
    },
    recipientBox: {
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
      marginTop: 8,
    },
    candidateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderBottomWidth: 1,
      borderRadius: 6,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
    },
    toggleTitle: {
      fontSize: 13,
      fontWeight: '600',
    },
    toggleSub: {
      fontSize: 11,
      marginTop: 1,
    },
    draftSecondaryBtn: {
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtn: {
      backgroundColor: '#059669',
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    auditSummaryBox: {
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 10,
    },
    auditRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
    },
  });
