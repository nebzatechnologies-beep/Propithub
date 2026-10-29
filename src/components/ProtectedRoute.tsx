import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { Spinner } from './common/Spinner';
import { PropithubLogo } from './common/PropithubLogo';

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, role, isOwnerPlanActive, isLoading } = useAuth();
  const location = useLocation();

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
    const isSuperadminRoute = allowedRoles.includes('superadmin');
    return <Navigate to={isSuperadminRoute ? '/admin-login' : '/login'} replace />;
  }

  if (!allowedRoles.includes(role)) {
    // Strictly isolate user to their authorized role workspace
    const targetMap: Record<UserRole, string> = {
      superadmin: '/superadmin/overview',
      owner: '/owner/dashboard',
      tenant: '/tenant/dashboard',
      manager: '/manager/dashboard',
      staff: '/staff/dashboard',
    };
    return <Navigate to={targetMap[role] || '/owner/dashboard'} replace />;
  }

  // Superadmin 2-Step 6-Digit PIN check
  if (role === 'superadmin') {
    const isPinVerified = sessionStorage.getItem('propithub_admin_pin_verified') === 'true';
    if (!isPinVerified) {
      return <Navigate to="/admin-login" replace />;
    }
  }

  // Strict paywall for Owner: if subscription and trial have expired, block access to all /owner/* routes
  // except /owner/plan (to renew) and /owner/settings (to update contact info)
  const ownerPaywallAllowlist = ['/owner/plan', '/owner/settings'];
  if (role === 'owner' && !isOwnerPlanActive(user.id) && !ownerPaywallAllowlist.includes(location.pathname)) {
    return <Navigate to="/owner/plan" replace />;
  }

  // Strict paywall for Subordinate Roles (Property Manager & Staff):
  // If the parent owner's subscription has expired, suspend operational workspace access
  if ((role === 'manager' || role === 'staff') && user.ownerId && !isOwnerPlanActive(user.ownerId)) {
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
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '16px',
            padding: '36px 28px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ fontSize: '42px', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: 800 }}>
            Organization Subscription Inactive
          </h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px' }}>
            Access to this management workspace is currently paused because your portfolio owner’s Propithub subscription or free trial has expired.
            Please contact your organization administrator or property owner to renew the account.
          </p>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              localStorage.removeItem('keystone_active_user_id');
              localStorage.removeItem('keystone_active_user_role');
              window.location.href = '/login';
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
};
