import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';

interface TenantReview {
  id: string;
  tenantName: string;
  unitCode: string;
  rating: number;
  date: string;
  comment: string;
}

export const OwnerDisputesReviewsScreen: React.FC = () => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state } = useMobileAppData();
  const { user } = useMobileAuth();
  const ownerId = user?.id || '';

  // Derive verified reviews from resolved tickets
  const reviews: TenantReview[] = useMemo(() => {
    if (!ownerId) return [];
    return state.tickets
      .filter((t) => t.ownerId === ownerId && t.status === 'resolved' && t.rating && t.rating > 0)
      .map((t) => ({
        id: `rev-${t.id}`,
        tenantName: t.tenant || 'Resident',
        unitCode: `Unit ${t.unit}`,
        rating: t.rating || 0,
        date: t.created || 'Recent',
        comment: t.residentFeedback || t.completionNotes || 'Maintenance completed promptly with verified satisfaction.',
      }));
  }, [state.tickets, ownerId]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return '—';
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <PropithubIcon size={20} />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>Reputation</Text>
          </View>
        </View>
        <View style={[styles.ownerBadge, isDark && { backgroundColor: '#78350F', borderColor: '#92400E' }]}>
          <Text style={[styles.ownerBadgeText, isDark && { color: '#FDE68A' }]}>OWNER</Text>
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.navy }]}>
            Reviews ({reviews.length})
          </Text>
          <View style={[styles.ratingOverall, isDark && { backgroundColor: '#78350F' }]}>
            <FontAwesome name="star" size={14} color="#D97706" />
            <Text style={[styles.ratingOverallText, isDark && { color: '#FDE68A' }]}>
              {reviews.length === 0 ? 'No Reviews' : `${averageRating} / 5.0 (Average)`}
            </Text>
          </View>
        </View>

        {reviews.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Feather name="award" size={40} color={colors.inkSoft} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Resident Reviews Yet</Text>
            <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
              Verified reviews will appear here once maintenance work orders and tenancies are rated.
            </Text>
          </View>
        ) : (
          reviews.map((r) => (
            <View key={r.id} style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.reviewTop}>
                <View>
                  <Text style={[styles.reviewerName, { color: colors.navy }]}>{r.tenantName}</Text>
                  <Text style={[styles.reviewerUnit, { color: colors.inkSoft }]}>{r.unitCode} • {r.date}</Text>
                </View>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <FontAwesome
                      key={star}
                      name={star <= r.rating ? 'star' : 'star-o'}
                      size={13}
                      color="#D97706"
                      style={{ marginHorizontal: 1 }}
                    />
                  ))}
                </View>
              </View>
              <Text style={[styles.reviewComment, { color: colors.inkSoft }]}>{r.comment}</Text>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.navy,
  },
  ownerBadge: {
    backgroundColor: '#FEF9C3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FEF08A',
  },
  ownerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#854D0E',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  ratingOverall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingOverallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
  },
  reviewTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  reviewerName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
  },
  reviewerUnit: {
    fontSize: 11,
    color: colors.inkSoft,
    marginTop: 1,
  },
  starsRow: {
    flexDirection: 'row',
  },
  reviewComment: {
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 18,
  },
});
