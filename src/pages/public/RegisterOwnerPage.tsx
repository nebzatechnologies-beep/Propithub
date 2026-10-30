import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { loadCachedTrialDays } from '../../lib/store';
import { Eye, EyeOff, Home, User } from 'lucide-react';
import { PropithubIcon } from '../../components/common/PropithubLogo';
import { ButtonProcessing } from '../../components/common/Spinner';

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

export const RegisterOwnerPage: React.FC = () => {
  const { registerOwner, registerTenant } = useAuth();
  const navigate = useNavigate();

  // Role selector: 'owner' vs 'tenant'
  const [selectedRole, setSelectedRole] = useState<'owner' | 'tenant'>('owner');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [country, setCountry] = useState('India');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Please provide your full name and email address.');
      return;
    }
    const cleanDigits = phone.replace(/[^0-9]/g, '');
    if (!phone.trim() || cleanDigits.length < 7 || cleanDigits.length > 15) {
      setError('Please provide a valid mobile phone number (7–15 digits).');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (selectedRole === 'owner') {
        const success = await registerOwner(name.trim(), email.trim(), password, country, phone.trim());
        setIsSubmitting(false);
        if (success) {
          const cached = loadCachedTrialDays();
          if (cached === 0) {
            navigate('/owner/plan');
          } else {
            navigate('/owner/dashboard');
          }
        }
      } else {
        const success = await registerTenant(name.trim(), email.trim(), password, phone.trim(), country);
        setIsSubmitting(false);
        if (success) {
          navigate('/tenant/dashboard');
        }
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err?.message || 'Failed to complete registration. Please try again.');
    }
  };

  return (
    <div className="onboarding-wrap">
      <Link to="/" className="back-link">
        ← Back to Propithub
      </Link>

      <div className="onboarding-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <PropithubIcon size={26} color="#10B981" />
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Create Your Propithub Account</h2>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '18px' }}>
          Select your role to get started with the rental ecosystem.
        </p>

        {/* Role Toggle Selector */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            background: 'var(--surface-sunken)',
            padding: '4px',
            borderRadius: '8px',
            marginBottom: '18px',
            border: '1px solid var(--line)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedRole('owner');
              setError('');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderRadius: '6px',
              border: 'none',
              background: selectedRole === 'owner' ? 'var(--surface)' : 'transparent',
              color: selectedRole === 'owner' ? 'var(--ink)' : 'var(--ink-soft)',
              fontWeight: selectedRole === 'owner' ? 600 : 500,
              boxShadow: selectedRole === 'owner' ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              fontSize: '13px',
              transition: 'all 0.15s ease',
            }}
          >
            <Home size={16} color={selectedRole === 'owner' ? 'var(--brass)' : 'currentColor'} />
            Property Owner
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedRole('tenant');
              setError('');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderRadius: '6px',
              border: 'none',
              background: selectedRole === 'tenant' ? 'var(--surface)' : 'transparent',
              color: selectedRole === 'tenant' ? 'var(--ink)' : 'var(--ink-soft)',
              fontWeight: selectedRole === 'tenant' ? 600 : 500,
              boxShadow: selectedRole === 'tenant' ? '0 2px 6px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
              fontSize: '13px',
              transition: 'all 0.15s ease',
            }}
          >
            <User size={16} color={selectedRole === 'tenant' ? 'var(--brass)' : 'currentColor'} />
            Tenant / Resident
          </button>
        </div>

        {selectedRole === 'owner' ? (
          <div className="note-box" style={{ marginBottom: '18px' }}>
            <b>Property Owner Registration:</b> Setup your portfolio, configure multi-floor properties, automated bulk units, and manage tenant leases. Starts on dynamic free trial.
          </div>
        ) : (
          <div className="note-box" style={{ marginBottom: '18px' }}>
            <b>Tenant Resident Registration:</b> Sign up to view property invitations, pay rent online via local gateways, e-sign agreements, and submit maintenance tickets.
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: '12.5px', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Full Name *</label>
            <input
              type="text"
              placeholder={selectedRole === 'owner' ? 'e.g. John Doe' : 'e.g. Jane Resident'}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
            />
          </div>

          <div className="field">
            <label>Mobile Phone Number *</label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError('');
              }}
              required
            />
          </div>

          <div className="field">
            <label>Operating Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Email Address *</label>
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

          <div className="field">
            <label>Password *</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 6 characters"
                value={password}
                autoComplete="new-password"
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
            style={{ width: '100%', marginTop: '12px', fontWeight: 600 }}
            disabled={isSubmitting}
          >
            <ButtonProcessing
              loading={isSubmitting}
              loadingText="Creating Account..."
              defaultText={
                selectedRole === 'owner'
                  ? 'Register as Owner (Start Free Trial)'
                  : 'Register as Tenant'
              }
            />
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px' }}>
          <span>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--brass)', fontWeight: 600 }}>
              Sign in
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
};

export const RegisterPage = RegisterOwnerPage;
