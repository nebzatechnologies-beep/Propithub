import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAuth } from '../context/MobileAuthContext';
import { useMobileToast } from '../context/MobileToastContext';
import { PropithubIcon } from '../components/PropithubLogo';
import { useMobileTheme } from '../context/MobileThemeContext';

interface AuthGatewayProps {
  onLoginSuccess?: () => void;
}

export const AuthGatewayScreen: React.FC<AuthGatewayProps> = ({ onLoginSuccess }) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { login, register, resetPassword, isLoading } = useMobileAuth();
  const { showToast } = useMobileToast();

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<'owner' | 'tenant'>('owner');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<'name' | 'phone' | 'email' | 'password' | null>(null);

  // In-page error & field validation states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; name?: string; phone?: string }>({});

  const nameInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  const mapAuthError = (rawError?: string): string => {
    if (!rawError) return 'Invalid email or password. Please verify your credentials.';
    const lower = rawError.toLowerCase();
    if (
      lower.includes('invalid-credential') ||
      lower.includes('invalid_login_credentials') ||
      lower.includes('wrong-password')
    ) {
      return 'Incorrect email or password. Please double check your details and try again.';
    }
    if (lower.includes('user-not-found')) {
      return 'No account registered with this email. Please check for typos or sign up.';
    }
    if (lower.includes('email-already-in-use')) {
      return 'An account with this email already exists. Please sign in instead.';
    }
    if (lower.includes('weak-password')) {
      return 'Password is too weak. Please use at least 6 characters.';
    }
    if (lower.includes('invalid-email')) {
      return 'Please enter a valid email address (e.g. name@example.com).';
    }
    if (lower.includes('too-many-requests')) {
      return 'Access temporarily restricted due to multiple failed attempts. Please wait a minute before retrying.';
    }
    if (lower.includes('network')) {
      return 'Network connection issue. Please check your internet connection.';
    }
    return rawError;
  };

  const handleSignIn = async () => {
    setErrorMessage(null);
    const newFieldErrors: typeof fieldErrors = {};

    if (!email.trim()) {
      newFieldErrors.email = 'Email address is required';
    } else if (!email.includes('@')) {
      newFieldErrors.email = 'Please enter a valid email address';
    }

    if (!password) {
      newFieldErrors.password = 'Password is required';
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      setErrorMessage('Please fill in all required credentials.');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    const result = await login(email.trim(), password);
    setIsSubmitting(false);

    if (result.success) {
      showToast('Signed in successfully ✓', 'success');
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } else {
      const friendlyMsg = mapAuthError(result.error);
      setErrorMessage(friendlyMsg);
      setFieldErrors({
        email: friendlyMsg.toLowerCase().includes('email') ? 'Verify email' : undefined,
        password: friendlyMsg.toLowerCase().includes('password') ? 'Verify password' : undefined,
      });
      showToast(friendlyMsg, 'error');
    }
  };

  const handleSignUp = async () => {
    setErrorMessage(null);
    const newFieldErrors: typeof fieldErrors = {};

    if (!name.trim()) {
      newFieldErrors.name = 'Full name is required';
    }
    if (!email.trim() || !email.includes('@')) {
      newFieldErrors.email = 'Please provide a valid email address';
    }
    if (!password || password.length < 6) {
      newFieldErrors.password = 'Password must be at least 6 characters long';
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      setErrorMessage('Please fix the errors highlighted below.');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    const result = await register(name.trim(), email.trim(), password, phone.trim(), selectedRole);
    setIsSubmitting(false);

    if (result.success) {
      showToast('Account created successfully! Welcome to Propithub.', 'success');
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } else {
      const friendlyMsg = mapAuthError(result.error);
      setErrorMessage(friendlyMsg);
      showToast(friendlyMsg, 'error');
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      setFieldErrors({ email: 'Please enter your registered email' });
      setErrorMessage('Please enter your registered email address above to receive a reset link.');
      showToast('Please enter your email address first', 'warning');
      return;
    }

    setErrorMessage(null);
    const res = await resetPassword(email.trim());
    if (res.success) {
      showToast(`Password recovery link dispatched to ${email.trim()} 📬`, 'success');
      Alert.alert('Reset Link Sent 📬', `A password recovery link has been dispatched to ${email.trim()}.`);
    } else {
      const friendlyMsg = mapAuthError(res.error);
      setErrorMessage(friendlyMsg);
      showToast(friendlyMsg, 'error');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Standard Dynamic Screen Status Bar */}
      <ScreenStatusBar />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Centered Logo Badge */}
          <View style={styles.logoContainer}>
            <View style={[styles.logoBadge, isDark && { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
              <PropithubIcon size={38} />
            </View>
            <Text style={styles.brandTitle}>
              <Text style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>PROPIT</Text>
              <Text style={{ color: '#10B981' }}>HUB</Text>
            </Text>
            <Text style={[styles.brandSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>Real Estate Cloud Platform</Text>
          </View>

          {/* Mode Switcher Tabs */}
          <View style={[styles.modeTabs, isDark && { backgroundColor: '#1E293B', borderColor: '#334155' }]}>
            <TouchableOpacity
              style={[styles.modeTab, authMode === 'signin' && [styles.modeTabActive, isDark && { backgroundColor: '#0B0F17', borderColor: '#475569' }]]}
              onPress={() => {
                setAuthMode('signin');
                setErrorMessage(null);
                setFieldErrors({});
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeTabText, authMode === 'signin' && [styles.modeTabTextActive, isDark && { color: '#F1F5F9' }]]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, authMode === 'signup' && [styles.modeTabActive, isDark && { backgroundColor: '#0B0F17', borderColor: '#475569' }]]}
              onPress={() => {
                setAuthMode('signup');
                setErrorMessage(null);
                setFieldErrors({});
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeTabText, authMode === 'signup' && [styles.modeTabTextActive, isDark && { color: '#F1F5F9' }]]}>
                Create Account
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Fields Card */}
          <View style={[styles.form, isDark && { backgroundColor: '#131B28', borderColor: '#1E293B' }]}>
            {/* Inline Error Banner */}
            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Feather name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 8 }} />
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
                <TouchableOpacity
                  onPress={() => setErrorMessage(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 6 }}
                >
                  <Feather name="x" size={14} color="#991B1B" />
                </TouchableOpacity>
              </View>
            ) : null}

            {authMode === 'signup' && (
              <>
                {/* Full Name Field */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <Pressable
                    style={[
                      styles.inputBox,
                      focusedField === 'name' && styles.inputBoxFocused,
                      Boolean(fieldErrors.name) && styles.inputBoxError,
                    ]}
                    onPress={() => nameInputRef.current?.focus()}
                  >
                    <Feather
                      name="user"
                      size={16}
                      color={fieldErrors.name ? '#EF4444' : focusedField === 'name' ? '#10B981' : '#94A3B8'}
                      style={styles.inputLeadingIcon}
                    />
                    <TextInput
                      ref={nameInputRef}
                      style={styles.textInput}
                      value={name}
                      onChangeText={(val) => {
                        setName(val);
                        if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onFocus={() => setFocusedField('name')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="e.g. John Doe"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="words"
                      cursorColor="#10B981"
                      selectionColor="#10B981"
                    />
                  </Pressable>
                  {fieldErrors.name ? <Text style={styles.fieldErrorText}>{fieldErrors.name}</Text> : null}
                </View>

                {/* Role Switcher */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>I am registering as</Text>
                  <View style={styles.roleSelector}>
                    <TouchableOpacity
                      style={[styles.roleOption, selectedRole === 'owner' && styles.roleOptionActive]}
                      onPress={() => setSelectedRole('owner')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.roleOptionText, selectedRole === 'owner' && styles.roleOptionTextActive]}>
                        Property Owner
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.roleOption, selectedRole === 'tenant' && styles.roleOptionActive]}
                      onPress={() => setSelectedRole('tenant')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.roleOptionText, selectedRole === 'tenant' && styles.roleOptionTextActive]}>
                        Resident / Tenant
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Phone Field */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <Pressable
                    style={[
                      styles.inputBox,
                      focusedField === 'phone' && styles.inputBoxFocused,
                      Boolean(fieldErrors.phone) && styles.inputBoxError,
                    ]}
                    onPress={() => phoneInputRef.current?.focus()}
                  >
                    <Feather
                      name="phone"
                      size={16}
                      color={fieldErrors.phone ? '#EF4444' : focusedField === 'phone' ? '#10B981' : '#94A3B8'}
                      style={styles.inputLeadingIcon}
                    />
                    <TextInput
                      ref={phoneInputRef}
                      style={styles.textInput}
                      value={phone}
                      onChangeText={(val) => {
                        setPhone(val);
                        if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onFocus={() => setFocusedField('phone')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="+91 98765 43210"
                      placeholderTextColor="#94A3B8"
                      keyboardType="phone-pad"
                      cursorColor="#10B981"
                      selectionColor="#10B981"
                    />
                  </Pressable>
                  {fieldErrors.phone ? <Text style={styles.fieldErrorText}>{fieldErrors.phone}</Text> : null}
                </View>
              </>
            )}

            {/* Email Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <Pressable
                style={[
                  styles.inputBox,
                  focusedField === 'email' && styles.inputBoxFocused,
                  Boolean(fieldErrors.email) && styles.inputBoxError,
                ]}
                onPress={() => emailInputRef.current?.focus()}
              >
                <Feather
                  name="mail"
                  size={16}
                  color={fieldErrors.email ? '#EF4444' : focusedField === 'email' ? '#10B981' : '#94A3B8'}
                  style={styles.inputLeadingIcon}
                />
                <TextInput
                  ref={emailInputRef}
                  style={styles.textInput}
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="name@example.com"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  cursorColor="#10B981"
                  selectionColor="#10B981"
                />
              </Pressable>
              {fieldErrors.email ? <Text style={styles.fieldErrorText}>{fieldErrors.email}</Text> : null}
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <Pressable
                style={[
                  styles.inputBox,
                  focusedField === 'password' && styles.inputBoxFocused,
                  Boolean(fieldErrors.password) && styles.inputBoxError,
                ]}
                onPress={() => passwordInputRef.current?.focus()}
              >
                <Feather
                  name="lock"
                  size={16}
                  color={fieldErrors.password ? '#EF4444' : focusedField === 'password' ? '#10B981' : '#94A3B8'}
                  style={styles.inputLeadingIcon}
                />
                <TextInput
                  ref={passwordInputRef}
                  style={styles.textInput}
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="••••••••••••"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  cursorColor="#10B981"
                  selectionColor="#10B981"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  activeOpacity={0.7}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Feather
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={17}
                    color={showPassword ? '#10B981' : '#94A3B8'}
                  />
                </TouchableOpacity>
              </Pressable>
              {fieldErrors.password ? <Text style={styles.fieldErrorText}>{fieldErrors.password}</Text> : null}
            </View>

            {/* Forgot Password Link */}
            {authMode === 'signin' && (
              <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword} activeOpacity={0.7}>
                <Text style={styles.forgotText}>Forgot your password?</Text>
              </TouchableOpacity>
            )}

            {/* CTA Button */}
            <TouchableOpacity
              style={[styles.signInButton, (isSubmitting || isLoading) && styles.signInButtonDisabled]}
              onPress={authMode === 'signin' ? handleSignIn : handleSignUp}
              activeOpacity={0.85}
              disabled={isSubmitting || isLoading}
            >
              {isSubmitting || isLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.signInButtonText}>
                    {authMode === 'signin' ? 'Signing in...' : 'Creating account...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.buttonInnerRow}>
                  <Text style={styles.signInButtonText}>
                    {authMode === 'signin' ? 'Sign In to Account' : 'Create & Access Platform'}
                  </Text>
                  <Feather
                    name={authMode === 'signin' ? 'arrow-right' : 'user-plus'}
                    size={15}
                    color="#FFFFFF"
                    style={{ marginLeft: 6 }}
                  />
                </View>
              )}
            </TouchableOpacity>

          </View>

          {/* Secure Production Notice */}
          <View style={styles.footer}>
            <View style={styles.securityBadge}>
              <Ionicons name="shield-checkmark" size={13} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.securityText}>Enterprise-grade security & encryption</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    justifyContent: 'center',
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoBadge: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: colors.navy,
  },
  brandSubtitle: {
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 4,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  modeTabTextActive: {
    color: colors.navy,
    fontWeight: '700',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
  },
  roleOptionActive: {
    borderColor: '#10B981',
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
  },
  roleOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  roleOptionTextActive: {
    color: isDark ? '#34D399' : '#059669',
    fontWeight: '700',
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
    borderWidth: 1,
    borderColor: isDark ? '#EF4444' : '#FCA5A5',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12.5,
    color: isDark ? '#FCA5A5' : '#991B1B',
    fontWeight: '500',
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 13,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  inputBoxFocused: {
    borderColor: '#10B981',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
  },
  inputBoxError: {
    borderColor: '#EF4444',
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
    borderWidth: 1.5,
  },
  fieldErrorText: {
    color: '#DC2626',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  inputLeadingIcon: {
    marginRight: 9,
  },
  textInput: {
    flex: 1,
    color: colors.navy,
    fontSize: 14,
    paddingVertical: 10,
    minHeight: 44,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : {}),
  },
  eyeBtn: {
    padding: 6,
    marginRight: -4,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: 2,
    marginBottom: 16,
    paddingVertical: 2,
  },
  forgotText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '600',
  },
  signInButton: {
    backgroundColor: '#10B981',
    borderRadius: 9,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButtonDisabled: {
    opacity: 0.65,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    marginTop: 18,
    alignItems: 'center',
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surfaceSunken : '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
  },
  securityText: {
    fontSize: 11,
    color: colors.inkSoft,
    fontWeight: '500',
  },
});
