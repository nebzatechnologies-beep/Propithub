import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Modal,
  Image,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubLogo, PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileToast } from '../context/MobileToastContext';
import { useTenantActiveUnit, resolveInvoiceCurrency } from '../hooks/useTenantActiveUnit';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { TenantMultiPropertySwitcher } from '../components/TenantMultiPropertySwitcher';
import { MobileTenancyRequest, MobileMoveOut } from '../types';
import { getTenantReminders, DashboardReminder } from '../lib/reminders';
import { syncDeviceRemindersAsync } from '../lib/notifications';
import { downloadOrShareDocument } from '../lib/documentService';
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { MobileProperty, MobileUnit } from '../types';

interface TenantDashboardScreenProps {
  onNavigate?: (screenKey: string) => void;
  onProfilePress?: () => void;
}

export const TenantDashboardScreen: React.FC<TenantDashboardScreenProps> = ({
  onNavigate,
  onProfilePress,
}) => {
  const { colors, isDark } = useMobileTheme();
  const {
    state,
    acknowledgeAnnouncement,
    updateTenancyRequest,
    confirmCashClaim,
    rejectCashClaim,
    updateMoveOut,
    confirmRefundReceipt,
  } = useMobileAppData();
  const { user } = useMobileAuth();
  const { format, viewCurrency, setViewCurrency } = useMobileCurrency();
  const { showToast } = useMobileToast();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      showToast('Dashboard up to date ✓', 'info');
    }, 700);
  }, [showToast]);

  const {
    myUnits,
    isMultiUnit,
    activeUnit,
    activeAgreement,
    activeProperty,
    activeCurrency,
    activeRent,
    activeDeposit,
    activeUnitPendingInvoices,
    allTenantPendingInvoices,
    selectedTenantUnitId,
    setSelectedTenantUnitId,
  } = useTenantActiveUnit();

  const userEmail = (user?.email || '').toLowerCase().trim();

  // Modals & review state
  const [reviewingRequest, setReviewingRequest] = useState<MobileTenancyRequest | null>(null);
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'unit' | 'property' | 'amenity'>('all');
  const [galleryActiveIndex, setGalleryActiveIndex] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [liveReviewProp, setLiveReviewProp] = useState<MobileProperty | null>(null);
  const [liveReviewUnit, setLiveReviewUnit] = useState<MobileUnit | null>(null);

  // Live real-time fetch of exact property and unit on review modal open
  useEffect(() => {
    if (!reviewingRequest) {
      setLiveReviewProp(null);
      setLiveReviewUnit(null);
      return;
    }
    let isMounted = true;
    const fetchFreshMedia = async () => {
      try {
        if (reviewingRequest.propertyId) {
          const pRef = doc(db, 'properties', reviewingRequest.propertyId);
          const pSnap = await getDoc(pRef);
          if (pSnap.exists() && isMounted) {
            setLiveReviewProp({ id: pSnap.id, ...pSnap.data() } as MobileProperty);
          }
        }
        if (reviewingRequest.unitId) {
          const uRef = doc(db, 'units', reviewingRequest.unitId);
          const uSnap = await getDoc(uRef);
          if (uSnap.exists() && isMounted) {
            setLiveReviewUnit({ id: uSnap.id, ...uSnap.data() } as MobileUnit);
          }
        }
      } catch (err) {
        console.warn('Live review media fetch error:', err);
      }
    };
    fetchFreshMedia();
    return () => {
      isMounted = false;
    };
  }, [reviewingRequest]);

  // Settlement review state
  const [reviewingMoveOut, setReviewingMoveOut] = useState<MobileMoveOut | null>(null);
  const [payoutMethod, setPayoutMethod] = useState<'upi' | 'bank_in' | 'paypal' | 'cash'>('upi');
  const [payoutUpiId, setPayoutUpiId] = useState('');
  const [payoutAccount, setPayoutAccount] = useState('');
  const [payoutIfsc, setPayoutIfsc] = useState('');

  // Find incoming tenancy requests (1-to-1 Web Parity)
  // Find incoming tenancy requests strictly by unique ID and verified email
  const incomingRequest = useMemo(() => {
    const userEmail = (user?.email || '').toLowerCase().trim();
    return (state.tenancyRequests || []).find(
      (r) =>
        r.status === 'pending' &&
        ((user?.id && r.tenantId === user.id) ||
          (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail))
    );
  }, [state.tenancyRequests, user]);

  // Real-time automated reminders matching web getTenantReminders
  const tenantReminders = useMemo(() => {
    return getTenantReminders(state, user);
  }, [state, user]);

  // Sync background device-level local push notifications (rent due 9AM, walkthrough 24h, lease expiry)
  useEffect(() => {
    if (tenantReminders.length > 0) {
      syncDeviceRemindersAsync(tenantReminders).catch((err) => {
        console.warn('[PushNotifications] syncDeviceRemindersAsync error:', err);
      });
    }
  }, [tenantReminders]);

  // Find active tenant record matching user and current active unit
  const currentTenant = useMemo(() => {
    const userEmail = (user?.email || '').toLowerCase().trim();
    const userId = user?.id || '';

    // Priority 1: Record matching both user and active unit
    const foundUnitSpecific = state.tenants.find((t) => {
      const matchUser = (t.email && t.email.toLowerCase().trim() === userEmail) || (userId && t.id === userId);
      if (!matchUser) return false;
      if (!activeUnit) return true;
      const uNum = (activeUnit.unitNumber || '').toLowerCase().trim();
      const uId = (activeUnit.id || '').toLowerCase().trim();
      const tUnit = (t.unit || '').toLowerCase().trim();
      return (
        Boolean(uNum && tUnit === uNum) ||
        Boolean(uId && tUnit === uId)
      );
    });

    const foundFallback = state.tenants.find(
      (t) => (t.email && t.email.toLowerCase().trim() === userEmail) || (userId && t.id === userId)
    );

    const baseRecord = foundUnitSpecific || foundFallback;
    const rawCandidateName = user?.displayName || baseRecord?.name;
    let residentName = 'Resident';
    if (rawCandidateName && !rawCandidateName.includes('@')) {
      residentName = rawCandidateName.trim();
    } else if (userEmail) {
      const emailPrefix = userEmail.split('@')[0];
      residentName = emailPrefix ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) : 'Resident';
    }

    return {
      id: baseRecord?.id || userId || 'TEN-UNASSIGNED',
      name: residentName,
      unit: activeUnit?.unitNumber || baseRecord?.unit || 'Pending',
      rent: activeRent || baseRecord?.rent || 0,
      deposit: activeDeposit || baseRecord?.deposit || 0,
      propertyId: activeProperty?.id || activeUnit?.propertyId || baseRecord?.propertyId || '',
      propertyName: activeProperty?.name || activeUnit?.propertyName || baseRecord?.propertyName || 'Residence Overview',
      ownerId: activeProperty?.ownerId || activeUnit?.ownerId || baseRecord?.ownerId || user?.ownerId || '',
      phone: baseRecord?.phone || user?.phone || '',
      email: baseRecord?.email || userEmail,
      leaseStart: activeAgreement?.start || baseRecord?.leaseStart || '',
      leaseEnd: activeAgreement?.end || baseRecord?.leaseEnd || '',
      currency: activeCurrency,
      rating: baseRecord?.rating || 0,
      kycStatus: baseRecord?.kycStatus || ('pending' as const),
      policeVerificationDone: baseRecord?.policeVerificationDone || false,
    };
  }, [state.tenants, user, activeUnit, activeRent, activeDeposit, activeProperty, activeAgreement, activeCurrency]);

  // Check if resident has any active or pending lease context (web parity)
  const hasActiveOrPendingLease = useMemo(() => {
    const userEmail = (user?.email || '').toLowerCase().trim();
    const userId = user?.id || '';
    const residentName = (currentTenant?.name || user?.displayName || '').toLowerCase().trim();

    const hasAssignedUnit = myUnits.length > 0;
    const hasAgreement = (state.agreements || []).some((a) => {
      const matchTenant =
        Boolean(userId && a.tenantId === userId) ||
        Boolean(userEmail && a.tenantEmail?.toLowerCase().trim() === userEmail);
      if (!matchTenant) return false;
      if (a.status === 'terminated' || a.status === 'cancelled') return false;

      // If unit has completed moveout settlement, agreement is concluded
      const hasCompletedMo = (state.moveOuts || []).some((m) => {
        const matchMoTenant =
          Boolean(userId && m.tenantId === userId) ||
          Boolean(userEmail && ((m as any).tenantEmail?.toLowerCase().trim() === userEmail || m.tenantName?.toLowerCase().trim() === userEmail));
        const matchMoUnit = (m.unit && a.unit && m.unit.toLowerCase().trim() === a.unit.toLowerCase().trim()) || (m.propertyId && a.propertyId && m.propertyId === a.propertyId);
        return matchMoTenant && matchMoUnit && (m.status === 'settled' || m.status === 'refund_completed') && Boolean(m.tenantConfirmedReceipt);
      });
      if (hasCompletedMo) return false;

      return true;
    });

    const hasRequest = (state.tenancyRequests || []).some(
      (r) =>
        ((userId && r.tenantId === userId) || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
        (r.status === 'pending' || r.status === 'accepted')
    );
    return hasAssignedUnit || hasAgreement || hasRequest;
  }, [myUnits.length, state.agreements, state.moveOuts, state.tenancyRequests, user, currentTenant]);

  // Concluded Move-Out record (only if resident has NO active or pending lease context)
  const completedMoveOut = useMemo(() => {
    if (hasActiveOrPendingLease) return undefined;
    const userEmail = (user?.email || '').toLowerCase().trim();
    return (state.moveOuts || []).find(
      (m) =>
        (Boolean(user?.id && m.tenantId === user.id) ||
          Boolean(userEmail && ((m as any).tenantEmail?.toLowerCase().trim() === userEmail || (m.tenantName && m.tenantName.toLowerCase().trim() === userEmail)))) &&
        (m.status === 'settled' || m.status === 'refund_completed') &&
        Boolean(m.tenantConfirmedReceipt)
    );
  }, [hasActiveOrPendingLease, state.moveOuts, user, currentTenant]);

  // Active Move-Out needing attention (notice filed, inspected, settlement pending, or awaiting receipt confirmation)
  const activeMoveOut = useMemo(() => {
    const userEmail = (user?.email || '').toLowerCase().trim();
    return (state.moveOuts || []).find((m) => {
      const matchTenant =
        Boolean(user?.id && m.tenantId === user.id) ||
        Boolean(userEmail && (((m as any).tenantEmail && (m as any).tenantEmail.toLowerCase().trim() === userEmail) || ((m as any).tenant && (m as any).tenant.toLowerCase().trim() === userEmail)));
      if (!matchTenant) return false;

      const isCompleted =
        (m.status === 'settled' || m.status === 'refund_completed') && Boolean(m.tenantConfirmedReceipt);
      if (isCompleted) return false;

      // If this tenant currently has an active agreement for this unit, an old settled moveout is not active
      const hasActiveAgForUnit = (state.agreements || []).some(
        (a) =>
          ((user?.id && a.tenantId === user.id) || (userEmail && a.tenantEmail?.toLowerCase().trim() === userEmail)) &&
          a.status !== 'terminated' &&
          a.status !== 'cancelled' &&
          Boolean(a.unit && m.unit && a.unit.toLowerCase().trim() === m.unit.toLowerCase().trim())
      );
      if (hasActiveAgForUnit && (m.status === 'settled' || m.status === 'refund_completed')) {
        return false;
      }

      return true;
    });
  }, [state.moveOuts, state.agreements, user, currentTenant]);

  // Unread urgent or pinned announcements
  const activeAnnouncements = useMemo(() => {
    return (state.announcements || []).filter(
      (a) =>
        a.status === 'published' &&
        !a.acknowledgedBy?.includes(user?.id || currentTenant.id)
    );
  }, [state.announcements, user, currentTenant]);

  // Pending invoices to display for the active unit (1-to-1 Web Parity)
  const pendingInvoices = useMemo(() => {
    return activeUnitPendingInvoices;
  }, [activeUnitPendingInvoices]);

  const totalDue = pendingInvoices.reduce((sum, inv) => sum + inv.total, 0);

  // Authoritative currency
  const dueCurrency = useMemo(() => {
    if (pendingInvoices.length > 0) {
      return resolveInvoiceCurrency(pendingInvoices[0], activeCurrency, state);
    }
    return activeCurrency;
  }, [pendingInvoices, activeCurrency, state]);

  // Active tickets for this tenant scoped to the active unit (1-to-1 Web Parity)
  const activeTickets = useMemo(() => {
    return state.tickets.filter((t) => {
      const isOpen = t.status === 'open' || t.status === 'in_progress';
      if (!isOpen) return false;
      const isMyTicket =
        (user?.id && t.tenantId === user.id) ||
        (user?.email && (t as any).tenantEmail?.toLowerCase() === user.email.toLowerCase()) ||
        t.tenant === currentTenant.name;
      if (!isMyTicket) return false;
      if (activeUnit) {
        const uNum = (activeUnit.unitNumber || '').toLowerCase().trim();
        const uId = (activeUnit.id || '').toLowerCase().trim();
        const tUnit = (t.unit || '').toLowerCase().trim();
        const matchesUnit =
          Boolean(tUnit) &&
          (Boolean(uNum && tUnit === uNum) || Boolean(uId && tUnit === uId));
        const matchesProp =
          !t.propertyId ||
          !activeUnit.propertyId ||
          t.propertyId === activeUnit.propertyId;
        return matchesUnit && matchesProp;
      }
      return true;
    });
  }, [state.tickets, user, currentTenant, activeUnit]);

  // Notification count
  const unreadNotifCount = useMemo(() => {
    return (state.notifications || []).filter((n) => !n.isRead).length;
  }, [state.notifications]);

  // Media gallery for invitation review modal
  const reviewMediaItems = useMemo(() => {
    if (!reviewingRequest) return [];
    const items: Array<{ id: string; url: string; title: string; category: 'unit' | 'property' | 'amenity'; label: string }> = [];

    // Find property strictly by unique ID (live Firestore data preferred)
    const reqProp =
      liveReviewProp ||
      (reviewingRequest.propertyId ? state.properties.find((p) => p.id === reviewingRequest.propertyId) : null) ||
      null;

    // Find unit strictly by unique ID (live Firestore data preferred)
    const cleanReqUnit = (reviewingRequest.unitNumber || reviewingRequest.unit || '').trim().toLowerCase();
    const reqUnit =
      liveReviewUnit ||
      (reviewingRequest.unitId ? state.units.find((u) => u.id === reviewingRequest.unitId) : null) ||
      (reqProp && cleanReqUnit ? state.units.find((u) => u.propertyId === reqProp.id && u.unitNumber && u.unitNumber.trim().toLowerCase() === cleanReqUnit) : null) ||
      null;

    // 1. Property cover and real photos
    const propImages = (reqProp?.images || []).filter(Boolean);
    if (propImages.length > 0) {
      const coverIdx = typeof reqProp?.coverPhotoIndex === 'number' && propImages[reqProp.coverPhotoIndex] ? reqProp.coverPhotoIndex : 0;
      const orderedPropImages = [
        propImages[coverIdx],
        ...propImages.filter((_, idx) => idx !== coverIdx),
      ].filter(Boolean);

      orderedPropImages.forEach((url, i) => {
        items.push({ id: `p-${i}`, url, title: `${reqProp?.name || reviewingRequest.propertyName} Exterior`, category: 'property', label: 'Property' });
      });
    }

    // 2. Unit photos set by owner
    const unitImages = [
      ...(reqUnit?.images || []),
      ...(reqUnit?.image ? [reqUnit.image] : []),
      ...((reqUnit as any)?.photos || []),
    ].filter(Boolean);

    unitImages.forEach((url, i) => {
      items.push({ id: `u-${i}`, url, title: `Unit ${reqUnit?.unitNumber || reviewingRequest.unitNumber || reviewingRequest.unit || '101'} Interior`, category: 'unit', label: 'Unit' });
    });

    // 3. Amenity photos set by owner
    const amenityPhotos = reqProp?.amenityPhotos || [];
    amenityPhotos.forEach((ap, i) => {
      if (ap.image) {
        items.push({ id: `a-${i}`, url: ap.image, title: ap.name, category: 'amenity', label: 'Amenity' });
      }
    });

    // If no amenity photos but property has amenities list, map to preset illustrations
    if (items.filter((x) => x.category === 'amenity').length === 0 && (reqProp?.amenities || []).length > 0) {
      const AMENITY_MAP: Record<string, string> = {
        'Power Backup': 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&auto=format&fit=crop&q=80',
        'Gymnasium': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80',
        'Gym': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80',
        'Swimming Pool': 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&auto=format&fit=crop&q=80',
        'Pool': 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&auto=format&fit=crop&q=80',
        'Covered Parking': 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=600&auto=format&fit=crop&q=80',
        'Parking': 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=600&auto=format&fit=crop&q=80',
        '24/7 Security': 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80',
        'Security': 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80',
        'Clubhouse': 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=600&auto=format&fit=crop&q=80',
        'Elevator': 'https://images.unsplash.com/photo-1527689368864-3a821dbccc34?w=600&auto=format&fit=crop&q=80',
      };
      (reqProp.amenities || []).forEach((amName, i) => {
        const foundImg = AMENITY_MAP[amName] || Object.entries(AMENITY_MAP).find(([k]) => amName.toLowerCase().includes(k.toLowerCase()))?.[1];
        if (foundImg) {
          items.push({ id: `am-${i}`, url: foundImg, title: amName, category: 'amenity', label: 'Amenity' });
        }
      });
    }

    // Guarantees for each category so no tab is ever empty
    if (!items.some((x) => x.category === 'property')) {
      const pUrl = propImages[0] || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop';
      items.push({ id: 'p-default', url: pUrl, title: `${reviewingRequest.propertyName}`, category: 'property', label: 'Property' });
    }
    if (!items.some((x) => x.category === 'unit')) {
      const uUrl = propImages[0] || 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop';
      items.push({ id: 'u-default', url: uUrl, title: `Unit ${reqUnit?.unitNumber || reviewingRequest.unitNumber || reviewingRequest.unit || '101'} Interior`, category: 'unit', label: 'Unit' });
    }
    if (!items.some((x) => x.category === 'amenity')) {
      items.push({ id: 'a-default', url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=800&auto=format&fit=crop', title: 'Community Amenities', category: 'amenity', label: 'Amenity' });
    }

    return items;
  }, [reviewingRequest, liveReviewProp, liveReviewUnit, state.units, state.properties]);

  const filteredReviewMedia = useMemo(() => {
    if (galleryFilter === 'all') return reviewMediaItems;
    return reviewMediaItems.filter((m) => m.category === galleryFilter);
  }, [reviewMediaItems, galleryFilter]);

  const currentMedia = filteredReviewMedia[galleryActiveIndex] || filteredReviewMedia[0];

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Screen Header with Notification Count & Currency Trigger */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <PropithubLogo size={26} showText={true} />
        </View>

        <TourTarget id="tenant-topbar-actions" style={styles.headerActions}>
          {/* Currency Trigger Pill */}
          <TouchableOpacity
            style={styles.currencyPill}
            onPress={() => {
              Alert.alert(
                'Switch Display Currency',
                `Current currency: ${viewCurrency}\nChoose currency for display conversions:`,
                [
                  { text: 'USD ($)', onPress: () => setViewCurrency('USD') },
                  { text: 'EUR (€)', onPress: () => setViewCurrency('EUR') },
                  { text: 'GBP (£)', onPress: () => setViewCurrency('GBP') },
                  { text: 'INR (₹)', onPress: () => setViewCurrency('INR') },
                  { text: 'AED (AED)', onPress: () => setViewCurrency('AED') },
                  { text: 'CAD ($)', onPress: () => setViewCurrency('CAD') },
                  { text: 'AUD ($)', onPress: () => setViewCurrency('AUD') },
                  { text: 'SGD ($)', onPress: () => setViewCurrency('SGD') },
                  { text: 'Cancel', style: 'cancel' },
                ]
              );
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.currencyPillText}>{viewCurrency}</Text>
          </TouchableOpacity>

          {/* Notifications Bell */}
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => onNavigate?.('notifications_center')}
            activeOpacity={0.8}
          >
            <Feather name="bell" size={18} color={colors.navy} />
            {unreadNotifCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadNotifCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.roleBadge}
            onPress={onProfilePress}
            activeOpacity={0.8}
          >
            <Text style={styles.roleBadgeText}>RESIDENT</Text>
          </TouchableOpacity>
        </TourTarget>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#10B981']}
            tintColor="#10B981"
          />
        }
      >
        {/* Preserved Archive Banner for Decoupled Tenants */}
        {((currentTenant as any)?.status === 'unmanaged_archive' || (activeAgreement?.status as string) === 'unmanaged_archive') && (
          <View
            style={{
              backgroundColor: '#EFF6FF',
              borderWidth: 1.5,
              borderColor: '#3B82F6',
              borderRadius: 12,
              padding: 14,
              marginBottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Feather name="archive" size={24} color="#1D4ED8" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E40AF' }}>
                Read-Only Preserved Tenancy Archive
              </Text>
              <Text style={{ fontSize: 11.5, color: '#1E3A8A', marginTop: 2, lineHeight: 16 }}>
                Your landlord's account was retired or unmanaged. Your signed lease and payment ledger remain securely archived below.
              </Text>
            </View>
          </View>
        )}

        {/* SECTION 0: Real-Time Action Center & Automated Reminder Hub (1-to-1 Web Parity) */}
        {tenantReminders.length > 0 && (
          <View style={styles.reminderHubBox}>
            <View style={styles.reminderHubHead}>
              <View style={styles.reminderHubTitleRow}>
                <Feather name="bell" size={15} color="#D97706" />
                <Text style={styles.reminderHubTitle}>Reminders ({tenantReminders.length})</Text>
              </View>
            </View>

            {tenantReminders.map((reminder) => {
              const isUrgent = reminder.severity === 'urgent';
              const isPositive = reminder.severity === 'positive';
              const borderColor = isUrgent ? '#EF4444' : isPositive ? '#10B981' : '#F59E0B';
              const iconColor = isUrgent ? '#EF4444' : isPositive ? '#10B981' : '#D97706';

              return (
                <View key={reminder.id} style={[styles.reminderItem, { borderLeftColor: borderColor }]}>
                  <View style={styles.reminderItemHeader}>
                    <Feather
                      name={
                        reminder.icon === 'alert-triangle'
                          ? 'alert-triangle'
                          : reminder.icon === 'clock'
                            ? 'clock'
                            : reminder.icon === 'calendar'
                              ? 'calendar'
                              : reminder.icon === 'credit-card'
                                ? 'credit-card'
                                : reminder.icon === 'tool'
                                  ? 'tool'
                                  : 'file-text'
                      }
                      size={15}
                      color={iconColor}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.reminderItemTitle, { color: isUrgent ? '#B91C1C' : colors.navy }]} numberOfLines={2}>
                      {reminder.title}
                    </Text>
                  </View>

                  <Text style={styles.reminderItemSub}>
                    {reminder.description}
                  </Text>

                  <View style={styles.reminderActionRow}>
                    <TouchableOpacity
                      style={[
                        styles.reminderActionBtn,
                        isUrgent
                          ? { backgroundColor: '#EF4444' }
                          : isPositive
                            ? { backgroundColor: '#10B981' }
                            : { backgroundColor: '#059669' },
                      ]}
                      onPress={() => {
                        if (reminder.actionType === 'modal' && incomingRequest) {
                          setReviewingRequest(incomingRequest);
                        } else if (reminder.actionScreen) {
                          onNavigate?.(reminder.actionScreen);
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.reminderActionBtnText}>{reminder.actionLabel}</Text>
                      <Feather name="chevron-right" size={13} color="#FFFFFF" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* SECTION: Actionable Cash Refund Handover Confirmation Banner (1-to-1 Web Parity) */}
        {activeMoveOut?.cashRefundHandover?.status === 'pending_confirmation' && (
          <View style={styles.cashBanner}>
            <View style={styles.cashBannerHead}>
              <View style={styles.cashBannerTag}>
                <Text style={styles.cashBannerTagText}>⚡ Cash Handover</Text>
              </View>
            </View>
            <Text style={styles.cashBannerTitle}>
              {activeMoveOut.cashRefundHandover.claimedByName} reported handing you {format(activeMoveOut.cashRefundHandover.amount, activeMoveOut.cashRefundHandover.currency || viewCurrency)} in Cash
            </Text>
            <Text style={styles.cashBannerMeta}>
              Date: {activeMoveOut.cashRefundHandover.handoverDate} • Unit: {activeMoveOut.unit}
              {activeMoveOut.cashRefundHandover.handoverLocation ? ` • Location: ${activeMoveOut.cashRefundHandover.handoverLocation}` : ''}
              {activeMoveOut.cashRefundHandover.notes ? `\n"${activeMoveOut.cashRefundHandover.notes}"` : ''}
            </Text>
            <View style={styles.cashBtnRow}>
              <TouchableOpacity
                style={styles.cashConfirmBtn}
                onPress={() => {
                  confirmCashClaim(activeMoveOut.id);
                  Alert.alert('Cash Received ✓', 'Your deposit refund has been settled.');
                }}
                activeOpacity={0.85}
              >
                <Feather name="check" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.cashConfirmBtnText} numberOfLines={1}>Confirm Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cashDeclineBtn}
                onPress={() => {
                  Alert.prompt
                    ? Alert.prompt(
                      'Decline Cash Handover',
                      'Please enter the reason for declining this cash refund:',
                      (reason) => {
                        if (reason && reason.trim()) {
                          rejectCashClaim(activeMoveOut.id, reason.trim());
                          Alert.alert('Declined', 'Landlord has been notified of the discrepancy.');
                        }
                      }
                    )
                    : (() => {
                      rejectCashClaim(activeMoveOut.id, 'Cash handover not confirmed by tenant');
                      Alert.alert('Declined', 'Landlord notified.');
                    })();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.cashDeclineBtnText} numberOfLines={1}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SECTION: Actionable Deposit Refund Received Confirmation Banner (1-to-1 Web Parity) */}
        {activeMoveOut &&
          (activeMoveOut.status === 'refund_completed' || activeMoveOut.status === 'settled') &&
          !activeMoveOut.tenantConfirmedReceipt && (
            <View style={[styles.cashBanner, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' }]}>
              <View style={styles.cashBannerHead}>
                <View style={[styles.cashBannerTag, { backgroundColor: '#FEF3C7' }]}>
                  <Text style={[styles.cashBannerTagText, { color: '#B45309' }]}>⚡ Refund Disbursed</Text>
                </View>
              </View>
              <Text style={styles.cashBannerTitle}>
                Landlord disbursed {format(activeMoveOut.netRefundAmount || activeMoveOut.depositHeld, activeMoveOut.currency || viewCurrency)} Deposit Refund
              </Text>
              <Text style={styles.cashBannerMeta}>
                Unit: {activeMoveOut.unit} • Method: {(activeMoveOut.payoutMethod || 'Direct Transfer').toUpperCase()}
                {'\n'}Please verify that the funds reached your account and confirm receipt to conclude your tenancy.
              </Text>
              <View style={styles.cashBtnRow}>
                <TouchableOpacity
                  style={[styles.cashConfirmBtn, { backgroundColor: '#059669' }]}
                  onPress={() => {
                    Alert.alert(
                      'Confirm Refund Received',
                      `Have you verified that the deposit refund of ${format(activeMoveOut.netRefundAmount || activeMoveOut.depositHeld, activeMoveOut.currency || viewCurrency)} has reached your account?\n\nConfirming receipt will formally conclude your tenancy, release this residence, and clear any outstanding dues.`,
                      [
                        { text: 'Not Yet', style: 'cancel' },
                        {
                          text: '✓ Yes, Confirm Receipt',
                          onPress: async () => {
                            await confirmRefundReceipt(activeMoveOut.id);
                            Alert.alert('Tenancy Concluded ✓', 'Deposit refund confirmed. Unit obligations and active records have been cleared.');
                          },
                        },
                      ]
                    );
                  }}
                  activeOpacity={0.85}
                >
                  <Feather name="check-circle" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.cashConfirmBtnText} numberOfLines={1}>Confirm Receipt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cashDeclineBtn}
                  onPress={() => onNavigate?.('tenant_lease')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cashDeclineBtnText} numberOfLines={1}>Settlement</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

        {/* SECTION: Building Announcements (1-to-1 Web Parity) */}
        {activeAnnouncements.map((a) => {
          const isUrgent = a.priority === 'urgent' || a.category === 'emergency';
          return (
            <View
              key={a.id}
              style={[
                styles.emergencyCard,
                isUrgent ? { borderLeftColor: '#DC2626', backgroundColor: '#FEF2F2' } : { borderLeftColor: '#2563EB', backgroundColor: '#EFF6FF' },
              ]}
            >
              <View style={styles.emergencyTopRow}>
                <Feather
                  name={isUrgent ? 'alert-triangle' : 'bell'}
                  size={16}
                  color={isUrgent ? '#DC2626' : '#2563EB'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.emergencyTitle, !isUrgent && { color: '#2563EB' }]}>
                  {a.title.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.emergencyBody}>{a.body}</Text>
              <TouchableOpacity
                style={[styles.ackBtn, isUrgent ? { backgroundColor: '#DC2626' } : { backgroundColor: '#2563EB' }]}
                onPress={() => acknowledgeAnnouncement(a.id, user?.id || currentTenant.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.ackBtnText}>I Have Read & Acknowledge</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* SECTION 1: Pending Tenancy Invitations Card (1-to-1 Web Parity) */}
        {incomingRequest && (
          <View style={styles.inviteCard}>
            <View style={styles.inviteTopRow}>
              <View style={styles.inviteTitleWrap}>
                <Feather name="mail" size={15} color="#0D9488" style={{ marginRight: 6 }} />
                <Text style={styles.inviteTitle} numberOfLines={1}>Tenancy Invitation</Text>
              </View>
              <View style={styles.inviteBadgeAmber}>
                <Text style={styles.inviteBadgeAmberText}>Awaiting Response</Text>
              </View>
            </View>

            <Text style={styles.inviteSubHeader}>
              From: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{incomingRequest.ownerName}</Text> • Property: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{incomingRequest.propertyName}{(incomingRequest.unit || incomingRequest.unitNumber) ? ` (${incomingRequest.unit || incomingRequest.unitNumber})` : ''}</Text>
            </Text>

            <View style={styles.inviteMetaRow}>
              <Text style={styles.inviteMetaItem}>
                Rent: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{format(incomingRequest.rent, incomingRequest.currency || viewCurrency)}/mo</Text>
              </Text>
              <Text style={styles.inviteMetaItem}>
                Deposit: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{format(incomingRequest.deposit, incomingRequest.currency || viewCurrency)}</Text>
              </Text>
              <Text style={styles.inviteMetaItem}>
                Period: <Text style={{ fontWeight: '600' }}>{incomingRequest.leaseStart || 'Flexible'} → {incomingRequest.leaseEnd || '12 Months'}</Text>
              </Text>
            </View>

            {incomingRequest.message ? (
              <View style={styles.inviteNoteBox}>
                <Text style={styles.inviteNoteText}>"{incomingRequest.message}"</Text>
              </View>
            ) : null}

            {incomingRequest.requireTenantId && (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginBottom: 10, gap: 6 }}>
                <Feather name="shield" size={14} color="#D97706" />
                <Text style={{ fontSize: 11.5, color: '#92400E', fontWeight: '600', flex: 1 }}>
                  Verification ID Requested: {incomingRequest.requiredIdList?.map((i) => i.name).join(', ') || incomingRequest.requiredIdTypes?.join(', ') || incomingRequest.requiredIdType || 'Identity Document'}
                </Text>
              </View>
            )}

            <View style={styles.inviteBtnRow}>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => {
                  updateTenancyRequest(incomingRequest.id, 'accepted');
                  Alert.alert(
                    'Tenancy Invitation Accepted! 🎉',
                    `Welcome to ${incomingRequest.propertyName}! Unit ${incomingRequest.unit || incomingRequest.unitNumber} is reserved. Please proceed to My Lease to review and sign.`,
                    [{ text: 'Go to My Lease', onPress: () => onNavigate?.('tenant_lease') }]
                  );
                }}
                activeOpacity={0.85}
              >
                <Feather name="check" size={14} color="#FFFFFF" />
                <Text style={styles.acceptBtnText} numberOfLines={1}>Accept Offer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reviewProposalBtn}
                onPress={() => {
                  setGalleryActiveIndex(0);
                  setGalleryFilter('all');
                  setReviewingRequest(incomingRequest);
                }}
                activeOpacity={0.85}
              >
                <Feather name="eye" size={14} color="#0F766E" />
                <Text style={styles.reviewProposalBtnText} numberOfLines={1}>Review</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.declineCleanBtn}
              onPress={() => {
                updateTenancyRequest(incomingRequest.id, 'declined');
                Alert.alert('Invitation Declined', 'Unit released back to vacant.');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.declineCleanBtnText}>Decline this offer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* SECTION 2: Multi-Property Dropdown Switcher (Tap to switch active context) */}
        {isMultiUnit && (
          <TenantMultiPropertySwitcher
            myUnits={myUnits}
            selectedUnitId={selectedTenantUnitId}
            onSelectUnit={(unitId) => setSelectedTenantUnitId(unitId)}
          />
        )}

        {/* SECTION 3: Active Tenancy or Concluded Tenancy / New Resident View */}
        {myUnits.length === 0 ? (
          completedMoveOut ? (
            /* Concluded Tenancy View (1-to-1 Web Parity) */
            <View>
              {/* Concluded Key Metrics */}
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statNum}>{format(0, viewCurrency)}</Text>
                  <Text style={styles.statLbl}>Monthly Rent</Text>
                  <Text style={[styles.statDelta, { color: '#059669' }]}>✓ No active rent</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNum}>
                    {format(completedMoveOut.netRefundAmount || completedMoveOut.depositHeld, completedMoveOut.currency || viewCurrency)}
                  </Text>
                  <Text style={styles.statLbl}>Deposit Refunded</Text>
                  <Text style={[styles.statDelta, { color: '#059669' }]}>✓ Fully Settled</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNum}>0</Text>
                  <Text style={styles.statLbl}>Open Repairs</Text>
                  <Text style={styles.statDelta}>All closed</Text>
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.concludedTop}>
                  <Ionicons name="checkmark-circle" size={24} color="#059669" />
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={styles.concludedTitle}>Past Tenancy Concluded</Text>
                    <Text style={styles.concludedSub}>
                      Unit {completedMoveOut.unit} • {completedMoveOut.propertyName}
                    </Text>
                  </View>
                  <View style={styles.badgeSettled}>
                    <Text style={styles.badgeSettledText}>VACATED & RELEASED</Text>
                  </View>
                </View>

                <View style={styles.cardDivider} />

                <Text style={styles.metaRowLabel}>Handover & Refund Status:</Text>
                <Text style={styles.metaRowVal}>
                  Final net refund of {format(completedMoveOut.netRefundAmount, completedMoveOut.currency || viewCurrency)} has been processed and settled.
                </Text>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    style={styles.viewLeaseBtn}
                    onPress={() => onNavigate?.('tenant_lease')}
                    activeOpacity={0.8}
                  >
                    <Feather name="file-text" size={14} color="#0D9488" />
                    <Text style={styles.viewLeaseBtnText}>Clearance Certificate</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.viewLeaseBtn, { borderColor: '#E2E8F0' }]}
                    onPress={() => onNavigate?.('tenant_payments')}
                    activeOpacity={0.8}
                  >
                    <Feather name="credit-card" size={14} color="#475569" />
                    <Text style={[styles.viewLeaseBtnText, { color: '#475569' }]}>Payment Receipts</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            /* New Resident Onboarding View (1-to-1 Web Parity) */
            <TourTarget id="tenant-overview-hero">
            <View style={styles.newResidentCard}>
              <View style={styles.newResidentIcon}>
                <Feather name="home" size={28} color="#0D9488" />
              </View>
              <Text style={styles.newResidentTitle}>Welcome to Propithub, {currentTenant.name}!</Text>
              <Text style={styles.newResidentSub}>
                Your resident account is active. Invitations will appear here.
              </Text>

              <View style={styles.profileBox}>
                <Text style={styles.profileBoxTitle}>YOUR REGISTERED RESIDENT PROFILE</Text>
                <Text style={styles.profileLine}>Name: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{currentTenant.name}</Text></Text>
                <Text style={styles.profileLine}>Email: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{user?.email || 'N/A'}</Text></Text>
                <Text style={styles.profileLine}>Phone: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{user?.phone || 'Not specified'}</Text></Text>
                <Text style={styles.profileLine}>Resident ID: <Text style={{ fontFamily: 'monospace', color: '#0D9488' }}>{user?.id}</Text></Text>
              </View>

              <Text style={styles.tipText}>
                💡 Tip: Share your email with your landlord for unit invitations.
              </Text>
            </View>
            </TourTarget>
          )
        ) : (
          /* Active Resident Tenancy View */
          <View>
            {/* Hero Rent Status Card */}
            {(() => {
              const hasPendingInvite = Boolean(incomingRequest) || (state.tenancyRequests || []).some(
                (r) =>
                  r.status === 'pending' &&
                  ((user?.id && r.tenantId === user.id) || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
                  (!activeUnit || r.unitId === activeUnit.id || (r.unitNumber && activeUnit.unitNumber && r.unitNumber.toLowerCase().trim() === activeUnit.unitNumber.toLowerCase().trim()))
              );

              const isTenancyActive = !hasPendingInvite && activeAgreement?.status === 'active' && activeAgreement?.depositStatus === 'paid';

              // If the resident only has a pending tenancy invitation (no active lease yet),
              // the dedicated full Section 1 Invitation Card above already handles review/acceptance.
              // Delete the redundant hero card to avoid duplicate banners.
              if (hasPendingInvite && !isTenancyActive) {
                return null;
              }

              const isDepositPending = !isTenancyActive && (activeAgreement?.status === 'pending_deposit' || activeAgreement?.depositStatus === 'unpaid');
              const isSignaturePending = !isTenancyActive && (activeAgreement?.status === 'awaiting_tenant_signature' || activeAgreement?.status === 'awaiting_tenant_upload');
              const isCountersignPending = !isTenancyActive && (activeAgreement?.status === 'pending_approval' || (activeAgreement?.status as any) === 'awaiting_owner_signature');
              const isOnboarding = !isTenancyActive && Boolean(activeAgreement);

              const badgeText = totalDue > 0
                ? `${pendingInvoices.length} Due`
                : isOnboarding
                  ? isDepositPending
                    ? 'Deposit Due'
                    : isSignaturePending
                      ? 'Sign Lease'
                      : isCountersignPending
                        ? 'Pending Approval'
                        : 'Onboarding'
                  : isTenancyActive
                    ? 'All Paid Up'
                    : 'Pending Offer';

              const badgeColor = totalDue > 0
                ? '#DC2626'
                : isOnboarding
                  ? isCountersignPending ? '#2563EB' : '#D97706'
                  : isTenancyActive
                    ? '#059669'
                    : '#64748B';

              const badgeBg = totalDue > 0
                ? (isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2')
                : isOnboarding
                  ? isCountersignPending
                    ? (isDark ? 'rgba(37, 99, 235, 0.18)' : '#DBEAFE')
                    : (isDark ? 'rgba(217, 119, 6, 0.18)' : '#FEF3C7')
                  : isTenancyActive
                    ? (isDark ? 'rgba(16, 185, 129, 0.18)' : '#DCFCE7')
                    : (isDark ? '#334155' : '#F1F5F9');

              const badgeIcon = totalDue > 0
                ? 'alert-circle'
                : isOnboarding
                  ? isDepositPending ? 'shield' : isSignaturePending ? 'edit-3' : 'clock'
                  : isTenancyActive
                    ? 'check-circle'
                    : 'clock';

              const displayAmount = totalDue > 0
                ? format(totalDue, dueCurrency)
                : isTenancyActive
                  ? format(activeRent, activeCurrency)
                  : format(0, activeCurrency);

              return (
                <TourTarget id="tenant-overview-hero">
                <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                  <View style={styles.heroTopRow}>
                    <Text style={[styles.heroLabel, { color: colors.inkSoft }]}>
                      {isOnboarding ? 'Move-in Pending' : 'Rent Status'}
                    </Text>
                    <View style={[styles.heroPillBadge, { backgroundColor: badgeBg }]}>
                      <Feather
                        name={badgeIcon as any}
                        size={12}
                        color={badgeColor}
                      />
                      <Text
                        style={[
                          styles.heroPillText,
                          { color: badgeColor },
                        ]}
                      >
                        {badgeText}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.heroAmount,
                      {
                        color: totalDue > 0
                          ? '#DC2626'
                          : isOnboarding
                            ? colors.inkSoft
                            : isTenancyActive
                              ? (isDark ? '#34D399' : '#059669')
                              : colors.inkSoft,
                      },
                    ]}
                  >
                    {displayAmount}
                  </Text>

                  {totalDue > 0 && (
                    <TouchableOpacity
                      style={styles.heroActionBtn}
                      onPress={() => onNavigate?.('tenant_payments')}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.heroActionBtnText}>Pay</Text>
                      <Feather name="arrow-right" size={13} color="#FFFFFF" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  )}

                  {totalDue === 0 && isOnboarding && isDepositPending && (
                    <TouchableOpacity
                      style={[styles.heroActionBtn, { backgroundColor: '#D97706' }]}
                      onPress={() => onNavigate?.('tenant_payments')}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.heroActionBtnText}>Pay Deposit</Text>
                      <Feather name="arrow-right" size={13} color="#FFFFFF" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  )}

                  {totalDue === 0 && isOnboarding && isSignaturePending && (
                    <TouchableOpacity
                      style={[styles.heroActionBtn, { backgroundColor: '#0D9488' }]}
                      onPress={() => onNavigate?.('tenant_lease')}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.heroActionBtnText}>Sign Lease</Text>
                      <Feather name="arrow-right" size={13} color="#FFFFFF" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  )}
                </View>
                </TourTarget>
              );
            })()}

            {/* 3 Key Metrics Row (Non-wrapping clean single-line numbers) */}
            {(() => {
              const hasPendingInvite = Boolean(incomingRequest) || (state.tenancyRequests || []).some(
                (r) =>
                  r.status === 'pending' &&
                  ((user?.id && r.tenantId === user.id) || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
                  (!activeUnit || r.unitId === activeUnit.id || (r.unitNumber && activeUnit.unitNumber && r.unitNumber.toLowerCase().trim() === activeUnit.unitNumber.toLowerCase().trim()))
              );
              const isTenancyActive = !hasPendingInvite && activeAgreement?.status === 'active' && activeAgreement?.depositStatus === 'paid';
              return (
                <View style={styles.statsRow}>
                  <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <Text
                      style={[styles.statNum, { color: colors.navy }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {isTenancyActive ? format(activeRent, activeCurrency) : format(0, activeCurrency)}
                    </Text>
                    <Text style={[styles.statLbl, { color: colors.inkSoft }]} numberOfLines={1}>
                      {isTenancyActive ? 'Rent' : 'Rent (Pending)'}
                    </Text>
                  </View>

                  <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <Text
                      style={[styles.statNum, { color: colors.navy }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {isTenancyActive ? format(activeDeposit, activeCurrency) : format(0, activeCurrency)}
                    </Text>
                    <Text style={[styles.statLbl, { color: colors.inkSoft }]} numberOfLines={1}>
                      {isTenancyActive ? 'Deposit' : 'Deposit (Held)'}
                    </Text>
                  </View>

                  <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <Text
                      style={[styles.statNum, { color: activeTickets.length > 0 ? (isDark ? '#F87171' : '#EF4444') : colors.navy }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {isTenancyActive ? activeTickets.length : 0}
                    </Text>
                    <Text style={[styles.statLbl, { color: colors.inkSoft }]} numberOfLines={1}>Repairs</Text>
                  </View>
                </View>
              );
            })()}

            {/* Active Tenancy Details (1-to-1 Web Parity) */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Tenancy Details</Text>
            </View>

            <View style={styles.tenancyCard}>
              {/* Optional Hero Image banner */}
              {(() => {
                // Prioritize actual real property cover photo (respecting coverPhotoIndex)
                const realPropImgs = (activeProperty?.images || []).filter((i) => i && !i.includes('unsplash.com'));
                const propCover = realPropImgs.length > 0
                  ? (typeof activeProperty?.coverPhotoIndex === 'number' && realPropImgs[activeProperty.coverPhotoIndex]
                    ? realPropImgs[activeProperty.coverPhotoIndex]
                    : realPropImgs[0])
                  : (activeProperty?.images && activeProperty.images[0]);

                const realUnitImgs = (activeUnit?.images || []).filter((i) => i && !i.includes('unsplash.com'));
                const unitImg = realUnitImgs.length > 0 ? realUnitImgs[0] : (activeUnit?.image && !activeUnit.image.includes('unsplash.com') ? activeUnit.image : null);

                const heroImg =
                  propCover ||
                  unitImg ||
                  (activeUnit?.images && activeUnit.images[0]) ||
                  activeUnit?.image ||
                  (activeProperty?.images && activeProperty.images[0]);
                if (!heroImg) return null;
                return (
                  <View style={styles.tenancyHeroBanner}>
                    <Image source={{ uri: heroImg }} style={styles.tenancyHeroImage} resizeMode="cover" />
                    <View style={styles.tenancyHeroOverlay}>
                      <Text style={styles.tenancyHeroBadge}>
                        Unit {activeUnit?.unitNumber || currentTenant.unit} Residence
                      </Text>
                    </View>
                  </View>
                );
              })()}

              <View style={{ padding: 14 }}>
                <View style={styles.propHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.propTitle}>
                      {activeProperty?.name || activeAgreement?.propertyName || activeUnit?.propertyName || 'Residence Overview'}
                    </Text>
                    <Text style={styles.unitSub}>
                      Unit {activeUnit?.unitNumber || currentTenant.unit} {activeUnit?.unitType ? `(${activeUnit.unitType})` : ''}
                    </Text>
                  </View>
                  {(() => {
                    const isUnitConcluded = Boolean(
                      activeMoveOut &&
                      (activeMoveOut.status === 'refund_completed' || activeMoveOut.status === 'settled' || activeMoveOut.tenantConfirmedReceipt)
                    );
                    const isUnitVacating = Boolean(activeMoveOut && !isUnitConcluded);

                    // Check if this unit / tenant has an unaccepted invitation
                    const hasPendingInvite = Boolean(incomingRequest) || (state.tenancyRequests || []).some(
                      (r) =>
                        r.status === 'pending' &&
                        ((user?.id && r.tenantId === user.id) || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
                        (!activeUnit || r.unitId === activeUnit.id || (r.unitNumber && activeUnit.unitNumber && r.unitNumber.toLowerCase().trim() === activeUnit.unitNumber.toLowerCase().trim()))
                    );

                    const isTenancyActive = !hasPendingInvite && activeAgreement?.status === 'active' && activeAgreement?.depositStatus === 'paid';
                    const isOnboarding = !isTenancyActive && !hasPendingInvite && Boolean(activeAgreement);
                    const isPendingDeposit = !hasPendingInvite && (activeAgreement?.status === 'pending_deposit' || activeAgreement?.depositStatus === 'unpaid');

                    const pillBg = hasPendingInvite
                      ? (isDark ? '#78350F' : '#FEF3C7')
                      : isUnitConcluded
                        ? (isDark ? '#334155' : '#F1F5F9')
                        : isUnitVacating
                          ? (isDark ? '#78350F' : '#FEF3C7')
                          : isOnboarding
                            ? (isDark ? '#78350F' : '#FEF3C7')
                            : isTenancyActive
                              ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7')
                              : (isDark ? '#1E293B' : '#F1F5F9');

                    const pillColor = hasPendingInvite
                      ? (isDark ? '#FBBF24' : '#B45309')
                      : isUnitConcluded
                        ? (isDark ? '#94A3B8' : '#64748B')
                        : isUnitVacating
                          ? (isDark ? '#FBBF24' : '#B45309')
                          : isOnboarding
                            ? (isDark ? '#FBBF24' : '#B45309')
                            : isTenancyActive
                              ? (isDark ? '#34D399' : '#15803D')
                              : (isDark ? '#94A3B8' : '#64748B');

                    const pillText = hasPendingInvite
                      ? 'PENDING ACCEPTANCE'
                      : isUnitConcluded
                        ? 'CONCLUDED'
                        : isUnitVacating
                          ? 'VACATING'
                          : isOnboarding
                            ? (isPendingDeposit ? 'PENDING DEPOSIT' : 'IN ONBOARDING')
                            : isTenancyActive
                              ? 'ACTIVE LEASE'
                              : 'PENDING';

                    return (
                      <View style={[styles.activePill, { backgroundColor: pillBg }]}>
                        <Text style={[styles.activePillText, { color: pillColor }]}>
                          {pillText}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                <View style={styles.cardDivider} />

                {/* Property Address */}
                {Boolean(activeProperty?.address) && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Address</Text>
                    <Text style={styles.detailValue} numberOfLines={2}>
                      {typeof activeProperty?.address === 'string'
                        ? activeProperty.address
                        : (activeProperty?.address as any)?.formattedAddress || (activeProperty?.address as any)?.street || '—'}
                    </Text>
                  </View>
                )}

                {/* Assigned Unit */}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Assigned Unit</Text>
                  <Text style={[styles.detailValue, { fontWeight: '700', color: '#0F172A' }]}>
                    Unit {activeUnit?.unitNumber || currentTenant.unit} {activeUnit?.unitType ? `(${activeUnit.unitType})` : ''}
                  </Text>
                </View>

                {/* Furnishing Status */}
                {Boolean(activeUnit?.furnishing) && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Furnishing</Text>
                    <Text style={styles.detailValue}>{activeUnit?.furnishing}</Text>
                  </View>
                )}

                {/* Lease Period */}
                {(Boolean(activeAgreement?.start) || Boolean(activeAgreement?.end)) && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Lease Period</Text>
                    <Text style={styles.detailValue}>
                      {activeAgreement?.start || '—'}{activeAgreement?.end ? ` → ${activeAgreement.end}` : ''}
                    </Text>
                  </View>
                )}

                {/* Agreed Rent */}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Agreed Rent</Text>
                  <Text style={[styles.detailValue, { fontWeight: '700', color: '#0D9488' }]}>
                    {format(activeRent, activeCurrency)} / mo
                  </Text>
                </View>

                {/* Security Deposit */}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Security Deposit</Text>
                  <Text style={[styles.detailValue, { fontWeight: '700', color: '#0F172A' }]}>
                    {format(activeDeposit, activeCurrency)}
                  </Text>
                </View>

                {/* Landlord Name */}
                {(() => {
                  const ownerUser = state.users?.find((u) => u.id === (activeAgreement?.ownerId || activeProperty?.ownerId || activeUnit?.ownerId));
                  const ownerName = activeAgreement?.ownerName || (activeProperty as any)?.ownerName || ownerUser?.displayName || (ownerUser as any)?.name || 'Building Management';
                  return (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Landlord</Text>
                      <Text style={styles.detailValue}>{ownerName}</Text>
                    </View>
                  );
                })()}

                {/* Notice Period */}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Notice Period</Text>
                  <Text style={styles.detailValue}>
                    {activeAgreement?.noticePeriodDays ? `${activeAgreement.noticePeriodDays} Days` : '30 Days'}
                  </Text>
                </View>

                {/* Building Amenities Badges */}
                {Boolean(activeProperty?.amenities && activeProperty.amenities.length > 0) && (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <Text style={{ fontSize: 11.5, color: '#64748B', fontWeight: '600', marginBottom: 6 }}>
                      Building Amenities:
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {activeProperty!.amenities.map((am, idx) => (
                        <View key={idx} style={styles.amenityBadge}>
                          <Text style={styles.amenityBadgeText}>✓ {am}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.viewLeaseBtn, { marginTop: 14 }]}
                  onPress={() => onNavigate?.('tenant_lease')}
                  activeOpacity={0.8}
                >
                  <Feather name="file-text" size={14} color="#0D9488" />
                  <Text style={styles.viewLeaseBtnText}>View Digital Lease</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Outstanding Rent & Billing Banner */}
            <View style={styles.billingCard}>
              <View style={styles.billingTop}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.billingLabel}>CURRENT OUTSTANDING</Text>
                  <Text style={styles.billingAmount}>
                    {format(totalDue, dueCurrency)}
                  </Text>
                  <Text style={styles.billingDueDate} numberOfLines={2}>
                    {pendingInvoices.length > 0
                      ? `Due: ${pendingInvoices[0].due} (${pendingInvoices[0].items[0]?.description || pendingInvoices[0].notes || 'Rent Due'})`
                      : 'All rent dues cleared up to date'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.payNowBtn}
                  onPress={() => {
                    if (pendingInvoices.length > 0) {
                      onNavigate?.('online_payment_checkout');
                    } else {
                      onNavigate?.('tenant_payments');
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.payNowText}>
                    {totalDue > 0 ? 'Pay Dues' : 'View Invoices'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>


            {/* Active Repair Tickets Section */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeading}>Active Repair Tickets</Text>
              <TouchableOpacity
                onPress={() => onNavigate?.('create_maintenance_ticket')}
                activeOpacity={0.75}
              >
                <Text style={styles.sectionLink}>+ Raise Ticket</Text>
              </TouchableOpacity>
            </View>

            {activeTickets.length === 0 ? (
              <View style={styles.emptyTicketsCard}>
                <Feather name="check" size={20} color="#10B981" />
                <Text style={styles.emptyTicketsText}>No open repair tickets</Text>
              </View>
            ) : (
              activeTickets.slice(0, 2).map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.ticketCard}
                  onPress={() => onNavigate?.('tenant_maintenance')}
                  activeOpacity={0.8}
                >
                  <View style={styles.ticketTop}>
                    <Text style={styles.ticketTitle}>{t.issue}</Text>
                    <View style={styles.ticketBadge}>
                      <Text style={styles.ticketBadgeText}>{t.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.ticketSub}>
                    ID: #{t.id} • Category: {t.category}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ─── MODAL: Review Tenancy Request with Photo Gallery & Specs (1-to-1 Web Parity) ─── */}
      <Modal visible={!!reviewingRequest} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHead}>
              <View>
                <Text style={styles.modalTitle}>Property & Agreement Review</Text>
                <Text style={styles.modalSub}>
                  {reviewingRequest?.propertyName} • Unit {reviewingRequest?.unit || reviewingRequest?.unitNumber || ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReviewingRequest(null)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {/* Photo Gallery Filter Pills */}
              <View style={styles.galleryPillRow}>
                {(['all', 'unit', 'property', 'amenity'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.galleryPill, galleryFilter === cat && styles.galleryPillActive]}
                    onPress={() => {
                      setGalleryFilter(cat);
                      setGalleryActiveIndex(0);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.galleryPillText, galleryFilter === cat && styles.galleryPillTextActive]}>
                      {cat.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Photo Display Card */}
              {currentMedia && (
                <TouchableOpacity
                  style={styles.galleryHeroBox}
                  onPress={() => setLightboxUrl(currentMedia.url)}
                  activeOpacity={0.9}
                >
                  <Image source={{ uri: currentMedia.url }} style={styles.galleryHeroImg} resizeMode="cover" />
                  <View style={styles.galleryHeroOverlay}>
                    <Text style={styles.galleryHeroTag}>{currentMedia.label}</Text>
                    <Text style={styles.galleryHeroTitle}>{currentMedia.title}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Specifications Strip */}
              <View style={styles.specBox}>
                <Text style={styles.specBoxTitle}>AGREEMENT SPECIFICATIONS</Text>
                <View style={styles.specRow}>
                  <Text style={styles.specKey}>Monthly Rent:</Text>
                  <Text style={styles.specValBold}>
                    {reviewingRequest ? format(reviewingRequest.rent, reviewingRequest.currency || viewCurrency) : ''}
                  </Text>
                </View>
                <View style={styles.specRow}>
                  <Text style={styles.specKey}>Security Deposit:</Text>
                  <Text style={styles.specValBold}>
                    {reviewingRequest ? format(reviewingRequest.deposit, reviewingRequest.currency || viewCurrency) : ''}
                  </Text>
                </View>
                <View style={styles.specRow}>
                  <Text style={styles.specKey}>Lease Period:</Text>
                  <Text style={styles.specVal}>
                    {reviewingRequest?.leaseStart || 'Flexible'} → {reviewingRequest?.leaseEnd || '12 Months'}
                  </Text>
                </View>
                <View style={styles.specRow}>
                  <Text style={styles.specKey}>Landlord Contact:</Text>
                  <Text style={styles.specVal}>{reviewingRequest?.ownerName} ({reviewingRequest?.ownerEmail || 'Registered Landlord'})</Text>
                </View>
              </View>

              {/* Landlord Note */}
              {reviewingRequest?.message ? (
                <View style={styles.landlordNoteBox}>
                  <Text style={styles.landlordNoteTitle}>NOTE FROM LANDLORD</Text>
                  <Text style={styles.landlordNoteBody}>"{reviewingRequest.message}"</Text>
                </View>
              ) : null}

              {/* Identity Verification Documents Requirement Notice */}
              {reviewingRequest?.requireTenantId && (
                <View
                  style={{
                    backgroundColor: '#FFFBEB',
                    borderWidth: 1.5,
                    borderColor: '#F59E0B',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Feather name="shield" size={16} color="#D97706" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E' }}>
                      Identity Verification Documents Required:
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#78350F', lineHeight: 17 }}>
                    The property owner requires {reviewingRequest.requiredIdList?.length || reviewingRequest.requiredIdTypes?.length || 1} verification document(s) (
                    <Text style={{ fontWeight: '700' }}>
                      {reviewingRequest.requiredIdList?.map((i) => i.name).join(', ') ||
                        reviewingRequest.requiredIdTypes?.join(', ') ||
                        reviewingRequest.requiredIdType ||
                        'Identity ID'}
                    </Text>
                    ). You will need to upload these alongside your physically signed tenancy agreement in My Lease.
                  </Text>
                </View>
              )}

              {/* Agreement Document Information & Download Option */}
              <View style={styles.docInfoBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: isDark ? 'rgba(13, 148, 136, 0.2)' : '#CCFBF1', justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
                    <Feather name="file-text" size={17} color="#0D9488" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docInfoTitle} numberOfLines={1}>
                      {reviewingRequest?.agreementFileName || 'Tenancy_Agreement.pdf'}
                    </Text>
                    <Text style={styles.docInfoSub}>
                      {/* Attached agreement document ready for review */}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.docDownloadBtn}
                  onPress={async () => {
                    const fileUrl = reviewingRequest?.agreementFileData || reviewingRequest?.agreementFileUrl;
                    const fileName = reviewingRequest?.agreementFileName || 'Tenancy_Agreement.pdf';
                    if (!fileUrl) {
                      Alert.alert('Notice', 'No agreement document file was attached to this proposal.');
                      return;
                    }
                    try {
                      await downloadOrShareDocument(fileUrl, fileName);
                    } catch (err: any) {
                      Alert.alert('Download Error', err?.message || 'Could not download agreement.');
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="download" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.docDownloadBtnText}>Download</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalDeclineBtn}
                onPress={() => {
                  if (reviewingRequest) {
                    updateTenancyRequest(reviewingRequest.id, 'declined');
                    setReviewingRequest(null);
                    Alert.alert('Invitation Declined', 'Unit released back to vacant.');
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalDeclineBtnText}>Decline Offer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalAcceptBtn}
                onPress={() => {
                  if (reviewingRequest) {
                    updateTenancyRequest(reviewingRequest.id, 'accepted');
                    setReviewingRequest(null);
                    Alert.alert(
                      'Offer Accepted! 🎉',
                      'Tenancy invitation accepted! Please proceed to My Lease to review and sign.',
                      [{ text: 'Go to My Lease', onPress: () => onNavigate?.('tenant_lease') }]
                    );
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalAcceptBtnText}>Accept & Proceed</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: Fullscreen Lightbox ─── */}
      <Modal visible={!!lightboxUrl} transparent animationType="fade">
        <TouchableOpacity
          style={styles.lightboxOverlay}
          onPress={() => setLightboxUrl(null)}
          activeOpacity={1}
        >
          <TouchableOpacity style={styles.lightboxCloseBtn} onPress={() => setLightboxUrl(null)}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {lightboxUrl && (
            <Image source={{ uri: lightboxUrl }} style={styles.lightboxImg} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>

      {/* ─── MODAL: Deposit Settlement Review & Dispute Desk ─── */}
      <Modal visible={!!reviewingMoveOut} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <View style={styles.modalHead}>
              <View>
                <Text style={styles.modalTitle}>Deposit Settlement Review</Text>
                <Text style={styles.modalSub}>
                  Unit {reviewingMoveOut?.unit} • {reviewingMoveOut?.propertyName}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReviewingMoveOut(null)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              <View style={styles.settleSummaryBox}>
                <View style={styles.settleRow}>
                  <Text style={styles.settleLabel}>Gross Deposit Held:</Text>
                  <Text style={styles.settleVal}>{reviewingMoveOut ? format(reviewingMoveOut.depositHeld, reviewingMoveOut.currency || viewCurrency) : ''}</Text>
                </View>
                <View style={styles.settleRow}>
                  <Text style={styles.settleLabel}>Assessed Deductions:</Text>
                  <Text style={[styles.settleVal, { color: '#DC2626' }]}>
                    - {reviewingMoveOut ? format(reviewingMoveOut.totalDeductions, reviewingMoveOut.currency || viewCurrency) : ''}
                  </Text>
                </View>
                <View style={[styles.settleRow, { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.settleLabel, { fontWeight: '700', color: colors.navy }]}>Net Refund Due Today:</Text>
                  <Text style={[styles.settleVal, { fontWeight: '800', color: isDark ? '#2DD4BF' : '#0D9488', fontSize: 16 }]}>
                    {reviewingMoveOut ? format(reviewingMoveOut.netRefundAmount, reviewingMoveOut.currency || viewCurrency) : ''}
                  </Text>
                </View>
              </View>

              {/* Deductions Items */}
              {reviewingMoveOut?.inspectionChecklist && reviewingMoveOut.inspectionChecklist.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.specBoxTitle}>ITEMIZED DEDUCTIONS</Text>
                  {reviewingMoveOut.inspectionChecklist
                    .filter((c) => c.deduction > 0)
                    .map((item, idx) => (
                      <View key={idx} style={styles.deductionItem}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.deductionTitle}>{item.room} • {item.item}</Text>
                          <Text style={styles.deductionNotes}>{item.notes || 'Repairs required'}</Text>
                        </View>
                        <Text style={styles.deductionAmount}>- {format(item.deduction, reviewingMoveOut.currency || viewCurrency)}</Text>
                      </View>
                    ))}
                </View>
              )}

              {/* Payout Destination Selector */}
              <Text style={styles.specBoxTitle}>CHOOSE REFUND PAYOUT DESTINATION</Text>
              <View style={styles.payoutRow}>
                {(['upi', 'bank_in', 'paypal', 'cash'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.payoutOption, payoutMethod === m && styles.payoutOptionActive]}
                    onPress={() => setPayoutMethod(m)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.payoutText, payoutMethod === m && styles.payoutTextActive]}>
                      {m === 'upi' ? 'UPI' : m === 'bank_in' ? 'Bank' : m === 'paypal' ? 'PayPal' : 'Cash'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {payoutMethod === 'upi' && (
                <TextInput
                  style={styles.modalInput}
                  placeholder="Enter UPI VPA ID (e.g. resident@okhdfcbank)"
                  value={payoutUpiId}
                  onChangeText={setPayoutUpiId}
                  autoCapitalize="none"
                />
              )}

              {payoutMethod === 'bank_in' && (
                <>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Account Number"
                    value={payoutAccount}
                    onChangeText={setPayoutAccount}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={styles.modalInput}
                    placeholder="IFSC Code (e.g. HDFC0001234)"
                    value={payoutIfsc}
                    onChangeText={setPayoutIfsc}
                    autoCapitalize="characters"
                  />
                </>
              )}
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalDeclineBtn}
                onPress={() => {
                  if (reviewingMoveOut) {
                    updateMoveOut(reviewingMoveOut.id, { tenantDisputeRaised: true, status: 'disputed' });
                    setReviewingMoveOut(null);
                    Alert.alert('Deductions Contested', 'Settlement flagged for property manager dispute mediation.');
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalDeclineBtnText}>Contest</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalAcceptBtn}
                onPress={() => {
                  if (reviewingMoveOut) {
                    updateMoveOut(reviewingMoveOut.id, {
                      status: 'settled',
                      chosenPayoutDetails: {
                        method: payoutMethod,
                        upiId: payoutUpiId,
                        accountNumber: payoutAccount,
                        ifscCode: payoutIfsc,
                      },
                    });
                    setReviewingMoveOut(null);
                    Alert.alert('Settlement Approved ✓', 'Payout destination registered. Owner notified to disburse funds.');
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalAcceptBtnText}>Approve Payout</Text>
              </TouchableOpacity>
            </View>
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
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
    },
    headerSub: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    currencyPill: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 6,
    },
    currencyPillText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.navy,
    },
    notifBtn: {
      position: 'relative',
      padding: 6,
      borderRadius: 8,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    },
    notifBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      backgroundColor: '#DC2626',
      borderRadius: 8,
      width: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifBadgeText: {
      color: '#FFFFFF',
      fontSize: 9.5,
      fontWeight: '800',
    },
    roleBadge: {
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : '#EFF6FF',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
    },
    roleBadgeText: {
      color: isDark ? '#60A5FA' : '#2563EB',
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    scroll: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
    },
    reminderHubBox: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB',
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : '#F59E0B',
      padding: 14,
      marginBottom: 14,
    },
    reminderHubHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    reminderHubTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    reminderHubTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#FBBF24' : '#92400E',
    },
    reminderItem: {
      backgroundColor: colors.surface,
      borderLeftWidth: 3.5,
      borderLeftColor: '#F59E0B',
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    reminderItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    reminderItemTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
      flex: 1,
    },
    reminderItemSub: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.inkSoft,
      marginBottom: 10,
    },
    reminderActionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    reminderActionBtn: {
      backgroundColor: '#059669',
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 7,
      flexDirection: 'row',
      alignItems: 'center',
    },
    reminderActionBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    cashBanner: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB',
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : '#F59E0B',
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
    },
    cashBannerHead: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    cashBannerTag: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.3)' : '#FEF3C7',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    cashBannerTagText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#FBBF24' : '#B45309',
    },
    cashBannerTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 4,
    },
    cashBannerMeta: {
      fontSize: 11.5,
      color: colors.inkSoft,
      lineHeight: 16,
      marginBottom: 10,
    },
    cashBtnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cashConfirmBtn: {
      flex: 1.3,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#16A34A',
      paddingHorizontal: 8,
      paddingVertical: 9,
      borderRadius: 8,
    },
    cashConfirmBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    cashDeclineBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#DC2626',
      backgroundColor: colors.surfaceSunken,
      paddingHorizontal: 8,
      paddingVertical: 9,
      borderRadius: 8,
    },
    cashDeclineBtnText: {
      color: '#DC2626',
      fontSize: 12,
      fontWeight: '600',
    },
    emergencyCard: {
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.15)' : '#FEF2F2',
      borderLeftWidth: 4,
      borderLeftColor: '#DC2626',
      borderRadius: 10,
      padding: 12,
      marginBottom: 14,
    },
    emergencyTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    emergencyTitle: {
      fontSize: 11.5,
      fontWeight: '800',
      color: '#EF4444',
      letterSpacing: 0.5,
    },
    emergencyBody: {
      fontSize: 12,
      color: colors.ink,
      lineHeight: 18,
      marginBottom: 8,
    },
    ackBtn: {
      alignSelf: 'flex-start',
      backgroundColor: '#DC2626',
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 6,
    },
    ackBtnText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    inviteCard: {
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: isDark ? '#14B8A6' : '#0D9488',
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
    },
    inviteTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    inviteTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 8,
    },
    inviteTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.navy,
      flex: 1,
    },
    inviteBadgeAmber: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 5,
      flexShrink: 0,
    },
    inviteBadgeAmberText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: isDark ? '#FBBF24' : '#B45309',
    },
    inviteSubHeader: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
      marginBottom: 8,
    },
    inviteMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 8,
    },
    inviteMetaItem: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    inviteNoteBox: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 8,
      padding: 10,
      marginBottom: 10,
    },
    inviteNoteText: {
      fontSize: 11.5,
      color: colors.ink,
      fontStyle: 'italic',
      lineHeight: 16,
    },
    inviteBtnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 6,
      marginBottom: 4,
    },
    acceptBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0D9488',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 8,
      gap: 6,
    },
    acceptBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    reviewProposalBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(13, 148, 136, 0.2)' : '#CCFBF1',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? '#14B8A6' : '#99F6E4',
      gap: 6,
    },
    reviewProposalBtnText: {
      color: isDark ? '#2DD4BF' : '#0F766E',
      fontSize: 12,
      fontWeight: '700',
    },
    declineCleanBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      marginTop: 4,
    },
    declineCleanBtnText: {
      color: isDark ? '#F87171' : '#DC2626',
      fontSize: 11.5,
      fontWeight: '600',
    },
    // Hero Rent Status Card
    heroCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
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
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
    },
    heroPillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    heroAmount: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.navy,
      letterSpacing: -0.8,
      marginBottom: 4,
    },
    heroSubText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.inkSoft,
    },
    heroActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#059669',
      borderRadius: 12,
      paddingVertical: 10,
      marginTop: 12,
    },
    heroActionBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 9,
      borderWidth: 1,
      borderColor: colors.line,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    statNum: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.navy,
      letterSpacing: -0.3,
    },
    statLbl: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.inkSoft,
      marginTop: 3,
    },
    statDelta: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
      marginTop: 4,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 14,
    },
    propHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    propTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
    },
    unitSub: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
    },
    activePill: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
    },
    activePillText: {
      fontSize: 10,
      fontWeight: '800',
      color: isDark ? '#34D399' : '#15803D',
    },
    cardDivider: {
      height: 1,
      backgroundColor: colors.line,
      marginVertical: 10,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    metaCol: {
      flex: 1,
    },
    metaLabel: {
      fontSize: 10.5,
      color: colors.inkSoft,
    },
    metaVal: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 2,
    },
    metaRowLabel: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    metaRowVal: {
      fontSize: 12.5,
      color: colors.ink,
      marginTop: 2,
      lineHeight: 18,
    },
    viewLeaseBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#2DD4BF' : '#0D9488',
      borderRadius: 8,
      paddingVertical: 8,
      gap: 6,
    },
    viewLeaseBtnText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#2DD4BF' : '#0D9488',
    },
    billingCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
    },
    billingTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    billingLabel: {
      fontSize: 9.5,
      fontWeight: '800',
      color: colors.inkSoft,
      letterSpacing: 0.8,
    },
    billingAmount: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.navy,
      marginVertical: 2,
    },
    billingDueDate: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    payNowBtn: {
      backgroundColor: '#0D9488',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    payNowText: {
      color: '#FFFFFF',
      fontSize: 12.5,
      fontWeight: '700',
    },
    sectionHeading: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.navy,
      marginBottom: 10,
    },
    quickGrid: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    gridItem: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
    },
    gridIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    gridLabel: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.ink,
      textAlign: 'center',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    sectionLink: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#2DD4BF' : '#0D9488',
    },
    emptyTicketsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 8,
    },
    emptyTicketsText: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    ticketCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 8,
    },
    ticketTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    ticketTitle: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.navy,
    },
    ticketBadge: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : '#FEF3C7',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    ticketBadgeText: {
      fontSize: 9,
      fontWeight: '700',
      color: isDark ? '#FBBF24' : '#B45309',
    },
    ticketSub: {
      fontSize: 11,
      color: colors.inkSoft,
      marginTop: 4,
    },
    concludedTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    concludedTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.navy,
    },
    concludedSub: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 1,
    },
    badgeSettled: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
    },
    badgeSettledText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: isDark ? '#34D399' : '#15803D',
    },
    newResidentCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
    },
    newResidentIcon: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: isDark ? 'rgba(13, 148, 136, 0.25)' : '#CCFBF1',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    newResidentTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
      textAlign: 'center',
      marginBottom: 6,
    },
    newResidentSub: {
      fontSize: 12.5,
      color: colors.inkSoft,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 14,
    },
    profileBox: {
      width: '100%',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 12,
    },
    profileBoxTitle: {
      fontSize: 10,
      fontWeight: '800',
      color: isDark ? '#2DD4BF' : '#0D9488',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    profileLine: {
      fontSize: 12,
      color: colors.ink,
      marginBottom: 4,
    },
    tipText: {
      fontSize: 11,
      color: colors.inkSoft,
      textAlign: 'center',
      lineHeight: 16,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    modalCardLarge: {
      width: '100%',
      maxWidth: 460,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 16,
    },
    modalHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      paddingBottom: 10,
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
    },
    modalSub: {
      fontSize: 11.5,
      color: colors.inkSoft,
      marginTop: 2,
    },
    modalCloseBtn: {
      padding: 4,
      borderRadius: 6,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    },
    galleryPillRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 10,
    },
    galleryPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
    },
    galleryPillActive: {
      backgroundColor: '#0D9488',
      borderColor: '#0D9488',
    },
    galleryPillText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    galleryPillTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    galleryHeroBox: {
      width: '100%',
      height: 180,
      borderRadius: 10,
      overflow: 'hidden',
      position: 'relative',
      marginBottom: 12,
      backgroundColor: '#0F172A',
    },
    galleryHeroImg: {
      width: '100%',
      height: '100%',
    },
    galleryHeroOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 8,
      backgroundColor: 'rgba(0,0,0,0.6)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    galleryHeroTag: {
      backgroundColor: '#0D9488',
      color: '#FFFFFF',
      fontSize: 9,
      fontWeight: '800',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    galleryHeroTitle: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '600',
      flex: 1,
    },
    specBox: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 12,
    },
    specBoxTitle: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.inkSoft,
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    specRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
    },
    specKey: {
      fontSize: 11.5,
      color: colors.inkSoft,
    },
    specVal: {
      fontSize: 11.5,
      color: colors.navy,
    },
    specValBold: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navy,
    },
    landlordNoteBox: {
      backgroundColor: isDark ? 'rgba(217, 119, 6, 0.15)' : '#FFFBEB',
      borderRadius: 8,
      padding: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(217, 119, 6, 0.3)' : '#FDE68A',
      marginBottom: 12,
    },
    landlordNoteTitle: {
      fontSize: 9.5,
      fontWeight: '800',
      color: isDark ? '#FBBF24' : '#92400E',
      marginBottom: 2,
    },
    landlordNoteBody: {
      fontSize: 11.5,
      color: isDark ? '#FDE68A' : '#78350F',
      fontStyle: 'italic',
    },
    docInfoBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(13, 148, 136, 0.15)' : '#F0FDFA',
      borderRadius: 8,
      padding: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(13, 148, 136, 0.3)' : '#CCFBF1',
      marginBottom: 10,
    },
    docInfoTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: isDark ? '#2DD4BF' : '#0F766E',
    },
    docInfoSub: {
      fontSize: 10.5,
      color: colors.inkSoft,
      marginTop: 1,
    },
    docDownloadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#0D9488',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 7,
    },
    docDownloadBtnText: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontWeight: '700',
    },
    modalActionRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    modalDeclineBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: '#DC2626',
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
    },
    modalDeclineBtnText: {
      color: '#DC2626',
      fontSize: 12,
      fontWeight: '700',
    },
    modalAcceptBtn: {
      flex: 1.5,
      backgroundColor: '#0D9488',
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: 'center',
    },
    modalAcceptBtnText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    lightboxOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    lightboxCloseBtn: {
      position: 'absolute',
      top: 40,
      right: 20,
      padding: 8,
      zIndex: 10,
    },
    lightboxImg: {
      width: '92%',
      height: '75%',
    },
    settleSummaryBox: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 14,
    },
    settleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
    },
    settleLabel: {
      fontSize: 12,
      color: colors.inkSoft,
    },
    settleVal: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.navy,
    },
    deductionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    deductionTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.navy,
    },
    deductionNotes: {
      fontSize: 10.5,
      color: colors.inkSoft,
    },
    deductionAmount: {
      fontSize: 12,
      fontWeight: '700',
      color: '#DC2626',
    },
    payoutRow: {
      flexDirection: 'row',
      gap: 8,
      marginVertical: 10,
    },
    payoutOption: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    },
    payoutOptionActive: {
      borderColor: isDark ? '#2DD4BF' : '#0D9488',
      backgroundColor: isDark ? 'rgba(13, 148, 136, 0.2)' : '#CCFBF1',
    },
    payoutText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    payoutTextActive: {
      color: isDark ? '#2DD4BF' : '#0F766E',
      fontWeight: '700',
    },
    modalInput: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 12,
      color: colors.ink,
      marginBottom: 8,
    },
    tenancyCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 14,
      overflow: 'hidden',
    },
    tenancyHeroBanner: {
      height: 125,
      width: '100%',
      position: 'relative',
      backgroundColor: '#0F172A',
    },
    tenancyHeroImage: {
      width: '100%',
      height: '100%',
    },
    tenancyHeroOverlay: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    tenancyHeroBadge: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6.5,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    detailLabel: {
      fontSize: 12,
      color: colors.inkSoft,
      fontWeight: '500',
    },
    detailValue: {
      fontSize: 12.5,
      color: colors.navy,
      fontWeight: '600',
      maxWidth: '65%',
      textAlign: 'right',
    },
    amenityBadge: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      paddingHorizontal: 8,
      paddingVertical: 3.5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.line,
    },
    amenityBadgeText: {
      fontSize: 11,
      color: colors.ink,
      fontWeight: '600',
    },
  });
