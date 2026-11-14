import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { UserRole } from '../types';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { PropithubLogo } from '../components/PropithubLogo';
import { FreeTrialFloatingWidget } from '../components/FreeTrialFloatingWidget';
import { registerPlanLimitFallbackNavigate } from '../components/PlanLimitModal';
import { initializeDeepLinking } from '../lib/deepLinking';
import { useMobileTheme } from '../context/MobileThemeContext';
import { useMobileTour, TourTarget } from '../context/MobileTourContext';
import { MobileGuidedTourOverlay } from '../components/tour/MobileGuidedTourOverlay';

// Owner Screens
import { OwnerDashboardScreen } from '../screens/OwnerDashboardScreen';
import { PropertyPortfolioScreen } from '../screens/PropertyPortfolioScreen';
import { TenantRosterScreen } from '../screens/TenantRosterScreen';
import { LeasingHubScreen } from '../screens/LeasingHubScreen';
import { FinancialLedgerScreen } from '../screens/FinancialLedgerScreen';
import { VacatesMoveoutScreen } from '../screens/VacatesMoveoutScreen';
import { OwnerMaintenanceDispatchScreen } from '../screens/OwnerMaintenanceDispatchScreen';
import { OwnerMessagesScreen } from '../screens/OwnerMessagesScreen';
import { OwnerTeamManagersScreen } from '../screens/OwnerTeamManagersScreen';
import { OwnerDisputesReviewsScreen } from '../screens/OwnerDisputesReviewsScreen';
import { OwnerHelpdeskScreen } from '../screens/OwnerHelpdeskScreen';
import { OwnerPlanSubscriptionScreen } from '../screens/OwnerPlanSubscriptionScreen';

// Tenant Screens
import { TenantDashboardScreen } from '../screens/TenantDashboardScreen';
import { TenantLeaseScreen } from '../screens/TenantLeaseScreen';
import { TenantPaymentsScreen } from '../screens/TenantPaymentsScreen';
import { TenantMaintenanceScreen } from '../screens/TenantMaintenanceScreen';
import { TenantLandlordReviewsScreen } from '../screens/TenantLandlordReviewsScreen';
import { TenantFindHomeScreen } from '../screens/TenantFindHomeScreen';

// Manager Screens
import { ManagerOperationsScreen } from '../screens/ManagerOperationsScreen';
import { ManagerRepairDispatchScreen } from '../screens/ManagerRepairDispatchScreen';
import { ManagerPropertiesScreen } from '../screens/ManagerPropertiesScreen';
import { ManagerLeaseDocumentsScreen } from '../screens/ManagerLeaseDocumentsScreen';

// Staff Screens
import { StaffJobQueueScreen } from '../screens/StaffJobQueueScreen';
import { StaffTaskPaymentsScreen } from '../screens/StaffEarningsScreen';
import { StaffRatingsScreen } from '../screens/StaffRatingsScreen';

// Common & Workflow Screens
import { AuthGatewayScreen } from '../screens/AuthGatewayScreen';
import { AccountPendingDeletionScreen } from '../screens/AccountPendingDeletionScreen';
import { AccountSettingsScreen } from '../screens/AccountSettingsScreen';
import { PropertyCreateWizardScreen } from '../screens/PropertyCreateWizardScreen';
import { RentalInvoiceStudioScreen } from '../screens/RentalInvoiceStudioScreen';
import { Tenant360DetailScreen } from '../screens/Tenant360DetailScreen';
import { LeaseDraftingBuilderScreen } from '../screens/LeaseDraftingBuilderScreen';
import { MoveOutInspectionChecklistScreen } from '../screens/MoveOutInspectionChecklistScreen';
import { CreateMaintenanceTicketScreen } from '../screens/CreateMaintenanceTicketScreen';
import { OnlinePaymentCheckoutScreen } from '../screens/OnlinePaymentCheckoutScreen';
import { DocumentPdfViewerScreen } from '../screens/DocumentPdfViewerScreen';
import { NotificationsCenterScreen } from '../screens/NotificationsCenterScreen';
import { LegalPoliciesScreen } from '../screens/LegalPoliciesScreen';
import { ContactInquiryScreen } from '../screens/ContactInquiryScreen';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TabConfig {
  key: string;
  label: string;
  icon: string;
  iconLib: 'feather' | 'ion' | 'mci';
  isMore?: boolean;
}

interface MoreMenuItem {
  key: string;
  label: string;
  sublabel: string;
  icon: string;
  iconLib: 'feather' | 'ion' | 'mci';
  color?: string;
}

// ─── Role Tab Configurations ─────────────────────────────────────────────────

const ROLE_TABS: Record<UserRole, TabConfig[]> = {
  owner: [
    { key: 'owner_dashboard',    label: 'Overview',     icon: 'home',        iconLib: 'feather' },
    { key: 'property_portfolio', label: 'Properties',   icon: 'grid',        iconLib: 'feather' },
    { key: 'financial_ledger',   label: 'Transactions', icon: 'credit-card', iconLib: 'feather' },
    { key: '__more__',           label: 'More',         icon: 'menu',        iconLib: 'feather', isMore: true },
  ],
  tenant: [
    { key: 'tenant_dashboard',   label: 'Overview',     icon: 'home',           iconLib: 'feather' },
    { key: 'tenant_lease',       label: 'My Lease',     icon: 'file-text',      iconLib: 'feather' },
    { key: 'tenant_payments',    label: 'Transactions', icon: 'credit-card',    iconLib: 'feather' },
    { key: 'tenant_maintenance', label: 'Support',      icon: 'tool',           iconLib: 'feather' },
    { key: '__more__',           label: 'More',         icon: 'menu',           iconLib: 'feather', isMore: true },
  ],
  manager: [
    { key: 'manager_operations',      label: 'Overview',   icon: 'home',      iconLib: 'feather' },
    { key: 'manager_properties',      label: 'Properties', icon: 'grid',      iconLib: 'feather' },
    { key: 'manager_lease_documents', label: 'Leasing',    icon: 'file-text', iconLib: 'feather' },
    { key: 'manager_repair_dispatch', label: 'Repairs',    icon: 'tool',      iconLib: 'feather' },
  ],
  staff: [
    { key: 'staff_job_queue',  label: 'Jobs',     icon: 'list',        iconLib: 'feather' },
    { key: 'staff_task_fees',  label: 'Earnings', icon: 'credit-card', iconLib: 'feather' },
    { key: 'staff_ratings',    label: 'Ratings',  icon: 'star',        iconLib: 'feather' },
    { key: 'account_settings', label: 'Settings', icon: 'settings',    iconLib: 'feather' },
  ],
};

// ─── Role "More" Menu Items ──────────────────────────────────────────────────

const ROLE_MORE_ITEMS: Record<UserRole, MoreMenuItem[]> = {
  owner: [
    { key: 'tenant_roster',              label: 'Tenants',       sublabel: '', icon: 'users',          iconLib: 'feather', color: '#7C3AED' },
    { key: 'leasing_hub',                label: 'Leasing',       sublabel: '', icon: 'file-text',      iconLib: 'feather', color: '#2563EB' },
    { key: 'vacates_moveout',            label: 'Move-Outs',     sublabel: '', icon: 'log-out',        iconLib: 'feather', color: '#DC2626' },
    { key: 'owner_maintenance_dispatch', label: 'Maintenance',   sublabel: '', icon: 'tool',           iconLib: 'feather', color: '#D97706' },
    { key: 'owner_messages',             label: 'Announcements', sublabel: '', icon: 'message-square', iconLib: 'feather', color: '#059669' },
    { key: 'owner_team_managers',        label: 'Managers',      sublabel: '', icon: 'briefcase',      iconLib: 'feather', color: '#0284C7' },
    { key: 'owner_disputes_reviews',     label: 'Reputation',    sublabel: '', icon: 'award',          iconLib: 'feather', color: '#9333EA' },
    { key: 'owner_helpdesk',             label: 'Helpdesk',      sublabel: '', icon: 'headphones',     iconLib: 'feather', color: '#0891B2' },
    { key: 'owner_plan_subscription',    label: 'Subscription',  sublabel: '', icon: 'zap',            iconLib: 'feather', color: '#CA8A04' },
  ],
  tenant: [
    { key: 'tenant_find_home',         label: 'Find a Home', sublabel: '', icon: 'search', iconLib: 'feather', color: '#10B981' },
    { key: 'tenant_landlord_reviews',  label: 'Reviews',     sublabel: '', icon: 'award',  iconLib: 'feather', color: '#D97706' },
  ],
  manager: [],
  staff: [],
};

// ─── Root Navigator Props ─────────────────────────────────────────────────────

interface RootNavigatorProps {
  initialRole?: UserRole;
  onRegisterNavigate?: (navigate: (screenKey: string) => void) => void;
}

// ─── Helper: render a tab bar icon ───────────────────────────────────────────

function TabIcon({ tab, color }: { tab: TabConfig; color: string }) {
  if (tab.iconLib === 'mci') {
    return <MaterialCommunityIcons name={tab.icon as any} size={22} color={color} />;
  }
  return <Feather name={tab.icon as any} size={20} color={color} />;
}

// ─── Helper: render a menu row icon ──────────────────────────────────────────

function MenuIcon({ item, color }: { item: MoreMenuItem; color: string }) {
  if (item.iconLib === 'mci') {
    return <MaterialCommunityIcons name={item.icon as any} size={20} color={color} />;
  }
  if (item.iconLib === 'ion') {
    return <Ionicons name={item.icon as any} size={20} color={color} />;
  }
  return <Feather name={item.icon as any} size={18} color={color} />;
}

// ─── Role labels & emoji ──────────────────────────────────────────────────────

const ROLE_META: Record<UserRole, { label: string; emoji: string; color: string; bg: string }> = {
  owner:   { label: 'Property Owner',  emoji: '👑', color: '#CA8A04', bg: '#FEF9C3' },
  tenant:  { label: 'Resident',        emoji: '🏠', color: '#2563EB', bg: '#EFF6FF' },
  manager: { label: 'Property Manager',emoji: '🛡️', color: '#7C3AED', bg: '#F5F3FF' },
  staff:   { label: 'Technician',      emoji: '🔧', color: '#059669', bg: '#ECFDF5' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const RootNavigator: React.FC<RootNavigatorProps> = ({ onRegisterNavigate }) => {
  const { user, role, isAuthenticated, isLoading, logout } = useMobileAuth();
  const { isOwnerPlanActive, state } = useMobileAppData();
  const { colors, isDark, toggleTheme } = useMobileTheme();
  const { registerNavigate, isActive: isTourActive, isMinimized: isTourMinimized } = useMobileTour();

  const isOwnerActive = role === 'owner' ? isOwnerPlanActive(user?.id) : true;
  const isGuidedTourExploring = isTourActive && !isTourMinimized;

  const getHomeScreenForRole = (r: UserRole | string | undefined, ownerActive: boolean): string => {
    if (r === 'owner') return ownerActive ? 'owner_dashboard' : 'owner_plan_subscription';
    if (r === 'tenant') return 'tenant_dashboard';
    if (r === 'manager') return 'manager_operations';
    if (r === 'staff') return 'staff_job_queue';
    if (r === 'superadmin') return 'account_settings';
    return 'owner_dashboard';
  };

  const [activeScreenKey, setActiveScreenKey] = useState<string>(() =>
    getHomeScreenForRole(role, isOwnerActive)
  );
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [selectedMoveOutId, setSelectedMoveOutId] = useState<string>('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const historyRef = useRef<string[]>([]);

  // Enforce owner paywall synchronously on render (matching Web ProtectedRoute.tsx)
  const isOwnerPaywalled = role === 'owner' && !isOwnerActive && !isGuidedTourExploring;
  const isPaywallAllowedScreen =
    activeScreenKey === 'owner_plan_subscription' || activeScreenKey === 'account_settings';
  const effectiveScreenKey =
    isOwnerPaywalled && !isPaywallAllowedScreen
      ? 'owner_plan_subscription'
      : activeScreenKey;

  // Synchronize active screen whenever role or owner plan status changes
  useEffect(() => {
    if (isGuidedTourExploring) return;
    historyRef.current = [];
    setActiveScreenKey(getHomeScreenForRole(role, isOwnerActive));
  }, [role, isOwnerActive, isGuidedTourExploring]);

  // Keep activeScreenKey aligned when paywalled
  useEffect(() => {
    if (isOwnerPaywalled && !isPaywallAllowedScreen) {
      setActiveScreenKey('owner_plan_subscription');
    }
  }, [isOwnerPaywalled, isPaywallAllowedScreen]);

  const navigate = (key: string) => {
    setShowMoreMenu(false);
    let resolvedKey = key;
    if (resolvedKey === 'financial_ledger' && role === 'tenant') {
      resolvedKey = 'tenant_payments';
    } else if (resolvedKey === 'tenant_lease') {
      if (role === 'owner') resolvedKey = 'leasing_hub';
      else if (role === 'manager') resolvedKey = 'manager_lease_documents';
    }
    if (role === 'owner' && !isOwnerActive) {
      if (resolvedKey !== 'owner_plan_subscription' && resolvedKey !== 'account_settings') {
        Alert.alert(
          'Workspace Locked 🔒',
          'Your portfolio access is suspended because your subscription or free trial has expired. Please choose a plan to unlock all operational tools.',
          [
            {
              text: 'View Plans',
              onPress: () => setActiveScreenKey('owner_plan_subscription'),
            },
          ]
        );
        setActiveScreenKey('owner_plan_subscription');
        return;
      }
    }
    if (resolvedKey !== effectiveScreenKey) {
      historyRef.current = [...historyRef.current.slice(-19), effectiveScreenKey];
    }
    setActiveScreenKey(resolvedKey);
  };

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Register screen switcher with tour context
  useEffect(() => {
    registerNavigate(setActiveScreenKey);
  }, [registerNavigate]);

  // Register fallback upgrade navigation for PlanLimitModal & optional external navigator (e.g. App.tsx deep linking)
  useEffect(() => {
    const handler = (screenKey: string) => navigateRef.current(screenKey);
    registerPlanLimitFallbackNavigate(handler);
    onRegisterNavigate?.(handler);
    return () => {
      registerPlanLimitFallbackNavigate(null);
    };
  }, [onRegisterNavigate]);

  // Fallback deep linking listener when not wired externally via onRegisterNavigate
  useEffect(() => {
    if (!isAuthenticated || onRegisterNavigate) return;
    const cleanup = initializeDeepLinking((screenKey) => {
      navigateRef.current(screenKey);
    }, role);
    return () => cleanup();
  }, [isAuthenticated, role, onRegisterNavigate]);

  // Memoized 3-column grid rows for the "More / Workspaces" menu modal (unconditional Hook)
  const moreItems = (role && ROLE_MORE_ITEMS[role]) ? ROLE_MORE_ITEMS[role] : [];
  const moreItemRows = useMemo(() => {
    const rows: (typeof moreItems)[] = [];
    for (let i = 0; i < moreItems.length; i += 3) {
      rows.push(moreItems.slice(i, i + 3));
    }
    return rows;
  }, [moreItems]);

  // Loading indicator while resolving live Firebase auth state
  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.background : '#FFFFFF', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? colors.background : '#FFFFFF'} />
        <PropithubLogo size={40} showText={true} />
        <ActivityIndicator size="small" color="#10B981" style={{ marginTop: 24 }} />
        <Text style={{ color: isDark ? '#94A3B8' : '#64748B', marginTop: 12, fontSize: 13, fontWeight: '600' }}>
          Connecting to Propithub Cloud...
        </Text>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated || !user) {
    return <AuthGatewayScreen />;
  }

  // Account Recovery Gate: If user's account is pending permanent deletion, show recovery countdown screen
  if (user?.deletionStatus === 'pending_deletion') {
    return <AccountPendingDeletionScreen />;
  }

  // Strict paywall for Subordinate Roles (Property Manager & Staff):
  // If the parent owner's subscription has expired, suspend operational workspace access
  if (
    (role === 'manager' || role === 'staff') &&
    user?.ownerId &&
    !isOwnerPlanActive(user.ownerId)
  ) {
    return (
      <SafeAreaView style={[styles.lockedContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={[styles.lockedCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View
            style={[
              styles.lockedIconWrap,
              {
                backgroundColor: colors.crimsonBg,
                borderColor: isDark ? 'rgba(248, 113, 113, 0.3)' : '#FEE2E2',
              },
            ]}
          >
            <Feather name="lock" size={38} color={colors.crimson} />
          </View>
          <Text style={[styles.lockedTitle, { color: colors.navy }]}>Organization Subscription Inactive</Text>
          <Text style={[styles.lockedSubtitle, { color: colors.inkSoft }]}>
            Access to this management workspace is currently paused because your portfolio owner’s Propithub subscription or free trial has expired.
            Please contact your organization administrator or property owner to renew the account.
          </Text>
          <TouchableOpacity
            style={[styles.lockedSignOutBtn, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}
            onPress={() => logout()}
            activeOpacity={0.8}
          >
            <Feather name="log-out" size={16} color={colors.navy} style={{ marginRight: 8 }} />
            <Text style={[styles.lockedSignOutBtnText, { color: colors.navy }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Screen renderer ────────────────────────────────────────────────────────

  const goBack = () => {
    while (historyRef.current.length > 0) {
      const prev = historyRef.current.pop()!;
      if (prev && prev !== effectiveScreenKey) {
        if (
          role === 'owner' &&
          !isOwnerActive &&
          prev !== 'owner_plan_subscription' &&
          prev !== 'account_settings'
        ) {
          continue;
        }
        setActiveScreenKey(prev);
        return;
      }
    }
    if (role === 'tenant') navigate('tenant_dashboard');
    else if (role === 'manager') navigate('manager_operations');
    else if (role === 'staff') navigate('staff_job_queue');
    else if ((role as string) === 'superadmin') {
      navigate(effectiveScreenKey === 'account_settings' ? 'owner_dashboard' : 'account_settings');
    } else navigate('owner_dashboard');
  };

  const handleLogoutPress = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => {
            setShowMoreMenu(false);
            logout();
          },
        },
      ]
    );
  };

  const renderActiveScreen = () => {
    switch (effectiveScreenKey) {
      // ── Owner ──────────────────────────────────────────────────────────────
      case 'owner_dashboard':
        return (
          <OwnerDashboardScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNavigate={navigate}
          />
        );
      case 'properties_directory':
      case 'property_portfolio':
        return (
          <PropertyPortfolioScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onAddPropertyPress={() => navigate('property_create_wizard')}
            onNavigate={navigate}
          />
        );
      case 'tenant_roster':
        return (
          <TenantRosterScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onSelectTenant360={(tId) => {
              setSelectedTenantId(tId);
              navigate('tenant_360_detail');
            }}
            onInitiateVacatePress={() => navigate('vacates_moveout')}
            onNavigate={navigate}
          />
        );
      case 'leasing_hub':
        return (
          <LeasingHubScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNewAgreementPress={() => navigate('lease_drafting_builder')}
            onInitiateNoticePress={() => navigate('vacates_moveout')}
            onNavigate={navigate}
          />
        );
      case 'financial_ledger':
        return (
          <FinancialLedgerScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onCreateInvoicePress={() => navigate('rental_invoice_studio')}
            onPaymentPress={() => navigate('online_payment_checkout')}
            onNavigate={navigate}
          />
        );
      case 'vacates_moveout':
        return (
          <VacatesMoveoutScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onInspectPress={(mId) => {
              if (mId) setSelectedMoveOutId(mId);
              navigate('moveout_inspection_checklist');
            }}
            onNavigate={navigate}
          />
        );
      case 'owner_maintenance_dispatch':
        return (
          <OwnerMaintenanceDispatchScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onCreateTicketPress={() => navigate('create_maintenance_ticket')}
            onNavigate={navigate}
          />
        );
      case 'owner_messages':
        return (
          <OwnerMessagesScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNavigate={navigate}
          />
        );
      case 'owner_team_managers':
        return (
          <OwnerTeamManagersScreen
            initialTab="managers"
            onNavigate={navigate}
            onProfilePress={() => setShowMoreMenu(true)}
          />
        );
      case 'manager_compensation':
        return (
          <OwnerTeamManagersScreen
            initialTab="payouts"
            onNavigate={navigate}
            onProfilePress={() => setShowMoreMenu(true)}
          />
        );
      case 'owner_disputes_reviews':
        return (
          <OwnerDisputesReviewsScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNavigate={navigate}
          />
        );
      case 'owner_helpdesk':
        return (
          <OwnerHelpdeskScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNavigate={navigate}
          />
        );
      case 'owner_plan_subscription':
        return (
          <OwnerPlanSubscriptionScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNavigate={navigate}
            onBack={() => navigate('owner_dashboard')}
          />
        );

      // ── Tenant ─────────────────────────────────────────────────────────────
      case 'tenant_dashboard':
        return (
          <TenantDashboardScreen
            onNavigate={navigate}
            onProfilePress={() => setShowMoreMenu(true)}
          />
        );
      case 'tenant_lease':
        return (
          <TenantLeaseScreen
            onGiveNoticePress={() => navigate('vacates_moveout')}
            onNavigate={navigate}
            onProfilePress={() => setShowMoreMenu(true)}
          />
        );
      case 'tenant_payments':
        return (
          <TenantPaymentsScreen
            onPayInvoicePress={() => navigate('online_payment_checkout')}
            onNavigate={navigate}
            onProfilePress={() => setShowMoreMenu(true)}
          />
        );
      case 'tenant_maintenance':
        return (
          <TenantMaintenanceScreen
            onCreateTicketPress={() => navigate('create_maintenance_ticket')}
            onPayChargePress={() => navigate('online_payment_checkout')}
            onNavigate={navigate}
            onProfilePress={() => setShowMoreMenu(true)}
          />
        );
      case 'tenant_landlord_reviews':
        return (
          <TenantLandlordReviewsScreen
            onNavigate={navigate}
            onProfilePress={() => setShowMoreMenu(true)}
          />
        );
      case 'tenant_find_home':
        return (
          <TenantFindHomeScreen
            onBack={() => navigate('tenant_dashboard')}
            onNavigate={navigate}
            onProfilePress={() => setShowMoreMenu(true)}
          />
        );

      // ── Manager ────────────────────────────────────────────────────────────
      case 'manager_operations':
        return (
          <ManagerOperationsScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNavigate={navigate}
          />
        );
      case 'manager_maintenance':
      case 'manager_repair_dispatch':
        return (
          <ManagerRepairDispatchScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onCreateTicketPress={() => navigate('create_maintenance_ticket')}
            onNavigate={navigate}
          />
        );
      case 'manager_properties':
        return (
          <ManagerPropertiesScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNavigate={navigate}
          />
        );
      case 'manager_lease_documents':
        return (
          <ManagerLeaseDocumentsScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onViewPdfPress={() => navigate('document_pdf_viewer')}
            onNavigate={navigate}
          />
        );

      // ── Staff ──────────────────────────────────────────────────────────────
      case 'staff_dashboard':
      case 'staff_job_queue':
        return (
          <StaffJobQueueScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNotificationsPress={() => navigate('notifications_center')}
          />
        );
      case 'staff_task_fees':
      case 'staff_earnings':
        return (
          <StaffTaskPaymentsScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNotificationsPress={() => navigate('notifications_center')}
          />
        );
      case 'staff_ratings':
        return (
          <StaffRatingsScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNotificationsPress={() => navigate('notifications_center')}
          />
        );

      // ── Workflow / utility screens ─────────────────────────────────────────
      case 'property_create_wizard': {
        const retProp = role === 'manager' ? 'manager_properties' : 'property_portfolio';
        return (
          <PropertyCreateWizardScreen
            onBack={() => navigate(retProp)}
            onSuccess={() => navigate(retProp)}
            onNavigate={navigate}
          />
        );
      }
      case 'rental_invoice_studio':
        return (
          <RentalInvoiceStudioScreen
            onBack={() => navigate('financial_ledger')}
            onSuccess={() => navigate('financial_ledger')}
          />
        );
      case 'tenant_360_detail':
        return (
          <Tenant360DetailScreen
            tenantId={selectedTenantId}
            onBack={() => navigate('tenant_roster')}
            onInitiateVacatePress={() => navigate('vacates_moveout')}
          />
        );
      case 'lease_drafting_builder': {
        const retLease = role === 'manager' ? 'manager_lease_documents' : 'leasing_hub';
        return (
          <LeaseDraftingBuilderScreen
            onBack={() => navigate(retLease)}
            onSuccess={() => navigate(retLease)}
          />
        );
      }
      case 'moveout_inspection_checklist':
        return (
          <MoveOutInspectionChecklistScreen
            moveOutId={selectedMoveOutId}
            onBack={() => navigate('vacates_moveout')}
            onSuccess={() => navigate('vacates_moveout')}
          />
        );
      case 'create_maintenance_ticket': {
        const ret = role === 'tenant' ? 'tenant_maintenance' : role === 'manager' ? 'manager_repair_dispatch' : 'owner_maintenance_dispatch';
        return (
          <CreateMaintenanceTicketScreen
            onBack={() => navigate(ret)}
            onSuccess={() => navigate(ret)}
          />
        );
      }
      case 'online_payment_checkout': {
        const ret = role === 'tenant' ? 'tenant_payments' : 'financial_ledger';
        return (
          <OnlinePaymentCheckoutScreen
            onBack={() => navigate(ret)}
            onSuccess={() => navigate(ret)}
          />
        );
      }
      case 'document_pdf_viewer':
        return <DocumentPdfViewerScreen onBack={goBack} />;
      case 'notifications_center':
        return <NotificationsCenterScreen onBack={goBack} />;
      case 'legal_policies':
        return <LegalPoliciesScreen onBack={goBack} />;
      case 'contact_inquiry':
        return <ContactInquiryScreen onBack={goBack} />;
      case 'account_settings':
        return (
          <AccountSettingsScreen
            currentRole={role}
            onBack={goBack}
            onSignOut={() => logout()}
          />
        );

      default:
        return (
          <OwnerDashboardScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNavigate={navigate}
          />
        );
    }
  };

  // ── Tab bar for current role ────────────────────────────────────────────────

  const tabs = ROLE_TABS[role] ?? ROLE_TABS.owner;
  const roleMeta = ROLE_META[role] ?? ROLE_META.owner;

  const initials = user.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'P';

  // A tab is "active" if the active screen belongs to that tab
  // "More" tab is active when current screen is in moreItems list
  const moreScreenKeys = new Set(moreItems.map((m) => m.key));
  const isMoreActive = moreScreenKeys.has(effectiveScreenKey);
  const activeTabAccent = isDark ? colors.primaryText : '#059669';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Active Screen ──────────────────────────────────────────────────── */}
      <View style={styles.screenContainer}>{renderActiveScreen()}</View>

      {/* ── Free Trial Floating Widget for Owner ────────────────────────────── */}
      {role === 'owner' && (
        <FreeTrialFloatingWidget
          currentScreenKey={effectiveScreenKey}
          onNavigateToPlans={() => navigate('owner_plan_subscription')}
        />
      )}

      {/* ── Bottom Tab Bar ─────────────────────────────────────────────────── */}
      <SafeAreaView
        edges={['bottom']}
        style={[styles.tabBarSafe, { backgroundColor: colors.surface, borderTopColor: colors.line }]}
      >
        <View style={[styles.tabBar, { backgroundColor: colors.surface }]}>
          {tabs.map((tab) => {
            const isActive = tab.isMore ? isMoreActive : effectiveScreenKey === tab.key;
            const color = isActive ? activeTabAccent : colors.inkSoft;

            if (tab.isMore) {
              return (
                <TourTarget key="__more__" id="tab-__more__" style={styles.tabItem}>
                  <TouchableOpacity
                    style={{ alignItems: 'center', justifyContent: 'center', width: '100%' }}
                    onPress={() => setShowMoreMenu(true)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.tabIconWrap,
                        isActive && {
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#F0FDF4',
                        },
                      ]}
                    >
                      <Feather name="menu" size={20} color={color} />
                    </View>
                    <Text
                      style={[
                        styles.tabLabel,
                        { color },
                        isActive && styles.tabLabelActive,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      More
                    </Text>
                  </TouchableOpacity>
                </TourTarget>
              );
            }

            const hasStaffBadge =
              role === 'staff' &&
              ((tab.key === 'staff_job_queue' &&
                state.tickets.some(
                  (t) =>
                    (t.status === 'open' || t.status === 'assigned' || t.status === 'in_progress') &&
                    (t.assignedStaffId === user.id ||
                      (user.displayName && t.assignedStaffName?.toLowerCase().includes(user.displayName.toLowerCase())))
                )) ||
                (tab.key === 'staff_task_fees' &&
                  state.tickets.some(
                    (t) =>
                      t.payment &&
                      (t.payment.status === 'pending_approval' || t.payment.status === 'awaiting_payment') &&
                      (t.assignedStaffId === user.id ||
                        (user.displayName && t.assignedStaffName?.toLowerCase().includes(user.displayName.toLowerCase())))
                  )));

            const hasManagerBadge =
              role === 'manager' &&
              ((tab.key === 'manager_repair_dispatch' &&
                state.tickets.some((t) => t.status === 'open')) ||
                (tab.key === 'manager_lease_documents' &&
                  (state.agreements.some((a) => a.status === 'pending_approval' || a.status === 'awaiting_tenant_signature') ||
                    (state.tenancyRequests || []).some((r) => r.status === 'pending'))));

            const showTabDot = hasStaffBadge || hasManagerBadge;

            return (
              <TourTarget key={tab.key} id={`tab-${tab.key}`} style={styles.tabItem}>
                <TouchableOpacity
                  style={{ alignItems: 'center', justifyContent: 'center', width: '100%' }}
                  onPress={() => navigate(tab.key)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.tabIconWrap,
                      isActive && {
                        backgroundColor: isDark ? '#0F2920' : '#E6F4EE',
                      },
                    ]}
                  >
                    <TabIcon tab={tab} color={color} />
                    {showTabDot && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 3,
                          right: 11,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: '#EF4444',
                          borderWidth: 1.5,
                          borderColor: colors.surface,
                        }}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.tabLabel,
                      { color },
                      isActive && styles.tabLabelActive,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              </TourTarget>
            );
          })}
        </View>
      </SafeAreaView>

      {/* ── Compact Slide-Up More & Profile Bottom Sheet ───────────────────── */}
      <Modal
        visible={showMoreMenu}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowMoreMenu(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setShowMoreMenu(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[
              styles.sheetCard,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.line,
              },
            ]}
          >
            {/* Drag Handle */}
            <View style={[styles.sheetHandle, { backgroundColor: colors.lineStrong }]} />

            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {/* Compact Profile Strip */}
              <View
                style={[
                  styles.profileCard,
                  {
                    backgroundColor: colors.surfaceSunken,
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.line,
                  },
                ]}
              >
                {/* Top Row: Avatar + Name/Email + Close (X) */}
                <View style={styles.profileCardTop}>
                  <View
                    style={[
                      styles.avatar,
                      isDark && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' },
                    ]}
                  >
                    <Text style={[styles.avatarText, isDark && { color: '#34D399' }]}>{initials}</Text>
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={[styles.profileName, { color: colors.ink }]} numberOfLines={1}>
                      {user.displayName || 'Propithub User'}
                    </Text>
                    <Text style={[styles.profileEmail, { color: colors.inkSoft }]} numberOfLines={1}>
                      {user.email || ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowMoreMenu(false)}
                    style={[styles.moreCloseBtn, { backgroundColor: colors.surface }]}
                    activeOpacity={0.8}
                  >
                    <Feather name="x" size={18} color={colors.inkSoft} />
                  </TouchableOpacity>
                </View>

                {/* Bottom Row of Profile: Status Badges (Left) + Log Out (Right) */}
                <View style={styles.profileCardBottom}>
                  <View style={styles.badgesRow}>
                    <View
                      style={[
                        styles.roleBadge,
                        {
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                          borderColor: isDark ? 'rgba(16, 185, 129, 0.28)' : '#A7F3D0',
                        },
                      ]}
                    >
                      <Text style={[styles.roleBadgeText, { color: isDark ? '#34D399' : '#047857' }]}>
                        {roleMeta.emoji} {roleMeta.label}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.onlineBadge,
                        {
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#F0FDF4',
                          borderColor: isDark ? 'rgba(16, 185, 129, 0.22)' : '#BBF7D0',
                        },
                      ]}
                    >
                      <View style={styles.liveDot} />
                      <Text style={[styles.liveText, { color: isDark ? '#34D399' : '#059669' }]}>Online</Text>
                    </View>
                  </View>

                  {/* Safe Log Out Button directly in the Profile Card */}
                  <TouchableOpacity
                    style={[
                      styles.profileLogoutBtn,
                      {
                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE2E2',
                        borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FCA5A5',
                      },
                    ]}
                    onPress={handleLogoutPress}
                    activeOpacity={0.75}
                  >
                    <Feather name="log-out" size={12} color={isDark ? '#F87171' : '#DC2626'} />
                    <Text style={[styles.profileLogoutBtnText, { color: isDark ? '#F87171' : '#DC2626' }]}>
                      Log Out
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── 3-Column Workspace Grid (Owner & Tenant extra modules) ─── */}
              {moreItemRows.length > 0 && (
                <>
                  <View style={styles.moreSectionLabel}>
                    <Text style={[styles.moreSectionLabelText, { color: colors.inkSoft }]}>WORKSPACES</Text>
                  </View>
                  <View style={styles.gridContainer}>
                    {moreItemRows.map((row, rIdx) => (
                      <View key={`row-${rIdx}`} style={styles.gridMenuRow}>
                        {row.map((item) => {
                          const isActive = effectiveScreenKey === item.key;
                          const accentColor = item.color ?? '#059669';
                          return (
                            <TouchableOpacity
                              key={item.key}
                              style={[
                                styles.gridMenuTile,
                                {
                                  backgroundColor: isActive
                                    ? isDark
                                      ? 'rgba(16, 185, 129, 0.16)'
                                      : '#ECFDF5'
                                    : colors.surfaceSunken,
                                  borderColor: isActive
                                    ? '#10B981'
                                    : isDark
                                    ? 'rgba(255,255,255,0.06)'
                                    : colors.line,
                                },
                              ]}
                              onPress={() => navigate(item.key)}
                              activeOpacity={0.75}
                            >
                              <View
                                style={[
                                  styles.gridIconBox,
                                  { backgroundColor: accentColor + (isDark ? '26' : '16') },
                                ]}
                              >
                                <MenuIcon item={item} color={isActive ? '#10B981' : accentColor} />
                              </View>
                              <Text
                                style={[
                                  styles.gridMenuLabel,
                                  { color: isActive ? '#10B981' : colors.ink },
                                  isActive && { fontWeight: '800' },
                                ]}
                                numberOfLines={2}
                              >
                                {item.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        {row.length < 3 &&
                          Array.from({ length: 3 - row.length }).map((_, i) => (
                            <View key={`spacer-${i}`} style={styles.gridMenuTileSpacer} />
                          ))}
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* ── Quick Account & Theme Actions ──────────────────────────── */}
              <View style={styles.profileActions}>
                <TouchableOpacity
                  style={[
                    styles.settingsBtn,
                    {
                      backgroundColor: colors.surfaceSunken,
                      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.line,
                    },
                  ]}
                  onPress={() => navigate('account_settings')}
                  activeOpacity={0.8}
                >
                  <Feather name="settings" size={15} color={colors.ink} />
                  <Text style={[styles.settingsBtnText, { color: colors.ink }]}>Account Settings</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.settingsBtn,
                    {
                      backgroundColor: colors.surfaceSunken,
                      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.line,
                    },
                  ]}
                  onPress={() => toggleTheme()}
                  activeOpacity={0.8}
                >
                  <Feather name={isDark ? 'sun' : 'moon'} size={15} color={colors.ink} />
                  <Text style={[styles.settingsBtnText, { color: colors.ink }]}>
                    {isDark ? 'Light Mode' : 'Dark Mode'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Interactive Platform Guide HUD Overlay ─────────────────────────── */}
      <MobileGuidedTourOverlay />

    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },

  // ── Dev Launcher ──────────────────────────────────────────────────────────
  devLauncherRow: {
    position: 'absolute',
    bottom: 72,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#065F46',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#047857',
    zIndex: 99,
  },
  devLauncherBtn: { paddingRight: 8, paddingVertical: 2 },
  devLauncherText: { color: '#A7F3D0', fontWeight: '700', fontSize: 12 },
  devDismissBtn: {
    backgroundColor: '#047857',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devDismissText: { color: '#D1FAE5', fontSize: 10, fontWeight: '700', lineHeight: 12 },
  devShowBtn: {
    position: 'absolute',
    bottom: 72,
    left: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#065F46',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#047857',
    zIndex: 99,
  },
  devShowBtnText: { fontSize: 14, color: '#94A3B8' },

  // ── Bottom Tab Bar ────────────────────────────────────────────────────────
  tabBarSafe: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 4,
  },
  tabBar: {
    flexDirection: 'row',
    height: 58,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 2,
  },
  tabIconWrap: {
    width: 44,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  tabIconWrapActive: {
    backgroundColor: '#ECFDF5',
  },
  tabLabel: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: '#059669',
    fontWeight: '800',
  },

  // ── Compact Bottom Sheet ───────────────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: '86%',
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  moreCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Profile Card
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  profileCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 150, 150, 0.12)',
  },
  profileLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  profileLogoutBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  profileCardLeft: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#059669' },
  profileInfo: { flex: 1, marginLeft: 12 },
  profileName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  profileEmail: { fontSize: 11.5, color: '#64748B', marginTop: 1 },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    borderWidth: 1,
  },
  roleBadgeText: { fontSize: 10.5, fontWeight: '700' },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveText: { fontSize: 10, fontWeight: '700' },

  // Profile action buttons
  profileActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  settingsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
  },
  settingsBtnText: { fontSize: 12.5, fontWeight: '600' },

  // Section label
  moreSectionLabel: { marginBottom: 8, paddingHorizontal: 2 },
  moreSectionLabelText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // 3-Column Workspace Grid
  gridContainer: {
    marginBottom: 14,
  },
  gridMenuRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  gridMenuTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  gridMenuTileSpacer: {
    flex: 1,
    paddingHorizontal: 4,
  },
  gridIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridMenuLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },

  // Role switcher
  roleSwitcherCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  roleSwitcherTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
  },
  roleChipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roleChipActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  roleChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  roleChipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  // ── Dev Modal ──────────────────────────────────────────────────────────────
  devModalSafe: { flex: 1, backgroundColor: '#FFFFFF' },
  devModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  devModalTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  devSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  devItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  devItemActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  devItemText: { fontSize: 13, fontWeight: '500', color: '#0F172A' },

  // ── Subordinate Subscription Lock Screen ──────────────────────────────────
  lockedContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  lockedCard: {
    maxWidth: 440,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  lockedIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  lockedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
  },
  lockedSubtitle: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  lockedSignOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
  },
  lockedSignOutBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
});
