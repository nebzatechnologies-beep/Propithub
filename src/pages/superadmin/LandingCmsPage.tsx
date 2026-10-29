import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import {
  LandingFeatureItem,
  LandingStepItem,
  LandingPricingTier,
  LandingTestimonialItem,
  LandingFaqItem,
  PolicySectionItem,
} from '../../types';
import { INITIAL_STATE } from '../../lib/store';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import { PropithubIcon } from '../../components/common/PropithubLogo';
import { DEFAULT_CURRENCY , DEFAULT_CURRENCY_SYMBOL, getCurrencySymbol, getLocaleForCurrency } from '../../lib/currencyService';

export const LandingCmsPage: React.FC = () => {
  const { state, updateState, saveLandingConfig, saveUnit, showToast } = useAppData();
  const navigate = useNavigate();

  const cfg = state.landingConfig;

  // Active Tab in CMS
  const [activeTab, setActiveTab] = useState<
    'sections' | 'hero' | 'features' | 'howItWorks' | 'pricing' | 'testimonials' | 'faq' | 'ctaFooter' | 'listings' | 'legal'
  >('sections');

  // 1. Branding & Top Bar & Favicon
  const [brandName, setBrandName] = useState(cfg.brandName || 'propit');
  const [brandAccent, setBrandAccent] = useState(cfg.brandAccent || 'hub');
  const [faviconUrl, setFaviconUrl] = useState(cfg.faviconUrl || '/favicon.svg');
  const [browserTitle, setBrowserTitle] = useState(cfg.browserTitle || 'Propithub — Property Operations Platform');
  const [brandTagline, setBrandTagline] = useState(cfg.brandTagline || 'Multi-Country Rental Operations');
  const [announcementEnabled, setAnnouncementEnabled] = useState(cfg.announcement?.enabled ?? false);
  const [announcementBadge, setAnnouncementBadge] = useState(cfg.announcement?.badge || 'New Release');
  const [announcementText, setAnnouncementText] = useState(
    cfg.announcement?.text || 'PropTech 4.6 is live — Multi-gateway rent collections & automated reconciliation.'
  );
  const [announcementLinkText, setAnnouncementLinkText] = useState(cfg.announcement?.linkText || 'Explore Features →');
  const [announcementLinkUrl, setAnnouncementLinkUrl] = useState(cfg.announcement?.linkUrl || '#features');

  // Section Visibility
  const [showAnnouncement, setShowAnnouncement] = useState(cfg.sections?.showAnnouncement ?? false);
  const [showHero, setShowHero] = useState(cfg.sections?.showHero ?? true);
  const [showStats, setShowStats] = useState(cfg.sections?.showStats ?? true);
  const [showFeatures, setShowFeatures] = useState(cfg.sections?.showFeatures ?? true);
  const [showHowItWorks, setShowHowItWorks] = useState(cfg.sections?.showHowItWorks ?? true);
  const [showPricing, setShowPricing] = useState(cfg.sections?.showPricing ?? true);
  const [showListings, setShowListings] = useState(cfg.sections?.showListings ?? true);
  const [showTestimonials, setShowTestimonials] = useState(cfg.sections?.showTestimonials ?? true);
  const [showFaq, setShowFaq] = useState(cfg.sections?.showFaq ?? true);
  const [showCtaBanner, setShowCtaBanner] = useState(cfg.sections?.showCtaBanner ?? true);
  const [showFooter, setShowFooter] = useState(cfg.sections?.showFooter ?? true);

  // 2. Hero Content
  const [heroKicker, setHeroKicker] = useState(cfg.heroKicker || 'PropTech 4.6 • Enterprise Cloud Property OS');
  const [headline, setHeadline] = useState(cfg.headline || 'Smart Property Management for the Modern Era');
  const [subheadline, setSubheadline] = useState(
    cfg.subheadline ||
      'Streamline leasing, automate rent collection, assign maintenance, and manage tenants from one unified cloud platform. Owned & Developed by NEBZA Technologies Private Limited.'
  );
  const [ctaText, setCtaText] = useState(cfg.ctaText || 'Start 14-Day Free Trial →');
  const [ctaLink, setCtaLink] = useState(cfg.ctaLink || '/register');
  const [secondaryCtaText, setSecondaryCtaText] = useState(cfg.secondaryCtaText || 'Sign In to Portal');
  const [secondaryCtaLink, setSecondaryCtaLink] = useState(cfg.secondaryCtaLink || '/login');
  const [trustPills, setTrustPills] = useState<string[]>(
    cfg.trustPills || ['✓ No credit card required', '✓ Instant cloud setup', '✓ All 4 portals included']
  );
  const [ratingText, setRatingText] = useState(
    cfg.ratingText || '4.9/5 rated across 24 countries by property teams'
  );
  const [mockupPropertyName, setMockupPropertyName] = useState(
    cfg.heroMockup?.propertyName || 'Sunset Heights Luxury Residences'
  );
  const [mockupLocationText, setMockupLocationText] = useState(
    cfg.heroMockup?.locationText || 'Springfield, IL • 24 Units • Automated Ledger'
  );
  const [mockupBadgeText, setMockupBadgeText] = useState(cfg.heroMockup?.badgeText || '✓ 96.4% Occupied');

  // Stats
  const [stat1Number, setStat1Number] = useState(cfg.stats?.stat1Number || '15,000+');
  const [stat1Label, setStat1Label] = useState(cfg.stats?.stat1Label || 'Properties on the ledger');
  const [stat2Number, setStat2Number] = useState(cfg.stats?.stat2Number || '45,000+');
  const [stat2Label, setStat2Label] = useState(cfg.stats?.stat2Label || 'Tenants connected');
  const [stat3Number, setStat3Number] = useState(cfg.stats?.stat3Number || '$120M+');
  const [stat3Label, setStat3Label] = useState(cfg.stats?.stat3Label || 'Collected annually');
  const [stat4Number, setStat4Number] = useState(cfg.stats?.stat4Number || '99.98%');
  const [stat4Label, setStat4Label] = useState(cfg.stats?.stat4Label || 'Platform uptime');

  // 3. Features
  const [featuresKicker, setFeaturesKicker] = useState(cfg.featuresKicker || "What's inside");
  const [featuresTitle, setFeaturesTitle] = useState(cfg.featuresTitle || 'Six jobs, one ledger');
  const [featuresSubtitle, setFeaturesSubtitle] = useState(
    cfg.featuresSubtitle ||
      'Everything an owner, a tenant, and a maintainer each need to do — reading from the same set of records, so no one is working off an outdated spreadsheet.'
  );
  const [featuresList, setFeaturesList] = useState<LandingFeatureItem[]>(
    cfg.featuresList && cfg.featuresList.length > 0
      ? cfg.featuresList
      : [
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
        ]
  );

  // 4. How It Works
  const [howItWorksKicker, setHowItWorksKicker] = useState(cfg.howItWorksKicker || 'Getting started');
  const [howItWorksTitle, setHowItWorksTitle] = useState(
    cfg.howItWorksTitle || 'Three afternoons, not three months'
  );
  const [howItWorksSubtitle, setHowItWorksSubtitle] = useState(
    cfg.howItWorksSubtitle || 'Most owners are collecting their first online rent payment inside a week.'
  );
  const [howItWorksSteps, setHowItWorksSteps] = useState<LandingStepItem[]>(
    cfg.howItWorksSteps && cfg.howItWorksSteps.length > 0
      ? cfg.howItWorksSteps
      : [
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
        ]
  );

  // 5. Pricing Plans
  const [pricingKicker, setPricingKicker] = useState(cfg.pricingKicker || 'Plans');
  const [pricingTitle, setPricingTitle] = useState(cfg.pricingTitle || 'Priced by the size of your portfolio');
  const [pricingSubtitle, setPricingSubtitle] = useState(
    cfg.pricingSubtitle ||
      'Every plan includes the full ledger — invoicing, leases, payments, and messaging. Upgrade as your unit count grows.'
  );
  const [pricingPlans, setPricingPlans] = useState<LandingPricingTier[]>(
    cfg.pricingPlans && cfg.pricingPlans.length > 0
      ? cfg.pricingPlans
      : [
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
        ]
  );

  // 6. Testimonials
  const [testimonialsKicker, setTestimonialsKicker] = useState(
    cfg.testimonialsKicker || 'From the ledger’s users'
  );
  const [testimonialsTitle, setTestimonialsTitle] = useState(
    cfg.testimonialsTitle || 'Owners, managers, and tenants on propithub'
  );
  const [testimonialsSubtitle, setTestimonialsSubtitle] = useState(
    cfg.testimonialsSubtitle ||
      'Everything an owner, a tenant, and a maintainer each need to do — reading from the same set of records.'
  );
  const [testimonialsList, setTestimonialsList] = useState<LandingTestimonialItem[]>(
    cfg.testimonialsList && cfg.testimonialsList.length > 0
      ? cfg.testimonialsList
      : [
          {
            id: 't-1',
            quote:
              "“I used to chase four tenants across three group chats. Now I open one screen and know exactly who's paid.”",
            name: 'Dara Whitfield',
            role: 'owner, 4 rental houses',
            stars: 5,
          },
          {
            id: 't-2',
            quote:
              '“Work orders used to live in my head. Now a maintainer sees the ticket the second a tenant files it.”',
            name: 'Marcus Odell',
            role: 'portfolio manager, 60 units',
            stars: 5,
          },
          {
            id: 't-3',
            quote:
              '“Paying rent takes me ninety seconds, and I finally have a place to put in a repair request with photos.”',
            name: 'Priya Nandakumar',
            role: 'tenant',
            stars: 5,
          },
        ]
  );

  // 7. FAQs
  const [faqKicker, setFaqKicker] = useState(cfg.faqKicker || 'Questions');
  const [faqTitle, setFaqTitle] = useState(cfg.faqTitle || 'Frequently Asked Questions');
  const [faqSubtitle, setFaqSubtitle] = useState(
    cfg.faqSubtitle || 'Everything you need to know about Propithub features, billing, and security.'
  );
  const [faqList, setFaqList] = useState<LandingFaqItem[]>(
    cfg.faqList && cfg.faqList.length > 0
      ? cfg.faqList
      : [
          {
            id: 'faq-1',
            question: 'How quickly can I onboard properties and tenants?',
            answer:
              'Within 10 minutes. You can directly add properties, units, and register tenants with lease amounts and security deposits.',
          },
          {
            id: 'faq-2',
            question: 'Does Propithub handle rent payments directly?',
            answer:
              'Yes, owners can connect their own Stripe, PayPal, Razorpay accounts or UPI QR / Bank details to accept rent without platform lock-in.',
          },
          {
            id: 'faq-3',
            question: 'Can tenants sign lease agreements digitally?',
            answer:
              'Yes, digital lease agreements with e-signature and PDF downloads are built into both the Owner and Tenant portals.',
          },
          {
            id: 'faq-4',
            question: 'How do maintenance tickets work?',
            answer:
              'Tenants file tickets with descriptions and photos. Owners assign staff maintainers who can update ticket status and complete work orders.',
          },
          {
            id: 'faq-5',
            question: 'Can I cancel or change my plan anytime?',
            answer: 'Yes, plans can be upgraded or changed anytime without penalties from your Owner Dashboard.',
          },
        ]
  );

  // 8. CTA Banner & Footer
  const [ctaBannerTitle, setCtaBannerTitle] = useState(
    cfg.ctaBannerTitle || 'Ready to close the books on manual rent collection?'
  );
  const [ctaBannerSubtitle, setCtaBannerSubtitle] = useState(
    cfg.ctaBannerSubtitle || 'Join the owners, managers, and firms already running their portfolio on propithub.'
  );
  const [ctaBannerPrimaryText, setCtaBannerPrimaryText] = useState(
    cfg.ctaBannerPrimaryText || 'Register as a property owner'
  );
  const [ctaBannerPrimaryLink, setCtaBannerPrimaryLink] = useState(cfg.ctaBannerPrimaryLink || '/register');
  const [ctaBannerSecondaryText, setCtaBannerSecondaryText] = useState(
    cfg.ctaBannerSecondaryText || 'Sign in to your portal'
  );
  const [ctaBannerSecondaryLink, setCtaBannerSecondaryLink] = useState(
    cfg.ctaBannerSecondaryLink || '/login'
  );

  const [footerBrandDescription, setFooterBrandDescription] = useState(
    cfg.footerBrandDescription ||
      'Enterprise cloud property management platform engineered to streamline leasing, automate billing, and connect owners, tenants, and maintenance crews.'
  );
  const [footerCompanyName, setFooterCompanyName] = useState(
    cfg.footerCompanyName || 'NEBZA Technologies Private Limited'
  );
  const [footerEmail, setFooterEmail] = useState(cfg.footerEmail || 'admin@propithub.com');
  const [footerPhone, setFooterPhone] = useState(cfg.footerPhone || '+1 (555) 010-0001');
  const [footerCopyright, setFooterCopyright] = useState(
    cfg.footerCopyright ||
      '© 2026 Propithub. Owned and Developed by NEBZA Technologies Private Limited. All Rights Reserved.'
  );

  // Legal & Support Pages State
  const [legalSubTab, setLegalSubTab] = useState<'terms' | 'privacy' | 'refund' | 'contact'>('terms');
  const [legalTerms, setLegalTerms] = useState(
    cfg.legalPages?.terms || INITIAL_STATE.landingConfig.legalPages?.terms || {
      title: 'Terms of Use',
      subtitle: 'Please review the terms and covenants governing your use of Propithub software and services.',
      lastUpdated: 'September 18, 2026',
      sections: [],
    }
  );
  const [legalPrivacy, setLegalPrivacy] = useState(
    cfg.legalPages?.privacy || INITIAL_STATE.landingConfig.legalPages?.privacy || {
      title: 'Privacy Policy',
      subtitle: 'How Propithub collects, encrypts, safeguards, and processes personal and tenancy data.',
      lastUpdated: 'September 18, 2026',
      sections: [],
    }
  );
  const [legalRefund, setLegalRefund] = useState(
    cfg.legalPages?.refund || INITIAL_STATE.landingConfig.legalPages?.refund || {
      title: 'Refund Policy',
      subtitle: 'Clear, transparent rules regarding platform subscription cancellations and security deposit returns.',
      lastUpdated: 'September 18, 2026',
      sections: [],
    }
  );
  const [legalContact, setLegalContact] = useState(
    cfg.legalPages?.contact || INITIAL_STATE.landingConfig.legalPages?.contact || {
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
        showFeatures,
        showHowItWorks,
        showPricing,
        showListings,
        showTestimonials,
        showFaq,
        showCtaBanner,
        showFooter,
      },
      heroKicker,
      headline,
      subheadline,
      ctaText,
      ctaLink,
      secondaryCtaText,
      secondaryCtaLink,
      trustPills,
      ratingText,
      heroMockup: {
        propertyName: mockupPropertyName,
        locationText: mockupLocationText,
        badgeText: mockupBadgeText,
      },
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
      featuresKicker,
      featuresTitle,
      featuresSubtitle,
      featuresList,
      howItWorksKicker,
      howItWorksTitle,
      howItWorksSubtitle,
      howItWorksSteps,
      pricingKicker,
      pricingTitle,
      pricingSubtitle,
      pricingPlans,
      listingsKicker: 'Vacant Units',
      listingsTitle: 'Available Listings',
      listingsSubtitle: 'Direct verified rentals from property owners across Propithub',
      testimonialsKicker,
      testimonialsTitle,
      testimonialsSubtitle,
      testimonialsList,
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
      footerBrandDescription,
      footerCompanyName,
      footerEmail,
      footerPhone,
      footerCopyright,
      legalPages: {
        terms: legalTerms,
        privacy: legalPrivacy,
        refund: legalRefund,
        contact: legalContact,
      },
    });
    showToast('✓ Landing page CMS & legal policies updated and persisted across refreshes.');
  };

  // Reset Defaults
  const handleResetDefaults = async () => {
    if (!window.confirm('Reset all landing page sections and content to factory defaults?')) return;
    const defaultData = {
      brandName: 'propit',
      brandAccent: 'hub',
      announcement: {
        enabled: false,
        badge: 'New Release',
        text: 'PropTech 4.6 is live — Multi-gateway rent collections & automated reconciliation.',
        linkText: 'Explore Features →',
        linkUrl: '#features',
      },
      sections: {
        showAnnouncement: false,
        showHero: true,
        showStats: true,
        showFeatures: true,
        showHowItWorks: true,
        showPricing: true,
        showListings: true,
        showTestimonials: true,
        showFaq: true,
        showCtaBanner: true,
        showFooter: true,
      },
      heroKicker: 'PropTech 4.6 • Enterprise Cloud Property OS',
      headline: 'Smart Property Management for the Modern Era',
      subheadline:
        'Streamline leasing, automate rent collection, assign maintenance, and manage tenants from one unified cloud platform. Owned & Developed by NEBZA Technologies Private Limited.',
      ctaText: 'Start 14-Day Free Trial →',
      ctaLink: '/register',
      secondaryCtaText: 'Sign In to Portal',
      secondaryCtaLink: '/login',
      trustPills: ['✓ No credit card required', '✓ Instant cloud setup', '✓ All 4 portals included'],
      ratingText: '4.9/5 rated across 24 countries by property teams',
      heroMockup: {
        propertyName: 'Sunset Heights Luxury Residences',
        locationText: 'Springfield, IL • 24 Units • Automated Ledger',
        badgeText: '✓ 96.4% Occupied',
      },
      stats: {
        stat1Number: '15,000+',
        stat1Label: 'Properties on the ledger',
        stat2Number: '45,000+',
        stat2Label: 'Tenants connected',
        stat3Number: '$120M+',
        stat3Label: 'Collected annually',
        stat4Number: '99.98%',
        stat4Label: 'Platform uptime',
      },
      featuresKicker: "What's inside",
      featuresTitle: 'Six jobs, one ledger',
      featuresSubtitle:
        'Everything an owner, a tenant, and a maintainer each need to do — reading from the same set of records, so no one is working off an outdated spreadsheet.',
      featuresList: [
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
      ],
      howItWorksKicker: 'Getting started',
      howItWorksTitle: 'Three afternoons, not three months',
      howItWorksSubtitle: 'Most owners are collecting their first online rent payment inside a week.',
      howItWorksSteps: [
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
      ],
      pricingKicker: 'Plans',
      pricingTitle: 'Priced by the size of your portfolio',
      pricingSubtitle:
        'Every plan includes the full ledger — invoicing, leases, payments, and messaging. Upgrade as your unit count grows.',
      pricingPlans: [
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
      ],
      testimonialsKicker: 'From the ledger’s users',
      testimonialsTitle: 'Owners, managers, and tenants on propithub',
      testimonialsSubtitle:
        'Everything an owner, a tenant, and a maintainer each need to do — reading from the same set of records.',
      testimonialsList: [
        {
          id: 't-1',
          quote:
            "“I used to chase four tenants across three group chats. Now I open one screen and know exactly who's paid.”",
          name: 'Dara Whitfield',
          role: 'owner, 4 rental houses',
          stars: 5,
        },
        {
          id: 't-2',
          quote:
            '“Work orders used to live in my head. Now a maintainer sees the ticket the second a tenant files it.”',
          name: 'Marcus Odell',
          role: 'portfolio manager, 60 units',
          stars: 5,
        },
        {
          id: 't-3',
          quote:
            '“Paying rent takes me ninety seconds, and I finally have a place to put in a repair request with photos.”',
          name: 'Priya Nandakumar',
          role: 'tenant',
          stars: 5,
        },
      ],
      faqKicker: 'Questions',
      faqTitle: 'Frequently Asked Questions',
      faqSubtitle: 'Everything you need to know about Propithub features, billing, and security.',
      faqList: [
        {
          id: 'faq-1',
          question: 'How quickly can I onboard properties and tenants?',
          answer:
            'Within 10 minutes. You can directly add properties, units, and register tenants with lease amounts and security deposits.',
        },
        {
          id: 'faq-2',
          question: 'Does Propithub handle rent payments directly?',
          answer:
            'Yes, owners can connect their own Stripe, PayPal, Razorpay accounts or UPI QR / Bank details to accept rent without platform lock-in.',
        },
        {
          id: 'faq-3',
          question: 'Can tenants sign lease agreements digitally?',
          answer:
            'Yes, digital lease agreements with e-signature and PDF downloads are built into both the Owner and Tenant portals.',
        },
        {
          id: 'faq-4',
          question: 'How do maintenance tickets work?',
          answer:
            'Tenants file tickets with descriptions and photos. Owners assign staff maintainers who can update ticket status and complete work orders.',
        },
        {
          id: 'faq-5',
          question: 'Can I cancel or change my plan anytime?',
          answer: 'Yes, plans can be upgraded or changed anytime without penalties from your Owner Dashboard.',
        },
      ],
      ctaBannerTitle: 'Ready to close the books on manual rent collection?',
      ctaBannerSubtitle: 'Join the owners, managers, and firms already running their portfolio on propithub.',
      ctaBannerPrimaryText: 'Register as a property owner',
      ctaBannerPrimaryLink: '/register',
      ctaBannerSecondaryText: 'Sign in to your portal',
      ctaBannerSecondaryLink: '/login',
      footerBrandDescription:
        'Enterprise cloud property management platform engineered to streamline leasing, automate billing, and connect owners, tenants, and maintenance crews.',
      footerCompanyName: 'NEBZA Technologies Private Limited',
      footerEmail: 'admin@propithub.com',
      footerPhone: '+1 (555) 010-0001',
      footerCopyright:
        '© 2026 Propithub. Owned and Developed by NEBZA Technologies Private Limited. All Rights Reserved.',
    };

    setBrandName(defaultData.brandName);
    setBrandAccent(defaultData.brandAccent);
    setFaviconUrl('/favicon.svg');
    setBrowserTitle('Propithub — Property Operations Platform');
    setBrandTagline('Multi-Country Rental Operations');
    setAnnouncementEnabled(defaultData.announcement.enabled);
    setAnnouncementBadge(defaultData.announcement.badge);
    setAnnouncementText(defaultData.announcement.text);
    setAnnouncementLinkText(defaultData.announcement.linkText);
    setAnnouncementLinkUrl(defaultData.announcement.linkUrl);

    setShowAnnouncement(defaultData.sections.showAnnouncement);
    setShowHero(defaultData.sections.showHero);
    setShowStats(defaultData.sections.showStats);
    setShowFeatures(defaultData.sections.showFeatures);
    setShowHowItWorks(defaultData.sections.showHowItWorks);
    setShowPricing(defaultData.sections.showPricing);
    setShowListings(defaultData.sections.showListings);
    setShowTestimonials(defaultData.sections.showTestimonials);
    setShowFaq(defaultData.sections.showFaq);
    setShowCtaBanner(defaultData.sections.showCtaBanner);
    setShowFooter(defaultData.sections.showFooter);

    setHeroKicker(defaultData.heroKicker);
    setHeadline(defaultData.headline);
    setSubheadline(defaultData.subheadline);
    setCtaText(defaultData.ctaText);
    setCtaLink(defaultData.ctaLink);
    setSecondaryCtaText(defaultData.secondaryCtaText);
    setSecondaryCtaLink(defaultData.secondaryCtaLink);
    setTrustPills(defaultData.trustPills);
    setRatingText(defaultData.ratingText);
    setMockupPropertyName(defaultData.heroMockup.propertyName);
    setMockupLocationText(defaultData.heroMockup.locationText);
    setMockupBadgeText(defaultData.heroMockup.badgeText);

    setStat1Number(defaultData.stats.stat1Number);
    setStat1Label(defaultData.stats.stat1Label);
    setStat2Number(defaultData.stats.stat2Number);
    setStat2Label(defaultData.stats.stat2Label);
    setStat3Number(defaultData.stats.stat3Number);
    setStat3Label(defaultData.stats.stat3Label);
    setStat4Number(defaultData.stats.stat4Number);
    setStat4Label(defaultData.stats.stat4Label);

    setFeaturesKicker(defaultData.featuresKicker);
    setFeaturesTitle(defaultData.featuresTitle);
    setFeaturesSubtitle(defaultData.featuresSubtitle);
    setFeaturesList(defaultData.featuresList);

    setHowItWorksKicker(defaultData.howItWorksKicker);
    setHowItWorksTitle(defaultData.howItWorksTitle);
    setHowItWorksSubtitle(defaultData.howItWorksSubtitle);
    setHowItWorksSteps(defaultData.howItWorksSteps);

    setPricingKicker(defaultData.pricingKicker);
    setPricingTitle(defaultData.pricingTitle);
    setPricingSubtitle(defaultData.pricingSubtitle);
    setPricingPlans(defaultData.pricingPlans);

    setTestimonialsKicker(defaultData.testimonialsKicker);
    setTestimonialsTitle(defaultData.testimonialsTitle);
    setTestimonialsSubtitle(defaultData.testimonialsSubtitle);
    setTestimonialsList(defaultData.testimonialsList);

    setFaqKicker(defaultData.faqKicker);
    setFaqTitle(defaultData.faqTitle);
    setFaqSubtitle(defaultData.faqSubtitle);
    setFaqList(defaultData.faqList);

    setCtaBannerTitle(defaultData.ctaBannerTitle);
    setCtaBannerSubtitle(defaultData.ctaBannerSubtitle);
    setCtaBannerPrimaryText(defaultData.ctaBannerPrimaryText);
    setCtaBannerPrimaryLink(defaultData.ctaBannerPrimaryLink);
    setCtaBannerSecondaryText(defaultData.ctaBannerSecondaryText);
    setCtaBannerSecondaryLink(defaultData.ctaBannerSecondaryLink);

    setFooterBrandDescription(defaultData.footerBrandDescription);
    setFooterCompanyName(defaultData.footerCompanyName);
    setFooterEmail(defaultData.footerEmail);
    setFooterPhone(defaultData.footerPhone);
    setFooterCopyright(defaultData.footerCopyright);

    await saveLandingConfig(defaultData);
    showToast('Landing page reset to platform defaults and saved.');
  };

  const handleToggleUnitListing = async (unitId: string, currentStatus: boolean, unitName: string) => {
    const targetUnit = state.units.find((u) => u.id === unitId);
    if (targetUnit) {
      const updated = { ...targetUnit, isListedPublicly: !currentStatus };
      await saveUnit(updated);
      showToast(`${unitName} ${!currentStatus ? 'listed publicly' : 'delisted from landing page'}.`);
    }
  };

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
            Super Admin • Full Control Landing Page CMS
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginTop: '2px' }}>
            Modify branding, hero, impact stats, features, how it works, pricing tiers, reviews, FAQs, CTA banner, and footer in real-time.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn secondary small btn-mobile-full"
            onClick={() => window.open('/', '_blank')}
            title="Open landing page in new tab"
          >
            View Live Landing Page ↗
          </button>
          <button type="button" className="btn brass small btn-mobile-full" onClick={handleSaveAll}>
            ✓ Save All Changes
          </button>
          <button type="button" className="btn secondary small btn-mobile-full" onClick={handleResetDefaults}>
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Navigation Tabs for CMS Control - Wrapped Pill Style (No Scrollbars) */}
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
          { id: 'hero', label: '🚀 Hero & Stats' },
          { id: 'features', label: `✨ Feature Cards (${featuresList.length})` },
          { id: 'howItWorks', label: `🪜 How It Works (${howItWorksSteps.length})` },
          { id: 'pricing', label: `💳 Pricing Plans (${state.plans.filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial').length} Live)` },
          { id: 'testimonials', label: `💬 Testimonials (${testimonialsList.length})` },
          { id: 'faq', label: `❓ FAQs (${faqList.length})` },
          { id: 'ctaFooter', label: '📣 CTA & Footer' },
          { id: 'listings', label: '🏠 Vacant Listings Moderation' },
          { id: 'legal', label: '⚖️ Policies & Support Pages' },
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
                boxShadow: isActive ? '0 2px 8px rgba(16, 185, 129, 0.25)' : 'none',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Sections Visibility & Top Branding */}
      {activeTab === 'sections' && (
        <div style={{ marginTop: '16px' }}>
          {/* Brand Identity & Favicon Studio */}
          <div className="panel">
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Dynamic Favicon & Brand Identity</span>
                  <span style={{ fontSize: '11px', background: 'var(--brand-surface, #e0f2fe)', color: 'var(--brand, #0284c7)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                    Live Synchronized
                  </span>
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  Dynamically customize the website favicon icon and the text beside it across browser tabs and navigation bars.
                </div>
              </div>
            </div>

            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* LIVE SIMULATION PREVIEW CARDS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                
                {/* 1. Browser Tab Preview */}
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', marginBottom: '8px' }}>
                    🌐 Browser Tab Preview (Live)
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px 8px 0 0',
                    padding: '8px 12px',
                    maxWidth: '100%',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.04)'
                  }}>
                    {faviconUrl ? (
                      <img
                        src={faviconUrl}
                        alt="Favicon"
                        style={{ width: '16px', height: '16px', objectFit: 'contain', borderRadius: '2px' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/favicon.svg';
                        }}
                      />
                    ) : (
                      <PropithubIcon size={16} color="#10B981" />
                    )}
                    <span style={{
                      fontSize: '12.5px',
                      fontWeight: 500,
                      color: 'var(--ink)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '220px'
                    }}>
                      {browserTitle || `${brandName}${brandAccent ? brandAccent : ''} — Property Operations Platform`}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)', cursor: 'default', marginLeft: '4px' }}>✕</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '8px' }}>
                    This exact favicon icon & title text will display in user browser tabs and bookmarks.
                  </div>
                </div>

                {/* 2. Top Navigation Bar Preview */}
                <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--line)', borderRadius: '10px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', marginBottom: '8px' }}>
                    🏷️ Navbar Header Preview (Live)
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.04)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                      {faviconUrl ? (
                        <img
                          src={faviconUrl}
                          alt="Logo Icon"
                          style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/favicon.svg';
                          }}
                        />
                      ) : (
                        <PropithubIcon size={22} color="#10B981" />
                      )}
                      <span style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--ink)' }}>
                        {brandName || 'propit'}
                        <span style={{ color: 'var(--brand, #10B981)' }}>{brandAccent || 'hub'}</span>
                      </span>
                    </div>
                    {brandTagline && (
                      <span style={{ fontSize: '11px', color: 'var(--ink-soft)', background: 'var(--surface-sunken)', padding: '2px 8px', borderRadius: '4px' }}>
                        {brandTagline}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '8px' }}>
                    The logo icon and styled brand typography rendered on top headers and footers.
                  </div>
                </div>

              </div>

              {/* FAVICON CONTROL SECTION */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>1. Favicon Configuration (Icon Image)</span>
                </h4>

                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="field" style={{ flex: '2 1 280px' }}>
                    <label>Favicon URL or File Path</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={faviconUrl}
                        onChange={(e) => setFaviconUrl(e.target.value)}
                        placeholder="e.g. /favicon.svg, https://... or base64"
                        style={{ flex: 1 }}
                      />
                      {faviconUrl && (
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={() => setFaviconUrl('/favicon.svg')}
                          title="Reset to default icon"
                        >
                          Default
                        </button>
                      )}
                    </div>
                    <div className="hint">Direct image link (.svg, .png, .ico, .webp) or choose a preset / upload below.</div>
                  </div>

                  <div className="field" style={{ flex: '1 1 200px' }}>
                    <label>Upload Custom Icon</label>
                    <input
                      type="file"
                      accept=".svg,.png,.ico,.webp,.jpg"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            if (typeof event.target?.result === 'string') {
                              setFaviconUrl(event.target.result);
                              showToast('Favicon uploaded & applied to preview!');
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      style={{ fontSize: '12px' }}
                    />
                    <div className="hint">Upload a transparent PNG, ICO, or SVG.</div>
                  </div>
                </div>

                {/* Quick Icon Presets */}
                <div style={{ marginTop: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-soft)' }}>Quick Icon Presets:</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setFaviconUrl('/favicon.svg')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', padding: '4px 10px' }}
                    >
                      <img src="/favicon.svg" alt="Default" style={{ width: '14px', height: '14px' }} />
                      Default Emerald Building
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setFaviconUrl("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%230284c7'%3E%3Cpath d='M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z'/%3E%3C/svg%3E")}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', padding: '4px 10px' }}
                    >
                      🛡️ Blue Shield Security
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setFaviconUrl("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2310b981'%3E%3Cpath d='M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'/%3E%3C/svg%3E")}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', padding: '4px 10px' }}
                    >
                      🏠 Emerald Modern Home
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setFaviconUrl("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%237c3aed'%3E%3Cpath d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z'/%3E%3C/svg%3E")}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', padding: '4px 10px' }}
                    >
                      📊 Indigo Enterprise Ledger
                    </button>
                  </div>
                </div>
              </div>

              {/* TEXT BESIDE IT (BRAND & BROWSER TAB TITLE) */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginBottom: '10px' }}>
                  2. Text Beside It (Brand Logo & Browser Tab Text)
                </h4>

                <div className="row">
                  <div className="field">
                    <label>Brand Prefix Text</label>
                    <input
                      type="text"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="propit"
                    />
                    <div className="hint">The primary brand name beside the logo icon (e.g. propit, Nexus, Horizon).</div>
                  </div>

                  <div className="field">
                    <label>Brand Accent Suffix</label>
                    <input
                      type="text"
                      value={brandAccent}
                      onChange={(e) => setBrandAccent(e.target.value)}
                      placeholder="hub"
                    />
                    <div className="hint">Colored brand suffix (e.g. hub, Cloud, OS, 360).</div>
                  </div>
                </div>

                <div className="row" style={{ marginTop: '12px' }}>
                  <div className="field" style={{ flex: 2 }}>
                    <label>Browser Tab Title (Text beside favicon in browser tab)</label>
                    <input
                      type="text"
                      value={browserTitle}
                      onChange={(e) => setBrowserTitle(e.target.value)}
                      placeholder="Propithub — Property Operations Platform"
                    />
                    <div className="hint">The exact text that appears right next to the favicon in the browser tab and search results.</div>
                  </div>

                  <div className="field" style={{ flex: 1 }}>
                    <label>Brand Tagline / Operations Suffix</label>
                    <input
                      type="text"
                      value={brandTagline}
                      onChange={(e) => setBrandTagline(e.target.value)}
                      placeholder="Multi-Country Rental Operations"
                    />
                    <div className="hint">Header subtitle and platform descriptor.</div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Announcement top banner</h3>
            </div>
            <div className="panel-body">
              <div className="field" style={{ marginBottom: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={announcementEnabled}
                    onChange={(e) => setAnnouncementEnabled(e.target.checked)}
                  />
                  <b>Show top announcement bar on landing page</b>
                </label>
              </div>
              {announcementEnabled && (
                <div className="row">
                  <div className="field">
                    <label>Badge Pill Text</label>
                    <input
                      type="text"
                      value={announcementBadge}
                      onChange={(e) => setAnnouncementBadge(e.target.value)}
                      placeholder="New Release"
                    />
                  </div>
                  <div className="field" style={{ flex: 2 }}>
                    <label>Announcement Message</label>
                    <input
                      type="text"
                      value={announcementText}
                      onChange={(e) => setAnnouncementText(e.target.value)}
                      placeholder="PropTech 4.6 is live..."
                    />
                  </div>
                  <div className="field">
                    <label>Link Label & URL</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        value={announcementLinkText}
                        onChange={(e) => setAnnouncementLinkText(e.target.value)}
                        placeholder="Explore →"
                      />
                      <input
                        type="text"
                        value={announcementLinkUrl}
                        onChange={(e) => setAnnouncementLinkUrl(e.target.value)}
                        placeholder="#features"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Section visibility master switches</h3>
            </div>
            <div className="panel-body">
              <p className="hint" style={{ marginBottom: '16px' }}>
                Toggle which sections are visible to public visitors on the landing page:
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '14px',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showHero}
                    onChange={(e) => setShowHero(e.target.checked)}
                  />
                  <span>Hero & Live Mockup</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showStats}
                    onChange={(e) => setShowStats(e.target.checked)}
                  />
                  <span>Impact Stats Strip</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showFeatures}
                    onChange={(e) => setShowFeatures(e.target.checked)}
                  />
                  <span>Features Cards</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showHowItWorks}
                    onChange={(e) => setShowHowItWorks(e.target.checked)}
                  />
                  <span>How It Works Steps</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showPricing}
                    onChange={(e) => setShowPricing(e.target.checked)}
                  />
                  <span>Pricing Packages</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showListings}
                    onChange={(e) => setShowListings(e.target.checked)}
                  />
                  <span>Available Vacant Listings</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showTestimonials}
                    onChange={(e) => setShowTestimonials(e.target.checked)}
                  />
                  <span>Reviews & Testimonials</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showFaq}
                    onChange={(e) => setShowFaq(e.target.checked)}
                  />
                  <span>FAQ Accordion</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showCtaBanner}
                    onChange={(e) => setShowCtaBanner(e.target.checked)}
                  />
                  <span>Bottom CTA Banner</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showFooter}
                    onChange={(e) => setShowFooter(e.target.checked)}
                  />
                  <span>Enterprise SaaS Footer</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Hero Section & Stats Strip */}
      {activeTab === 'hero' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Hero section copy & calls to action</h3>
            </div>
            <div className="panel-body">
              <div className="field">
                <label>Kicker Badge / Tagline</label>
                <input
                  type="text"
                  value={heroKicker}
                  onChange={(e) => setHeroKicker(e.target.value)}
                  placeholder="PropTech 4.6 • Enterprise Cloud Property OS"
                />
              </div>

              <div className="field">
                <label>Main Headline</label>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Smart Property Management for the Modern Era"
                />
              </div>

              <div className="field">
                <label>Subheadline / Lead Paragraph</label>
                <textarea
                  rows={3}
                  value={subheadline}
                  onChange={(e) => setSubheadline(e.target.value)}
                />
              </div>

              <div className="row">
                <div className="field">
                  <label>Primary CTA Text</label>
                  <input
                    type="text"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    placeholder="Start 14-Day Free Trial →"
                  />
                </div>
                <div className="field">
                  <label>Primary CTA Link Target</label>
                  <input
                    type="text"
                    value={ctaLink}
                    onChange={(e) => setCtaLink(e.target.value)}
                    placeholder="/register"
                  />
                </div>
                <div className="field">
                  <label>Secondary CTA Text</label>
                  <input
                    type="text"
                    value={secondaryCtaText}
                    onChange={(e) => setSecondaryCtaText(e.target.value)}
                    placeholder="Sign In to Portal"
                  />
                </div>
                <div className="field">
                  <label>Secondary CTA Link Target</label>
                  <input
                    type="text"
                    value={secondaryCtaLink}
                    onChange={(e) => setSecondaryCtaLink(e.target.value)}
                    placeholder="/login"
                  />
                </div>
              </div>

              <div className="row" style={{ marginTop: '8px' }}>
                <div className="field" style={{ flex: 2 }}>
                  <label>Trust Checkmark Pills (comma separated)</label>
                  <input
                    type="text"
                    value={trustPills.join(', ')}
                    onChange={(e) =>
                      setTrustPills(
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                      )
                    }
                    placeholder="✓ No credit card required, ✓ Instant cloud setup, ✓ All 4 portals included"
                  />
                </div>
                <div className="field">
                  <label>Social Proof Rating Text</label>
                  <input
                    type="text"
                    value={ratingText}
                    onChange={(e) => setRatingText(e.target.value)}
                    placeholder="4.9/5 rated across 24 countries by property teams"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Hero interactive mockup preview details</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Mockup Property Title</label>
                  <input
                    type="text"
                    value={mockupPropertyName}
                    onChange={(e) => setMockupPropertyName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Mockup Property Subtitle & Units</label>
                  <input
                    type="text"
                    value={mockupLocationText}
                    onChange={(e) => setMockupLocationText(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Occupancy Badge Text</label>
                  <input
                    type="text"
                    value={mockupBadgeText}
                    onChange={(e) => setMockupBadgeText(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Impact stats strip</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Stat 1 Value</label>
                  <input
                    type="text"
                    value={stat1Number}
                    onChange={(e) => setStat1Number(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Stat 1 Label</label>
                  <input
                    type="text"
                    value={stat1Label}
                    onChange={(e) => setStat1Label(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Stat 2 Value</label>
                  <input
                    type="text"
                    value={stat2Number}
                    onChange={(e) => setStat2Number(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Stat 2 Label</label>
                  <input
                    type="text"
                    value={stat2Label}
                    onChange={(e) => setStat2Label(e.target.value)}
                  />
                </div>
              </div>
              <div className="row" style={{ marginTop: '12px' }}>
                <div className="field">
                  <label>Stat 3 Value</label>
                  <input
                    type="text"
                    value={stat3Number}
                    onChange={(e) => setStat3Number(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Stat 3 Label</label>
                  <input
                    type="text"
                    value={stat3Label}
                    onChange={(e) => setStat3Label(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Stat 4 Value</label>
                  <input
                    type="text"
                    value={stat4Number}
                    onChange={(e) => setStat4Number(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Stat 4 Label</label>
                  <input
                    type="text"
                    value={stat4Label}
                    onChange={(e) => setStat4Label(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Features */}
      {activeTab === 'features' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Features header copy</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Section Kicker</label>
                  <input
                    type="text"
                    value={featuresKicker}
                    onChange={(e) => setFeaturesKicker(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Section Title</label>
                  <input
                    type="text"
                    value={featuresTitle}
                    onChange={(e) => setFeaturesTitle(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Section Subtitle</label>
                <textarea
                  rows={2}
                  value={featuresSubtitle}
                  onChange={(e) => setFeaturesSubtitle(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Manage feature cards ({featuresList.length})</h3>
              <button
                type="button"
                className="btn brass small"
                onClick={() => {
                  const newCard: LandingFeatureItem = {
                    id: 'f-' + Date.now(),
                    icon: '⚡',
                    title: 'New Feature',
                    description: 'Feature description explaining modern property efficiency.',
                  };
                  setFeaturesList([...featuresList, newCard]);
                }}
              >
                + Add Feature Card
              </button>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {featuresList.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '16px',
                      background: 'var(--surface-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>
                        Card #{idx + 1}
                      </span>
                      <button
                        type="button"
                        className="btn secondary small"
                        style={{ color: '#EF4444' }}
                        onClick={() => setFeaturesList(featuresList.filter((f) => f.id !== item.id))}
                      >
                        Delete Card
                      </button>
                    </div>
                    <div className="row">
                      <div className="field" style={{ maxWidth: '90px' }}>
                        <label>Icon / Emoji</label>
                        <input
                          type="text"
                          value={item.icon}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFeaturesList(featuresList.map((f) => (f.id === item.id ? { ...f, icon: val } : f)));
                          }}
                        />
                      </div>
                      <div className="field" style={{ flex: 1 }}>
                        <label>Title</label>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFeaturesList(featuresList.map((f) => (f.id === item.id ? { ...f, title: val } : f)));
                          }}
                        />
                      </div>
                    </div>
                    <div className="field" style={{ marginTop: '8px' }}>
                      <label>Description</label>
                      <textarea
                        rows={2}
                        value={item.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFeaturesList(featuresList.map((f) => (f.id === item.id ? { ...f, description: val } : f)));
                        }}
                      />
                    </div>
                  </div>
                ))}
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
              <h3>How It Works header copy</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Section Kicker</label>
                  <input
                    type="text"
                    value={howItWorksKicker}
                    onChange={(e) => setHowItWorksKicker(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Section Title</label>
                  <input
                    type="text"
                    value={howItWorksTitle}
                    onChange={(e) => setHowItWorksTitle(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Section Subtitle</label>
                <textarea
                  rows={2}
                  value={howItWorksSubtitle}
                  onChange={(e) => setHowItWorksSubtitle(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Manage step cards ({howItWorksSteps.length})</h3>
              <button
                type="button"
                className="btn brass small"
                onClick={() => {
                  const newStep: LandingStepItem = {
                    id: 's-' + Date.now(),
                    stepNumber: `0${howItWorksSteps.length + 1}`,
                    title: 'New Step Title',
                    description: 'Instructions on onboarding and automatic workflow operations.',
                  };
                  setHowItWorksSteps([...howItWorksSteps, newStep]);
                }}
              >
                + Add Step Card
              </button>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {howItWorksSteps.map((step, idx) => (
                  <div
                    key={step.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '16px',
                      background: 'var(--surface-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>
                        Step #{idx + 1}
                      </span>
                      <button
                        type="button"
                        className="btn secondary small"
                        style={{ color: '#EF4444' }}
                        onClick={() => setHowItWorksSteps(howItWorksSteps.filter((s) => s.id !== step.id))}
                      >
                        Delete Step
                      </button>
                    </div>
                    <div className="row">
                      <div className="field" style={{ maxWidth: '110px' }}>
                        <label>Badge / Number</label>
                        <input
                          type="text"
                          value={step.stepNumber}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHowItWorksSteps(howItWorksSteps.map((s) => (s.id === step.id ? { ...s, stepNumber: val } : s)));
                          }}
                        />
                      </div>
                      <div className="field" style={{ flex: 1 }}>
                        <label>Step Headline</label>
                        <input
                          type="text"
                          value={step.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHowItWorksSteps(howItWorksSteps.map((s) => (s.id === step.id ? { ...s, title: val } : s)));
                          }}
                        />
                      </div>
                    </div>
                    <div className="field" style={{ marginTop: '8px' }}>
                      <label>Step Description</label>
                      <textarea
                        rows={2}
                        value={step.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setHowItWorksSteps(howItWorksSteps.map((s) => (s.id === step.id ? { ...s, description: val } : s)));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Pricing Plans */}
      {activeTab === 'pricing' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Pricing header copy</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Section Kicker</label>
                  <input
                    type="text"
                    value={pricingKicker}
                    onChange={(e) => setPricingKicker(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Section Title</label>
                  <input
                    type="text"
                    value={pricingTitle}
                    onChange={(e) => setPricingTitle(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Section Subtitle</label>
                <textarea
                  rows={2}
                  value={pricingSubtitle}
                  onChange={(e) => setPricingSubtitle(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div
              className="panel-head"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Active Admin Subscription Plans ({state.plans.filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial').length})</h3>
                <div className="hint" style={{ marginTop: '2px' }}>
                  These plans are rendered directly on the public landing page and used for owner signups and billing.
                </div>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => navigate('/superadmin/plans')}
              >
                Go to Full Subscription Plans Console ↗
              </button>
            </div>
            <div className="panel-body">
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  color: 'var(--ink)',
                }}
              >
                💡 <b>Direct Admin Sync:</b> Any change you make here or in <b>Superadmin → Plans</b> immediately updates the pricing cards, unit/property limits, and subscription checkout on the live landing page.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {state.plans
                  .filter((p) => !p.isArchived && !p.isTrialOnly && p.id !== 'free_trial')
                  .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))
                  .map((plan) => (
                    <div
                      key={plan.id}
                      style={{
                        border: plan.isPopular ? '2px solid var(--primary, #0D9488)' : '1px solid var(--border)',
                        borderRadius: '10px',
                        padding: '16px',
                        background: 'var(--surface-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--ink)' }}>
                              {plan.name}
                            </span>
                            {plan.isPopular && (
                              <span className="badge green" style={{ fontSize: '10px', fontWeight: 800 }}>
                                Popular
                              </span>
                            )}
                          </div>
                          <span className="badge green" style={{ fontSize: '12px', fontWeight: 700 }}>
                            ${plan.price} / mo
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Max Properties:</span>
                            <b style={{ color: 'var(--ink)' }}>{plan.properties >= 999 ? 'Unlimited' : plan.properties}</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Max Units:</span>
                            <b style={{ color: 'var(--ink)' }}>{plan.units >= 9999 ? 'Unlimited' : plan.units}</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Max Tenants:</span>
                            <b style={{ color: 'var(--ink)' }}>{plan.tenants >= 9999 ? 'Unlimited' : plan.tenants}</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Max Managers:</span>
                            <b style={{ color: 'var(--ink)' }}>{plan.managers ?? 0}</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Max Staff:</span>
                            <b style={{ color: 'var(--ink)' }}>{plan.staff ?? 0}</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Active Subscribers:</span>
                            <b style={{ color: 'var(--brass)' }}>{plan.owners} owners</b>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                        <div className="row" style={{ marginBottom: '8px' }}>
                          <div className="field" style={{ margin: 0 }}>
                            <label style={{ fontSize: '11px' }}>Quick Price ($/mo)</label>
                            <input
                              type="number"
                              value={plan.price}
                              onChange={(e) => {
                                const newPrice = parseFloat(e.target.value) || 0;
                                updateState((prev) => ({
                                  ...prev,
                                  plans: prev.plans.map((p) => (p.id === plan.id ? { ...p, price: newPrice } : p)),
                                }));
                              }}
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Testimonials */}
      {activeTab === 'testimonials' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Testimonials header copy</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Section Kicker</label>
                  <input
                    type="text"
                    value={testimonialsKicker}
                    onChange={(e) => setTestimonialsKicker(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Section Title</label>
                  <input
                    type="text"
                    value={testimonialsTitle}
                    onChange={(e) => setTestimonialsTitle(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Section Subtitle</label>
                <textarea
                  rows={2}
                  value={testimonialsSubtitle}
                  onChange={(e) => setTestimonialsSubtitle(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Customer reviews & testimonials ({testimonialsList.length})</h3>
              <button
                type="button"
                className="btn brass small"
                onClick={() => {
                  const newTesti: LandingTestimonialItem = {
                    id: 't-' + Date.now(),
                    quote: '“Propithub transformed our rental accounting completely.”',
                    name: 'Alex Johnson',
                    role: 'Property Owner, 12 Units',
                    stars: 5,
                  };
                  setTestimonialsList([...testimonialsList, newTesti]);
                }}
              >
                + Add Review
              </button>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {testimonialsList.map((testi, idx) => (
                  <div
                    key={testi.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '16px',
                      background: 'var(--surface-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>
                        Review #{idx + 1}
                      </span>
                      <button
                        type="button"
                        className="btn secondary small"
                        style={{ color: '#EF4444' }}
                        onClick={() => setTestimonialsList(testimonialsList.filter((t) => t.id !== testi.id))}
                      >
                        Delete Review
                      </button>
                    </div>
                    <div className="field">
                      <label>Customer Quote</label>
                      <textarea
                        rows={2}
                        value={testi.quote}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTestimonialsList(testimonialsList.map((t) => (t.id === testi.id ? { ...t, quote: val } : t)));
                        }}
                      />
                    </div>
                    <div className="row" style={{ marginTop: '8px' }}>
                      <div className="field">
                        <label>Author Full Name</label>
                        <input
                          type="text"
                          value={testi.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTestimonialsList(testimonialsList.map((t) => (t.id === testi.id ? { ...t, name: val } : t)));
                          }}
                        />
                      </div>
                      <div className="field">
                        <label>Author Role / Designation</label>
                        <input
                          type="text"
                          value={testi.role}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTestimonialsList(testimonialsList.map((t) => (t.id === testi.id ? { ...t, role: val } : t)));
                          }}
                        />
                      </div>
                      <div className="field" style={{ maxWidth: '100px' }}>
                        <label>Stars (1-5)</label>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={testi.stars}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 5;
                            setTestimonialsList(testimonialsList.map((t) => (t.id === testi.id ? { ...t, stars: val } : t)));
                          }}
                        />
                      </div>
                    </div>

                    {/* ── Avatar Controls ── */}
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '12px',
                        borderRadius: '6px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-faint)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Profile Avatar
                      </div>

                      {/* Live avatar preview */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                        <div
                          style={{
                            width: '52px',
                            height: '52px',
                            borderRadius: '50%',
                            background: testi.avatarBg || '#6366f1',
                            overflow: 'hidden',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '2px solid var(--border)',
                          }}
                        >
                          {testi.avatarUrl ? (
                            <img
                              src={testi.avatarUrl}
                              alt={testi.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <span style={{ color: testi.avatarColor || '#fff', fontWeight: 700, fontSize: '18px' }}>
                              {testi.avatarIcon || (testi.name ? testi.name.charAt(0).toUpperCase() : '?')}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--ink-faint)' }}>
                          Live preview — image takes priority over initials
                        </span>
                      </div>

                      <div className="row" style={{ gap: '12px' }}>
                        <div className="field" style={{ flex: 2 }}>
                          <label>Avatar Image URL</label>
                          <input
                            type="url"
                            placeholder="https://example.com/photo.jpg"
                            value={testi.avatarUrl || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTestimonialsList(testimonialsList.map((t) => (t.id === testi.id ? { ...t, avatarUrl: val } : t)));
                            }}
                          />
                        </div>
                        <div className="field" style={{ flex: '0 0 110px' }}>
                          <label>Background Color</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="color"
                              value={testi.avatarBg || '#6366f1'}
                              style={{ width: '38px', height: '34px', padding: '2px', borderRadius: '4px', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTestimonialsList(testimonialsList.map((t) => (t.id === testi.id ? { ...t, avatarBg: val } : t)));
                              }}
                            />
                            <input
                              type="text"
                              value={testi.avatarBg || '#6366f1'}
                              style={{ fontSize: '12px' }}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTestimonialsList(testimonialsList.map((t) => (t.id === testi.id ? { ...t, avatarBg: val } : t)));
                              }}
                            />
                          </div>
                        </div>
                        <div className="field" style={{ flex: '0 0 90px' }}>
                          <label>Initials / Icon</label>
                          <input
                            type="text"
                            maxLength={2}
                            placeholder="e.g. AJ"
                            value={testi.avatarIcon || ''}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase();
                              setTestimonialsList(testimonialsList.map((t) => (t.id === testi.id ? { ...t, avatarIcon: val } : t)));
                            }}
                          />
                        </div>
                        <div className="field" style={{ flex: '0 0 100px' }}>
                          <label>Text Color</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="color"
                              value={testi.avatarColor || '#ffffff'}
                              style={{ width: '38px', height: '34px', padding: '2px', borderRadius: '4px', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTestimonialsList(testimonialsList.map((t) => (t.id === testi.id ? { ...t, avatarColor: val } : t)));
                              }}
                            />
                            <input
                              type="text"
                              value={testi.avatarColor || '#ffffff'}
                              style={{ fontSize: '12px' }}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTestimonialsList(testimonialsList.map((t) => (t.id === testi.id ? { ...t, avatarColor: val } : t)));
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: FAQ */}
      {activeTab === 'faq' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>FAQ header copy</h3>
            </div>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label>Section Kicker</label>
                  <input
                    type="text"
                    value={faqKicker}
                    onChange={(e) => setFaqKicker(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>Section Title</label>
                  <input
                    type="text"
                    value={faqTitle}
                    onChange={(e) => setFaqTitle(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label>Section Subtitle</label>
                <textarea
                  rows={2}
                  value={faqSubtitle}
                  onChange={(e) => setFaqSubtitle(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>FAQ questions & answers ({faqList.length})</h3>
              <button
                type="button"
                className="btn brass small"
                onClick={() => {
                  const newFaq: LandingFaqItem = {
                    id: 'faq-' + Date.now(),
                    question: 'New Frequently Asked Question',
                    answer: 'Detailed response outlining feature functionality and policy.',
                  };
                  setFaqList([...faqList, newFaq]);
                }}
              >
                + Add FAQ Item
              </button>
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {faqList.map((faq, idx) => (
                  <div
                    key={faq.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '16px',
                      background: 'var(--surface-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--ink)' }}>
                        FAQ #{idx + 1}
                      </span>
                      <button
                        type="button"
                        className="btn secondary small"
                        style={{ color: '#EF4444' }}
                        onClick={() => setFaqList(faqList.filter((f) => f.id !== faq.id))}
                      >
                        Delete FAQ
                      </button>
                    </div>
                    <div className="field">
                      <label>Question</label>
                      <input
                        type="text"
                        value={faq.question}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFaqList(faqList.map((f) => (f.id === faq.id ? { ...f, question: val } : f)));
                        }}
                      />
                    </div>
                    <div className="field" style={{ marginTop: '8px' }}>
                      <label>Answer</label>
                      <textarea
                        rows={3}
                        value={faq.answer}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFaqList(faqList.map((f) => (f.id === faq.id ? { ...f, answer: val } : f)));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: CTA Banner & Footer */}
      {activeTab === 'ctaFooter' && (
        <div style={{ marginTop: '16px' }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Bottom call to action banner</h3>
            </div>
            <div className="panel-body">
              <div className="field">
                <label>Banner Headline</label>
                <input
                  type="text"
                  value={ctaBannerTitle}
                  onChange={(e) => setCtaBannerTitle(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Banner Subtitle</label>
                <textarea
                  rows={2}
                  value={ctaBannerSubtitle}
                  onChange={(e) => setCtaBannerSubtitle(e.target.value)}
                />
              </div>
              <div className="row">
                <div className="field">
                  <label>Primary Button Text</label>
                  <input
                    type="text"
                    value={ctaBannerPrimaryText}
                    onChange={(e) => setCtaBannerPrimaryText(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Primary Button Link Target</label>
                  <input
                    type="text"
                    value={ctaBannerPrimaryLink}
                    onChange={(e) => setCtaBannerPrimaryLink(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Secondary Button Text</label>
                  <input
                    type="text"
                    value={ctaBannerSecondaryText}
                    onChange={(e) => setCtaBannerSecondaryText(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Secondary Button Link Target</label>
                  <input
                    type="text"
                    value={ctaBannerSecondaryLink}
                    onChange={(e) => setCtaBannerSecondaryLink(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <h3>Footer & corporate identity</h3>
            </div>
            <div className="panel-body">
              <div className="field">
                <label>Platform Description in Footer</label>
                <textarea
                  rows={2}
                  value={footerBrandDescription}
                  onChange={(e) => setFooterBrandDescription(e.target.value)}
                />
              </div>
              <div className="row">
                <div className="field">
                  <label>Corporate Legal Entity / Owner Name</label>
                  <input
                    type="text"
                    value={footerCompanyName}
                    onChange={(e) => setFooterCompanyName(e.target.value)}
                    placeholder="NEBZA Technologies Private Limited"
                  />
                </div>
                <div className="field">
                  <label>Contact Email</label>
                  <input
                    type="text"
                    value={footerEmail}
                    onChange={(e) => setFooterEmail(e.target.value)}
                    placeholder="admin@propithub.com"
                  />
                </div>
                <div className="field">
                  <label>Contact Phone</label>
                  <input
                    type="text"
                    value={footerPhone}
                    onChange={(e) => setFooterPhone(e.target.value)}
                    placeholder="+1 (555) 010-0001"
                  />
                </div>
              </div>
              <div className="field" style={{ marginTop: '8px' }}>
                <label>Copyright Notice</label>
                <input
                  type="text"
                  value={footerCopyright}
                  onChange={(e) => setFooterCopyright(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: Vacant Listings Moderation */}
      {activeTab === 'listings' && (
        <div style={{ marginTop: '16px' }}>
          <div className="section-title">Available listings moderation</div>
          <div className="panel">
            <div className="panel-body">
              <p className="hint" style={{ marginBottom: '16px' }}>
                Vacant units listed across owner accounts are visible to the public. As superadmin, you have full authority to audit, delist, or restore any unit from the landing page.
              </p>
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Property</th>
                        <th>Country</th>
                        <th>Rent</th>
                        <th>Status</th>
                        <th>Moderation</th>
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
                            <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {((u.images && u.images[0]) || u.image) ? (
                                <img
                                  src={(u.images && u.images[0]) || u.image}
                                  alt={`Unit ${u.unitNumber}`}
                                  style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--border)' }}
                                />
                              ) : null}
                              <b>{u.unitNumber || u.id}</b>
                            </td>
                            <td>{u.propertyName || 'Property'}</td>
                            <td><span className="badge grey">{u.country || 'India'}</span></td>
                            <td style={{ fontWeight: 600 }}>{getCurrencySymbol(u.currency)}{u.rent?.toLocaleString(getLocaleForCurrency(u.currency))}/mo</td>
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
                                {u.isListedPublicly ? 'Delist' : 'List Publicly'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Card View */}
              <div className="mobile-card-view">
                {state.units.length === 0 ? (
                  <div style={{ color: 'var(--ink-soft)', padding: '16px 10px', textAlign: 'center' }}>
                    No units created yet in any owner account.
                  </div>
                ) : (
                  state.units.map((u) => (
                    <div key={u.id} className="staff-card" style={{ padding: '14px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        {((u.images && u.images[0]) || u.image) ? (
                          <img
                            src={(u.images && u.images[0]) || u.image}
                            alt={`Unit ${u.unitNumber}`}
                            style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border)' }}
                          />
                        ) : null}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
                            Unit {u.unitNumber || u.id}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                            {u.propertyName || 'Property'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span className="badge grey">{u.country || 'India'}</span>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
                          {getCurrencySymbol(u.currency)}{u.rent?.toLocaleString(getLocaleForCurrency(u.currency))}/mo
                        </span>
                        <span className={`badge ${u.isListedPublicly ? 'green' : 'grey'}`}>
                          {u.isListedPublicly ? 'Publicly Listed' : 'Unlisted'}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="btn secondary small btn-mobile-full"
                        onClick={() => handleToggleUnitListing(u.id, !!u.isListedPublicly, u.unitNumber || u.id)}
                      >
                        {u.isListedPublicly ? 'Delist from Landing Page' : 'List Publicly on Landing Page'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. Legal Policies & Support Pages CMS Tab */}
      {activeTab === 'legal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Sub-Tabs: Terms / Privacy / Refund / Contact */}
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
                  style={{ padding: '6px 14px' }}
                >
                  {sub.label}
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  title={`Open ${sub.path} in new window`}
                  onClick={() => window.open(sub.path, '_blank')}
                  style={{ padding: '6px 8px' }}
                >
                  <ExternalLink size={12} />
                </button>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn brass small"
                onClick={handleSaveAll}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                ✓ Save All Policy Changes
              </button>
            </div>
          </div>

          {/* Terms of Use Editor */}
          {legalSubTab === 'terms' && (
            <div className="panel">
              <div className="panel-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Edit Terms of Use Content</h3>
                    <span className="hint" style={{ fontSize: '12.5px' }}>Live at /terms — governs user covenants, liabilities, and lease record keeping.</span>
                  </div>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      const newId = `terms-${Date.now()}`;
                      setLegalTerms((prev) => ({
                        ...prev,
                        sections: [...prev.sections, { id: newId, title: `${prev.sections.length + 1}. New Clause Title`, content: 'Enter clause text details here...' }],
                      }));
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={14} /> Add Clause Section
                  </button>
                </div>

                <div className="row" style={{ marginBottom: '14px' }}>
                  <div className="field">
                    <label>Page Title</label>
                    <input
                      type="text"
                      value={legalTerms.title}
                      onChange={(e) => setLegalTerms({ ...legalTerms, title: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Last Updated Notice</label>
                    <input
                      type="text"
                      value={legalTerms.lastUpdated}
                      onChange={(e) => setLegalTerms({ ...legalTerms, lastUpdated: e.target.value })}
                    />
                  </div>
                </div>

                <div className="field" style={{ marginBottom: '20px' }}>
                  <label>Subtitle Brief</label>
                  <textarea
                    rows={2}
                    value={legalTerms.subtitle}
                    onChange={(e) => setLegalTerms({ ...legalTerms, subtitle: e.target.value })}
                  />
                </div>

                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>Sections & Policy Clauses ({legalTerms.sections.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {legalTerms.sections.map((sec, idx) => (
                    <div key={sec.id || idx} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', background: 'var(--surface-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <input
                          type="text"
                          value={sec.title}
                          onChange={(e) => {
                            const updated = [...legalTerms.sections];
                            updated[idx].title = e.target.value;
                            setLegalTerms({ ...legalTerms, sections: updated });
                          }}
                          style={{ fontWeight: 600, fontSize: '14px', width: '80%' }}
                        />
                        <button
                          type="button"
                          className="btn danger small"
                          onClick={() => {
                            const updated = legalTerms.sections.filter((_, i) => i !== idx);
                            setLegalTerms({ ...legalTerms, sections: updated });
                          }}
                          style={{ padding: '4px 8px' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={sec.content}
                        onChange={(e) => {
                          const updated = [...legalTerms.sections];
                          updated[idx].content = e.target.value;
                          setLegalTerms({ ...legalTerms, sections: updated });
                        }}
                        style={{ width: '100%', fontSize: '13px', lineHeight: 1.6 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Privacy Policy Editor */}
          {legalSubTab === 'privacy' && (
            <div className="panel">
              <div className="panel-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Edit Privacy Policy Content</h3>
                    <span className="hint" style={{ fontSize: '12.5px' }}>Live at /privacy — explains KYC document encryption, data handling, and resident privacy rights.</span>
                  </div>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      const newId = `priv-${Date.now()}`;
                      setLegalPrivacy((prev) => ({
                        ...prev,
                        sections: [...prev.sections, { id: newId, title: `${prev.sections.length + 1}. New Policy Clause`, content: 'Enter policy details here...' }],
                      }));
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={14} /> Add Privacy Clause
                  </button>
                </div>

                <div className="row" style={{ marginBottom: '14px' }}>
                  <div className="field">
                    <label>Page Title</label>
                    <input
                      type="text"
                      value={legalPrivacy.title}
                      onChange={(e) => setLegalPrivacy({ ...legalPrivacy, title: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Last Updated Notice</label>
                    <input
                      type="text"
                      value={legalPrivacy.lastUpdated}
                      onChange={(e) => setLegalPrivacy({ ...legalPrivacy, lastUpdated: e.target.value })}
                    />
                  </div>
                </div>

                <div className="field" style={{ marginBottom: '20px' }}>
                  <label>Subtitle Brief</label>
                  <textarea
                    rows={2}
                    value={legalPrivacy.subtitle}
                    onChange={(e) => setLegalPrivacy({ ...legalPrivacy, subtitle: e.target.value })}
                  />
                </div>

                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>Sections & Privacy Clauses ({legalPrivacy.sections.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {legalPrivacy.sections.map((sec, idx) => (
                    <div key={sec.id || idx} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', background: 'var(--surface-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <input
                          type="text"
                          value={sec.title}
                          onChange={(e) => {
                            const updated = [...legalPrivacy.sections];
                            updated[idx].title = e.target.value;
                            setLegalPrivacy({ ...legalPrivacy, sections: updated });
                          }}
                          style={{ fontWeight: 600, fontSize: '14px', width: '80%' }}
                        />
                        <button
                          type="button"
                          className="btn danger small"
                          onClick={() => {
                            const updated = legalPrivacy.sections.filter((_, i) => i !== idx);
                            setLegalPrivacy({ ...legalPrivacy, sections: updated });
                          }}
                          style={{ padding: '4px 8px' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={sec.content}
                        onChange={(e) => {
                          const updated = [...legalPrivacy.sections];
                          updated[idx].content = e.target.value;
                          setLegalPrivacy({ ...legalPrivacy, sections: updated });
                        }}
                        style={{ width: '100%', fontSize: '13px', lineHeight: 1.6 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Refund Policy Editor */}
          {legalSubTab === 'refund' && (
            <div className="panel">
              <div className="panel-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Edit Refund Policy Content</h3>
                    <span className="hint" style={{ fontSize: '12.5px' }}>Live at /refund — specifies SaaS cancellation terms and tenant deposit refund rules.</span>
                  </div>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      const newId = `ref-${Date.now()}`;
                      setLegalRefund((prev) => ({
                        ...prev,
                        sections: [...prev.sections, { id: newId, title: `${prev.sections.length + 1}. New Refund Clause`, content: 'Enter clause details here...' }],
                      }));
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={14} /> Add Refund Clause
                  </button>
                </div>

                <div className="row" style={{ marginBottom: '14px' }}>
                  <div className="field">
                    <label>Page Title</label>
                    <input
                      type="text"
                      value={legalRefund.title}
                      onChange={(e) => setLegalRefund({ ...legalRefund, title: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Last Updated Notice</label>
                    <input
                      type="text"
                      value={legalRefund.lastUpdated}
                      onChange={(e) => setLegalRefund({ ...legalRefund, lastUpdated: e.target.value })}
                    />
                  </div>
                </div>

                <div className="field" style={{ marginBottom: '20px' }}>
                  <label>Subtitle Brief</label>
                  <textarea
                    rows={2}
                    value={legalRefund.subtitle}
                    onChange={(e) => setLegalRefund({ ...legalRefund, subtitle: e.target.value })}
                  />
                </div>

                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>Sections & Refund Clauses ({legalRefund.sections.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {legalRefund.sections.map((sec, idx) => (
                    <div key={sec.id || idx} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', background: 'var(--surface-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <input
                          type="text"
                          value={sec.title}
                          onChange={(e) => {
                            const updated = [...legalRefund.sections];
                            updated[idx].title = e.target.value;
                            setLegalRefund({ ...legalRefund, sections: updated });
                          }}
                          style={{ fontWeight: 600, fontSize: '14px', width: '80%' }}
                        />
                        <button
                          type="button"
                          className="btn danger small"
                          onClick={() => {
                            const updated = legalRefund.sections.filter((_, i) => i !== idx);
                            setLegalRefund({ ...legalRefund, sections: updated });
                          }}
                          style={{ padding: '4px 8px' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={sec.content}
                        onChange={(e) => {
                          const updated = [...legalRefund.sections];
                          updated[idx].content = e.target.value;
                          setLegalRefund({ ...legalRefund, sections: updated });
                        }}
                        style={{ width: '100%', fontSize: '13px', lineHeight: 1.6 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Contact Support Editor */}
          {legalSubTab === 'contact' && (
            <div className="panel">
              <div className="panel-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Edit Contact Support Information</h3>
                    <span className="hint" style={{ fontSize: '12.5px' }}>Live at /contact — manages contact info cards, address, response SLA, and help FAQs.</span>
                  </div>
                  <button
                    type="button"
                    className="btn brass small"
                    onClick={() => {
                      setLegalContact((prev) => ({
                        ...prev,
                        faqs: [...(prev.faqs || []), { question: 'New Question?', answer: 'Answer details...' }],
                      }));
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={14} /> Add Support FAQ
                  </button>
                </div>

                <div className="row" style={{ marginBottom: '14px' }}>
                  <div className="field">
                    <label>Page Title</label>
                    <input
                      type="text"
                      value={legalContact.title}
                      onChange={(e) => setLegalContact({ ...legalContact, title: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Support Email Address</label>
                    <input
                      type="email"
                      value={legalContact.email}
                      onChange={(e) => setLegalContact({ ...legalContact, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="row" style={{ marginBottom: '14px' }}>
                  <div className="field">
                    <label>Helpline Telephone</label>
                    <input
                      type="text"
                      value={legalContact.phone}
                      onChange={(e) => setLegalContact({ ...legalContact, phone: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Business / Operating Hours</label>
                    <input
                      type="text"
                      value={legalContact.businessHours}
                      onChange={(e) => setLegalContact({ ...legalContact, businessHours: e.target.value })}
                    />
                  </div>
                </div>

                <div className="field" style={{ marginBottom: '14px' }}>
                  <label>Corporate Headquarters Address</label>
                  <input
                    type="text"
                    value={legalContact.address}
                    onChange={(e) => setLegalContact({ ...legalContact, address: e.target.value })}
                  />
                </div>

                <div className="field" style={{ marginBottom: '14px' }}>
                  <label>Response Time SLA Notice</label>
                  <input
                    type="text"
                    value={legalContact.responseTimeNotice}
                    onChange={(e) => setLegalContact({ ...legalContact, responseTimeNotice: e.target.value })}
                  />
                </div>

                <div className="field" style={{ marginBottom: '20px' }}>
                  <label>Subtitle / Intro</label>
                  <textarea
                    rows={2}
                    value={legalContact.subtitle}
                    onChange={(e) => setLegalContact({ ...legalContact, subtitle: e.target.value })}
                  />
                </div>

                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px' }}>Support FAQs ({legalContact.faqs?.length || 0})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {(legalContact.faqs || []).map((faq, idx) => (
                    <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', background: 'var(--surface-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <input
                          type="text"
                          value={faq.question}
                          placeholder="Question..."
                          onChange={(e) => {
                            const updated = [...(legalContact.faqs || [])];
                            updated[idx].question = e.target.value;
                            setLegalContact({ ...legalContact, faqs: updated });
                          }}
                          style={{ fontWeight: 600, fontSize: '13.5px', width: '85%' }}
                        />
                        <button
                          type="button"
                          className="btn danger small"
                          onClick={() => {
                            const updated = (legalContact.faqs || []).filter((_, i) => i !== idx);
                            setLegalContact({ ...legalContact, faqs: updated });
                          }}
                          style={{ padding: '4px 8px' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={faq.answer}
                        placeholder="Answer..."
                        onChange={(e) => {
                          const updated = [...(legalContact.faqs || [])];
                          updated[idx].answer = e.target.value;
                          setLegalContact({ ...legalContact, faqs: updated });
                        }}
                        style={{ width: '100%', fontSize: '13px' }}
                      />
                    </div>
                  ))}
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
          All modifications save to local system storage and take effect immediately across public visitors.
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
