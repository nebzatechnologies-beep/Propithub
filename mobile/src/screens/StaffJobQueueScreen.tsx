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
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { getStaffReminders, DashboardReminder } from '../lib/reminders';
import { MobileTicket, MobileStaffScheduleItem } from '../types';

interface StaffJobQueueScreenProps {
  onProfilePress?: () => void;
}

export const StaffJobQueueScreen: React.FC<StaffJobQueueScreenProps> = ({ onProfilePress }) => {
  const { colors, isDark } = useMobileTheme();
  const { state, updateTicket, saveStaffSchedule } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency, currencySymbol } = useMobileCurrency();

  const [activeTab, setActiveTab] = useState<'queue' | 'schedule'>('queue');

  // Job Status Update / Completion Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<MobileTicket | null>(null);
  const [statusInput, setStatusInput] = useState<'in_progress' | 'resolved'>('resolved');
  const [completionNotes, setCompletionNotes] = useState('');
  const [laborAmount, setLaborAmount] = useState('600');
  const [partsAmount, setPartsAmount] = useState('250');

  // Work Schedule state
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [schedDay, setSchedDay] = useState('Today');
  const [schedJob, setSchedJob] = useState('');
  const [schedUnit, setSchedUnit] = useState('');
  const [schedTime, setSchedTime] = useState('09:00 AM - 11:00 AM');

  // Filter tickets assigned to current staff member
  const myTickets = useMemo(() => {
    return state.tickets.filter((t) => {
      if (user.ownerId && t.ownerId && t.ownerId !== user.ownerId) return false;
      const isDirectlyAssigned =
        t.assignedStaffId === user.id ||
        (Boolean(user.displayName) && Boolean(t.assignedStaffName) && t.assignedStaffName!.toLowerCase().includes(user.displayName.toLowerCase()));
      const isAssignedProperty = Boolean(user.assignedProperties?.length && t.propertyId && user.assignedProperties.includes(t.propertyId));
      return isDirectlyAssigned || isAssignedProperty;
    });
  }, [state.tickets, user]);

  const unifiedSchedule = useMemo(() => {
    return [
      ...(state.staffSchedules || []).filter((s) => s.staffId === user.id),
      ...myTickets
        .filter((t) => t.status === 'in_progress')
        .map((t) => ({
          day: 'Active Dispatch',
          job: `${t.priority.toUpperCase()}: ${t.issue}`,
          unit: `Unit ${t.unit}`,
          time: t.preferredTimeSlot || 'In Progress',
          staffId: user.id,
        })),
    ];
  }, [state.staffSchedules, myTickets, user.id]);

  const activeJobs = myTickets.filter((t) => t.status === 'open' || t.status === 'assigned' || t.status === 'in_progress');
  const resolvedJobs = myTickets.filter((t) => t.status === 'resolved');

  // Real-time Staff Reminders & Work Order Priority Dispatch
  const staffReminders = useMemo(() => {
    return getStaffReminders(state, user);
  }, [state, user]);

  // Operational Bulletins for staff
  const staffBulletins = useMemo(() => {
    return (state.announcements || []).filter(
      (a) =>
        a.status === 'published' &&
        (!user.ownerId || a.ownerId === user.ownerId) &&
        (!a.targetRoles || a.targetRoles.includes('staff'))
    );
  }, [state.announcements, user.ownerId]);

  const handleDialPhone = (phone?: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No contact phone number registered for this resident.');
      return;
    }
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {
      Alert.alert('Calling', `Dialing ${phone}...`);
    });
  };

  const handleSendEmail = (email?: string) => {
    if (!email) {
      Alert.alert('No Email', 'No contact email registered for this resident.');
      return;
    }
    Linking.openURL(`mailto:${email}`).catch(() => {
      Alert.alert('Email', `Opening mail client for ${email}...`);
    });
  };

  const handleStartWorkOrder = (ticket: MobileTicket) => {
    updateTicket(ticket.id, {
      status: 'in_progress',
    });
    Alert.alert('Work Order Started 🔧', `Ticket #${ticket.id} (${ticket.issue}) is now in progress. Resident notified.`);
  };

  const handleOpenStatusModal = (ticket: MobileTicket) => {
    setSelectedTicket(ticket);
    setStatusInput(ticket.status === 'in_progress' ? 'resolved' : 'in_progress');
    setCompletionNotes(ticket.completionNotes || '');
    setShowStatusModal(true);
  };

  const handleSaveStatus = () => {
    if (!selectedTicket) return;

    const totalEstimate = (Number(laborAmount) || 0) + (Number(partsAmount) || 0);
    updateTicket(selectedTicket.id, {
      status: statusInput,
      completionNotes: completionNotes.trim() || undefined,
      costEstimate: totalEstimate > 0 ? totalEstimate : selectedTicket.costEstimate,
    });

    setShowStatusModal(false);
    Alert.alert(
      statusInput === 'resolved' ? 'Work Completed ✓' : 'Status Updated',
      `Ticket #${selectedTicket.id} updated to ${statusInput === 'resolved' ? 'Resolved' : 'In Progress'}. Total job charges: ${format(totalEstimate, viewCurrency)}.`
    );
    setSelectedTicket(null);
  };

  const handleAddScheduleEntry = () => {
    if (!schedJob.trim() || !schedUnit.trim()) {
      Alert.alert('Required Fields', 'Please enter a job description and unit number.');
      return;
    }

    const newEntry: MobileStaffScheduleItem = {
      day: schedDay,
      job: schedJob.trim(),
      unit: schedUnit.trim(),
      time: schedTime.trim(),
      staffId: user.id,
    };

    saveStaffSchedule(newEntry);
    setShowAddScheduleModal(false);
    setSchedJob('');
    setSchedUnit('');
    Alert.alert('Shift Scheduled 📅', `Added shift for ${schedDay} at ${schedUnit}.`);
  };


  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);



  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Feather name="home" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>Jobs</Text>
          </View>
        </View>
        <TourTarget id="staff-topbar-actions">
        <TouchableOpacity
          style={styles.jobBadge}
          onPress={onProfilePress}
          activeOpacity={0.8}
        >
          <Text style={styles.jobBadgeText}>{activeJobs.length} ACTIVE</Text>
        </TouchableOpacity>
        </TourTarget>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation Tabs Capsule: Ticket Queue vs Work Schedule */}
        <TourTarget id="staff-queue-subtabs">
        <View style={[styles.tabContainer, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'queue' && styles.tabButtonActive]}
            onPress={() => setActiveTab('queue')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="list"
              size={15}
              color={activeTab === 'queue' ? '#FFFFFF' : colors.inkSoft}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, { color: colors.inkSoft }, activeTab === 'queue' && styles.tabTextActive]}>
              Queue ({activeJobs.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'schedule' && styles.tabButtonActive]}
            onPress={() => setActiveTab('schedule')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="calendar"
              size={15}
              color={activeTab === 'schedule' ? '#FFFFFF' : colors.inkSoft}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, { color: colors.inkSoft }, activeTab === 'schedule' && styles.tabTextActive]}>
              Schedule ({unifiedSchedule.length})
            </Text>
          </TouchableOpacity>
        </View>

        </TourTarget>

        {/* Operational Staff Bulletins (if any) */}
        {staffBulletins.length > 0 && (
          <View style={[styles.bulletinBox, isDark && { backgroundColor: '#064E3B20', borderColor: '#065F46' }]}>
            <View style={styles.bulletinHeader}>
              <Ionicons name="megaphone-outline" size={16} color="#059669" />
              <Text style={[styles.bulletinTitle, isDark && { color: '#6EE7B7' }]}>Bulletins</Text>
            </View>
            {staffBulletins.slice(0, 2).map((b) => (
              <View key={b.id} style={styles.bulletinItem}>
                <View style={styles.bulletinBadge}>
                  <Text style={styles.bulletinBadgeText}>{b.category.toUpperCase()}</Text>
                </View>
                <Text style={[styles.bulletinText, isDark && { color: '#A7F3D0' }]} numberOfLines={2}>
                  <Text style={{ fontWeight: '700' }}>{b.title}: </Text>
                  {b.body}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* TAB 1: TICKET QUEUE */}
        {activeTab === 'queue' && (
          <View>
            {/* Priority Staff Reminders & Work Order Alert Hub */}
            {staffReminders.length > 0 && (
              <View style={{ marginBottom: 14 }}>
                {staffReminders.map((rem) => {
                  const isUrgent = rem.severity === 'urgent';
                  const borderCol = isUrgent ? '#EF4444' : '#F59E0B';
                  const bgCol = isUrgent
                    ? isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2'
                    : isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB';

                  return (
                    <View
                      key={rem.id}
                      style={{
                        backgroundColor: bgCol,
                        borderWidth: 1,
                        borderColor: borderCol,
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Feather
                          name={isUrgent ? 'alert-triangle' : 'tool'}
                          size={15}
                          color={isUrgent ? '#EF4444' : '#D97706'}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '700',
                            color: isUrgent ? (isDark ? '#FCA5A5' : '#B91C1C') : (isDark ? '#FDE68A' : '#92400E'),
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {rem.title}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 12,
                          color: isDark ? '#E2E8F0' : '#475569',
                          lineHeight: 17,
                          marginBottom: 10,
                        }}
                      >
                        {rem.description}
                      </Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                        <TouchableOpacity
                          style={{
                            backgroundColor: isUrgent ? '#EF4444' : '#10B981',
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 6,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                          onPress={() => {
                            const ticketId = rem.id.replace('staff_ticket_job_', '');
                            const matchedTicket = state.tickets.find((t) => t.id === ticketId);
                            if (matchedTicket) {
                              setSelectedTicket(matchedTicket);
                              setStatusInput(matchedTicket.status === 'in_progress' ? 'resolved' : 'in_progress');
                              setShowStatusModal(true);
                            }
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                            Inspect Work Order
                          </Text>
                          <Feather name="arrow-right" size={12} color="#FFFFFF" style={{ marginLeft: 4 }} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Hero Work Order Status Card */}
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.heroTopRow}>
                <Text style={[styles.heroLabel, { color: colors.inkSoft }]}>Work Order Queue</Text>
                <View style={styles.heroPillBadge}>
                  <Feather name="tool" size={12} color="#059669" />
                  <Text style={styles.heroPillText}>
                    {activeJobs.length === 0 ? 'All Clear' : `${activeJobs.length} Assigned`}
                  </Text>
                </View>
              </View>
              <Text style={[styles.heroAmount, { color: colors.navy }]}>{activeJobs.length} Active</Text>
              <Text style={[styles.heroSubText, { color: colors.inkSoft }]}>
                {activeJobs.filter((t) => t.status === 'in_progress').length} in progress • {activeJobs.filter((t) => t.priority === 'Emergency' || t.priority === 'High').length} high priority
              </Text>
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.navy }]}>Assigned Jobs ({activeJobs.length})</Text>
            </View>

            {activeJobs.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Ionicons name="checkmark-done-circle-outline" size={48} color="#10B981" />
                <Text style={[styles.emptyTitle, { color: colors.navy }]}>Queue All Clear!</Text>
                <Text style={[styles.emptyText, { color: colors.inkSoft }]}>
                  No pending repair orders assigned. New tenant maintenance tickets will appear here.
                </Text>
              </View>
            ) : (
              activeJobs.map((t) => {
                const isEmergency = t.priority === 'Emergency';
                const isHigh = t.priority === 'High';
                const isInProgress = t.status === 'in_progress';

                return (
                  <View key={t.id} style={[styles.ticketCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <View style={styles.ticketTopRow}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.ticketId, { color: colors.navy }]}>#{t.id}</Text>
                          <View style={[styles.categoryBadge, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]}>
                            <Text style={[styles.categoryBadgeText, { color: colors.inkSoft }]}>{t.category}</Text>
                          </View>
                        </View>
                        <Text style={[styles.unitText, { color: colors.inkSoft }]}>Unit {t.unit} • {t.propertyName || 'Property'}</Text>
                      </View>

                      <View
                        style={[
                          styles.priorityBadge,
                          isEmergency ? styles.priorityBadgeEmergency : isHigh ? styles.priorityBadgeHigh : { backgroundColor: isDark ? colors.card : '#F1F5F9' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.priorityBadgeText,
                            isEmergency && styles.priorityBadgeTextEmergency,
                            isHigh && styles.priorityBadgeTextHigh,
                          ]}
                        >
                          {t.priority.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.issueText, { color: colors.navy }]}>{t.issue}</Text>

                    {/* Resident Contact Dialing Bar */}
                    <View style={[styles.residentContactBar, { backgroundColor: isDark ? colors.card : '#F8FAFC', borderColor: colors.line }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.residentLabel, { color: colors.inkSoft }]}>RESIDENT</Text>
                        <Text style={[styles.residentName, { color: colors.navy }]}>{t.tenant || 'Tenant'}</Text>
                      </View>

                      <View style={styles.contactActionsRow}>
                        <TouchableOpacity
                          style={[styles.contactIconBtn, { backgroundColor: colors.surface, borderColor: colors.line }]}
                          onPress={() => handleDialPhone(t.tenantPhone)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="call" size={16} color="#059669" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.contactIconBtn, { backgroundColor: colors.surface, borderColor: colors.line }]}
                          onPress={() => handleSendEmail(t.tenantEmail || 'resident@propithub.com')}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="mail" size={16} color="#2563EB" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.ticketFooterRow}>
                      {!isInProgress ? (
                        <TouchableOpacity
                          style={styles.startJobBtn}
                          onPress={() => handleStartWorkOrder(t)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="play" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.startJobBtnText}>Start Job</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.completeJobBtn}
                          onPress={() => handleOpenStatusModal(t)}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="checkmark-done" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.completeJobBtnText}>Update Status</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}

            {/* Resolved History Section */}
            {resolvedJobs.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.sectionHeading, { color: colors.navy }]}>Resolved Today ({resolvedJobs.length})</Text>
                {resolvedJobs.slice(0, 3).map((rj) => (
                  <View key={rj.id} style={[styles.resolvedMiniCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resolvedMiniTitle, { color: colors.navy }]}>Unit {rj.unit} • {rj.issue}</Text>
                      <Text style={[styles.resolvedMiniNotes, { color: colors.inkSoft }]}>{rj.completionNotes || 'Work completed successfully'}</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* TAB 2: WORK SCHEDULE */}
        {activeTab === 'schedule' && (
          <View>
            <View style={styles.scheduleHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.navy }]}>Scheduled Shifts ({unifiedSchedule.length})</Text>
              <TouchableOpacity
                style={styles.addScheduleBtn}
                onPress={() => setShowAddScheduleModal(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.addScheduleBtnText}>Add Shift</Text>
              </TouchableOpacity>
            </View>

            {unifiedSchedule.length === 0 ? (
              <View style={{ padding: 28, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, marginHorizontal: 16, borderWidth: 1, borderColor: colors.line }}>
                <Ionicons name="calendar-outline" size={28} color="#94A3B8" style={{ marginBottom: 8 }} />
                <Text style={{ color: colors.navy, fontWeight: '600', fontSize: 14 }}>No Scheduled Shifts</Text>
                <Text style={{ color: colors.inkSoft, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                  No scheduled shifts or active dispatches. Tap 'Add Shift' above to create a schedule slot.
                </Text>
              </View>
            ) : null}

            {unifiedSchedule.map((item, idx) => (
              <View key={idx} style={[styles.scheduleCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={styles.scheduleTimeRow}>
                  <View style={[styles.scheduleDayBadge, isDark && { backgroundColor: '#312E81' }]}>
                    <Text style={[styles.scheduleDayText, isDark && { color: '#A5B4FC' }]}>{item.day}</Text>
                  </View>
                  <View style={styles.scheduleTimeBadge}>
                    <Ionicons name="time-outline" size={13} color={colors.inkSoft} style={{ marginRight: 4 }} />
                    <Text style={[styles.scheduleTimeText, { color: colors.inkSoft }]}>{item.time}</Text>
                  </View>
                </View>

                <Text style={[styles.scheduleJobText, { color: colors.navy }]}>{item.job}</Text>
                <View style={styles.scheduleUnitRow}>
                  <Ionicons name="location-outline" size={14} color={colors.inkSoft} style={{ marginRight: 4 }} />
                  <Text style={[styles.scheduleUnitText, { color: colors.inkSoft }]}>{item.unit} • On-Site Service</Text>
                </View>
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* Completion & Status Modal */}
      <Modal visible={showStatusModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.navy }]}>Update Ticket #{selectedTicket?.id}</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                <Ionicons name="close" size={24} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.modalSub, { color: colors.inkSoft }]}>
                {selectedTicket?.issue} (Unit {selectedTicket?.unit})
              </Text>

              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>WORK STATUS</Text>
              <View style={styles.statusToggleRow}>
                <TouchableOpacity
                  style={[styles.statusToggleBtn, { borderColor: colors.line }, statusInput === 'in_progress' && styles.statusToggleBtnActive]}
                  onPress={() => setStatusInput('in_progress')}
                >
                  <Text style={[styles.statusToggleText, { color: colors.inkSoft }, statusInput === 'in_progress' && styles.statusToggleTextActive]}>
                    In Progress
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.statusToggleBtn, { borderColor: colors.line }, statusInput === 'resolved' && styles.statusToggleBtnActive]}
                  onPress={() => setStatusInput('resolved')}
                >
                  <Text style={[styles.statusToggleText, { color: colors.inkSoft }, statusInput === 'resolved' && styles.statusToggleTextActive]}>
                    Completed & Resolved
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>COMPLETION / TECHNICIAN NOTES</Text>
              <TextInput
                style={[styles.notesInput, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                multiline
                numberOfLines={3}
                value={completionNotes}
                onChangeText={setCompletionNotes}
                placeholder="Describe work completed, parts replaced, or ongoing diagnostics..."
                placeholderTextColor={colors.inkSoft}
              />

              <View style={styles.costGridRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>LABOR FEE ({currencySymbol})</Text>
                  <TextInput
                    style={[styles.costInput, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                    keyboardType="numeric"
                    value={laborAmount}
                    onChangeText={setLaborAmount}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>PARTS COST ({currencySymbol})</Text>
                  <TextInput
                    style={[styles.costInput, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                    keyboardType="numeric"
                    value={partsAmount}
                    onChangeText={setPartsAmount}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.saveStatusBtn} onPress={handleSaveStatus} activeOpacity={0.85}>
                <Text style={styles.saveStatusBtnText} numberOfLines={1}>Save</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Work Schedule Modal */}
      <Modal visible={showAddScheduleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.navy }]}>Add Work Shift</Text>
              <TouchableOpacity onPress={() => setShowAddScheduleModal(false)}>
                <Ionicons name="close" size={24} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>DAY</Text>
              <View style={styles.daySelectorRow}>
                {['Today', 'Tomorrow', 'Thursday', 'Friday'].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dayPill, { backgroundColor: isDark ? colors.card : '#F1F5F9' }, schedDay === d && styles.dayPillActive]}
                    onPress={() => setSchedDay(d)}
                  >
                    <Text style={[styles.dayPillText, { color: colors.inkSoft }, schedDay === d && styles.dayPillTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>JOB DESCRIPTION</Text>
              <TextInput
                style={[styles.singleInput, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                value={schedJob}
                onChangeText={setSchedJob}
                placeholder="e.g. Geyser Element Replacement"
                placeholderTextColor={colors.inkSoft}
              />

              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>UNIT / LOCATION</Text>
              <TextInput
                style={[styles.singleInput, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                value={schedUnit}
                onChangeText={setSchedUnit}
                placeholder="e.g. Unit 201"
                placeholderTextColor={colors.inkSoft}
              />

              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>TIME SLOT</Text>
              <TextInput
                style={[styles.singleInput, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.line, color: colors.navy }]}
                value={schedTime}
                onChangeText={setSchedTime}
                placeholder="e.g. 02:00 PM - 04:00 PM"
                placeholderTextColor={colors.inkSoft}
              />

              <TouchableOpacity style={styles.saveStatusBtn} onPress={handleAddScheduleEntry} activeOpacity={0.85}>
                <Text style={styles.saveStatusBtnText}>Schedule Shift</Text>
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
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  statusBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: colors.surface,
  },
  statusTime: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.navy,
  },
  headerSub: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  jobBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  jobBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#10B981',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  // Hero Work Order Card
  heroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: -0.1,
  },
  heroPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.navy,
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  heroSubText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.inkSoft,
  },
  bulletinBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 16,
  },
  bulletinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  bulletinTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  bulletinItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  bulletinBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bulletinBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
  },
  bulletinText: {
    fontSize: 12,
    color: '#166534',
    flex: 1,
  },
  sectionHeaderRow: {
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.navy,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  ticketCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  ticketTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  ticketId: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  categoryBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  unitText: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
  },
  priorityBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityBadgeEmergency: {
    backgroundColor: '#FEF2F2',
  },
  priorityBadgeHigh: {
    backgroundColor: '#FFFBEB',
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  priorityBadgeTextEmergency: {
    color: '#DC2626',
  },
  priorityBadgeTextHigh: {
    color: '#D97706',
  },
  issueText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.navy,
    lineHeight: 20,
    marginBottom: 12,
  },
  residentContactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  residentLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.5,
  },
  residentName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
    marginTop: 1,
  },
  contactActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  contactIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketFooterRow: {
    marginTop: 2,
  },
  startJobBtn: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  startJobBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  completeJobBtn: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  completeJobBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  resolvedMiniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 8,
  },
  resolvedMiniTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.navy,
  },
  resolvedMiniNotes: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  scheduleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addScheduleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scheduleCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  scheduleTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  scheduleDayBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scheduleDayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  scheduleTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleTimeText: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  scheduleJobText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy,
  },
  scheduleUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  scheduleUnitText: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.navy,
  },
  modalSub: {
    fontSize: 13,
    color: colors.inkSoft,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },
  statusToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  statusToggleBtnActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  statusToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  statusToggleTextActive: {
    color: '#FFFFFF',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: colors.navy,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  costGridRow: {
    flexDirection: 'row',
  },
  costInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy,
  },
  saveStatusBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  saveStatusBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  daySelectorRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  dayPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
  },
  dayPillActive: {
    backgroundColor: '#10B981',
  },
  dayPillText: {
    fontSize: 12,
    color: colors.inkSoft,
    fontWeight: '600',
  },
  dayPillTextActive: {
    color: '#FFFFFF',
  },
  singleInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.navy,
  },
  });
