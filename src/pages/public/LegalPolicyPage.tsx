import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useTheme } from '../../context/ThemeContext';
import { ArrowLeft, Mail, Sun, Moon } from 'lucide-react';
import { PropithubIcon } from '../../components/common/PropithubLogo';

interface LegalPolicyPageProps {
  type: 'terms' | 'privacy' | 'refund';
}

export const LegalPolicyPage: React.FC<LegalPolicyPageProps> = ({ type }) => {
  const { state } = useAppData();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const cfg = state.landingConfig;

  // Scroll to top on route / type change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [type]);

  const legalPages = cfg.legalPages;
  const pageData = legalPages?.[type] || {
    title: type === 'terms' ? 'Terms of Use' : type === 'privacy' ? 'Privacy Policy' : 'Refund Policy',
    subtitle: 'Official governing document and resident service covenants.',
    lastUpdated: 'September 18, 2026',
    sections: [],
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      {/* 1. Public Top Navigation Bar - Theme adaptive */}
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
              {cfg.faviconUrl ? (
                <img
                  src={cfg.faviconUrl}
                  alt="Logo"
                  style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <PropithubIcon size={24} color="#10B981" />
              )}
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.5px' }}>
                {cfg.brandName || 'propit'}
                <span style={{ color: '#10B981' }}>{cfg.brandAccent || 'hub'}</span>
              </span>
            </div>
            <span
              style={{
                fontSize: '11px',
                background: 'var(--surface-sunken)',
                color: 'var(--ink-soft)',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: '1px solid var(--line)',
              }}
            >
              Legal &amp; Trust
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="btn secondary small"
              style={{
                width: '36px',
                height: '36px',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'var(--ink)',
              }}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <button
              type="button"
              className="btn secondary small"
              onClick={() => navigate('/')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                fontSize: '13px',
              }}
            >
              <ArrowLeft size={14} /> Back to Home
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Policy Content Layout */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px 60px', flex: 1, width: '100%' }}>
        {/* Clean Document Title Header */}
        <div style={{ marginBottom: '28px', paddingBottom: '16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link to="/" style={{ color: 'var(--ink-soft)', textDecoration: 'none' }}>Home</Link>
            <span>/</span>
            <span>Legal</span>
            <span>/</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{pageData.title}</span>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.5px', color: 'var(--ink)' }}>
            {pageData.title}
          </h1>
          {pageData.subtitle && (
            <p style={{ margin: 0, fontSize: '14.5px', color: 'var(--ink-soft)' }}>
              {pageData.subtitle}
            </p>
          )}
        </div>

        <div className="legal-policy-grid">
          {/* Left Sticky Sidebar: Table of Contents & Quick Links */}
          <aside className="legal-policy-sidebar">
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
              Sections on this page
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
              {pageData.sections.map((sec, idx) => (
                <a
                  key={sec.id || idx}
                  href={`#${sec.id || `sec-${idx}`}`}
                  style={{
                    fontSize: '13px',
                    color: 'var(--ink-soft)',
                    textDecoration: 'none',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    lineHeight: 1.4,
                    display: 'block',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface-sunken)';
                    e.currentTarget.style.color = 'var(--ink)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--ink-soft)';
                  }}
                >
                  {sec.title}
                </a>
              ))}
            </nav>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Other Policies
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                {type !== 'terms' && (
                  <Link to="/terms" style={{ color: 'var(--brass, #10B981)', textDecoration: 'none', fontWeight: 500 }}>
                    → Terms of Use
                  </Link>
                )}
                {type !== 'privacy' && (
                  <Link to="/privacy" style={{ color: 'var(--brass, #10B981)', textDecoration: 'none', fontWeight: 500 }}>
                    → Privacy Policy
                  </Link>
                )}
                {type !== 'refund' && (
                  <Link to="/refund" style={{ color: 'var(--brass, #10B981)', textDecoration: 'none', fontWeight: 500 }}>
                    → Refund Policy
                  </Link>
                )}
                <Link to="/contact" style={{ color: 'var(--brass, #10B981)', textDecoration: 'none', fontWeight: 500 }}>
                  → Contact Support Desk
                </Link>
              </div>
            </div>
          </aside>

          {/* Right Main Reading Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {pageData.sections.length === 0 ? (
              <div style={{ background: 'var(--surface)', padding: '36px', borderRadius: '12px', border: '1px solid var(--line)', textAlign: 'center' }}>
                <p style={{ color: 'var(--ink-soft)', margin: 0 }}>No sections configured yet. Content is managed dynamically in Landing CMS.</p>
              </div>
            ) : (
              pageData.sections.map((sec, idx) => (
                <section
                  key={sec.id || idx}
                  id={sec.id || `sec-${idx}`}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '12px',
                    padding: '28px 32px',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <h2 style={{ fontSize: '19px', fontWeight: 700, color: 'var(--ink)', marginTop: 0, marginBottom: '14px', letterSpacing: '-0.2px' }}>
                    {sec.title}
                  </h2>
                  <div
                    style={{
                      fontSize: '14.5px',
                      lineHeight: 1.75,
                      color: 'var(--ink)',
                      opacity: 0.9,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {sec.content}
                  </div>
                </section>
              ))
            )}

            {/* Assistance & Queries Box */}
            <div
              style={{
                background: 'var(--surface-sunken)',
                border: '1.5px solid var(--brass, #10B981)',
                borderRadius: '12px',
                padding: '24px 28px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px',
                marginTop: '12px',
              }}
            >
              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: 'var(--ink)' }}>Have legal questions or policy inquiries?</h4>
                <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink-soft)' }}>
                  Our legal compliance team and support desk are ready to assist you regarding these covenants.
                </p>
              </div>
              <button
                type="button"
                className="btn brass"
                onClick={() => navigate('/contact')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Mail size={14} /> Contact Support Desk
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* 4. Midnight SaaS Footer */}
      <footer style={{ background: '#0B0F17', color: '#94A3B8', padding: '40px 24px 24px', borderTop: '1px solid var(--line)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', fontSize: '12.5px' }}>
          <div>
            © 2026 <strong>{cfg.brandName || 'Propithub'}</strong>. Owned and Developed by <strong>{cfg.footerCompanyName || 'NEBZA Technologies Private Limited'}</strong>. All Rights Reserved.
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <Link to="/terms" style={{ color: type === 'terms' ? '#10B981' : '#94A3B8', textDecoration: 'none' }}>Terms of Use</Link>
            <span>•</span>
            <Link to="/privacy" style={{ color: type === 'privacy' ? '#10B981' : '#94A3B8', textDecoration: 'none' }}>Privacy Policy</Link>
            <span>•</span>
            <Link to="/refund" style={{ color: type === 'refund' ? '#10B981' : '#94A3B8', textDecoration: 'none' }}>Refund Policy</Link>
            <span>•</span>
            <Link to="/contact" style={{ color: '#94A3B8', textDecoration: 'none' }}>Contact Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
