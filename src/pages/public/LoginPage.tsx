import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { PropithubIcon } from '../../components/common/PropithubLogo';
import { ButtonProcessing } from '../../components/common/Spinner';

export const LoginPage: React.FC = () => {
  const { login, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await login(email, password, 'standard');
      setIsSubmitting(false);

      if (res.success && res.role) {
        handleRoleRedirect(res.role);
      } else {
        setError(res.error || 'Invalid email or password. Please verify your credentials.');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Authentication error. Please try again.');
    }
  };

  const handleRoleRedirect = (role: UserRole) => {
    switch (role) {
      case 'owner':
        navigate('/owner/dashboard');
        break;
      case 'tenant':
        navigate('/tenant/dashboard');
        break;
      case 'manager':
        navigate('/manager/dashboard');
        break;
      case 'staff':
        navigate('/staff/dashboard');
        break;
      default:
        navigate('/owner/dashboard');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetting(true);
    setResetMsg('');
    const res = await resetPassword(resetEmail);
    setIsResetting(false);
    if (res.success) {
      setResetMsg('Password reset email sent. Check your inbox.');
    } else {
      setResetMsg(res.error || 'Failed to send reset email.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px', marginBottom: '14px' }}>
        <Link
          to="/"
          style={{
            color: 'var(--ink-soft)',
            fontSize: '13px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} /> Back to Propithub
        </Link>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: '12px',
          padding: '32px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.06)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <PropithubIcon size={26} color="#10B981" />
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
            Sign in to Propithub
          </h2>
        </div>
        <p className="note" style={{ marginBottom: '22px', fontSize: '13px', color: 'var(--ink-soft)' }}>
          Workspace authentication for property owners, managers, staff, and residents.
        </p>

        {error && (
          <div
            style={{
              color: 'var(--danger)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 'var(--radius)',
              padding: '10px 14px',
              fontSize: '12.5px',
              marginBottom: '16px',
              lineHeight: 1.4,
            }}
          >
            <div>{error}</div>
            {error.toLowerCase().includes('admin') && (
              <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed rgba(239, 68, 68, 0.3)' }}>
                <Link
                  to="/admin-login"
                  style={{ color: 'var(--amber)', fontWeight: 600, textDecoration: 'underline' }}
                >
                  Go to Dedicated Admin Portal →
                </Link>
              </div>
            )}
          </div>
        )}

        {isForgotMode ? (
          <form onSubmit={handleForgotPassword} noValidate>
            <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--ink-soft)' }}>
              Enter your registered email and we'll send a password reset link.
            </div>
            {resetMsg && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius)',
                  fontSize: '12.5px',
                  marginBottom: '14px',
                  background: resetMsg.includes('sent') ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${resetMsg.includes('sent') ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  color: resetMsg.includes('sent') ? 'var(--green)' : 'var(--danger)',
                }}
              >
                {resetMsg}
              </div>
            )}
            <div className="field">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={resetEmail}
                autoComplete="email"
                onChange={(e) => setResetEmail(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className={`btn brass ${isResetting ? 'btn-processing' : ''}`}
              style={{ width: '100%', marginTop: '16px', fontWeight: 600 }}
              disabled={isResetting}
            >
              <ButtonProcessing
                loading={isResetting}
                loadingText="Sending Reset Email..."
                defaultText="Send Reset Email"
              />
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ width: '100%', marginTop: '10px' }}
              onClick={() => { setIsForgotMode(false); setResetMsg(''); }}
            >
              Back to Sign In
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                autoComplete="username"
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
              />
            </div>

            <div className="field" style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ margin: 0 }}>Password</label>
                <button
                  type="button"
                  onClick={() => setIsForgotMode(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--brass)', fontSize: '12px', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  autoComplete="current-password"
                  style={{ paddingRight: '38px' }}
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
                    color: 'var(--ink-soft)',
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
              className={`btn brass ${isSubmitting ? 'btn-processing' : ''}`}
              style={{ width: '100%', marginTop: '18px', fontWeight: 600 }}
              disabled={isSubmitting}
            >
              <ButtonProcessing
                loading={isSubmitting}
                loadingText="Signing In to Workspace..."
                defaultText="Sign In to Workspace"
              />
            </button>
          </form>
        )}


        <div style={{ textAlign: 'center', marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--line)', fontSize: '13px' }}>
          <span>
            New to Propithub?{' '}
            <Link to="/register" style={{ color: 'var(--brass)', fontWeight: 600 }}>
              Create an account (Owner or Tenant)
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
};
