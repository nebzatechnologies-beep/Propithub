import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppDataProvider } from './context/AppDataContext';
import { WorkspaceLayout } from './layouts/WorkspaceLayout';
import { ProtectedRoute } from './components/ProtectedRoute';

// Public Pages
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { AdminLoginPage } from './pages/public/AdminLoginPage';
import { RegisterOwnerPage } from './pages/public/RegisterOwnerPage';
import { LegalPolicyPage } from './pages/public/LegalPolicyPage';
import { ContactSupportPage } from './pages/public/ContactSupportPage';
import { AccountDeletionPublicPage } from './pages/public/AccountDeletionPublicPage';
import { NotFoundPage } from './pages/public/NotFoundPage';

import { ThemeProvider } from './context/ThemeContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { CurrencyConverterModal } from './components/common/CurrencyConverterModal';

// Lazy-load a named export so each role portal is split into its own chunk
const lazyNamed = <T extends Record<string, any>, K extends keyof T>(loader: () => Promise<T>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType<any> })));

// Superadmin Pages
const SuperadminOverviewPage = lazyNamed(() => import('./pages/superadmin/OverviewPage'), 'OverviewPage');
const MasterUsersPage = lazyNamed(() => import('./pages/superadmin/MasterUsersPage'), 'MasterUsersPage');
const PlansPage = lazyNamed(() => import('./pages/superadmin/PlansPage'), 'PlansPage');
const PlatformInvoicesPage = lazyNamed(() => import('./pages/superadmin/PlatformInvoicesPage'), 'PlatformInvoicesPage');
const ConnectionsPage = lazyNamed(() => import('./pages/superadmin/ConnectionsPage'), 'ConnectionsPage');
const LandingCmsPage = lazyNamed(() => import('./pages/superadmin/LandingCmsPage'), 'LandingCmsPage');
const OversightPage = lazyNamed(() => import('./pages/superadmin/OversightPage'), 'OversightPage');
const AdminMessagesPage = lazyNamed(() => import('./pages/superadmin/AdminMessagesPage'), 'AdminMessagesPage');

// Owner Pages
const OwnerDashboardPage = lazyNamed(() => import('./pages/owner/DashboardPage'), 'OwnerDashboardPage');
const PropertiesPage = lazyNamed(() => import('./pages/owner/PropertiesPage'), 'PropertiesPage');
const Tenant360Page = lazyNamed(() => import('./pages/owner/Tenant360Page'), 'Tenant360Page');
const LeasingPage = lazyNamed(() => import('./pages/owner/LeasingPage'), 'LeasingPage');
const VacatesPage = lazyNamed(() => import('./pages/owner/VacatesPage'), 'VacatesPage');
const PaymentsPage = lazyNamed(() => import('./pages/owner/PaymentsPage'), 'PaymentsPage');
const MaintenancePage = lazyNamed(() => import('./pages/owner/MaintenancePage'), 'MaintenancePage');
const TeamPage = lazyNamed(() => import('./pages/owner/TeamPage'), 'TeamPage');
const DisputesPage = lazyNamed(() => import('./pages/owner/DisputesPage'), 'DisputesPage');
const PlanSubscriptionPage = lazyNamed(() => import('./pages/owner/PlanSubscriptionPage'), 'PlanSubscriptionPage');
const OwnerMessagesPage = lazyNamed(() => import('./pages/owner/OwnerMessagesPage'), 'OwnerMessagesPage');
const HelpdeskPage = lazyNamed(() => import('./pages/owner/HelpdeskPage'), 'HelpdeskPage');

// Tenant Pages
const TenantDashboardPage = lazyNamed(() => import('./pages/tenant/DashboardPage'), 'TenantDashboardPage');
const LeaseAgreementPage = lazyNamed(() => import('./pages/tenant/LeaseAgreementPage'), 'LeaseAgreementPage');
const PaymentsHistoryPage = lazyNamed(() => import('./pages/tenant/PaymentsHistoryPage'), 'PaymentsHistoryPage');
const SupportTicketsPage = lazyNamed(() => import('./pages/tenant/SupportTicketsPage'), 'SupportTicketsPage');
const ReviewsDisputesPage = lazyNamed(() => import('./pages/tenant/ReviewsDisputesPage'), 'ReviewsDisputesPage');

// Manager Pages
const ManagerDashboardPage = lazyNamed(() => import('./pages/manager/DashboardPage'), 'ManagerDashboardPage');
const ManagedPropertiesPage = lazyNamed(() => import('./pages/manager/ManagedPropertiesPage'), 'ManagedPropertiesPage');
const LeaseDocumentsPage = lazyNamed(() => import('./pages/manager/LeaseDocumentsPage'), 'LeaseDocumentsPage');
const MaintenanceDispatchPage = lazyNamed(() => import('./pages/manager/MaintenanceDispatchPage'), 'MaintenanceDispatchPage');

// Staff Pages
const StaffDashboardQueuePage = lazyNamed(() => import('./pages/staff/DashboardQueuePage'), 'StaffDashboardQueuePage');
const StaffTaskPaymentsPage = lazyNamed(() => import('./pages/staff/TaskPaymentsPage'), 'StaffTaskPaymentsPage');
const StaffRatingsPage = lazyNamed(() => import('./pages/staff/StaffRatingsPage'), 'StaffRatingsPage');

const AccountSettingsPage = lazyNamed(() => import('./pages/common/AccountSettingsPage'), 'AccountSettingsPage');

const RouteFallback: React.FC = () => (
  <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--ink-soft)', fontSize: '14px' }}>
    Loading…
  </div>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppDataProvider>
            <CurrencyProvider>
              <CurrencyConverterModal />
              <Suspense fallback={<RouteFallback />}>
              <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/terms" element={<LegalPolicyPage type="terms" />} />
              <Route path="/privacy" element={<LegalPolicyPage type="privacy" />} />
              <Route path="/refund" element={<LegalPolicyPage type="refund" />} />
              <Route path="/contact" element={<ContactSupportPage />} />
              <Route path="/delete-account" element={<AccountDeletionPublicPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/admin" element={<Navigate to="/superadmin/overview" replace />} />
              <Route path="/admin/plans" element={<Navigate to="/superadmin/plans" replace />} />
              <Route path="/admin-login" element={<AdminLoginPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/register" element={<RegisterOwnerPage />} />

              {/* Protected Workspace Layout Routes */}
              <Route element={<WorkspaceLayout />}>
                {/* Superadmin Workspace */}
                <Route path="/superadmin" element={<ProtectedRoute allowedRoles={['superadmin']} />}>
                  <Route index element={<Navigate to="/superadmin/overview" replace />} />
                  <Route path="overview" element={<SuperadminOverviewPage />} />
                  <Route path="users" element={<MasterUsersPage />} />
                  <Route path="plans" element={<PlansPage />} />
                  <Route path="invoices" element={<PlatformInvoicesPage />} />
                  <Route path="connections" element={<ConnectionsPage />} />
                  <Route path="landing-cms" element={<LandingCmsPage />} />
                  <Route path="oversight" element={<OversightPage />} />
                  <Route path="messages" element={<AdminMessagesPage />} />
                  <Route path="settings" element={<AccountSettingsPage />} />
                </Route>

                {/* Owner Workspace */}
                <Route path="/owner" element={<ProtectedRoute allowedRoles={['owner']} />}>
                  <Route index element={<Navigate to="/owner/dashboard" replace />} />
                  <Route path="dashboard" element={<OwnerDashboardPage />} />
                  <Route path="properties" element={<PropertiesPage />} />
                  <Route path="tenants" element={<Tenant360Page />} />
                  <Route path="leasing" element={<LeasingPage />} />
                  <Route path="vacates" element={<VacatesPage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="messages" element={<OwnerMessagesPage />} />
                  <Route path="maintenance" element={<MaintenancePage />} />
                  <Route path="operations" element={<Navigate to="/owner/maintenance" replace />} />
                  <Route path="team" element={<TeamPage />} />
                  <Route path="helpdesk" element={<HelpdeskPage />} />
                  <Route path="disputes" element={<Navigate to="/owner/reviews" replace />} />
                  <Route path="reviews" element={<DisputesPage />} />
                  <Route path="plan" element={<PlanSubscriptionPage />} />
                  <Route path="subscription" element={<PlanSubscriptionPage />} />
                  <Route path="settings" element={<AccountSettingsPage />} />
                </Route>

                {/* Tenant Workspace */}
                <Route path="/tenant" element={<ProtectedRoute allowedRoles={['tenant']} />}>
                  <Route index element={<Navigate to="/tenant/dashboard" replace />} />
                  <Route path="dashboard" element={<TenantDashboardPage />} />
                  <Route path="lease" element={<LeaseAgreementPage />} />
                  <Route path="payments" element={<PaymentsHistoryPage />} />
                  <Route path="moveout" element={<Navigate to="/tenant/payments?tab=deposit" replace />} />
                  <Route path="support" element={<SupportTicketsPage />} />
                  <Route path="trust" element={<ReviewsDisputesPage />} />
                  <Route path="settings" element={<AccountSettingsPage />} />
                </Route>

                {/* Property Manager Workspace (Zero Financial Access) */}
                <Route path="/manager" element={<ProtectedRoute allowedRoles={['manager']} />}>
                  <Route index element={<Navigate to="/manager/dashboard" replace />} />
                  <Route path="dashboard" element={<ManagerDashboardPage />} />
                  <Route path="properties" element={<ManagedPropertiesPage />} />
                  <Route path="leasing" element={<LeaseDocumentsPage />} />
                  <Route path="maintenance" element={<MaintenanceDispatchPage />} />
                  <Route path="disputes" element={<Navigate to="/manager/dashboard" replace />} />
                  <Route path="settings" element={<AccountSettingsPage />} />
                </Route>

                {/* Maintenance Staff Workspace */}
                <Route path="/staff" element={<ProtectedRoute allowedRoles={['staff']} />}>
                  <Route index element={<Navigate to="/staff/dashboard" replace />} />
                  <Route path="dashboard" element={<StaffDashboardQueuePage />} />
                  <Route path="payments" element={<StaffTaskPaymentsPage />} />
                  <Route path="payouts" element={<Navigate to="/staff/payments" replace />} />
                  <Route path="ratings" element={<StaffRatingsPage />} />
                  <Route path="settings" element={<AccountSettingsPage />} />
                </Route>
              </Route>

              {/* Fallback Catch-All 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
              </Suspense>
            </CurrencyProvider>
          </AppDataProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

export default App;
