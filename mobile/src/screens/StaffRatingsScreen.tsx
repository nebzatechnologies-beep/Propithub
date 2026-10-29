import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';

import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';

export const StaffRatingsScreen: React.FC = () => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state } = useMobileAppData();
  const { user } = useMobileAuth();

  const currentStaff =
    state.staff.find((s) => s.id === user.id) ||
    state.staff.find((s) => s.email?.toLowerCase() === user.email?.toLowerCase()) ||
    state.staff.find((s) => s.name.toLowerCase() === user.displayName?.toLowerCase());

  // Filter resolved tickets assigned to this staff member
  const resolvedTickets = state.tickets.filter(
    (t) =>
      t.status === 'resolved' &&
      (t.assignedStaffId === user.id ||
        (user.displayName && t.assignedStaffName?.toLowerCase().includes(user.displayName.toLowerCase())))
  );

  const ratedTickets = resolvedTickets.filter((t) => t.rating && t.rating > 0);
  const averageScore =
    ratedTickets.length > 0
      ? (ratedTickets.reduce((acc, t) => acc + (t.rating || 5), 0) / ratedTickets.length).toFixed(1)
      : currentStaff?.rating
      ? currentStaff.rating.toFixed(1)
      : '5.0';
  const numericAvg = parseFloat(averageScore) || 5.0;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Feather name="home" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>Ratings</Text>
          </View>
        </View>
        <View style={styles.staffBadge}>
          <Text style={styles.staffBadgeText}>ACTIVE STAFF</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Metric & Rating Hero Card */}
        <TourTarget id="staff-ratings-hero">
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.scoreText, { color: colors.navy }]}>{averageScore}</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Ionicons
                key={star}
                name={star <= Math.round(numericAvg) ? 'star' : 'star-outline'}
                size={22}
                color="#F59E0B"
                style={{ marginHorizontal: 2 }}
              />
            ))}
          </View>

          <Text style={[styles.reviewSub, { color: colors.inkSoft }]}>
            Based on <Text style={{ fontWeight: '700' }}>{ratedTickets.length}</Text> verified resident reviews (
            {resolvedTickets.length} completed work orders)
          </Text>

          {/* Dynamic Badges Row */}
          <View style={styles.badgesRow}>
            {numericAvg >= 4.5 && (
              <View style={styles.topRatedBadge}>
                <Ionicons name="checkmark" size={13} color="#047857" style={{ marginRight: 4 }} />
                <Text style={styles.topRatedBadgeText}>Top Rated Technician</Text>
              </View>
            )}
            {ratedTickets.length > 0 && (
              <View style={styles.residentApprovedBadge}>
                <Ionicons name="star" size={12} color="#92400E" style={{ marginRight: 4 }} />
                <Text style={styles.residentApprovedBadgeText}>Resident Approved</Text>
              </View>
            )}
            <View style={[styles.certifiedBadge, { backgroundColor: isDark ? colors.card : '#F1F5F9', borderColor: colors.line }]}>
              <Ionicons name="shield-checkmark" size={12} color={colors.inkSoft} style={{ marginRight: 4 }} />
              <Text style={[styles.certifiedBadgeText, { color: colors.inkSoft }]}>Owner Certified Staff</Text>
            </View>
          </View>
        </View>

        </TourTarget>

        {/* Section: Completed Jobs & Feedback */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.navy }]} numberOfLines={1}>
            Completed Jobs ({resolvedTickets.length})
          </Text>
        </View>

        {resolvedTickets.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={44} color={colors.inkSoft} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Completed Jobs Yet</Text>
            <Text style={[styles.emptyText, { color: colors.inkSoft }]}>
              Resolved repair tickets will appear here alongside verified tenant feedback and ratings.
            </Text>
          </View>
        ) : (
          resolvedTickets.map((t) => {
            const ticketRating = t.rating || 5;

            return (
              <View key={t.id} style={[styles.feedbackCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <View style={styles.feedbackHeaderRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={styles.feedbackTenantRow}>
                      <Text style={[styles.tenantNameText, { color: colors.navy }]}>{t.tenant || 'Resident'}</Text>
                      <View style={[styles.unitBadge, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]}>
                        <Text style={[styles.unitBadgeText, { color: colors.inkSoft }]}>Unit {t.unit}</Text>
                      </View>
                    </View>
                    <Text style={[styles.ticketRefText, { color: colors.inkSoft }]}>Ticket #{t.id}</Text>
                  </View>

                  <View style={styles.ticketStarsRow}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons
                        key={s}
                        name={s <= ticketRating ? 'star' : 'star-outline'}
                        size={14}
                        color="#F59E0B"
                        style={{ marginLeft: 1 }}
                      />
                    ))}
                  </View>
                </View>

                {/* Resolution Notes / Feedback Bubble */}
                <View style={[styles.notesBox, { backgroundColor: isDark ? colors.card : '#F8FAFC', borderColor: colors.line }]}>
                  <Text style={[styles.notesText, { color: colors.navy }]}>
                    {t.residentFeedback || t.completionNotes || `Work completed: ${t.issue}`}
                  </Text>
                </View>
              </View>
            );
          })
        )}
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
  staffBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  staffBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 20,
  },
  scoreText: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.navy,
    letterSpacing: -1,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  reviewSub: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 2,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
  },
  topRatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  topRatedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  residentApprovedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  residentApprovedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  certifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  certifiedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.navy,
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
    marginTop: 8,
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
  feedbackCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  feedbackHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  feedbackTenantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tenantNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  unitBadge: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  unitBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  ticketRefText: {
    fontSize: 11,
    color: colors.inkMuted,
    marginTop: 2,
  },
  ticketStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notesBox: {
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  notesText: {
    fontSize: 13,
    color: colors.navy,
    lineHeight: 19,
  },
});
