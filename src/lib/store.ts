import {
  UserProfile,
  Plan,
  OwnerSettings,
  Property,
  Unit,
  TenantRecord,
  Agreement,
  PaymentTransaction,
  Invoice,
  StaffMember,
  PropertyManager,
  Ticket,
  MoveOut,
  Dispute,
  ReviewItem,
  InAppNotification,
  AuditLogItem,
  PlatformSupportTicket,
  LandingConfig,
  PlatformGateways,
  CommsConfig,
  UserRole,
  RenewalItem,
  StaffScheduleItem,
  ManagerPayoutRecord,
  TenancyRequest,
  PlatformInvoice,
  PlatformInvoiceTemplateConfig,
  TenantPayoutProfile,
  DepositSettlement,
  CashHandoverClaim,
  CommunicationLog,
  Announcement,
  AgreementTemplate,
} from '../types';
import { isFirebaseConfigured } from './firebase';
import { sanitizeCountry } from './addressUtils';

const STORAGE_KEY = 'propithubhave_production_store_v2';

export interface AppState {
  currentRole: UserRole;
  currentUserId: string;
  users: UserProfile[];
  plans: Plan[];
  ownerSettings: Record<string, OwnerSettings>;
  properties: Property[];
  units: Unit[];
  tenants: TenantRecord[];
  tenancyRequests?: TenancyRequest[];
  agreements: Agreement[];
  agreementTemplates?: AgreementTemplate[];
  payments: PaymentTransaction[];
  invoices: Invoice[];
  platformInvoices: PlatformInvoice[];
  staff: StaffMember[];
  managers: PropertyManager[];
  managerPayouts: ManagerPayoutRecord[];
  tickets: Ticket[];
  moveouts: MoveOut[];
  disputes: Dispute[];
  reviews: { owners: any[]; tenants: any[] };
  renewals: RenewalItem[];
  staffSchedules: StaffScheduleItem[];
  notifications: InAppNotification[];
  auditLog: AuditLogItem[];
  platformSupport: PlatformSupportTicket[];
  landingConfig: LandingConfig;
  platformGateways: PlatformGateways;
  commsConfig: CommsConfig;
  notificationToggles: Record<string, boolean>;
  ownerPlan: string;
  ownerPaymentMethods: any;
  lateFeeSettings: { enabled: boolean; graceDays: number; type: 'percent' | 'flat'; value: number; cap: number };
  taxSettings: { label: string; percent: number };
  propertyManagers: any[];
  activeBillingGateway: string;
  amenityChecklist: string[];
  defaultTrialDays: number;
  annualDiscountPercent: number;
  platformInvoiceTemplate?: PlatformInvoiceTemplateConfig;
  payoutProfiles: TenantPayoutProfile[];
  depositSettlements: DepositSettlement[];
  cashClaims: CashHandoverClaim[];
  communicationLogs: CommunicationLog[];
  announcements: Announcement[];
}

export const INITIAL_STATE: AppState = {
  currentRole: 'owner',
  currentUserId: '',
  defaultTrialDays: 14,
  annualDiscountPercent: 20,

  users: [],

  plans: [
    {
      id: 'starter',
      name: 'Starter',
      price: 29,
      properties: 1,
      units: 5,
      tenants: 5,
      managers: 0,
      staff: 1,
      owners: 0,
      isPopular: false,
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
      owners: 0,
      isPopular: true,
    },
    {
      id: 'free_trial',
      name: 'Free Trial',
      price: 0,
      properties: 1,
      units: 3,
      tenants: 3,
      managers: 0,
      staff: 1,
      owners: 0,
      isTrialOnly: true,
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
      owners: 0,
    },
  ],

  ownerSettings: {},
  properties: [],
  units: [],
  tenants: [],
  tenancyRequests: [],
  agreements: [],
  payments: [],
  invoices: [],
  platformInvoices: [],
  staff: [],
  managers: [],
  managerPayouts: [],
  tickets: [],
  moveouts: [],
  disputes: [],
  reviews: { owners: [], tenants: [] },
  renewals: [],
  staffSchedules: [],
  notifications: [],
  auditLog: [],
  platformSupport: [],
  announcements: [
    {
      id: 'ann-1',
      ownerId: 'owner',
      authorName: 'Management Office',
      title: 'Scheduled Water Tank Cleaning & Pressure Maintenance',
      body: 'Please be advised that annual domestic water tank cleaning and overhead pump servicing will occur this Thursday between 10:00 AM and 2:00 PM. Water supply may experience low pressure or brief interruptions during this period.',
      category: 'maintenance',
      priority: 'important',
      status: 'published',
      targetScope: {
        allProperties: true,
        propertyIds: [],
        targetRoles: ['tenant'],
      },
      isPinned: true,
      requireAcknowledgment: true,
      acknowledgments: [
        {
          tenantId: 'demo-tenant-1',
          tenantName: 'Sarah Jenkins',
          unitNumber: '102',
          propertyName: 'Sunset Heights',
          acknowledgedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        }
      ],
      publishedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
      viewsCount: 18,
      createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    },
    {
      id: 'ann-2',
      ownerId: 'owner',
      authorName: 'Property Admin',
      title: 'Updated Building Waste Segregation & Recycling Guidelines',
      body: 'In accordance with municipal environmental policies, all residents are requested to segregate dry recyclables and organic wet waste into designated color-coded bins located in the basement disposal room.',
      category: 'policy',
      priority: 'normal',
      status: 'published',
      targetScope: {
        allProperties: true,
        propertyIds: [],
        targetRoles: ['tenant', 'staff'],
      },
      isPinned: false,
      requireAcknowledgment: false,
      acknowledgments: [],
      publishedAt: new Date(Date.now() - 3600000 * 72).toISOString(),
      viewsCount: 29,
      createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 72).toISOString(),
    }
  ],

  landingConfig: {
    brandName: 'propit',
    brandAccent: 'hub',
    faviconUrl: '/favicon.svg',
    browserTitle: 'Propithub — Property Operations Platform',
    brandTagline: 'Multi-Country Rental Operations',
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
        description: "Add buildings, units, and rent amounts — or import them from the spreadsheet you're already keeping.",
      },
      {
        id: 's-2',
        stepNumber: '02',
        title: 'Invite everyone in',
        description: 'Tenants get a portal to pay rent and file repairs. Maintainers get a queue of the work assigned to them.',
      },
      {
        id: 's-3',
        stepNumber: '03',
        title: 'Let the ledger run itself',
        description: "Invoices go out on schedule, payments reconcile on their own, and lease renewals show up before they're due.",
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
    listingsKicker: 'Vacant Units',
    listingsTitle: 'Available Listings',
    listingsSubtitle: 'Direct verified rentals from property owners across Propithub',
    testimonialsKicker: 'From the ledger’s users',
    testimonialsTitle: 'Owners, managers, and tenants on propithub',
    testimonialsSubtitle:
      'Everything an owner, a tenant, and a maintainer each need to do — reading from the same set of records.',
    testimonialsList: [
      {
        id: 't-1',
        quote: "“I used to chase four tenants across three group chats. Now I open one screen and know exactly who's paid.”",
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
        quote: "“Work orders used to live in my head. Now a maintainer sees the ticket the second a tenant files it.”",
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
        quote: "“Paying rent takes me ninety seconds, and I finally have a place to put in a repair request with photos.”",
        name: 'Priya Nandakumar',
        role: 'tenant',
        stars: 5,
        avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80',
        avatarBg: '#7C3AED',
        avatarColor: '#FFFFFF',
        avatarIcon: 'P',
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
    footerCopyright: '© 2026 Propithub. Owned and Developed by NEBZA Technologies Private Limited. All Rights Reserved.',
    legalPages: {
      terms: {
        title: 'Terms of Use',
        subtitle: 'Please review the terms and covenants governing your use of Propithub cloud property management software and resident services.',
        lastUpdated: 'September 18, 2026',
        sections: [
          {
            id: 'terms-1',
            title: '1. Platform Acceptance & Relationship',
            content: 'By accessing or utilizing Propithub (the "Platform"), owned and operated by NEBZA Technologies Private Limited, you agree to comply with and be bound by these Terms of Use. Propithub operates strictly as a cloud-based software management system connecting property owners, managers, residents, and service providers. Propithub is not a real estate broker, landlord, or banking institution.'
          },
          {
            id: 'terms-2',
            title: '2. Tenancy Agreements & Legal Covenants',
            content: 'Lease agreements, terms of tenancy, security deposits, and maintenance obligations drafted, dispatched, or uploaded through the Platform constitute direct legal agreements solely between the respective Property Owner and Tenant. Propithub provides execution facilitation and digital record keeping but is not a contractual party to the underlying tenancy covenants.'
          },
          {
            id: 'terms-3',
            title: '3. Rent Collection & Gateway Disclaimers',
            content: 'Payment transactions (including recurring rent, security deposits, and utility invoices) are processed via third-party certified gateways (e.g., Razorpay, Stripe, PayPal, UPI, or direct bank transfer). Users acknowledge that gateway clearance, transaction fees, and banking settlement timelines are governed by respective financial processors and banking institutions.'
          },
          {
            id: 'terms-4',
            title: '4. Security Deposits & Trust Terms',
            content: 'Refundable security deposits are collected and held pursuant to the specific terms of the active tenancy agreement. Move-out refunds, deductions for physical damages, and inspection settlements are determined directly between the property owner and resident in accordance with local rental tenancy legislation.'
          },
          {
            id: 'terms-5',
            title: '5. Account Security & Verification',
            content: 'Users are responsible for maintaining the confidentiality of their credentials and two-factor authentication tokens. Any unauthorized activity under an account must be reported immediately to security@propithub.com.'
          },
          {
            id: 'terms-6',
            title: '6. Limitation of Liability',
            content: 'To the maximum extent permitted by applicable law, NEBZA Technologies Private Limited and its affiliates shall not be liable for any indirect, incidental, punitive, or consequential damages resulting from property disputes, payment delays, or user breach of tenancy terms.'
          }
        ]
      },
      privacy: {
        title: 'Privacy Policy',
        subtitle: 'How Propithub and NEBZA Technologies collect, encrypt, safeguard, and process your personal and tenancy information.',
        lastUpdated: 'September 18, 2026',
        sections: [
          {
            id: 'priv-1',
            title: '1. Information We Collect',
            content: 'We collect information necessary to operate property management operations effectively, including: (a) Contact details (full name, verified email, telephone number); (b) Property and unit details; (c) KYC and identification verification records; (d) Financial transaction metadata and payment confirmations (Propithub does not store raw credit card numbers or banking passwords).'
          },
          {
            id: 'priv-2',
            title: '2. Document Storage & Military-Grade Encryption',
            content: 'Executed lease agreements, inspection photographs, and government ID scans are transmitted over TLS 1.3 encrypted connections and stored securely using AES-256 cloud encryption with role-based access permissions.'
          },
          {
            id: 'priv-3',
            title: '3. Data Sharing & Third-Party Processors',
            content: 'We do not sell personal data to advertisers. Information is disclosed strictly to authorized parties: (a) Between a property owner and their assigned tenants; (b) Certified payment gateways for processing rent settlements; (c) Legal authorities when mandated by statutory compliance.'
          },
          {
            id: 'priv-4',
            title: '4. Resident Rights & Data Portability',
            content: 'Residents and property owners have the right to inspect their complete transaction ledger, export PDF copies of agreements, and request profile anonymization upon lease termination subject to legal record-retention requirements.'
          }
        ]
      },
      refund: {
        title: 'Refund Policy',
        subtitle: 'Clear, transparent rules regarding platform subscription cancellations, rent reversals, and security deposit returns.',
        lastUpdated: 'September 18, 2026',
        sections: [
          {
            id: 'ref-1',
            title: '1. Software Subscription Refunds (Owners)',
            content: 'Propithub offers a 14-day free trial on all owner subscription plans. Owners may cancel their subscription at any time from the Plan settings. Monthly subscription fees billed in advance are non-refundable for partial billing cycles, but platform access continues until the end of the current paid billing period.'
          },
          {
            id: 'ref-2',
            title: '2. Rent Payment Reversals & Errors',
            content: 'If an duplicate rent payment is made due to network interruption or banking gateway error, the duplicate transaction will be refunded to the original payment source within 5 to 7 business days following reconciliation.'
          },
          {
            id: 'ref-3',
            title: '3. Security Deposit Move-Out Settlement',
            content: 'Tenant security deposit refunds are processed at the conclusion of tenancy following the joint physical move-out inspection. The property owner itemizes any legitimate deductions (repairs, unpaid utilities) and remits the net balance via direct bank transfer or gateway refund.'
          },
          {
            id: 'ref-4',
            title: '4. Billing Inquiries & Payment Reconciliation',
            content: 'Before initiating any payment dispute or bank chargeback, tenants and owners agree to contact property management directly to review receipts, lease terms, and transaction audit logs.'
          }
        ]
      },
      contact: {
        title: 'Contact Support & Help Desk',
        subtitle: 'Our dedicated customer success and engineering team is available to assist property owners, tenants, and enterprise managers.',
        email: 'support@propithub.com',
        phone: '+91 (800) 555-0199',
        address: 'Tower B, 4th Floor, Financial District, Gachibowli, Hyderabad, Telangana 500032, India',
        businessHours: 'Monday – Saturday: 9:00 AM – 7:00 PM IST',
        responseTimeNotice: 'Average response turnaround within 2 hours for urgent priority tickets; next business day for general inquiries.',
        faqs: [
          {
            question: 'How do I submit an urgent maintenance issue?',
            answer: 'Log in to your Tenant Portal, go to Maintenance Desk, and click "New Ticket" to attach photos and request emergency dispatch.'
          },
          {
            question: 'How do owners configure payment gateway API keys?',
            answer: 'Navigate to Owner Portal -> Payments -> Payment Gateways to enter your Razorpay, Stripe, or UPI credentials.'
          },
          {
            question: 'Can I speak with an enterprise account specialist?',
            answer: 'Yes, email enterprise@propithub.com or reach out via our direct telephone helpline.'
          }
        ]
      }
    },
  },

  platformGateways: {
    stripe: { enabled: true, connected: false, pubKey: '', secretKey: '', mode: 'live' },
    razorpay: { enabled: true, connected: false, keyId: '', keySecret: '', mode: 'live' },
    paypal: { enabled: true, connected: false, clientId: '', secret: '', mode: 'live' },
    easebuzz: { enabled: true, connected: false, merchantKey: '', salt: '', subMerchantId: '', mode: 'live' },
    mock: { enabled: true, connected: true },
  },

  commsConfig: {
    twilioSid: '',
    twilioAuthToken: '',
    twilioConnected: false,
    twilioNumber: '',
    sendgridKey: '',
    sendgridConnected: false,
    sendgridFrom: 'notifications@propithub.app',
  },

  notificationToggles: {
    'Rent due reminder': true,
    'Payment received': true,
    'Late fee applied': true,
    'Ticket status change': true,
    'Lease expiry warning': true,
    'Dispute update': true,
  },

  ownerPlan: 'Growth',

  ownerPaymentMethods: {
    cash: { enabled: true },
    upi: { enabled: true, upiId: '', qrImage: null },
    bank: { enabled: true, accountName: '', accountNumber: '', country: 'India', routing: '' },
    paypal: { enabled: false, email: '' },
    razorpay: { enabled: false, keyId: '', keySecret: '' },
    stripe: { enabled: false, pubKey: '', secretKey: '' },
    easebuzz: { enabled: false, merchantKey: '', salt: '', subMerchantId: '', mode: 'live' },
  },

  lateFeeSettings: {
    enabled: true,
    graceDays: 5,
    type: 'percent',
    value: 2,
    cap: 1000,
  },

  taxSettings: {
    label: 'GST / Service Tax',
    percent: 0,
  },

  propertyManagers: [],
  activeBillingGateway: 'razorpay',

  amenityChecklist: [
    'Walls & paint condition',
    'Electrical fixtures',
    'Plumbing / taps',
    'Kitchen & cabinets',
    'Bathroom sanitation',
    'Floor & tiling',
  ],
  platformInvoiceTemplate: {
    issuerName: 'Propithub Technologies Inc.',
    issuerTaxNo: 'US-EIN 84-2910391 / VAT-EU982148',
    issuerAddress: '500 Howard Street, Suite 400, San Francisco, CA 94105, USA',
    issuerPhone: '+1 (800) 555-PROP',
    issuerEmail: 'billing@propithub.com',
    taxLabel: 'Sales Tax / VAT',
    taxPercent: 0,
    termsAndConditions: `1. All SaaS subscription and licensing fees are billed in advance according to the selected tier.
2. Invoices are payable within 14 calendar days from the date of issuance.
3. Overdue platform balances may result in temporary restriction of multi-unit management services.
4. All tax charges are assessed based on the customer's registered business jurisdiction.
5. Inquiries regarding platform invoices must be submitted to billing@propithub.com within 5 business days.`,
    signatoryName: 'Elena Rostova',
    signatoryRole: 'Chief Financial Officer & Corporate Controller',
    notes: 'Thank you for partnering with Propithub for your real estate operations.',
    bankName: 'Silicon Valley Bank / First Republic',
    accountName: 'Propithub Technologies Inc - Corporate Treasury',
    accountNumber: '987000124890',
    swiftCode: 'SVBKUS6SXXX',
  },
  payoutProfiles: [],
  depositSettlements: [],
  cashClaims: [],
  communicationLogs: [],
  agreementTemplates: [],
};

export const LANDING_CONFIG_CACHE_KEY = 'propithub_landing_config_v1';
export const TRIAL_POLICY_CACHE_KEY = 'propithub_trial_policy_v1';

export function saveTrialPolicyCache(days: number, discountPercent?: number): void {
  try {
    const raw = localStorage.getItem(TRIAL_POLICY_CACHE_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    const payload = {
      ...prev,
      defaultTrialDays: Math.max(0, days),
      annualDiscountPercent: typeof discountPercent === 'number'
        ? Math.min(90, Math.max(0, discountPercent))
        : (typeof prev.annualDiscountPercent === 'number' ? prev.annualDiscountPercent : 20),
    };
    localStorage.setItem(TRIAL_POLICY_CACHE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

export function saveAnnualDiscountCache(discountPercent: number): void {
  try {
    const raw = localStorage.getItem(TRIAL_POLICY_CACHE_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    const payload = {
      ...prev,
      defaultTrialDays: typeof prev.defaultTrialDays === 'number' ? prev.defaultTrialDays : 14,
      annualDiscountPercent: Math.min(90, Math.max(0, discountPercent)),
    };
    localStorage.setItem(TRIAL_POLICY_CACHE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

export function loadCachedTrialPolicy(): { defaultTrialDays?: number; annualDiscountPercent?: number } | null {
  try {
    const raw = localStorage.getItem(TRIAL_POLICY_CACHE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (_) {}
  return null;
}

export function loadCachedTrialDays(): number | null {
  const parsed = loadCachedTrialPolicy();
  if (typeof parsed?.defaultTrialDays === 'number') {
    return Math.max(0, parsed.defaultTrialDays);
  }
  return null;
}

export function loadCachedAnnualDiscount(): number | null {
  const parsed = loadCachedTrialPolicy();
  if (typeof parsed?.annualDiscountPercent === 'number') {
    return Math.min(90, Math.max(0, parsed.annualDiscountPercent));
  }
  return null;
}

export function saveLandingConfigCache(cfg: Partial<LandingConfig>): void {
  try {
    const raw = localStorage.getItem(LANDING_CONFIG_CACHE_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    const merged = {
      ...prev,
      ...cfg,
      legalPages: {
        ...(prev.legalPages || {}),
        ...(cfg.legalPages || {}),
      },
    };
    localStorage.setItem(LANDING_CONFIG_CACHE_KEY, JSON.stringify(merged));
  } catch (_) {}
}

export function loadState(): AppState {
  const cachedTrialDays = loadCachedTrialDays();
  const cachedAnnualDiscount = loadCachedAnnualDiscount();
  const effectiveTrialDays = cachedTrialDays !== null ? cachedTrialDays : INITIAL_STATE.defaultTrialDays;
  const effectiveAnnualDiscount = cachedAnnualDiscount !== null ? cachedAnnualDiscount : INITIAL_STATE.annualDiscountPercent;

  // Check for cached platform landing config
  let cachedLandingConfig = INITIAL_STATE.landingConfig;
  try {
    const rawLanding = localStorage.getItem(LANDING_CONFIG_CACHE_KEY);
    if (rawLanding) {
      const parsedLanding = JSON.parse(rawLanding);
      if (parsedLanding && typeof parsedLanding === 'object') {
        cachedLandingConfig = {
          ...INITIAL_STATE.landingConfig,
          ...parsedLanding,
          sections: {
            ...INITIAL_STATE.landingConfig.sections,
            ...(parsedLanding.sections || {}),
          },
          stats: {
            ...INITIAL_STATE.landingConfig.stats,
            ...(parsedLanding.stats || {}),
          },
          legalPages: {
            ...INITIAL_STATE.landingConfig.legalPages,
            ...(parsedLanding.legalPages || {}),
          },
        };
      }
    }
  } catch (_) {}

  if (isFirebaseConfigured) {
    // In live Firebase mode, Firestore and Firebase Auth are the single source of truth.
    // Purge obsolete mock database payloads to prevent stale data contamination, but preserve platform configs.
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('keystone_state_v1');
      localStorage.removeItem('keystone_active_user_id');
    } catch (_) {}
    return {
      ...INITIAL_STATE,
      defaultTrialDays: effectiveTrialDays,
      annualDiscountPercent: effectiveAnnualDiscount,
      landingConfig: cachedLandingConfig,
      users: [],
      properties: [],
      units: [],
      tenants: [],
      tenancyRequests: [],
      agreements: [],
      payments: [],
      invoices: [],
      tickets: [],
      moveouts: [],
      disputes: [],
      renewals: [],
      notifications: [],
      managerPayouts: [],
      payoutProfiles: [],
      depositSettlements: [],
      announcements: [],
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveState(INITIAL_STATE);
      return INITIAL_STATE;
    }
    const parsed = JSON.parse(raw);
    let userList: UserProfile[] = Array.isArray(parsed.users) ? parsed.users : INITIAL_STATE.users;
    userList = userList.map((u) => ({
      ...u,
      displayName: (u.displayName || '').replace(/PropitHubHave/gi, 'Propithub'),
    }));

    // Clean out any lingering dummy mock IDs
    userList = userList.filter((u) => u.id !== 'usr-admin-1' && u.id !== 'usr-owner-1' && u.id !== 'ZdhK3dD848N3kxcwsziXdhC8bVw1');

    let tenantList: TenantRecord[] = Array.isArray(parsed.tenants)
      ? parsed.tenants.filter((t: TenantRecord) => t.id !== 'ZdhK3dD848N3kxcwsziXdhC8bVw1')
      : [];

    const cleanedOwnerSettings = { ...(parsed.ownerSettings || {}) };
    delete cleanedOwnerSettings['usr-owner-1'];

    return {
      ...INITIAL_STATE,
      ...parsed,
      defaultTrialDays: cachedTrialDays !== null ? cachedTrialDays : (typeof parsed.defaultTrialDays === 'number' ? parsed.defaultTrialDays : INITIAL_STATE.defaultTrialDays),
      annualDiscountPercent: cachedAnnualDiscount !== null ? cachedAnnualDiscount : (typeof parsed.annualDiscountPercent === 'number' ? parsed.annualDiscountPercent : INITIAL_STATE.annualDiscountPercent),
      users: userList,
      tenants: tenantList,
      ownerSettings: cleanedOwnerSettings,
      landingConfig: {
        ...INITIAL_STATE.landingConfig,
        ...(parsed.landingConfig || {}),
        sections: {
          ...INITIAL_STATE.landingConfig.sections,
          ...(parsed.landingConfig?.sections || {}),
        },
        stats: {
          ...INITIAL_STATE.landingConfig.stats,
          ...(parsed.landingConfig?.stats || {}),
        },
        heroMockup: {
          ...INITIAL_STATE.landingConfig.heroMockup,
          ...(parsed.landingConfig?.heroMockup || {}),
        },
        announcement: {
          ...INITIAL_STATE.landingConfig.announcement,
          ...(parsed.landingConfig?.announcement || {}),
        },
        featuresList:
          Array.isArray(parsed.landingConfig?.featuresList) && parsed.landingConfig.featuresList.length > 0
            ? parsed.landingConfig.featuresList
            : INITIAL_STATE.landingConfig.featuresList,
        howItWorksSteps:
          Array.isArray(parsed.landingConfig?.howItWorksSteps) && parsed.landingConfig.howItWorksSteps.length > 0
            ? parsed.landingConfig.howItWorksSteps
            : INITIAL_STATE.landingConfig.howItWorksSteps,
        pricingPlans:
          Array.isArray(parsed.landingConfig?.pricingPlans) && parsed.landingConfig.pricingPlans.length > 0
            ? parsed.landingConfig.pricingPlans
            : INITIAL_STATE.landingConfig.pricingPlans,
        testimonialsList:
          Array.isArray(parsed.landingConfig?.testimonialsList) && parsed.landingConfig.testimonialsList.length > 0
            ? parsed.landingConfig.testimonialsList
            : INITIAL_STATE.landingConfig.testimonialsList,
        faqList:
          Array.isArray(parsed.landingConfig?.faqList) && parsed.landingConfig.faqList.length > 0
            ? parsed.landingConfig.faqList
            : INITIAL_STATE.landingConfig.faqList,
        trustPills:
          Array.isArray(parsed.landingConfig?.trustPills) && parsed.landingConfig.trustPills.length > 0
            ? parsed.landingConfig.trustPills
            : INITIAL_STATE.landingConfig.trustPills,
        legalPages: {
          ...INITIAL_STATE.landingConfig.legalPages,
          ...(parsed.landingConfig?.legalPages || {}),
        },
      },
      plans: (() => {
        const loaded = parsed.plans || INITIAL_STATE.plans;
        if (!loaded.some((p: any) => p.id === 'free_trial')) {
          const trialPlan = INITIAL_STATE.plans.find((p) => p.id === 'free_trial');
          if (trialPlan) return [...loaded, trialPlan];
        }
        return loaded;
      })(),
      properties: (parsed.properties || []).map((p: any) => {
        const addrStr = typeof p.address === 'string' ? p.address : p.address?.formattedAddress;
        const cleanCountry = sanitizeCountry(p.country || (typeof p.address === 'object' ? p.address?.country : undefined), addrStr);
        return {
          ...p,
          country: cleanCountry,
          address: typeof p.address === 'object' ? { ...p.address, country: cleanCountry } : p.address,
          currency: p.currency === 'USD' ? '$' : p.currency,
        };
      }),
      units: (parsed.units || []).map((u: any) => ({
        ...u,
        country: sanitizeCountry(u.country, u.address),
        currency: u.currency === 'USD' ? '$' : u.currency,
      })),
      tenancyRequests: (parsed.tenancyRequests || []).map((r: any) => ({
        ...r,
        currency: r.currency === 'USD' ? '$' : r.currency,
      })),
      agreements: (parsed.agreements || []).map((a: any) => ({
        ...a,
        currency: a.currency === 'USD' ? '$' : a.currency,
      })),
      payments: (parsed.payments || []).map((p: any) => ({
        ...p,
        currency: p.currency === 'USD' ? '$' : p.currency,
      })),
      invoices: (parsed.invoices || []).map((i: any) => ({
        ...i,
        currency: i.currency === 'USD' ? '$' : i.currency,
      })),
      platformInvoices: parsed.platformInvoices || [],
      staff: parsed.staff || [],
      tickets: parsed.tickets || [],
      moveouts: (parsed.moveouts || []).map((m: any) => ({
        ...m,
        currency: m.currency === 'USD' ? '$' : m.currency,
      })),
      managerPayouts: parsed.managerPayouts || [],
      propertyManagers: parsed.propertyManagers || [],
      renewals: parsed.renewals || [],
      notifications: parsed.notifications || [],
      platformInvoiceTemplate: parsed.platformInvoiceTemplate || INITIAL_STATE.platformInvoiceTemplate,
      payoutProfiles: parsed.payoutProfiles || [],
      depositSettlements: parsed.depositSettlements || [],
      cashClaims: parsed.cashClaims || [],
      communicationLogs: parsed.communicationLogs || [],
      announcements: parsed.announcements || INITIAL_STATE.announcements || [],
    };
  } catch (err) {
    console.error('Failed to parse stored state, reverting to clean production state:', err);
    saveState(INITIAL_STATE);
    return INITIAL_STATE;
  }
}

export function saveState(state: AppState): void {
  if (typeof state.defaultTrialDays === 'number' || typeof state.annualDiscountPercent === 'number') {
    saveTrialPolicyCache(
      typeof state.defaultTrialDays === 'number' ? state.defaultTrialDays : 14,
      typeof state.annualDiscountPercent === 'number' ? state.annualDiscountPercent : 20
    );
  }
  // Pure Firebase/Cloud mode: Never serialize or store application database in localStorage
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('keystone_state_v1');
    localStorage.removeItem('keystone_active_user_id');
  } catch (_) {}
}
