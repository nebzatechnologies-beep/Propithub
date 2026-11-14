import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { doc, setDoc } from 'firebase/firestore';
import { Header } from '../components/Header';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { ScreenContainer } from '../components/ScreenContainer';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { MobileInAppNotification } from '../types';

interface TenantReview {
  id: string;
  ticketId: string;
  tenantId?: string;
  tenantName: string;
  unitCode: string;
  rating: number;
  date: string;
  comment: string;
  ownerReply?: string;
  ownerReplyDate?: string;
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

  const [refreshing, setRefreshing] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);
  const [localReplies, setLocalReplies] = useState<Record<string, { text: string; date: string }>>({});

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

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
        tenantId: r.tenantId,
        tenantName: r.by || r.tenantName || 'Verified Resident',
        unitCode: r.unit ? `Unit ${r.unit}` : r.propertyName || 'Verified Tenancy',
        rating: r.rating || 5,
        date: r.createdAt ? r.createdAt.split('T')[0] : 'Recent',
        comment: r.text || r.comment || '',
        ownerReply: localReplies[r.id]?.text || r.ownerReply,
        ownerReplyDate: localReplies[r.id]?.date || r.ownerReplyDate,
      }));

    const existingIds = new Set(fromReviews.map((r) => r.id));

    const fromTickets: TenantReview[] = state.tickets
      .filter((t) => t.ownerId === ownerId && t.status === 'resolved' && t.rating && t.rating > 0)
      .filter((t) => !existingIds.has(`rev-${t.id}`))
      .map((t) => ({
        id: `rev-${t.id}`,
        ticketId: t.id,
        tenantId: t.tenantId,
        tenantName: t.tenant || 'Resident',
        unitCode: `Unit ${t.unit}`,
        rating: t.rating || 0,
        date: t.created || 'Recent',
        comment: t.residentFeedback || t.completionNotes || 'Maintenance completed promptly with verified satisfaction.',
        ownerReply: localReplies[`rev-${t.id}`]?.text || (t as any).ownerReply,
        ownerReplyDate: localReplies[`rev-${t.id}`]?.date || (t as any).ownerReplyDate,
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
    const text = replyDraft.trim();
    if (!text || savingReplyId) return;

    const today = new Date().toISOString().split('T')[0];
    const ownerName = user?.displayName || 'Property Owner';
    setSavingReplyId(review.id);

    try {
      const existingReview = (state.reviews || []).find((r) => r.id === review.id);
      if (existingReview) {
        await saveReview({
          ...existingReview,
          ownerReply: text,
          ownerReplyDate: today,
        });
      } else {
        await Promise.resolve(
          updateTicket(review.ticketId, { ownerReply: text, ownerReplyDate: today } as any)
        );
      }

      if (isFirebaseConfigured && review.tenantId) {
        const notif: MobileInAppNotification = {
          id: `notif-reply-${Date.now()}`,
          userId: review.tenantId,
          recipientId: review.tenantId,
          recipientRole: 'tenant',
          ownerId: ownerId || undefined,
          title: `${ownerName} replied to your review!`,
          body: `"${text}"`,
          category: 'info',
          isRead: false,
          createdAt: new Date().toISOString(),
          relatedEntityId: review.id,
        };
        await setDoc(doc(db, 'notifications', notif.id), notif, { merge: true });
      }

      setLocalReplies((prev) => ({ ...prev, [review.id]: { text, date: today } }));
      setReplyingId(null);
      setReplyDraft('');
      Alert.alert('Reply Published ✓', 'Your public response is now visible on this review.');
    } catch (err: any) {
      setLocalReplies((prev) => {
        if (!prev[review.id]) return prev;
        const next = { ...prev };
        delete next[review.id];
        return next;
      });
      Alert.alert(
        'Publish Failed',
        err?.message || 'Could not publish your reply. Please try again.'
      );
    } finally {
      setSavingReplyId(null);
    }
  };

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
            title="Reputation"
            onNotificationPress={() => onNavigate?.('notifications_center')}
            onProfilePress={onProfilePress}
          />
        </>
      }
    >
      {/* 3-Column KPI Strip */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.kpiVal, { color: isDark ? '#FBBF24' : '#D97706' }]}>
            {averageRating === '—' ? '—' : `${averageRating} ★`}
          </Text>
          <Text style={[styles.kpiLabel, { color: colors.inkSoft }]}>AVERAGE</Text>
        </View>
        <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.kpiVal, { color: colors.navy }]}>{reviews.length}</Text>
          <Text style={[styles.kpiLabel, { color: colors.inkSoft }]}>REVIEWS</Text>
        </View>
        <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.kpiVal, { color: isDark ? '#34D399' : '#059669' }]}>{repliedCount}</Text>
          <Text style={[styles.kpiLabel, { color: colors.inkSoft }]}>REPLIED</Text>
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
          <Text style={[styles.emptySub, { color: colors.inkSoft }]}>
            When verified residents complete move-out or submit ratings, they will appear here.
          </Text>
        </View>
      ) : (
        reviews.map((r) => {
          const isSavingThis = savingReplyId === r.id;
          return (
            <View key={r.id} style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.reviewTop}>
                <View style={{ flex: 1, marginRight: 8 }}>
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
              <Text style={[styles.reviewComment, { color: colors.ink }]}>{r.comment}</Text>

              {r.ownerReply ? (
                <View
                  style={[
                    styles.replyBox,
                    {
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                      borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : '#A7F3D0',
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <Text style={[styles.replyBoxTitle, { color: isDark ? '#34D399' : '#059669' }]}>
                      ✓ OWNER RESPONSE
                    </Text>
                    {r.ownerReplyDate ? (
                      <Text style={{ fontSize: 10, color: colors.inkSoft }}>{r.ownerReplyDate}</Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 12.5, color: colors.navy, lineHeight: 18 }}>{r.ownerReply}</Text>
                </View>
              ) : replyingId === r.id ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <TextInput
                    style={[
                      styles.replyInput,
                      {
                        backgroundColor: colors.surfaceSunken,
                        borderColor: colors.line,
                        color: colors.navy,
                      },
                    ]}
                    placeholder="Write a public response..."
                    placeholderTextColor={colors.inkSoft}
                    value={replyDraft}
                    onChangeText={setReplyDraft}
                    multiline
                    editable={!isSavingThis}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setReplyingId(null);
                        setReplyDraft('');
                      }}
                      disabled={isSavingThis}
                      style={{ paddingHorizontal: 12, paddingVertical: 6 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.inkSoft }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleSaveReply(r)}
                      disabled={isSavingThis || !replyDraft.trim()}
                      style={[
                        styles.publishBtn,
                        (isSavingThis || !replyDraft.trim()) && { opacity: 0.6 },
                      ]}
                    >
                      {isSavingThis ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Publish Reply</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    setReplyingId(r.id);
                    setReplyDraft('');
                  }}
                  style={{ marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5 }}
                >
                  <Feather name="corner-down-right" size={13} color={isDark ? '#34D399' : '#059669'} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#34D399' : '#059669' }}>
                    Reply Publicly
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })
      )}

      <View style={{ height: 40 }} />
    </ScreenContainer>
  );
};

const createStyles = (colors: any, _isDark: boolean) =>
  StyleSheet.create({
    content: {
      padding: 16,
    },
    kpiRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    kpiCard: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 10,
      alignItems: 'center',
    },
    kpiVal: {
      fontSize: 18,
      fontWeight: '800',
    },
    kpiLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginTop: 2,
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
    emptyCard: {
      borderRadius: 12,
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      marginTop: 12,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginTop: 12,
    },
    emptySub: {
      fontSize: 12,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 18,
    },
    reviewCard: {
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      marginBottom: 10,
    },
    reviewTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 6,
    },
    reviewerName: {
      fontSize: 13.5,
      fontWeight: '700',
    },
    reviewerUnit: {
      fontSize: 11,
      marginTop: 1,
    },
    starsRow: {
      flexDirection: 'row',
    },
    reviewComment: {
      fontSize: 12.5,
      lineHeight: 18,
    },
    replyBox: {
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
    },
    replyBoxTitle: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    replyInput: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 12.5,
      minHeight: 64,
      textAlignVertical: 'top',
    },
    publishBtn: {
      backgroundColor: '#059669',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 8,
      minWidth: 96,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
