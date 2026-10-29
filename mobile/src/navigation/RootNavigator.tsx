import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Modal,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { UserRole } from '../types';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { PropithubLogo, PropithubIcon } from '../components/PropithubLogo';
import { FreeTrialFloatingWidget } from '../components/FreeTrialFloatingWidget';
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
    { key: '__more__',           label: 'More',         icon: 'menu',           iconLib: 'feather', isMore: true },
  ],
  manager: [
    { key: 'manager_operations',      label: 'Overview',        icon: 'home',        iconLib: 'feather' },
    { key: 'manager_properties',      label: 'Properties',      icon: 'grid',        iconLib: 'feather' },
    { key: 'manager_repair_dispatch', label: 'Repairs',         icon: 'tool',        iconLib: 'feather' },
    { key: '__more__',                label: 'More',            icon: 'menu',        iconLib: 'feather', isMore: true },
  ],
  staff: [
    { key: 'staff_job_queue', label: 'Jobs',     icon: 'list',        iconLib: 'feather' },
    { key: 'staff_task_fees', label: 'Earnings', icon: 'credit-card', iconLib: 'feather' },
    { key: 'staff_ratings',   label: 'Ratings',  icon: 'star',        iconLib: 'feather' },
    { key: '__more__',        label: 'More',     icon: 'menu',        iconLib: 'feather', isMore: true },
  ],
};

// ─── Role "More" Menu Items ──────────────────────────────────────────────────

const ROLE_MORE_ITEMS: Record<UserRole, MoreMenuItem[]> = {
  owner: [
    { key: 'tenant_roster',          label: 'Tenants',             sublabel: 'Resident profiles & KYC',          icon: 'users',       iconLib: 'feather', color: '#7C3AED' },
    { key: 'leasing_hub',            label: 'Leasing',             sublabel: 'Agreements & digital signing',    icon: 'file-text',   iconLib: 'feather', color: '#2563EB' },
    { key: 'vacates_moveout',        label: 'Move-Outs',           sublabel: 'Inspection & deposit deductions',  icon: 'log-out',     iconLib: 'feather', color: '#DC2626' },
    { key: 'owner_maintenance_dispatch', label: 'Maintenance',      sublabel: 'Dispatch & ticket oversight',      icon: 'tool',        iconLib: 'feather', color: '#D97706' },
    { key: 'owner_messages',         label: 'Announcements',        sublabel: 'Broadcast & tenant comms',         icon: 'message-square', iconLib: 'feather', color: '#059669' },
    { key: 'owner_team_managers',    label: 'Team',                sublabel: 'Staff delegation & access',        icon: 'briefcase',   iconLib: 'feather', color: '#0284C7' },
    { key: 'owner_disputes_reviews', label: 'Reputation',          sublabel: 'Trust ratings & reviews',          icon: 'award',       iconLib: 'feather', color: '#9333EA' },
    { key: 'owner_helpdesk',         label: 'Helpdesk',            sublabel: 'Platform support tickets',         icon: 'headphones',  iconLib: 'feather', color: '#0891B2' },
    { key: 'owner_plan_subscription',label: 'Subscription',        sublabel: 'Billing & quota management',       icon: 'zap',         iconLib: 'feather', color: '#CA8A04' },
    { key: 'notifications_center',   label: 'Notifications',        sublabel: 'Alerts & activity feed',           icon: 'bell',        iconLib: 'feather', color: '#475569' },
    { key: 'account_settings',       label: 'Settings',            sublabel: 'Profile & preferences',            icon: 'settings',    iconLib: 'feather', color: '#334155' },
  ],
  tenant: [
    { key: 'tenant_maintenance',     label: 'Maintenance',         sublabel: 'Repairs & work orders',           icon: 'tool',        iconLib: 'feather', color: '#059669' },
    { key: 'tenant_landlord_reviews',label: 'Reviews',              sublabel: 'Verified reviews & feedback',     icon: 'award',       iconLib: 'feather', color: '#D97706' },
    { key: 'notifications_center',   label: 'Notifications',         sublabel: 'Rent reminders & alerts',         icon: 'bell',        iconLib: 'feather', color: '#475569' },
    { key: 'account_settings',       label: 'Settings',            sublabel: 'Profile & preferences',           icon: 'settings',    iconLib: 'feather', color: '#334155' },
  ],
  manager: [
    { key: 'manager_lease_documents',   label: 'Leasing',           sublabel: 'Tenant contracts & documents',     icon: 'file-text',  iconLib: 'feather', color: '#2563EB' },
    { key: 'notifications_center',      label: 'Notifications',     sublabel: 'Operational alerts',               icon: 'bell',       iconLib: 'feather', color: '#475569' },
    { key: 'account_settings',          label: 'Settings',          sublabel: 'Profile & preferences',            icon: 'settings',   iconLib: 'feather', color: '#334155' },
  ],
  staff: [
    { key: 'notifications_center', label: 'Notifications',    sublabel: 'Job assignments & alerts',          icon: 'bell',      iconLib: 'feather', color: '#475569' },
    { key: 'account_settings',     label: 'Settings',         sublabel: 'Profile & preferences',             icon: 'settings',  iconLib: 'feather', color: '#334155' },
  ],
};

// ─── Root Navigator Props ─────────────────────────────────────────────────────

interface RootNavigatorProps {
  initialRole?: UserRole;
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

export const RootNavigator: React.FC<RootNavigatorProps> = () => {
  const { user, role, isAuthenticated, isLoading, logout } = useMobileAuth();
  const { isOwnerPlanActive } = useMobileAppData();
  const { colors, isDark } = useMobileTheme();
  const { registerNavigate, isActive: isTourActive, isMinimized: isTourMinimized } = useMobileTour();
  const [activeScreenKey, setActiveScreenKey] = useState<string>('owner_dashboard');
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [selectedMoveOutId, setSelectedMoveOutId] = useState<string>('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Register screen switcher with tour context
  useEffect(() => {
    registerNavigate(setActiveScreenKey);
  }, [registerNavigate]);

  const isOwnerActive = role === 'owner' ? isOwnerPlanActive(user?.id) : true;
  const isGuidedTourExploring = isTourActive && !isTourMinimized;

  // Synchronize active screen whenever role changes
  useEffect(() => {
    if (isGuidedTourExploring) return;
    if (role === 'owner') {
      setActiveScreenKey(isOwnerActive ? 'owner_dashboard' : 'owner_plan_subscription');
    }
    else if (role === 'tenant') setActiveScreenKey('tenant_dashboard');
    else if (role === 'manager') setActiveScreenKey('manager_operations');
    else if (role === 'staff') setActiveScreenKey('staff_job_queue');
  }, [role, isOwnerActive, isGuidedTourExploring]);

  // Strict paywall for Owner: if subscription and trial have expired, block access to all routes
  // except owner_plan_subscription (to renew) and account_settings (unless taking the initial guided tour)
  useEffect(() => {
    if (isGuidedTourExploring) return;
    if (role === 'owner' && !isOwnerActive) {
      if (activeScreenKey !== 'owner_plan_subscription' && activeScreenKey !== 'account_settings') {
        setActiveScreenKey('owner_plan_subscription');
      }
    }
  }, [role, isOwnerActive, activeScreenKey, isGuidedTourExploring]);

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
      <SafeAreaView style={styles.lockedContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        <View style={styles.lockedCard}>
          <View style={styles.lockedIconWrap}>
            <Feather name="lock" size={38} color="#EF4444" />
          </View>
          <Text style={styles.lockedTitle}>Organization Subscription Inactive</Text>
          <Text style={styles.lockedSubtitle}>
            Access to this management workspace is currently paused because your portfolio owner’s Propithub subscription or free trial has expired.
            Please contact your organization administrator or property owner to renew the account.
          </Text>
          <TouchableOpacity
            style={styles.lockedSignOutBtn}
            onPress={() => logout()}
            activeOpacity={0.8}
          >
            <Feather name="log-out" size={16} color="#0F172A" style={{ marginRight: 8 }} />
            <Text style={styles.lockedSignOutBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Screen renderer ────────────────────────────────────────────────────────

  const navigate = (key: string) => {
    setShowMoreMenu(false);
    if (role === 'owner' && !isOwnerActive) {
      if (key !== 'owner_plan_subscription' && key !== 'account_settings') {
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
    setActiveScreenKey(key);
  };

  const goBack = () => {
    if (role === 'tenant') navigate('tenant_dashboard');
    else if (role === 'manager') navigate('manager_operations');
    else if (role === 'staff') navigate('staff_job_queue');
    else navigate('owner_dashboard');
  };

  const renderActiveScreen = () => {
    switch (activeScreenKey) {
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
            onFileDisputePress={() => navigate('file_formal_dispute')}
          />
        );
      case 'owner_maintenance_dispatch':
        return (
          <OwnerMaintenanceDispatchScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onCreateTicketPress={() => navigate('create_maintenance_ticket')}
          />
        );
      case 'owner_messages':
        return <OwnerMessagesScreen onProfilePress={() => setShowMoreMenu(true)} />;
      case 'owner_team_managers':
        return <OwnerTeamManagersScreen initialTab="managers" onNavigate={navigate} />;
      case 'manager_compensation':
        return <OwnerTeamManagersScreen initialTab="payouts" onNavigate={navigate} />;
      case 'owner_disputes_reviews':
        return <OwnerDisputesReviewsScreen />;
      case 'owner_helpdesk':
        return <OwnerHelpdeskScreen />;
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
        return <TenantLeaseScreen onGiveNoticePress={() => navigate('vacates_moveout')} />;
      case 'tenant_payments':
        return (
          <TenantPaymentsScreen
            onPayInvoicePress={() => navigate('online_payment_checkout')}
          />
        );
      case 'tenant_maintenance':
        return (
          <TenantMaintenanceScreen
            onCreateTicketPress={() => navigate('create_maintenance_ticket')}
            onPayChargePress={() => navigate('online_payment_checkout')}
          />
        );
      case 'tenant_landlord_reviews':
        return <TenantLandlordReviewsScreen />;

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
          />
        );
      case 'manager_properties':
        return <ManagerPropertiesScreen onProfilePress={() => setShowMoreMenu(true)} />;
      case 'manager_lease_documents':
        return (
          <ManagerLeaseDocumentsScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onViewPdfPress={() => navigate('document_pdf_viewer')}
          />
        );
      case 'disputes_desk':
      case 'manager_operational_disputes':
        return (
          <ManagerOperationsScreen
            onProfilePress={() => setShowMoreMenu(true)}
            onNavigate={navigate}
          />
        );

      // ── Staff ──────────────────────────────────────────────────────────────
      case 'staff_dashboard':
      case 'staff_job_queue':
        return <StaffJobQueueScreen onProfilePress={() => setShowMoreMenu(true)} />;
      case 'staff_task_fees':
      case 'staff_earnings':
        return <StaffTaskPaymentsScreen />;
      case 'staff_ratings':
        return <StaffRatingsScreen />;

      // ── Workflow / utility screens ─────────────────────────────────────────
      case 'property_create_wizard':
        return (
          <PropertyCreateWizardScreen
            onBack={() => navigate('property_portfolio')}
            onSuccess={() => navigate('property_portfolio')}
            onNavigate={navigate}
          />
        );
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
      case 'lease_drafting_builder':
        return (
          <LeaseDraftingBuilderScreen
            onBack={() => navigate('leasing_hub')}
            onSuccess={() => navigate('leasing_hub')}
          />
        );
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
      case 'file_formal_dispute': {
        return <OwnerDisputesReviewsScreen />;
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
        return <OwnerDashboardScreen />;
    }
  };

  // ── Tab bar for current role ────────────────────────────────────────────────

  const tabs = ROLE_TABS[role] ?? ROLE_TABS.owner;
  const moreItems = ROLE_MORE_ITEMS[role] ?? [];
  const roleMeta = ROLE_META[role] ?? ROLE_META.owner;

  const initials = user.displayName
    ? user.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'P';

  // A tab is "active" if the active screen belongs to that tab
  // "More" tab is active when current screen is in moreItems list
  const moreScreenKeys = new Set(moreItems.map((m) => m.key));
  const isMoreActive = moreScreenKeys.has(activeScreenKey);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Active Screen ──────────────────────────────────────────────────── */}
      <View style={styles.screenContainer}>{renderActiveScreen()}</View>

      {/* ── Free Trial Floating Widget for Owner ────────────────────────────── */}
      {role === 'owner' && (
        <FreeTrialFloatingWidget
          currentScreenKey={activeScreenKey}
          onNavigateToPlans={() => setActiveScreenKey('owner_plan_subscription')}
        />
      )}

      {/* ── Bottom Tab Bar ─────────────────────────────────────────────────── */}
      <SafeAreaView style={[styles.tabBarSafe, { backgroundColor: colors.surface, borderTopColor: colors.line }]}>
        <View style={[styles.tabBar, { backgroundColor: colors.surface }]}>
          {tabs.map((tab) => {
            const isActive = tab.isMore ? isMoreActive : activeScreenKey === tab.key;
            const color = isActive ? '#10B981' : colors.inkSoft;

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
                        { color: isActive ? '#10B981' : colors.inkSoft },
                        isActive && styles.tabLabelActive,
                      ]}
                    >
                      More
                    </Text>
                  </TouchableOpacity>
                </TourTarget>
              );
            }

            return (
              <TourTarget key={tab.key} id={`tab-${tab.key}`} style={styles.tabItem}>
                <TouchableOpacity
                  style={{ alignItems: 'center', justifyContent: 'center', width: '100%' }}
                  onPress={() => {
                    setShowMoreMenu(false);
                    if (role === 'owner' && !isOwnerActive && tab.key !== '__more__') {
                      Alert.alert(
                        'Workspace Locked 🔒',
                        'Your portfolio access is suspended because your subscription or free trial has expired. Please select a plan to renew and unlock your workspace.',
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
                    setActiveScreenKey(tab.key);
                  }}
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
                    <TabIcon tab={tab} color={color} />
                  </View>
                  <Text
                    style={[
                      styles.tabLabel,
                      { color: isActive ? '#10B981' : colors.inkSoft },
                      isActive && styles.tabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              </TourTarget>
            );
          })}
        </View>
        {/* iOS home indicator */}
        <View
          style={[
            styles.homeIndicator,
            { backgroundColor: isDark ? '#FFFFFF' : '#0F172A', opacity: isDark ? 0.25 : 0.15 },
          ]}
        />
      </SafeAreaView>

      {/* ── "More" Full-Screen Drawer ───────────────────────────────────────── */}
      <Modal
        visible={showMoreMenu}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowMoreMenu(false)}
      >
        <SafeAreaView style={[styles.moreModalSafe, { backgroundColor: colors.background }]}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />

          {/* ── More header ─────────────────────────────────────────────────── */}
          <View style={[styles.moreHeader, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
            <PropithubLogo size={24} showText={true} />
            <TouchableOpacity
              onPress={() => setShowMoreMenu(false)}
              style={[styles.moreCloseBtn, { backgroundColor: colors.surfaceSunken }]}
              activeOpacity={0.8}
            >
              <Feather name="x" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={[styles.moreScroll, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.moreScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Profile Card ─────────────────────────────────────────────── */}
            <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.line }]}>
              <View style={styles.profileCardLeft}>
                <View style={[styles.avatar, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' }]}>
                  <Text style={[styles.avatarText, isDark && { color: '#34D399' }]}>{initials}</Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={[styles.profileName, { color: colors.ink }]} numberOfLines={1}>
                    {user.displayName || 'Propithub User'}
                  </Text>
                  <Text style={[styles.profileEmail, { color: colors.inkSoft }]} numberOfLines={1}>
                    {user.email || ''}
                  </Text>
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
                </View>
              </View>
            </View>

            {/* ── Profile actions ──────────────────────────────────────────── */}
            <View style={styles.profileActions}>
              <TouchableOpacity
                style={[
                  styles.settingsBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.line,
                  },
                ]}
                onPress={() => {
                  setShowMoreMenu(false);
                  setActiveScreenKey('account_settings');
                }}
                activeOpacity={0.8}
              >
                <Feather name="settings" size={15} color={colors.ink} />
                <Text style={[styles.settingsBtnText, { color: colors.ink }]}>Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.logoutBtn,
                  {
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEE2E2',
                    borderColor: isDark ? 'rgba(239, 68, 68, 0.28)' : '#FCA5A5',
                  },
                ]}
                onPress={() => {
                  setShowMoreMenu(false);
                  logout();
                }}
                activeOpacity={0.8}
              >
                <Feather name="log-out" size={15} color={isDark ? '#F87171' : '#DC2626'} />
                <Text style={[styles.logoutBtnText, { color: isDark ? '#F87171' : '#DC2626' }]}>Log Out</Text>
              </TouchableOpacity>
            </View>

            {/* ── Section divider ──────────────────────────────────────────── */}
            <View style={styles.moreSectionLabel}>
              <Text style={[styles.moreSectionLabelText, { color: colors.inkSoft }]}>NAVIGATION</Text>
            </View>

            {/* ── Inset Grouped Navigation Menu ─────────────────────────────── */}
            <View
              style={[
                styles.menuGroupCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.line,
                },
              ]}
            >
              {moreItems
                .filter((item) => item.key !== 'account_settings')
                .map((item, index, filteredItems) => {
                  const isActive = activeScreenKey === item.key;
                  const accentColor = item.color ?? '#475569';
                  const isLast = index === filteredItems.length - 1;
                  return (
                    <React.Fragment key={item.key}>
                      <TouchableOpacity
                        style={[
                          styles.menuRowItem,
                          isActive && {
                            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                          },
                        ]}
                        onPress={() => {
                          setShowMoreMenu(false);
                          setActiveScreenKey(item.key);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.menuIconBox, { backgroundColor: accentColor + (isDark ? '25' : '18') }]}>
                          <MenuIcon item={item} color={accentColor} />
                        </View>
                        <View style={styles.menuRowText}>
                          <Text
                            style={[
                              styles.menuLabel,
                              { color: colors.ink },
                              isActive && { color: '#10B981', fontWeight: '800' },
                            ]}
                          >
                            {item.label}
                          </Text>
                          <Text style={[styles.menuSublabel, { color: colors.inkSoft }]}>{item.sublabel}</Text>
                        </View>
                        <Feather
                          name="chevron-right"
                          size={15}
                          color={isActive ? '#10B981' : isDark ? '#475569' : '#94A3B8'}
                        />
                      </TouchableOpacity>
                      {!isLast && (
                        <View
                          style={[
                            styles.menuDivider,
                            {
                              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
                            },
                          ]}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
            </View>

            <View style={{ height: 32 }} />
          </ScrollView>
        </SafeAreaView>
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
    backgroundColor: Colors.surface,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
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
  },
  tabLabelActive: {
    color: '#059669',
    fontWeight: '800',
  },
  homeIndicator: {
    width: 120,
    height: 4,
    backgroundColor: '#0F172A',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 4,
    opacity: 0.15,
  },

  // ── More Modal ─────────────────────────────────────────────────────────────
  moreModalSafe: { flex: 1, backgroundColor: '#FFFFFF' },
  moreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  moreHeaderTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  moreCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreScroll: { flex: 1, backgroundColor: '#F8FAFC' },
  moreScrollContent: { padding: 16 },

  // Profile Card
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  profileCardLeft: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#059669' },
  profileInfo: { flex: 1, marginLeft: 12 },
  profileName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  profileEmail: { fontSize: 12, color: '#64748B', marginTop: 1 },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 14,
    borderWidth: 1,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveText: { fontSize: 10, fontWeight: '700' },

  // Profile action buttons
  profileActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  settingsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10.5,
    borderWidth: 1,
  },
  settingsBtnText: { fontSize: 13, fontWeight: '600' },
  logoutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10.5,
    borderWidth: 1,
  },
  logoutBtnText: { fontSize: 13, fontWeight: '700' },

  // Section label
  moreSectionLabel: { marginTop: 2, marginBottom: 8, paddingHorizontal: 4 },
  moreSectionLabelText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // Grouped Navigation Card
  menuGroupCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  menuRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
  },
  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuRowText: { flex: 1 },
  menuLabel: { fontSize: 14.5, fontWeight: '600' },
  menuSublabel: { fontSize: 11.5, marginTop: 1 },

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
