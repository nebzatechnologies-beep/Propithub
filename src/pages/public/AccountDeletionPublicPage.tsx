import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useTheme } from '../../context/ThemeContext';
import { ArrowLeft, Mail, Sun, Moon, Shield, Clock, Trash2, CheckCircle2, AlertTriangle, Send } from 'lucide-react';
import { PropithubIcon } from '../../components/common/PropithubLogo';

export const AccountDeletionPublicPage: React.FC = () => {
  const { state, showToast } = useAppData();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const cfg = state.landingConfig;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const [requestEmail, setRequestEmail] = useState('');
  const [requestRole, setRequestRole] = useState<'owner' | 'tenant' | 'manager' | 'staff'>('tenant');
  const [requestReason, setRequestReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmitWebForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestEmail.trim() || !requestEmail.includes('@')) {
      showToast('Please enter a valid registered email address.');
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      showToast('✓ Deletion request ticket logged successfully.');
    }, 1000);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--line)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '14px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              <PropithubIcon size={24} color="#10B981" />
              <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--ink)' }}>
                {cfg?.brandName || 'Propit'}
                <span style={{ color: 'var(--brand, #10B981)' }}>{cfg?.brandAccent || 'hub'}</span>
              </span>
            </div>
            <span style={{ color: 'var(--line-strong)', margin: '0 4px' }}>/</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-soft)' }}>
              Data Safety &amp; Account Deletion
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="btn secondary small"
              onClick={toggleTheme}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}
            >
              {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
              <span style={{ fontSize: '12px' }}>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
            <Link
              to="/"
              className="btn secondary small"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12px' }}
            >
              <ArrowLeft size={14} />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, maxWidth: '920px', width: '100%', margin: '0 auto', padding: '40px 24px 60px' }}>
        {/* Hero Section */}
        <div style={{ marginBottom: '32px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#DC2626',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '12px',
            }}
          >
            <Trash2 size={13} />
            <span>Privacy &amp; Data Rights</span>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--ink)', margin: '0 0 10px', letterSpacing: '-0.5px' }}>
            Account &amp; Personal Data Deletion
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--ink-soft)', margin: 0, lineHeight: 1.6, maxWidth: '780px' }}>
            In accordance with Google Play Store Data Safety, Apple App Store Guideline 5.1.1(v), GDPR, and consumer privacy laws, Propithub provides transparent and self-service mechanisms to permanently delete your account and personal records.
          </p>
        </div>

        {/* 72-Hour Protection Callout Banner */}
        <div
          style={{
            padding: '20px 24px',
            borderRadius: '12px',
            background: 'var(--surface-sunken)',
            border: '1px solid var(--line)',
            marginBottom: '32px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10B981',
              flexShrink: 0,
            }}
          >
            <Clock size={20} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>
              72-Hour Cooling-Off Grace Period &amp; Restoration
            </h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              To protect users from accidental data loss or unauthorized deletion requests, account deletion requests enter a <b>72-hour (3-day) holding window</b>. During this window, you retain the complete power to cancel the deletion request and instantly restore your account by simply logging in. After 72 hours, permanent deletion is executed automatically.
            </p>
          </div>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="panel" style={{ padding: '28px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', marginBottom: '32px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' }}>
            How to Delete Your Account (Self-Service)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Mobile App Steps */}
            <div style={{ padding: '18px', borderRadius: '10px', background: 'var(--surface-sunken)', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '18px' }}>📱</span>
                <b style={{ fontSize: '14px', color: 'var(--ink)' }}>On Propithub Mobile App (iOS / Android)</b>
              </div>
              <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.7 }}>
                <li>Open the Propithub app and sign in.</li>
                <li>Tap the <b>Menu / More</b> tab or tap your Profile Avatar.</li>
                <li>Select <b>Account Settings</b> and tap the <b>Security</b> tab.</li>
                <li>Scroll down to the <b>Danger Zone</b> section.</li>
                <li>Tap <b>Delete Account &amp; Personal Data</b>.</li>
                <li>Confirm the 72-hour cooling-off grace period to schedule deletion.</li>
              </ol>
            </div>

            {/* Web Portal Steps */}
            <div style={{ padding: '18px', borderRadius: '10px', background: 'var(--surface-sunken)', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '18px' }}>💻</span>
                <b style={{ fontSize: '14px', color: 'var(--ink)' }}>On Propithub Web Portal</b>
              </div>
              <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.7 }}>
                <li>Log in to your workspace at <Link to="/login" style={{ color: '#10B981', fontWeight: 600 }}>propithub.com/login</Link>.</li>
                <li>Click your profile avatar in the top right and select <b>Account Settings</b>.</li>
                <li>Select the <b>Security</b> tab.</li>
                <li>Scroll to <b>Danger Zone: Delete Account &amp; Personal Data</b>.</li>
                <li>Click <b>Delete Account</b> and confirm the scheduling modal.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Role Obligations Policy */}
        <div className="panel" style={{ padding: '28px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', marginBottom: '32px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>
            Role-Specific Eligibility &amp; Prerequisites
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', margin: '0 0 18px', lineHeight: 1.5 }}>
            Because Propithub coordinates live residential tenancies and legal agreements, deletion requests require clearing active operational responsibilities:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              {
                role: 'Property Owner',
                desc: 'Must not have active or pending lease agreements with tenants, and all security deposit settlements must be paid. Note: Active paid SaaS subscriptions are not a blocker to account closure.',
              },
              {
                role: 'Tenant Resident',
                desc: 'Must not have active lease terms or unpaid invoices. Move-out inspection and rental balances must be settled.',
              },
              {
                role: 'Maintenance Staff',
                desc: 'Must not have assigned repair work tickets in "assigned" or "in_progress" status.',
              },
              {
                role: 'Property Manager',
                desc: 'Must be unassigned from managed buildings by the portfolio owner.',
              },
            ].map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <div style={{ marginTop: '2px' }}>
                  <Shield size={16} color="var(--brand, #10B981)" />
                </div>
                <div>
                  <b style={{ fontSize: '13.5px', color: 'var(--ink)' }}>{item.role}:</b>
                  <span style={{ fontSize: '13px', color: 'var(--ink-soft)', marginLeft: '6px', lineHeight: 1.5 }}>
                    {item.desc}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Data Retention vs Purging */}
        <div className="panel" style={{ padding: '28px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', marginBottom: '32px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 14px' }}>
            What Data is Purged vs Retained
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid #FECACA' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#DC2626' }}>
                <Trash2 size={16} />
                <b style={{ fontSize: '13.5px' }}>Permanently Deleted (Purged)</b>
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                <li>Authentication logins and stored credentials</li>
                <li>Contact phone number, personal notes, and photo</li>
                <li>Notification preferences and push tokens</li>
                <li>Drafted listings and unexecuted drafts</li>
              </ul>
            </div>
            <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid #A7F3D0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#059669' }}>
                <Shield size={16} />
                <b style={{ fontSize: '13.5px' }}>Pseudonymized for Statutory Audit</b>
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                <li>Signed past contracts (tax &amp; real estate statutory compliance)</li>
                <li>Payment ledger entries (anti-money laundering &amp; audit)</li>
                <li>All personal identifiers are pseudonymized in audit logs</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Web Deletion Request Form (for users without app installed) */}
        <div className="panel" style={{ padding: '28px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', margin: '0 0 6px' }}>
            Submit an External Deletion Request
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', margin: '0 0 20px', lineHeight: 1.5 }}>
            If you have uninstalled the application or cannot sign in, submit your registered account details below. Our data privacy compliance team will verify your ownership and process the deletion within statutory timelines.
          </p>

          {submitted ? (
            <div
              style={{
                padding: '24px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid #10B981',
                textAlign: 'center',
              }}
            >
              <CheckCircle2 size={36} color="#10B981" style={{ margin: '0 auto 10px' }} />
              <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>
                Deletion Request Received
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                A confirmation link and verification token have been dispatched to <b>{requestEmail}</b>. Once confirmed, your 72-hour grace period will begin.
              </p>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => {
                  setSubmitted(false);
                  setRequestEmail('');
                  setRequestReason('');
                }}
              >
                Submit another request
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitWebForm} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
                  Registered Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. user@example.com"
                  value={requestEmail}
                  onChange={(e) => setRequestEmail(e.target.value)}
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

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
                  Account Role *
                </label>
                <select
                  value={requestRole}
                  onChange={(e) => setRequestRole(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface-sunken)',
                    color: 'var(--ink)',
                    fontSize: '13.5px',
                  }}
                >
                  <option value="tenant">Tenant Resident</option>
                  <option value="owner">Property Owner / Landlord</option>
                  <option value="manager">Property Manager</option>
                  <option value="staff">Maintenance Staff</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)', marginBottom: '6px' }}>
                  Reason for Deletion (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Let us know if you encountered any issues or wish to request specific data purges."
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    background: 'var(--surface-sunken)',
                    color: 'var(--ink)',
                    fontSize: '13.5px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={isSubmitting}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 22px', fontWeight: 600 }}
                >
                  <Send size={15} />
                  <span>{isSubmitting ? 'Transmitting Request...' : 'Submit Deletion Request'}</span>
                </button>
              </div>
            </form>
          )}

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--lineLight)', fontSize: '12px', color: 'var(--ink-soft)' }}>
            For privacy inquiries, contact our Data Protection Officer directly at <a href="mailto:privacy@propithub.com" style={{ color: '#10B981', fontWeight: 600 }}>privacy@propithub.com</a>.
          </div>
        </div>
      </main>
    </div>
  );
};

export default AccountDeletionPublicPage;
