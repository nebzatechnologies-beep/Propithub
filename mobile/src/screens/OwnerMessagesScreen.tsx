import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Switch,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons, Feather, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { MobileAnnouncement } from '../types';
import { useMobileTheme } from '../context/MobileThemeContext';

interface OwnerMessagesScreenProps {
  onProfilePress?: () => void;
}

export const OwnerMessagesScreen: React.FC<OwnerMessagesScreenProps> = ({ onProfilePress }) => {
  const { colors, isDark } = useMobileTheme();
  const { user } = useMobileAuth();
  const {
    state,
    saveAnnouncement,
    togglePinAnnouncement,
    archiveAnnouncement,
    deleteAnnouncement,
  } = useMobileAppData();

  const [activeTab, setActiveTab] = useState<'published' | 'scheduled' | 'draft' | 'archived'>('published');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State for New Announcement
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<'general' | 'maintenance' | 'emergency' | 'event' | 'rules'>('general');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [pinToTop, setPinToTop] = useState(false);
  const [ackRequired, setAckRequired] = useState(true);
  const [publishStatus, setPublishStatus] = useState<'published' | 'scheduled' | 'draft'>('published');

  const ownerId = user?.id || '';
  const myProperties = useMemo(() => {
    if (!ownerId) return [];
    return (state.properties || []).filter((p) => p.ownerId === ownerId);
  }, [state.properties, ownerId]);

  const myAnnouncements = useMemo(() => {
    if (!ownerId) return [];
    return (state.announcements || []).filter((a) => a.ownerId === ownerId);
  }, [state.announcements, ownerId]);

  // Filtered announcements by tab
  const displayedAnnouncements = useMemo(() => {
    return myAnnouncements.filter((a) => {
      if (activeTab === 'published') return a.status === 'published';
      if (activeTab === 'scheduled') return a.status === 'scheduled';
      if (activeTab === 'draft') return a.status === 'draft';
      if (activeTab === 'archived') return a.status === 'archived';
      return true;
    });
  }, [myAnnouncements, activeTab]);

  const handleCreateAnnouncement = () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Missing Fields', 'Please enter an announcement title and message content.');
      return;
    }

    const targetProp = myProperties.find((p) => p.id === selectedPropertyId);

    const newAnn: MobileAnnouncement = {
      id: `ann-${Date.now()}`,
      ownerId: user.id,
      title: title.trim(),
      body: body.trim(),
      category,
      priority,
      propertyId: selectedPropertyId === 'all' ? undefined : selectedPropertyId,
      propertyName: selectedPropertyId === 'all' ? 'All Properties' : targetProp?.name || 'Property',
      targetRoles: ['tenant'],
      isPinned: pinToTop,
      requireAck: ackRequired,
      status: publishStatus,
      createdAt: new Date().toISOString(),
      acknowledgedBy: [],
    };

    saveAnnouncement(newAnn);
    setShowCreateModal(false);
    setTitle('');
    setBody('');
    setCategory('general');
    setPriority('normal');
    setPinToTop(false);

    Alert.alert(
      'Announcement Saved',
      publishStatus === 'published'
        ? 'Your broadcast has been published to all resident dashboards.'
        : `Your announcement has been saved as ${publishStatus}.`
    );
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
          onPress: () => deleteAnnouncement(id),
        },
      ]
    );
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Header */}
      <Header
        title="Announcements"
        onNotificationPress={() => {}}
        onProfilePress={onProfilePress}
      />

      <View style={[styles.mainContainer, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >

          {/* Navigation Tabs Capsule */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.tabContainer, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}
            style={{ marginBottom: 14 }}
          >
            {(['published', 'scheduled', 'draft', 'archived'] as const).map((tab) => {
              const isSelected = activeTab === tab;
              const count = myAnnouncements.filter((a) => a.status === tab).length;
              const label = tab.charAt(0).toUpperCase() + tab.slice(1);
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabButton, isSelected && [styles.tabButtonActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
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

          {/* Announcements List */}
          {displayedAnnouncements.length === 0 ? (
            <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Feather name="bell" size={36} color={colors.inkSoft} />
              <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Announcements in {activeTab}</Text>
              <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
                Tap the &quot;New Broadcast&quot; button above to create and publish a message to tenants.
              </Text>
            </View>
          ) : (
            displayedAnnouncements.map((ann) => {
              const isUrgent = ann.priority === 'urgent';
              const isHigh = ann.priority === 'high';
              const isEmergency = ann.category === 'emergency';
              const ackCount = ann.acknowledgedBy?.length || 0;

              return (
                <View key={ann.id} style={[styles.annCard, { backgroundColor: colors.surface, borderColor: colors.line }, ann.isPinned && styles.annCardPinned]}>
                  {/* Top Meta Row */}
                  <View style={styles.annTopRow}>
                    <View style={styles.badgesCluster}>
                      {ann.isPinned && (
                        <View style={styles.pinnedPill}>
                          <Ionicons name="pin" size={10} color="#059669" />
                          <Text style={styles.pinnedText}>PINNED</Text>
                        </View>
                      )}

                      <View
                        style={[
                          styles.catBadge,
                          isEmergency ? styles.catEmergency : styles.catGeneral,
                        ]}
                      >
                        <Text
                          style={isEmergency ? styles.catEmergencyText : styles.catGeneralText}
                        >
                          {ann.category.toUpperCase()}
                        </Text>
                      </View>

                      {(isUrgent || isHigh) && (
                        <View style={isUrgent ? styles.priUrgent : styles.priHigh}>
                          <Text style={isUrgent ? styles.priUrgentText : styles.priHighText}>
                            {ann.priority.toUpperCase()}
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

                  {/* Scope & Acknowledgment Bar */}
                  <View style={styles.annMetaRow}>
                    <View style={styles.metaLeft}>
                      <Feather name="home" size={12} color={colors.inkSoft} />
                      <Text style={[styles.metaText, { color: colors.inkSoft }]}>
                        {ann.propertyName || 'All Properties'}
                      </Text>
                    </View>

                    {ann.requireAck && (
                      <View style={styles.ackStatRow}>
                        <Feather name="check-circle" size={12} color="#059669" />
                        <Text style={styles.ackStatText}>
                          {ackCount} Acknowledged
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Action Buttons Row */}
                  <View style={[styles.cardActionsRow, { borderTopColor: colors.line }]}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
                      onPress={() => togglePinAnnouncement(ann.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={ann.isPinned ? 'pin' : 'pin-outline'}
                        size={14}
                        color={ann.isPinned ? '#059669' : '#64748B'}
                      />
                      <Text
                        style={[
                          styles.actionBtnText,
                          ann.isPinned && { color: '#059669', fontWeight: '700' },
                        ]}
                      >
                        {ann.isPinned ? 'Unpin' : 'Pin'}
                      </Text>
                    </TouchableOpacity>

                    {ann.status !== 'archived' && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => archiveAnnouncement(ann.id)}
                        activeOpacity={0.8}
                      >
                        <Feather name="archive" size={13} color="#64748B" />
                        <Text style={styles.actionBtnText}>Archive</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.deleteBtn]}
                      onPress={() => handleDelete(ann.id, ann.title)}
                      activeOpacity={0.8}
                    >
                      <Feather name="trash-2" size={13} color="#DC2626" />
                      <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Floating Action Button: New Broadcast */}
        <TouchableOpacity
          style={styles.fabButton}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={13} color="#FFFFFF" />
          <Text style={styles.fabButtonText}>New Broadcast</Text>
        </TouchableOpacity>
      </View>

      {/* CREATE ANNOUNCEMENT MODAL */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>New Broadcast</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Announcement Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Scheduled Lift Maintenance"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.fieldLabel}>Category</Text>
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

              <Text style={styles.fieldLabel}>Priority</Text>
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

              <Text style={styles.fieldLabel}>Target Scope</Text>
              <View style={styles.pillSelectorRow}>
                <TouchableOpacity
                  style={[styles.pillOption, selectedPropertyId === 'all' && styles.pillOptionActive]}
                  onPress={() => setSelectedPropertyId('all')}
                >
                  <Text style={[styles.pillOptionText, selectedPropertyId === 'all' && styles.pillOptionTextActive]}>
                    All Properties
                  </Text>
                </TouchableOpacity>
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

              <Text style={styles.fieldLabel}>Message Content *</Text>
              <TextInput
                style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
                value={body}
                onChangeText={setBody}
                placeholder="Write the full announcement details..."
                placeholderTextColor="#94A3B8"
                multiline
              />

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Pin to Top</Text>
                  <Text style={styles.toggleSub}>Keep at the top of resident dashboard</Text>
                </View>
                <Switch
                  value={pinToTop}
                  onValueChange={setPinToTop}
                  trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Require Acknowledgment</Text>
                  <Text style={styles.toggleSub}>Tenants must tap confirm to dismiss</Text>
                </View>
                <Switch
                  value={ackRequired}
                  onValueChange={setAckRequired}
                  trackColor={{ false: '#CBD5E1', true: '#10B981' }}
                />
              </View>

              <Text style={styles.fieldLabel}>Publish Mode</Text>
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

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateAnnouncement}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>
                  {publishStatus === 'published' ? 'Broadcast Announcement' : 'Save Announcement'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative',
  },
  scroll: {
    flex: 1,
  },
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  fabButtonText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    marginLeft: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  tabButton: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  tabTextActive: {
    color: colors.navy,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12.5,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  annCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 12,
  },
  annCardPinned: {
    borderColor: '#A7F3D0',
    backgroundColor: '#FAFCFA',
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
  },
  pinnedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pinnedText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#059669',
  },
  catBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  catGeneral: {
    backgroundColor: '#EFF6FF',
  },
  catGeneralText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  catEmergency: {
    backgroundColor: '#FEF2F2',
  },
  catEmergencyText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  priUrgent: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priUrgentText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  priHigh: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priHighText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#D97706',
  },
  annDate: {
    fontSize: 11,
    color: colors.inkSoft,
  },
  annTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 4,
  },
  annBody: {
    fontSize: 12.5,
    color: colors.inkSoft,
    lineHeight: 18,
    marginBottom: 10,
  },
  annMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11.5,
    color: colors.inkSoft,
  },
  ackStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ackStatText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#059669',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  deleteBtn: {
    marginLeft: 'auto',
    backgroundColor: '#FEF2F2',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 34,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.navy,
  },
  modalSub: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.navy,
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
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillOptionActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  pillOptionText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  pillOptionTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  pillUrgentActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
  },
  pillUrgentTextActive: {
    color: '#DC2626',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  toggleTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.navy,
  },
  toggleSub: {
    fontSize: 11,
    color: colors.inkSoft,
  },
  submitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  });
