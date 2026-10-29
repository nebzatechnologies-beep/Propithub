import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ShieldCheck, Lock, ArrowLeft, Eye, EyeOff, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ButtonProcessing } from '../../components/common/Spinner';
import { isFirebaseConfigured, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export const AdminLoginPage: React.FC = () => {
  const { login, user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  // Wizard Step: 'credentials' -> 'security_code'
  const [step, setStep] = useState<'credentials' | 'security_code'>('credentials');

  // Credentials State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 6-Digit PIN State
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);

  // Input refs for 6-digit auto-navigation
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Auto-focus first PIN box on step transition
  useEffect(() => {
    if (step === 'security_code') {
      setTimeout(() => {
        inputRefs[0]?.current?.focus();
      }, 100);
    }
  }, [step]);

  // Step 1: Submit Email & Password
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your administrator email address.');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your administrator password.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await login(email, password, 'admin');
      setIsSubmitting(false);

      if (res.success && res.role === 'superadmin') {
        // Transition to Step 2: 6-Digit Master Security Check
        setStep('security_code');
        setDigits(['', '', '', '', '', '']);
        setPinError('');
      } else {
        setError(res.error || 'Authentication failed. Please verify administrator credentials.');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Authentication error. Please try again.');
    }
  };

  // Helper to get expected PIN
  const getExpectedAdminPin = async (): Promise<string> => {
    // 1. Check current logged-in user profile
    if (user?.adminSecurityPin) {
      return user.adminSecurityPin;
    }

    // 2. Check Firestore user doc if configured
    if (isFirebaseConfigured && user?.id) {
      try {
        const uDoc = await getDoc(doc(db, 'users', user.id));
        if (uDoc.exists() && uDoc.data()?.adminSecurityPin) {
          return String(uDoc.data().adminSecurityPin);
        }
      } catch (e) {
        console.warn('Firestore PIN read error:', e);
      }
    }

    // 3. Check local storage
    const localPin = localStorage.getItem('propithub_admin_security_pin');
    if (localPin) return localPin;

    // 4. Default fallback code
    return '123456';
  };

  // Step 2: Verify 6-Digit PIN
  const handleVerifyPin = async (codeToVerify?: string) => {
    const fullCode = codeToVerify || digits.join('');
    if (fullCode.length !== 6) {
      setPinError('Please enter all 6 digits of your security code.');
      return;
    }

    setIsVerifyingPin(true);
    setPinError('');

    try {
      const expectedPin = await getExpectedAdminPin();

      if (fullCode === expectedPin) {
        setPinSuccess(true);
        sessionStorage.setItem('propithub_admin_pin_verified', 'true');

        setTimeout(() => {
          navigate('/superadmin/overview');
        }, 600);
      } else {
        setIsVerifyingPin(false);
        setPinError('Invalid 6-digit security code. Please check your master PIN or update it in Settings.');
        setDigits(['', '', '', '', '', '']);
        inputRefs[0]?.current?.focus();
      }
    } catch (err: any) {
      setIsVerifyingPin(false);
      setPinError('Verification error: ' + (err?.message || 'Please try again.'));
    }
  };

  // Handle individual digit input change
  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    const newDigits = [...digits];

    if (!clean) {
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    newDigits[index] = clean[clean.length - 1]; // take last entered digit
    setDigits(newDigits);
    setPinError('');

    // Advance to next input
    if (index < 5) {
      inputRefs[index + 1]?.current?.focus();
    }

    // Auto-verify if all 6 digits entered
    const complete = newDigits.join('');
    if (complete.length === 6) {
      handleVerifyPin(complete);
    }
  };

  // Handle backspace navigation
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs[index - 1]?.current?.focus();
      } else if (digits[index]) {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      }
    }
  };

  // Handle paste of 6 digits
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);
    setPinError('');

    const targetIndex = Math.min(pasted.length, 5);
    inputRefs[targetIndex]?.current?.focus();

    if (pasted.length === 6) {
      handleVerifyPin(pasted);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: isDark ? '#0B110F' : '#F1F5F9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        boxSizing: 'border-box',
        transition: 'background 0.2s ease',
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px', marginBottom: '16px' }}>
        <Link
          to="/"
          style={{
            color: isDark ? '#9BB0A6' : '#64748B',
            fontSize: '13px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            textDecoration: 'none',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = isDark ? '#EDF3EF' : '#0F172A')}
          onMouseLeave={(e) => (e.currentTarget.style.color = isDark ? '#9BB0A6' : '#64748B')}
        >
          <ArrowLeft size={14} /> Back to Propithub Public
        </Link>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: isDark ? '#131D19' : '#FFFFFF',
          border: isDark ? '1px solid rgba(229, 169, 59, 0.25)' : '1px solid rgba(217, 119, 6, 0.25)',
          borderRadius: '12px',
          padding: '32px',
          boxShadow: isDark
            ? '0 24px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(229, 169, 59, 0.08)'
            : '0 20px 48px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(217, 119, 6, 0.1)',
          boxSizing: 'border-box',
          color: isDark ? '#EDF3EF' : '#0F172A',
          transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {/* =================================================================== */}
        {/* STEP 1: EMAIL & PASSWORD CREDENTIALS                                 */}
        {/* =================================================================== */}
        {step === 'credentials' && (
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: isDark ? 'rgba(229, 169, 59, 0.15)' : 'rgba(217, 119, 6, 0.1)',
                  border: isDark ? '1px solid rgba(229, 169, 59, 0.3)' : '1px solid rgba(217, 119, 6, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--amber)',
                }}
              >
                <ShieldCheck size={22} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: 'var(--amber)',
                  }}
                >
                  Restricted Gateway
                </div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0, color: isDark ? '#F7FAF8' : '#0F172A' }}>
                  Superadmin Portal
                </h2>
              </div>
            </div>

            <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: isDark ? '#9BB0A6' : '#64748B', lineHeight: 1.5 }}>
              Platform oversight, global plan limits, gatekeepers, and system administration.
            </p>

            {error && (
              <div
                style={{
                  color: '#FCA5A5',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  marginBottom: '16px',
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCredentialsSubmit} noValidate>
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isDark ? '#C5D6CD' : '#334155', fontSize: '12px' }}>
                  <Lock size={12} style={{ color: 'var(--amber)' }} /> Admin Email Address
                </label>
                <input
                  type="email"
                  placeholder="admin@propithub.com"
                  value={email}
                  autoComplete="username"
                  style={{
                    background: isDark ? '#1A2722' : '#F8FAFC',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #CBD5E1',
                    color: isDark ? '#EDF3EF' : '#0F172A',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius)',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                />
              </div>

              <div className="field" style={{ marginTop: '14px' }}>
                <label style={{ color: isDark ? '#C5D6CD' : '#334155', fontSize: '12px' }}>
                  Master Security Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter admin password"
                    value={password}
                    autoComplete="current-password"
                    style={{
                      background: isDark ? '#1A2722' : '#F8FAFC',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #CBD5E1',
                      color: isDark ? '#EDF3EF' : '#0F172A',
                      padding: '10px 38px 10px 12px',
                      borderRadius: 'var(--radius)',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: isDark ? '#9BB0A6' : '#64748B',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className={`btn amber ${isSubmitting ? 'btn-processing' : ''}`}
                style={{
                  width: '100%',
                  marginTop: '20px',
                  padding: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
                disabled={isSubmitting}
              >
                <ButtonProcessing
                  loading={isSubmitting}
                  loadingText="Verifying Credentials..."
                  defaultText="Continue to Security Verification"
                  icon={<ShieldCheck size={16} />}
                />
              </button>
            </form>

            <div
              style={{
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #E2E8F0',
                fontSize: '11.5px',
                color: isDark ? '#9BB0A6' : '#64748B',
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              Non-administrative users (Owners, Tenants, Managers, Staff) must sign in via the{' '}
              <Link to="/login" style={{ color: 'var(--brass)', textDecoration: 'underline' }}>
                Customer & Resident Login
              </Link>.
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 2: 6-DIGIT MASTER SECURITY CODE VERIFICATION                   */}
        {/* =================================================================== */}
        {step === 'security_code' && (
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: isDark ? 'rgba(229, 169, 59, 0.2)' : 'rgba(217, 119, 6, 0.12)',
                  border: isDark ? '1px solid rgba(229, 169, 59, 0.35)' : '1px solid rgba(217, 119, 6, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--amber)',
                }}
              >
                <KeyRound size={22} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: 'var(--amber)',
                  }}
                >
                  Step 2 of 2 • Two-Factor Check
                </div>
                <h2 style={{ fontSize: '19px', fontWeight: 600, margin: 0, color: isDark ? '#F7FAF8' : '#0F172A' }}>
                  Enter 6-Digit Security Code
                </h2>
              </div>
            </div>

            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: isDark ? '#9BB0A6' : '#64748B', lineHeight: 1.5 }}>
              Enter the master access code configured for <b>{email}</b> to unlock the Superadmin Console.
            </p>

            {pinError && (
              <div
                style={{
                  color: '#FCA5A5',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  marginBottom: '18px',
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={15} />
                <span>{pinError}</span>
              </div>
            )}

            {pinSuccess && (
              <div
                style={{
                  color: '#34D399',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  marginBottom: '18px',
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={16} color="#34D399" />
                <span>Security code verified! Access granted...</span>
              </div>
            )}

            {/* 6 Digit Inputs */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                marginBottom: '22px',
              }}
            >
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={inputRefs[index]}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  disabled={isVerifyingPin || pinSuccess}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  style={{
                    width: '48px',
                    height: '52px',
                    borderRadius: '10px',
                    background: isDark ? '#1A2722' : '#F8FAFC',
                    border: digit
                      ? '2px solid var(--amber)'
                      : (isDark ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid #CBD5E1'),
                    color: isDark ? '#F7FAF8' : '#0F172A',
                    fontSize: '22px',
                    fontWeight: 700,
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxShadow: digit ? '0 0 10px rgba(229, 169, 59, 0.25)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </div>

            {/* Verification Button */}
            <button
              type="button"
              onClick={() => handleVerifyPin()}
              className={`btn amber ${isVerifyingPin ? 'btn-processing' : ''}`}
              style={{
                width: '100%',
                padding: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              disabled={isVerifyingPin || digits.join('').length !== 6 || pinSuccess}
            >
              <ButtonProcessing
                loading={isVerifyingPin}
                loadingText="Verifying PIN..."
                defaultText="Verify & Unlock Console"
                icon={<ShieldCheck size={16} />}
              />
            </button>

            {/* Back to credentials button */}
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setStep('credentials');
                  setPassword('');
                  setError('');
                }}
                disabled={isVerifyingPin || pinSuccess}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isDark ? '#9BB0A6' : '#64748B',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = isDark ? '#EDF3EF' : '#0F172A')}
                onMouseLeave={(e) => (e.currentTarget.style.color = isDark ? '#9BB0A6' : '#64748B')}
              >
                <ArrowLeft size={13} /> Switch Account / Re-enter Password
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
