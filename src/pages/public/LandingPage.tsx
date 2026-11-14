import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useTheme } from '../../context/ThemeContext';
import { PropithubLogo } from '../../components/common/PropithubLogo';
import { HeroArt } from '../../components/common/HeroArt';
import { AppStoreBadges } from '../../components/common/AppStoreBadges';
import { GooglePlacesAddressPicker } from '../../components/GooglePlacesAddressPicker';
import {
  getAllListings,
  formatMoney,
  toUSD,
  calculateBenchmark,
  COUNTRY_FLAGS,
} from '../../lib/listingsData';
import { isValidCityName, isNumericCoordinate } from '../../lib/addressUtils';
import { Heart, Sun, Moon, Compass, Menu, X, ChevronDown } from 'lucide-react';

const DEFAULT_ROLE_PORTALS = [
  {
    id: 'role-owner',
    title: 'Property Owners',
    color: '#0f766e',
    bullets: [
      'Live rent tracking & collections',
      'Digital leases & ledger',
      '1-tap vacant listing',
    ],
  },
  {
    id: 'role-manager',
    title: 'Property Managers',
    color: '#b45309',
    bullets: [
      'Multi-owner portfolio control',
      'Repair dispatch & messaging',
      'Viewings & applicant screening',
    ],
  },
  {
    id: 'role-tenant',
    title: 'Tenants',
    color: '#2563eb',
    bullets: [
      'Online rent & auto-reminders',
      'Payment proofs & receipts',
      'Maintenance requests with photos',
    ],
  },
  {
    id: 'role-staff',
    title: 'Maintenance Technicians',
    color: '#c2410c',
    bullets: [
      'Mobile work order queue',
      'Task status & photo proofs',
      'Payout tracking & logs',
    ],
  },
  {
    id: 'role-admin',
    title: 'Platform Admins',
    color: '#6d28d9',
    bullets: [
      'Plans, pricing & policies',
      'Public listing moderation',
      'Security & gateway audits',
    ],
  },
];

const DEFAULT_FEATURES = [
  {
    id: 'f-1',
    icon: '📝',
    title: 'Digital Leases & E-Signing',
    description: 'Generate compliant leases, customize addendums, and collect e-signatures from all co-signers in minutes.',
  },
  {
    id: 'f-2',
    icon: '💳',
    title: 'Automated Invoicing & Gateways',
    description: 'Integrate Stripe, Razorpay, PayPal, Easebuzz, or direct UPI/Bank wire with automatic receipt generation.',
  },
  {
    id: 'f-3',
    icon: '💱',
    title: 'Multi-Currency Ledger',
    description: 'Track rental revenue and security deposits in USD, GBP, EUR, AED, INR, and CAD with live currency conversion.',
  },
  {
    id: 'f-4',
    icon: '🛠️',
    title: 'Maintenance Dispatch',
    description: 'Tenants submit photo repair requests; assign them to maintenance technicians with instant progress tracking.',
  },
  {
    id: 'f-5',
    icon: '👥',
    title: 'Tenant Self-Service Portal',
    description: 'Tenants view real-time balance sheets, pay rent with one tap, download tax receipts, and report issues.',
  },
  {
    id: 'f-6',
    icon: '📊',
    title: 'Real-Time Financial Reports',
    description: 'Export income statements, occupancy charts, security deposit reserves, and tax summaries to PDF or Excel.',
  },
];

const DEFAULT_STEPS = [
  {
    id: 's-1',
    stepNumber: '1',
    title: 'List or find in minutes',
    description:
      'Owners import properties and publish vacant units with photos and pricing. Renters filter by bedrooms, budget, and neighborhood.',
  },
  {
    id: 's-2',
    stepNumber: '2',
    title: 'Enquire, view & sign digitally',
    description:
      'Renters schedule viewings directly with the host, review contract terms, and complete legal digital lease execution online.',
  },
  {
    id: 's-3',
    stepNumber: '3',
    title: 'Pay rent & manage everything',
    description:
      'Security deposits and recurring rent flow through connected gateways (Stripe, Razorpay, UPI, Wire). Instant receipts and ledger updates.',
  },
];

const DEFAULT_FAQS = [
  {
    id: 'faq-1',
    question: 'How do I get my property listed on the Browse Homes page?',
    answer:
      'Once you add your property and vacant units in the Owner or Manager portal, simply click "Publish" on any vacant unit. It will immediately appear on the global Browse Homes marketplace for prospective renters to view and submit enquiries.',
  },
  {
    id: 'faq-2',
    question: 'How do renters pay rent, and which payment gateways are supported?',
    answer:
      'Propithub supports direct online payment gateways including Stripe, Razorpay, PayPal, Easebuzz, direct UPI (QR code / VPA), and manual Bank Wire (NEFT/RTGS/IMPS). Tenants pay directly from their portal or mobile app.',
  },
  {
    id: 'faq-3',
    question: 'Are digital leases legally binding?',
    answer:
      'Yes. Propithub leases include electronic signature logs, timestamp verification, IP tracking, and tamper-evident PDF archiving compliant with ESIGN and international electronic transaction frameworks.',
  },
  {
    id: 'faq-4',
    question: 'Can I manage properties across multiple countries and currencies?',
    answer:
      'Absolutely. Propithub natively handles multi-currency properties (USD, EUR, GBP, AED, INR, CAD, AUD, SGD) and automatically displays currency conversions for international renters and multi-country portfolios.',
  },
];

export const LandingPage: React.FC = () => {
  const { state, showToast } = useAppData();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const cfg = state.landingConfig;
  const sections = cfg?.sections || {};

  // Mobile menu drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Search form fields
  const [searchWhere, setSearchWhere] = useState('');
  const [searchGeo, setSearchGeo] = useState<{ lat?: number; lng?: number; city?: string } | null>(null);
  const [searchBeds, setSearchBeds] = useState('');
  const [searchMaxRent, setSearchMaxRent] = useState('');

  // Active photo index for featured cards
  const [cardPhotoIndex, setCardPhotoIndex] = useState<Record<string, number>>({});

  // Interactive FAQ accordion state (first question open by default)
  const [openFaqIndices, setOpenFaqIndices] = useState<Record<number, boolean>>({ 0: true });
  const toggleFaq = (idx: number) => {
    setOpenFaqIndices((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Saved listings
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('propithub_saved_homes');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleSave = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast('Removed from saved homes');
      } else {
        next.add(id);
        showToast('Saved to your favorites');
      }
      try {
        localStorage.setItem('propithub_saved_homes', JSON.stringify([...next]));
      } catch { }
      return next;
    });
  };

  const handleNextPhoto = (id: string, total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardPhotoIndex((prev) => ({
      ...prev,
      [id]: ((prev[id] || 0) + 1) % total,
    }));
  };

  const handlePrevPhoto = (id: string, total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardPhotoIndex((prev) => ({
      ...prev,
      [id]: ((prev[id] || 0) - 1 + total) % total,
    }));
  };

  // Listings data (with active popular listings prioritized first)
  const allListings = useMemo(() => {
    const list = getAllListings(state.units || [], state.properties || [], state.reviews);
    return list.sort((a, b) => {
      const aPop = Boolean(a.isPopular && a.popularUntil && new Date(a.popularUntil).getTime() > Date.now());
      const bPop = Boolean(b.isPopular && b.popularUntil && new Date(b.popularUntil).getTime() > Date.now());
      if (aPop && !bPop) return -1;
      if (!aPop && bPop) return 1;
      return 0;
    });
  }, [state.units, state.properties, state.reviews]);

  // Featured listings (top 4 curated)
  const featuredListings = useMemo(() => {
    return allListings.slice(0, 4);
  }, [allListings]);

  // Country aggregations
  const countryCounts = useMemo(() => {
    const map = new Map<string, { count: number; cities: Set<string> }>();
    allListings.forEach((l) => {
      if (!l.country || isNumericCoordinate(l.country)) return;
      if (!map.has(l.country)) {
        map.set(l.country, { count: 0, cities: new Set() });
      }
      const entry = map.get(l.country)!;
      entry.count += 1;
      if (l.city && isValidCityName(l.city)) {
        entry.cities.add(l.city);
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8);
  }, [allListings]);

  const popularCities = useMemo(() => {
    const counts = new Map<string, number>();
    allListings.forEach((l) => {
      if (l.city && isValidCityName(l.city)) {
        counts.set(l.city, (counts.get(l.city) || 0) + 1);
      }
    });
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
    return sorted.length > 0
      ? sorted.slice(0, 8)
      : ['Dubai', 'London', 'Singapore', 'New York', 'Mumbai', 'Toronto', 'Berlin', 'Sydney'];
  }, [allListings]);

  const trialDays = state.defaultTrialDays ?? 14;

  interface NormalizedLandingPlan {
    id: string;
    name: string;
    price: number | string;
    description: string;
    properties?: number;
    units?: number;
    tenants?: number;
    managers?: number;
    staff?: number;
    popularBoostDays?: number;
    isPopular?: boolean;
    features?: string[];
  }

  const dynamicPlans = useMemo<NormalizedLandingPlan[]>(() => {
    const rawPlans = (state.plans || [])
      .filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial')
      .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));

    if (rawPlans.length > 0) {
      return rawPlans.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        properties: p.properties,
        units: p.units,
        tenants: p.tenants,
        managers: p.managers,
        staff: p.staff,
        popularBoostDays: p.popularBoostDays,
        isPopular: !!p.isPopular,
        description:
          p.name.toLowerCase() === 'starter'
            ? 'Essential management for independent landlords.'
            : p.name.toLowerCase() === 'growth'
              ? 'Scale multi-family portfolios with full automation.'
              : 'Full enterprise suite for large property management firms.',
      }));
    }

    return [
      {
        id: 'starter',
        name: 'Starter',
        price: 29,
        properties: 1,
        units: 5,
        tenants: 5,
        managers: 0,
        staff: 1,
        popularBoostDays: 0,
        isPopular: false,
        description: 'Ideal for individual owners with up to 5 units.',
      },
      {
        id: 'growth',
        name: 'Growth',
        price: 79,
        properties: 5,
        units: 50,
        tenants: 50,
        managers: 2,
        staff: 5,
        popularBoostDays: 7,
        isPopular: true,
        description: 'For growing landlords and portfolio managers.',
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 249,
        properties: 999,
        units: 9999,
        tenants: 9999,
        managers: 10,
        staff: 50,
        popularBoostDays: 30,
        isPopular: false,
        description: 'For established property management firms.',
      },
    ];
  }, [state.plans]);

  const scrollToSection = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const navbarHeight = 72;
      const elementPosition = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: elementPosition - navbarHeight,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => {
          const navbarHeight = 72;
          const elementPosition = el.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({
            top: elementPosition - navbarHeight,
            behavior: 'smooth',
          });
        }, 100);
      }
    }
  }, []);

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    const queryText = (searchGeo?.city || searchWhere).trim();
    if (queryText) params.set('q', queryText);
    if (searchGeo?.lat && searchGeo?.lng) {
      params.set('lat', String(searchGeo.lat));
      params.set('lng', String(searchGeo.lng));
    }
    if (searchBeds) params.set('beds', searchBeds);
    if (searchMaxRent) params.set('max', searchMaxRent);
    navigate(`/homes?${params.toString()}`);
  };

  // Resolved dynamic content from cfg with clean defaults matching the redesigned Landing Page
  const heroHeadline =
    cfg?.headline && !cfg.headline.includes('Modern Era')
      ? cfg.headline
      : 'Run every rental. Find a home anywhere.';
  const heroSubheadline =
    cfg?.subheadline && !cfg.subheadline.includes('NEBZA')
      ? cfg.subheadline
      : 'The unified rental workspace for landlords, property managers, and renters across 38 countries. One platform for leases, rent collection, and vacant unit listings.';

  const seekerCard = cfg?.duoCards?.seeker || {
    title: 'Looking for a home?',
    description:
      'Browse verified rentals worldwide. Save favorites, book viewings, sign leases online, and pay rent in any currency without hidden broker fees.',
    ctaText: 'Browse all homes →',
    ctaLink: '/homes',
  };

  const ownerCard = cfg?.duoCards?.owner || {
    title: 'Own or manage property?',
    description:
      'Collect rent automatically, sign legal digital leases, and handle repairs with dispatched contractors. Publish vacant units in one click to fill them faster.',
    ctaText: `Start ${trialDays}-day free trial →`,
    ctaLink: '/register',
  };

  const stepsToRender =
    cfg?.howItWorksSteps && cfg.howItWorksSteps.length > 0 ? cfg.howItWorksSteps : DEFAULT_STEPS;

  const landlordsData = cfg?.landlordsSection || {
    kicker: 'For landlords and managers',
    title: 'Run the whole rental operation from one screen',
    subtitle:
      'See what needs your attention today, approve actions in one click, and let automated payment schedules handle the rest.',
    bullets: [
      'Automatic rent collection, overdue late fee enforcement, and automated invoice delivery',
      'Digital lease agreements with built-in electronic signatures and legal PDF archiving',
      'Publish vacant units straight to the global marketplace and reply to tenant enquiries in one inbox',
      'Delegated manager & maintenance contractor accounts with strict owner permission safeguards',
    ],
    primaryCtaText: `Start ${trialDays}-day free trial`,
    primaryCtaLink: '/register',
    secondaryCtaText: 'Sign in to owner portal',
    secondaryCtaLink: '/login',
    mockupGreeting: 'Good evening, Landlord',
    mockupSubtext: '3 items require attention',
    mockupItems: [
      { text: 'Signed lease ready to review (Unit 4B)', action: 'Approve lease' },
      { text: 'Bank transfer payment proof received', action: 'Confirm £2,250' },
      { text: 'New viewing enquiry for 2-bed flat', action: 'Reply to Sarah' },
    ],
    mockupKpis: [
      { value: '99.2%', label: 'Rent collected' },
      { value: '3', label: 'Vacant units' },
      { value: '4.9 ★', label: 'Tenant rating' },
    ],
  };

  const featuresToRender =
    cfg?.featuresList && cfg.featuresList.length > 0 ? cfg.featuresList : DEFAULT_FEATURES;

  const rolesToRender = useMemo(() => {
    const rawRoles = cfg?.rolePortals && cfg.rolePortals.length > 0 ? cfg.rolePortals : DEFAULT_ROLE_PORTALS;
    const bulletMap: Record<string, string> = {
      'Monitor real-time rent collections across units': 'Live rent tracking & collections',
      'Execute leases and review financial ledgers': 'Digital leases & ledger',
      'Publish vacant units to the global hub in 1 tap': '1-tap vacant listing',
      'Manage properties for multiple assigned owners': 'Multi-owner portfolio control',
      'Dispatch repairs and communicate with renters': 'Repair dispatch & messaging',
      'Schedule property viewings and vet applications': 'Viewings & applicant screening',
      'Pay rent securely online with automated reminders': 'Online rent & auto-reminders',
      'Download proof of payments and official receipts': 'Payment proofs & receipts',
      'Submit maintenance tickets with photos & notes': 'Maintenance requests with photos',
      'View assigned work orders on mobile': 'Mobile work order queue',
      'Update task progress and upload completion proofs': 'Task status & photo proofs',
      'Track contractor payouts and job hours': 'Payout tracking & logs',
      'Configure system plans, features, and policies': 'Plans, pricing & policies',
      'Moderate public marketplace listings': 'Public listing moderation',
      'Audit system security and gateway connections': 'Security & gateway audits',
    };
    return rawRoles.map((r) => ({
      ...r,
      bullets: (r.bullets || []).map((b) => bulletMap[b] || b),
    }));
  }, [cfg?.rolePortals]);

  const faqsToRender = cfg?.faqList && cfg.faqList.length > 0 ? cfg.faqList : DEFAULT_FAQS;

  return (
    <div className="site">
      {/* Optional Top Announcement Bar */}
      {sections.showAnnouncement && cfg?.announcement?.enabled && (
        <div
          style={{
            background: 'var(--teal-dark)',
            color: '#fff',
            padding: '8px 20px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          {cfg.announcement.badge && (
            <span
              style={{
                background: 'rgba(255,255,255,0.2)',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: 700,
                fontSize: '11px',
              }}
            >
              {cfg.announcement.badge}
            </span>
          )}
          <span>{cfg.announcement.text}</span>
          {cfg.announcement.linkText && (
            <Link
              to={cfg.announcement.linkUrl || '/register'}
              style={{ color: '#fff', fontWeight: 700, textDecoration: 'underline' }}
            >
              {cfg.announcement.linkText}
            </Link>
          )}
        </div>
      )}

      {/* 1. Header Navigation */}
      <header className="snav">
        <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          <PropithubLogo size={30} showText={true} />
        </Link>
        <nav className="slinks" aria-label="Main Navigation">
          <Link to="/homes">Browse homes</Link>
          {(sections.showHowItWorks ?? true) && (
            <button type="button" onClick={(e) => scrollToSection(e, 'sec-how')}>
              How it works
            </button>
          )}
          {(sections.showLandlords ?? true) && (
            <button type="button" onClick={(e) => scrollToSection(e, 'sec-landlords')}>
              For landlords
            </button>
          )}
          {(sections.showPricing ?? true) && (
            <button type="button" onClick={(e) => scrollToSection(e, 'sec-pricing')}>
              Pricing
            </button>
          )}
          {(sections.showFaq ?? true) && (
            <button type="button" onClick={(e) => scrollToSection(e, 'sec-faq')}>
              FAQ
            </button>
          )}
        </nav>
        <span className="sp" />
        <div className="snav-actions">
          {/* Dark/Light Mode Toggle */}
          <button
            type="button"
            className="theme-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link to={cfg?.secondaryCtaLink || '/login'} className="btn sm snav-login-btn">
            Log in
          </Link>
          <Link to={cfg?.ctaLink || '/register'} className="btn pri sm snav-trial-btn">
            Start free trial
          </Link>
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
          <div className="mobile-nav-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-nav-content">
            <nav className="mobile-nav-links">
              <Link to="/homes" onClick={() => setMobileMenuOpen(false)}>
                <span>Browse homes</span>
                <span className="mobile-nav-arrow">→</span>
              </Link>
              {(sections.showHowItWorks ?? true) && (
                <button
                  type="button"
                  onClick={(e) => {
                    scrollToSection(e, 'sec-how');
                    setMobileMenuOpen(false);
                  }}
                >
                  <span>How it works</span>
                  <span className="mobile-nav-arrow">→</span>
                </button>
              )}
              {(sections.showLandlords ?? true) && (
                <button
                  type="button"
                  onClick={(e) => {
                    scrollToSection(e, 'sec-landlords');
                    setMobileMenuOpen(false);
                  }}
                >
                  <span>For landlords</span>
                  <span className="mobile-nav-arrow">→</span>
                </button>
              )}
              {(sections.showPricing ?? true) && (
                <button
                  type="button"
                  onClick={(e) => {
                    scrollToSection(e, 'sec-pricing');
                    setMobileMenuOpen(false);
                  }}
                >
                  <span>Pricing</span>
                  <span className="mobile-nav-arrow">→</span>
                </button>
              )}
              {(sections.showFaq ?? true) && (
                <button
                  type="button"
                  onClick={(e) => {
                    scrollToSection(e, 'sec-faq');
                    setMobileMenuOpen(false);
                  }}
                >
                  <span>FAQ</span>
                  <span className="mobile-nav-arrow">→</span>
                </button>
              )}
            </nav>
            <div className="mobile-nav-footer">
              <Link
                to={cfg?.secondaryCtaLink || '/login'}
                className="btn sm"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Log in
              </Link>
              <Link
                to={cfg?.ctaLink || '/register'}
                className="btn pri sm"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Start free trial
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 2. Hero Section */}
      {(sections.showHero ?? true) && (
        <section className="shero hub">
          <div>
            <h1>{heroHeadline}</h1>
            <p>{heroSubheadline}</p>

            {/* 4-Column Search Box */}
            <form className="hsearch" onSubmit={handleHeroSearch} aria-label="Search rental homes">
              <label style={{ overflow: 'visible' }}>
                <span className="hsearch-title">Where</span>
                <GooglePlacesAddressPicker
                  variant="hero"
                  initialValue={searchWhere}
                  placeholder="City, area, or address..."
                  onQueryChange={(val) => {
                    setSearchWhere(val);
                    setSearchGeo(null);
                  }}
                  onAddressSelect={(addr) => {
                    const label = addr.city && addr.country ? `${addr.city}, ${addr.country}` : addr.formattedAddress;
                    setSearchWhere(label);
                    setSearchGeo({
                      lat: addr.lat || undefined,
                      lng: addr.lng || undefined,
                      city: addr.city || undefined,
                    });
                  }}
                />
              </label>
              <label>
                <span className="hsearch-title">Bedrooms</span>
                <select value={searchBeds} onChange={(e) => setSearchBeds(e.target.value)}>
                  <option value="">Any</option>
                  <option value="0">Studio</option>
                  <option value="1">1 bed</option>
                  <option value="2">2 beds</option>
                  <option value="3">3+ beds</option>
                </select>
              </label>
              <label>
                <span className="hsearch-title">Max rent (USD)</span>
                <select value={searchMaxRent} onChange={(e) => setSearchMaxRent(e.target.value)}>
                  <option value="">Any</option>
                  <option value="1000">Up to $1,000</option>
                  <option value="2000">Up to $2,000</option>
                  <option value="3000">Up to $3,000</option>
                  <option value="5000">Up to $5,000</option>
                </select>
              </label>
              <button type="submit" className="btn pri lg">
                Search homes
              </button>
            </form>

            {/* Popular Cities */}
            <div className="chips-row">
              <span className="mute" style={{ fontSize: '12.5px', fontWeight: 600 }}>
                Popular:
              </span>
              {popularCities.map((city) => (
                <button
                  key={city}
                  type="button"
                  className="chipb"
                  onClick={() => navigate(`/homes?q=${encodeURIComponent(city)}`)}
                >
                  {city}
                </button>
              ))}
            </div>

            <div className="hero-cta">
              <Link to={cfg?.ctaLink || '/register'} className="btn pri lg">
                {cfg?.ctaText || 'List and manage your property'}
              </Link>
              <Link to="/homes" className="btn secondary lg">
                Browse {allListings.length} homes →
              </Link>
            </div>
          </div>

          {/* Hero Illustration & Animated Cards */}
          {(sections.showStats ?? true) && (
            <HeroArt countryCount={countryCounts.length || 9} />
          )}
        </section>
      )}

      {/* 3. Two-Up Persona Duo Cards */}
      {(sections.showDuoCards ?? true) && (
        <section className="ssec twoup">
          <div className="duo">
            <h3>{seekerCard.title}</h3>
            <p>{seekerCard.description}</p>
            <button className="btn pri" onClick={() => navigate(seekerCard.ctaLink || '/homes')}>
              {seekerCard.ctaText}
            </button>
          </div>
          <div className="duo alt">
            <h3>{ownerCard.title}</h3>
            <p>{ownerCard.description}</p>
            <button className="btn secondary" onClick={() => navigate(ownerCard.ctaLink || '/register')}>
              {ownerCard.ctaText}
            </button>
          </div>
        </section>
      )}

      {/* 4. Featured Homes Section */}
      {(sections.showListings ?? true) && (
        <section id="sec-homes" className="ssec">
          <div className="sechead">
            <h2>{cfg?.listingsTitle || 'Featured homes around the world'}</h2>
            <button className="btn secondary sm" onClick={() => navigate('/homes')}>
              See all {allListings.length} homes →
            </button>
          </div>

          {featuredListings.length > 0 ? (
            <div className="lrow">
              {featuredListings.map((item) => {
                const totalImages = item.images.length;
                const activeIdx =
                  totalImages > 0 ? (cardPhotoIndex[item.id] || 0) % totalImages : 0;
                const isSaved = savedIds.has(item.id);
                const benchmark = calculateBenchmark(item, allListings);

                return (
                  <article
                    key={item.id}
                    className={`lc ${item.isPopular ? 'lc-popular' : ''}`}
                    onClick={() => navigate(`/homes/${item.id}`)}
                    style={{
                      cursor: 'pointer',
                      border: item.isPopular ? '1.5px solid rgba(245, 158, 11, 0.55)' : undefined,
                      boxShadow: item.isPopular ? '0 6px 18px rgba(245, 158, 11, 0.12)' : undefined,
                    }}
                  >
                    {/* Photo Carousel or Real Architectural Placeholder */}
                    <div className="lc-img">
                      {totalImages > 0 ? (
                        <img src={item.images[activeIdx]} alt={item.title} loading="lazy" />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            background: 'linear-gradient(135deg, var(--surface-sunken) 0%, var(--line) 100%)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--ink-soft)',
                            gap: '4px',
                            padding: '12px',
                            textAlign: 'center',
                          }}
                        >
                          <span style={{ fontSize: '28px', opacity: 0.85 }}>🏢</span>
                          <b style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: 700 }}>
                            Unit {item.unitNumber}
                          </b>
                          <span style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
                            {item.propertyName}
                          </span>
                        </div>
                      )}

                      {item.isPopular ? (
                        <span
                          className="lc-badge"
                          style={{
                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                            color: '#ffffff',
                            fontWeight: 800,
                            boxShadow: '0 2px 6px rgba(245, 158, 11, 0.45)',
                          }}
                        >
                          🔥 Popular
                        </span>
                      ) : item.ageDays <= 2 ? (
                        <span className="lc-badge">New</span>
                      ) : benchmark && benchmark.percentage <= -8 ? (
                        <span className="lc-badge good">Great value</span>
                      ) : (
                        <span className="lc-badge">Available Now</span>
                      )}

                      <button
                        className="lc-save"
                        onClick={(e) => toggleSave(item.id, e)}
                        aria-label="Save home"
                      >
                        <Heart
                          size={18}
                          fill={isSaved ? '#ef4444' : 'none'}
                          color={isSaved ? '#ef4444' : '#fff'}
                        />
                      </button>

                      {totalImages > 1 && (
                        <>
                          <button
                            className="lc-nav prev"
                            onClick={(e) => handlePrevPhoto(item.id, totalImages, e)}
                            aria-label="Previous photo"
                          >
                            ‹
                          </button>
                          <button
                            className="lc-nav next"
                            onClick={(e) => handleNextPhoto(item.id, totalImages, e)}
                            aria-label="Next photo"
                          >
                            ›
                          </button>
                          <span className="lc-dots">
                            {Array.from({ length: totalImages }).map((_, i) => (
                              <i key={i} className={i === activeIdx ? 'on' : ''} />
                            ))}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Card Content */}
                    <div className="lc-body">
                      <div className="lc-top">
                        <b>{item.propertyName}</b>
                        <span className="lc-rate">
                          {item.rating !== null ? `★ ${item.rating}` : 'Verified'}
                        </span>
                      </div>

                      <span
                        className="mute"
                        style={{
                          fontSize: '13.5px',
                          marginTop: '2px',
                          fontWeight: 600,
                          color: 'var(--ink)',
                        }}
                      >
                        Unit {item.unitNumber}
                        {item.displayLocation && !isNumericCoordinate(item.displayLocation)
                          ? ` · ${item.displayLocation}`
                          : ''}
                      </span>

                      <span className="mute" style={{ fontSize: '12.5px' }}>
                        {item.bedsLabel}{item.baths > 0 ? ` · ${item.baths} bath` : ''}
                        {item.areaSqFt > 0
                          ? ` · ${item.areaSqFt.toLocaleString('en-US')} sq ft`
                          : ''}
                        {' · '}
                        {item.furnishing}
                      </span>

                      <div className="lc-price">
                        <b>{formatMoney(item.rent, item.currency)}</b> / mo
                        {item.currency !== 'USD' && (
                          <small style={{ marginLeft: '6px' }}>
                            ≈ USD{' '}
                            {Math.round(toUSD(item.rent, item.currency)).toLocaleString('en-US')}
                          </small>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                padding: '48px 20px',
                textAlign: 'center',
                background: 'var(--surface)',
                borderRadius: '16px',
                border: '1px dashed var(--line-strong)',
                margin: '18px 0',
              }}
            >
              <Compass
                size={32}
                style={{ color: 'var(--teal)', margin: '0 auto 12px', display: 'block' }}
              />
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px' }}>
                No vacant units published yet
              </h3>
              <p
                className="mute"
                style={{ maxWidth: '440px', margin: '0 auto 16px', fontSize: '14px' }}
              >
                Vacant rental units published by landlords and managers will appear here
                automatically in real time.
              </p>
              <Link to="/register" className="btn pri sm">
                List your property
              </Link>
            </div>
          )}
        </section>
      )}

      {/* 5. Around the World Section */}
      {(sections.showWorld ?? true) && countryCounts.length > 0 && (
        <section id="sec-world" className="ssec alt">
          <div className="shead">
            <span className="eyebrow">{cfg?.worldKicker || 'Around the world'}</span>
            <h2>
              {cfg?.worldTitle || `Explore homes across ${countryCounts.length} countries`}
            </h2>
            <p>
              {cfg?.worldSubtitle ||
                'Connect with verified rental residences across top global financial hubs and lifestyle destinations.'}
            </p>
          </div>

          <div className="cgrid">
            {countryCounts.map(([country, data]) => {
              const flag = COUNTRY_FLAGS[country] || '🌍';
              const cityList = Array.from(data.cities)
                .filter((c) => isValidCityName(c))
                .slice(0, 2)
                .join(', ');
              return (
                <button
                  key={country}
                  type="button"
                  className="ccard"
                  onClick={() => navigate(`/homes?country=${encodeURIComponent(country)}`)}
                >
                  <span className="flag">{flag}</span>
                  <span className="ct">
                    <b>{country}</b>
                    <span className="mute">{cityList || 'Major cities'}</span>
                  </span>
                  <span className="cn">
                    {data.count}
                    <small>homes</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 6. How It Works Section */}
      {(sections.showHowItWorks ?? true) && (
        <section id="sec-how" className="ssec">
          <div className="shead">
            <span className="eyebrow">{cfg?.howItWorksKicker || 'How it works'}</span>
            <h2>
              {cfg?.howItWorksTitle && !cfg.howItWorksTitle.includes('Three afternoons')
                ? cfg.howItWorksTitle
                : 'From first enquiry to first rent, in three steps'}
            </h2>
            <p>
              {cfg?.howItWorksSubtitle && !cfg.howItWorksSubtitle.includes('inside a week')
                ? cfg.howItWorksSubtitle
                : 'Landlords and renters meet on the same unified ledger, so nothing is lost in disjointed emails or manual paperwork.'}
            </p>
          </div>

          <div className="sgrid3">
            {stepsToRender.map((step, idx) => (
              <div key={step.id || idx} className="sstep">
                <i>{step.stepNumber || idx + 1}</i>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7. For Landlords & Managers */}
      {(sections.showLandlords ?? true) && (
        <section id="sec-landlords" className="ssec alt">
          <div className="split">
            <div className="split-t">
              <span className="eyebrow">{landlordsData.kicker}</span>
              <h2>{landlordsData.title}</h2>
              <p className="lead">{landlordsData.subtitle}</p>
              <ul className="ticks">
                {landlordsData.bullets.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
              <div className="hero-cta">
                <Link to={landlordsData.primaryCtaLink || '/register'} className="btn pri lg">
                  {landlordsData.primaryCtaText}
                </Link>
                <Link to={landlordsData.secondaryCtaLink || '/login'} className="btn secondary lg">
                  {landlordsData.secondaryCtaText}
                </Link>
              </div>
            </div>

            {/* Interactive Mockup Card */}
            <div className="mock" aria-hidden="true">
              <div className="mock-h">
                <b>{landlordsData.mockupGreeting}</b>
                <span>{landlordsData.mockupSubtext}</span>
              </div>
              {landlordsData.mockupItems.map((mItem, idx) => (
                <div key={idx} className="mock-r">
                  <i />
                  <span>{mItem.text}</span>
                  <u>{mItem.action}</u>
                </div>
              ))}
              <div className="mock-k">
                {landlordsData.mockupKpis.map((kpi, idx) => (
                  <div key={idx}>
                    <b>{kpi.value}</b>
                    <span>{kpi.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 8. Core Features */}
      {(sections.showFeatures ?? true) && (
        <section id="sec-features" className="ssec">
          <div className="shead">
            <span className="eyebrow">
              {cfg?.featuresKicker && cfg.featuresKicker !== "What's inside"
                ? cfg.featuresKicker
                : 'Features'}
            </span>
            <h2>
              {cfg?.featuresTitle && cfg.featuresTitle !== 'Six jobs, one ledger'
                ? cfg.featuresTitle
                : 'Everything a modern rental portfolio needs'}
            </h2>
            <p>
              {cfg?.featuresSubtitle && !cfg.featuresSubtitle.includes('outdated spreadsheet')
                ? cfg.featuresSubtitle
                : 'One unified cloud workspace replacing fragmented spreadsheets, PDF templates, and manual messaging.'}
            </p>
          </div>

          <div className="sgrid3">
            {featuresToRender.map((feat, idx) => (
              <div key={feat.id || idx} className="sfeat">
                <div className="fico" style={{ fontSize: '18px' }}>
                  {feat.icon ? (
                    <span>{feat.icon}</span>
                  ) : (
                    <svg viewBox="0 0 24 24">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6M8 13h8M8 17h8" />
                    </svg>
                  )}
                </div>
                <h3>{feat.title}</h3>
                <p>{feat.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 9. Roles Section */}
      {(sections.showRoles ?? true) && (
        <section id="sec-roles" className="ssec alt">
          <div className="shead">
            <span className="eyebrow">{cfg?.rolesKicker || 'What you can do'}</span>
            <h2>{cfg?.rolesTitle || 'Tailored portals for every stakeholder'}</h2>
            <p>
              {!cfg?.rolesSubtitle || cfg.rolesSubtitle === 'Each person accesses only what they need with zero clutter.'
                ? 'Dedicated workspaces for every role.'
                : cfg.rolesSubtitle}
            </p>
          </div>

          <div className="rgrid">
            {rolesToRender.map((roleItem) => (
              <article
                key={roleItem.id}
                className="rcard"
                style={{ '--rc': roleItem.color || '#0f766e' } as any}
              >
                <span className="rbar" />
                <h3>{roleItem.title}</h3>
                <ul>
                  {roleItem.bullets.map((b, bIdx) => (
                    <li key={bIdx}>{b}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 10. Pricing Section */}
      {(sections.showPricing ?? true) && (
        <section id="sec-pricing" className="ssec alt">
          <div className="shead" style={{ textAlign: 'center' }}>
            <span className="eyebrow">{cfg?.pricingKicker || 'Pricing'}</span>
            <h2>{cfg?.pricingTitle || 'Simple pricing'}</h2>
            <p style={{ margin: '0 auto' }}>
              {cfg?.pricingSubtitle ||
                `Pick a plan by the size of your portfolio. Every plan starts with a ${trialDays}-day free trial, and you can change or cancel any time.`}
            </p>
          </div>

          <div className="sgrid3 plans" style={{ marginTop: '28px' }}>
            {dynamicPlans.map((plan, idx, arr) => {
              const hasExplicitPopular = arr.some((p) => p.isPopular);
              const isPopular = hasExplicitPopular
                ? !!plan.isPopular
                : plan.name.toLowerCase() === 'growth' || (arr.length > 2 && idx === 1);

              return (
                <div key={plan.id} className={`splan ${isPopular ? 'pop' : ''}`}>
                  {isPopular && (
                    <span className="spill">
                      Most popular
                    </span>
                  )}
                  <h3>{plan.name}</h3>
                  <div className="sprice">
                    ${plan.price} <small>per month</small>
                  </div>
                  <p className="mute">
                    {plan.description ||
                      (plan.name.toLowerCase() === 'starter'
                        ? 'Essential management for independent landlords.'
                        : plan.name.toLowerCase() === 'growth'
                          ? 'Scale multi-family portfolios with full automation.'
                          : 'Full enterprise suite for large property management firms.')}
                  </p>
                  <ul>
                    {plan.features && Array.isArray(plan.features) && plan.features.length > 0 ? (
                      plan.features.map((f: string, fIdx: number) => <li key={fIdx}>{f}</li>)
                    ) : (
                      <>
                        <li>
                          <b>
                            {(plan.properties == null || plan.properties >= 999)
                              ? 'Unlimited'
                              : plan.properties}
                          </b>{' '}
                          {plan.properties === 1 ? 'property' : 'properties'}
                        </li>
                        <li>
                          <b>
                            {(plan.units == null || plan.units >= 9999)
                              ? 'Unlimited'
                              : plan.units}
                          </b>{' '}
                          {plan.units === 1 ? 'unit' : 'units'}
                        </li>
                        <li>
                          <b>
                            {(plan.tenants == null || plan.tenants >= 9999)
                              ? 'Unlimited'
                              : plan.tenants}
                          </b>{' '}
                          {plan.tenants === 1 ? 'tenant' : 'tenants'}
                        </li>
                        <li>
                          <b>
                            {(plan.managers == null || plan.managers >= 999)
                              ? 'Unlimited'
                              : (plan.managers ?? 0)}
                          </b>{' '}
                          {plan.managers === 1 ? 'manager' : 'managers'}
                        </li>
                        <li>
                          <b>
                            {(plan.staff == null || plan.staff >= 999)
                              ? 'Unlimited'
                              : (plan.staff ?? 0)}
                          </b>{' '}
                          maintenance staff
                        </li>
                      </>
                    )}
                  </ul>
                  <Link
                    to="/register"
                    className={`btn ${isPopular ? 'pri' : 'secondary'}`}
                    style={{ marginTop: 'auto' }}
                  >
                    Start {trialDays}-day free trial
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="incl">
            <b>Every plan includes</b>
            <ul>
              <li>Online rent and deposit collection</li>
              <li>Digital leases and renewals</li>
              <li>Maintenance tickets and technicians</li>
              <li>A tenant app on web and phone</li>
              <li>Reminders and receipts</li>
              <li>Listing vacant units on the hub</li>
            </ul>
          </div>

        </section>
      )}

      {/* 11. FAQ Section */}
      {(sections.showFaq ?? true) && (
        <section id="sec-faq" className="ssec alt">
          <div className="shead" style={{ textAlign: 'center' }}>
            <span className="eyebrow">{cfg?.faqKicker || 'FAQ'}</span>
            <h2>{cfg?.faqTitle || 'Frequently asked questions'}</h2>
            {cfg?.faqSubtitle && <p style={{ margin: '0 auto' }}>{cfg.faqSubtitle}</p>}
          </div>

          <div className="sfaq">
            {faqsToRender.map((faq, idx) => {
              const isOpen = Boolean(openFaqIndices[idx]);
              return (
                <div key={faq.id || idx} className={`sfaq-item ${isOpen ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="sfaq-trigger"
                    onClick={() => toggleFaq(idx)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.question}</span>
                    <ChevronDown size={19} className="sfaq-chevron" />
                  </button>
                  <div className="sfaq-content-wrap">
                    <div className="sfaq-content-inner">
                      <p className="sfaq-answer">{faq.answer}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 12. Final CTA Banner */}
      {(sections.showCtaBanner ?? true) && (
        <section className="scta">
          <h2>{cfg?.ctaBannerTitle || 'Find a home, or fill one faster.'}</h2>
          <p className="mute" style={{ maxWidth: '48ch', margin: '0' }}>
            {cfg?.ctaBannerSubtitle ||
              'Join thousands of property owners, managers, and tenants running their rental operations on Propithub.'}
          </p>
          <div className="hero-cta" style={{ justifyContent: 'center' }}>
            <Link to={cfg?.ctaBannerSecondaryLink || '/login'} className="btn secondary lg">
              {cfg?.ctaBannerSecondaryText === 'Sign in to your portal' ? 'Sign in' : (cfg?.ctaBannerSecondaryText || 'Sign in')}
            </Link>
            <Link to={cfg?.ctaBannerPrimaryLink || '/register'} className="btn pri lg">
              {cfg?.ctaBannerPrimaryText || `Start ${trialDays}-day free trial`}
            </Link>
          </div>
        </section>
      )}

      {/* 13. Footer */}
      {(sections.showFooter ?? true) && (
        <footer className="sfoot">
          <div>
            <PropithubLogo size={24} showText={true} />
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              {cfg?.footerCopyright || `© ${new Date().getFullYear()} Propithub Inc. All rights reserved.`}
            </div>
          </div>

          {/* Option 1: Mobile App Store Badges */}
          {(cfg?.showAppStoreLinks ?? true) && (
            <AppStoreBadges
              playStoreUrl={cfg?.playStoreUrl}
              appStoreUrl={cfg?.appStoreUrl}
              label={cfg?.appStoreLabel || 'Get the mobile app'}
            />
          )}

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <Link to="/terms">Terms of service</Link>
            <Link to="/privacy">Privacy policy</Link>
            <Link to="/refund">Refund policy</Link>
            <Link to="/contact">Contact support</Link>
          </div>
        </footer>
      )}
    </div>
  );
};
export default LandingPage;
