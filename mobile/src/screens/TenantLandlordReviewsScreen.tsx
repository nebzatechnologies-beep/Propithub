import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons, Feather, FontAwesome } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { MobileTenantReview } from '../types';

interface TenantLandlordReviewsScreenProps {
  onNavigate?: (screenKey: string) => void;
  onProfilePress?: () => void;
}

export const TenantLandlordReviewsScreen: React.FC<TenantLandlordReviewsScreenProps> = ({
  onNavigate,
  onProfilePress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const { state, saveReview } = useMobileAppData();
  const { user } = useMobileAuth();

  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('all');
  const [showWriteModal, setShowWriteModal] = useState(false);
  const [selectedOwnerForReview, setSelectedOwnerForReview] = useState<any | null>(null);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const userEmail = (user.email || '').toLowerCase();
  const userName = user.displayName || 'Resident';

  // Tenant record
  const tenantRecord = useMemo(() => {
    return state.tenants.find(
      (t) => t.id === user.id || (t.email && t.email.toLowerCase() === userEmail)
    );
  }, [state.tenants, user.id, userEmail]);

  // Strictly scope accessible landlords to current & past tenancies (100% Web Parity)
  const associatedOwnerIds = useMemo(() => {
    const ids = new Set<string>();
    if (tenantRecord?.ownerId) ids.add(tenantRecord.ownerId);

    // Active & historical agreements
    (state.agreements || []).forEach((a) => {
      const isMyAg =
        (user?.id && a.tenantId === user.id) ||
        (userEmail && a.tenantEmail?.toLowerCase() === userEmail) ||
        (userName && (a.tenant || '').toLowerCase() === userName.toLowerCase());
      if (isMyAg && a.ownerId) ids.add(a.ownerId);
    });

    // Units occupied
    (state.units || []).forEach((u) => {
      const isMyUnit =
        (user?.id && u.currentTenantId === user.id) ||
        (userEmail && (u as any).tenantEmail?.toLowerCase() === userEmail);
      if (isMyUnit && u.ownerId) ids.add(u.ownerId);
    });

    // Move-outs
    (state.moveOuts || []).forEach((m) => {
      const isMyMo =
        (user?.id && m.tenantId === user.id) ||
        (userName && (m.tenantName || '').toLowerCase() === userName.toLowerCase());
      if (isMyMo && (m as any).ownerId) ids.add((m as any).ownerId);
    });

    return ids;
  }, [tenantRecord, state.agreements, state.units, state.moveOuts, user.id, userEmail, userName]);

  // Associated Owners List
  const associatedLandlords = useMemo(() => {
    const discoveredOwners = new Map<string, any>();

    // 1. If user profiles with role owner match
    (state.users || []).forEach((u) => {
      if (u.role === 'owner' && associatedOwnerIds.has(u.id)) {
        discoveredOwners.set(u.id, u);
      }
    });

    // 2. Discover directly from all tenant agreements
    state.agreements.forEach((a) => {
      const isMyAg =
        (user?.id && a.tenantId === user.id) ||
        (userEmail && a.tenantEmail?.toLowerCase() === userEmail) ||
        (userName && a.tenant?.toLowerCase() === userName.toLowerCase());
      if (isMyAg && a.ownerId && !discoveredOwners.has(a.ownerId)) {
        discoveredOwners.set(a.ownerId, {
          id: a.ownerId,
          displayName: a.ownerName || 'Property Owner',
          email: 'landlord@propithub.app',
          phone: '+91 98450 11223',
          role: 'owner',
          rating: 4.9,
          propertyName: a.propertyName,
        });
      }
    });

    // 3. Discover from tenantRecord
    if (tenantRecord?.ownerId && !discoveredOwners.has(tenantRecord.ownerId)) {
      discoveredOwners.set(tenantRecord.ownerId, {
        id: tenantRecord.ownerId,
        displayName: (tenantRecord as any).ownerName || (tenantRecord as any).owner || 'Property Owner',
        email: 'landlord@propithub.app',
        phone: '+91 98450 11223',
        role: 'owner',
        rating: 4.9,
        propertyName: tenantRecord.propertyName,
      });
    }

    return Array.from(discoveredOwners.values());
  }, [state.users, associatedOwnerIds, state.agreements, tenantRecord, user.id, userEmail, userName]);

  // Live reviews from state.reviews
  const allReviews: MobileTenantReview[] = useMemo(() => {
    const list = state.reviews || [];
    return list.filter((r) => {
      if (!r.ownerId && !r.ownerName) return true;
      if (r.ownerId && associatedOwnerIds.has(r.ownerId)) return true;
      return true;
    });
  }, [state.reviews, associatedOwnerIds]);

  const filteredReviews = useMemo(() => {
    if (selectedOwnerFilter === 'all') return allReviews;
    return allReviews.filter((r) => r.ownerId === selectedOwnerFilter);
  }, [allReviews, selectedOwnerFilter]);

  const handleOpenWriteModal = (landlord?: any) => {
    setSelectedOwnerForReview(landlord || associatedLandlords[0]);
    setShowWriteModal(true);
  };

  const handleSaveReview = async () => {
    if (!newComment.trim()) {
      Alert.alert('Missing Review', 'Please enter your feedback or review statement.');
      return;
    }

    setIsSubmittingReview(true);
    try {
      const tenantProp = tenantRecord?.propertyId ? state.properties.find((p) => p.id === tenantRecord.propertyId) : null;
      const resolvedOwnerName = selectedOwnerForReview?.displayName || selectedOwnerForReview?.name || (tenantRecord as any)?.owner || 'Property Landlord';
      await saveReview({
        id: `REV-${Date.now().toString().slice(-5)}`,
        tenantId: user.id,
        tenantName: userName,
        by: userName,
        ownerId: selectedOwnerForReview?.id || tenantRecord?.ownerId || '',
        ownerName: resolvedOwnerName,
        owner: resolvedOwnerName,
        propertyId: tenantProp?.id || tenantRecord?.propertyId || '',
        propertyName: tenantProp?.name || tenantRecord?.propertyName || 'Residence',
        unit: tenantRecord?.unit || 'Residence',
        rating: newRating,
        comment: newComment.trim(),
        text: newComment.trim(),
        createdAt: new Date().toISOString(),
      } as any);

      setIsSubmittingReview(false);
      setShowWriteModal(false);
      setNewComment('');
      setNewRating(5);
      Alert.alert('Review Submitted ✓', 'Your verified landlord review has been published on the platform.');
    } catch (err) {
      setIsSubmittingReview(false);
      Alert.alert('Error', 'Could not submit review. Please try again.');
    }
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);


  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Screen Status Bar */}
      <ScreenStatusBar />

      {/* Unified Header */}
      <Header
        title="Reviews"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Row: Landlord Filter Pills (if >1) + Write a review Button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {associatedLandlords.length > 1 ? (
              <>
                <TouchableOpacity
                  onPress={() => setSelectedOwnerFilter('all')}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selectedOwnerFilter === 'all' ? colors.navy : colors.line,
                    backgroundColor: selectedOwnerFilter === 'all' ? colors.navy : colors.surface,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: selectedOwnerFilter === 'all' ? '#FFFFFF' : colors.inkSoft }}>
                    All ({associatedLandlords.length})
                  </Text>
                </TouchableOpacity>
                {associatedLandlords.map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => setSelectedOwnerFilter(o.id)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selectedOwnerFilter === o.id ? colors.navy : colors.line,
                      backgroundColor: selectedOwnerFilter === o.id ? colors.navy : colors.surface,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: selectedOwnerFilter === o.id ? '#FFFFFF' : colors.inkSoft }}>
                      {o.displayName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.navy }}>
                Landlord reviews
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.writeReviewHeaderBtn, associatedLandlords.length === 0 && { opacity: 0.5 }]}
            onPress={() => {
              if (associatedLandlords.length === 0) return;
              const match = selectedOwnerFilter !== 'all' ? associatedLandlords.find((o) => o.id === selectedOwnerFilter) : associatedLandlords[0];
              handleOpenWriteModal(match);
            }}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.writeReviewHeaderBtnText}>Write a review</Text>
          </TouchableOpacity>
        </View>

        {filteredReviews.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={{ fontSize: 13, color: colors.inkSoft }}>
              No reviews recorded for your landlords yet.
            </Text>
          </View>
        ) : (
          filteredReviews.map((r) => (
            <View key={r.id} style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.reviewHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.reviewerName, { color: colors.navy }]}>
                    {r.ownerName || 'Property Landlord'}
                  </Text>
                  <Text style={[styles.reviewerUnit, { color: colors.inkSoft }]}>
                    Reviewed by {r.tenantName} • {r.createdAt?.split('T')[0] || 'Recent'}{r.propertyName ? ` • ${r.propertyName}` : ''}{r.unit ? ` (Unit ${r.unit})` : ''}
                  </Text>
                </View>
                <View style={[styles.verifiedTenancyStrip, { marginTop: 0 }, isDark && { backgroundColor: '#064E3B20' }]}>
                  <Feather name="check-circle" size={11} color="#059669" style={{ marginRight: 4 }} />
                  <Text style={[styles.verifiedTenancyText, isDark && { color: '#6EE7B7' }]}>Verified Tenancy</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <FontAwesome
                    key={s}
                    name={s <= (r.rating || 5) ? 'star' : 'star-o'}
                    size={13}
                    color="#D97706"
                    style={{ marginRight: 3 }}
                  />
                ))}
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.inkSoft, marginLeft: 4 }}>
                  ({(r.rating || 5).toFixed(1)})
                </Text>
              </View>

              <Text style={[styles.reviewComment, { color: colors.navy, fontStyle: 'italic' }]}>
                "{r.comment}"
              </Text>

              {Boolean(r.ownerReply) && (
                <View
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    borderLeftWidth: 3,
                    borderLeftColor: colors.brass,
                  }}
                >
                  <Text style={{ fontSize: 12, color: colors.navy, lineHeight: 17 }}>
                    <Text style={{ fontWeight: '700' }}>Landlord reply: </Text>
                    {r.ownerReply}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* =============================================================== */}
      {/* MODAL: WRITE LANDLORD REVIEW                                    */}
      {/* =============================================================== */}
      <Modal visible={showWriteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Write Landlord Review</Text>
                <Text style={[styles.modalSub, { color: colors.inkSoft }]}>
                  For {selectedOwnerForReview?.displayName || 'Property Landlord'} • Verified Tenancy
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowWriteModal(false)}>
                <Ionicons name="close" size={24} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              {associatedLandlords.length > 1 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.modalInputLabel, { color: colors.inkSoft }]}>Select Landlord / Residence</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {associatedLandlords.map((o) => {
                      const isSelected = (selectedOwnerForReview?.id || associatedLandlords[0]?.id) === o.id;
                      return (
                        <TouchableOpacity
                          key={o.id}
                          onPress={() => setSelectedOwnerForReview(o)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: isSelected ? '#10B981' : colors.line,
                            backgroundColor: isSelected ? (isDark ? '#064E3B30' : '#ECFDF5') : 'transparent',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: isSelected ? '700' : '500', color: isSelected ? '#059669' : colors.navy }}>
                            {o.displayName} {o.propertyName ? `(${o.propertyName})` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={[styles.modalInputLabel, { color: colors.inkSoft }]}>Overall Rating</Text>
              <View style={styles.modalStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setNewRating(star)}
                    activeOpacity={0.7}
                    style={{ marginRight: 10 }}
                  >
                    <FontAwesome
                      name={star <= newRating ? 'star' : 'star-o'}
                      size={28}
                      color="#D97706"
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.modalInputLabel, { color: colors.inkSoft }]}>Review & Feedback</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: isDark ? colors.card : '#F8FAFC', borderColor: colors.line, color: colors.navy, height: 90, textAlignVertical: 'top' }]}
                value={newComment}
                onChangeText={setNewComment}
                placeholder="Share your experience regarding responsiveness, maintenance turnaround, and deposit fairness..."
                placeholderTextColor={colors.inkSoft}
                multiline
              />

              <TouchableOpacity
                style={[styles.modalSubmitBtn, isSubmittingReview && { opacity: 0.7 }]}
                onPress={handleSaveReview}
                disabled={isSubmittingReview}
                activeOpacity={0.85}
              >
                <Feather name="check" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSubmitBtnText}>
                  {isSubmittingReview ? 'Publishing...' : 'Publish Verified Review'}
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
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
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
    },
    logoBadge: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: '#10B981',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
    },
    headerSub: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    writeReviewHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#10B981',
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    writeReviewHeaderBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginBottom: 14,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.navy,
      paddingVertical: 0,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 30,
      alignItems: 'center',
    },
    emptyTitle: {
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 8,
    },
    emptySub: {
      fontSize: 12,
      color: colors.inkSoft,
      textAlign: 'center',
      marginTop: 3,
    },
    reviewCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      marginBottom: 10,
    },
    reviewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    reviewerName: {
      fontSize: 13.5,
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
      fontSize: 12.5,
      color: colors.ink,
      lineHeight: 18,
      marginBottom: 8,
    },
    verifiedTenancyStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F0FDF4',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      alignSelf: 'flex-start',
    },
    verifiedTenancyText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: '#15803D',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 20,
      maxHeight: '90%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 16.5,
      fontWeight: '700',
      color: colors.navy,
    },
    modalSub: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 1,
    },
    modalBody: {
      paddingVertical: 4,
    },
    modalInputLabel: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.ink,
      marginBottom: 8,
      marginTop: 8,
    },
    modalStarsRow: {
      flexDirection: 'row',
      marginBottom: 10,
    },
    modalInput: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      color: colors.navy,
    },
    modalSubmitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      borderRadius: 8,
      paddingVertical: 12,
      marginTop: 14,
    },
    modalSubmitBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
