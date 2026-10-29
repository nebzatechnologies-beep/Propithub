import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../context/AppDataContext';
import {
  User,
  Shield,
  Bell,
  Smartphone,
  Mail,
  Key,
  Save,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  AlertTriangle,
  Trash2,
  X,
  Clock,
  RotateCcw,
  Check,
} from 'lucide-react';
import { auth, isFirebaseConfigured } from '../../lib/firebase';
import { updatePassword as fbUpdatePassword } from 'firebase/auth';
import { ButtonProcessing } from '../../components/common/Spinner';

export const AccountSettingsPage: React.FC = () => {
  const {
    user,
    role,
    updateUserProfile,
    updateAdminEmail,
    checkDeletionEligibility,
    requestAccountDeletion,
    cancelAccountDeletion,
    logout,
  } = useAuth();
  const { showToast } = useAppData();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile');

  // Profile Form State
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Superadmin Email Change State
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminEmailPassword, setAdminEmailPassword] = useState('');
  const [showAdminEmailPassword, setShowAdminEmailPassword] = useState(false);
  const [isUpdatingAdminEmail, setIsUpdatingAdminEmail] = useState(false);
  const [adminEmailError, setAdminEmailError] = useState('');
  const [adminEmailSuccess, setAdminEmailSuccess] = useState('');

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Superadmin 6-Digit Master Security Code State
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [pinError, setPinError] = useState('');

  // Notification Preferences State
  const initialNotifs = user?.notificationPreferences || {
    emailInvoices: true,
    emailMaintenance: true,
    emailAnnouncements: true,
    inAppReminders: true,
    smsAlerts: false,
  };

  const [notifs, setNotifs] = useState(initialNotifs);
  const [isSavingNotifs, setIsSavingNotifs] = useState(false);

  // Account Deletion State
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [blockedReasons, setBlockedReasons] = useState<string[]>([]);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);
  const [isCancellingDeletion, setIsCancellingDeletion] = useState(false);

  // Keep state synced with user profile
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      const currentPhone = user.phone || '';
      setPhone(
        currentPhone === '+91 98000 11111' || currentPhone === '+91 98000 00000'
          ? ''
          : currentPhone
      );
      if (user.notificationPreferences) {
        setNotifs(user.notificationPreferences);
      }
    }
  }, [user]);

  // Handle Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      showToast('Full name cannot be empty.');
      return;
    }
    setIsSavingProfile(true);
    try {
      if (updateUserProfile) {
        await updateUserProfile({
          displayName: displayName.trim(),
          phone: phone.trim() || undefined,
        });
      }
      showToast('✓ Profile details updated successfully.');
    } catch (err: any) {
      showToast('Failed to update profile: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    // Check current password if stored
    if (user?.tempPassword && currentPassword !== user.tempPassword) {
      setPasswordError('Current password is incorrect.');
      showToast('Current password does not match your record.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      showToast('New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      showToast('New passwords do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      // 1. Update Firebase auth password if active
      if (isFirebaseConfigured && auth.currentUser) {
        try {
          await fbUpdatePassword(auth.currentUser, newPassword);
        } catch (fbErr: any) {
          console.warn('Firebase updatePassword note:', fbErr?.message);
        }
      }

      // 2. Update user profile tempPassword and persist
      if (updateUserProfile) {
        await updateUserProfile({ tempPassword: newPassword });
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('✓ Password updated successfully.');
    } catch (err: any) {
      showToast('Failed to update password: ' + (err?.message || 'Error'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Handle Superadmin 6-Digit PIN Change
  const handleUpdateAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');

    const savedPin =
      user?.adminSecurityPin ||
      localStorage.getItem('propithub_admin_security_pin') ||
      '123456';

    if (currentPin.trim() !== savedPin) {
      setPinError('Current security code is incorrect.');
      showToast('Current security code is incorrect.');
      return;
    }

    const cleanNewPin = newPin.trim();
    if (!/^\d{6}$/.test(cleanNewPin)) {
      setPinError('New security code must be exactly 6 numeric digits (0-9).');
      showToast('New security code must be exactly 6 numeric digits.');
      return;
    }

    if (cleanNewPin !== confirmPin.trim()) {
      setPinError('New security codes do not match.');
      showToast('New security codes do not match.');
      return;
    }

    setIsChangingPin(true);
    try {
      if (updateUserProfile) {
        await updateUserProfile({ adminSecurityPin: cleanNewPin });
      }
      localStorage.setItem('propithub_admin_security_pin', cleanNewPin);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      showToast('✓ 6-Digit master security code updated successfully.');
    } catch (err: any) {
      showToast('Failed to update security code: ' + (err?.message || 'Error'));
    } finally {
      setIsChangingPin(false);
    }
  };

  const handleUpdateAdminEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminEmailError('');
    setAdminEmailSuccess('');

    const clean = newAdminEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setAdminEmailError('Please enter a valid new administrator email address.');
      showToast('Please enter a valid new email address.');
      return;
    }
    if (clean === user?.email?.toLowerCase()) {
      setAdminEmailError('The new email address cannot be the same as your current email.');
      showToast('New email must be different from current email.');
      return;
    }
    if (!adminEmailPassword) {
      setAdminEmailError('Please enter your current administrator password to confirm.');
      showToast('Current password is required to change email.');
      return;
    }

    setIsUpdatingAdminEmail(true);
    try {
      const res = await updateAdminEmail(clean, adminEmailPassword);
      setIsUpdatingAdminEmail(false);
      if (res.success) {
        setAdminEmailSuccess(`Administrator email successfully changed to ${clean}.`);
        showToast('✓ Administrator email address updated successfully.');
        setNewAdminEmail('');
        setAdminEmailPassword('');
      } else {
        setAdminEmailError(res.error || 'Failed to update administrator email.');
        showToast(res.error || 'Failed to update email.');
      }
    } catch (err: any) {
      setIsUpdatingAdminEmail(false);
      const msg = err?.message || 'An unexpected error occurred while updating email.';
      setAdminEmailError(msg);
      showToast(msg);
    }
  };

  const handleInitiateDeletion = async () => {
    if (role === 'superadmin') {
      showToast('Superadmin platform console accounts cannot be deleted.');
      return;
    }
    setIsCheckingEligibility(true);
    try {
      const res = await checkDeletionEligibility();
      setIsCheckingEligibility(false);
      if (!res.canDelete) {
        setBlockedReasons(res.reasons);
        setShowBlockedModal(true);
      } else {
        setShowConfirmModal(true);
      }
    } catch (err: any) {
      setIsCheckingEligibility(false);
      showToast('Error checking deletion eligibility: ' + (err?.message || 'Network error'));
    }
  };

  const handleConfirmDeletion = async () => {
    setIsSubmittingDeletion(true);
    try {
      const res = await requestAccountDeletion();
      setIsSubmittingDeletion(false);
      setShowConfirmModal(false);
      if (res.success) {
        showToast('✓ Deletion scheduled in 72 hours. Signing out...');
        setTimeout(() => {
          logout();
          window.location.href = '/';
        }, 1500);
      } else {
        showToast(res.error || 'Failed to schedule deletion.');
      }
    } catch (err: any) {
      setIsSubmittingDeletion(false);
      showToast('Error: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleCancelDeletion = async () => {
    setIsCancellingDeletion(true);
    try {
      const res = await cancelAccountDeletion();
      setIsCancellingDeletion(false);
      if (res.success) {
        showToast('✓ Account deletion cancelled. Your account is fully restored.');
      } else {
        showToast(res.error || 'Failed to cancel deletion.');
      }
    } catch (err: any) {
      setIsCancellingDeletion(false);
      showToast('Error: ' + (err?.message || 'Unknown error'));
    }
  };

  // Handle Notifications Save
  const handleSaveNotifs = async () => {
    setIsSavingNotifs(true);
    try {
      if (updateUserProfile) {
        await updateUserProfile({ notificationPreferences: notifs });
      }
      if (user?.id) {
        localStorage.setItem(`propithub_notifs_${user.id}`, JSON.stringify(notifs));
      }
      showToast('✓ Notification preferences saved successfully.');
    } catch (err: any) {
      showToast('Failed to save notification preferences.');
    } finally {
      setIsSavingNotifs(false);
    }
  };

  // Resolve role title
  const getRoleLabel = () => {
    switch (role) {
      case 'superadmin':
        return 'Superadmin Platform Console';
      case 'owner':
        return 'Property Owner';
      case 'tenant':
        return 'Tenant Resident';
      case 'manager':
        return 'Property Manager';
      case 'staff':
        return 'Maintenance Technician';
      default:
        return 'Platform Member';
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {/* Page Title */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
          Account Settings
        </h1>
        <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px' }}>
          Manage your personal profile, security credentials, and communication alerts.
        </div>
      </div>

      {/* Settings Navigation Tabs — Only Profile Details, Security & Password, Notifications */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--line)',
          marginBottom: '24px',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'profile', label: 'Profile Details', icon: <User size={15} /> },
          { id: 'security', label: 'Security & Password', icon: <Shield size={15} /> },
          { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--teal-primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--teal-primary)' : 'var(--ink-soft)',
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: '13.5px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* =========================================================================
          TAB 1: PROFILE DETAILS
          ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="panel" style={{ padding: '28px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px' }}>
          {/* User Overview Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '18px',
              marginBottom: '26px',
              paddingBottom: '22px',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--teal-primary)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 800,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                flexShrink: 0,
              }}
            >
              {displayName ? displayName[0].toUpperCase() : 'U'}
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
                {displayName || user?.email?.split('@')[0] || 'User'}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                {user?.email}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--teal-primary)',
                    background: 'var(--teal-light)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {getRoleLabel()}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--teal-primary)',
                    background: 'var(--teal-light)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}
                >
                  <CheckCircle2 size={11} /> Verified Account
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--ink)' }}>
                <User size={14} color="var(--teal-primary)" /> Full Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your full legal name"
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface-sunken)',
                  color: 'var(--ink)',
                  fontSize: '13.5px',
                }}
              />
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--ink)' }}>
                <Mail size={14} color="var(--teal-primary)" /> Registered Email Address
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface-sunken)',
                  color: 'var(--ink-soft)',
                  fontSize: '13.5px',
                  cursor: 'not-allowed',
                }}
              />
              <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '4px', display: 'block' }}>
                {role === 'superadmin'
                  ? 'Administrator login email can be updated below with current password verification.'
                  : 'Primary sign-in email address cannot be changed directly. Contact administrator if update is needed.'}
              </span>
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--ink)' }}>
                <Smartphone size={14} color="var(--teal-primary)" /> Mobile Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  background: 'var(--surface-sunken)',
                  color: 'var(--ink)',
                  fontSize: '13.5px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="submit"
                className="btn primary"
                disabled={isSavingProfile}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 22px', borderRadius: '8px', fontWeight: 600 }}
              >
                <ButtonProcessing
                  loading={isSavingProfile}
                  loadingText="Saving Profile..."
                  defaultText="Save Profile Changes"
                  icon={<Save size={15} />}
                />
              </button>
            </div>
          </form>

          {/* Superadmin Primary Email Change Section */}
          {role === 'superadmin' && (
            <div
              style={{
                marginTop: '32px',
                paddingTop: '24px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={17} color="var(--teal-primary)" />
                  <h3 style={{ fontSize: '15.5px', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                    Change Administrator Email Address
                  </h3>
                  <span
                    style={{
                      background: 'var(--teal-light)',
                      color: 'var(--teal-primary)',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Root Admin
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px', maxWidth: '580px', lineHeight: 1.5 }}>
                  Update the primary sign-in email address used to log into the Propithub Platform Administrator portal. Requires your current password for security verification.
                </p>
              </div>

              {adminEmailError && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    background: 'var(--danger-soft)',
                    color: 'var(--danger)',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    marginBottom: '16px',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  <AlertCircle size={15} />
                  <span>{adminEmailError}</span>
                </div>
              )}

              {adminEmailSuccess && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    background: 'var(--teal-light)',
                    color: 'var(--teal-primary)',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    marginBottom: '16px',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                  }}
                >
                  <CheckCircle2 size={15} color="var(--teal-primary)" />
                  <span>{adminEmailSuccess}</span>
                </div>
              )}

              <form onSubmit={handleUpdateAdminEmail} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '480px' }}>
                <div className="field">
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--ink)' }}>
                    Current Admin Email
                  </label>
                  <input
                    type="text"
                    value={user?.email || ''}
                    disabled
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--surface-sunken)',
                      color: 'var(--ink-soft)',
                      fontSize: '13.5px',
                      cursor: 'not-allowed',
                    }}
                  />
                </div>

                <div className="field">
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--ink)' }}>
                    New Administrator Email Address
                  </label>
                  <input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => {
                      setNewAdminEmail(e.target.value);
                      if (adminEmailError) setAdminEmailError('');
                    }}
                    placeholder="e.g. newadmin@company.com"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--line)',
                      background: 'var(--surface-sunken)',
                      color: 'var(--ink)',
                      fontSize: '13.5px',
                    }}
                  />
                </div>

                <div className="field">
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--ink)' }}>
                    Current Administrator Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showAdminEmailPassword ? 'text' : 'password'}
                      value={adminEmailPassword}
                      onChange={(e) => {
                        setAdminEmailPassword(e.target.value);
                        if (adminEmailError) setAdminEmailError('');
                      }}
                      placeholder="Enter password to authenticate change"
                      required
                      style={{
                        width: '100%',
                        padding: '10px 40px 10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface-sunken)',
                        color: 'var(--ink)',
                        fontSize: '13.5px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminEmailPassword(!showAdminEmailPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--ink-soft)',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      {showAdminEmailPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '4px' }}>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={isUpdatingAdminEmail || !newAdminEmail || !adminEmailPassword}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '10px 22px',
                      borderRadius: '8px',
                      fontWeight: 600,
                    }}
                  >
                    <ButtonProcessing
                      loading={isUpdatingAdminEmail}
                      loadingText="Updating Admin Email..."
                      defaultText="Update Administrator Email"
                      icon={<Mail size={15} />}
                    />
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: SECURITY & PASSWORD
          ========================================================================= */}
      {activeTab === 'security' && (
        <div className="panel" style={{ padding: '28px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px' }}>
          <div style={{ marginBottom: '22px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={17} color="var(--teal-primary)" /> Password &amp; Account Security
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px' }}>
              Update your password to keep your property workspace, leases, and transactions secure.
            </p>
          </div>

          {passwordError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: 'var(--danger-soft)',
                color: 'var(--danger)',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '18px',
              }}
            >
              <AlertCircle size={16} />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '520px' }}>
            {/* Current Password (if account has a stored password) */}
            <div className="field">
              <label style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'block', color: 'var(--ink)' }}>
                Current Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface-sunken)',
                    color: 'var(--ink)',
                    fontSize: '13.5px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--ink-soft)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="field">
              <label style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'block', color: 'var(--ink)' }}>
                New Password (minimum 6 characters)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface-sunken)',
                    color: 'var(--ink)',
                    fontSize: '13.5px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--ink-soft)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="field">
              <label style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'block', color: 'var(--ink)' }}>
                Confirm New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface-sunken)',
                    color: 'var(--ink)',
                    fontSize: '13.5px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--ink-soft)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div style={{ marginTop: '10px' }}>
              <button
                type="submit"
                className="btn primary"
                disabled={isChangingPassword || !newPassword || !currentPassword}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 22px', borderRadius: '8px', fontWeight: 600 }}
              >
                <ButtonProcessing
                  loading={isChangingPassword}
                  loadingText="Updating Password..."
                  defaultText="Update Password"
                  icon={<Key size={15} />}
                />
              </button>
            </div>
          </form>

          {/* Superadmin 6-Digit Platform Access Code Section */}
          {role === 'superadmin' && (
            <div
              style={{
                marginTop: '32px',
                paddingTop: '24px',
                borderTop: '1px solid var(--line)',
              }}
            >
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={17} color="var(--teal-primary)" />
                  <h3 style={{ fontSize: '15.5px', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                    Admin 6-Digit Master Security Code
                  </h3>
                  <span
                    style={{
                      background: 'var(--teal-light)',
                      color: 'var(--teal-primary)',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    2-Step Verification
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px', maxWidth: '580px', lineHeight: 1.5 }}>
                  This 6-digit security code is required on the <b>/admin-login</b> portal as second-factor verification after entering your email and password. Default code is <b>123456</b>.
                </p>
              </div>

              {pinError && (
                <div
                  style={{
                    color: '#DC2626',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertCircle size={15} />
                  <span>{pinError}</span>
                </div>
              )}

              <form onSubmit={handleUpdateAdminPin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '440px' }}>
                {/* Current 6-Digit Code */}
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'block', color: 'var(--ink)' }}>
                    Current 6-Digit Code
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showCurrentPin ? 'text' : 'password'}
                      value={currentPin}
                      onChange={(e) => {
                        setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setPinError('');
                      }}
                      placeholder="Enter current 6-digit code (default: 123456)"
                      maxLength={6}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 40px 10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface-sunken)',
                        color: 'var(--ink)',
                        fontSize: '14px',
                        letterSpacing: showCurrentPin ? '4px' : '2px',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPin(!showCurrentPin)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--ink-soft)',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      {showCurrentPin ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* New 6-Digit Code */}
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'block', color: 'var(--ink)' }}>
                    New 6-Digit Code
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewPin ? 'text' : 'password'}
                      value={newPin}
                      onChange={(e) => {
                        setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setPinError('');
                      }}
                      placeholder="Enter new 6-digit numeric PIN"
                      maxLength={6}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 40px 10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface-sunken)',
                        color: 'var(--ink)',
                        fontSize: '14px',
                        letterSpacing: showNewPin ? '4px' : '2px',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPin(!showNewPin)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--ink-soft)',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      {showNewPin ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)', marginTop: '4px', display: 'block' }}>
                    Must be exactly 6 numeric digits (0-9).
                  </span>
                </div>

                {/* Confirm New 6-Digit Code */}
                <div className="field">
                  <label style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', display: 'block', color: 'var(--ink)' }}>
                    Confirm New 6-Digit Code
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPin ? 'text' : 'password'}
                      value={confirmPin}
                      onChange={(e) => {
                        setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setPinError('');
                      }}
                      placeholder="Re-enter new 6-digit code"
                      maxLength={6}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 40px 10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--line)',
                        background: 'var(--surface-sunken)',
                        color: 'var(--ink)',
                        fontSize: '14px',
                        letterSpacing: showConfirmPin ? '4px' : '2px',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPin(!showConfirmPin)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--ink-soft)',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      {showConfirmPin ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '8px' }}>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={isChangingPin || newPin.length !== 6 || !currentPin}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '10px 22px',
                      borderRadius: '8px',
                      fontWeight: 600,
                    }}
                  >
                    <ButtonProcessing
                      loading={isChangingPin}
                      loadingText="Updating Security Code..."
                      defaultText="Update 6-Digit Security Code"
                      icon={<Shield size={15} />}
                    />
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Danger Zone: Account Deletion & Recovery (Not applicable for Superadmin) */}
          {role !== 'superadmin' && (
            <div
              style={{
                marginTop: '32px',
                paddingTop: '24px',
                borderTop: '1px solid var(--line)',
              }}
            >
              {user?.deletionStatus === 'pending_deletion' ? (
                <div
                  style={{
                    padding: '20px',
                    borderRadius: '10px',
                    border: '1px solid #FCD34D',
                    background: 'rgba(245, 158, 11, 0.08)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <Clock size={18} color="#D97706" />
                      <span style={{ fontWeight: 700, fontSize: '14.5px', color: '#B45309' }}>
                        Account Scheduled for Permanent Deletion (72-Hour Grace Period)
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--ink-soft)', maxWidth: '560px', lineHeight: 1.5 }}>
                      Your account is scheduled to be permanently purged on{' '}
                      <b>
                        {user.scheduledPermanentDeletionAt
                          ? new Date(user.scheduledPermanentDeletionAt).toLocaleString()
                          : 'within 72 hours'}
                      </b>
                      . You can cancel this request right now and restore full access.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={handleCancelDeletion}
                    disabled={isCancellingDeletion}
                    style={{
                      backgroundColor: '#10B981',
                      borderColor: '#10B981',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '9px 18px',
                      fontWeight: 600,
                    }}
                  >
                    <RotateCcw size={14} />
                    <span>{isCancellingDeletion ? 'Restoring...' : 'Cancel Deletion & Restore'}</span>
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface-sunken)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <Trash2 size={15} color="#DC2626" />
                      <span style={{ fontWeight: 700, fontSize: '14px', color: '#DC2626' }}>
                        Delete Account
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                      Deletes your account after 3 days. Can be cancelled anytime.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleInitiateDeletion}
                    disabled={isCheckingEligibility}
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: '#DC2626',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Trash2 size={14} />
                    <span>{isCheckingEligibility ? 'Checking...' : 'Delete'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: NOTIFICATIONS
          ========================================================================= */}
      {activeTab === 'notifications' && (
        <div className="panel" style={{ padding: '28px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px' }}>
          <div style={{ marginBottom: '22px' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={17} color="var(--teal-primary)" /> Notification &amp; Alert Preferences
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '4px' }}>
              Configure which operational updates, billing notices, and alerts you receive across communication channels.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              {
                id: 'inAppReminders',
                title: 'In-App Reminders & Banner Notifications',
                desc: 'Instant notifications for rent dues, maintenance ticket milestones, and agreement signatures.',
                checked: notifs.inAppReminders,
                onChange: () => setNotifs((prev) => ({ ...prev, inAppReminders: !prev.inAppReminders })),
              },
              {
                id: 'emailInvoices',
                title: 'Email Delivery for Invoices & Payment Receipts',
                desc: 'Automatically dispatch PDF invoices, tax receipts, and payment settlements to your registered email.',
                checked: notifs.emailInvoices,
                onChange: () => setNotifs((prev) => ({ ...prev, emailInvoices: !prev.emailInvoices })),
              },
              {
                id: 'emailMaintenance',
                title: 'Maintenance Requests & Repair Work Orders',
                desc: 'Receive alerts when new work tickets are logged, assigned, or marked complete.',
                checked: notifs.emailMaintenance,
                onChange: () => setNotifs((prev) => ({ ...prev, emailMaintenance: !prev.emailMaintenance })),
              },
              {
                id: 'emailAnnouncements',
                title: 'Building Announcements & Policy Updates',
                desc: 'Stay informed about scheduled water/power maintenance, inspection schedules, and notices.',
                checked: notifs.emailAnnouncements,
                onChange: () => setNotifs((prev) => ({ ...prev, emailAnnouncements: !prev.emailAnnouncements })),
              },
              {
                id: 'smsAlerts',
                title: 'SMS Urgent Security & Late Payment Alerts',
                desc: 'Direct mobile SMS alerts for critical overdue notices and time-sensitive security items.',
                checked: notifs.smsAlerts,
                onChange: () => setNotifs((prev) => ({ ...prev, smsAlerts: !prev.smsAlerts })),
              },
            ].map((item) => (
              <div
                key={item.id}
                onClick={item.onChange}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px 18px',
                  background: 'var(--surface-sunken)',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ paddingRight: '16px' }}>
                  <b style={{ color: 'var(--ink)', fontSize: '13.5px' }}>{item.title}</b>
                  <p style={{ fontSize: '12px', color: 'var(--ink-soft)', margin: '2px 0 0', lineHeight: 1.4 }}>
                    {item.desc}
                  </p>
                </div>
                <div
                  style={{
                    width: '42px',
                    height: '24px',
                    borderRadius: '12px',
                    background: item.checked ? 'var(--teal-primary)' : 'var(--line-strong)',
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'background 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#FFFFFF',
                      position: 'absolute',
                      top: '3px',
                      left: item.checked ? '21px' : '3px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button
              type="button"
              className="btn primary"
              onClick={handleSaveNotifs}
              disabled={isSavingNotifs}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 22px', borderRadius: '8px', fontWeight: 600 }}
            >
              <ButtonProcessing
                loading={isSavingNotifs}
                loadingText="Saving Preferences..."
                defaultText="Save Notification Preferences"
                icon={<Save size={15} />}
              />
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: Account Deletion Blocked Modal */}
      {showBlockedModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: '#FEE2E2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AlertCircle size={20} color="#DC2626" />
                </div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>
                  Account Deletion Blocked
                </h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowBlockedModal(false)}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: '16px' }}>
              Please resolve the following first:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px', maxHeight: '200px', overflowY: 'auto' }}>
              {blockedReasons.map((reason, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid #FECACA',
                    fontSize: '12.5px',
                    color: '#991B1B',
                    lineHeight: 1.4,
                  }}
                >
                  • {reason}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowBlockedModal(false)}
                style={{ padding: '7px 18px', fontWeight: 600, fontSize: '13px' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Confirm Account Deletion Modal (72-hour grace period) */}
      {showConfirmModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: '#FEE2E2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Trash2 size={20} color="#DC2626" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>
                    Schedule Account Deletion?
                  </h3>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#D97706' }}>
                    ⏳ 72-HOUR COOLING-OFF WINDOW
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowConfirmModal(false)}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5, margin: '0 0 20px' }}>
              Your account will be deleted in 3 days. You can log in anytime to cancel.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmittingDeletion}
                style={{ padding: '8px 16px', fontWeight: 600, fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleConfirmDeletion}
                disabled={isSubmittingDeletion}
                style={{
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                {isSubmittingDeletion ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountSettingsPage;
