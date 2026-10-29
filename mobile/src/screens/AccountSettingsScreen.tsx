import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  Switch,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { PropithubLogo, PropithubIcon } from '../components/PropithubLogo';
import { UserRole } from '../types';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileCurrency } from '../context/MobileCurrencyContext';
import { useMobileTheme } from '../context/MobileThemeContext';

interface AccountSettingsProps {
  currentRole?: UserRole;
  onBack?: () => void;
  onSignOut?: () => void;
}

const CURRENCY_OPTIONS = [
  { code: 'USD', symbol: '$', flag: '🇺🇸', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', flag: '🇪🇺', name: 'Euro' },
  { code: 'GBP', symbol: '£', flag: '🇬🇧', name: 'British Pound' },
  { code: 'INR', symbol: '₹', flag: '🇮🇳', name: 'Indian Rupee' },
  { code: 'AED', symbol: 'AED', flag: '🇦🇪', name: 'UAE Dirham' },
  { code: 'CAD', symbol: '$', flag: '🇨🇦', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: '$', flag: '🇦🇺', name: 'Australian Dollar' },
  { code: 'SGD', symbol: '$', flag: '🇸🇬', name: 'Singapore Dollar' },
];

export const AccountSettingsScreen: React.FC<AccountSettingsProps> = ({
  currentRole = 'owner',
  onBack,
  onSignOut,
}) => {
  const { user, updateUserProfile, logout, checkDeletionEligibility, requestAccountDeletion } = useMobileAuth();
  const { viewCurrency, setViewCurrency } = useMobileCurrency();
  const { themeMode, setThemeMode, isDark, colors } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile');

  // Account Deletion state
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [blockedReasons, setBlockedReasons] = useState<string[]>([]);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);

  // Security state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Notification preferences (Exact 1-to-1 match with web AccountSettingsPage.tsx)
  const [emailInvoices, setEmailInvoices] = useState(user.notificationPreferences?.emailInvoices ?? true);
  const [emailMaintenance, setEmailMaintenance] = useState(user.notificationPreferences?.emailMaintenance ?? true);
  const [emailAnnouncements, setEmailAnnouncements] = useState(user.notificationPreferences?.emailAnnouncements ?? true);
  const [inAppReminders, setInAppReminders] = useState(user.notificationPreferences?.inAppReminders ?? true);
  const [smsAlerts, setSmsAlerts] = useState(user.notificationPreferences?.smsAlerts ?? false);

  // Owner Automated Rental Reminders configuration
  const { state, saveOwnerSettings } = useMobileAppData();
  const isOwner = currentRole === 'owner' || user?.role === 'owner';
  const ownerSettingsObj = user?.id ? state?.ownerSettings?.[user.id] : undefined;

  const [ownerReminderDays, setOwnerReminderDays] = useState<number>(
    ownerSettingsObj?.rentReminderDaysPrior ?? ownerSettingsObj?.rentalReminderConfig?.daysPrior ?? 10
  );
  const [ownerReminderEnabled, setOwnerReminderEnabled] = useState<boolean>(
    ownerSettingsObj?.rentalReminderConfig?.enabled ?? true
  );
  const [customDaysStr, setCustomDaysStr] = useState<string>(
    String(ownerSettingsObj?.rentReminderDaysPrior ?? ownerSettingsObj?.rentalReminderConfig?.daysPrior ?? 10)
  );

  const handleSaveNotifications = async () => {
    updateUserProfile({
      notificationPreferences: {
        emailInvoices,
        emailMaintenance,
        emailAnnouncements,
        inAppReminders,
        smsAlerts,
      },
    });

    if (isOwner && user?.id && saveOwnerSettings) {
      try {
        const curSettings = state?.ownerSettings?.[user.id] || {
          ownerId: user.id,
          planId: 'growth',
          planName: 'Growth',
          planStatus: 'active',
          trialEndsAt: null,
          subscriptionEndsAt: null,
        };
        const parsed = parseInt(customDaysStr, 10) || ownerReminderDays || 10;
        await saveOwnerSettings(user.id, {
          ...curSettings,
          rentReminderDaysPrior: parsed,
          rentalReminderConfig: {
            enabled: ownerReminderEnabled,
            daysPrior: parsed,
          },
          lateFeeConfig: {
            ...(curSettings.lateFeeConfig || {
              graceDays: 5,
              type: 'percent',
              value: 5,
              cap: 2500,
            }),
            reminderDaysPrior: parsed,
            reminderEnabled: ownerReminderEnabled,
          },
        });
      } catch (err) {
        console.warn('Failed to save owner reminder lead time:', err);
      }
    }

    Alert.alert('Preferences Saved ✓', 'Your notification alert settings and rental reminder policy have been successfully updated.');
  };

  const handleInitiateDeletion = async () => {
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
      Alert.alert('Error', 'Unable to check deletion eligibility: ' + (err?.message || 'Network error'));
    }
  };

  const handleConfirmDeletion = async () => {
    setIsSubmittingDeletion(true);
    try {
      const res = await requestAccountDeletion();
      setIsSubmittingDeletion(false);
      setShowConfirmModal(false);
      if (res.success) {
        Alert.alert(
          'Deletion Scheduled ⏳',
          'Your account has been scheduled for permanent deletion in 72 hours (3 days). If you change your mind, simply log back into the app before then to restore your account. You will now be logged out.',
          [
            {
              text: 'Sign Out Now',
              onPress: () => {
                if (onSignOut) onSignOut();
                else logout();
              },
            },
          ],
          { cancelable: false }
        );
      } else {
        Alert.alert('Request Failed', res.error || 'Failed to submit account deletion request.');
      }
    } catch (err: any) {
      setIsSubmittingDeletion(false);
      Alert.alert('Error', err?.message || 'An unexpected error occurred.');
    }
  };

  const handleSaveProfile = () => {
    if (!displayName.trim()) {
      Alert.alert('Validation Error', 'Full name cannot be empty.');
      return;
    }
    updateUserProfile({
      displayName: displayName.trim(),
      phone: phone.trim(),
    });
    Alert.alert('Profile Updated', 'Your profile details have been saved successfully.');
  };

  const handleChangePassword = () => {
    if (!currentPassword) {
      Alert.alert('Validation Error', 'Please enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Validation Error', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'New password and confirmation do not match.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    Alert.alert('Password Changed', 'Your security password has been updated successfully.');
  };

  const handleSignOut = async () => {
    if (onSignOut) {
      onSignOut();
    } else {
      await logout();
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />

      {/* Real Screen Status Bar */}
      <ScreenStatusBar color={colors.ink} backgroundColor={colors.surface} />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              style={{ marginRight: 10, padding: 4 }}
              activeOpacity={0.7}
            >
              <Feather name="arrow-left" size={20} color={colors.ink} />
            </TouchableOpacity>
          )}
          <View style={styles.logoBadge}>
            <Feather name="settings" size={18} color="#FFFFFF" />
          </View>
        </View>
        <TouchableOpacity
          onPress={onSignOut || logout}
          style={[styles.signOutBtn, isDark && { backgroundColor: 'rgba(239, 68, 68, 0.18)' }]}
          activeOpacity={0.8}
        >
          <Feather name="log-out" size={15} color="#DC2626" style={{ marginRight: 4 }} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={[styles.scroll, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* User Identity Banner */}
        <View style={[styles.identityRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={[styles.avatar, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.18)', borderColor: 'rgba(16, 185, 129, 0.35)' }]}>
            <Text style={[styles.avatarText, isDark && { color: '#34D399' }]}>
              {user.displayName
                ? user.displayName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()
                : 'U'}
            </Text>
          </View>
          <View style={styles.identityInfo}>
            <Text style={[styles.userName, { color: colors.ink }]}>{user.displayName || 'User Profile'}</Text>
            <Text style={[styles.userSub, { color: colors.inkSoft }]}>{user.email || 'user@propithub.com'}</Text>
          </View>
          <View
            style={[
              styles.roleBadge,
              {
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.14)' : '#ECFDF5',
                borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
                borderWidth: 1,
              },
            ]}
          >
            <Text style={[styles.roleBadgeText, { color: isDark ? '#34D399' : '#047857' }]}>
              {currentRole.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* 3-Tab Capsule Bar */}
        <View style={[styles.tabContainer, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, borderWidth: 1 }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'profile' && [styles.tabButtonActive, { backgroundColor: colors.surface }]]}
            onPress={() => setActiveTab('profile')}
            activeOpacity={0.8}
          >
            <Feather
              name="user"
              size={13}
              color={activeTab === 'profile' ? (isDark ? '#F1F5F9' : '#0F172A') : colors.inkSoft}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabText, { color: colors.inkSoft }, activeTab === 'profile' && [styles.tabTextActive, { color: colors.ink }]]}>
              Profile
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'security' && [styles.tabButtonActive, { backgroundColor: colors.surface }]]}
            onPress={() => setActiveTab('security')}
            activeOpacity={0.8}
          >
            <Feather
              name="shield"
              size={13}
              color={activeTab === 'security' ? (isDark ? '#F1F5F9' : '#0F172A') : colors.inkSoft}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabText, { color: colors.inkSoft }, activeTab === 'security' && [styles.tabTextActive, { color: colors.ink }]]}>
              Security
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'notifications' && [styles.tabButtonActive, { backgroundColor: colors.surface }]]}
            onPress={() => setActiveTab('notifications')}
            activeOpacity={0.8}
          >
            <Feather
              name="bell"
              size={13}
              color={activeTab === 'notifications' ? (isDark ? '#F1F5F9' : '#0F172A') : colors.inkSoft}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabText, { color: colors.inkSoft }, activeTab === 'notifications' && [styles.tabTextActive, { color: colors.ink }]]}>
              Alerts
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: PROFILE */}
        {activeTab === 'profile' && (
          <>
            {/* App Appearance Card (Paytm / Swiggy 3-Option Segmented Control) */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#EFF6FF',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name={isDark ? 'moon' : 'sun'} size={18} color={isDark ? '#38BDF8' : '#2563EB'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.ink, marginBottom: 0 }]}>Theme</Text>
                  </View>
                </View>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 12,
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ECFDF5',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
                  }}
                >
                  <Text style={{ fontSize: 9.5, fontWeight: '800', color: isDark ? '#34D399' : '#059669', letterSpacing: 0.5 }}>
                    {isDark ? '🌙 NIGHT ACTIVE' : '☀️ LIGHT ACTIVE'}
                  </Text>
                </View>
              </View>

              {/* 3-Option Segmented Pill Control */}
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: 12,
                  padding: 4,
                  marginTop: 14,
                  gap: 6,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                {[
                  {
                    mode: 'system' as const,
                    label: 'System',
                    icon: 'smartphone' as const,
                  },
                  {
                    mode: 'light' as const,
                    label: 'Light',
                    icon: 'sun' as const,
                  },
                  {
                    mode: 'dark' as const,
                    label: 'Dark',
                    icon: 'moon' as const,
                  },
                ].map((opt) => {
                  const isSelected = themeMode === opt.mode;
                  return (
                    <TouchableOpacity
                      key={opt.mode}
                      onPress={() => setThemeMode(opt.mode)}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 10,
                        paddingHorizontal: 6,
                        borderRadius: 9,
                        backgroundColor: isSelected ? (isDark ? '#1E293B' : '#FFFFFF') : 'transparent',
                        borderWidth: 1,
                        borderColor: isSelected ? (isDark ? '#334155' : '#E2E8F0') : 'transparent',
                        shadowColor: isSelected ? '#000000' : 'transparent',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isSelected ? 0.08 : 0,
                        shadowRadius: 2,
                        elevation: isSelected ? 1 : 0,
                      }}
                      activeOpacity={0.8}
                    >
                      <Feather
                        name={opt.icon}
                        size={14}
                        color={isSelected ? '#10B981' : colors.inkSoft}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: isSelected ? '700' : '500',
                          color: isSelected ? (isDark ? '#F1F5F9' : '#0F172A') : colors.inkSoft,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Dynamic Status Note */}
              <View
                style={{
                  marginTop: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: isDark ? 'rgba(30, 41, 59, 0.6)' : '#F8FAFC',
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.lineLight,
                  gap: 8,
                }}
              >
                <Feather name="info" size={13} color={colors.inkSoft} />
                <Text style={{ fontSize: 11, color: colors.inkSoft, flex: 1, lineHeight: 16 }}>
                  {themeMode === 'system'
                    ? `System mode active. Auto-syncs with phone settings (${isDark ? 'device dark mode active' : 'device light mode active'}).`
                    : themeMode === 'dark'
                      ? 'Night mode forced. Charcoal slate styling eliminates glare and optimizes OLED battery.'
                      : 'Light mode forced. High clarity daylight contrast across all views and ledgers.'}
                </Text>
              </View>
            </View>

            {/* Profile Information Card */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>Profile Information</Text>

              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Full Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, color: colors.ink }]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="e.g. Full Name"
                placeholderTextColor={colors.inkSoft}
              />

              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Email Address (Read-only)</Text>
              <View style={[styles.input, styles.readOnlyInput, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
                <Text style={[styles.readOnlyText, { color: colors.inkSoft }]}>{user.email}</Text>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Phone Number</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSunken, borderColor: colors.line, color: colors.ink }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 555 019 2834"
                placeholderTextColor={colors.inkSoft}
                keyboardType="phone-pad"
              />

              {/* Preferred Display Currency */}
              <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Display Currency</Text>
              
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: isCurrencyDropdownOpen ? '#10B981' : colors.line,
                  backgroundColor: colors.surfaceSunken,
                  marginBottom: isCurrencyDropdownOpen ? 6 : 16,
                }}
                onPress={() => setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)}
                activeOpacity={0.8}
              >
                {(() => {
                  const sel = CURRENCY_OPTIONS.find((c) => c.code === viewCurrency) || CURRENCY_OPTIONS[0];
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 17 }}>{sel.flag}</Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.ink }}>
                        {sel.code} ({sel.symbol}) • {sel.name}
                      </Text>
                    </View>
                  );
                })()}
                <Feather
                  name={isCurrencyDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={isCurrencyDropdownOpen ? '#10B981' : colors.inkSoft}
                />
              </TouchableOpacity>

              {isCurrencyDropdownOpen && (
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 8,
                    marginBottom: 16,
                    overflow: 'hidden',
                  }}
                >
                  {CURRENCY_OPTIONS.map((c, index) => {
                    const isSelected = viewCurrency === c.code;
                    const isLast = index === CURRENCY_OPTIONS.length - 1;
                    return (
                      <TouchableOpacity
                        key={c.code}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderBottomWidth: isLast ? 0 : 1,
                          borderBottomColor: colors.lineLight,
                          backgroundColor: isSelected
                            ? isDark
                              ? 'rgba(16, 185, 129, 0.12)'
                              : '#F0FDF4'
                            : colors.surface,
                        }}
                        onPress={() => {
                          setViewCurrency(c.code);
                          setIsCurrencyDropdownOpen(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Text style={{ fontSize: 17 }}>{c.flag}</Text>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: isSelected ? '700' : '500',
                              color: isSelected ? (isDark ? '#34D399' : '#059669') : colors.ink,
                            }}
                          >
                            {c.code} ({c.symbol}) • {c.name}
                          </Text>
                        </View>
                        {isSelected && (
                          <Feather name="check" size={16} color={isDark ? '#34D399' : '#059669'} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} activeOpacity={0.85}>
                <Feather name="check" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.saveBtnText}>Save Profile Changes</Text>
              </TouchableOpacity>

              {/* Account Session & Sign Out Card */}
              <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.lineLight }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.inkSoft, marginBottom: 12 }}>
                  Account Actions
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: colors.surfaceSunken,
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderRadius: 8,
                      paddingVertical: 11,
                      paddingHorizontal: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                    }}
                    onPress={handleSignOut}
                    activeOpacity={0.85}
                  >
                    <Feather name="log-out" size={14} color={colors.inkSoft} style={{ marginRight: 6 }} />
                    <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                      Log Out
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FECACA',
                      borderRadius: 8,
                      paddingVertical: 11,
                      paddingHorizontal: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                    }}
                    onPress={handleInitiateDeletion}
                    disabled={isCheckingEligibility}
                    activeOpacity={0.85}
                  >
                    {isCheckingEligibility ? (
                      <ActivityIndicator size="small" color="#DC2626" />
                    ) : (
                      <>
                        <Feather name="trash-2" size={14} color="#DC2626" style={{ marginRight: 6 }} />
                        <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                          Delete
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </>
        )}

        {/* TAB 2: SECURITY */}
        {activeTab === 'security' && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Change Account Password</Text>

            <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Current Password</Text>
            <View style={[styles.passwordRow, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
              <TextInput
                style={[styles.passwordInput, { color: colors.ink }]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current password"
                placeholderTextColor={colors.inkSoft}
                secureTextEntry={!showCurrent}
              />
              <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeBtn}>
                <Feather name={showCurrent ? 'eye-off' : 'eye'} size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>New Password</Text>
            <View style={[styles.passwordRow, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
              <TextInput
                style={[styles.passwordInput, { color: colors.ink }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Minimum 6 characters"
                placeholderTextColor={colors.inkSoft}
                secureTextEntry={!showNew}
              />
              <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eyeBtn}>
                <Feather name={showNew ? 'eye-off' : 'eye'} size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.inkSoft }]}>Confirm New Password</Text>
            <View style={[styles.passwordRow, { backgroundColor: colors.surfaceSunken, borderColor: colors.line }]}>
              <TextInput
                style={[styles.passwordInput, { color: colors.ink }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-type new password"
                placeholderTextColor={colors.inkSoft}
                secureTextEntry={!showConfirm}
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                <Feather name={showConfirm ? 'eye-off' : 'eye'} size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleChangePassword} activeOpacity={0.85}>
              <Feather name="lock" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>Update Password</Text>
            </TouchableOpacity>

            {/* Delete Account */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                  marginTop: 16,
                  marginBottom: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 14,
                },
              ]}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.ink }}>
                  Delete Account
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.inkSoft, marginTop: 2 }}>
                  Deletes after 3 days. Can be cancelled anytime.
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={handleInitiateDeletion}
                disabled={isCheckingEligibility}
                activeOpacity={0.85}
              >
                {isCheckingEligibility ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 12.5 }}>
                    Delete
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TAB 3: NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Notification Channels</Text>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.toggleTitle, { color: colors.ink }]}>Email Invoices & Receipts</Text>
                <Text style={[styles.toggleSub, { color: colors.inkSoft }]}>Receive automated PDF receipts and invoices</Text>
              </View>
              <Switch
                value={emailInvoices}
                onValueChange={setEmailInvoices}
                trackColor={{ false: colors.line, true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.toggleDivider, { backgroundColor: colors.lineLight }]} />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.toggleTitle, { color: colors.ink }]}>Maintenance Alerts</Text>
                <Text style={[styles.toggleSub, { color: colors.inkSoft }]}>Real-time updates on ticket dispatch & resolution</Text>
              </View>
              <Switch
                value={emailMaintenance}
                onValueChange={setEmailMaintenance}
                trackColor={{ false: colors.line, true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.toggleDivider, { backgroundColor: colors.lineLight }]} />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.toggleTitle, { color: colors.ink }]}>Building Announcements</Text>
                <Text style={[styles.toggleSub, { color: colors.inkSoft }]}>Receive official notices and emergency broadcasts</Text>
              </View>
              <Switch
                value={emailAnnouncements}
                onValueChange={setEmailAnnouncements}
                trackColor={{ false: colors.line, true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.toggleDivider, { backgroundColor: colors.lineLight }]} />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.toggleTitle, { color: colors.ink }]}>In-App Reminders</Text>
                <Text style={[styles.toggleSub, { color: colors.inkSoft }]}>Display badge counts and dashboard notifications</Text>
              </View>
              <Switch
                value={inAppReminders}
                onValueChange={setInAppReminders}
                trackColor={{ false: colors.line, true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.toggleDivider, { backgroundColor: colors.lineLight }]} />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.toggleTitle, { color: colors.ink }]}>Urgent SMS Alerts</Text>
                <Text style={[styles.toggleSub, { color: colors.inkSoft }]}>Critical rent overdue notices and security broadcasts</Text>
              </View>
              <Switch
                value={smsAlerts}
                onValueChange={setSmsAlerts}
                trackColor={{ false: colors.line, true: '#10B981' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Owner Automated Rental Reminders Policy */}
            {isOwner && (
              <View
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTopWidth: 1,
                  borderTopColor: colors.lineLight,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#DCFCE7',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                    }}
                  >
                    <Feather name="clock" size={16} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.ink, marginBottom: 2, fontSize: 14 }]}>
                      Automated Rental Reminders
                    </Text>
                    <Text style={{ fontSize: 11.5, color: colors.inkSoft }}>
                      Proactive rent due notices and device push alerts sent to tenants
                    </Text>
                  </View>
                </View>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={[styles.toggleTitle, { color: colors.ink }]}>Enable Automated Reminders</Text>
                    <Text style={[styles.toggleSub, { color: colors.inkSoft }]}>
                      Alert tenants before invoice due dates with instant 1-click checkout links
                    </Text>
                  </View>
                  <Switch
                    value={ownerReminderEnabled}
                    onValueChange={setOwnerReminderEnabled}
                    trackColor={{ false: colors.line, true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {ownerReminderEnabled && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={[styles.fieldLabel, { color: colors.inkSoft, marginBottom: 8 }]}>
                      Reminder Lead-Time Window (Days Prior to Due Date)
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                      {[14, 10, 7, 5, 3].map((days) => {
                        const isSel = (parseInt(customDaysStr, 10) || ownerReminderDays) === days;
                        return (
                          <TouchableOpacity
                            key={days}
                            style={{
                              flex: 1,
                              paddingVertical: 9,
                              borderRadius: 8,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 1,
                              backgroundColor: isSel
                                ? isDark
                                  ? 'rgba(16, 185, 129, 0.2)'
                                  : '#ECFDF5'
                                : colors.surfaceSunken,
                              borderColor: isSel ? '#10B981' : colors.line,
                            }}
                            onPress={() => {
                              setOwnerReminderDays(days);
                              setCustomDaysStr(String(days));
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: isSel ? '700' : '500',
                                color: isSel ? (isDark ? '#34D399' : '#059669') : colors.ink,
                              }}
                            >
                              {days}d
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Custom days input */}
                    <Text style={[styles.fieldLabel, { color: colors.inkSoft, marginBottom: 4 }]}>
                      Custom Lead-Time (Days)
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.surfaceSunken,
                          borderColor: colors.line,
                          color: colors.ink,
                          marginBottom: 10,
                        },
                      ]}
                      value={customDaysStr}
                      onChangeText={(val) => {
                        const clean = val.replace(/[^0-9]/g, '');
                        setCustomDaysStr(clean);
                        if (clean) setOwnerReminderDays(parseInt(clean, 10));
                      }}
                      keyboardType="numeric"
                      placeholder="e.g. 10"
                      placeholderTextColor={colors.inkSoft}
                    />

                    {/* Active summary preview note */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#BBF7D0',
                        gap: 8,
                      }}
                    >
                      <Feather name="bell" size={14} color="#059669" />
                      <Text style={{ fontSize: 11.5, color: isDark ? '#A7F3D0' : '#065F46', flex: 1, lineHeight: 16 }}>
                        Active Policy: Tenants will see countdown reminders and receive native 9:00 AM OS notifications {parseInt(customDaysStr, 10) || ownerReminderDays || 10} days before rent is due.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveNotifications}
              activeOpacity={0.85}
            >
              <Feather name="check" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>Save Notification Preferences</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer */}
        <Text style={[styles.versionFooter, { color: colors.inkSoft }]}>Propithub Mobile v2.4.0 • Built with Expo & React Native</Text>
      </ScrollView>

      {/* MODAL 1: Account Deletion Blocked Modal */}
      <Modal visible={showBlockedModal} transparent animationType="fade" onRequestClose={() => setShowBlockedModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.line, maxWidth: 360, padding: 20 }]}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                }}
              >
                <Feather name="alert-circle" size={20} color="#DC2626" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.ink, fontSize: 16 }]}>Cannot Delete Account</Text>
              <Text style={[styles.modalSub, { color: colors.inkSoft, textAlign: 'center', fontSize: 12, marginTop: 4 }]}>
                Please resolve the following first:
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 180, marginBottom: 14 }}>
              {blockedReasons.map((reason, idx) => (
                <View
                  key={idx}
                  style={{
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FECACA',
                    padding: 8,
                    borderRadius: 6,
                    marginBottom: 6,
                  }}
                >
                  <Text style={{ fontSize: 12, color: isDark ? '#FCA5A5' : '#991B1B', lineHeight: 16 }}>
                    • {reason}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={{
                width: '100%',
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: colors.surfaceSunken,
                borderWidth: 1,
                borderColor: colors.line,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={() => setShowBlockedModal(false)}
            >
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13 }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Confirm Deletion Modal with 72-hour grace period */}
      <Modal visible={showConfirmModal} transparent animationType="fade" onRequestClose={() => setShowConfirmModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.line, maxWidth: 340, padding: 20 }]}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                }}
              >
                <Feather name="trash-2" size={20} color="#DC2626" />
              </View>
              <Text style={[styles.modalTitle, { color: colors.ink, fontSize: 16 }]}>Delete Account?</Text>
              <Text style={[styles.modalSub, { color: colors.inkSoft, textAlign: 'center', fontSize: 12.5, marginTop: 4, lineHeight: 18 }]}>
                Your account will be deleted in 3 days. You can log in anytime to cancel.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.surfaceSunken,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => setShowConfirmModal(false)}
                disabled={isSubmittingDeletion}
              >
                <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#DC2626',
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={handleConfirmDeletion}
                disabled={isSubmittingDeletion}
                activeOpacity={0.85}
              >
                {isSubmittingDeletion ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                    Delete
                  </Text>
                )}
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 0,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginLeft: 4,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  avatarText: {
    color: '#059669',
    fontWeight: '700',
    fontSize: 16,
  },
  identityInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
  },
  userSub: {
    fontSize: 12,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabButtonActive: {},
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    fontWeight: '700',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  readOnlyInput: {},
  readOnlyText: {
    fontSize: 13,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingRight: 10,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  eyeBtn: {
    padding: 4,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 18,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  toggleSub: {
    fontSize: 11,
    marginTop: 2,
  },
  toggleDivider: {
    height: 1,
    marginVertical: 4,
  },
  versionFooter: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
