import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { getManagerReminders, DashboardReminder } from '../lib/reminders';
import { MobileTicket } from '../types';

interface ManagerOperationsScreenProps {
  onProfilePress?: () => void;
  onNavigate?: (screenKey: string) => void;
}

export const ManagerOperationsScreen: React.FC<ManagerOperationsScreenProps> = ({
  onProfilePress,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state } = useMobileAppData();
  const { user } = useMobileAuth();

  const ownerId = user?.ownerId || '';
  const ownerName = user?.ownerName || 'Portfolio Owner';
  const { isTrial, daysLeft } = usePlanLimits(ownerId);

  // 1. Scoped Properties & Units (exact match to Web ManagerDashboardPage)
  const myProperties = useMemo(() => {
    if (!ownerId && !user?.assignedProperties?.length) return [];
    const props = state.properties.filter((p) => {
      if (ownerId && p.ownerId === ownerId) return true;
      if (user?.assignedProperties?.includes(p.id)) return true;
      return false;
    });
    const explicitlyAssigned = props.filter(
      (p) => p.assignedManagerId === user?.id || user?.assignedProperties?.includes(p.id)
    );
    return explicitlyAssigned.length > 0 ? explicitlyAssigned : props;
  }, [state.properties, ownerId, user?.id, user?.assignedProperties]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    return state.units.filter((u) => u.propertyId && myPropertyIds.has(u.propertyId));
  }, [state.units, myPropertyIds]);

  const myTickets = useMemo(() => {
    return state.tickets.filter((t) => t.propertyId && myPropertyIds.has(t.propertyId));
  }, [state.tickets, myPropertyIds]);

  const myStaff = useMemo(() => {
    if (!ownerId) return [];
    return state.staff.filter((s) => s.ownerId === ownerId);
  }, [state.staff, ownerId]);

  const myAgreements = useMemo(() => {
    return state.agreements.filter((a) => a.propertyId && myPropertyIds.has(a.propertyId));
  }, [state.agreements, myPropertyIds]);
  const activeAgreements = myAgreements.filter((a) => a.status === 'active');

  // 2. Operational Metrics
  const occupiedUnits = myUnits.filter((u) => u.status === 'occupied').length;
  const vacantUnits = myUnits.filter((u) => u.status === 'vacant').length;
  const occupancyRate = myUnits.length > 0 ? Math.round((occupiedUnits / myUnits.length) * 100) : 0;
  const activeTickets = myTickets.filter((t) => t.status !== 'resolved');
  const highPriorityTickets = activeTickets.filter(
    (t) => t.priority === 'High' || t.priority === 'Emergency'
  );

  // 3. Manager Reminders (Action Center using getManagerReminders)
  const managerReminders = useMemo(() => {
    return getManagerReminders(state, user);
  }, [state, user]);

  // 4. Targeted Manager Bulletins
  const managerBulletins = useMemo(() => {
    return (state.announcements || [])
      .filter((a) => a.status === 'published' && (!a.targetRoles || a.targetRoles.includes('manager')))
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [state.announcements]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Header */}
      <Header
        title="Propithub"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Organization Free Trial Info Banner */}
        {isTrial && daysLeft > 0 && (
          <View style={[styles.orgTrialBanner, isDark && { backgroundColor: '#78350F' }]}>
            <Feather name="info" size={15} color={isDark ? '#FDE68A' : '#B45309'} style={{ marginRight: 8 }} />
            <Text style={[styles.orgTrialBannerText, isDark && { color: '#FDE68A' }]}>
              Organization on Free Trial ({daysLeft} days remaining).
            </Text>
          </View>
        )}

        {/* 2. Operations Action Center & Reminders (Web Title & Layout) */}
        {managerReminders.length > 0 && (
          <View style={styles.actionCenterSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="zap" size={16} color="#B45309" />
                <Text style={[styles.sectionHeading, { color: colors.navy }]}>Action Center</Text>
              </View>
              <View style={[styles.actionCountBadge, isDark && { backgroundColor: '#1E293B' }]}>
                <Text style={[styles.actionCountText, { color: colors.inkSoft }]}>{managerReminders.length} Actions</Text>
              </View>
            </View>

            {managerReminders.map((rem) => {
              const isUrgent = rem.severity === 'urgent';
              return (
                <View
                  key={rem.id}
                  style={[
                    styles.reminderCard,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                    isUrgent && { borderLeftColor: '#DC2626' },
                  ]}
                >
                  <View style={styles.reminderCardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View
                          style={[
                            styles.severityPill,
                            isUrgent ? styles.severityPillUrgent : styles.severityPillWarning,
                          ]}
                        >
                          <Text
                            style={[
                              styles.severityPillText,
                              isUrgent ? { color: '#DC2626' } : { color: '#B45309' },
                            ]}
                          >
                            {isUrgent ? 'CRITICAL' : 'ACTION'}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.reminderTitle, { color: colors.navy }]}>{rem.title}</Text>
                      <Text style={[styles.reminderDesc, { color: colors.inkSoft }]}>{rem.description}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.reminderActionBtn,
                      isUrgent && { backgroundColor: '#DC2626' },
                    ]}
                    onPress={() => {
                      const target = rem.actionScreen === 'manager_maintenance' ? 'manager_repair_dispatch' : rem.actionScreen;
                      onNavigate?.(target);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.reminderActionBtnText}>{rem.actionLabel}</Text>
                    <Feather name="arrow-right" size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* 3. Operations & Portfolio Bulletins */}
        {managerBulletins.length > 0 && (
          <View style={styles.bulletinSection}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="megaphone-outline" size={16} color="#059669" />
                <Text style={[styles.sectionHeading, { color: colors.navy }]}>
                  Operations & Portfolio Bulletins ({managerBulletins.length})
                </Text>
              </View>
            </View>

            {managerBulletins.slice(0, 3).map((b) => (
              <View key={b.id} style={[styles.bulletinCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={styles.bulletinCardTop}>
                  <View style={styles.bulletinBadge}>
                    <Text style={styles.bulletinBadgeText}>{b.category.toUpperCase()}</Text>
                  </View>
                  {b.isPinned && (
                    <View style={styles.pinnedBadge}>
                      <Ionicons name="pin" size={10} color="#92400E" style={{ marginRight: 2 }} />
                      <Text style={styles.pinnedBadgeText}>Pinned</Text>
                    </View>
                  )}
                  <Text style={[styles.bulletinDate, { color: colors.inkSoft }]}>
                    {new Date(b.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <Text style={[styles.bulletinTitle, { color: colors.navy }]}>{b.title}</Text>
                <Text style={[styles.bulletinBody, { color: colors.inkSoft }]} numberOfLines={3}>
                  {b.body}
                </Text>
                <Text style={[styles.bulletinAuthor, { color: colors.inkSoft }]}>Notice from {b.propertyName || 'Property Management'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 4. Hero Operations Card & Clean 3-Column Metrics Strip (Single-Text KPI Rule) */}
        <TourTarget id="manager-overview-hero">
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.heroLabel, { color: colors.inkSoft }]}>Managed Units</Text>
          <Text style={[styles.heroAmount, { color: colors.navy }]}>{myUnits.length} Units</Text>
        </View>

        <View style={[styles.statsStripCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <TouchableOpacity
            style={styles.statColumn}
            onPress={() => onNavigate?.('manager_lease_documents')}
            activeOpacity={0.75}
          >
            <Text style={[styles.statColLabel, { color: colors.inkSoft }]}>Active Leases</Text>
            <Text style={[styles.statColValue, { color: colors.navy }]}>{activeAgreements.length}</Text>
          </TouchableOpacity>

          <View style={[styles.statDivider, { backgroundColor: colors.line }]} />

          <TouchableOpacity
            style={styles.statColumn}
            onPress={() => onNavigate?.('manager_repair_dispatch')}
            activeOpacity={0.75}
          >
            <Text style={[styles.statColLabel, { color: colors.inkSoft }]}>Work Orders</Text>
            <Text
              style={[
                styles.statColValue,
                { color: activeTickets.length > 0 ? '#EA580C' : '#059669' },
              ]}
            >
              {activeTickets.length}
            </Text>
          </TouchableOpacity>

          <View style={[styles.statDivider, { backgroundColor: colors.line }]} />

          <TouchableOpacity
            style={styles.statColumn}
            onPress={() => onNavigate?.('manager_repair_dispatch')}
            activeOpacity={0.75}
          >
            <Text style={[styles.statColLabel, { color: colors.inkSoft }]}>Technicians</Text>
            <Text style={[styles.statColValue, { color: colors.navy }]}>{myStaff.length}</Text>
          </TouchableOpacity>
        </View>

        </TourTarget>

        {/* 5. Priority Maintenance Tickets (Exact match to Web Section) */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.sectionCardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionCardTitle, { color: colors.navy }]}>Priority Maintenance Tickets</Text>
            </View>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => onNavigate?.('manager_repair_dispatch')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllBtnText}>View All ({activeTickets.length})</Text>
              <Feather name="arrow-right" size={12} color="#059669" />
            </TouchableOpacity>
          </View>

          {activeTickets.length === 0 ? (
            <View style={styles.emptyTicketsBox}>
              <Ionicons name="checkmark-circle-outline" size={36} color="#10B981" />
              <Text style={[styles.emptyTicketsTitle, { color: colors.navy }]}>All work orders are currently resolved!</Text>
              <Text style={[styles.emptyTicketsSub, { color: colors.inkSoft }]}>
                New resident requests will appear here automatically.
              </Text>
            </View>
          ) : (
            activeTickets.slice(0, 5).map((t) => {
              const isHigh = t.priority === 'High' || t.priority === 'Emergency';
              return (
                <View key={t.id} style={[styles.ticketRow, { borderBottomColor: colors.line }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={styles.ticketIdText}>#{t.id}</Text>
                      <View style={[styles.priorityBadge, isHigh && styles.priorityBadgeHigh]}>
                        <Text style={[styles.priorityBadgeText, isHigh && styles.priorityBadgeTextHigh]}>
                          {t.priority}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.ticketIssueText, { color: colors.navy }]}>{t.issue}</Text>
                    <Text style={[styles.ticketSubText, { color: colors.inkSoft }]}>
                      Unit {t.unit} • {t.tenant || 'Resident'} • {t.category || 'General'}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text style={[styles.assignedToLabel, { color: colors.inkSoft }]}>Assigned To</Text>
                    <Text style={[styles.assignedToText, { color: colors.navy }]} numberOfLines={1}>
                      {t.assignedStaffName || 'Unassigned'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* 6. Managed Buildings Snapshot (Exact match to Web Section) */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.sectionCardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionCardTitle, { color: colors.navy }]}>Managed Buildings</Text>
            </View>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => onNavigate?.('manager_properties')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllBtnText}>Details</Text>
              <Feather name="arrow-right" size={12} color="#059669" />
            </TouchableOpacity>
          </View>

          {myProperties.length === 0 ? (
            <View style={styles.emptyTicketsBox}>
              <Text style={[styles.emptyTicketsSub, { color: colors.inkSoft }]}>
                No buildings assigned to this management portfolio.
              </Text>
            </View>
          ) : (
            myProperties.slice(0, 4).map((p) => {
              const unitsInProp = myUnits.filter((u) => u.propertyId === p.id);
              const occupiedInProp = unitsInProp.filter((u) => u.status === 'occupied').length;
              const occPercent = unitsInProp.length > 0 ? Math.round((occupiedInProp / unitsInProp.length) * 100) : 0;

              return (
                <View key={p.id} style={[styles.buildingRow, { borderBottomColor: colors.line }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.buildingName, { color: colors.navy }]}>{p.name}</Text>
                    <Text style={[styles.buildingSub, { color: colors.inkSoft }]}>
                      {typeof p.address === 'string' ? p.address : p.address?.city || 'Local Region'} • {unitsInProp.length} units
                    </Text>
                  </View>
                  <View style={styles.buildingOccBadge}>
                    <Text style={styles.buildingOccBadgeText}>
                      {occupiedInProp}/{unitsInProp.length} Occ. ({occPercent}%)
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scroll: {
    flex: 1,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },

  actionCenterSection: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  actionCountBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  actionCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  reminderCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  reminderCardTop: {
    marginBottom: 10,
  },
  severityPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  severityPillUrgent: {
    backgroundColor: '#FEE2E2',
  },
  severityPillWarning: {
    backgroundColor: '#FEF3C7',
  },
  severityPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  reminderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 2,
  },
  reminderDesc: {
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 16,
  },
  reminderActionBtn: {
    backgroundColor: '#10B981',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
  },
  reminderActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bulletinSection: {
    marginBottom: 16,
  },
  bulletinCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  bulletinCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  bulletinBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  bulletinBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  pinnedBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinnedBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#92400E',
  },
  bulletinDate: {
    fontSize: 11,
    color: colors.inkMuted,
    marginLeft: 'auto',
  },
  bulletinTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 3,
  },
  bulletinBody: {
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 16,
    marginBottom: 4,
  },
  bulletinAuthor: {
    fontSize: 10.5,
    color: colors.inkMuted,
    fontWeight: '500',
  },
  // Hero Operations Card
  heroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
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
  // Clean 3-Column Metrics Strip
  statsStripCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statColLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkSoft,
    marginBottom: 3,
    letterSpacing: -0.1,
  },
  statColValue: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.navy,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  statColSub: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.inkMuted,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: isDark ? colors.surfaceSunken : '#E2E8F0',
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  sectionCardSubtitle: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#F0FDF4',
  },
  viewAllBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  emptyTicketsBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTicketsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 8,
    marginBottom: 2,
  },
  emptyTicketsSub: {
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  ticketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  ticketIdText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  priorityBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  priorityBadgeHigh: {
    backgroundColor: '#FEE2E2',
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  priorityBadgeTextHigh: {
    color: '#DC2626',
  },
  ticketIssueText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 2,
  },
  ticketSubText: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 2,
  },
  assignedToLabel: {
    fontSize: 10,
    color: colors.inkMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  assignedToText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
    maxWidth: 100,
    marginTop: 2,
  },
  buildingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  buildingName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.navy,
  },
  buildingSub: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
  },
  buildingOccBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  buildingOccBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.navy,
  },
  orgTrialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  orgTrialBannerText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
  },
});
