import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { MobileUnit, MobileProperty, MobilePropertyEnquiry } from '../types';
import { getCleanAddressText } from '../lib/addressUtils';
import { AddressDisplay } from '../components/AddressDisplay';

interface TenantFindHomeScreenProps {
  onBack?: () => void;
  onProfilePress?: () => void;
}

export const TenantFindHomeScreen: React.FC<TenantFindHomeScreenProps> = ({
  onBack,
  onProfilePress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, submitEnquiry } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format } = useMobileCurrency();

  const [activeTab, setActiveTab] = useState<'listings' | 'my_enquiries'>('listings');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<MobileUnit | null>(null);

  // Enquiry modal state
  const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
  const [prospectName, setProspectName] = useState(user?.displayName || '');
  const [prospectPhone, setProspectPhone] = useState(user?.phone || '');
  const [prospectEmail, setProspectEmail] = useState(user?.email || '');
  const [moveInDate, setMoveInDate] = useState(new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real vacant & publicly listed units only - 100% database bound
  const vacantUnits = useMemo(() => {
    return (state.units || []).filter(
      (u) => (u.status === 'vacant' || !u.status) && (u.isListedPublicly === true || u.isListedPublicly === undefined)
    );
  }, [state.units]);

  // Filtered listings
  const filteredUnits = useMemo(() => {
    if (!searchQuery.trim()) return vacantUnits;
    const q = searchQuery.toLowerCase().trim();
    return vacantUnits.filter((u) => {
      const prop = state.properties.find((p) => p.id === u.propertyId);
      const addrRes = prop ? getCleanAddressText(prop.address) : null;
      const addrStr = typeof addrRes === 'string' ? addrRes : addrRes?.text || '';
      const matchUnit = u.unitNumber?.toLowerCase().includes(q);
      const matchType = u.unitType?.toLowerCase().includes(q);
      const matchProp = prop?.name?.toLowerCase().includes(q);
      const matchCity = addrStr.toLowerCase().includes(q);
      const matchFurn = u.furnishing?.toLowerCase().includes(q);
      return matchUnit || matchType || matchProp || matchCity || matchFurn;
    });
  }, [vacantUnits, searchQuery, state.properties]);

  // Tenant's submitted enquiries
  const myEnquiries = useMemo(() => {
    const userEmail = user?.email?.toLowerCase().trim();
    const userId = user?.id;
    return (state.enquiries || []).filter((e) => {
      if (userId && e.tenantId === userId) return true;
      if (userEmail && e.prospectEmail?.toLowerCase().trim() === userEmail) return true;
      return false;
    });
  }, [state.enquiries, user]);

  const handleOpenEnquiry = (unit: MobileUnit) => {
    setSelectedUnit(unit);
    setProspectName(user?.displayName || '');
    setProspectPhone(user?.phone || '');
    setProspectEmail(user?.email || '');
    setNotes('');
    setIsEnquiryModalOpen(true);
  };

  const handleSubmitEnquiry = async () => {
    if (!selectedUnit) return;
    if (!prospectName.trim() || !prospectPhone.trim()) {
      Alert.alert('Required Fields', 'Please enter your name and phone number so the landlord can contact you.');
      return;
    }

    const prop = state.properties.find((p) => p.id === selectedUnit.propertyId);
    setIsSubmitting(true);
    try {
      if (submitEnquiry) {
        await submitEnquiry({
          unitId: selectedUnit.id,
          unitNumber: selectedUnit.unitNumber,
          propertyId: selectedUnit.propertyId || prop?.id || '',
          propertyName: prop?.name || selectedUnit.propertyName || 'Property',
          ownerId: selectedUnit.ownerId || prop?.ownerId || '',
          managerId: prop?.assignedManagerId,
          prospectName: prospectName.trim(),
          prospectPhone: prospectPhone.trim(),
          prospectEmail: prospectEmail.trim() || undefined,
          moveInDate: new Date().toISOString().split('T')[0],
          notes: notes.trim() || undefined,
          tenantId: user?.id,
        });
      }
      setIsEnquiryModalOpen(false);
      Alert.alert(
        'Enquiry Sent! ✓',
        `Your enquiry for Unit ${selectedUnit.unitNumber} has been delivered to the property owner and manager. They will reach out to you directly by phone or email.`
      );
      setActiveTab('my_enquiries');
    } catch (err) {
      console.error('Failed to submit enquiry:', err);
      Alert.alert('Error', 'Could not send enquiry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenStatusBar />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={20} color={colors.navy} />
            </TouchableOpacity>
          ) : (
            <View style={styles.logoBadge}>
              <PropithubIcon size={20} />
            </View>
          )}
          <View>
            <Text style={styles.headerTitle}>Find a Home</Text>
            <Text style={styles.headerSub}>Available properties & listings</Text>
          </View>
        </View>
        {onProfilePress && (
          <TouchableOpacity onPress={onProfilePress} style={styles.iconBtn} activeOpacity={0.7}>
            <Feather name="menu" size={20} color={colors.navy} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'listings' && styles.tabItemActive]}
          onPress={() => setActiveTab('listings')}
        >
          <Text style={[styles.tabText, activeTab === 'listings' && styles.tabTextActive]}>
            Explore Homes ({vacantUnits.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'my_enquiries' && styles.tabItemActive]}
          onPress={() => setActiveTab('my_enquiries')}
        >
          <Text style={[styles.tabText, activeTab === 'my_enquiries' && styles.tabTextActive]}>
            My Enquiries ({myEnquiries.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'listings' ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Search Box */}
          <View style={styles.searchBox}>
            <Feather name="search" size={17} color={colors.inkSoft} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by city, property, bedroom..."
              placeholderTextColor={colors.inkSoft}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            )}
          </View>

          {/* Listings List */}
          {filteredUnits.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="home" size={40} color={colors.inkSoft} style={{ opacity: 0.5 }} />
              <Text style={styles.emptyTitle}>No Homes Available</Text>
              <Text style={styles.emptySub}>
                {searchQuery
                  ? 'No vacant listings matched your search criteria. Try a different query.'
                  : 'All units across the portfolio are currently occupied. Check back soon for new openings!'}
              </Text>
            </View>
          ) : (
            filteredUnits.map((unit) => {
              const prop = state.properties.find(
                (p) =>
                  (unit.propertyId && p.id === unit.propertyId) ||
                  (p.name && unit.propertyName && (p.name || '').trim().toLowerCase() === (unit.propertyName || '').trim().toLowerCase()) ||
                  (unit.id && p.id && unit.id.includes(p.id))
              );
              const imgUri =
                (unit.images && unit.images[0]) ||
                unit.image ||
                (prop?.images && prop.images[0]) ||
                null;

              return (
                <View key={unit.id} style={styles.listingCard}>
                  {/* Photo */}
                  {imgUri ? (
                    <Image source={{ uri: imgUri }} style={styles.listingImage} resizeMode="cover" />
                  ) : (
                    <View
                      style={[
                        styles.listingImage,
                        {
                          backgroundColor: '#0f172a',
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 32 }}>🏢</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff', marginTop: 4 }}>
                        Unit {unit.unitNumber}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                        {prop?.name || 'Verified Residence'}
                      </Text>
                    </View>
                  )}

                  {/* Body */}
                  <View style={styles.cardBody}>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceText}>
                        {format(unit.rent, unit.currency || prop?.currency || 'INR')}
                        <Text style={styles.perMo}> / month</Text>
                      </Text>
                      <View style={styles.badgeVacant}>
                        <Text style={styles.badgeVacantText}>Available</Text>
                      </View>
                    </View>

                    <Text style={styles.buildingText}>
                      Unit {unit.unitNumber} {prop ? `· ${prop.name}` : ''}
                    </Text>

                    <View style={styles.locationRow}>
                      <Feather name="map-pin" size={12} color="#10B981" style={{ marginRight: 4 }} />
                      <AddressDisplay
                        address={prop?.address || (unit as any).address}
                        fallback="Address on file"
                        textStyle={styles.locationText}
                        linkStyle={{ fontSize: 12, color: '#0d9488', textDecorationLine: 'underline' }}
                        showMapLink={true}
                      />
                    </View>

                    {/* Specs Pill */}
                    <View style={styles.specsRow}>
                      <Text style={styles.specItem}>🛏 {unit.unitType || '2 BHK'}</Text>
                      {unit.areaSqFt ? <Text style={styles.specItem}>📐 {unit.areaSqFt} sq ft</Text> : null}
                      {unit.furnishing ? (
                        <Text style={styles.specItem} numberOfLines={1}>
                          🛋 {unit.furnishing}
                        </Text>
                      ) : null}
                    </View>

                    {/* Move-in transparent deposit breakdown */}
                    <View style={styles.costBox}>
                      <Text style={styles.costLabel}>Deposit:</Text>
                      <Text style={styles.costVal}>
                        {format(unit.deposit || unit.rent * 2, unit.currency || 'INR')}
                      </Text>
                      <Text style={styles.costSep}>•</Text>
                      <Text style={styles.costLabel}>Move-In Total:</Text>
                      <Text style={styles.costTotal}>
                        {format((unit.rent || 0) + (unit.deposit || unit.rent * 2), unit.currency || 'INR')}
                      </Text>
                    </View>

                    {/* CTA */}
                    <TouchableOpacity
                      style={styles.enquireBtn}
                      onPress={() => handleOpenEnquiry(unit)}
                      activeOpacity={0.8}
                    >
                      <Feather name="send" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.enquireBtnText}>Send Enquiry</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {myEnquiries.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="inbox" size={40} color={colors.inkSoft} style={{ opacity: 0.5 }} />
              <Text style={styles.emptyTitle}>No Sent Enquiries</Text>
              <Text style={styles.emptySub}>
                You have not submitted an enquiry yet. Explore available homes in the first tab and reach out to the landlord!
              </Text>
            </View>
          ) : (
            myEnquiries.map((enq) => (
              <View key={enq.id} style={styles.enquiryCard}>
                <View style={styles.enquiryHeader}>
                  <View>
                    <Text style={styles.enquiryUnit}>Unit {enq.unitNumber}</Text>
                    <Text style={styles.enquiryProp}>{enq.propertyName}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      enq.status === 'new'
                        ? styles.statusNew
                        : enq.status === 'reviewed'
                        ? styles.statusReviewed
                        : styles.statusOnboarded,
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>{enq.status.toUpperCase()}</Text>
                  </View>
                </View>

                <View style={styles.enquiryDetailRow}>
                  <Feather name="calendar" size={13} color={colors.inkSoft} />
                  <Text style={styles.enquiryDetailText}>
                    Target Move-in: {new Date(enq.moveInDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>

                {enq.notes ? (
                  <Text style={styles.enquiryNotes}>&quot;{enq.notes}&quot;</Text>
                ) : null}

                <View style={styles.enquiryFooter}>
                  <Text style={styles.enquiryDate}>
                    Sent: {new Date(enq.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={styles.enquiryContact}>Direct contact via phone</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Enquiry Modal */}
      {selectedUnit && (
        <Modal
          visible={isEnquiryModalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIsEnquiryModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Send Enquiry</Text>
                  <Text style={styles.modalSub}>
                    Unit {selectedUnit.unitNumber} • {state.properties.find((p) => p.id === selectedUnit.propertyId)?.name || 'Property'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setIsEnquiryModalOpen(false)} style={styles.modalClose}>
                  <Ionicons name="close" size={20} color={colors.navy} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {/* Notice Box */}
                <View style={styles.noticeBox}>
                  <Feather name="info" size={14} color="#047857" style={{ marginTop: 2, marginRight: 6 }} />
                  <Text style={styles.noticeText}>
                    The property owner &amp; manager will receive your contact details to coordinate walkthrough and onboarding directly off-platform.
                  </Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Name *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={prospectName}
                    onChangeText={setProspectName}
                    placeholder="Enter full name"
                    placeholderTextColor={colors.inkSoft}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Email *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={prospectEmail}
                    onChangeText={setProspectEmail}
                    placeholder="Enter email"
                    placeholderTextColor={colors.inkSoft}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Number *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={prospectPhone}
                    onChangeText={setProspectPhone}
                    placeholder="Enter phone number"
                    placeholderTextColor={colors.inkSoft}
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Note (Optional)</Text>
                  <TextInput
                    style={[styles.fieldInput, { height: 70, textAlignVertical: 'top' }]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Any notes or questions for the owner..."
                    placeholderTextColor={colors.inkSoft}
                    multiline
                  />
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => setIsEnquiryModalOpen(false)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={handleSubmitEnquiry}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>Send Enquiry</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    logoBadge: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: '#10B98115',
      alignItems: 'center',
      justifyContent: 'center',
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
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    tabItem: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabItemActive: {
      borderBottomColor: '#10B981',
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    tabTextActive: {
      color: '#10B981',
      fontWeight: '700',
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
      gap: 16,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: colors.navy,
      padding: 0,
    },
    emptyCard: {
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
    },
    emptySub: {
      fontSize: 13,
      color: colors.inkSoft,
      textAlign: 'center',
      lineHeight: 18,
    },
    listingCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    listingImage: {
      width: '100%',
      height: 180,
    },
    cardBody: {
      padding: 14,
      gap: 8,
    },
    priceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    priceText: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.navy,
    },
    perMo: {
      fontSize: 12,
      fontWeight: '400',
      color: colors.inkSoft,
    },
    badgeVacant: {
      backgroundColor: '#ecfdf5',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    badgeVacantText: {
      color: '#047857',
      fontSize: 11,
      fontWeight: '700',
    },
    buildingText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    locationText: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    specsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
    },
    specItem: {
      fontSize: 11.5,
      color: colors.inkSoft,
      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 4,
    },
    costBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? '#0F172A' : '#FAFAF9',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 4,
    },
    costLabel: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    costVal: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.navy,
    },
    costSep: {
      color: colors.inkSoft,
      fontSize: 10,
    },
    costTotal: {
      fontSize: 11.5,
      fontWeight: '700',
      color: '#10B981',
    },
    enquireBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      paddingVertical: 10,
      borderRadius: 8,
      marginTop: 6,
    },
    enquireBtnText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    enquiryCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 8,
    },
    enquiryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    enquiryUnit: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
    },
    enquiryProp: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    statusBadge: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 5,
    },
    statusNew: {
      backgroundColor: '#ecfdf5',
    },
    statusReviewed: {
      backgroundColor: '#eff6ff',
    },
    statusOnboarded: {
      backgroundColor: '#fef3c7',
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.navy,
    },
    enquiryDetailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    enquiryDetailText: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    enquiryNotes: {
      fontSize: 12,
      color: colors.navy,
      fontStyle: 'italic',
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      padding: 8,
      borderRadius: 6,
    },
    enquiryFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
      marginTop: 2,
    },
    enquiryDate: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    enquiryContact: {
      fontSize: 11,
      color: '#10B981',
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 18,
      gap: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 10,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
    },
    modalSub: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    modalClose: {
      padding: 4,
    },
    noticeBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: '#ecfdf5',
      borderRadius: 8,
      padding: 10,
      marginBottom: 12,
    },
    noticeText: {
      flex: 1,
      fontSize: 11.5,
      color: '#065f46',
      lineHeight: 16,
    },
    fieldGroup: {
      marginBottom: 10,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
      marginBottom: 5,
    },
    fieldInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 13,
      color: colors.navy,
    },
    modalFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 12,
    },
    btnSecondary: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    btnSecondaryText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.navy,
    },
    btnPrimary: {
      paddingHorizontal: 20,
      paddingVertical: 9,
      borderRadius: 8,
      backgroundColor: '#10B981',
      minWidth: 110,
      alignItems: 'center',
    },
    btnPrimaryText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
