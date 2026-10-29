import React, { useState } from 'react';
import { UserRole } from '../types';

interface OnboardingPageProps {
  mode: 'login' | 'signup';
  initialRole?: UserRole;
  onComplete: (data: { email: string; name: string; role: UserRole; country: string }) => void;
  onBack: () => void;
  onSwitchMode: (mode: 'login' | 'signup') => void;
}

const COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'United Arab Emirates',
  'Australia',
  'Singapore',
  'Canada',
  'Germany',
];

export const OnboardingPage: React.FC<OnboardingPageProps> = ({
  mode,
  onComplete,
  onBack,
  onSwitchMode,
}) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('India');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    // Strict requirement: Only owner can sign up publicly
    const role: UserRole = mode === 'signup' ? 'owner' : 'owner';
    onComplete({ email, name: name.trim() || email.split('@')[0], role, country });
  };

  const handleQuickLogin = (role: UserRole, prefillEmail: string, prefillName: string) => {
    onComplete({ email: prefillEmail, name: prefillName, role, country: 'India' });
  };

  return (
    <div className="onboarding-wrap">
      <div className="back-link" onClick={onBack}>
        ← Back to Propithub
      </div>

      <div className="onboarding-card">
        <h2 style={{ marginBottom: '6px' }}>
          {mode === 'signup' ? 'Create Owner Account' : 'Sign in to Propithub'}
        </h2>

        {mode === 'signup' ? (
          <div className="note-box" style={{ marginBottom: '18px' }}>
            <b>Notice:</b> Public self-registration is reserved for <b>Property Owners</b>. Tenants, Property Managers, and Maintenance Staff accounts are provisioned directly by an owner from inside their portal.
          </div>
        ) : (
          <p className="note" style={{ marginBottom: '18px' }}>
            Welcome back. Access your property operations console.
          </p>
        )}

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: '12.5px', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="field">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label>Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Email Address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
            />
          </div>

          <button type="submit" className="btn brass" style={{ width: '100%', marginTop: '8px' }}>
            {mode === 'signup' ? 'Register as Owner' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px' }}>
          {mode === 'signup' ? (
            <span>
              Already have an account?{' '}
              <a
                href="#login"
                style={{ color: 'var(--brass)', fontWeight: 600 }}
                onClick={(e) => {
                  e.preventDefault();
                  onSwitchMode('login');
                }}
              >
                Sign in
              </a>
            </span>
          ) : (
            <span>
              Are you a property owner?{' '}
              <a
                href="#signup"
                style={{ color: 'var(--brass)', fontWeight: 600 }}
                onClick={(e) => {
                  e.preventDefault();
                  onSwitchMode('signup');
                }}
              >
                Sign up free
              </a>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
