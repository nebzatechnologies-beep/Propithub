import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import {
  LandingFeatureItem,
  LandingStepItem,
  LandingFaqItem,
  LandingDuoCardItem,
  LandingRolePortalItem,
  LandingLandlordSectionConfig,
} from '../../types';
import { INITIAL_STATE } from '../../lib/store';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import { PropithubIcon } from '../../components/common/PropithubLogo';
import { getCurrencySymbol, getLocaleForCurrency } from '../../lib/currencyService';

const DEFAULT_ROLE_PORTALS: LandingRolePortalItem[] = [
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

const DEFAULT_FEATURES: LandingFeatureItem[] = [
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

const DEFAULT_STEPS: LandingStepItem[] = [
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

const DEFAULT_FAQS: LandingFaqItem[] = [
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

const DEFAULT_LANDLORDS_SECTION: LandingLandlordSectionConfig = {
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
  primaryCtaText: 'Start 14-day free trial',
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

export const LandingCmsPage: React.FC = () => {
  const { state, updateState, saveLandingConfig, saveUnit, showToast } = useAppData();
  const navigate = useNavigate();

  const cfg = state.landingConfig;

  // Active Tab in CMS — 100% matched to the redesigned LandingPage.tsx
  const [activeTab, setActiveTab] = useState<
    | 'sections'
    | 'hero'
    | 'howItWorks'
    | 'landlords'
    | 'features'
    | 'roles'
    | 'pricing'
    | 'listings'
    | 'faq'
    | 'ctaFooter'
    | 'legal'
  >('sections');

  const [legalSubTab, setLegalSubTab] = useState<'terms' | 'privacy' | 'refund' | 'contact'>('terms');

  // 1. Branding & Top Bar & Favicon
  const [brandName, setBrandName] = useState(cfg.brandName || 'propit');
  const [brandAccent, setBrandAccent] = useState(cfg.brandAccent || 'hub');
  const [faviconUrl, setFaviconUrl] = useState(cfg.faviconUrl || '/favicon.svg');
  const [browserTitle, setBrowserTitle] = useState(cfg.browserTitle || 'Propithub — Property Operations Platform');
  const [brandTagline, setBrandTagline] = useState(cfg.brandTagline || 'Multi-Country Rental Operations');
  const [announcementEnabled, setAnnouncementEnabled] = useState(cfg.announcement?.enabled ?? false);
  const [announcementBadge, setAnnouncementBadge] = useState(cfg.announcement?.badge || 'New Release');
  const [announcementText, setAnnouncementText] = useState(
    cfg.announcement?.text || 'Propithub Global Marketplace is live — Multi-gateway rent collections & verified home listings.'
  );
  const [announcementLinkText, setAnnouncementLinkText] = useState(cfg.announcement?.linkText || 'Browse Homes →');
  const [announcementLinkUrl, setAnnouncementLinkUrl] = useState(cfg.announcement?.linkUrl || '/homes');

  // Section Visibility
  const [showAnnouncement, setShowAnnouncement] = useState(cfg.sections?.showAnnouncement ?? false);
  const [showHero, setShowHero] = useState(cfg.sections?.showHero ?? true);
  const [showStats, setShowStats] = useState(cfg.sections?.showStats ?? true);
  const [showDuoCards, setShowDuoCards] = useState(cfg.sections?.showDuoCards ?? true);
  const [showListings, setShowListings] = useState(cfg.sections?.showListings ?? true);
  const [showWorld, setShowWorld] = useState(cfg.sections?.showWorld ?? true);
  const [showHowItWorks, setShowHowItWorks] = useState(cfg.sections?.showHowItWorks ?? true);
  const [showLandlords, setShowLandlords] = useState(cfg.sections?.showLandlords ?? true);
  const [showFeatures, setShowFeatures] = useState(cfg.sections?.showFeatures ?? true);
  const [showRoles, setShowRoles] = useState(cfg.sections?.showRoles ?? true);
  const [showPricing, setShowPricing] = useState(cfg.sections?.showPricing ?? true);
  const [showFaq, setShowFaq] = useState(cfg.sections?.showFaq ?? true);
  const [showCtaBanner, setShowCtaBanner] = useState(cfg.sections?.showCtaBanner ?? true);
  const [showFooter, setShowFooter] = useState(cfg.sections?.showFooter ?? true);

  // 2. Hero Content & KPI Card & Two-Up Duo Cards
  const [headline, setHeadline] = useState(
    cfg.headline && !cfg.headline.includes('Modern Era')
      ? cfg.headline
      : 'Run every rental. Find a home anywhere.'
  );
  const [subheadline, setSubheadline] = useState(
    cfg.subheadline && !cfg.subheadline.includes('NEBZA')
      ? cfg.subheadline
      : 'The unified rental workspace for landlords, property managers, and renters across 38 countries. One platform for leases, rent collection, and vacant unit listings.'
  );
  const [ctaText, setCtaText] = useState(cfg.ctaText || 'List and manage your property');
  const [ctaLink, setCtaLink] = useState(cfg.ctaLink || '/register');
  const [secondaryCtaLink, setSecondaryCtaLink] = useState(cfg.secondaryCtaLink || '/login');

  // Hero KPI Stats Card
  const [stat1Number, setStat1Number] = useState(cfg.stats?.stat1Number || '');
  const [stat1Label, setStat1Label] = useState(cfg.stats?.stat1Label || '');
  const [stat2Number, setStat2Number] = useState(cfg.stats?.stat2Number || '$42M+');
  const [stat2Label, setStat2Label] = useState(cfg.stats?.stat2Label || 'Rent processed across 8 currencies');
  const [stat3Number, setStat3Number] = useState(cfg.stats?.stat3Number || '');
  const [stat3Label, setStat3Label] = useState(cfg.stats?.stat3Label || 'Properties tracked on Propithub');
  const [stat4Number, setStat4Number] = useState(cfg.stats?.stat4Number || '99.2%');
  const [stat4Label, setStat4Label] = useState(cfg.stats?.stat4Label || 'On-time automated rent collection rate');

  // Two-Up Persona Duo Cards
  const [seekerCard, setSeekerCard] = useState<LandingDuoCardItem>(
    cfg.duoCards?.seeker || {
      title: 'Looking for a home?',
      description:
        'Browse verified rentals worldwide. Save favorites, book viewings, sign leases online, and pay rent in any currency without hidden broker fees.',
      ctaText: 'Browse all homes →',
      ctaLink: '/homes',
    }
  );
  const [ownerCard, setOwnerCard] = useState<LandingDuoCardItem>(
    cfg.duoCards?.owner || {
      title: 'Own or manage property?',
      description:
        'Collect rent automatically, sign legal digital leases, and handle repairs with dispatched contractors. Publish vacant units in one click to fill them faster.',
      ctaText: 'Start 14-day free trial →',
      ctaLink: '/register',
    }
  );

  // 3. Featured Homes & Around the World Copy
  const [listingsTitle, setListingsTitle] = useState(cfg.listingsTitle || 'Featured homes around the world');
  const [worldKicker, setWorldKicker] = useState(cfg.worldKicker || 'Around the world');
  const [worldTitle, setWorldTitle] = useState(cfg.worldTitle || '');
  const [worldSubtitle, setWorldSubtitle] = useState(
    cfg.worldSubtitle ||
      'Connect with verified rental residences across top global financial hubs and lifestyle destinations.'
  );

  // 4. How It Works
  const [howItWorksKicker, setHowItWorksKicker] = useState(cfg.howItWorksKicker || 'How it works');
  const [howItWorksTitle, setHowItWorksTitle] = useState(
    cfg.howItWorksTitle && !cfg.howItWorksTitle.includes('Three afternoons')
      ? cfg.howItWorksTitle
      : 'From first enquiry to first rent, in three steps'
  );
  const [howItWorksSubtitle, setHowItWorksSubtitle] = useState(
    cfg.howItWorksSubtitle && !cfg.howItWorksSubtitle.includes('inside a week')
      ? cfg.howItWorksSubtitle
      : 'Landlords and renters meet on the same unified ledger, so nothing is lost in disjointed emails or manual paperwork.'
  );
  const [howItWorksSteps, setHowItWorksSteps] = useState<LandingStepItem[]>(
    cfg.howItWorksSteps && cfg.howItWorksSteps.length > 0 ? cfg.howItWorksSteps : DEFAULT_STEPS
  );

  // 5. For Landlords & Managers Section
  const [landlordsSection, setLandlordsSection] = useState<LandingLandlordSectionConfig>(
    cfg.landlordsSection || DEFAULT_LANDLORDS_SECTION
  );

  // 6. Core Features
  const [featuresKicker, setFeaturesKicker] = useState(
    cfg.featuresKicker && cfg.featuresKicker !== "What's inside" ? cfg.featuresKicker : 'Features'
  );
  const [featuresTitle, setFeaturesTitle] = useState(
    cfg.featuresTitle && cfg.featuresTitle !== 'Six jobs, one ledger'
      ? cfg.featuresTitle
      : 'Everything a modern rental portfolio needs'
  );
  const [featuresSubtitle, setFeaturesSubtitle] = useState(
    cfg.featuresSubtitle && !cfg.featuresSubtitle.includes('outdated spreadsheet')
      ? cfg.featuresSubtitle
      : 'One unified cloud workspace replacing fragmented spreadsheets, PDF templates, and manual messaging.'
  );
  const [featuresList, setFeaturesList] = useState<LandingFeatureItem[]>(
    cfg.featuresList && cfg.featuresList.length > 0 ? cfg.featuresList : DEFAULT_FEATURES
  );

  // 7. Stakeholder Portals (5 Roles)
  const [rolesKicker, setRolesKicker] = useState(cfg.rolesKicker || 'What you can do');
  const [rolesTitle, setRolesTitle] = useState(cfg.rolesTitle || 'Tailored portals for every stakeholder');
  const [rolesSubtitle, setRolesSubtitle] = useState(
    !cfg.rolesSubtitle || cfg.rolesSubtitle === 'Each person accesses only what they need with zero clutter.'
      ? 'Dedicated workspaces for every role.'
      : cfg.rolesSubtitle
  );
  const [rolePortals, setRolePortals] = useState<LandingRolePortalItem[]>(
    cfg.rolePortals && cfg.rolePortals.length > 0 ? cfg.rolePortals : DEFAULT_ROLE_PORTALS
  );

  // 8. Pricing Header
  const [pricingKicker, setPricingKicker] = useState(cfg.pricingKicker || 'Pricing');
  const [pricingTitle, setPricingTitle] = useState(cfg.pricingTitle || 'Simple, transparent pricing');
  const [pricingSubtitle, setPricingSubtitle] = useState(
    cfg.pricingSubtitle ||
      'Every plan includes a 14-day free trial. Publishing vacant units to the global rental hub is included for free.'
  );

  // 9. FAQs
  const [faqKicker, setFaqKicker] = useState(cfg.faqKicker || 'FAQ');
  const [faqTitle, setFaqTitle] = useState(cfg.faqTitle || 'Frequently asked questions');
  const [faqSubtitle, setFaqSubtitle] = useState(cfg.faqSubtitle || '');
  const [faqList, setFaqList] = useState<LandingFaqItem[]>(
    cfg.faqList && cfg.faqList.length > 0 ? cfg.faqList : DEFAULT_FAQS
  );

  // 10. CTA Banner & Footer
  const [ctaBannerTitle, setCtaBannerTitle] = useState(
    cfg.ctaBannerTitle || 'Find a home, or fill one faster.'
  );
  const [ctaBannerSubtitle, setCtaBannerSubtitle] = useState(
    cfg.ctaBannerSubtitle ||
      'Join thousands of property owners, managers, and tenants running their rental operations on Propithub.'
  );
  const [ctaBannerPrimaryText, setCtaBannerPrimaryText] = useState(
    cfg.ctaBannerPrimaryText || 'Start 14-day free trial'
  );
  const [ctaBannerPrimaryLink, setCtaBannerPrimaryLink] = useState(
    cfg.ctaBannerPrimaryLink || '/register'
  );
  const [ctaBannerSecondaryText, setCtaBannerSecondaryText] = useState(
    cfg.ctaBannerSecondaryText || 'Browse homes'
  );
  const [ctaBannerSecondaryLink, setCtaBannerSecondaryLink] = useState(
    cfg.ctaBannerSecondaryLink || '/homes'
  );
  const [footerCopyright, setFooterCopyright] = useState(
    cfg.footerCopyright || `© ${new Date().getFullYear()} Propithub Inc. All rights reserved.`
  );
  const [showAppStoreLinks, setShowAppStoreLinks] = useState(cfg.showAppStoreLinks ?? true);
  const [playStoreUrl, setPlayStoreUrl] = useState(
    cfg.playStoreUrl ?? 'https://play.google.com/store/apps'
  );
  const [appStoreUrl, setAppStoreUrl] = useState(
    cfg.appStoreUrl ?? 'https://apps.apple.com'
  );
  const [appStoreLabel, setAppStoreLabel] = useState(
    cfg.appStoreLabel ?? 'Get the mobile app'
  );

  // 11. Legal Pages State
  const [legalTerms, setLegalTerms] = useState(
    cfg.legalPages?.terms ||
      INITIAL_STATE.landingConfig.legalPages?.terms || {
        title: 'Terms of Service',
        subtitle: 'Standard platform terms governing property owners, managers, and tenants.',
        lastUpdated: 'January 2026',
        sections: [],
      }
  );
  const [legalPrivacy, setLegalPrivacy] = useState(
    cfg.legalPages?.privacy ||
      INITIAL_STATE.landingConfig.legalPages?.privacy || {
        title: 'Privacy Policy',
        subtitle: 'How we protect, encrypt, and process tenant and property owner data.',
        lastUpdated: 'January 2026',
        sections: [],
      }
  );
  const [legalRefund, setLegalRefund] = useState(
    cfg.legalPages?.refund ||
      INITIAL_STATE.landingConfig.legalPages?.refund || {
        title: 'Refund & Cancellation Policy',
        subtitle: 'Clear guidelines on SaaS subscription billing and security deposit refunds.',
        lastUpdated: 'January 2026',
        sections: [],
      }
  );
  const [legalContact, setLegalContact] = useState(
    cfg.legalPages?.contact ||
      INITIAL_STATE.landingConfig.legalPages?.contact || {
        title: 'Contact Support & Help Desk',
        subtitle: 'Our customer success and engineering team is available to assist property owners and residents.',
        email: 'support@propithub.com',
        phone: '+91 (800) 555-0199',
        address: 'Tower B, 4th Floor, Financial District, Gachibowli, Hyderabad, Telangana 500032, India',
        businessHours: 'Monday – Saturday: 9:00 AM – 7:00 PM IST',
        responseTimeNotice: 'Average response turnaround within 2 hours for urgent priority tickets.',
        faqs: [],
      }
  );

  // Save All
  const handleSaveAll = async () => {
    await saveLandingConfig({
      brandName,
      brandAccent,
      faviconUrl,
      browserTitle,
      brandTagline,
      announcement: {
        enabled: announcementEnabled,
        badge: announcementBadge,
        text: announcementText,
        linkText: announcementLinkText,
        linkUrl: announcementLinkUrl,
      },
      sections: {
        showAnnouncement,
        showHero,
        showStats,
        showDuoCards,
        showListings,
        showWorld,
        showHowItWorks,
        showLandlords,
        showFeatures,
        showRoles,
        showPricing,
        showFaq,
        showCtaBanner,
        showFooter,
      },
      headline,
      subheadline,
      ctaText,
      ctaLink,
      secondaryCtaLink,
      stats: {
        stat1Number,
        stat1Label,
        stat2Number,
        stat2Label,
        stat3Number,
        stat3Label,
        stat4Number,
        stat4Label,
      },
      duoCards: {
        seeker: seekerCard,
        owner: ownerCard,
      },
      listingsTitle,
      worldKicker,
      worldTitle,
      worldSubtitle,
      howItWorksKicker,
      howItWorksTitle,
      howItWorksSubtitle,
      howItWorksSteps,
      landlordsSection,
      featuresKicker,
      featuresTitle,
      featuresSubtitle,
      featuresList,
      rolesKicker,
      rolesTitle,
      rolesSubtitle,
      rolePortals,
      pricingKicker,
      pricingTitle,
      pricingSubtitle,
      faqKicker,
      faqTitle,
      faqSubtitle,
      faqList,
      ctaBannerTitle,
      ctaBannerSubtitle,
      ctaBannerPrimaryText,
      ctaBannerPrimaryLink,
      ctaBannerSecondaryText,
      ctaBannerSecondaryLink,
      footerCopyright,
      showAppStoreLinks,
      playStoreUrl,
      appStoreUrl,
      appStoreLabel,
      legalPages: {
        terms: legalTerms,
        privacy: legalPrivacy,
        refund: legalRefund,
        contact: legalContact,
      },
    });
    showToast('✓ Landing page CMS saved and synchronized live across the platform.');
  };

  // Reset Defaults
  const handleResetDefaults = async () => {
    if (!window.confirm('Reset all landing page sections and content to factory defaults?')) return;

    setBrandName('propit');
    setBrandAccent('hub');
    setFaviconUrl('/favicon.svg');
    setBrowserTitle('Propithub — Property Operations Platform');
    setBrandTagline('Multi-Country Rental Operations');
    setAnnouncementEnabled(false);
    setShowAnnouncement(false);
    setShowHero(true);
    setShowStats(true);
    setShowDuoCards(true);
    setShowListings(true);
    setShowWorld(true);
    setShowHowItWorks(true);
    setShowLandlords(true);
    setShowFeatures(true);
    setShowRoles(true);
    setShowPricing(true);
    setShowFaq(true);
    setShowCtaBanner(true);
    setShowFooter(true);

    setHeadline('Run every rental. Find a home anywhere.');
    setSubheadline(
      'The unified rental workspace for landlords, property managers, and renters across 38 countries. One platform for leases, rent collection, and vacant unit listings.'
    );
    setCtaText('List and manage your property');
    setCtaLink('/register');
    setSecondaryCtaLink('/login');

    setStat1Number('');
    setStat1Label('');
    setStat2Number('$42M+');
    setStat2Label('Rent processed across 8 currencies');
    setStat3Number('');
    setStat3Label('Properties tracked on Propithub');
    setStat4Number('99.2%');
    setStat4Label('On-time automated rent collection rate');

    const defaultSeeker: LandingDuoCardItem = {
      title: 'Looking for a home?',
      description:
        'Browse verified rentals worldwide. Save favorites, book viewings, sign leases online, and pay rent in any currency without hidden broker fees.',
      ctaText: 'Browse all homes →',
      ctaLink: '/homes',
    };
    const defaultOwner: LandingDuoCardItem = {
      title: 'Own or manage property?',
      description:
        'Collect rent automatically, sign legal digital leases, and handle repairs with dispatched contractors. Publish vacant units in one click to fill them faster.',
      ctaText: 'Start 14-day free trial →',
      ctaLink: '/register',
    };
    setSeekerCard(defaultSeeker);
    setOwnerCard(defaultOwner);

    setListingsTitle('Featured homes around the world');
    setWorldKicker('Around the world');
    setWorldTitle('');
    setWorldSubtitle(
      'Connect with verified rental residences across top global financial hubs and lifestyle destinations.'
    );

    setHowItWorksKicker('How it works');
    setHowItWorksTitle('From first enquiry to first rent, in three steps');
    setHowItWorksSubtitle(
      'Landlords and renters meet on the same unified ledger, so nothing is lost in disjointed emails or manual paperwork.'
    );
    setHowItWorksSteps(DEFAULT_STEPS);

    setLandlordsSection(DEFAULT_LANDLORDS_SECTION);

    setFeaturesKicker('Features');
    setFeaturesTitle('Everything a modern rental portfolio needs');
    setFeaturesSubtitle(
      'One unified cloud workspace replacing fragmented spreadsheets, PDF templates, and manual messaging.'
    );
    setFeaturesList(DEFAULT_FEATURES);

    setRolesKicker('What you can do');
    setRolesTitle('Tailored portals for every stakeholder');
    setRolesSubtitle('Each person accesses only what they need with zero clutter.');
    setRolePortals(DEFAULT_ROLE_PORTALS);

    setPricingKicker('Pricing');
    setPricingTitle('Simple, transparent pricing');
    setPricingSubtitle(
      'Every plan includes a 14-day free trial. Publishing vacant units to the global rental hub is included for free.'
    );

    setFaqKicker('FAQ');
    setFaqTitle('Frequently asked questions');
    setFaqSubtitle('');
    setFaqList(DEFAULT_FAQS);

    setCtaBannerTitle('Find a home, or fill one faster.');
    setCtaBannerSubtitle(
      'Join thousands of property owners, managers, and tenants running their rental operations on Propithub.'
    );
    setCtaBannerPrimaryText('Start 14-day free trial');
    setCtaBannerPrimaryLink('/register');
    setCtaBannerSecondaryText('Browse homes');
    setCtaBannerSecondaryLink('/homes');
    setFooterCopyright(`© ${new Date().getFullYear()} Propithub Inc. All rights reserved.`);
    setShowAppStoreLinks(true);
    setPlayStoreUrl('https://play.google.com/store/apps');
    setAppStoreUrl('https://apps.apple.com');
    setAppStoreLabel('Get the mobile app');

    await saveLandingConfig({
      brandName: 'propit',
      brandAccent: 'hub',
      faviconUrl: '/favicon.svg',
      browserTitle: 'Propithub — Property Operations Platform',
      brandTagline: 'Multi-Country Rental Operations',
      announcement: {
        enabled: false,
        badge: 'New Release',
        text: 'Propithub Global Marketplace is live — Multi-gateway rent collections & verified home listings.',
        linkText: 'Browse Homes →',
        linkUrl: '/homes',
      },
      sections: {
        showAnnouncement: false,
        showHero: true,
        showStats: true,
        showDuoCards: true,
        showListings: true,
        showWorld: true,
        showHowItWorks: true,
        showLandlords: true,
        showFeatures: true,
        showRoles: true,
        showPricing: true,
        showFaq: true,
        showCtaBanner: true,
        showFooter: true,
      },
      headline: 'Run every rental. Find a home anywhere.',
      subheadline:
        'The unified rental workspace for landlords, property managers, and renters across 38 countries. One platform for leases, rent collection, and vacant unit listings.',
      ctaText: 'List and manage your property',
      ctaLink: '/register',
      secondaryCtaLink: '/login',
      stats: {
        stat1Number: '',
        stat1Label: '',
        stat2Number: '$42M+',
        stat2Label: 'Rent processed across 8 currencies',
        stat3Number: '',
        stat3Label: 'Properties tracked on Propithub',
        stat4Number: '99.2%',
        stat4Label: 'On-time automated rent collection rate',
      },
      duoCards: {
        seeker: defaultSeeker,
        owner: defaultOwner,
      },
      listingsTitle: 'Featured homes around the world',
      worldKicker: 'Around the world',
      worldTitle: '',
      worldSubtitle:
        'Connect with verified rental residences across top global financial hubs and lifestyle destinations.',
      howItWorksKicker: 'How it works',
      howItWorksTitle: 'From first enquiry to first rent, in three steps',
      howItWorksSubtitle:
        'Landlords and renters meet on the same unified ledger, so nothing is lost in disjointed emails or manual paperwork.',
      howItWorksSteps: DEFAULT_STEPS,
      landlordsSection: DEFAULT_LANDLORDS_SECTION,
      featuresKicker: 'Features',
      featuresTitle: 'Everything a modern rental portfolio needs',
      featuresSubtitle:
        'One unified cloud workspace replacing fragmented spreadsheets, PDF templates, and manual messaging.',
      featuresList: DEFAULT_FEATURES,
      rolesKicker: 'What you can do',
      rolesTitle: 'Tailored portals for every stakeholder',
      rolesSubtitle: 'Dedicated workspaces for every role.',
      rolePortals: DEFAULT_ROLE_PORTALS,
      pricingKicker: 'Pricing',
      pricingTitle: 'Simple, transparent pricing',
      pricingSubtitle:
        'Every plan includes a 14-day free trial. Publishing vacant units to the global rental hub is included for free.',
      faqKicker: 'FAQ',
      faqTitle: 'Frequently asked questions',
      faqSubtitle: '',
      faqList: DEFAULT_FAQS,
      ctaBannerTitle: 'Find a home, or fill one faster.',
      ctaBannerSubtitle:
        'Join thousands of property owners, managers, and tenants running their rental operations on Propithub.',
      ctaBannerPrimaryText: 'Start 14-day free trial',
      ctaBannerPrimaryLink: '/register',
      ctaBannerSecondaryText: 'Browse homes',
      ctaBannerSecondaryLink: '/homes',
      footerCopyright: `© ${new Date().getFullYear()} Propithub Inc. All rights reserved.`,
      showAppStoreLinks: true,
      playStoreUrl: 'https://play.google.com/store/apps',
      appStoreUrl: 'https://apps.apple.com',
      appStoreLabel: 'Get the mobile app',
      legalPages: {
        terms: legalTerms,
        privacy: legalPrivacy,
        refund: legalRefund,
        contact: legalContact,
      },
    });
    showToast('Landing page reset to defaults and saved.');
  };

  const handleToggleUnitListing = async (unitId: string, currentStatus: boolean, unitName: string) => {
    const targetUnit = state.units.find((u) => u.id === unitId);
    if (targetUnit) {
      const updated = { ...targetUnit, isListedPublicly: !currentStatus };
      await saveUnit(updated);
      showToast(`${unitName} ${!currentStatus ? 'listed publicly' : 'delisted from landing page'}.`);
    }
  };

  const activeLivePlans = state.plans
    .filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial')
    .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));

  return (
    <div>
      {/* Top Bar Header & Action Buttons */}
      <div
        className="note-box"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.03) 100%)',
          borderColor: 'rgba(16, 185, 129, 0.25)',
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--ink)' }}>
            Super Admin • Full Dynamic Landing Page CMS
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
            Every section on the public landing page is 100% controlled here in real time.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn secondary small btn-mobile-full"
            onClick={() => window.open('/', '_blank')}
          >
            View Live Landing Page ↗
          </button>
          <button
            type="button"
            className="btn secondary small btn-mobile-full"
            onClick={() => window.open('/homes', '_blank')}
          >
            View Browse Homes ↗
          </button>
          <button type="button" className="btn brass small btn-mobile-full" onClick={handleSaveAll}>
            ✓ Save All Changes
          </button>
          <button type="button" className="btn secondary small btn-mobile-full" onClick={handleResetDefaults}>
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Navigation Tabs — 100% Matched to LandingPage.tsx Sections */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginTop: '18px',
          marginBottom: '20px',
          padding: '8px',
          background: 'var(--surface-subtle)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
        }}
      >
        {[
          { id: 'sections', label: '🎛️ Sections & Brand' },
          { id: 'hero', label: '🚀 Hero, KPIs & Duo Cards' },
          { id: 'listings', label: `🏠 Homes & Global Hub (${state.units.filter((u) => u.isListedPublicly).length})` },
          { id: 'howItWorks', label: `🪜 How It Works (${howItWorksSteps.length})` },
          { id: 'landlords', label: '🏢 For Landlords & Mockup' },
          { id: 'features', label: `✨ Core Features (${featuresList.length})` },
          { id: 'roles', label: `👥 Stakeholder Portals (${rolePortals.length})` },
          { id: 'pricing', label: `💳 Pricing (${activeLivePlans.length} Live Plans)` },
          { id: 'faq', label: `❓ FAQs (${faqList.length})` },
          { id: 'ctaFooter', label: '📣 CTA & Footer' },
          { id: 'legal', label: '⚖️ Legal & Support Pages' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: isActive ? 700 : 500,
                background: isActive ? 'var(--brass)' : 'transparent',
                color: isActive ? '#FFFFFF' : 'var(--ink)',
                border: isActive ? '1px solid var(--brass)' : '1px solid transparent',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Sections Visibility & Brand Identity */}
      {activeTab === 'sections' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Dynamic Favicon & Brand Identity</h3>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: '8px' }}>
                    🌐 Browser Tab Preview
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 12px' }}>
                    {faviconUrl ? (
                      <img src={faviconUrl} alt="Favicon" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                    ) : (
                      <PropithubIcon size={16} color="#10B981" />
                    )}
                    <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--ink)' }}>
                      {browserTitle || `${brandName}${brandAccent} — Property Operations Platform`}
                    </span>
                  </div>
                </div>

                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink-soft)', marginBottom: '8px' }}>
                    🏷️ Navbar Brand Preview
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 12px' }}>
                    {faviconUrl ? (
                      <img src={faviconUrl} alt="Logo" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
                    ) : (
                      <PropithubIcon size={22} color="#10B981" />
                    )}
                    <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--ink)' }}>
                      {brandName || 'propit'}
                      <span style={{ color: 'var(--brand, #10B981)' }}>{brandAccent || 'hub'}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="field" style={{ flex: 2 }}>
                  <label>Favicon / Logo URL</label>
                  <input
                    type="text"
                    value={faviconUrl}
                    onChange={(e) => setFaviconUrl(e.target.value)}
                    placeholder="/favicon.svg or https://..."
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Upload Custom Icon</label>
                  <input
                    type="file"
                    accept=".svg,.png,.ico,.webp,.jpg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          if (typeof ev.target?.result === 'string') {
                            setFaviconUrl(ev.target.result);
                            showToast('Favicon uploaded!');
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="row">
                <div className="field">
                  <label>Brand Prefix</label>
                  <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Brand Accent Suffix</label>
                  <input type="text" value={brandAccent} onChange={(e) => setBrandAccent(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Browser Tab Title</label>
                  <input type="text" value={browserTitle} onChange={(e) => setBrowserTitle(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Optional Top Announcement Bar</h3>
            </div>
            <div className="panel-body">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '12px' }}>
                <input
                  type="checkbox"
                  checked={announcementEnabled && showAnnouncement}
                  onChange={(e) => {
                    setAnnouncementEnabled(e.target.checked);
                    setShowAnnouncement(e.target.checked);
                  }}
                />
                <b>Display top announcement bar above header</b>
              </label>
              {announcementEnabled && showAnnouncement && (
                <div className="row">
                  <div className="field">
                    <label>Badge Text</label>
                    <input type="text" value={announcementBadge} onChange={(e) => setAnnouncementBadge(e.target.value)} />
                  </div>
                  <div className="field" style={{ flex: 2 }}>
                    <label>Announcement Text</label>
                    <input type="text" value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Link Label</label>
                    <input type="text" value={announcementLinkText} onChange={(e) => setAnnouncementLinkText(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Link URL</label>
                    <input type="text" value={announcementLinkUrl} onChange={(e) => setAnnouncementLinkUrl(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Landing Page Section Visibility Switches</h3>
            </div>
            <div className="panel-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
                {[
                  { label: 'Hero & Global Home Search', checked: showHero, set: setShowHero },
                  { label: 'Hero KPI Stats Card', checked: showStats, set: setShowStats },
                  { label: 'Two-Up Persona Duo Cards', checked: showDuoCards, set: setShowDuoCards },
                  { label: 'Featured Homes Carousel', checked: showListings, set: setShowListings },
                  { label: 'Around the World (Countries)', checked: showWorld, set: setShowWorld },
                  { label: 'How It Works (Steps)', checked: showHowItWorks, set: setShowHowItWorks },
                  { label: 'For Landlords & Managers', checked: showLandlords, set: setShowLandlords },
                  { label: 'Core Features Grid', checked: showFeatures, set: setShowFeatures },
                  { label: 'Stakeholder Portals (5 Roles)', checked: showRoles, set: setShowRoles },
                  { label: 'Subscription Pricing Plans', checked: showPricing, set: setShowPricing },
                  { label: 'Frequently Asked Questions', checked: showFaq, set: setShowFaq },
                  { label: 'Bottom CTA Banner', checked: showCtaBanner, set: setShowCtaBanner },
                  { label: 'Footer & Legal Links', checked: showFooter, set: setShowFooter },
                ].map((s, idx) => (
                  <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={s.checked} onChange={(e) => s.set(e.target.checked)} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Hero, KPI Card & Two-Up Persona Duo Cards */}
      {activeTab === 'hero' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Hero Headline, Subtitle & Call-to-Actions</h3>
            </div>
            <div className="panel-body">
              <div className="field">
                <label>Main Hero Headline (H1)</label>
                <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} />
              </div>
              <div className="field" style={{ marginTop: '10px' }}>
                <label>Hero Subheadline Paragraph</label>
                <textarea rows={2} value={subheadline} onChange={(e) => setSubheadline(e.target.value)} />
              </div>
              <div className="row" style={{ marginTop: '10px' }}>
                <div className="field">
                  <label>Primary CTA Button Text</label>
                  <input type="text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
                </div>
                <div className="field">
                  <label>Primary CTA Link</label>
                  <input type="text" value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} />
                </div>
                <div className="field">
                  <label>Header Login Button Link</label>
                  <input type="text" value={secondaryCtaLink} onChange={(e) => setSecondaryCtaLink(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Hero Right-Side KPI Card (4 Metrics)</h3>
            </div>
            <div className="panel-body">
              <p className="hint" style={{ marginBottom: '12px' }}>
                Leave a number blank to automatically show live counts from your database (e.g., live listed homes & properties).
              </p>
              <div className="row">
                <div className="field">
                  <label>KPI 1 Number (Blank = Live Listings Count)</label>
                  <input type="text" value={stat1Number} onChange={(e) => setStat1Number(e.target.value)} placeholder="Auto (Live Homes Count)" />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>KPI 1 Label</label>
                  <input type="text" value={stat1Label} onChange={(e) => setStat1Label(e.target.value)} placeholder="Verified homes in X countries" />
                </div>
              </div>
              <div className="row" style={{ marginTop: '8px' }}>
                <div className="field">
                  <label>KPI 2 Number</label>
                  <input type="text" value={stat2Number} onChange={(e) => setStat2Number(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>KPI 2 Label</label>
                  <input type="text" value={stat2Label} onChange={(e) => setStat2Label(e.target.value)} />
                </div>
              </div>
              <div className="row" style={{ marginTop: '8px' }}>
                <div className="field">
                  <label>KPI 3 Number (Blank = Live Properties Count)</label>
                  <input type="text" value={stat3Number} onChange={(e) => setStat3Number(e.target.value)} placeholder="Auto (Live Properties Count)" />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>KPI 3 Label</label>
                  <input type="text" value={stat3Label} onChange={(e) => setStat3Label(e.target.value)} />
                </div>
              </div>
              <div className="row" style={{ marginTop: '8px' }}>
                <div className="field">
                  <label>KPI 4 Number</label>
                  <input type="text" value={stat4Number} onChange={(e) => setStat4Number(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>KPI 4 Label</label>
                  <input type="text" value={stat4Label} onChange={(e) => setStat4Label(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Two-Up Persona Cards (Home Seekers vs. Property Owners)</h3>
            </div>
            <div className="panel-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', background: 'var(--surface-subtle)' }}>
                  <b style={{ display: 'block', marginBottom: '10px', fontSize: '14px' }}>Left Card — Home Seekers</b>
                  <div className="field">
                    <label>Card Title</label>
                    <input type="text" value={seekerCard.title} onChange={(e) => setSeekerCard({ ...seekerCard, title: e.target.value })} />
                  </div>
                  <div className="field" style={{ marginTop: '8px' }}>
                    <label>Description</label>
                    <textarea rows={3} value={seekerCard.description} onChange={(e) => setSeekerCard({ ...seekerCard, description: e.target.value })} />
                  </div>
                  <div className="row" style={{ marginTop: '8px' }}>
                    <div className="field">
                      <label>Button Text</label>
                      <input type="text" value={seekerCard.ctaText} onChange={(e) => setSeekerCard({ ...seekerCard, ctaText: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Button Link</label>
                      <input type="text" value={seekerCard.ctaLink} onChange={(e) => setSeekerCard({ ...seekerCard, ctaLink: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', background: 'var(--surface-subtle)' }}>
                  <b style={{ display: 'block', marginBottom: '10px', fontSize: '14px' }}>Right Card — Property Owners & Managers</b>
                  <div className="field">
                    <label>Card Title</label>
                    <input type="text" value={ownerCard.title} onChange={(e) => setOwnerCard({ ...ownerCard, title: e.target.value })} />
                  </div>
                  <div className="field" style={{ marginTop: '8px' }}>
                    <label>Description</label>
                    <textarea rows={3} value={ownerCard.description} onChange={(e) => setOwnerCard({ ...ownerCard, description: e.target.value })} />
                  </div>
                  <div className="row" style={{ marginTop: '8px' }}>
                    <div className="field">
                      <label>Button Text</label>
                      <input type="text" value={ownerCard.ctaText} onChange={(e) => setOwnerCard({ ...ownerCard, ctaText: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Button Link</label>
                      <input type="text" value={ownerCard.ctaLink} onChange={(e) => setOwnerCard({ ...ownerCard, ctaLink: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Featured Homes, Global Hub Copy & Vacant Listings Moderation */}
      {activeTab === 'listings' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Featured Homes & Around the World Section Headings</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field" style={{ flex: 2 }}>
                  <label>Featured Homes Section Title</label>
                  <input type="text" value={listingsTitle} onChange={(e) => setListingsTitle(e.target.value)} />
                </div>
                <div className="field">
                  <label>Around the World Eyebrow</label>
                  <input type="text" value={worldKicker} onChange={(e) => setWorldKicker(e.target.value)} />
                </div>
              </div>
              <div className="row" style={{ marginTop: '8px' }}>
                <div className="field">
                  <label>Around the World Title (Blank = Auto Country Count)</label>
                  <input
                    type="text"
                    value={worldTitle}
                    onChange={(e) => setWorldTitle(e.target.value)}
                    placeholder="Explore homes across X countries"
                  />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Around the World Subtitle</label>
                  <input type="text" value={worldSubtitle} onChange={(e) => setWorldSubtitle(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Live Public Listings Moderation ({state.units.length} Total Units)</h3>
            </div>
            <div className="panel-body">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Property</th>
                      <th>Country</th>
                      <th>Rent</th>
                      <th>Public Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.units.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ color: 'var(--ink-soft)', padding: '16px 10px' }}>
                          No units created yet in any owner account.
                        </td>
                      </tr>
                    ) : (
                      state.units.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <b>{u.unitNumber || u.id}</b>
                          </td>
                          <td>{u.propertyName || 'Property'}</td>
                          <td>
                            <span className="badge grey">{u.country || 'Global'}</span>
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {getCurrencySymbol(u.currency)}
                            {u.rent?.toLocaleString(getLocaleForCurrency(u.currency))}/mo
                          </td>
                          <td>
                            <span className={`badge ${u.isListedPublicly ? 'green' : 'grey'}`}>
                              {u.isListedPublicly ? 'Publicly Listed' : 'Unlisted'}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn secondary small"
                              onClick={() => handleToggleUnitListing(u.id, !!u.isListedPublicly, u.unitNumber || u.id)}
                            >
                              {u.isListedPublicly ? 'Delist' : 'Publish Publicly'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: How It Works */}
      {activeTab === 'howItWorks' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>How It Works Section Header</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Eyebrow</label>
                  <input type="text" value={howItWorksKicker} onChange={(e) => setHowItWorksKicker(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Section Title</label>
                  <input type="text" value={howItWorksTitle} onChange={(e) => setHowItWorksTitle(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginTop: '8px' }}>
                <label>Section Subtitle</label>
                <textarea rows={2} value={howItWorksSubtitle} onChange={(e) => setHowItWorksSubtitle(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Step Cards ({howItWorksSteps.length})</h3>
              <button
                type="button"
                className="btn brass small"
                onClick={() => {
                  setHowItWorksSteps([
                    ...howItWorksSteps,
                    {
                      id: 's-' + Date.now(),
                      stepNumber: `${howItWorksSteps.length + 1}`,
                      title: 'New Step Title',
                      description: 'Describe how this step works.',
                    },
                  ]);
                }}
              >
                + Add Step
              </button>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {howItWorksSteps.map((step, idx) => (
                <div key={step.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', background: 'var(--surface-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <b>Step #{idx + 1}</b>
                    <button
                      type="button"
                      className="btn secondary small"
                      style={{ color: '#EF4444' }}
                      onClick={() => setHowItWorksSteps(howItWorksSteps.filter((s) => s.id !== step.id))}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="row">
                    <div className="field" style={{ maxWidth: '100px' }}>
                      <label>Step Number</label>
                      <input
                        type="text"
                        value={step.stepNumber}
                        onChange={(e) =>
                          setHowItWorksSteps(howItWorksSteps.map((s) => (s.id === step.id ? { ...s, stepNumber: e.target.value } : s)))
                        }
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Step Title</label>
                      <input
                        type="text"
                        value={step.title}
                        onChange={(e) =>
                          setHowItWorksSteps(howItWorksSteps.map((s) => (s.id === step.id ? { ...s, title: e.target.value } : s)))
                        }
                      />
                    </div>
                  </div>
                  <div className="field" style={{ marginTop: '8px' }}>
                    <label>Description</label>
                    <textarea
                      rows={2}
                      value={step.description}
                      onChange={(e) =>
                        setHowItWorksSteps(howItWorksSteps.map((s) => (s.id === step.id ? { ...s, description: e.target.value } : s)))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: For Landlords & Managers Section + Interactive Mockup */}
      {activeTab === 'landlords' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>For Landlords & Managers Copy & Bullets</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Eyebrow</label>
                  <input
                    type="text"
                    value={landlordsSection.kicker}
                    onChange={(e) => setLandlordsSection({ ...landlordsSection, kicker: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Headline</label>
                  <input
                    type="text"
                    value={landlordsSection.title}
                    onChange={(e) => setLandlordsSection({ ...landlordsSection, title: e.target.value })}
                  />
                </div>
              </div>
              <div className="field" style={{ marginTop: '8px' }}>
                <label>Lead Paragraph</label>
                <textarea
                  rows={2}
                  value={landlordsSection.subtitle}
                  onChange={(e) => setLandlordsSection({ ...landlordsSection, subtitle: e.target.value })}
                />
              </div>

              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontWeight: 700, fontSize: '13px' }}>Checklist Bullets ({landlordsSection.bullets.length})</label>
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() =>
                      setLandlordsSection({
                        ...landlordsSection,
                        bullets: [...landlordsSection.bullets, 'New landlord capability bullet'],
                      })
                    }
                  >
                    + Add Bullet
                  </button>
                </div>
                {landlordsSection.bullets.map((b, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      value={b}
                      onChange={(e) => {
                        const updated = [...landlordsSection.bullets];
                        updated[idx] = e.target.value;
                        setLandlordsSection({ ...landlordsSection, bullets: updated });
                      }}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn secondary small"
                      style={{ color: '#EF4444' }}
                      onClick={() =>
                        setLandlordsSection({
                          ...landlordsSection,
                          bullets: landlordsSection.bullets.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="row" style={{ marginTop: '12px' }}>
                <div className="field">
                  <label>Primary CTA Text</label>
                  <input
                    type="text"
                    value={landlordsSection.primaryCtaText}
                    onChange={(e) => setLandlordsSection({ ...landlordsSection, primaryCtaText: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Primary CTA Link</label>
                  <input
                    type="text"
                    value={landlordsSection.primaryCtaLink}
                    onChange={(e) => setLandlordsSection({ ...landlordsSection, primaryCtaLink: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Secondary CTA Text</label>
                  <input
                    type="text"
                    value={landlordsSection.secondaryCtaText}
                    onChange={(e) => setLandlordsSection({ ...landlordsSection, secondaryCtaText: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Secondary CTA Link</label>
                  <input
                    type="text"
                    value={landlordsSection.secondaryCtaLink}
                    onChange={(e) => setLandlordsSection({ ...landlordsSection, secondaryCtaLink: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Interactive Landlord Dashboard Mockup Card</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Mockup Header Greeting</label>
                  <input
                    type="text"
                    value={landlordsSection.mockupGreeting}
                    onChange={(e) => setLandlordsSection({ ...landlordsSection, mockupGreeting: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Mockup Attention Subtext</label>
                  <input
                    type="text"
                    value={landlordsSection.mockupSubtext}
                    onChange={(e) => setLandlordsSection({ ...landlordsSection, mockupSubtext: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <label style={{ fontWeight: 700, fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                  Action Rows in Mockup
                </label>
                {landlordsSection.mockupItems.map((m, idx) => (
                  <div key={idx} className="row" style={{ marginBottom: '8px' }}>
                    <div className="field" style={{ flex: 2 }}>
                      <input
                        type="text"
                        value={m.text}
                        onChange={(e) => {
                          const updated = [...landlordsSection.mockupItems];
                          updated[idx] = { ...updated[idx], text: e.target.value };
                          setLandlordsSection({ ...landlordsSection, mockupItems: updated });
                        }}
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <input
                        type="text"
                        value={m.action}
                        onChange={(e) => {
                          const updated = [...landlordsSection.mockupItems];
                          updated[idx] = { ...updated[idx], action: e.target.value };
                          setLandlordsSection({ ...landlordsSection, mockupItems: updated });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '12px' }}>
                <label style={{ fontWeight: 700, fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                  Bottom KPI Pills in Mockup
                </label>
                <div className="row">
                  {landlordsSection.mockupKpis.map((k, idx) => (
                    <div key={idx} className="field">
                      <label>KPI #{idx + 1} Value & Label</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          value={k.value}
                          onChange={(e) => {
                            const updated = [...landlordsSection.mockupKpis];
                            updated[idx] = { ...updated[idx], value: e.target.value };
                            setLandlordsSection({ ...landlordsSection, mockupKpis: updated });
                          }}
                        />
                        <input
                          type="text"
                          value={k.label}
                          onChange={(e) => {
                            const updated = [...landlordsSection.mockupKpis];
                            updated[idx] = { ...updated[idx], label: e.target.value };
                            setLandlordsSection({ ...landlordsSection, mockupKpis: updated });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Core Features */}
      {activeTab === 'features' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Core Features Section Header</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Eyebrow</label>
                  <input type="text" value={featuresKicker} onChange={(e) => setFeaturesKicker(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Section Title</label>
                  <input type="text" value={featuresTitle} onChange={(e) => setFeaturesTitle(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginTop: '8px' }}>
                <label>Section Subtitle</label>
                <textarea rows={2} value={featuresSubtitle} onChange={(e) => setFeaturesSubtitle(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Feature Cards ({featuresList.length})</h3>
              <button
                type="button"
                className="btn brass small"
                onClick={() =>
                  setFeaturesList([
                    ...featuresList,
                    {
                      id: 'f-' + Date.now(),
                      icon: '✨',
                      title: 'New Platform Feature',
                      description: 'Describe how this feature helps landlords, managers, or tenants.',
                    },
                  ])
                }
              >
                + Add Feature Card
              </button>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {featuresList.map((item, idx) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', background: 'var(--surface-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <b>Feature #{idx + 1}</b>
                    <button
                      type="button"
                      className="btn secondary small"
                      style={{ color: '#EF4444' }}
                      onClick={() => setFeaturesList(featuresList.filter((f) => f.id !== item.id))}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="row">
                    <div className="field" style={{ maxWidth: '100px' }}>
                      <label>Icon / Emoji</label>
                      <input
                        type="text"
                        value={item.icon}
                        onChange={(e) =>
                          setFeaturesList(featuresList.map((f) => (f.id === item.id ? { ...f, icon: e.target.value } : f)))
                        }
                      />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Title</label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) =>
                          setFeaturesList(featuresList.map((f) => (f.id === item.id ? { ...f, title: e.target.value } : f)))
                        }
                      />
                    </div>
                  </div>
                  <div className="field" style={{ marginTop: '8px' }}>
                    <label>Description</label>
                    <textarea
                      rows={2}
                      value={item.description}
                      onChange={(e) =>
                        setFeaturesList(featuresList.map((f) => (f.id === item.id ? { ...f, description: e.target.value } : f)))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: Stakeholder Portals (5 Roles) */}
      {activeTab === 'roles' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Stakeholder Portals Section Header</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Eyebrow</label>
                  <input type="text" value={rolesKicker} onChange={(e) => setRolesKicker(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Section Title</label>
                  <input type="text" value={rolesTitle} onChange={(e) => setRolesTitle(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginTop: '8px' }}>
                <label>Section Subtitle</label>
                <input type="text" value={rolesSubtitle} onChange={(e) => setRolesSubtitle(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Stakeholder Role Cards ({rolePortals.length})</h3>
            </div>
            <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '14px' }}>
              {rolePortals.map((rp, rIdx) => (
                <div
                  key={rp.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderTop: `4px solid ${rp.color || '#0f766e'}`,
                    borderRadius: '10px',
                    padding: '14px',
                    background: 'var(--surface-subtle)',
                  }}
                >
                  <div className="row">
                    <div className="field" style={{ flex: 1 }}>
                      <label>Role Title</label>
                      <input
                        type="text"
                        value={rp.title}
                        onChange={(e) => {
                          const updated = [...rolePortals];
                          updated[rIdx] = { ...updated[rIdx], title: e.target.value };
                          setRolePortals(updated);
                        }}
                      />
                    </div>
                    <div className="field" style={{ maxWidth: '80px' }}>
                      <label>Color</label>
                      <input
                        type="color"
                        value={rp.color || '#0f766e'}
                        onChange={(e) => {
                          const updated = [...rolePortals];
                          updated[rIdx] = { ...updated[rIdx], color: e.target.value };
                          setRolePortals(updated);
                        }}
                        style={{ height: '36px', padding: '2px', cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                      Bullet Points
                    </label>
                    {rp.bullets.map((b, bIdx) => (
                      <div key={bIdx} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                        <input
                          type="text"
                          value={b}
                          onChange={(e) => {
                            const updated = [...rolePortals];
                            const nextBullets = [...updated[rIdx].bullets];
                            nextBullets[bIdx] = e.target.value;
                            updated[rIdx] = { ...updated[rIdx], bullets: nextBullets };
                            setRolePortals(updated);
                          }}
                          style={{ flex: 1, fontSize: '12.5px' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: Pricing Section & Live Plans */}
      {activeTab === 'pricing' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Pricing Section Header</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Eyebrow</label>
                  <input type="text" value={pricingKicker} onChange={(e) => setPricingKicker(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Section Title</label>
                  <input type="text" value={pricingTitle} onChange={(e) => setPricingTitle(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginTop: '8px' }}>
                <label>Section Subtitle</label>
                <textarea rows={2} value={pricingSubtitle} onChange={(e) => setPricingSubtitle(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0 }}>Live Subscription Plans Sourced from Admin Plans Console</h3>
                <div className="hint" style={{ marginTop: '3px' }}>
                  The public landing page dynamically renders the live commercial plans configured by the administrator in the Plans Console.
                </div>
              </div>
              <button type="button" className="btn brass" onClick={() => navigate('/superadmin/plans')}>
                Manage Subscription Plans Console ↗
              </button>
            </div>
            <div className="panel-body">
              <div
                style={{
                  padding: '16px',
                  background: 'var(--surface-subtle)',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '14px' }}>
                    Active Commercial Plans Sourced on Landing Page ({activeLivePlans.length}):
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {activeLivePlans.map((plan) => (
                      <span
                        key={plan.id}
                        className="badge"
                        style={{
                          background: plan.isPopular ? 'var(--brass-gold, #f59e0b)' : 'var(--surface-sunken)',
                          color: plan.isPopular ? '#ffffff' : 'var(--ink)',
                          fontWeight: 700,
                          padding: '6px 12px',
                          fontSize: '12.5px',
                        }}
                      >
                        {plan.name} (${plan.price}/mo) {plan.isPopular ? '★ Most Popular' : ''} {plan.popularBoostDays ? `· 🔥 ${plan.popularBoostDays}d boost` : ''}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', maxWidth: '340px' }}>
                  All limits, pricing, and popular listing boost days configured in <b>SuperAdmin Plans</b> reflect instantly across the public landing page.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: FAQs */}
      {activeTab === 'faq' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>FAQ Section Header</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Eyebrow</label>
                  <input type="text" value={faqKicker} onChange={(e) => setFaqKicker(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Section Title</label>
                  <input type="text" value={faqTitle} onChange={(e) => setFaqTitle(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginTop: '8px' }}>
                <label>Optional Subtitle</label>
                <input type="text" value={faqSubtitle} onChange={(e) => setFaqSubtitle(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>FAQ Questions & Answers ({faqList.length})</h3>
              <button
                type="button"
                className="btn brass small"
                onClick={() =>
                  setFaqList([
                    ...faqList,
                    {
                      id: 'faq-' + Date.now(),
                      question: 'New Frequently Asked Question?',
                      answer: 'Provide a clear, helpful answer here.',
                    },
                  ])
                }
              >
                + Add FAQ
              </button>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {faqList.map((faq, idx) => (
                <div key={faq.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', background: 'var(--surface-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <b>FAQ #{idx + 1}</b>
                    <button
                      type="button"
                      className="btn secondary small"
                      style={{ color: '#EF4444' }}
                      onClick={() => setFaqList(faqList.filter((f) => f.id !== faq.id))}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="field">
                    <label>Question</label>
                    <input
                      type="text"
                      value={faq.question}
                      onChange={(e) =>
                        setFaqList(faqList.map((f) => (f.id === faq.id ? { ...f, question: e.target.value } : f)))
                      }
                    />
                  </div>
                  <div className="field" style={{ marginTop: '8px' }}>
                    <label>Answer</label>
                    <textarea
                      rows={3}
                      value={faq.answer}
                      onChange={(e) =>
                        setFaqList(faqList.map((f) => (f.id === faq.id ? { ...f, answer: e.target.value } : f)))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 10: CTA Banner & Footer */}
      {activeTab === 'ctaFooter' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Bottom Call-to-Action Banner</h3>
            </div>
            <div className="panel-body">
              <div className="field">
                <label>Banner Headline</label>
                <input type="text" value={ctaBannerTitle} onChange={(e) => setCtaBannerTitle(e.target.value)} />
              </div>
              <div className="field" style={{ marginTop: '8px' }}>
                <label>Banner Subtitle</label>
                <textarea rows={2} value={ctaBannerSubtitle} onChange={(e) => setCtaBannerSubtitle(e.target.value)} />
              </div>
              <div className="row" style={{ marginTop: '8px' }}>
                <div className="field">
                  <label>Primary Button Text</label>
                  <input type="text" value={ctaBannerPrimaryText} onChange={(e) => setCtaBannerPrimaryText(e.target.value)} />
                </div>
                <div className="field">
                  <label>Primary Button Link</label>
                  <input type="text" value={ctaBannerPrimaryLink} onChange={(e) => setCtaBannerPrimaryLink(e.target.value)} />
                </div>
                <div className="field">
                  <label>Secondary Button Text</label>
                  <input type="text" value={ctaBannerSecondaryText} onChange={(e) => setCtaBannerSecondaryText(e.target.value)} />
                </div>
                <div className="field">
                  <label>Secondary Button Link</label>
                  <input type="text" value={ctaBannerSecondaryLink} onChange={(e) => setCtaBannerSecondaryLink(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Footer Copyright</h3>
            </div>
            <div className="panel-body">
              <div className="field">
                <label>Copyright Notice Text</label>
                <input type="text" value={footerCopyright} onChange={(e) => setFooterCopyright(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>📱 Mobile App Store Downloads (Footer)</h3>
            </div>
            <div className="panel-body">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '14px' }}>
                <input
                  type="checkbox"
                  checked={showAppStoreLinks}
                  onChange={(e) => setShowAppStoreLinks(e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Show App Store & Google Play Badges in Footer</span>
              </label>

              <div className="field">
                <label>Badges Header Label</label>
                <input
                  type="text"
                  placeholder="e.g. Get the mobile app"
                  value={appStoreLabel}
                  onChange={(e) => setAppStoreLabel(e.target.value)}
                />
              </div>

              <div className="row" style={{ marginTop: '10px' }}>
                <div className="field">
                  <label>Google Play Store URL</label>
                  <input
                    type="url"
                    placeholder="https://play.google.com/store/apps/details?id=com.propithub.app"
                    value={playStoreUrl}
                    onChange={(e) => setPlayStoreUrl(e.target.value)}
                  />
                  <small style={{ color: 'var(--ink-soft)', marginTop: '4px', display: 'block' }}>
                    Leave blank to hide the Google Play badge.
                  </small>
                </div>
                <div className="field">
                  <label>Apple App Store URL</label>
                  <input
                    type="url"
                    placeholder="https://apps.apple.com/app/propithub/id123456789"
                    value={appStoreUrl}
                    onChange={(e) => setAppStoreUrl(e.target.value)}
                  />
                  <small style={{ color: 'var(--ink-soft)', marginTop: '4px', display: 'block' }}>
                    Leave blank to hide the App Store badge.
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 11: Legal Policies & Support Pages */}
      {activeTab === 'legal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', flexWrap: 'wrap' }}>
            {[
              { id: 'terms', label: '📄 Terms of Use', path: '/terms' },
              { id: 'privacy', label: '🔒 Privacy Policy', path: '/privacy' },
              { id: 'refund', label: '🔄 Refund Policy', path: '/refund' },
              { id: 'contact', label: '💬 Contact Support', path: '/contact' },
            ].map((sub) => (
              <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  className={`btn small ${legalSubTab === sub.id ? 'brass' : 'secondary'}`}
                  onClick={() => setLegalSubTab(sub.id as any)}
                >
                  {sub.label}
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => window.open(sub.path, '_blank')}
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            ))}
          </div>

          {(legalSubTab === 'terms' || legalSubTab === 'privacy' || legalSubTab === 'refund') && (() => {
            const currentDoc =
              legalSubTab === 'terms' ? legalTerms : legalSubTab === 'privacy' ? legalPrivacy : legalRefund;
            const setDocState =
              legalSubTab === 'terms' ? setLegalTerms : legalSubTab === 'privacy' ? setLegalPrivacy : setLegalRefund;
            return (
              <div className="panel">
                <div className="panel-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Edit {currentDoc.title}</h3>
                    <button
                      type="button"
                      className="btn brass small"
                      onClick={() =>
                        setDocState({
                          ...currentDoc,
                          sections: [
                            ...currentDoc.sections,
                            {
                              id: `${legalSubTab}-${Date.now()}`,
                              title: `${currentDoc.sections.length + 1}. New Clause`,
                              content: 'Enter clause details...',
                            },
                          ],
                        })
                      }
                    >
                      <Plus size={14} /> Add Clause
                    </button>
                  </div>
                  <div className="row" style={{ marginBottom: '12px' }}>
                    <div className="field">
                      <label>Page Title</label>
                      <input
                        type="text"
                        value={currentDoc.title}
                        onChange={(e) => setDocState({ ...currentDoc, title: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Last Updated</label>
                      <input
                        type="text"
                        value={currentDoc.lastUpdated}
                        onChange={(e) => setDocState({ ...currentDoc, lastUpdated: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: '16px' }}>
                    <label>Subtitle</label>
                    <textarea
                      rows={2}
                      value={currentDoc.subtitle}
                      onChange={(e) => setDocState({ ...currentDoc, subtitle: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {currentDoc.sections.map((sec, idx) => (
                      <div key={sec.id || idx} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', background: 'var(--surface-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <input
                            type="text"
                            value={sec.title}
                            onChange={(e) => {
                              const updated = [...currentDoc.sections];
                              updated[idx] = { ...updated[idx], title: e.target.value };
                              setDocState({ ...currentDoc, sections: updated });
                            }}
                            style={{ fontWeight: 600, width: '85%' }}
                          />
                          <button
                            type="button"
                            className="btn danger small"
                            onClick={() =>
                              setDocState({
                                ...currentDoc,
                                sections: currentDoc.sections.filter((_, i) => i !== idx),
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={sec.content}
                          onChange={(e) => {
                            const updated = [...currentDoc.sections];
                            updated[idx] = { ...updated[idx], content: e.target.value };
                            setDocState({ ...currentDoc, sections: updated });
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {legalSubTab === 'contact' && (
            <div className="panel">
              <div className="panel-body">
                <div className="row" style={{ marginBottom: '12px' }}>
                  <div className="field">
                    <label>Page Title</label>
                    <input
                      type="text"
                      value={legalContact.title}
                      onChange={(e) => setLegalContact({ ...legalContact, title: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Support Email</label>
                    <input
                      type="email"
                      value={legalContact.email}
                      onChange={(e) => setLegalContact({ ...legalContact, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="row" style={{ marginBottom: '12px' }}>
                  <div className="field">
                    <label>Helpline Phone</label>
                    <input
                      type="text"
                      value={legalContact.phone}
                      onChange={(e) => setLegalContact({ ...legalContact, phone: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Business Hours</label>
                    <input
                      type="text"
                      value={legalContact.businessHours}
                      onChange={(e) => setLegalContact({ ...legalContact, businessHours: e.target.value })}
                    />
                  </div>
                </div>
                <div className="field" style={{ marginBottom: '12px' }}>
                  <label>Headquarters Address</label>
                  <input
                    type="text"
                    value={legalContact.address}
                    onChange={(e) => setLegalContact({ ...legalContact, address: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Response Time SLA Notice</label>
                  <input
                    type="text"
                    value={legalContact.responseTimeNotice}
                    onChange={(e) => setLegalContact({ ...legalContact, responseTimeNotice: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Sticky Action Bar */}
      <div
        style={{
          marginTop: '24px',
          padding: '16px 20px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
          All modifications publish directly to live Firestore configuration and update instantly for all visitors.
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn secondary" onClick={handleResetDefaults}>
            Reset to Defaults
          </button>
          <button type="button" className="btn brass" onClick={handleSaveAll}>
            Save All Changes
          </button>
        </div>
      </div>
    </div>
  );
};
