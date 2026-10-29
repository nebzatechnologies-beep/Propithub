import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useTheme } from '../../context/ThemeContext';
import { PropithubIcon } from '../../components/common/PropithubLogo';
import { Home, ArrowLeft, LogIn, Sun, Moon, HelpCircle } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const { state } = useAppData();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const cfg = state.landingConfig;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--ink)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Navigation Header */}
      <header
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--line)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
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
            gap: '16px',
          }}
        >
          {/* Logo */}
          <div
            style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            {cfg.faviconUrl ? (
              <img
                src={cfg.faviconUrl}
                alt="Logo"
                style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <PropithubIcon size={26} color="var(--primary-color, #10B981)" />
            )}
            <span
              style={{
                fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
                fontSize: '21px',
                fontWeight: 800,
                letterSpacing: '-0.5px',
                color: 'var(--ink, #0F172A)',
              }}
            >
              {cfg.brandName || 'propit'}
              <span style={{ color: 'var(--primary-color, #10B981)' }}>{cfg.brandAccent || 'hub'}</span>
            </span>
          </div>

          {/* Right Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={toggleTheme}
              className="btn secondary"
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
              }}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={15} color="var(--amber)" /> : <Moon size={15} />}
              <span className="hide-mobile">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>

            <Link
              to="/login"
              className="btn primary"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <LogIn size={14} />
              <span>Sign In</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main 404 Hero Container */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '560px',
            width: '100%',
            textAlign: 'center',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: '20px',
            padding: '48px 32px',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {/* Brand Icon & 404 Badge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '16px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(16, 185, 129, 0.12)',
              }}
            >
              <PropithubIcon size={32} color="var(--primary-color, #10B981)" />
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(16, 185, 129, 0.1)',
                color: 'var(--primary-color, #10B981)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '9999px',
                padding: '4px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
              }}
            >
              <span>Error 404 • Page Not Found</span>
            </div>
          </div>

          {/* Large Stylized 404 Number */}
          <div
            style={{
              fontSize: 'clamp(64px, 12vw, 92px)',
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: '-2px',
              fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
              color: 'var(--ink)',
              margin: '0 0 14px 0',
            }}
          >
            4<span style={{ color: 'var(--primary-color, #10B981)' }}>0</span>4
          </div>

          <h1
            style={{
              fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
              fontSize: '22px',
              fontWeight: 800,
              margin: '0 0 12px 0',
              color: 'var(--ink)',
              letterSpacing: '-0.4px',
            }}
          >
            Page Not Found
          </h1>

          <p
            style={{
              fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
              fontSize: '14.5px',
              lineHeight: 1.6,
              color: 'var(--ink-soft)',
              margin: '0 auto 32px auto',
              maxWidth: '440px',
            }}
          >
            The link you followed doesn't exist, may have moved, or is temporarily unavailable.
          </p>

          {/* Quick Action Navigation Grid */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maxWidth: '380px',
              margin: '0 auto 28px auto',
            }}
          >
            <button
              type="button"
              className="btn primary"
              onClick={() => navigate('/')}
              style={{
                padding: '12px 20px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <Home size={16} /> Return to Homepage
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={() => navigate(-1)}
              style={{
                padding: '11px 20px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontWeight: 600,
                fontSize: '13.5px',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={15} /> Go to Previous Page
            </button>
          </div>
        </div>
      </main>

      {/* Public Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--line)',
          background: 'var(--surface)',
          padding: '20px 24px',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--ink-soft)',
          fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
        }}
      >
        <p style={{ margin: 0 }}>
          &copy; {new Date().getFullYear()} {cfg.brandName || 'propit'}{cfg.brandAccent || 'hub'}. All rights reserved.
        </p>
      </footer>
    </div>
  );
};
