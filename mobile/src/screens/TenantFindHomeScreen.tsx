import React, { useState, useMemo, useEffect } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, Feather, FontAwesome } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';
import { MobileUnit, MobileProperty } from '../types';
import { getCleanAddressText } from '../lib/addressUtils';
import { AddressDisplay } from '../components/AddressDisplay';

interface TenantFindHomeScreenProps {
  onBack?: () => void;
  onNavigate?: (screenKey: string) => void;
  onProfilePress?: () => void;
}

const parseBedsFromUnitType = (unitType?: string): number => {
  if (!unitType) return 1;
  const s = unitType.toLowerCase();
  if (s.includes('studio') || s === '0') return 0;
  const match = s.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 1;
};

const collectUnitAndPropertyPhotos = (unit: MobileUnit, prop?: MobileProperty | null): string[] => {
  const allPhotos: string[] = [];
  const addPhoto = (img?: any) => {
    if (typeof img === 'string' && img.trim().length > 10) {
      const clean = img.trim();
      if (!allPhotos.includes(clean)) {
        allPhotos.push(clean);
      }
    }
  };

  if (Array.isArray(unit.images)) unit.images.forEach(addPhoto);
  if (Array.isArray((unit as any).photos)) (unit as any).photos.forEach(addPhoto);
  addPhoto(unit.image);
  addPhoto((unit as any).photo);
  addPhoto((unit as any).coverImage);

  if (prop) {
    if (Array.isArray(prop.images)) prop.images.forEach(addPhoto);
    if (Array.isArray((prop as any).photos)) (prop as any).photos.forEach(addPhoto);
    addPhoto((prop as any).image);
    addPhoto((prop as any).coverImage);
    if (Array.isArray(prop.amenityPhotos)) {
      prop.amenityPhotos.forEach((ap) => addPhoto(ap?.image));
    }
  }
  return allPhotos;
};

export const TenantFindHomeScreen: React.FC<TenantFindHomeScreenProps> = ({
  onBack,
  onNavigate,
  onProfilePress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, submitEnquiry } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format } = useMobileCurrency();

  const [activeTab, setActiveTab] = useState<'listings' | 'my_enquiries'>('listings');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBedsFilter, setSelectedBedsFilter] = useState<'any' | '0' | '1' | '2' | '3'>('any');
  const [selectedFurnishing, setSelectedFurnishing] = useState<'all' | 'Fully' | 'Semi' | 'Unfurnished'>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [maxRentFilter, setMaxRentFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'rec' | 'lo' | 'hi'>('rec');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [cardPhotoIndex, setCardPhotoIndex] = useState<Record<string, number>>({});

  // Detail & Lightbox Modal State
  const [detailUnit, setDetailUnit] = useState<MobileUnit | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; label?: string } | null>(null);

  // Enquiry modal state
  const [selectedUnit, setSelectedUnit] = useState<MobileUnit | null>(null);
  const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
  const [prospectName, setProspectName] = useState(user?.displayName || '');
  const [prospectPhone, setProspectPhone] = useState(user?.phone || '');
  const [prospectEmail, setProspectEmail] = useState(user?.email || '');
  const [moveInDate, setMoveInDate] = useState(new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load saved homes from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem('propithub_saved_homes')
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setSavedIds(new Set(parsed));
        }
      })
      .catch(() => {});
  }, []);

  const toggleSave = (unitId: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      AsyncStorage.setItem('propithub_saved_homes', JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  };

  const resolveProperty = (unit: MobileUnit): MobileProperty | undefined => {
    return (state.properties || []).find(
      (p) =>
        (unit.propertyId && p.id === unit.propertyId) ||
        (p.name &&
          unit.propertyName &&
          (p.name || '').trim().toLowerCase() === (unit.propertyName || '').trim().toLowerCase()) ||
        (unit.id && p.id && unit.id.includes(p.id))
    );
  };

  // Real vacant & publicly listed units only - 100% database bound
  const vacantUnits = useMemo(() => {
    return (state.units || []).filter(
      (u) => (u.status === 'vacant' || !u.status) && (u.isListedPublicly === true || u.isListedPublicly === undefined)
    );
  }, [state.units]);

  // Filtered & sorted listings matching Web ListingsPage.tsx
  const filteredUnits = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = vacantUnits.filter((u) => {
      if (showSavedOnly && !savedIds.has(u.id)) return false;

      const beds = parseBedsFromUnitType(u.unitType);
      if (selectedBedsFilter !== 'any') {
        if (selectedBedsFilter === '0' && beds !== 0) return false;
        if (selectedBedsFilter === '1' && beds !== 1) return false;
        if (selectedBedsFilter === '2' && beds !== 2) return false;
        if (selectedBedsFilter === '3' && beds < 3) return false;
      }

      if (selectedFurnishing !== 'all') {
        if (!(u.furnishing || '').toLowerCase().includes(selectedFurnishing.toLowerCase())) return false;
      }

      if (selectedCountry !== 'all') {
        const prop = resolveProperty(u);
        const unitCountry = ((prop as any)?.country || (prop?.address as any)?.country || '').toLowerCase();
        if (!unitCountry.includes(selectedCountry.toLowerCase())) return false;
      }

      const maxRentNum = parseFloat(maxRentFilter);
      if (!Number.isNaN(maxRentNum) && maxRentNum > 0) {
        if ((Number(u.rent) || 0) > maxRentNum) return false;
      }

      if (q) {
        const prop = resolveProperty(u);
        const addrRes = prop ? getCleanAddressText(prop.address) : null;
        const addrStr = typeof addrRes === 'string' ? addrRes : addrRes?.text || '';
        const amenitiesStr = Array.isArray(prop?.amenities) ? prop!.amenities.join(' ').toLowerCase() : '';
        const matchUnit = u.unitNumber?.toLowerCase().includes(q);
        const matchType = u.unitType?.toLowerCase().includes(q);
        const matchProp = (prop?.name || u.propertyName || '').toLowerCase().includes(q);
        const matchCity = addrStr.toLowerCase().includes(q);
        const matchFurn = (u.furnishing || '').toLowerCase().includes(q);
        const matchAmen = amenitiesStr.includes(q);
        if (!matchUnit && !matchType && !matchProp && !matchCity && !matchFurn && !matchAmen) return false;
      }

      return true;
    });

    const popularRank = (a: MobileUnit, b: MobileUnit) => {
      const aProp = resolveProperty(a);
      const bProp = resolveProperty(b);
      const aUntil = (a as any).popularUntil || (aProp as any)?.popularUntil;
      const bUntil = (b as any).popularUntil || (bProp as any)?.popularUntil;
      const aPop = Boolean(((a as any).isPopular || (aProp as any)?.isPopular) && aUntil && new Date(aUntil).getTime() > Date.now());
      const bPop = Boolean(((b as any).isPopular || (bProp as any)?.isPopular) && bUntil && new Date(bUntil).getTime() > Date.now());
      if (aPop && !bPop) return -1;
      if (!aPop && bPop) return 1;
      return 0;
    };

    if (sortBy === 'lo') {
      return [...list].sort((a, b) => popularRank(a, b) || (Number(a.rent) || 0) - (Number(b.rent) || 0));
    }
    if (sortBy === 'hi') {
      return [...list].sort((a, b) => popularRank(a, b) || (Number(b.rent) || 0) - (Number(a.rent) || 0));
    }
    return [...list].sort((a, b) => popularRank(a, b));
  }, [vacantUnits, searchQuery, selectedBedsFilter, selectedFurnishing, selectedCountry, maxRentFilter, sortBy, showSavedOnly, savedIds, state.properties]);

  // Tenant's submitted enquiries (matching Web by tenantId, email, and phone)
  const myEnquiries = useMemo(() => {
    const userEmail = user?.email?.toLowerCase().trim();
    const userId = user?.id;
    const userPhoneClean = (user?.phone || '').replace(/[^0-9]/g, '');
    return (state.enquiries || []).filter((e) => {
      if (userId && e.tenantId === userId) return true;
      if (userEmail && e.prospectEmail?.toLowerCase().trim() === userEmail) return true;
      if (userPhoneClean && (e.prospectPhone || '').replace(/[^0-9]/g, '') === userPhoneClean) return true;
      return false;
    });
  }, [state.enquiries, user]);

  const handleOpenEnquiry = (unit: MobileUnit) => {
    setSelectedUnit(unit);
    setProspectName(user?.displayName || '');
    setProspectPhone(user?.phone || '');
    setProspectEmail(user?.email || '');
    setMoveInDate(new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0]);
    setNotes('');
    setIsEnquiryModalOpen(true);
  };

  const handleSubmitEnquiry = async () => {
    if (!selectedUnit) return;
    if (!prospectName.trim() || !prospectPhone.trim()) {
      Alert.alert('Required Fields', 'Please enter your name and phone number so the landlord can contact you.');
      return;
    }

    const prop = resolveProperty(selectedUnit);
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
          moveInDate: moveInDate.trim() || new Date().toISOString().split('T')[0],
          notes: notes.trim() || 'Interested in booking a viewing and rental terms.',
          tenantId: user?.id,
        });
      }
      setIsEnquiryModalOpen(false);
      setDetailUnit(null);
      Alert.alert(
        'Enquiry Sent! ✓',
        `Your enquiry for Unit ${selectedUnit.unitNumber} has been delivered to the property owner and manager.`
      );
      setActiveTab('my_enquiries');
    } catch (err) {
      console.error('Failed to submit enquiry:', err);
      Alert.alert('Error', 'Could not send enquiry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedBedsFilter !== 'any' ||
    selectedFurnishing !== 'all' ||
    showSavedOnly;

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedBedsFilter('any');
    setSelectedFurnishing('all');
    setShowSavedOnly(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenStatusBar />

      {/* Unified Header */}
      <Header
        title="Find a Home"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      {/* Tabs: Explore Listings | My Enquiries */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'listings' && styles.tabItemActive]}
          onPress={() => setActiveTab('listings')}
        >
          <Text style={[styles.tabText, activeTab === 'listings' && styles.tabTextActive]}>
            Explore Listings ({vacantUnits.length})
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
            <Feather name="search" size={16} color={colors.inkSoft} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by city, property, unit, bedroom..."
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

          {/* Compact Filter & Sort Strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {([
              { key: 'any', label: 'Any Beds' },
              { key: '0', label: 'Studio' },
              { key: '1', label: '1 Bed' },
              { key: '2', label: '2 Beds' },
              { key: '3', label: '3+ Beds' },
            ] as const).map((b) => {
              const isSelected = selectedBedsFilter === b.key;
              return (
                <TouchableOpacity
                  key={b.key}
                  onPress={() => setSelectedBedsFilter(b.key)}
                  style={[styles.filterChip, isSelected && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                    {b.label}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              onPress={() =>
                setSelectedFurnishing((prev) =>
                  prev === 'all' ? 'Fully' : prev === 'Fully' ? 'Semi' : prev === 'Semi' ? 'Unfurnished' : 'all'
                )
              }
              style={[styles.filterChip, selectedFurnishing !== 'all' && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, selectedFurnishing !== 'all' && styles.filterChipTextActive]}>
                {selectedFurnishing === 'all' ? 'Any Furnishing' : `${selectedFurnishing} Furnished`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setSortBy((prev) => (prev === 'rec' ? 'lo' : prev === 'lo' ? 'hi' : 'rec'))}
              style={styles.filterChip}
            >
              <Feather name="sliders" size={11} color={colors.inkSoft} style={{ marginRight: 4 }} />
              <Text style={styles.filterChipText}>
                {sortBy === 'rec' ? 'Recommended' : sortBy === 'lo' ? 'Price: Low → High' : 'Price: High → Low'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                setSelectedCountry((prev) =>
                  prev === 'all' ? 'India' : prev === 'India' ? 'USA' : prev === 'USA' ? 'UK' : prev === 'UK' ? 'UAE' : 'all'
                )
              }
              style={[styles.filterChip, selectedCountry !== 'all' && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, selectedCountry !== 'all' && styles.filterChipTextActive]}>
                {selectedCountry === 'all' ? 'All Countries' : selectedCountry}
              </Text>
            </TouchableOpacity>

            <View style={[styles.filterChip, { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }]}>
              <Text style={[styles.filterChipText, { marginRight: 4 }]}>Max Rent:</Text>
              <TextInput
                value={maxRentFilter}
                onChangeText={setMaxRentFilter}
                placeholder="Any"
                placeholderTextColor={colors.inkSoft}
                keyboardType="numeric"
                style={{ minWidth: 52, fontSize: 12, color: colors.text, padding: 0 }}
              />
            </View>

            <TouchableOpacity
              onPress={() => setShowSavedOnly(!showSavedOnly)}
              style={[styles.filterChip, showSavedOnly && styles.filterChipActive]}
            >
              <FontAwesome
                name={showSavedOnly ? 'heart' : 'heart-o'}
                size={11}
                color={showSavedOnly ? '#FFFFFF' : '#EF4444'}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.filterChipText, showSavedOnly && styles.filterChipTextActive]}>
                Saved ({savedIds.size})
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {hasActiveFilters && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: colors.inkSoft }}>
                Showing {filteredUnits.length} of {vacantUnits.length} homes
              </Text>
              <TouchableOpacity onPress={clearAllFilters}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>Reset filters</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Listings List */}
          {filteredUnits.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="home" size={28} color={colors.inkSoft} style={{ opacity: 0.5 }} />
              <Text style={styles.emptyTitle}>
                {vacantUnits.length === 0 ? 'No Vacant Homes Published Yet' : 'No Homes Match Your Filters'}
              </Text>
              {hasActiveFilters && (
                <TouchableOpacity
                  onPress={clearAllFilters}
                  style={{ marginTop: 6, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#10B981', borderRadius: 8 }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredUnits.map((unit) => {
              const prop = resolveProperty(unit);
              const photos = collectUnitAndPropertyPhotos(unit, prop);
              const totalPhotos = photos.length;
              const activePhotoIdx = totalPhotos > 0 ? (cardPhotoIndex[unit.id] || 0) % totalPhotos : 0;
              const imgUri = totalPhotos > 0 ? photos[activePhotoIdx] : null;
              const isSaved = savedIds.has(unit.id);
              const unitCurr = unit.currency || prop?.currency || 'INR';
              const rawPopularUntil = (unit as any).popularUntil || (prop as any)?.popularUntil;
              const isPopularUnit = Boolean(
                ((unit as any).isPopular || (prop as any)?.isPopular) &&
                rawPopularUntil &&
                new Date(rawPopularUntil).getTime() > Date.now()
              );
              const propReviews = (state.reviews || []).filter(
                (r) =>
                  (prop?.id && r.propertyId === prop.id) ||
                  (prop?.ownerId && r.ownerId === prop.ownerId) ||
                  (unit.ownerId && r.ownerId === unit.ownerId)
              );
              const avgRating =
                propReviews.length > 0
                  ? (propReviews.reduce((sum, r) => sum + (Number(r.rating) || 5), 0) / propReviews.length).toFixed(1)
                  : null;

              return (
                <TouchableOpacity
                  key={unit.id}
                  style={[
                    styles.listingCard,
                    isPopularUnit && { borderColor: 'rgba(217, 119, 6, 0.55)', borderWidth: 1.5 },
                  ]}
                  activeOpacity={0.92}
                  onPress={() => setDetailUnit(unit)}
                >
                  {/* Photo Area */}
                  <View style={{ position: 'relative' }}>
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
                          {prop?.name || unit.propertyName || 'Verified Residence'}
                        </Text>
                      </View>
                    )}

                    {/* Top Left Unit Badge */}
                    <View
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        flexDirection: 'row',
                        gap: 6,
                        alignItems: 'center',
                      }}
                    >
                      {isPopularUnit && (
                        <View
                          style={{
                            backgroundColor: '#D97706',
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                          }}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>
                            🔥 POPULAR
                          </Text>
                        </View>
                      )}
                      <View
                        style={{
                          backgroundColor: 'rgba(15, 23, 42, 0.78)',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                          Unit {unit.unitNumber}
                        </Text>
                      </View>
                      {totalPhotos > 1 && (
                        <TouchableOpacity
                          onPress={() =>
                            setCardPhotoIndex((prev) => ({
                              ...prev,
                              [unit.id]: ((prev[unit.id] || 0) + 1) % totalPhotos,
                            }))
                          }
                          style={{
                            backgroundColor: 'rgba(15, 23, 42, 0.78)',
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Feather name="image" size={11} color="#FFFFFF" />
                          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>
                            {activePhotoIdx + 1}/{totalPhotos} ›
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Top Right Save Button */}
                    <TouchableOpacity
                      onPress={() => toggleSave(unit.id)}
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FontAwesome
                        name={isSaved ? 'heart' : 'heart-o'}
                        size={15}
                        color={isSaved ? '#EF4444' : '#FFFFFF'}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Card Body */}
                  <View style={styles.cardBody}>
                    <View style={styles.priceRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.buildingText} numberOfLines={1}>
                          {prop?.name || unit.propertyName || `Unit ${unit.unitNumber}`}
                        </Text>
                      </View>
                      {avgRating ? (
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>
                          ★ {avgRating}
                        </Text>
                      ) : (
                        <View style={styles.badgeVacant}>
                          <Text style={styles.badgeVacantText}>Verified</Text>
                        </View>
                      )}
                    </View>

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

                    <Text style={{ fontSize: 12, color: colors.inkSoft }}>
                      {unit.unitType || '1 BHK'}
                      {unit.bathrooms ? ` · ${unit.bathrooms} bath` : ''}
                      {unit.areaSqFt ? ` · ${unit.areaSqFt} sq ft` : ''}
                      {unit.furnishing ? ` · ${unit.furnishing}` : ''}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <View>
                        <Text style={styles.priceText}>
                          {format(unit.rent, unitCurr)}
                          <Text style={styles.perMo}> / month</Text>
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.inkSoft }}>
                          Deposit: {format(unit.deposit || unit.rent * 2, unitCurr)}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.background,
                          }}
                          onPress={() => setDetailUnit(unit)}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.navy }}>Details</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            borderRadius: 8,
                            backgroundColor: '#10B981',
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                          onPress={() => handleOpenEnquiry(unit)}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Enquire</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {myEnquiries.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="inbox" size={32} color={colors.inkSoft} style={{ opacity: 0.5 }} />
              <Text style={styles.emptyTitle}>No Enquiries Submitted Yet</Text>
              <Text style={styles.emptySub}>
                When you find an available home and submit an enquiry, its live status will appear here.
              </Text>
              <TouchableOpacity
                onPress={() => setActiveTab('listings')}
                style={{ marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#10B981', borderRadius: 8 }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Browse Available Homes →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            myEnquiries.map((enq) => (
              <View key={enq.id} style={styles.enquiryCard}>
                <View style={styles.enquiryHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.enquiryUnit}>
                      Unit {enq.unitNumber} · {enq.propertyName}
                    </Text>
                    <Text style={styles.enquiryProp}>
                      Desired Move-In: {enq.moveInDate} • Sent: {new Date(enq.createdAt).toLocaleDateString()}
                    </Text>
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
                    <Text style={styles.statusBadgeText}>
                      {enq.status === 'onboarded'
                        ? 'Lease Invite Ready'
                        : enq.status === 'reviewed'
                        ? 'Reviewed'
                        : 'Awaiting Call'}
                    </Text>
                  </View>
                </View>

                {enq.notes ? (
                  <Text style={styles.enquiryNotes}>&quot;{enq.notes}&quot;</Text>
                ) : null}

                <View style={styles.enquiryFooter}>
                  <Text style={styles.enquiryDate}>Phone: {enq.prospectPhone}</Text>
                  <Text style={styles.enquiryContact}>Direct landlord contact</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* =============================================================== */}
      {/* MODAL 1: LISTING DETAIL MODAL (100% Web ListingDetailPage Parity) */}
      {/* =============================================================== */}
      {detailUnit && (() => {
        const prop = resolveProperty(detailUnit);
        const photos = collectUnitAndPropertyPhotos(detailUnit, prop);
        const unitCurr = detailUnit.currency || prop?.currency || 'INR';
        const amenities = Array.isArray(prop?.amenities) ? prop!.amenities : [];
        const amenityPhotos = Array.isArray(prop?.amenityPhotos) ? prop!.amenityPhotos.filter((ap) => ap?.image) : [];
        const isSaved = savedIds.has(detailUnit.id);
        const description =
          (detailUnit as any).description ||
          (prop as any)?.description ||
          `Unit ${detailUnit.unitNumber} at ${prop?.name || detailUnit.propertyName || 'Verified Residence'}. Layout: ${detailUnit.unitType || '1 BHK'}${
            detailUnit.bathrooms ? `, ${detailUnit.bathrooms} bathroom(s)` : ''
          }${detailUnit.areaSqFt ? `, ${detailUnit.areaSqFt} sq ft` : ''}, ${detailUnit.furnishing || 'Unfurnished'}.`;

        return (
          <Modal
            visible={Boolean(detailUnit)}
            transparent
            animationType="slide"
            onRequestClose={() => setDetailUnit(null)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { maxHeight: '90%' }]}>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.modalTitle}>
                      Unit {detailUnit.unitNumber} · {prop?.name || detailUnit.propertyName || 'Property'}
                    </Text>
                    <Text style={styles.modalSub}>
                      Verified Direct Landlord Listing
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity onPress={() => toggleSave(detailUnit.id)} style={{ padding: 4 }}>
                      <FontAwesome
                        name={isSaved ? 'heart' : 'heart-o'}
                        size={18}
                        color={isSaved ? '#EF4444' : colors.inkSoft}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDetailUnit(null)} style={styles.modalClose}>
                      <Ionicons name="close" size={22} color={colors.navy} />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
                  {/* Photo Gallery Strip */}
                  {photos.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {photos.map((imgUrl, idx) => (
                        <TouchableOpacity
                          key={idx}
                          activeOpacity={0.85}
                          onPress={() => setLightboxImage({ url: imgUrl, label: `Photo ${idx + 1} of ${photos.length}` })}
                        >
                          <Image
                            source={{ uri: imgUrl }}
                            style={{ width: photos.length === 1 ? 320 : 240, height: 170, borderRadius: 12 }}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <View
                      style={{
                        height: 140,
                        borderRadius: 12,
                        backgroundColor: '#0f172a',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 28 }}>🏢</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginTop: 4 }}>
                        Unit {detailUnit.unitNumber} · {prop?.name || 'Residence'}
                      </Text>
                    </View>
                  )}

                  {/* Address */}
                  <View style={styles.locationRow}>
                    <Feather name="map-pin" size={13} color="#10B981" style={{ marginRight: 4 }} />
                    <AddressDisplay
                      address={prop?.address || (detailUnit as any).address}
                      fallback="Address on file"
                      textStyle={styles.locationText}
                      linkStyle={{ fontSize: 12, color: '#0d9488', textDecorationLine: 'underline' }}
                      showMapLink={true}
                    />
                  </View>

                  {/* Quick Facts Row */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <View style={styles.factBox}>
                      <Text style={styles.factVal}>{detailUnit.unitType || '1 BHK'}</Text>
                      <Text style={styles.factLbl}>Layout</Text>
                    </View>
                    {detailUnit.bathrooms ? (
                      <View style={styles.factBox}>
                        <Text style={styles.factVal}>{detailUnit.bathrooms} Bath</Text>
                        <Text style={styles.factLbl}>Bathrooms</Text>
                      </View>
                    ) : null}
                    {detailUnit.areaSqFt ? (
                      <View style={styles.factBox}>
                        <Text style={styles.factVal}>{detailUnit.areaSqFt} sq ft</Text>
                        <Text style={styles.factLbl}>Area</Text>
                      </View>
                    ) : null}
                    <View style={styles.factBox}>
                      <Text style={styles.factVal}>{detailUnit.furnishing || 'Unfurnished'}</Text>
                      <Text style={styles.factLbl}>Furnishing</Text>
                    </View>
                    {detailUnit.floor !== undefined && detailUnit.floor !== '' ? (
                      <View style={styles.factBox}>
                        <Text style={styles.factVal}>Floor {detailUnit.floor}</Text>
                        <Text style={styles.factLbl}>Level</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Description */}
                  <View>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.navy, marginBottom: 4 }}>
                      About this home
                    </Text>
                    <Text style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 }}>
                      {description}
                    </Text>
                  </View>

                  {/* Building Amenities & Photos */}
                  {amenities.length > 0 && (
                    <View>
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.navy, marginBottom: 6 }}>
                        Building Amenities
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {amenities.map((item, i) => (
                          <View
                            key={i}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                              backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                            }}
                          >
                            <Feather name="check" size={11} color="#10B981" />
                            <Text style={{ fontSize: 11.5, color: colors.navy }}>{item}</Text>
                          </View>
                        ))}
                      </View>

                      {amenityPhotos.length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 8, marginTop: 8 }}
                        >
                          {amenityPhotos.map((ap, idx) => (
                            <TouchableOpacity
                              key={idx}
                              activeOpacity={0.85}
                              onPress={() => setLightboxImage({ url: ap.image, label: `Amenity: ${ap.name}` })}
                              style={{ width: 120, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}
                            >
                              <Image source={{ uri: ap.image }} style={{ width: 120, height: 75 }} resizeMode="cover" />
                              <Text
                                style={{ fontSize: 10.5, fontWeight: '600', color: colors.navy, padding: 4 }}
                                numberOfLines={1}
                              >
                                {ap.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  )}

                  {/* Transparent Move-in Breakdown */}
                  <View
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12.5, color: colors.inkSoft }}>Monthly Rent</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>
                        {format(detailUnit.rent, unitCurr)}/mo
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12.5, color: colors.inkSoft }}>Refundable Security Deposit</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>
                        {format(detailUnit.deposit || detailUnit.rent * 2, unitCurr)}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        paddingTop: 6,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.navy }}>Total Move-In</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#10B981' }}>
                        {format((detailUnit.rent || 0) + (detailUnit.deposit || detailUnit.rent * 2), unitCurr)}
                      </Text>
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.modalFooter}>
                  <TouchableOpacity style={styles.btnSecondary} onPress={() => setDetailUnit(null)}>
                    <Text style={styles.btnSecondaryText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={() => {
                      const target = detailUnit;
                      setDetailUnit(null);
                      handleOpenEnquiry(target);
                    }}
                  >
                    <Text style={styles.btnPrimaryText}>Send Enquiry</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* =============================================================== */}
      {/* MODAL 2: SEND ENQUIRY MODAL                                     */}
      {/* =============================================================== */}
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
                    Unit {selectedUnit.unitNumber} • {resolveProperty(selectedUnit)?.name || selectedUnit.propertyName || 'Property'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setIsEnquiryModalOpen(false)} style={styles.modalClose}>
                  <Ionicons name="close" size={20} color={colors.navy} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Full Name *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={prospectName}
                    onChangeText={setProspectName}
                    placeholder="Enter full name"
                    placeholderTextColor={colors.inkSoft}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Phone Number *</Text>
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
                  <Text style={styles.fieldLabel}>Email</Text>
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
                  <Text style={styles.fieldLabel}>Desired Move-In Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={moveInDate}
                    onChangeText={setMoveInDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.inkSoft}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Message / Notes (Optional)</Text>
                  <TextInput
                    style={[styles.fieldInput, { height: 68, textAlignVertical: 'top' }]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Preferred viewing time or questions for the landlord..."
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

      {/* =============================================================== */}
      {/* MODAL 3: FULLSCREEN PHOTO LIGHTBOX                              */}
      {/* =============================================================== */}
      {lightboxImage && (
        <Modal
          visible={Boolean(lightboxImage)}
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxImage(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(15, 23, 42, 0.94)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 16,
            }}
          >
            <TouchableOpacity
              onPress={() => setLightboxImage(null)}
              style={{
                position: 'absolute',
                top: 48,
                right: 20,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.16)',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>✕ Close</Text>
            </TouchableOpacity>
            <Image
              source={{ uri: lightboxImage.url }}
              style={{ width: '100%', height: '72%', borderRadius: 12 }}
              resizeMode="contain"
            />
            {lightboxImage.label ? (
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginTop: 12 }}>
                {lightboxImage.label}
              </Text>
            ) : null}
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
      gap: 12,
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
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    filterChipActive: {
      backgroundColor: '#0F172A',
      borderColor: '#0F172A',
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    filterChipTextActive: {
      color: '#FFFFFF',
    },
    emptyCard: {
      padding: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
      textAlign: 'center',
    },
    emptySub: {
      fontSize: 12.5,
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
      height: 175,
    },
    cardBody: {
      padding: 14,
      gap: 6,
    },
    priceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    priceText: {
      fontSize: 16,
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
      fontSize: 15,
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
    factBox: {
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: 76,
    },
    factVal: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
    },
    factLbl: {
      fontSize: 10.5,
      color: colors.inkSoft,
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
      fontSize: 14.5,
      fontWeight: '700',
      color: colors.navy,
    },
    enquiryProp: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    statusNew: {
      backgroundColor: '#fef3c7',
    },
    statusReviewed: {
      backgroundColor: '#eff6ff',
    },
    statusOnboarded: {
      backgroundColor: '#ecfdf5',
    },
    statusBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: '#0F172A',
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
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    enquiryContact: {
      fontSize: 11.5,
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
