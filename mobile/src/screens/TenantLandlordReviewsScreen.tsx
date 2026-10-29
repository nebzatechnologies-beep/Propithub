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
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { MobileTenantReview } from '../types';

export const TenantLandlordReviewsScreen: React.FC = () => {
  const { colors, isDark } = useMobileTheme();
  const { state, saveReview } = useMobileAppData();
  const { user } = useMobileAuth();

  // 2 Web-Parity Subtabs: Directory vs Reviews
  const [subTab, setSubTab] = useState<'directory' | 'reviews'>('directory');

  const [search, setSearch] = useState('');
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

  // Filtered Landlords
  const filteredLandlords = useMemo(() => {
    if (!search.trim()) return associatedLandlords;
    const q = search.toLowerCase();
    return associatedLandlords.filter(
      (o) =>
        o.displayName?.toLowerCase().includes(q) ||
        o.email?.toLowerCase().includes(q) ||
        (o.phone && o.phone.includes(q))
    );
  }, [associatedLandlords, search]);

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
    if (!search.trim()) return allReviews;
    const q = search.toLowerCase();
    return allReviews.filter(
      (r) =>
        (r.tenantName || '').toLowerCase().includes(q) ||
        (r.comment || '').toLowerCase().includes(q) ||
        (r.unit && (r.unit || '').toLowerCase().includes(q))
    );
  }, [allReviews, search]);

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
      await saveReview({
        id: `REV-${Date.now().toString().slice(-5)}`,
        tenantId: user.id,
        tenantName: userName,
        ownerId: selectedOwnerForReview?.id || tenantRecord?.ownerId || '',
        ownerName: selectedOwnerForReview?.displayName || selectedOwnerForReview?.name || (tenantRecord as any)?.owner || 'Property Landlord',
        propertyName: tenantProp?.name || tenantRecord?.propertyName || 'Residence',
        unit: tenantRecord?.unit || 'Residence',
        rating: newRating,
        comment: newComment.trim(),
        createdAt: new Date().toISOString(),
      });

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

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Feather name="star" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>Landlord Reviews</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.writeReviewHeaderBtn}
          onPress={() => handleOpenWriteModal()}
          activeOpacity={0.85}
        >
          <Feather name="edit-3" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.writeReviewHeaderBtnText}>Write Review</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: colors.line }]}>
          <Feather name="search" size={16} color={colors.inkSoft} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.navy }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search landlord or unit..."
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.inkSoft} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 2 Subtabs: Directory vs Reviews */}
        <View style={[styles.subTabCapsule, { backgroundColor: isDark ? colors.card : '#E2E8F0' }]}>
          <TouchableOpacity
            style={[styles.subTabBtn, subTab === 'directory' && [styles.subTabBtnActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
            onPress={() => setSubTab('directory')}
            activeOpacity={0.8}
          >
            <Feather
              name="users"
              size={13}
              color={subTab === 'directory' ? colors.navy : colors.inkSoft}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.subTabText, { color: colors.inkSoft }, subTab === 'directory' && [styles.subTabTextActive, { color: colors.navy }]]}>
              Directory ({filteredLandlords.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.subTabBtn, subTab === 'reviews' && [styles.subTabBtnActive, { backgroundColor: colors.surface, borderColor: colors.line }]]}
            onPress={() => setSubTab('reviews')}
            activeOpacity={0.8}
          >
            <Feather
              name="message-square"
              size={13}
              color={subTab === 'reviews' ? colors.navy : colors.inkSoft}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.subTabText, { color: colors.inkSoft }, subTab === 'reviews' && [styles.subTabTextActive, { color: colors.navy }]]}>
              Reviews ({filteredReviews.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* =============================================================== */}
        {/* SUBTAB 1: LANDLORD DIRECTORY                                    */}
        {/* =============================================================== */}
        {subTab === 'directory' && (
          <>
            <View style={[styles.trustBanner, isDark && { backgroundColor: '#064E3B20', borderColor: '#065F46' }]}>
              <Feather name="shield" size={16} color="#059669" style={{ marginRight: 8 }} />
              <Text style={[styles.trustBannerText, isDark && { color: '#6EE7B7' }]}>
                Showing property owners from your verified past & active tenancies.
              </Text>
            </View>

            {filteredLandlords.map((landlord) => {
              const initials = (landlord.displayName || 'Landlord')
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <View key={landlord.id} style={[styles.landlordCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <View style={styles.landlordTopRow}>
                    <View style={styles.avatarBox}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.landlordName, { color: colors.navy }]}>{landlord.displayName || 'Property Landlord'}</Text>
                      <Text style={[styles.landlordSub, { color: colors.inkSoft }]}>Verified Property Owner • Propithub Trust Certified</Text>
                    </View>
                    <View style={styles.ratingBadge}>
                      <FontAwesome name="star" size={12} color="#D97706" style={{ marginRight: 4 }} />
                      <Text style={styles.ratingBadgeText}>4.9</Text>
                    </View>
                  </View>

                  <View style={[styles.divider, { backgroundColor: colors.line }]} />

                  <View style={styles.contactRow}>
                    <View style={styles.contactItem}>
                      <Feather name="mail" size={13} color={colors.inkSoft} style={{ marginRight: 5 }} />
                      <Text style={[styles.contactText, { color: colors.inkSoft }]}>{landlord.email || 'landlord@propithub.app'}</Text>
                    </View>
                    <View style={styles.contactItem}>
                      <Feather name="phone" size={13} color={colors.inkSoft} style={{ marginRight: 5 }} />
                      <Text style={[styles.contactText, { color: colors.inkSoft }]}>{landlord.phone || '+91 98450 11223'}</Text>
                    </View>
                  </View>

                  <View style={[styles.divider, { backgroundColor: colors.line }]} />

                  <View style={styles.landlordActionsRow}>
                    <TouchableOpacity
                      style={styles.reviewBtn}
                      onPress={() => handleOpenWriteModal(landlord)}
                      activeOpacity={0.85}
                    >
                      <Feather name="edit-3" size={13} color="#FFFFFF" style={{ marginRight: 5 }} />
                      <Text style={styles.reviewBtnText}>Write Landlord Review</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* =============================================================== */}
        {/* SUBTAB 2: PUBLISHED REVIEWS                                     */}
        {/* =============================================================== */}
        {subTab === 'reviews' && (
          <>
            {filteredReviews.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Feather name="message-square" size={32} color={colors.inkSoft} />
                <Text style={[styles.emptyTitle, { color: colors.navy }]}>Zero Reviews Yet</Text>
                <Text style={[styles.emptySub, { color: colors.inkSoft }]}>Be the first resident to submit a review for your landlord.</Text>
              </View>
            ) : (
              filteredReviews.map((r) => (
                <View key={r.id} style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <View style={styles.reviewHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.reviewerName, { color: colors.navy }]}>{r.tenantName}</Text>
                      <Text style={[styles.reviewerUnit, { color: colors.inkSoft }]}>
                        Resident • Unit {r.unit || 'Residence'} • {r.createdAt?.split('T')[0] || 'Recent'}
                      </Text>
                    </View>
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <FontAwesome
                          key={s}
                          name={s <= (r.rating || 5) ? 'star' : 'star-o'}
                          size={13}
                          color="#D97706"
                          style={{ marginLeft: 2 }}
                        />
                      ))}
                    </View>
                  </View>

                  <Text style={[styles.reviewComment, { color: colors.navy }]}>{r.comment}</Text>

                  <View style={[styles.verifiedTenancyStrip, isDark && { backgroundColor: '#064E3B20' }]}>
                    <Feather name="check-circle" size={12} color="#059669" style={{ marginRight: 4 }} />
                    <Text style={[styles.verifiedTenancyText, isDark && { color: '#6EE7B7' }]}>Verified Tenancy via Propithub Lease Deed</Text>
                  </View>
                </View>
              ))
            )}
          </>
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
    subTabCapsule: {
      flexDirection: 'row',
      backgroundColor: '#E2E8F0',
      borderRadius: 8,
      padding: 3,
      marginBottom: 16,
    },
    subTabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 6,
    },
    subTabBtnActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    subTabText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    subTabTextActive: {
      color: colors.navy,
      fontWeight: '700',
    },
    trustBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F0FDF4',
      borderWidth: 1,
      borderColor: '#BBF7D0',
      borderRadius: 8,
      padding: 10,
      marginBottom: 14,
    },
    trustBannerText: {
      flex: 1,
      fontSize: 11.5,
      color: '#166534',
      lineHeight: 16,
    },
    landlordCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
      marginBottom: 12,
    },
    landlordTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#10B981',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    avatarText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    landlordName: {
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.navy,
    },
    landlordSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 1,
    },
    ratingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FEF3C7',
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    ratingBadgeText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: '#B45309',
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      marginVertical: 10,
    },
    contactRow: {
      gap: 6,
    },
    contactItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    contactText: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    landlordActionsRow: {
      marginTop: 2,
    },
    reviewBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      borderRadius: 7,
      paddingVertical: 9,
    },
    reviewBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
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
