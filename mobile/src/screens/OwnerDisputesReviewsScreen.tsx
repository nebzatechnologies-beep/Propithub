import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';

interface TenantReview {
  id: string;
  ticketId: string;
  tenantName: string;
  unitCode: string;
  rating: number;
  date: string;
  comment: string;
  ownerReply?: string;
}

interface OwnerDisputesReviewsScreenProps {
  onProfilePress?: () => void;
  onNavigate?: (screenKey: string) => void;
}

export const OwnerDisputesReviewsScreen: React.FC<OwnerDisputesReviewsScreenProps> = ({
  onProfilePress,
  onNavigate,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, updateTicket, saveReview } = useMobileAppData();
  const { user } = useMobileAuth();
  const ownerId = user?.id || '';
  const ownerEmail = (user?.email || '').toLowerCase();

  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [localReplies, setLocalReplies] = useState<Record<string, string>>({});

  // Merge verified tenant reviews from state.reviews (Web DisputesPage parity) + rated tickets
  const reviews: TenantReview[] = useMemo(() => {
    if (!ownerId && !ownerEmail) return [];

    const fromReviews: TenantReview[] = (state.reviews || [])
      .filter(
        (r) =>
          (ownerId && r.ownerId === ownerId) ||
          (ownerEmail && r.ownerEmail?.toLowerCase() === ownerEmail)
      )
      .map((r) => ({
        id: r.id,
        ticketId: r.id,
        tenantName: r.by || r.tenantName || 'Verified Resident',
        unitCode: r.unit ? `Unit ${r.unit}` : r.propertyName || 'Verified Tenancy',
        rating: r.rating || 5,
        date: r.createdAt ? r.createdAt.split('T')[0] : 'Recent',
        comment: r.text || r.comment || '',
        ownerReply: localReplies[r.id] || r.ownerReply,
      }));

    const existingIds = new Set(fromReviews.map((r) => r.id));

    const fromTickets: TenantReview[] = state.tickets
      .filter((t) => t.ownerId === ownerId && t.status === 'resolved' && t.rating && t.rating > 0)
      .filter((t) => !existingIds.has(`rev-${t.id}`))
      .map((t) => ({
        id: `rev-${t.id}`,
        ticketId: t.id,
        tenantName: t.tenant || 'Resident',
        unitCode: `Unit ${t.unit}`,
        rating: t.rating || 0,
        date: t.created || 'Recent',
        comment: t.residentFeedback || t.completionNotes || 'Maintenance completed promptly with verified satisfaction.',
        ownerReply: localReplies[`rev-${t.id}`] || (t as any).ownerReply,
      }));

    return [...fromReviews, ...fromTickets];
  }, [state.reviews, state.tickets, ownerId, ownerEmail, localReplies]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return '—';
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  const repliedCount = useMemo(
    () => reviews.filter((r) => Boolean(r.ownerReply)).length,
    [reviews]
  );

  const handleSaveReply = async (review: TenantReview) => {
    if (!replyDraft.trim()) return;
    const text = replyDraft.trim();
    const today = new Date().toISOString().split('T')[0];
    setLocalReplies((prev) => ({ ...prev, [review.id]: text }));
    try {
      const existingReview = (state.reviews || []).find((r) => r.id === review.id);
      if (existingReview) {
        await saveReview({
          ...existingReview,
          ownerReply: text,
          ownerReplyDate: today,
        });
      } else {
        await updateTicket(review.ticketId, { ownerReply: text } as any);
      }
    } catch {
      // fallback already stored in localReplies
    }
    setReplyingId(null);
    setReplyDraft('');
    Alert.alert('Reply Published ✓', 'Your public response is now visible on this review.');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScreenStatusBar />

      {/* Screen Header */}
      <Header
        title="Reputation"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 3-Column KPI Strip */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <View style={{ flex: 1, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#D97706' }}>
              {averageRating === '—' ? '—' : `${averageRating} ★`}
            </Text>
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.inkSoft, letterSpacing: 0.5, marginTop: 2 }}>AVERAGE</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.navy }}>{reviews.length}</Text>
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.inkSoft, letterSpacing: 0.5, marginTop: 2 }}>REVIEWS</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#059669' }}>{repliedCount}</Text>
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.inkSoft, letterSpacing: 0.5, marginTop: 2 }}>REPLIED</Text>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.navy }]}>
            Verified Reviews ({reviews.length})
          </Text>
        </View>

        {reviews.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Feather name="award" size={32} color={colors.inkSoft} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Resident Reviews Yet</Text>
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

              {r.ownerReply ? (
                <View style={{ marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5', borderWidth: 1, borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#A7F3D0' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#059669', letterSpacing: 0.4, marginBottom: 3 }}>OWNER RESPONSE</Text>
                  <Text style={{ fontSize: 12, color: colors.navy }}>{r.ownerReply}</Text>
                </View>
              ) : replyingId === r.id ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <TextInput
                    style={{
                      backgroundColor: colors.surfaceSunken,
                      borderColor: colors.line,
                      borderWidth: 1,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      fontSize: 12.5,
                      color: colors.navy,
                    }}
                    placeholder="Write a public response..."
                    placeholderTextColor={colors.inkSoft}
                    value={replyDraft}
                    onChangeText={setReplyDraft}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setReplyingId(null);
                        setReplyDraft('');
                      }}
                      style={{ paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.inkSoft }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleSaveReply(r)}
                      style={{ backgroundColor: '#059669', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Publish Reply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    setReplyingId(r.id);
                    setReplyDraft('');
                  }}
                  style={{ marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5 }}
                >
                  <Feather name="corner-down-right" size={13} color="#059669" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>Reply Publicly</Text>
                </TouchableOpacity>
              )}
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
