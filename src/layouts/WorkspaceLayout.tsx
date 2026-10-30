import React, { useState, useRef, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useTheme } from '../context/ThemeContext';
import { NotificationBell } from '../components/NotificationBell';
import { PropithubIcon, PropithubLogo } from '../components/common/PropithubLogo';
import { getOwnerReminders, getTenantReminders, getManagerReminders, getStaffReminders, getSuperadminReminders } from '../lib/reminders';
import { InAppNotification } from '../types';
import { FreeTrialFloatingWidget } from '../components/common/FreeTrialFloatingWidget';
import { Spinner } from '../components/common/Spinner';
import { GlobalSearch } from '../components/common/GlobalSearch';
import { CurrencyConverterTrigger } from '../components/common/CurrencyConverterTrigger';
import {
  Building2,
  Users,
  Wrench,
  UserCheck,
  Home,
  LogOut,
  LayoutDashboard,
  FileText,
  CreditCard,
  Layers,
  Settings,
  AlertTriangle,
  Award,
  Sparkles,
  ClipboardList,
  MessageSquare,
  Megaphone,
  Radio,
  Sun,
  Moon,
  ChevronDown,
  Menu,
  X,
  HelpCircle,
} from 'lucide-react';
import { GameGuidedTour } from '../components/tour/GameGuidedTour';

export const WorkspaceLayout: React.FC = () => {
  const { role, user, logout, isLoading, cancelAccountDeletion } = useAuth();
  const { state, markNotificationRead } = useAppData();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const showCustomLogo = Boolean(
    !logoError &&
    state.landingConfig?.faviconUrl &&
    (state.landingConfig.faviconUrl.startsWith('data:image/') ||
     state.landingConfig.faviconUrl.startsWith('http://') ||
     state.landingConfig.faviconUrl.startsWith('https://'))
  );

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileOpen]);

  // 1. Scoped notifications for currently logged in user
  const myPersistedNotifications = useMemo(() => {
    if (!user?.id) return [];
    const userEmailLower = user.email?.toLowerCase();
    const userNameLower = (user.displayName || (user as any).name || '').toLowerCase();

    // Resolve matching tenant record IDs for this logged in account
    const matchedTenantIds = new Set<string>();

    (state.tenants || []).forEach((t) => {
      if (
        t.id === user.id ||
        (userEmailLower && t.email?.toLowerCase() === userEmailLower) ||
        (userNameLower && t.name.toLowerCase() === userNameLower)
      ) {
        matchedTenantIds.add(t.id);
      }
    });

    return (state.notifications || []).filter(
      (n) =>
        n.userId === user.id ||
        (userEmailLower && n.userId?.toLowerCase() === userEmailLower) ||
        (n.userId && matchedTenantIds.has(n.userId)) ||
        (!n.userId && role === 'superadmin') ||
        (n.userId === `role_${role}`) ||
        (role === 'tenant' && (n.userId === 'all_tenants' || n.userId === 'tenants')) ||
        (role === 'owner' && (n.userId === 'all_owners' || n.userId === 'owners'))
    );
  }, [state.notifications, state.tenants, user, role]);

  // 2. Real-time active reminders for owner/tenant/manager/staff
  const activeReminders = useMemo(() => {
    if (!user) return [];
    if (role === 'owner') return getOwnerReminders(state, user.id);
    if (role === 'tenant') return getTenantReminders(state, user);
    if (role === 'manager') return getManagerReminders(state, user);
    if (role === 'staff') return getStaffReminders(state, user);
    if (role === 'superadmin') return getSuperadminReminders(state, user);
    return [];
  }, [role, state, user]);

  // 3. Unify bell notifications with real-time reminder hub
  const combinedNotifications = useMemo(() => {
    const notifs: InAppNotification[] = [...myPersistedNotifications];

    activeReminders.forEach((rem) => {
      const alreadyPresent = notifs.some(
        (n) => n.id === rem.id || n.title === rem.title || (n.link && n.link === rem.actionLink)
      );
      if (!alreadyPresent) {
        // Use underlying event timestamp if available instead of viewing timestamp
        const eventTime =
          rem.metadata?.eventTime ||
          rem.metadata?.createdAt ||
          (rem.dueDate && new Date(rem.dueDate).getTime() <= Date.now() ? rem.dueDate : undefined) ||
          new Date().toISOString();

        notifs.push({
          id: rem.id,
          userId: user?.id || '',
          title: rem.title,
          body: rem.description,
          link: rem.actionLink,
          isRead: false,
          createdAt: eventTime,
          actionable: true,
        });
      }
    });

    return notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [myPersistedNotifications, activeReminders, user]);

  const handleMarkNotificationRead = (notifId: string) => {
    const fallback = combinedNotifications.find((n) => n.id === notifId);
    markNotificationRead(notifId, fallback ? { ...fallback, isRead: true } : undefined);
  };

  const getRoleShortName = (r: string | null) => {
    switch (r) {
      case 'superadmin':
        return 'Superadmin';
      case 'owner':
        return 'Property Owner';
      case 'tenant':
        return 'Tenant Resident';
      case 'manager':
        return 'Property Manager';
      case 'staff':
        return 'Staff Tech';
      default:
        return 'User';
    }
  };

  // Build navigation items based on role
  const renderNavLinks = () => {
    switch (role) {
      case 'superadmin':
        return (
          <>
            <div className="nav-group">
              <div className="nav-label">MAIN MENU</div>
              <NavLink to="/superadmin/overview" data-tour="superadmin-nav-overview" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <LayoutDashboard size={16} /> Overview
              </NavLink>
              <NavLink to="/superadmin/users" data-tour="superadmin-nav-users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Users size={16} /> Users Directory
              </NavLink>
              <NavLink to="/superadmin/plans" data-tour="superadmin-nav-plans" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Layers size={16} /> Subscription Plans
              </NavLink>
              <NavLink to="/superadmin/invoices" data-tour="superadmin-nav-invoices" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <FileText size={16} /> Platform Invoices
              </NavLink>
            </div>
            <div className="nav-group">
              <div className="nav-label">OPERATIONS & CMS</div>
              <NavLink to="/superadmin/messages" data-tour="superadmin-nav-broadcasts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Radio size={16} /> Broadcasts
              </NavLink>
              <NavLink to="/superadmin/connections" data-tour="superadmin-nav-gateways" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Settings size={16} /> Integrations & Gateways
              </NavLink>
              <NavLink to="/superadmin/landing-cms" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Sparkles size={16} /> Landing CMS
              </NavLink>
              <NavLink to="/superadmin/oversight" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <ClipboardList size={16} /> Oversight & Audit
              </NavLink>
            </div>
          </>
        );

      case 'owner':
        return (
          <>
            <div className="nav-group">
              <div className="nav-label">MAIN MENU</div>
              <NavLink to="/owner/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <LayoutDashboard size={16} /> Overview
              </NavLink>
              <NavLink to="/owner/properties" data-tour="owner-nav-properties" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Building2 size={16} /> Properties
              </NavLink>
              <NavLink to="/owner/tenants" data-tour="owner-nav-tenants" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Users size={16} /> Tenants
              </NavLink>
              <NavLink to="/owner/leasing" data-tour="owner-nav-leasing" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <FileText size={16} /> Leasing
              </NavLink>
              <NavLink to="/owner/vacates" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <ClipboardList size={16} /> Move-Outs
              </NavLink>
              <NavLink to="/owner/payments" data-tour="owner-nav-payments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <CreditCard size={16} /> Transactions
              </NavLink>
              <NavLink to="/owner/messages" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Megaphone size={16} /> Announcements
              </NavLink>
            </div>
            <div className="nav-group">
              <div className="nav-label">MANAGEMENT</div>
              <NavLink to="/owner/maintenance" data-tour="owner-nav-maintenance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Wrench size={16} /> Maintenance
              </NavLink>
              <NavLink to="/owner/team" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <UserCheck size={16} /> Staff & Team
              </NavLink>
              <NavLink to="/owner/helpdesk" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <HelpCircle size={16} /> Platform Helpdesk
              </NavLink>
              <NavLink to="/owner/plan" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Sparkles size={16} /> Subscription Plan
              </NavLink>
              <NavLink to="/owner/reviews" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Award size={16} /> Reviews & Ratings
              </NavLink>
            </div>
          </>
        );

      case 'tenant':
        return (
          <>
            <div className="nav-group">
              <div className="nav-label">MAIN MENU</div>
              <NavLink to="/tenant/dashboard" data-tour="tenant-nav-overview" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Home size={16} /> Overview
              </NavLink>
              <NavLink to="/tenant/lease" data-tour="tenant-nav-lease" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <FileText size={16} /> My Lease
              </NavLink>
              <NavLink to="/tenant/payments" data-tour="tenant-nav-payments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <CreditCard size={16} /> Transactions
              </NavLink>
            </div>
            <div className="nav-group">
              <div className="nav-label">SUPPORT</div>
              <NavLink to="/tenant/support" data-tour="tenant-nav-support" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Wrench size={16} /> Maintenance &amp; Tickets
              </NavLink>
              <NavLink to="/tenant/trust" data-tour="tenant-nav-trust" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Award size={16} /> Landlord Reviews
              </NavLink>
            </div>
          </>
        );

      case 'manager':
        return (
          <>
            <div className="nav-group">
              <div className="nav-label">MAIN MENU</div>
              <NavLink to="/manager/dashboard" data-tour="manager-nav-overview" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <LayoutDashboard size={16} /> Overview
              </NavLink>
              <NavLink to="/manager/properties" data-tour="manager-nav-properties" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Building2 size={16} /> Properties
              </NavLink>
              <NavLink to="/manager/leasing" data-tour="manager-nav-leasing" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <FileText size={16} /> Leases
              </NavLink>
              <NavLink to="/manager/maintenance" data-tour="manager-nav-maintenance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Wrench size={16} /> Repair Dispatch
              </NavLink>
            </div>
          </>
        );

      case 'staff':
        return (
          <>
            <div className="nav-group">
              <div className="nav-label">MAIN MENU</div>
              <NavLink to="/staff/dashboard" data-tour="staff-nav-overview" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Wrench size={16} /> Overview & Queue
              </NavLink>
              <NavLink to="/staff/payments" data-tour="staff-nav-payments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <CreditCard size={16} /> Task Fees
              </NavLink>
              <NavLink to="/staff/ratings" data-tour="staff-nav-ratings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Award size={16} /> Ratings
              </NavLink>
            </div>
          </>
        );
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--surface-base)',
          color: 'var(--ink)',
          gap: '16px',
        }}
      >
        <PropithubLogo size={36} showText={true} />
        <Spinner size="sm" variant="emerald" />
      </div>
    );
  }

  if (!user) {
    return <Outlet />;
  }

  return (
    <div className="shell">
      {/* Mobile Drawer Navigation (visible on mobile / tablet when toggled) */}
      {mobileNavOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileNavOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 'var(--topbar-height, 70px)', boxSizing: 'border-box', borderBottom: '1px solid var(--line)' }}>
              <div className="brand-mark" style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                {showCustomLogo ? (
                  <img
                    src={state.landingConfig.faviconUrl}
                    alt="Logo"
                    style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <PropithubIcon size={22} color="#10B981" />
                )}
                <span style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--ink)' }}>
                  {state.landingConfig?.brandName || 'Propit'}
                  <span style={{ color: 'var(--brand, #10B981)' }}>{state.landingConfig?.brandAccent || 'hub'}</span>
                </span>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close Navigation Menu"
                style={{ padding: '4px 8px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Role Badge */}
            <div style={{ margin: '12px 14px 4px' }}>
              <div
                style={{
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background:
                      role === 'superadmin'
                        ? 'var(--amber)'
                        : role === 'owner'
                          ? 'var(--teal-primary)'
                          : role === 'tenant'
                            ? 'var(--mint-ink)'
                            : '#6B7280',
                  }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--ink)',
                  }}
                >
                  {role === 'superadmin' && 'Superadmin Console'}
                  {role === 'owner' && 'Property Owner'}
                  {role === 'tenant' && 'Tenant Resident'}
                  {role === 'manager' && 'Property Manager'}
                  {role === 'staff' && 'Maintenance Staff'}
                </span>
              </div>
            </div>

            {/* Nav links (auto-closes drawer when clicked) */}
            <div className="nav" onClick={() => setMobileNavOpen(false)} style={{ flex: 1, overflowY: 'auto' }}>
              {renderNavLinks()}
            </div>

            {/* Bottom Actions inside drawer */}
            <div style={{ padding: '14px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="btn secondary small"
                onClick={toggleTheme}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}
              >
                {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
                <span>Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
              </button>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => {
                  setMobileNavOpen(false);
                  logout();
                  navigate('/');
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', color: 'var(--red)' }}
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consist Clean Sidebar */}
      <aside className="sidebar">
        <div className="brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <div className="brand-mark" style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            {showCustomLogo ? (
              <img
                src={state.landingConfig.faviconUrl}
                alt="Logo"
                style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                onError={() => setLogoError(true)}
              />
            ) : (
              <PropithubIcon size={24} color="#10B981" />
            )}
            <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--ink)' }}>
              {state.landingConfig?.brandName || 'Propit'}
              <span style={{ color: 'var(--brand, #10B981)' }}>{state.landingConfig?.brandAccent || 'hub'}</span>
            </span>
          </div>
        </div>

        {/* User Role Badge */}
        <div style={{ margin: '14px 14px 4px' }}>
          <div
            style={{
              background: 'var(--surface-sunken)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '7px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background:
                  role === 'superadmin'
                    ? 'var(--amber)'
                    : role === 'owner'
                      ? 'var(--teal-primary)'
                      : role === 'tenant'
                        ? 'var(--mint-ink)'
                        : '#6B7280',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--ink)',
              }}
            >
              {role === 'superadmin' && 'Superadmin Console'}
              {role === 'owner' && 'Property Owner'}
              {role === 'tenant' && 'Tenant Resident'}
              {role === 'manager' && 'Property Manager'}
              {role === 'staff' && 'Maintenance Staff'}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="nav">{renderNavLinks()}</div>
      </aside>

      {/* Main Workspace View */}
      <div className="main">
        {/* Clean Topbar */}
        <header className="topbar">
          <div className="topbar-search-cluster" style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 auto', minWidth: 0, marginRight: '10px' }}>
            <button
              type="button"
              className="mobile-nav-toggle"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open Navigation Menu"
            >
              <Menu size={20} />
            </button>
            <GlobalSearch />
          </div>

          <div className="topbar-actions-cluster" data-tour="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {/* Live Currency Converter Quick Trigger */}
            <CurrencyConverterTrigger variant="icon" className="currency-converter-topbar" />

            {/* Theme Toggle Button to the left of Notification */}
            <button
              type="button"
              className="bell-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle Theme"
              style={{
                cursor: 'pointer',
              }}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {/* Notification Bell */}
            <NotificationBell
              notifications={combinedNotifications}
              onMarkAsRead={handleMarkNotificationRead}
              onNavigate={(link) => navigate(link)}
            />

            {/* Profile Dropdown Window beside Notification */}
            <div className="profile-dropdown-wrapper" ref={profileRef}>
              <button
                type="button"
                className={`profile-trigger-btn ${profileOpen ? 'active' : ''}`}
                onClick={() => setProfileOpen((prev) => !prev)}
                aria-haspopup="true"
                aria-expanded={profileOpen}
              >
                <div className="profile-avatar-circle">
                  {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'U'}
                </div>
                <div className="profile-trigger-info">
                  <span className="profile-trigger-name">{user?.displayName || 'User'}</span>
                  <span className="profile-trigger-role">{getRoleShortName(role)}</span>
                </div>
                <ChevronDown
                  size={14}
                  className={`profile-trigger-chevron ${profileOpen ? 'open' : ''}`}
                />
              </button>

              {/* Profile Dropdown Window */}
              {profileOpen && (
                <div className="profile-dropdown-menu">
                  {/* User Profile Header Card */}
                  <div className="profile-dropdown-header">
                    <div className="profile-dropdown-avatar-lg">
                      {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'U'}
                    </div>
                    <div className="profile-dropdown-user-details">
                      <div className="profile-dropdown-name">{user?.displayName || 'Active User'}</div>
                      <div className="profile-dropdown-email">{user?.email || 'user@propithub.internal'}</div>
                      <span className="profile-dropdown-badge">{getRoleShortName(role)}</span>
                    </div>
                  </div>

                  <div className="profile-dropdown-divider" />

                  {/* Settings */}
                  <div className="profile-dropdown-section">
                    <button
                      type="button"
                      className="profile-dropdown-item"
                      onClick={() => {
                        setProfileOpen(false);
                        navigate(`/${role}/settings`);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Settings size={15} />
                        <span>Account Settings</span>
                      </div>
                    </button>
                  </div>

                  <div className="profile-dropdown-divider" />

                  {/* Logout Action (Moved here) */}
                  <div className="profile-dropdown-section">
                    <button
                      type="button"
                      className="profile-dropdown-item logout-item"
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                        navigate('/');
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <LogOut size={15} />
                        <span>Sign Out</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="content">
          {user?.deletionStatus === 'pending_deletion' && (
            <div
              style={{
                background: 'linear-gradient(90deg, #FEF3C7 0%, #FDE68A 100%)',
                border: '1px solid #F59E0B',
                borderRadius: '10px',
                padding: '14px 20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: '#F59E0B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={17} />
                </div>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#92400E' }}>
                    Account Scheduled for Permanent Deletion (72-Hour Cooling-Off Grace Period)
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#B45309', lineHeight: 1.4 }}>
                    Permanent purge scheduled for{' '}
                    <b>{user.scheduledPermanentDeletionAt ? new Date(user.scheduledPermanentDeletionAt).toLocaleString() : 'in 72 hours'}</b>
                    . You can cancel this request and restore full operational access at any time.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn primary small"
                onClick={async () => {
                  const res = await cancelAccountDeletion();
                  if (res.success) {
                    window.location.reload();
                  }
                }}
                style={{
                  backgroundColor: '#10B981',
                  borderColor: '#10B981',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  padding: '8px 16px',
                  whiteSpace: 'nowrap',
                }}
              >
                Cancel Deletion &amp; Restore
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      {/* Floating Free Trial Badge & Interceptor (visible on all owner views) */}
      {role === 'owner' && <FreeTrialFloatingWidget />}

      {/* Game-Style Interactive Guided Platform Tour */}
      <GameGuidedTour />
    </div>
  );
};
