import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { sanitizeCountry, resolveDisplayLocation } from '../../lib/addressUtils';
import { PropithubIcon } from '../../components/common/PropithubLogo';

export const LandingPage: React.FC = () => {
  const { state } = useAppData();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const cfg = state.landingConfig;

  // ── Mobile Menu Drawer State ───────────────────────────────────────────────
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // ── Smooth Scroll (offset for sticky navbar, closes mobile drawer) ─────────
  const smoothScrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (!el) return;
    const navbarHeight = 64;
    const top = el.getBoundingClientRect().top + window.scrollY - navbarHeight;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  // Close mobile drawer if resized to desktop width (> 960px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 960) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent background body scroll when mobile navigation is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // ── Scroll-triggered entrance animations via IntersectionObserver ────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('anim-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('.anim-fade-up').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Listings Filter
  const [selectedCountry, setSelectedCountry] = useState<string>('All countries');
  const listedUnits = state.units.filter((u) => u.isListedPublicly && u.status === 'vacant');
  const countries = [
    'All countries',
    ...Array.from(new Set(listedUnits.map((u) => sanitizeCountry(u.country, u.address)))),
  ];
  const filteredUnits = listedUnits.filter((u) => {
    if (selectedCountry === 'All countries') return true;
    return sanitizeCountry(u.country, u.address) === selectedCountry;
  });

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Dynamic fallback data if arrays are not populated
  const defaultFeatures = [
    {
      id: 'f-1',
      icon: '💳',
      title: 'Rent collection',
      description:
        "Recurring invoices go out on the lease's own schedule. Tenants pay by Stripe, PayPal, Razorpay, or bank transfer, and every payment reconciles against the ledger automatically.",
    },
    {
      id: 'f-2',
      icon: '📝',
      title: 'Digital leases',
      description:
        "Draft, sign, and store lease agreements without printing a page. Renewal dates surface on the owner's dashboard weeks before they're due.",
    },
    {
      id: 'f-3',
      icon: '🛠️',
      title: 'Maintenance desk',
      description:
        'Tenants log a request with a photo. Owners assign it to a maintainer in one tap. The maintainer updates status from their phone, and everyone sees the same ticket.',
    },
    {
      id: 'f-4',
      icon: '📊',
      title: 'Portfolio overview',
      description:
        "Every property and unit, tracked for occupancy and cash flow from one dashboard — whether it's a duplex or two hundred doors.",
    },
    {
      id: 'f-5',
      icon: '👥',
      title: 'Team & permissions',
      description:
        'Bring on a property manager or an accountant and give them access to exactly the modules their job needs, nothing more.',
    },
    {
      id: 'f-6',
      icon: '💬',
      title: 'Messaging',
      description:
        'Send a rent reminder or a building-wide notice by bulk SMS or email, straight from the same screen where you manage tenants.',
    },
  ];

  const defaultSteps = [
    {
      id: 's-1',
      stepNumber: '01',
      title: 'List your properties',
      description:
        "Add buildings, units, and rent amounts — or import them from the spreadsheet you're already keeping.",
    },
    {
      id: 's-2',
      stepNumber: '02',
      title: 'Invite everyone in',
      description:
        'Tenants get a portal to pay rent and file repairs. Maintainers get a queue of the work assigned to them.',
    },
    {
      id: 's-3',
      stepNumber: '03',
      title: 'Let the ledger run itself',
      description:
        "Invoices go out on schedule, payments reconcile on their own, and lease renewals show up before they're due.",
    },
  ];

  const defaultPlans = [
    {
      id: 'p-1',
      name: 'Starter',
      price: '$29',
      period: '/month',
      description: 'Essential management for independent landlords.',
      popular: false,
      features: [
        '5 Properties',
        '20 Rental Units',
        '20 Tenants',
        '2 Maintainers',
        'Automated recurring invoices',
        'Digital lease agreements',
        'Online payment gateways',
      ],
      ctaText: 'Choose Starter',
      ctaLink: '/register',
    },
    {
      id: 'p-2',
      name: 'Professional',
      price: '$79',
      period: '/month',
      description: 'Scale multi-family portfolios with full automation.',
      popular: true,
      features: [
        '50 Properties',
        '200 Rental Units',
        '200 Tenants',
        '10 Maintainers',
        'Automated recurring invoices',
        'Digital lease agreements',
        'Online payment gateways',
        'Bulk SMS & Email Messaging',
        'Role & Permission Management',
      ],
      ctaText: 'Choose Professional',
      ctaLink: '/register',
    },
    {
      id: 'p-3',
      name: 'Enterprise',
      price: '$149',
      period: '/month',
      description: 'Full enterprise suite for large property management firms.',
      popular: false,
      features: [
        '500 Properties',
        '2,000 Rental Units',
        '2,000 Tenants',
        '500 Maintainers',
        'All Addons & Modules Included',
        'Custom Domain Support',
        'Priority Dedicated SLA Support',
      ],
      ctaText: 'Choose Enterprise',
      ctaLink: '/register',
    },
  ];

  const defaultReviews = [
    {
      id: 't-1',
      quote:
        "“I used to chase four tenants across three group chats. Now I open one screen and know exactly who's paid.”",
      name: 'Dara Whitfield',
      role: 'owner, 4 rental houses',
      stars: 5,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      avatarBg: '#059669',
      avatarColor: '#FFFFFF',
      avatarIcon: 'D',
    },
    {
      id: 't-2',
      quote:
        '“Work orders used to live in my head. Now a maintainer sees the ticket the second a tenant files it.”',
      name: 'Marcus Odell',
      role: 'portfolio manager, 60 units',
      stars: 5,
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
      avatarBg: '#2563EB',
      avatarColor: '#FFFFFF',
      avatarIcon: 'M',
    },
    {
      id: 't-3',
      quote:
        '“Paying rent takes me ninety seconds, and I finally have a place to put in a repair request with photos.”',
      name: 'Priya Nandakumar',
      role: 'tenant',
      stars: 5,
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80',
      avatarBg: '#7C3AED',
      avatarColor: '#FFFFFF',
      avatarIcon: 'P',
    },
  ];

  const defaultFaqs = [
    {
      question: 'How does the 14-day free trial work?',
      answer:
        'You receive instant unrestricted access to all features — digital leases, automated rent billing, maintenance ticketing, and the tenant portal. No credit card is required to begin, and your dynamic trial runs under full platform support.',
    },
    {
      question: 'Can I connect my own payment gateways for rent collection?',
      answer:
        'Yes! Property owners can connect their own Stripe, Razorpay, or PayPal accounts, or configure direct UPI QR codes and bank transfer routing. Rent paid by tenants settles directly into your account.',
    },
    {
      question: 'Can tenants sign digital lease agreements on mobile?',
      answer:
        'Yes. Propithub includes an integrated digital lease builder and signature pad. Tenants can review full lease clauses and draw or upload legal digital signatures directly from any smartphone or tablet.',
    },
    {
      question: 'Can I add property managers with restricted permissions?',
      answer:
        'Absolutely. You can invite property managers or accountants and assign granular permissions — giving them access strictly to maintenance or unit inspections without exposing your private banking credentials.',
    },
    {
      question: 'Can I cancel or upgrade my plan anytime?',
      answer:
        'Yes, you can upgrade, downgrade, or cancel your subscription at any time directly from the Owner Dashboard settings with immediate prorated adjustment.',
    },
  ];

  const activeFeatures = cfg.featuresList && cfg.featuresList.length > 0 ? cfg.featuresList : defaultFeatures;
  const activeSteps = cfg.howItWorksSteps && cfg.howItWorksSteps.length > 0 ? cfg.howItWorksSteps : defaultSteps;
  const activePlans = cfg.pricingPlans && cfg.pricingPlans.length > 0 ? cfg.pricingPlans : defaultPlans;
  const activeReviews = cfg.testimonialsList && cfg.testimonialsList.length > 0 ? cfg.testimonialsList : defaultReviews;
  const activeFaqs = cfg.faqList && cfg.faqList.length > 0 ? cfg.faqList : defaultFaqs;
  const trustPills =
    cfg.trustPills && cfg.trustPills.length > 0
      ? cfg.trustPills
      : ['✓ No credit card required', '✓ Instant cloud setup', '✓ All 4 portals included'];

  return (
    <div
      className="landing-page-root"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--body-font-color)',
        minHeight: '100vh',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflowX: 'hidden',
        width: '100%',
        maxWidth: '100vw',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        :root {
          --bg-canvas: #F8FAFC;
          --bg-surface: #FFFFFF;
          --bg-subtle: #F1F5F9;
          --border-color: #E2E8F0;
          --border-strong: #CBD5E1;
          --heading-color: #0F172A;
          --body-font-color: #475569;
          --slate: #64748B;
          --primary-color: #10B981;
          --primary-hover-color: #059669;
          --primary-soft: rgba(16, 185, 129, 0.1);
          --primary-border: rgba(16, 185, 129, 0.25);
          --brass: #10B981;
          --card-bg: #FFFFFF;
          --navbar-bg: rgba(255, 255, 255, 0.95);
        }

        [data-theme="dark"] {
          --bg-canvas: #090D16;
          --bg-surface: #0F172A;
          --bg-subtle: #162032;
          --border-color: rgba(255, 255, 255, 0.08);
          --border-strong: rgba(255, 255, 255, 0.16);
          --heading-color: #F8FAFC;
          --body-font-color: #94A3B8;
          --slate: #94A3B8;
          --primary-color: #10B981;
          --primary-hover-color: #34D399;
          --primary-soft: rgba(16, 185, 129, 0.14);
          --primary-border: rgba(16, 185, 129, 0.3);
          --brass: #10B981;
          --card-bg: #0F172A;
          --navbar-bg: rgba(9, 13, 22, 0.95);
        }

        .landing-page-root *,
        .landing-page-root *::before,
        .landing-page-root *::after {
          box-sizing: border-box;
        }

        .announcement-banner {
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-color);
          padding: 8px 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 13px;
          color: var(--heading-color);
          flex-wrap: wrap;
          text-align: center;
        }

        @media (max-width: 640px) {
          .announcement-banner {
            padding: 6px 14px;
            font-size: 11.5px;
            gap: 6px;
          }
        }

        .announcement-pill {
          background: var(--primary-soft);
          color: var(--primary-color);
          border: 1px solid var(--primary-border);
          font-weight: 700;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 9999px;
          text-transform: uppercase;
        }

        .announcement-link {
          color: var(--primary-color);
          font-weight: 600;
          text-decoration: none;
          margin-left: 6px;
        }

        /* ── Sticky Navbar ── */
        .landing-navbar {
          position: sticky;
          top: 0;
          height: 64px;
          background: var(--navbar-bg);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border-color);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 36px;
          width: 100%;
          box-sizing: border-box;
          transition: padding 0.2s ease, height 0.2s ease;
        }

        @media (max-width: 1024px) {
          .landing-navbar {
            padding: 0 20px;
          }
        }

        @media (max-width: 640px) {
          .landing-navbar {
            padding: 0 16px;
            height: 60px;
          }
        }

        .landing-nav-center {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 28px;
        }

        @media (max-width: 960px) {
          .landing-nav-center {
            display: none !important;
          }
        }

        .landing-nav-link {
          color: var(--body-font-color);
          font-size: 13.5px;
          font-weight: 500;
          text-decoration: none;
          transition: color 0.15s ease;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
          margin: 0;
          font-family: inherit;
          line-height: inherit;
          outline: none;
        }

        .landing-nav-link:hover {
          color: var(--primary-color);
        }

        .btn-landing-primary {
          background: var(--primary-color);
          color: #FFFFFF !important;
          font-weight: 600;
          font-size: 13px;
          padding: 8px 18px;
          border-radius: 8px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: none;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(5, 150, 105, 0.25);
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .btn-landing-primary:hover {
          background: var(--primary-hover-color);
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35);
        }

        .btn-landing-outline {
          background: var(--card-bg);
          color: var(--heading-color) !important;
          border: 1px solid var(--border-color);
          font-weight: 600;
          font-size: 13px;
          padding: 8px 16px;
          border-radius: 8px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .btn-landing-outline:hover {
          background: var(--bg-subtle);
          border-color: var(--primary-color);
        }

        .landing-hamburger-btn {
          display: none;
          background: transparent;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          width: 36px;
          height: 36px;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--heading-color);
          transition: all 0.15s ease;
        }

        .landing-hamburger-btn:hover {
          background: var(--bg-subtle);
          border-color: var(--primary-color);
        }

        @media (max-width: 960px) {
          .landing-hamburger-btn {
            display: inline-flex;
          }
        }

        @media (max-width: 640px) {
          .landing-nav-desktop-only {
            display: none !important;
          }
        }

        /* ── Mobile Navigation Drawer ── */
        .landing-mobile-drawer {
          position: fixed;
          top: 64px;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--card-bg);
          z-index: 1001;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 20px 20px 40px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          animation: slideDownMenu 0.22s cubic-bezier(0.16, 1, 0.3, 1);
          border-top: 1px solid var(--border-color);
        }

        @keyframes slideDownMenu {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 640px) {
          .landing-mobile-drawer {
            top: 60px;
          }
        }

        @media (min-width: 961px) {
          .landing-mobile-drawer {
            display: none !important;
          }
        }

        .mobile-nav-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 12px 14px;
          border-radius: 8px;
          background: transparent;
          border: none;
          color: var(--heading-color);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
          text-align: left;
        }

        .mobile-nav-link:hover,
        .mobile-nav-link:active {
          background: var(--bg-subtle);
          color: var(--primary-color);
        }

        .mobile-nav-chevron {
          color: var(--slate);
          font-size: 16px;
        }

        .mobile-portal-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 12px;
          border-radius: 8px;
          background: var(--bg-subtle);
          border: 1px solid var(--border-color);
          color: var(--heading-color);
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          text-align: left;
          transition: border-color 0.15s ease;
        }

        .mobile-portal-btn:hover {
          border-color: var(--primary-color);
        }

        /* ── Hero Section ── */
        .hero-section {
          padding: 64px 32px 48px;
          max-width: 1240px;
          margin: 0 auto;
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
        }

        .hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
          gap: 48px;
          align-items: center;
          width: 100%;
          min-width: 0;
        }

        .hero-text-col,
        .hero-mockup-col {
          min-width: 0;
          max-width: 100%;
          width: 100%;
          box-sizing: border-box;
        }

        @media (max-width: 960px) {
          .hero-section {
            padding: 40px 18px 32px;
          }
          .hero-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 32px;
          }
          .hero-mockup-col {
            max-width: 100%;
            margin: 0 auto;
            width: 100%;
            min-width: 0;
          }
          .hero-text-col,
          .hero-mockup-col {
            animation: fadeIn 0.6s ease both !important;
            transform: none !important;
          }
        }

        @media (max-width: 480px) {
          .hero-section {
            padding: 24px 12px 20px;
          }
          .hero-grid {
            gap: 22px;
          }
          .hero-title {
            font-size: clamp(24px, 7vw, 32px) !important;
            word-break: break-word;
            overflow-wrap: break-word;
          }
          .hero-lead {
            font-size: 14px !important;
            word-break: break-word;
            overflow-wrap: break-word;
            margin-bottom: 20px !important;
          }
          .hero-kicker-pill {
            font-size: 11px !important;
            padding: 5px 10px !important;
            white-space: normal !important;
            line-height: 1.35;
            margin-bottom: 14px !important;
          }
          .hero-cta-group {
            flex-direction: column;
            gap: 10px !important;
          }
          .hero-cta-btn {
            width: 100%;
            justify-content: center;
            padding: 12px 18px !important;
          }
          .hero-trust-pills {
            gap: 8px 12px !important;
            font-size: 11.5px !important;
          }
          .hero-rating-strip {
            font-size: 12px !important;
            gap: 8px !important;
            margin-top: 14px !important;
            padding-top: 14px !important;
          }
        }

        .hero-kicker-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 9999px;
          background: var(--primary-soft);
          border: 1px solid var(--primary-border);
          color: var(--primary-color);
          font-size: 12.5px;
          font-weight: 600;
          letter-spacing: 0.02em;
          margin-bottom: 20px;
          max-width: 100%;
          box-sizing: border-box;
        }

        .hero-title {
          font-size: clamp(26px, 4.5vw, 48px);
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.035em;
          color: var(--heading-color);
          margin-bottom: 18px;
          word-break: break-word;
          overflow-wrap: break-word;
        }

        .hero-lead {
          font-size: clamp(14.5px, 2vw, 16px);
          line-height: 1.65;
          color: var(--slate);
          max-width: 520px;
          margin-bottom: 28px;
          word-break: break-word;
          overflow-wrap: break-word;
        }

        .hero-trust-pills {
          display: flex;
          gap: 12px 18px;
          flex-wrap: wrap;
          font-size: 12.5px;
          color: var(--slate);
        }

        .hero-trust-pill {
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
        }

        .hero-browser-window {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: 0 24px 54px -12px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.04);
          overflow: hidden;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }

        .window-titlebar {
          background: var(--bg-subtle);
          border-bottom: 1px solid var(--border-color);
          padding: 10px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          box-sizing: border-box;
          min-width: 0;
        }

        .mockup-header-row {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          box-sizing: border-box;
          min-width: 0;
        }

        .mockup-header-badge {
          background: rgba(16, 185, 129, 0.12);
          color: #10B981;
          font-weight: 700;
          font-size: 12px;
          padding: 5px 12px;
          border-radius: 9999px;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .mockup-kpi-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-bottom: 1px solid var(--border-color);
          box-sizing: border-box;
          min-width: 0;
        }

        .mockup-kpi-cell {
          padding: 14px 18px;
          box-sizing: border-box;
          min-width: 0;
          overflow: hidden;
        }

        .mockup-kpi-label {
          font-size: 10.5px;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--slate);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mockup-kpi-val {
          font-size: clamp(16px, 3.5vw, 20px);
          font-weight: 800;
          color: var(--heading-color);
        }

        .mockup-kpi-tag {
          font-size: 10.5px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .mockup-activity-section {
          padding: 16px 20px;
          box-sizing: border-box;
          min-width: 0;
        }

        .mockup-activity-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .mockup-activity-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--slate);
        }

        .mockup-activity-status {
          font-size: 11px;
          color: #10B981;
          font-weight: 600;
          white-space: nowrap;
        }

        .mockup-activity-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          background: var(--bg-subtle);
          border-radius: 8px;
          border: 1px solid var(--border-color);
          fontSize: 12px;
          box-sizing: border-box;
          min-width: 0;
        }

        .mockup-activity-badge {
          font-size: 10.5px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 9999px;
          flex-shrink: 0;
          white-space: nowrap;
        }

        @media (max-width: 640px) {
          .mockup-header-row {
            padding: 12px 14px !important;
            gap: 8px !important;
          }
          .mockup-header-badge {
            font-size: 11px !important;
            padding: 4px 8px !important;
          }
          .mockup-kpi-cell {
            padding: 10px 10px !important;
          }
          .mockup-kpi-label {
            font-size: 9.5px !important;
          }
          .mockup-kpi-val {
            font-size: 15px !important;
          }
          .mockup-kpi-tag {
            font-size: 9.5px !important;
            padding: 2px 5px !important;
          }
          .mockup-activity-section {
            padding: 12px 14px !important;
          }
          .mockup-activity-header {
            flex-wrap: wrap !important;
            gap: 4px !important;
            margin-bottom: 10px !important;
          }
          .mockup-activity-row {
            padding: 8px 10px !important;
            gap: 6px !important;
          }
        }

        @media (max-width: 480px) {
          .hero-browser-window {
            border-radius: 12px;
          }
          .window-titlebar {
            padding: 8px 10px;
          }
          .window-url-text {
            max-width: 95px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }

        @media (max-width: 380px) {
          .window-url-bar {
            display: none !important;
          }
          .mockup-header-row {
            padding: 10px 8px !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
          }
          .mockup-header-badge {
            font-size: 10px !important;
            padding: 3px 6px !important;
          }
          .mockup-kpi-cell {
            padding: 8px 6px !important;
          }
          .mockup-kpi-label {
            font-size: 8.5px !important;
          }
          .mockup-kpi-val {
            font-size: 13.5px !important;
          }
          .mockup-kpi-tag {
            font-size: 8.5px !important;
            padding: 1px 3px !important;
          }
          .mockup-activity-section {
            padding: 10px 8px !important;
          }
          .mockup-activity-title {
            font-size: 9.5px !important;
          }
          .mockup-activity-status {
            font-size: 9.5px !important;
          }
          .mockup-activity-row {
            padding: 6px 8px !important;
          }
          .mockup-activity-badge {
            font-size: 9px !important;
            padding: 2px 5px !important;
          }
        }

        /* ── Stat Strip ── */
        .stat-strip {
          background: var(--card-bg);
          border-top: 1px solid var(--border-color);
          border-bottom: 1px solid var(--border-color);
          padding: 40px 24px;
          margin-top: 36px;
        }

        .stat-strip-container {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
          text-align: center;
        }

        @media (max-width: 768px) {
          .stat-strip {
            padding: 28px 16px;
            margin-top: 24px;
          }
          .stat-strip-container {
            grid-template-columns: repeat(2, 1fr);
            gap: 20px 16px;
          }
        }

        @media (max-width: 420px) {
          .stat-strip {
            padding: 22px 12px;
            margin-top: 18px;
          }
          .stat-strip-container {
            gap: 16px 10px;
          }
        }

        .stat-number {
          font-size: clamp(22px, 5vw, 40px);
          font-weight: 800;
          color: var(--heading-color);
          letter-spacing: -0.03em;
        }

        .stat-label {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--slate);
          margin-top: 6px;
          line-height: 1.35;
        }

        /* ── Landing Sections ── */
        .landing-section {
          padding: 72px 24px;
          max-width: 1200px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .landing-section {
            padding: 48px 18px;
          }
        }

        @media (max-width: 480px) {
          .landing-section {
            padding: 36px 14px;
          }
        }

        .section-header {
          margin-bottom: 44px;
        }

        @media (max-width: 640px) {
          .section-header {
            margin-bottom: 28px;
          }
        }

        .section-kicker {
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--primary-color);
          margin-bottom: 8px;
        }

        .section-title {
          font-size: clamp(22px, 3.8vw, 36px);
          font-weight: 800;
          letter-spacing: -0.025em;
          color: var(--heading-color);
          margin-bottom: 12px;
          line-height: 1.2;
        }

        .section-subtitle {
          font-size: clamp(14px, 2vw, 16px);
          line-height: 1.6;
          color: var(--slate);
          max-width: 680px;
          margin: 0;
        }

        /* ── Responsive Grids ── */
        .landing-features-grid {
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
        }

        .landing-steps-grid {
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr));
        }

        .landing-pricing-grid {
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
        }

        @media (max-width: 860px) {
          .landing-pricing-grid {
            grid-template-columns: 1fr;
            max-width: 480px;
            margin: 0 auto;
          }
        }

        .landing-listings-grid {
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
        }

        .landing-testimonials-grid {
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
        }

        .feature-card {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 28px;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          box-sizing: border-box;
        }

        @media (max-width: 640px) {
          .feature-card {
            padding: 20px 18px;
          }
        }

        .feature-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 30px -8px rgba(0, 0, 0, 0.08);
          border-color: var(--primary-color);
        }

        .pricing-card {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 14px;
          padding: 32px 28px;
          position: relative;
          display: flex;
          flex-direction: column;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          opacity: 1 !important;
          visibility: visible !important;
          transform: none !important;
          box-sizing: border-box;
        }

        @media (max-width: 640px) {
          .pricing-card {
            padding: 24px 20px;
          }
        }

        .pricing-card.popular {
          border-color: var(--primary-color);
          box-shadow: 0 16px 36px -10px rgba(5, 150, 105, 0.2);
        }

        .testi-card {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-sizing: border-box;
        }

        @media (max-width: 640px) {
          .testi-card {
            padding: 20px 18px;
          }
        }

        /* ── FAQ ── */
        .faq-item {
          border-bottom: 1px solid var(--border-color);
          padding: 20px 0;
        }

        .faq-question {
          font-size: clamp(14.5px, 2.5vw, 16px);
          font-weight: 700;
          color: var(--heading-color);
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          padding: 0;
        }

        .faq-answer {
          margin-top: 12px;
          font-size: clamp(13.5px, 2vw, 14.5px);
          line-height: 1.65;
          color: var(--slate);
        }

        /* ── CTA Banner ── */
        .cta-banner {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          border-radius: 16px;
          padding: 56px 36px;
          text-align: center;
          color: #FFFFFF;
          box-shadow: 0 20px 48px -12px rgba(5, 150, 105, 0.35);
          box-sizing: border-box;
        }

        .cta-btn-primary {
          background: #FFFFFF !important;
          color: #047857 !important;
          font-weight: 700 !important;
          border: 1px solid #FFFFFF !important;
          border-radius: 8px;
          padding: 12px 28px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
        }
        .cta-btn-primary:hover {
          background: #F0FDF4 !important;
          color: #065F46 !important;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
        }

        .cta-btn-secondary {
          background: rgba(255, 255, 255, 0.12) !important;
          color: #FFFFFF !important;
          font-weight: 600 !important;
          border: 1px solid rgba(255, 255, 255, 0.45) !important;
          border-radius: 8px;
          padding: 12px 28px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
        }
        .cta-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.24) !important;
          border-color: rgba(255, 255, 255, 0.75) !important;
          color: #FFFFFF !important;
          transform: translateY(-2px);
        }

        @media (max-width: 640px) {
          .cta-banner {
            padding: 36px 20px;
            border-radius: 12px;
          }
          .cta-banner-buttons {
            flex-direction: column;
            width: 100%;
          }
          .cta-action-btn {
            width: 100%;
            justify-content: center;
          }
        }

        /* ── Footer ── */
        .footer-landing {
          background-color: #0B1120;
          color: #94A3B8;
          padding: 64px 24px 32px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          box-sizing: border-box;
        }

        [data-theme="dark"] .footer-landing {
          background-color: #090D16;
        }

        .landing-footer-grid {
          grid-template-columns: 2fr 1fr 1fr 1.4fr;
        }

        @media (max-width: 960px) {
          .landing-footer-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 32px 24px !important;
          }
        }

        @media (max-width: 540px) {
          .landing-footer-grid {
            grid-template-columns: 1fr !important;
            gap: 28px !important;
            margin-bottom: 36px !important;
          }
          .footer-landing {
            padding: 44px 16px 28px;
          }
        }

        @media (max-width: 640px) {
          .landing-footer-bottom {
            flex-direction: column;
            align-items: flex-start !important;
            gap: 16px !important;
          }
        }

        /* Listings header wrap */
        @media (max-width: 640px) {
          .listings-section-header {
            flex-direction: column;
            align-items: stretch !important;
            gap: 16px;
            margin-bottom: 24px !important;
          }
          .listings-filter-wrap {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .listings-filter-wrap select {
            width: 100%;
          }
        }

        /* ── Smooth scroll offset (handled in JS, but also native fallback) ── */
        html {
          scroll-behavior: smooth;
        }

        /* ── Entrance animation keyframes ── */
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(32px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
          50%       { box-shadow: 0 0 22px 6px rgba(16,185,129,0.22); }
        }

        /* ── Hero animations (run on load) ── */
        .hero-text-col {
          animation: slideInLeft 0.75s cubic-bezier(0.22,1,0.36,1) both;
        }
        .hero-mockup-col {
          animation: slideInRight 0.75s cubic-bezier(0.22,1,0.36,1) 0.15s both;
        }

        /* ── Scroll-triggered: elements start invisible, JS adds .anim-visible ── */
        .anim-fade-up {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.65s cubic-bezier(0.22,1,0.36,1),
                      transform 0.65s cubic-bezier(0.22,1,0.36,1);
        }
        .anim-fade-up.anim-visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Stagger children inside a stagger-container */
        .stagger-container .anim-fade-up:nth-child(1)  { transition-delay: 0s; }
        .stagger-container .anim-fade-up:nth-child(2)  { transition-delay: 0.08s; }
        .stagger-container .anim-fade-up:nth-child(3)  { transition-delay: 0.16s; }
        .stagger-container .anim-fade-up:nth-child(4)  { transition-delay: 0.24s; }
        .stagger-container .anim-fade-up:nth-child(5)  { transition-delay: 0.32s; }
        .stagger-container .anim-fade-up:nth-child(6)  { transition-delay: 0.40s; }

        /* Hero browser window pulse */
        .hero-browser-window {
          animation: pulse-glow 4s ease-in-out 1.5s infinite;
        }

        /* Floating stat strip numbers count-up feel */
        .stat-number {
          animation: fadeIn 0.8s ease 0.3s both;
        }
      `}</style>

      {/* 0. Top Announcement Banner (controlled via CMS) */}
      {cfg.announcement?.enabled && cfg.sections?.showAnnouncement !== false && (
        <div className="announcement-banner">
          <span className="announcement-pill">{cfg.announcement.badge || 'New'}</span>
          <span>{cfg.announcement.text}</span>
          {cfg.announcement.linkText && (
            <a href={cfg.announcement.linkUrl || '#features'} className="announcement-link">
              {cfg.announcement.linkText}
            </a>
          )}
        </div>
      )}

      {/* 1. Header / Navbar */}
      <nav className="landing-navbar" id="mainNav">
        {/* Left: Brand Logo */}
        <div
          onClick={() => {
            setMobileMenuOpen(false);
            navigate('/');
          }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px', zIndex: 1002 }}
        >
          {cfg.faviconUrl ? (
            <img
              src={cfg.faviconUrl}
              alt="Logo"
              style={{ width: '25px', height: '25px', objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <PropithubIcon size={25} color="var(--primary-color, #10B981)" />
          )}
          <span
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '21px',
              fontWeight: 800,
              letterSpacing: '-0.5px',
              color: 'var(--heading-color)',
            }}
          >
            {cfg.brandName || 'propit'}
            <span style={{ color: 'var(--brass, #10B981)' }}>{cfg.brandAccent || 'hub'}</span>
          </span>
        </div>

        {/* Center: Navigation Links (desktop) */}
        <div className="landing-nav-center">
          {cfg.sections?.showFeatures !== false && (
            <button type="button" className="landing-nav-link" onClick={() => smoothScrollTo('features')}>
              Features
            </button>
          )}
          {cfg.sections?.showHowItWorks !== false && (
            <button type="button" className="landing-nav-link" onClick={() => smoothScrollTo('how-it-works')}>
              How It Works
            </button>
          )}
          {cfg.sections?.showPricing !== false && (
            <button type="button" className="landing-nav-link" onClick={() => smoothScrollTo('pricing')}>
              Pricing
            </button>
          )}
          {cfg.sections?.showListings !== false && (
            <button type="button" className="landing-nav-link" onClick={() => smoothScrollTo('listings')}>
              Available Listings
            </button>
          )}
          {cfg.sections?.showTestimonials !== false && (
            <button type="button" className="landing-nav-link" onClick={() => smoothScrollTo('testimonials')}>
              Reviews
            </button>
          )}
          {cfg.sections?.showFaq !== false && (
            <button type="button" className="landing-nav-link" onClick={() => smoothScrollTo('faq')}>
              FAQ
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', zIndex: 1002 }}>
          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--body-font-color)',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
          >
            {theme === 'dark' ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>

          {user ? (
            <button
              type="button"
              className="btn-landing-primary"
              onClick={() => {
                if (user.role === 'superadmin') navigate('/superadmin/overview');
                else if (user.role === 'owner') navigate('/owner/dashboard');
                else if (user.role === 'tenant') navigate('/tenant/dashboard');
                else if (user.role === 'manager') navigate('/manager/dashboard');
                else if (user.role === 'staff') navigate('/staff/dashboard');
                else navigate('/login');
              }}
            >
              Dashboard →
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-landing-outline landing-nav-desktop-only"
                onClick={() => navigate('/login')}
              >
                Sign In
              </button>
              <button
                type="button"
                className="btn-landing-primary landing-nav-desktop-only"
                onClick={() => navigate('/register')}
              >
                Start Free Trial →
              </button>
            </>
          )}

          {/* Hamburger toggle button for screen widths <= 960px */}
          <button
            type="button"
            className="landing-hamburger-btn"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="landing-mobile-drawer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate)', paddingLeft: '8px' }}>
              Explore Propithub
            </span>
            {cfg.sections?.showFeatures !== false && (
              <button
                type="button"
                className="mobile-nav-link"
                onClick={() => smoothScrollTo('features')}
              >
                <span>Features</span>
                <span className="mobile-nav-chevron">→</span>
              </button>
            )}
            {cfg.sections?.showHowItWorks !== false && (
              <button
                type="button"
                className="mobile-nav-link"
                onClick={() => smoothScrollTo('how-it-works')}
              >
                <span>How It Works</span>
                <span className="mobile-nav-chevron">→</span>
              </button>
            )}
            {cfg.sections?.showPricing !== false && (
              <button
                type="button"
                className="mobile-nav-link"
                onClick={() => smoothScrollTo('pricing')}
              >
                <span>Pricing Plans</span>
                <span className="mobile-nav-chevron">→</span>
              </button>
            )}
            {cfg.sections?.showListings !== false && (
              <button
                type="button"
                className="mobile-nav-link"
                onClick={() => smoothScrollTo('listings')}
              >
                <span>Available Listings</span>
                <span className="mobile-nav-chevron">→</span>
              </button>
            )}
            {cfg.sections?.showTestimonials !== false && (
              <button
                type="button"
                className="mobile-nav-link"
                onClick={() => smoothScrollTo('testimonials')}
              >
                <span>Reviews & Stories</span>
                <span className="mobile-nav-chevron">→</span>
              </button>
            )}
            {cfg.sections?.showFaq !== false && (
              <button
                type="button"
                className="mobile-nav-link"
                onClick={() => smoothScrollTo('faq')}
              >
                <span>Frequently Asked Questions</span>
                <span className="mobile-nav-chevron">→</span>
              </button>
            )}
          </div>

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

          {/* Quick Portals */}
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate)', paddingLeft: '8px', display: 'block', marginBottom: '8px' }}>
              Portals & Desks
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <button
                type="button"
                className="mobile-portal-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/login');
                }}
              >
                <span>🔑</span>
                <span>Owner Portal</span>
              </button>
              <button
                type="button"
                className="mobile-portal-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/login');
                }}
              >
                <span>🏡</span>
                <span>Tenant Portal</span>
              </button>
              <button
                type="button"
                className="mobile-portal-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/login');
                }}
              >
                <span>🛠️</span>
                <span>Maintainer Desk</span>
              </button>
              <button
                type="button"
                className="mobile-portal-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/contact');
                }}
              >
                <span>💬</span>
                <span>Contact Desk</span>
              </button>
            </div>
          </div>

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

          {/* Mobile Auth Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
            {user ? (
              <button
                type="button"
                className="btn-landing-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '13px' }}
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (user.role === 'superadmin') navigate('/superadmin/overview');
                  else if (user.role === 'owner') navigate('/owner/dashboard');
                  else if (user.role === 'tenant') navigate('/tenant/dashboard');
                  else if (user.role === 'manager') navigate('/manager/dashboard');
                  else if (user.role === 'staff') navigate('/staff/dashboard');
                  else navigate('/login');
                }}
              >
                Go to Dashboard →
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-landing-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '14px' }}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/register');
                  }}
                >
                  Start 14-Day Free Trial →
                </button>
                <button
                  type="button"
                  className="btn-landing-outline"
                  style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '14px' }}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/login');
                  }}
                >
                  Sign In to Account
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 2. Hero Section connected to state.landingConfig */}
      {cfg.sections?.showHero !== false && (
        <section className="hero-section">
          <div className="hero-grid">
            <div className="hero-text-col">
              <div className="hero-kicker-pill">
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    background: '#10B981',
                    borderRadius: '50%',
                    boxShadow: '0 0 8px #10B981',
                  }}
                />
                {cfg.heroKicker || 'PropTech 4.6 • Enterprise Cloud Property OS'}
              </div>
              <h1 className="hero-title">
                {cfg.headline || 'Smart Property Management for the Modern Era'}
              </h1>
              <p className="hero-lead">
                {cfg.subheadline ||
                  'Streamline leasing, automate rent collection, assign maintenance, and manage tenants from one unified cloud platform. Owned & Developed by NEBZA Technologies Private Limited.'}
              </p>
              <div className="hero-cta-group" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '24px' }}>
                <button
                  type="button"
                  className="btn-landing-primary hero-cta-btn"
                  style={{ padding: '12px 24px', fontSize: '14px' }}
                  onClick={() => navigate(cfg.ctaLink || '/register')}
                >
                  {cfg.ctaText || 'Start 14-Day Free Trial →'}
                </button>
                <button
                  type="button"
                  className="btn-landing-outline hero-cta-btn"
                  style={{ padding: '12px 22px', fontSize: '14px' }}
                  onClick={() => navigate(cfg.secondaryCtaLink || '/login')}
                >
                  {cfg.secondaryCtaText || 'Sign In to Portal'}
                </button>
              </div>
              <div
                className="hero-trust-pills"
                style={{
                  display: 'flex',
                  gap: '12px 18px',
                  flexWrap: 'wrap',
                  fontSize: '12.5px',
                  color: 'var(--slate)',
                }}
              >
                {trustPills.map((pill, i) => (
                  <span key={i} className="hero-trust-pill">{pill}</span>
                ))}
              </div>
              <div
                className="hero-rating-strip"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '18px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-color)',
                  fontSize: '13px',
                  color: 'var(--slate)',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ color: '#F59E0B', letterSpacing: '2px', flexShrink: 0 }}>★★★★★</span>
                <span style={{ minWidth: 0, wordBreak: 'break-word' }}>
                  <b>4.9/5</b> {cfg.ratingText || 'rated across 24 countries by property teams'}
                </span>
              </div>
            </div>

            {/* Hero Browser Window Mockup */}
            <div className="hero-mockup-col">
              <div className="hero-browser-window">
                <div className="window-titlebar">
                  <div style={{ display: 'flex', gap: '7px', flexShrink: 0 }}>
                    <span
                      style={{
                        width: '11px',
                        height: '11px',
                        borderRadius: '50%',
                        background: '#FF5F56',
                        display: 'inline-block',
                      }}
                    />
                    <span
                      style={{
                        width: '11px',
                        height: '11px',
                        borderRadius: '50%',
                        background: '#FFBD2E',
                        display: 'inline-block',
                      }}
                    />
                    <span
                      style={{
                        width: '11px',
                        height: '11px',
                        borderRadius: '50%',
                        background: '#27C93F',
                        display: 'inline-block',
                      }}
                    />
                  </div>
                  <div
                    className="window-url-bar"
                    style={{
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '9999px',
                      padding: '3px 14px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: 'var(--slate)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      minWidth: 0,
                    }}
                  >
                    <span style={{ color: '#10B981', flexShrink: 0 }}>🔒</span>
                    <span className="window-url-text">propithub.app/owner/dashboard</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      color: '#10B981',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: '#10B981',
                        boxShadow: '0 0 8px #10B981',
                      }}
                    />
                    Live OS
                  </div>
                </div>

                {/* Window Content */}
                <div
                  className="mockup-header-row"
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--heading-color)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {cfg.heroMockup?.propertyName || 'Sunset Heights Luxury Residences'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--slate)', marginTop: '2px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {cfg.heroMockup?.locationText || 'Springfield, IL • 24 Units • Automated Ledger'}
                    </div>
                  </div>
                  <span
                    className="mockup-header-badge"
                  >
                    {cfg.heroMockup?.badgeText || '✓ 96.4% Occupied'}
                  </span>
                </div>

                {/* 4 KPIs */}
                <div
                  className="mockup-kpi-grid"
                >
                  <div
                    className="mockup-kpi-cell"
                    style={{
                      borderRight: '1px solid var(--border-color)',
                      borderBottom: '1px solid var(--border-color)',
                    }}
                  >
                    <div
                      className="mockup-kpi-label"
                    >
                      Properties / Units
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span className="mockup-kpi-val">
                        12 / 48
                      </span>
                      <span
                        className="mockup-kpi-tag"
                        style={{
                          color: '#10B981',
                          background: 'rgba(16, 185, 129, 0.12)',
                        }}
                      >
                        +2 new
                      </span>
                    </div>
                  </div>
                  <div
                    className="mockup-kpi-cell"
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                    }}
                  >
                    <div
                      className="mockup-kpi-label"
                    >
                      Month Collections
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span className="mockup-kpi-val">
                        $38,450
                      </span>
                      <span
                        className="mockup-kpi-tag"
                        style={{
                          color: '#10B981',
                          background: 'rgba(16, 185, 129, 0.12)',
                        }}
                      >
                        +12.4%
                      </span>
                    </div>
                  </div>
                  <div className="mockup-kpi-cell" style={{ borderRight: '1px solid var(--border-color)' }}>
                    <div
                      className="mockup-kpi-label"
                    >
                      Active Leases
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span className="mockup-kpi-val">
                        46 Active
                      </span>
                      <span
                        className="mockup-kpi-tag"
                        style={{
                          color: '#D97706',
                          background: 'rgba(245, 158, 11, 0.12)',
                        }}
                      >
                        2 renewal
                      </span>
                    </div>
                  </div>
                  <div className="mockup-kpi-cell">
                    <div
                      className="mockup-kpi-label"
                    >
                      Maintenance SLA
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span className="mockup-kpi-val">
                        0 Open
                      </span>
                      <span
                        className="mockup-kpi-tag"
                        style={{
                          color: '#10B981',
                          background: 'rgba(16, 185, 129, 0.12)',
                        }}
                      >
                        100% Repaired
                      </span>
                    </div>
                  </div>
                </div>

                {/* Reconciled Activities */}
                <div className="mockup-activity-section">
                  <div
                    className="mockup-activity-header"
                  >
                    <span
                      className="mockup-activity-title"
                    >
                      Recent Reconciled Activity
                    </span>
                    <span className="mockup-activity-status">
                      ⚡ Auto-reconciled
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    <div
                      className="mockup-activity-row"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
                        <span
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10B981',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          💵
                        </span>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 600, color: 'var(--heading-color)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            Unit 4B • Alice Tenant
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--slate)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            $1,450.00 via Stripe Gateway
                          </div>
                        </div>
                      </div>
                      <span
                        className="mockup-activity-badge"
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10B981',
                        }}
                      >
                        Paid
                      </span>
                    </div>
                    <div
                      className="mockup-activity-row"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
                        <span
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#3B82F6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          🔧
                        </span>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 600, color: 'var(--heading-color)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            Unit 12 • HVAC Service
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--slate)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            Staff Maintainer assigned
                          </div>
                        </div>
                      </div>
                      <span
                        className="mockup-activity-badge"
                        style={{
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#3B82F6',
                        }}
                      >
                        Resolved
                      </span>
                    </div>
                    <div
                      className="mockup-activity-row"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
                        <span
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'rgba(168, 85, 247, 0.15)',
                            color: '#A855F7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          📄
                        </span>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 600, color: 'var(--heading-color)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            Unit 8 • Digital Lease Agreement
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--slate)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            12-Month Renewal Approved & Active
                          </div>
                        </div>
                      </div>
                      <span
                        className="mockup-activity-badge"
                        style={{
                          background: 'rgba(168, 85, 247, 0.15)',
                          color: '#A855F7',
                        }}
                      >
                        Active
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. Impact Stats Strip connected to state.landingConfig.stats */}
      {cfg.sections?.showStats !== false && (
        <div className="stat-strip">
          <div className="stat-strip-container">
            <div>
              <div className="stat-number">{cfg.stats?.stat1Number || '15,000+'}</div>
              <div className="stat-label">{cfg.stats?.stat1Label || 'Properties on the ledger'}</div>
            </div>
            <div>
              <div className="stat-number">{cfg.stats?.stat2Number || '45,000+'}</div>
              <div className="stat-label">{cfg.stats?.stat2Label || 'Tenants connected'}</div>
            </div>
            <div>
              <div className="stat-number">{cfg.stats?.stat3Number || '$120M+'}</div>
              <div className="stat-label">{cfg.stats?.stat3Label || 'Collected annually'}</div>
            </div>
            <div>
              <div className="stat-number">{cfg.stats?.stat4Number || '99.98%'}</div>
              <div className="stat-label">{cfg.stats?.stat4Label || 'Platform uptime'}</div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Features Section connected to state.landingConfig */}
      {cfg.sections?.showFeatures !== false && (
        <section className="landing-section" id="features">
          <div className="section-header anim-fade-up">
            <div className="section-kicker">{cfg.featuresKicker || "What's inside"}</div>
            <h2 className="section-title">{cfg.featuresTitle || 'Six jobs, one ledger'}</h2>
            <p className="section-subtitle">
              {cfg.featuresSubtitle ||
                'Everything an owner, a tenant, and a maintainer each need to do — reading from the same set of records, so no one is working off an outdated spreadsheet.'}
            </p>
          </div>

          <div
            className="stagger-container landing-features-grid"
            style={{
              display: 'grid',
              gap: '24px',
            }}
          >
            {activeFeatures.map((f) => (
              <div className="feature-card anim-fade-up" key={f.id}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: 'var(--primary-soft)',
                    color: 'var(--primary-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    marginBottom: '16px',
                  }}
                >
                  {f.icon || '⚡'}
                </div>
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--heading-color)',
                    marginBottom: '8px',
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--slate)', margin: 0 }}>
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. How It Works Section connected to state.landingConfig */}
      {cfg.sections?.showHowItWorks !== false && (
        <section
          style={{
            background: 'var(--bg-subtle)',
            borderTop: '1px solid var(--border-color)',
            borderBottom: '1px solid var(--border-color)',
            padding: '72px 24px',
          }}
          id="how-it-works"
        >
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div className="section-header anim-fade-up">
              <div className="section-kicker">{cfg.howItWorksKicker || 'Getting started'}</div>
              <h2 className="section-title">
                {cfg.howItWorksTitle || 'Three afternoons, not three months'}
              </h2>
              <p className="section-subtitle">
                {cfg.howItWorksSubtitle ||
                  'Most owners are collecting their first online rent payment inside a week.'}
              </p>
            </div>

            <div
              className="stagger-container landing-steps-grid"
              style={{
                display: 'grid',
                gap: '24px',
              }}
            >
              {activeSteps.map((step) => (
                <div
                  key={step.id}
                  className="anim-fade-up"
                  style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '28px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '14px',
                    }}
                  >
                    <span
                      style={{
                        background: 'var(--primary-soft)',
                        color: 'var(--primary-color)',
                        fontWeight: 700,
                        fontSize: '12px',
                        padding: '4px 10px',
                        borderRadius: '9999px',
                      }}
                    >
                      Step {step.stepNumber}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--slate)', fontWeight: 700 }}>
                      {step.stepNumber}
                    </span>
                  </div>
                  <h3
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: 'var(--heading-color)',
                      marginBottom: '8px',
                    }}
                  >
                    {step.title}
                  </h3>
                  <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--slate)', margin: 0 }}>
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 6. Pricing Packages Section directly powered by state.plans */}
      {cfg.sections?.showPricing !== false && (
        <section className="landing-section" id="pricing">
          <div className="section-header anim-fade-up">
            <div className="section-kicker">{cfg.pricingKicker || 'Plans'}</div>
            <h2 className="section-title">
              {cfg.pricingTitle || 'Priced by the size of your portfolio'}
            </h2>
            <p className="section-subtitle">
              {cfg.pricingSubtitle ||
                'Every plan includes the full ledger — invoicing, leases, payments, and messaging. Upgrade as your unit count grows.'}
            </p>
          </div>

          <div
            className="stagger-container landing-pricing-grid"
            style={{
              display: 'grid',
              gap: '24px',
            }}
          >
            {state.plans
              .filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial')
              .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))
              .map((plan, idx, arr) => {
                const hasExplicitPopular = arr.some((p) => p.isPopular);
                const isPopular = hasExplicitPopular
                  ? !!plan.isPopular
                  : (plan.name.toLowerCase() === 'growth' || (arr.length > 2 && idx === 1));
                return (
                  <div
                    key={plan.id}
                    className={`pricing-card ${isPopular ? 'popular' : ''}`}
                  >
                    {isPopular && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '-13px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                        }}
                      >
                        <span
                          style={{
                            background: 'var(--primary-color)',
                            color: '#FFFFFF',
                            padding: '4px 14px',
                            borderRadius: '9999px',
                            fontSize: '11px',
                            fontWeight: 800,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                          }}
                        >
                          Most Popular
                        </span>
                      </div>
                    )}
                    <div style={{ marginBottom: '16px' }}>
                      <span
                        style={{
                          background: isPopular ? 'var(--primary-soft)' : 'var(--bg-subtle)',
                          color: isPopular ? 'var(--primary-color)' : 'var(--heading-color)',
                          border: isPopular ? 'none' : '1px solid var(--border-color)',
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      >
                        {plan.name}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '16px' }}>
                        <span style={{ fontSize: '36px', fontWeight: 800, color: 'var(--heading-color)' }}>
                          ${plan.price}
                        </span>
                        <span style={{ fontSize: '14px', color: 'var(--slate)' }}>/month</span>
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--slate)', marginTop: '4px' }}>
                        {plan.name.toLowerCase() === 'starter'
                          ? 'Essential management for independent landlords.'
                          : plan.name.toLowerCase() === 'growth'
                          ? 'Scale multi-family portfolios with full automation.'
                          : 'Full enterprise suite for large property management firms.'}
                      </p>
                    </div>
                    <hr
                      style={{
                        border: 'none',
                        borderTop: '1px solid var(--border-color)',
                        margin: '14px 0',
                      }}
                    />
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        fontSize: '13.5px',
                        color: 'var(--body-font-color)',
                        flexGrow: 1,
                      }}
                    >
                      <li>
                        ✓ <strong>{plan.properties >= 999 ? 'Unlimited' : plan.properties}</strong>{' '}
                        {plan.properties === 1 ? 'Property' : 'Properties'}
                      </li>
                      <li>
                        ✓ <strong>{plan.units >= 9999 ? 'Unlimited' : plan.units}</strong> Rental Units
                      </li>
                      <li>
                        ✓ <strong>{plan.tenants >= 9999 ? 'Unlimited' : plan.tenants}</strong> Tenants Connected
                      </li>
                      <li>
                        ✓ <strong>{plan.managers ?? 0}</strong> Property Managers
                      </li>
                      <li>
                        ✓ <strong>{plan.staff ?? 0}</strong> Maintenance Staff Members
                      </li>
                      <li>✓ Automated recurring invoices & rent ledger</li>
                      <li>✓ Digital lease agreements & e-signatures</li>
                      <li>✓ Online payment gateways & tenant portal</li>
                    </ul>
                    <button
                      type="button"
                      className={isPopular ? 'btn-landing-primary' : 'btn-landing-outline'}
                      style={{ marginTop: '24px', width: '100%', justifyContent: 'center' }}
                      onClick={() => navigate('/register')}
                    >
                      Choose {plan.name}
                    </button>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* 7. Available Vacant Listings Section */}
      {cfg.sections?.showListings !== false && (
        <section className="landing-section" id="listings" style={{ borderTop: '1px solid var(--border-color)' }}>
          <div
            className="listings-section-header"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginBottom: '36px',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <div className="section-kicker">{cfg.listingsKicker || 'Vacant Units'}</div>
              <h2 className="section-title" style={{ margin: 0 }}>
                {cfg.listingsTitle || 'Available Listings'}
              </h2>
              <p className="section-subtitle" style={{ marginTop: '4px' }}>
                {cfg.listingsSubtitle || 'Direct verified rentals from property owners across Propithub'}
              </p>
            </div>
            <div className="listings-filter-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--slate)', fontWeight: 500 }}>
                Filter by Country:
              </span>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: 'var(--card-bg)',
                  color: 'var(--heading-color)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              >
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            className="landing-listings-grid"
            style={{
              display: 'grid',
              gap: '24px',
            }}
          >
            {filteredUnits.length === 0 ? (
              <div
                style={{
                  gridColumn: '1/-1',
                  textAlign: 'center',
                  padding: '48px 0',
                  color: 'var(--slate)',
                }}
              >
                No active vacant listings found in this country.
              </div>
            ) : (
              filteredUnits.map((u) => (
                <div
                  key={u.id}
                  style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      height: '180px',
                      backgroundImage: `url(${
                        (u.images && u.images[0]) ||
                        u.image ||
                        (u.currency === '$'
                          ? 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600&q=80'
                          : u.currency === '£'
                          ? 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80'
                          : 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&q=80')
                      })`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      position: 'relative',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span
                      style={{
                        background: 'rgba(0,0,0,0.65)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      Unit {u.unitNumber}
                    </span>
                    <span
                      style={{
                        background: 'var(--primary-color)',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '4px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      Vacant
                    </span>
                  </div>
                  <div
                    style={{
                      padding: '20px',
                      flexGrow: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '20px',
                          fontWeight: 800,
                          color: 'var(--heading-color)',
                        }}
                      >
                        {u.currency}
                        {u.rent.toLocaleString()}
                        <span style={{ fontSize: '12.5px', fontWeight: 400, color: 'var(--slate)' }}>
                          {' '}
                          / month
                        </span>
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '14.5px',
                          color: 'var(--heading-color)',
                          marginTop: '6px',
                        }}
                      >
                        {u.propertyName}
                      </div>
                      <div
                        style={{
                          fontSize: '12.5px',
                          color: 'var(--slate)',
                          marginTop: '4px',
                          lineHeight: '1.4',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minHeight: '35px',
                        }}
                        title={u.address}
                      >
                        {u.address}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--primary-color)',
                          fontWeight: 600,
                          marginTop: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>📍</span>
                        <span>{resolveDisplayLocation(u.address, u.country)}</span>
                      </div>
                      {(() => {
                        const prop = state.properties.find((p) => p.id === u.propertyId || p.name === u.propertyName);
                        if (!prop || !prop.amenities || prop.amenities.length === 0) return null;
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                            {prop.amenities.slice(0, 3).map((am) => (
                              <span
                                key={am}
                                style={{
                                  fontSize: '11px',
                                  background: 'var(--surface, #f8f9fa)',
                                  border: '1px solid var(--border, #e9ecef)',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                  color: 'var(--slate, #6c757d)',
                                }}
                              >
                                {am}
                              </span>
                            ))}
                            {prop.amenities.length > 3 && (
                              <span style={{ fontSize: '10.5px', color: 'var(--slate, #6c757d)', alignSelf: 'center' }}>
                                +{prop.amenities.length - 3} more
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      type="button"
                      className="btn-landing-outline"
                      style={{ marginTop: '16px', width: '100%', justifyContent: 'center' }}
                      onClick={() => navigate('/login')}
                    >
                      Enquire — Sign In to View Lease
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* 8. Testimonials Section connected to state.landingConfig */}
      {cfg.sections?.showTestimonials !== false && (
        <section
          style={{
            background: 'var(--bg-subtle)',
            borderTop: '1px solid var(--border-color)',
            borderBottom: '1px solid var(--border-color)',
            padding: '72px 24px',
          }}
          id="testimonials"
        >
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div className="section-header anim-fade-up">
              <div className="section-kicker">
                {cfg.testimonialsKicker || 'From the ledger’s users'}
              </div>
              <h2 className="section-title">
                {cfg.testimonialsTitle || 'Owners, managers, and tenants on propithub'}
              </h2>
              <p className="section-subtitle">
                {cfg.testimonialsSubtitle ||
                  'Everything an owner, a tenant, and a maintainer each need to do — reading from the same set of records.'}
              </p>
            </div>

            <div
              className="stagger-container landing-testimonials-grid"
              style={{
                display: 'grid',
                gap: '24px',
              }}
            >
              {activeReviews.map((testi) => (
                <div className="testi-card anim-fade-up" key={testi.id}>
                  <div>
                    <div
                      style={{
                        color: '#F59E0B',
                        letterSpacing: '2px',
                        marginBottom: '14px',
                        fontSize: '14px',
                      }}
                    >
                      {'★'.repeat(testi.stars || 5)}
                    </div>
                    <p
                      style={{
                        fontSize: '15px',
                        lineHeight: 1.65,
                        color: 'var(--heading-color)',
                        fontStyle: 'italic',
                        marginBottom: '20px',
                      }}
                    >
                      {testi.quote}
                    </p>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      paddingTop: '14px',
                      borderTop: '1px solid var(--border-color)',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: testi.avatarBg || 'var(--primary-color)',
                        color: testi.avatarColor || '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '15px',
                        overflow: 'hidden',
                        flexShrink: 0,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                      }}
                    >
                      {testi.avatarUrl ? (
                        <img
                          src={testi.avatarUrl}
                          alt={testi.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <span>{testi.avatarIcon || (testi.name ? testi.name.charAt(0).toUpperCase() : 'U')}</span>
                      )}
                    </div>
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '14px',
                          color: 'var(--heading-color)',
                        }}
                      >
                        {testi.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--slate)' }}>
                        {testi.role}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 9. FAQ Section connected to state.landingConfig */}
      {cfg.sections?.showFaq !== false && (
        <section className="landing-section" id="faq">
          <div className="section-header anim-fade-up" style={{ textAlign: 'center', margin: '0 auto 44px' }}>
            <div className="section-kicker">{cfg.faqKicker || 'Questions'}</div>
            <h2 className="section-title">{cfg.faqTitle || 'Frequently Asked Questions'}</h2>
            <p className="section-subtitle">
              {cfg.faqSubtitle ||
                'Everything you need to know about Propithub features, billing, and security.'}
            </p>
          </div>

          <div style={{ maxWidth: '780px', margin: '0 auto' }}>
            {activeFaqs.map((f, idx) => (
              <div key={idx} className="faq-item">
                <button
                  type="button"
                  className="faq-question"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <span>{f.question}</span>
                  <span style={{ fontSize: '18px', color: 'var(--primary-color)' }}>
                    {openFaq === idx ? '−' : '+'}
                  </span>
                </button>
                {openFaq === idx && <div className="faq-answer">{f.answer}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 10. Call To Action Banner */}
      {cfg.sections?.showCtaBanner !== false && (
        <section style={{ padding: '0 24px 72px', maxWidth: '1200px', margin: '0 auto', boxSizing: 'border-box' }}>
          <div className="cta-banner">
            <h2
              style={{
                fontSize: 'clamp(22px, 3.8vw, 36px)',
                fontWeight: 800,
                color: '#FFFFFF',
                letterSpacing: '-0.025em',
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              {cfg.ctaBannerTitle || 'Ready to close the books on manual rent collection?'}
            </h2>
            <p
              style={{
                color: '#A7F3D0',
                maxWidth: '600px',
                margin: '14px auto 28px',
                lineHeight: 1.6,
                fontSize: '15px',
              }}
            >
              {cfg.ctaBannerSubtitle ||
                'Join the owners, managers, and firms already running their portfolio on propithub.'}
            </p>
            <div className="cta-banner-buttons" style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="cta-btn-primary cta-action-btn"
                onClick={() => navigate(cfg.ctaBannerPrimaryLink || '/register')}
              >
                {cfg.ctaBannerPrimaryText || 'Register as a property owner'}
              </button>
              <button
                type="button"
                className="cta-btn-secondary cta-action-btn"
                onClick={() => navigate(cfg.ctaBannerSecondaryLink || '/login')}
              >
                {cfg.ctaBannerSecondaryText || 'Sign in to your portal'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 11. Grounded Midnight SaaS Footer */}
      {cfg.sections?.showFooter !== false && (
        <footer className="footer-landing">
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div
              className="landing-footer-grid"
              style={{
                display: 'grid',
                gap: '36px',
                marginBottom: '48px',
              }}
            >
              {/* Brand & Corporate */}
              <div style={{ gridColumn: 'span 1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '14px' }}>
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
                  <span
                    style={{
                      fontSize: '22px',
                      fontWeight: 800,
                      color: '#FFFFFF',
                      letterSpacing: '-0.5px',
                    }}
                  >
                    {cfg.brandName || 'propit'}
                    <span style={{ color: '#10B981' }}>{cfg.brandAccent || 'hub'}</span>
                  </span>
                </div>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#94A3B8', marginBottom: '16px' }}>
                  {cfg.footerBrandDescription ||
                    'Enterprise cloud property management platform engineered to streamline leasing, automate billing, and connect owners, tenants, and maintenance crews.'}
                </p>
                <div
                  style={{
                    fontSize: '12.5px',
                    color: '#94A3B8',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div>
                    <strong>Owner:</strong>{' '}
                    {cfg.footerCompanyName || 'NEBZA Technologies Private Limited'}
                  </div>
                  <div>
                    <strong>Email:</strong> {cfg.footerEmail || 'admin@propithub.com'}
                  </div>
                  <div>
                    <strong>Phone:</strong> {cfg.footerPhone || '+1 (555) 010-0001'}
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div>
                <h5
                  style={{
                    color: '#F8FAFC',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '16px',
                  }}
                >
                  Navigation
                </h5>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    fontSize: '13px',
                  }}
                >
                  {cfg.sections?.showFeatures !== false && (
                    <li>
                      <a href="#features" style={{ color: '#94A3B8', textDecoration: 'none' }}>
                        Features
                      </a>
                    </li>
                  )}
                  {cfg.sections?.showHowItWorks !== false && (
                    <li>
                      <a href="#how-it-works" style={{ color: '#94A3B8', textDecoration: 'none' }}>
                        How It Works
                      </a>
                    </li>
                  )}
                  {cfg.sections?.showPricing !== false && (
                    <li>
                      <a href="#pricing" style={{ color: '#94A3B8', textDecoration: 'none' }}>
                        Pricing Plans
                      </a>
                    </li>
                  )}
                  {cfg.sections?.showListings !== false && (
                    <li>
                      <a href="#listings" style={{ color: '#94A3B8', textDecoration: 'none' }}>
                        Available Listings
                      </a>
                    </li>
                  )}
                  {cfg.sections?.showTestimonials !== false && (
                    <li>
                      <a href="#testimonials" style={{ color: '#94A3B8', textDecoration: 'none' }}>
                        Reviews
                      </a>
                    </li>
                  )}
                  {cfg.sections?.showFaq !== false && (
                    <li>
                      <a href="#faq" style={{ color: '#94A3B8', textDecoration: 'none' }}>
                        FAQs
                      </a>
                    </li>
                  )}
                </ul>
              </div>

              {/* Portals */}
              <div>
                <h5
                  style={{
                    color: '#F8FAFC',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '16px',
                  }}
                >
                  Portals
                </h5>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    fontSize: '13px',
                  }}
                >
                  <li>
                    <a
                      href="/login"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('/login');
                      }}
                      style={{ color: '#94A3B8', textDecoration: 'none' }}
                    >
                      Owner Portal
                    </a>
                  </li>
                  <li>
                    <a
                      href="/login"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('/login');
                      }}
                      style={{ color: '#94A3B8', textDecoration: 'none' }}
                    >
                      Tenant Portal
                    </a>
                  </li>
                  <li>
                    <a
                      href="/login"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('/login');
                      }}
                      style={{ color: '#94A3B8', textDecoration: 'none' }}
                    >
                      Maintainer Desk
                    </a>
                  </li>
                  <li>
                    <a
                      href="/register"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate('/register');
                      }}
                      style={{ color: '#94A3B8', textDecoration: 'none' }}
                    >
                      Owner Sign Up
                    </a>
                  </li>
                </ul>
              </div>

              {/* Security & Cloud Badge */}
              <div>
                <h5
                  style={{
                    color: '#F8FAFC',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '16px',
                  }}
                >
                  Security & Cloud
                </h5>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#94A3B8', marginBottom: 0 }}>
                  Enterprise-grade security with role-based access control, automated ledger accounting, and encrypted communication.
                </p>
              </div>
            </div>

            {/* Bottom Copyright Strip */}
            <div
              className="landing-footer-bottom"
              style={{
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                paddingTop: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                fontSize: '12.5px',
                color: '#64748B',
              }}
            >
              <div>
                {cfg.footerCopyright || (
                  <>
                    © 2026 <strong>Propithub</strong>. Owned and Developed by{' '}
                    <strong>NEBZA Technologies Private Limited</strong>. All Rights Reserved.
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <span
                  style={{ color: '#94A3B8', cursor: 'pointer' }}
                  onClick={() => navigate('/terms')}
                >
                  Terms of Use
                </span>
                <span>•</span>
                <span
                  style={{ color: '#94A3B8', cursor: 'pointer' }}
                  onClick={() => navigate('/privacy')}
                >
                  Privacy Policy
                </span>
                <span>•</span>
                <span
                  style={{ color: '#94A3B8', cursor: 'pointer' }}
                  onClick={() => navigate('/refund')}
                >
                  Refund Policy
                </span>
                <span>•</span>
                <span
                  style={{ color: '#94A3B8', cursor: 'pointer' }}
                  onClick={() => navigate('/contact')}
                >
                  Contact Support
                </span>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};
