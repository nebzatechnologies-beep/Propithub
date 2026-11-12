import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { getManagerReminders } from '../lib/reminders';
import { resolveEffectiveUnitStatus } from '../lib/portfolioReconcile';

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
  const { state, acknowledgeAnnouncement } = useMobileAppData();
  const { user } = useMobileAuth();

  const [justAckedIds, setJustAckedIds] = useState<Set<string>>(new Set());
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<Set<string>>(new Set());

  const managerRecord = (state.propertyManagers || []).find(
    (m) =>
      (user?.id && String(m.id) === user.id) ||
      (user?.email && m.email?.toLowerCase().trim() === user.email.toLowerCase().trim())
  );
  const assignedPropertyId =
    (user as any)?.propertyId ||
    (user as any)?.assignedPropertyId ||
    managerRecord?.propertyId ||
    '';
  const effectiveOwnerId =
    user?.ownerId && user.ownerId !== user.id
      ? user.ownerId
      : managerRecord?.ownerId || '';
  const assignedProps = [
    ...(user?.assignedProperties || []),
    ...(managerRecord?.assignedProperties || []),
    ...(assignedPropertyId ? [assignedPropertyId] : []),
  ];
  const ownerId = effectiveOwnerId;
  const { isTrial, daysLeft } = usePlanLimits(ownerId);

  // Scoped Properties & Units
  const myProperties = useMemo(() => {
    return (state.properties || []).filter((p) => {
      if (p.assignedManagerId === user?.id || (p as any).managerId === user?.id) return true;
      if (assignedProps.includes(p.id)) return true;
      if (assignedPropertyId && p.id === assignedPropertyId) return true;
      if (effectiveOwnerId && p.ownerId === effectiveOwnerId) {
        if (assignedProps.length === 0 && !assignedPropertyId) return true;
        if (assignedProps.includes(p.id)) return true;
      }
      return false;
    });
  }, [state.properties, effectiveOwnerId, assignedPropertyId, assignedProps, user?.id]);

  const myPropertyIds = useMemo(() => new Set(myProperties.map((p) => p.id)), [myProperties]);

  const myUnits = useMemo(() => {
    return state.units.filter((u) => {
      if (u.propertyId && myPropertyIds.has(u.propertyId)) return true;
      if (ownerId && u.ownerId === ownerId) return true;
      return false;
    });
  }, [state.units, myPropertyIds, ownerId]);

  const occupiedCount = useMemo(() => {
    return myUnits.filter(
      (u) => resolveEffectiveUnitStatus(u, state.agreements, state.tenancyRequests, state.moveOuts) === 'occupied'
    ).length;
  }, [myUnits, state.agreements, state.tenancyRequests, state.moveOuts]);

  const myTickets = useMemo(() => {
    return state.tickets.filter((t) => {
      if (t.propertyId && myPropertyIds.has(t.propertyId)) return true;
      if (ownerId && t.ownerId === ownerId) return true;
      return false;
    });
  }, [state.tickets, myPropertyIds, ownerId]);

  const myStaff = useMemo(() => {
    if (!ownerId) return [];
    return state.staff.filter((s) => s.ownerId === ownerId);
  }, [state.staff, ownerId]);

  const activeTickets = myTickets.filter((t) => t.status !== 'resolved');

  // Manager Reminders
  const managerReminders = useMemo(() => {
    return getManagerReminders(state, user);
  }, [state, user]);

  const managerOwnerIds = useMemo(() => {
    const set = new Set<string>();
    if (ownerId) set.add(ownerId);
    if (user?.ownerId) set.add(user.ownerId);
    myProperties.forEach((p) => {
      if (p.ownerId) set.add(p.ownerId);
    });
    return set;
  }, [ownerId, user?.ownerId, myProperties]);

  // Targeted Manager Bulletins
  const managerBulletins = useMemo(() => {
    return (state.announcements || [])
      .filter((a) => {
        if (a.status !== 'published') return false;
        if (dismissedNoticeIds.has(a.id)) return false;

        const targetRoles = a.targetRoles || (a as any).targetScope?.targetRoles || [];
        if (targetRoles.length > 0 && !targetRoles.includes('manager')) return false;

        const isSystem =
          a.ownerId === 'system' ||
          a.ownerId === 'superadmin' ||
          ((a as any).category as string) === 'system';
        if (!isSystem && (managerOwnerIds.size === 0 || !managerOwnerIds.has(a.ownerId))) {
          return false;
        }

        const targetScope = (a as any).targetScope;
        if (
          targetScope?.mode === 'specific_people' ||
          (targetScope?.targetUserIds && targetScope.targetUserIds.length > 0)
        ) {
          const targets = targetScope.targetUserIds || [];
          if (!targets.includes(user.id)) return false;
        }

        if (
          targetScope &&
          !targetScope.allProperties &&
          targetScope.propertyIds &&
          targetScope.propertyIds.length > 0
        ) {
          if (
            myPropertyIds.size > 0 &&
            !targetScope.propertyIds.some((pId: string) => myPropertyIds.has(pId))
          ) {
            return false;
          }
        }

        const isAckedByArr = (a.acknowledgedBy || []).includes(user.id);
        const isAckedByObj = ((a as any).acknowledgments || []).some(
          (ack: any) =>
            ack.tenantId === user.id ||
            (user.email && ack.tenantEmail?.toLowerCase() === user.email.toLowerCase())
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
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [state.announcements, user, managerOwnerIds, myPropertyIds, dismissedNoticeIds, justAckedIds]);

  const handleAcknowledgeBulletin = (id: string) => {
    acknowledgeAnnouncement(id, user.id);
    setJustAckedIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setDismissedNoticeIds((prev) => new Set(prev).add(id));
    }, 1200);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenStatusBar />

      <Header
        title="Overview"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isTrial && daysLeft > 0 && (
          <View style={styles.trialBanner}>
            <Feather name="info" size={13} color={isDark ? '#FDE68A' : '#B45309'} />
            <Text style={styles.trialBannerText}>
              Organization Free Trial · {daysLeft}d remaining
            </Text>
          </View>
        )}

        {/* Minimal 4-Column KPI Row (Simulator & Web Parity) */}
        <TourTarget id="manager-overview-hero" style={styles.kpiRow}>
          <TouchableOpacity
            style={styles.kpiTile}
            onPress={() => onNavigate?.('manager_properties')}
            activeOpacity={0.8}
          >
            <Text style={styles.kpiLabel}>UNITS</Text>
            <Text style={styles.kpiValue}>{myUnits.length}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.kpiTile}
            onPress={() => onNavigate?.('manager_properties')}
            activeOpacity={0.8}
          >
            <Text style={styles.kpiLabel}>OCCUPIED</Text>
            <Text style={[styles.kpiValue, { color: '#10B981' }]}>{occupiedCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.kpiTile}
            onPress={() => onNavigate?.('manager_repair_dispatch')}
            activeOpacity={0.8}
          >
            <Text style={styles.kpiLabel}>REPAIRS</Text>
            <Text
              style={[
                styles.kpiValue,
                { color: activeTickets.length > 0 ? '#EA580C' : colors.navy },
              ]}
            >
              {activeTickets.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.kpiTile}
            onPress={() => onNavigate?.('manager_repair_dispatch')}
            activeOpacity={0.8}
          >
            <Text style={styles.kpiLabel}>TEAM</Text>
            <Text style={styles.kpiValue}>{myStaff.length}</Text>
          </TouchableOpacity>
        </TourTarget>

        {/* Action Center Reminders (Compact .need style) */}
        {managerReminders.length > 0 && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Action Center ({managerReminders.length})</Text>
            {managerReminders.map((rem) => {
              const isUrgent = rem.severity === 'urgent';
              return (
                <View
                  key={rem.id}
                  style={[styles.needCard, isUrgent && { borderLeftColor: '#EF4444' }]}
                >
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.needTitle}>{rem.title}</Text>
                    <Text style={styles.needSub} numberOfLines={2}>
                      {rem.description}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.needBtn, isUrgent && { backgroundColor: '#EF4444' }]}
                    onPress={() => {
                      const target =
                        rem.actionScreen === 'manager_maintenance'
                          ? 'manager_repair_dispatch'
                          : rem.actionScreen;
                      onNavigate?.(target);
                    }}
                  >
                    <Text style={styles.needBtnText}>{rem.actionLabel}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Operations Bulletins */}
        {managerBulletins.length > 0 && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Bulletins ({managerBulletins.length})</Text>
            {managerBulletins.map((b) => {
              const isAckedByArr = (b.acknowledgedBy || []).includes(user.id);
              const isAckedByObj = ((b as any).acknowledgments || []).some(
                (ack: any) =>
                  ack.tenantId === user.id ||
                  (user.email && ack.tenantEmail?.toLowerCase() === user.email.toLowerCase())
              );
              const hasAcked = isAckedByArr || isAckedByObj || justAckedIds.has(b.id);
              const requireAck = Boolean(
                b.requireAck || b.requireAcknowledgment || (b as any).requiresAcknowledgment
              );

              return (
                <View key={b.id} style={[styles.needCard, { borderLeftColor: '#10B981' }]}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {b.isPinned && <Ionicons name="pin" size={11} color="#D97706" />}
                      <Text style={styles.needTitle} numberOfLines={1}>
                        {b.title}
                      </Text>
                    </View>
                    <Text style={styles.needSub} numberOfLines={2}>
                      {b.body}
                    </Text>
                  </View>

                  {hasAcked ? (
                    <View style={styles.ackedPill}>
                      <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                      <Text style={styles.ackedPillText}>Done</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.needBtn}
                      onPress={() => handleAcknowledgeBulletin(b.id)}
                    >
                      <Text style={styles.needBtnText}>
                        {requireAck ? 'Acknowledge' : 'Read'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Priority Maintenance Tickets */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Open Repairs ({activeTickets.length})</Text>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => onNavigate?.('manager_repair_dispatch')}
            >
              <Text style={styles.viewAllText}>View all</Text>
              <Feather name="arrow-right" size={12} color="#10B981" />
            </TouchableOpacity>
          </View>

          {activeTickets.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={28} color="#10B981" />
              <Text style={styles.emptyText}>No open repair tickets</Text>
            </View>
          ) : (
            activeTickets.slice(0, 5).map((t) => {
              const isHigh = t.priority === 'High' || t.priority === 'Emergency';
              return (
                <TouchableOpacity
                  key={t.id}
                  style={styles.ticketCard}
                  onPress={() => onNavigate?.('manager_repair_dispatch')}
                  activeOpacity={0.85}
                >
                  <View style={styles.ticketTopRow}>
                    <Text style={styles.ticketIdText}>
                      #{t.id} · Unit {t.unit}
                    </Text>
                    <View
                      style={[
                        styles.priorityPill,
                        isHigh ? styles.priorityPillHigh : styles.priorityPillNormal,
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityPillText,
                          { color: isHigh ? '#DC2626' : colors.inkSoft },
                        ]}
                      >
                        {t.priority}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.ticketIssueText} numberOfLines={1}>
                    {t.issue}
                  </Text>

                  <View style={styles.ticketGrid}>
                    <View style={styles.ticketCol}>
                      <Text style={styles.gridLabel}>RESIDENT</Text>
                      <Text style={styles.gridValue} numberOfLines={1}>
                        {t.tenant || 'Resident'}
                      </Text>
                    </View>
                    <View style={styles.ticketCol}>
                      <Text style={styles.gridLabel}>ASSIGNED TO</Text>
                      <Text style={styles.gridValue} numberOfLines={1}>
                        {t.assignedStaffName || (t as any).assignedTo || 'Unassigned'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 24,
    },
    trialBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.14)' : '#FFFBEB',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 10,
    },
    trialBannerText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: isDark ? '#FDE68A' : '#B45309',
    },
    kpiRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    kpiTile: {
      flex: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 10,
    },
    kpiLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.4,
    },
    kpiValue: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.navy,
      marginTop: 2,
    },
    sectionWrap: {
      marginBottom: 14,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.inkSoft,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    viewAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    viewAllText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#10B981',
    },
    needCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderLeftWidth: 3.5,
      borderLeftColor: '#F59E0B',
      borderRadius: 10,
      padding: 11,
      marginBottom: 8,
    },
    needTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
    },
    needSub: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 2,
    },
    needBtn: {
      backgroundColor: '#10B981',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 7,
    },
    needBtnText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    ackedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: 'rgba(16, 185, 129, 0.14)',
    },
    ackedPillText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#10B981',
    },
    emptyCard: {
      paddingVertical: 30,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 6,
    },
    emptyText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    ticketCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
    },
    ticketTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    ticketIdText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: '#10B981',
    },
    priorityPill: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
    },
    priorityPillHigh: {
      backgroundColor: 'rgba(239, 68, 68, 0.14)',
    },
    priorityPillNormal: {
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
    },
    priorityPillText: {
      fontSize: 10,
      fontWeight: '700',
    },
    ticketIssueText: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 4,
    },
    ticketGrid: {
      flexDirection: 'row',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      gap: 10,
    },
    ticketCol: {
      flex: 1,
    },
    gridLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.inkSoft,
      letterSpacing: 0.3,
    },
    gridValue: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
      marginTop: 2,
    },
  });
