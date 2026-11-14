import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Modal,
  Image,
  TextInput,
  RefreshControl,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { Header } from '../components/Header';
import { PropithubLogo, PropithubIcon } from '../components/PropithubLogo';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { normalizeCurrencyCode } from '../lib/currencyService';
import { useMobileToast } from '../context/MobileToastContext';
import { useTenantActiveUnit, resolveInvoiceCurrency } from '../hooks/useTenantActiveUnit';
import { useMobileTheme } from '../context/MobileThemeContext';
import { TourTarget } from '../context/MobileTourContext';
import { TenantMultiPropertySwitcher } from '../components/TenantMultiPropertySwitcher';
import { MobileTenancyRequest, MobileMoveOut } from '../types';
import { getTenantReminders, DashboardReminder } from '../lib/reminders';
import { syncDeviceRemindersAsync } from '../lib/notifications';
import { AddressDisplay } from '../components/AddressDisplay';
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
  const { format, viewCurrency, setViewCurrency, convert } = useMobileCurrency();
  const { showToast } = useMobileToast();
  const [refreshing, setRefreshing] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);

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
  const [showAllNeedsYou, setShowAllNeedsYou] = useState(false);
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
    return (state.announcements || []).filter((a) => {
      if (a.status !== 'published') return false;
      const myIds = new Set<string>();
      if (user?.id) myIds.add(user.id);
      if (currentTenant?.id) myIds.add(currentTenant.id);
      const isAckedByArr = (a.acknowledgedBy || []).some((id) => myIds.has(id));
      const isAckedByObj = ((a as any).acknowledgments || []).some(
        (ack: any) => myIds.has(ack.tenantId) || (user?.email && ack.tenantEmail?.toLowerCase() === user.email.toLowerCase())
      );
      return !isAckedByArr && !isAckedByObj;
    });
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
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      {/* StatusBar managed globally */}
      <ScreenStatusBar />

      {/* Unified Screen Header */}
      <Header
        title="Overview"
        onNotificationPress={() => onNavigate?.('notifications_center')}
        onProfilePress={onProfilePress}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={Platform.OS !== 'web'}
      >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#10B981']}
            tintColor="#10B981"
          />
        }
      >
        {/* Top Utility Strip: Currency Switcher + Unit Context */}
        <TourTarget id="tenant-topbar-actions" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {activeProperty?.name ? `${activeProperty.name} • Unit ${activeUnit?.unitNumber || currentTenant.unit}` : 'Resident Workspace'}
          </Text>
          <TouchableOpacity
            style={styles.currencyPill}
            onPress={() => setShowCurrencyModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.currencyPillText}>{viewCurrency} ▾</Text>
          </TouchableOpacity>
        </TourTarget>
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

        {/* Multi-Property Switcher (if multiple residences) */}
        {isMultiUnit && (
          <TenantMultiPropertySwitcher
            myUnits={myUnits}
            selectedUnitId={selectedTenantUnitId}
            onSelectUnit={(unitId) => setSelectedTenantUnitId(unitId)}
          />
        )}

        {/* 1. Top Rent / Onboarding Status Banner + Quick Action Pills (Web Parity) */}
        {myUnits.length > 0 && (() => {
          const hasPendingInvite = Boolean(incomingRequest) || (state.tenancyRequests || []).some(
            (r) =>
              r.status === 'pending' &&
              ((user?.id && r.tenantId === user.id) || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
              (!activeUnit || r.unitId === activeUnit.id || (r.unitNumber && activeUnit.unitNumber && r.unitNumber.toLowerCase().trim() === activeUnit.unitNumber.toLowerCase().trim()))
          );
          const isTenancyActive = !hasPendingInvite && activeAgreement?.status === 'active' && activeAgreement?.depositStatus === 'paid';
          if (hasPendingInvite && !isTenancyActive) return null;

          const isDepositPending = !isTenancyActive && (activeAgreement?.status === 'pending_deposit' || activeAgreement?.depositStatus === 'unpaid');
          const isSignaturePending = !isTenancyActive && (activeAgreement?.status === 'awaiting_tenant_signature' || activeAgreement?.status === 'awaiting_tenant_upload');
          const isApprovalPending = !isTenancyActive && (activeAgreement?.status === 'pending_approval' || (activeAgreement?.status as any) === 'awaiting_owner_signature');

          const isDiffCurr = Boolean(viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(activeCurrency));
          const convertedRent = isDiffCurr ? convert(Number(activeRent) || 0, activeCurrency, viewCurrency) : null;
          const convertedDeposit = isDiffCurr ? convert(Number(activeDeposit) || 0, activeCurrency, viewCurrency) : null;
          const displayCurrency = viewCurrency || activeCurrency;
          const displayRentAmount = isDiffCurr && convertedRent !== null ? Math.round(convertedRent) : (Number(activeRent) || 0);
          const displayDepositAmount = isDiffCurr && convertedDeposit !== null ? Math.round(convertedDeposit) : (Number(activeDeposit) || 0);

          let bannerLabel = 'Next rent due';
          let bannerAmount = format(totalDue > 0 ? totalDue : displayRentAmount, totalDue > 0 ? dueCurrency : displayCurrency);
          let bannerDesc = pendingInvoices.length > 0 ? `Due ${pendingInvoices[0].due}` : 'Due on the 1st of the month.';
          let bannerBg = isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5';
          let bannerBorder = isDark ? 'rgba(16, 185, 129, 0.3)' : '#D1FAE5';

          if (totalDue > 0) {
            bannerLabel = 'Payment due';
            const convertedTotalDue = isDiffCurr ? convert(totalDue, dueCurrency, viewCurrency) : null;
            bannerAmount = format(isDiffCurr && convertedTotalDue !== null ? Math.round(convertedTotalDue) : totalDue, displayCurrency);
            bannerDesc = `${pendingInvoices.length} open invoice${pendingInvoices.length > 1 ? 's' : ''} ready for payment.`;
            bannerBg = isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2';
            bannerBorder = isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA';
          } else if (isDepositPending) {
            bannerLabel = 'Security deposit due';
            bannerAmount = format(displayDepositAmount, displayCurrency);
            bannerDesc = 'Pay your security deposit to activate your lease.';
            bannerBg = isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB';
            bannerBorder = isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A';
          } else if (isSignaturePending) {
            bannerLabel = 'Signature required';
            bannerAmount = `Unit ${activeUnit?.unitNumber || currentTenant.unit}`;
            bannerDesc = 'Download, sign, and upload your lease agreement.';
            bannerBg = isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB';
            bannerBorder = isDark ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A';
          } else if (isApprovalPending) {
            bannerLabel = 'Waiting on your landlord';
            bannerAmount = `Unit ${activeUnit?.unitNumber || currentTenant.unit}`;
            bannerDesc = 'Signed copy uploaded. Waiting for landlord approval.';
          } else if (!isTenancyActive) {
            bannerLabel = 'Tenancy Status';
            bannerAmount = 'No Active Rent Due';
            bannerDesc = activeAgreement?.status === 'terminated'
              ? 'Your lease for this unit has concluded.'
              : 'No active lease or upcoming payment.';
            bannerBg = isDark ? 'rgba(100, 116, 139, 0.12)' : '#F1F5F9';
            bannerBorder = isDark ? 'rgba(100, 116, 139, 0.3)' : '#E2E8F0';
          }

          return (
            <TourTarget id="tenant-overview-hero">
              <View style={{ marginBottom: 18 }}>
                <View
                  style={{
                    backgroundColor: bannerBg,
                    borderWidth: 1,
                    borderColor: bannerBorder,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.inkSoft, marginBottom: 2 }}>
                      {bannerLabel}
                    </Text>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: colors.navy, marginBottom: 2 }}>
                      {bannerAmount}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.inkSoft }}>
                      {bannerDesc}
                    </Text>
                  </View>

                  {(totalDue > 0 || isDepositPending) && (
                    <TouchableOpacity
                      style={{
                        backgroundColor: totalDue > 0 ? '#DC2626' : '#D97706',
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 8,
                      }}
                      onPress={() => onNavigate?.('tenant_payments')}
                      activeOpacity={0.85}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' }}>
                        {isDepositPending ? 'Pay Deposit' : 'Pay Now'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {isSignaturePending && (
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#0D9488',
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 8,
                      }}
                      onPress={() => onNavigate?.('tenant_lease')}
                      activeOpacity={0.85}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' }}>Sign Lease</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Quick Action Pills matching Web */}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}
                    onPress={() => onNavigate?.('tenant_maintenance')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.navy }}>Report a problem</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}
                    onPress={() => onNavigate?.('tenant_lease')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.navy }}>My lease</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                    }}
                    onPress={() => onNavigate?.('tenant_payments')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.navy }}>All payments</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TourTarget>
          );
        })()}

        {/* 2. Unified "Needs you" Section (1-to-1 Web Parity: max 2 visible by default + Show more) */}
        {(() => {
          const cards: React.ReactNode[] = [];

          // A. Pending Tenancy Invitation
          if (incomingRequest) {
            cards.push(
              <View
                key={`req-${incomingRequest.id}`}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.navy, flex: 1 }}>
                    Lease offer: {incomingRequest.propertyName} · Unit {incomingRequest.unit || incomingRequest.unitNumber}
                  </Text>
                </View>
                <Text style={{ fontSize: 12.5, color: colors.inkSoft, paddingLeft: 16, marginBottom: 10 }}>
                  {format(incomingRequest.rent, incomingRequest.currency || viewCurrency)}/mo · Deposit {format(incomingRequest.deposit, incomingRequest.currency || viewCurrency)} · From {incomingRequest.ownerName}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 16, flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                    onPress={() => {
                      setGalleryActiveIndex(0);
                      setGalleryFilter('all');
                      setReviewingRequest(incomingRequest);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.navy }}>Review details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                    onPress={() => {
                      updateTenancyRequest(incomingRequest.id, 'declined');
                      Alert.alert('Invitation Declined', 'Unit released back to vacant.');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#DC2626' }}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#059669',
                      borderRadius: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                    }}
                    onPress={() => {
                      updateTenancyRequest(incomingRequest.id, 'accepted');
                      Alert.alert(
                        'Invitation Accepted ✓',
                        `Unit ${incomingRequest.unit || incomingRequest.unitNumber} reserved. Proceed to My Lease to sign.`,
                        [{ text: 'Go to My Lease', onPress: () => onNavigate?.('tenant_lease') }]
                      );
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Accept</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          // B. Cash Refund Handover Confirmation
          if (activeMoveOut?.cashRefundHandover?.status === 'pending_confirmation') {
            cards.push(
              <View
                key={`cash-${activeMoveOut.id}`}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#D97706' }} />
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.navy, flex: 1 }}>
                    Cash refund reported: {format(activeMoveOut.cashRefundHandover.amount, activeMoveOut.cashRefundHandover.currency || viewCurrency)}
                  </Text>
                </View>
                <Text style={{ fontSize: 12.5, color: colors.inkSoft, paddingLeft: 16, marginBottom: 10 }}>
                  Unit {activeMoveOut.unit} · {activeMoveOut.cashRefundHandover.handoverDate} · Reported by {activeMoveOut.cashRefundHandover.claimedByName}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 16 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                    onPress={() => {
                      confirmCashClaim(activeMoveOut.id);
                      Alert.alert('Cash Received ✓', 'Your deposit refund has been settled.');
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Confirm received</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                    onPress={() => {
                      rejectCashClaim(activeMoveOut.id, 'Cash handover not confirmed by tenant');
                      Alert.alert('Declined', 'Landlord notified.');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#DC2626' }}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          // C. Refund Disbursed Confirmation
          if (
            activeMoveOut &&
            (activeMoveOut.status === 'refund_completed' || activeMoveOut.status === 'settled') &&
            !activeMoveOut.tenantConfirmedReceipt
          ) {
            cards.push(
              <View
                key={`refund-${activeMoveOut.id}`}
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 10,
                  padding: 14,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#D97706' }} />
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.navy, flex: 1 }}>
                    Move-out deposit refund · {format(activeMoveOut.netRefundAmount || activeMoveOut.depositHeld, activeMoveOut.currency || viewCurrency)}
                  </Text>
                </View>
                <Text style={{ fontSize: 12.5, color: colors.inkSoft, paddingLeft: 16, marginBottom: 10 }}>
                  Unit {activeMoveOut.unit} · Disbursed via {(activeMoveOut.payoutMethod || 'Direct Transfer').toUpperCase()}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 16 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                    onPress={async () => {
                      await confirmRefundReceipt(activeMoveOut.id);
                      Alert.alert('Tenancy Concluded ✓', 'Deposit refund confirmed.');
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Confirm received</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                    onPress={() => onNavigate?.('tenant_lease')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.navy }}>Review settlement</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          // D. Automated Lifecycle Reminders (excluding duplicate invitation reminder)
          tenantReminders
            .filter((r) => !r.id.startsWith('tenant_invitation_'))
            .forEach((rem) => {
              const dotCol =
                rem.severity === 'urgent'
                  ? '#DC2626'
                  : rem.severity === 'positive'
                    ? '#10B981'
                    : '#D97706';
              cards.push(
                <View
                  key={`rem-${rem.id}`}
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 10,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotCol }} />
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.navy, flex: 1 }} numberOfLines={1}>
                        {rem.title}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.inkSoft, paddingLeft: 16 }} numberOfLines={2}>
                      {rem.description}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#059669',
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                    onPress={() => {
                      if (rem.actionType === 'modal' && incomingRequest) {
                        setReviewingRequest(incomingRequest);
                      } else if (rem.actionScreen) {
                        onNavigate?.(rem.actionScreen);
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{rem.actionLabel}</Text>
                  </TouchableOpacity>
                </View>
              );
            });

          if (cards.length === 0) return null;
          const visibleCards = showAllNeedsYou ? cards : cards.slice(0, 2);

          return (
            <View style={{ marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.navy }}>Needs you</Text>
                {cards.length > 1 && (
                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 1,
                      borderRadius: 999,
                      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                      borderWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.inkSoft }}>{cards.length}</Text>
                  </View>
                )}
              </View>

              <View style={{ gap: 8 }}>{visibleCards}</View>

              {cards.length > 2 && (
                <TouchableOpacity
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.line,
                  }}
                  onPress={() => setShowAllNeedsYou((prev) => !prev)}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.inkSoft }}>
                    {showAllNeedsYou ? 'Show less ▴' : `Show ${cards.length - 2} more ▾`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* 3. Active Tenancy Metrics or Minimal Onboarding State (1-to-1 Web Parity) */}
        {myUnits.length === 0 ? (
          completedMoveOut ? (
            <View style={styles.card}>
              <View style={styles.concludedTop}>
                <Ionicons name="checkmark-circle" size={22} color="#059669" />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text style={styles.concludedTitle}>Past Tenancy Concluded</Text>
                  <Text style={styles.concludedSub}>
                    Unit {completedMoveOut.unit} • {completedMoveOut.propertyName}
                  </Text>
                </View>
                <View style={styles.badgeSettled}>
                  <Text style={styles.badgeSettledText}>SETTLED</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  style={styles.viewLeaseBtn}
                  onPress={() => onNavigate?.('tenant_lease')}
                  activeOpacity={0.8}
                >
                  <Feather name="file-text" size={14} color="#0D9488" />
                  <Text style={styles.viewLeaseBtnText}>Clearance Certificate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewLeaseBtn, { borderColor: colors.line }]}
                  onPress={() => onNavigate?.('tenant_payments')}
                  activeOpacity={0.8}
                >
                  <Feather name="credit-card" size={14} color={colors.inkSoft} />
                  <Text style={[styles.viewLeaseBtnText, { color: colors.navy }]}>Receipts</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : !incomingRequest ? (
            <TourTarget id="tenant-overview-hero">
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 12,
                  padding: 24,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.navy, marginBottom: 6 }}>
                  No active lease yet
                </Text>
                <Text style={{ fontSize: 13, color: colors.inkSoft, textAlign: 'center', lineHeight: 19, marginBottom: 16 }}>
                  Share your email ({user?.email}) with your landlord to receive a lease invitation, or browse available homes.
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#059669',
                    paddingHorizontal: 16,
                    paddingVertical: 9,
                    borderRadius: 8,
                  }}
                  onPress={() => onNavigate?.('tenant_find_home')}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Browse homes</Text>
                </TouchableOpacity>
              </View>
            </TourTarget>
          ) : null
        ) : (
          <View>
            {/* 3 Clean Summary Stat Cards matching Web DashboardPage.tsx */}
            {(() => {
              const hasPendingInvite = Boolean(incomingRequest) || (state.tenancyRequests || []).some(
                (r) =>
                  r.status === 'pending' &&
                  ((user?.id && r.tenantId === user.id) || (userEmail && r.tenantEmail?.toLowerCase().trim() === userEmail)) &&
                  (!activeUnit || r.unitId === activeUnit.id || (r.unitNumber && activeUnit.unitNumber && r.unitNumber.toLowerCase().trim() === activeUnit.unitNumber.toLowerCase().trim()))
              );
              const isTenancyActive = !hasPendingInvite && activeAgreement?.status === 'active' && activeAgreement?.depositStatus === 'paid';
              const isDiffCurr = Boolean(viewCurrency && normalizeCurrencyCode(viewCurrency) !== normalizeCurrencyCode(activeCurrency));
              const convertedRent = isDiffCurr ? convert(Number(activeRent) || 0, activeCurrency, viewCurrency) : null;
              const convertedDeposit = isDiffCurr ? convert(Number(activeDeposit) || 0, activeCurrency, viewCurrency) : null;
              const displayCurrency = viewCurrency || activeCurrency;
              const displayRentAmount = isDiffCurr && convertedRent !== null ? Math.round(convertedRent) : (Number(activeRent) || 0);
              const displayDepositAmount = isDiffCurr && convertedDeposit !== null ? Math.round(convertedDeposit) : (Number(activeDeposit) || 0);

              return (
                <View style={styles.statsRow}>
                  <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <Text style={[styles.statNum, { color: colors.navy }]} numberOfLines={1} adjustsFontSizeToFit>
                      {isTenancyActive ? format(displayRentAmount, displayCurrency) : format(0, displayCurrency)}
                    </Text>
                    <Text style={[styles.statLbl, { color: colors.inkSoft }]} numberOfLines={1}>
                      Monthly rent
                    </Text>
                  </View>

                  <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <Text style={[styles.statNum, { color: colors.navy }]} numberOfLines={1} adjustsFontSizeToFit>
                      {isTenancyActive ? format(displayDepositAmount, displayCurrency) : format(0, displayCurrency)}
                    </Text>
                    <Text style={[styles.statLbl, { color: colors.inkSoft }]} numberOfLines={1}>
                      Security deposit
                    </Text>
                  </View>

                  <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                    <Text
                      style={[styles.statNum, { color: activeTickets.length > 0 ? '#DC2626' : colors.navy }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {isTenancyActive ? activeTickets.length : 0}
                    </Text>
                    <Text style={[styles.statLbl, { color: colors.inkSoft }]} numberOfLines={1}>
                      Open repairs
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Notices from your landlord (Web Parity) */}
            {activeAnnouncements.length > 0 && (
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 12,
                  padding: 16,
                  marginTop: 6,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.navy, marginBottom: 12 }}>
                  Notices from your landlord
                </Text>
                {activeAnnouncements.map((a, idx) => (
                  <View
                    key={a.id}
                    style={{
                      paddingBottom: idx < activeAnnouncements.length - 1 ? 12 : 0,
                      marginBottom: idx < activeAnnouncements.length - 1 ? 12 : 0,
                      borderBottomWidth: idx < activeAnnouncements.length - 1 ? 1 : 0,
                      borderBottomColor: colors.line,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.navy, flex: 1 }}>{a.title}</Text>
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#059669',
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 6,
                          marginLeft: 8,
                        }}
                        onPress={() => acknowledgeAnnouncement(a.id, user?.id || currentTenant.id)}
                        activeOpacity={0.85}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>Acknowledge</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 }}>{a.body}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* ─── MODAL: Review Tenancy Request with Photo Gallery & Specs (1-to-1 Web Parity) ─── */}
      <Modal visible={!!reviewingRequest} transparent animationType="slide" onRequestClose={() => setReviewingRequest(null)}>
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
      <Modal visible={!!lightboxUrl} transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
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
      <Modal visible={!!reviewingMoveOut} transparent animationType="slide" onRequestClose={() => setReviewingMoveOut(null)}>
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

      {/* ─── MODAL: Currency Selector Bottom Sheet ─── */}
      <Modal
        visible={showCurrencyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCurrencyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCardLarge, { maxWidth: 360 }]}>
            <View style={styles.modalHead}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.navy }]}>Display Currency</Text>
                <Text style={[styles.modalSub, { color: colors.inkSoft }]}>Select preferred currency for rent & due estimates</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCurrencyModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 6, marginVertical: 10 }}>
              {[
                { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
                { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
                { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧' },
                { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳' },
                { code: 'AED', symbol: 'AED', name: 'UAE Dirham', flag: '🇦🇪' },
                { code: 'CAD', symbol: '$', name: 'Canadian Dollar', flag: '🇨🇦' },
                { code: 'AUD', symbol: '$', name: 'Australian Dollar', flag: '🇦🇺' },
                { code: 'SGD', symbol: '$', name: 'Singapore Dollar', flag: '🇸🇬' },
              ].map((c) => {
                const isSelected = viewCurrency === c.code;
                return (
                  <TouchableOpacity
                    key={c.code}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      backgroundColor: isSelected ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5') : colors.surfaceSunken,
                      borderWidth: 1,
                      borderColor: isSelected ? '#10B981' : colors.line,
                    }}
                    onPress={() => {
                      setViewCurrency(c.code as any);
                      setShowCurrencyModal(false);
                      showToast(`Currency changed to ${c.code} (${c.symbol})`, 'info');
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                      <Text style={{ fontSize: 13.5, fontWeight: isSelected ? '700' : '500', color: isSelected ? (isDark ? '#34D399' : '#047857') : colors.navy }}>
                        {c.code} ({c.symbol}) • {c.name}
                      </Text>
                    </View>
                    {isSelected && <Feather name="check" size={16} color={isDark ? '#34D399' : '#059669'} />}
                  </TouchableOpacity>
                );
              })}
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
      flexDirection: 'row',
      alignItems: 'center',
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
