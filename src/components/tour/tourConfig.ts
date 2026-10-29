import { UserRole } from '../../types';

export interface TourStep {
  id: string;
  selector: string;
  route?: string;
  chapter: string;
  stationNumber: number;
  totalInChapter: number;
  badge: string;
  title: string;
  dialogue: string;
  capabilities?: string[];
  proTip?: string;
  preferredPlacement: 'top' | 'bottom' | 'left' | 'right';
  iconName: 'dashboard' | 'properties' | 'tenants' | 'leasing' | 'payments' | 'maintenance' | 'controls' | 'sparkles' | 'award';
}

export const TOUR_STEPS_BY_ROLE: Record<UserRole, TourStep[]> = {
  // =========================================================================
  // 1. PROPERTY OWNER (Comprehensive 5-Chapter Interactive Quest)
  // =========================================================================
  owner: [
    // Chapter 1: Telemetry
    {
      id: 'owner-kpi-grid',
      selector: '[data-tour="owner-kpi-grid"]',
      route: '/owner/dashboard',
      chapter: 'Chapter 1: Command Center',
      stationNumber: 1,
      totalInChapter: 1,
      badge: 'Executive Telemetry',
      title: 'Operational Pulse & Real-Time KPIs',
      dialogue: 'Welcome, Commander! This is your operational pulse. Review your high-level cashflow, occupancy health, and open work orders across all properties in real-time.',
      capabilities: [
        'Live collected rent converted to your display currency',
        'Real-time portfolio occupancy rate & vacant unit counts',
        'Active tenant maintenance repair tickets requiring attention',
      ],
      proTip: 'The property dropdown above automatically recalculates and converts all financial metrics to your selected global currency.',
      preferredPlacement: 'bottom',
      iconName: 'dashboard',
    },

    // Chapter 2: Real Estate Vault
    {
      id: 'properties-subtabs',
      selector: '[data-tour="properties-subtabs"]',
      route: '/owner/properties',
      chapter: 'Chapter 2: Real Estate Vault',
      stationNumber: 2,
      totalInChapter: 2,
      badge: 'Asset Portfolio',
      title: 'Building Hierarchies & Unit Inventories',
      dialogue: 'Your physical real estate inventory lives here. Organize properties by building, manage floor levels, and track rental status per room.',
      capabilities: [
        'Multi-unit floorplans with individual rent and deposit tags',
        'Unit amenity checklists (Air Conditioning, Furnishing, Parking)',
        'Public listing toggles to publish units to vacancy directories',
      ],
      proTip: 'Toggle "Public Listing" on any vacant unit to automatically advertise it on your platform landing board.',
      preferredPlacement: 'bottom',
      iconName: 'properties',
    },
    {
      id: 'properties-add-btn',
      selector: '[data-tour="properties-add-btn"]',
      route: '/owner/properties',
      chapter: 'Chapter 2: Real Estate Vault',
      stationNumber: 3,
      totalInChapter: 2,
      badge: 'Property Provisioning',
      title: 'Adding Buildings & Rapid Unit Generation',
      dialogue: 'Provision a new asset in seconds. Attach verified Google Places addresses, upload cover photos, and bulk-generate room numbers.',
      capabilities: [
        'Google Places geocoding with verified street addresses',
        'Bulk unit creator (e.g. generate units 101 to 120 automatically)',
        'Individual electricity & water meter number logging',
      ],
      proTip: 'Use the bulk generator when adding apartment complexes to create 50+ units with customized rents in one click.',
      preferredPlacement: 'left',
      iconName: 'properties',
    },

    // Chapter 3: Digital Legal Desk
    {
      id: 'leasing-subtabs',
      selector: '[data-tour="leasing-subtabs"]',
      route: '/owner/leasing',
      chapter: 'Chapter 3: Digital Legal Desk',
      stationNumber: 4,
      totalInChapter: 2,
      badge: 'Contracts & Terms',
      title: 'Rental Agreements, Renewals & Library',
      dialogue: 'Your complete rental contract repository. Manage active tenancies, review upcoming lease expirations, and store standard templates.',
      capabilities: [
        'Active Leases: Live agreements with rent due dates and deposits',
        'Renewals: Automated 30/60-day lease extension offers',
        'Document Library: Master PDF templates reusable across units',
      ],
      proTip: 'Draft leases allow you to prepare contract terms in advance without locking the unit until tenant assignment.',
      preferredPlacement: 'bottom',
      iconName: 'leasing',
    },
    {
      id: 'leasing-issue-btn',
      selector: '[data-tour="leasing-issue-btn"]',
      route: '/owner/leasing',
      chapter: 'Chapter 3: Digital Legal Desk',
      stationNumber: 5,
      totalInChapter: 2,
      badge: 'Contract Dispatch',
      title: 'Issuing Leases: Offline vs. Digital Dispatch',
      dialogue: 'Execute contracts with precision. Supports uploading existing paper leases signed in-person or dispatching digital invites to applicants.',
      capabilities: [
        'Already Executed Offline: Upload signed PDFs & record settled deposits',
        'Digital Dispatch: Send agreement terms with mandatory KYC verification',
        'Automated rent due dates & security deposit reconciliation',
      ],
      proTip: 'Enable "Require Tenant ID" to enforce Passport, National ID, or Driving License verification before granting portal access.',
      preferredPlacement: 'left',
      iconName: 'leasing',
    },

    // Chapter 4: Financial & Cashflow Engine
    {
      id: 'payments-subtabs',
      selector: '[data-tour="payments-subtabs"]',
      route: '/owner/payments',
      chapter: 'Chapter 4: Financial Engine',
      stationNumber: 6,
      totalInChapter: 2,
      badge: 'Cashflow Ledger',
      title: 'Rent Roll Receivables & Gateways',
      dialogue: 'Your financial nerve center. Monitor rent receivables, manage tenant security deposit accounts, and configure online gateways.',
      capabilities: [
        'Rent Due: Live countdown of active rent dues & overdue balances',
        'Security Deposits: Escrow ledger with move-out deductions',
        'Automated late fees with configurable grace period rules',
      ],
      proTip: 'Turn on late fees in Settings to automatically apply daily or percentage penalties once the grace period expires.',
      preferredPlacement: 'bottom',
      iconName: 'payments',
    },
    {
      id: 'payments-record-offline',
      selector: '[data-tour="payments-record-offline"]',
      route: '/owner/payments',
      chapter: 'Chapter 4: Financial Engine',
      stationNumber: 7,
      totalInChapter: 2,
      badge: 'Offline Reconciliation',
      title: 'Logging Cash & Bank Wire Settlements',
      dialogue: 'Tenants paying via cash or bank NEFT? Record physical receipts here to automatically reconcile open invoices and send receipt confirmations.',
      capabilities: [
        'Cash collection receipts with on-site handover location tags',
        'Bank transfer reference tracking & wire verification',
        'Instant settled invoice generation and tenant balance updates',
      ],
      proTip: 'Logging an offline settlement automatically marks the corresponding month invoice as PAID in both owner and tenant portals.',
      preferredPlacement: 'left',
      iconName: 'payments',
    },

    // Chapter 5: Resident CRM
    {
      id: 'tenants-tabs',
      selector: '[data-tour="tenants-tabs"]',
      route: '/owner/tenants',
      chapter: 'Chapter 5: Resident CRM',
      stationNumber: 8,
      totalInChapter: 1,
      badge: 'Tenant Directory',
      title: 'Tenant 360 & KYC Document Vault',
      dialogue: 'Complete resident relationship management. Review verified identity documents, emergency contacts, active tenancies, and communication logs.',
      capabilities: [
        'KYC Document Vault: Review Aadhaar, Passports, and Voter IDs',
        'Tenant ratings & mutual rental reliability feedback scores',
        'Sent Tenancy Requests: Track unaccepted resident onboarding invitations',
      ],
      proTip: 'Click any tenant card to view their full 360-degree ledger including past payments, maintenance tickets, and contract history.',
      preferredPlacement: 'bottom',
      iconName: 'tenants',
    },

    // Chapter 6: Radar & Controls
    {
      id: 'topbar-actions',
      selector: '[data-tour="topbar-actions"]',
      route: '/owner/dashboard',
      chapter: 'Chapter 6: System Radar',
      stationNumber: 9,
      totalInChapter: 1,
      badge: 'System Radar',
      title: 'Global Controls, Converter & Reminders',
      dialogue: 'Always accessible from any screen: convert international currencies on the fly, switch themes, review notification bells, and manage security.',
      capabilities: [
        'Live foreign exchange currency converter with real-time rates',
        'Dark obsidian / light paper workspace theme toggle',
        'Action Hub: Aggregated reminders for overdue rent & pending approvals',
      ],
      proTip: 'Quickly access workspace settings, currency conversion, and theme personalization anytime from your top bar.',
      preferredPlacement: 'bottom',
      iconName: 'controls',
    },
  ],

  // =========================================================================
  // 2. TENANT RESIDENT (Deep Walkthrough)
  // =========================================================================
  tenant: [
    {
      id: 'tenant-nav-overview',
      selector: '[data-tour="tenant-nav-overview"]',
      route: '/tenant/dashboard',
      chapter: 'Resident Overview',
      stationNumber: 1,
      totalInChapter: 5,
      badge: 'Resident Portal',
      title: 'Welcome to Your Home Hub',
      dialogue: 'Your personal resident command center. Review your unit details, lease term dates, upcoming rent due notices, and owner announcements.',
      capabilities: [
        'Upcoming rent countdown with instant payment buttons',
        'Active lease overview and emergency landlord contacts',
        'Community announcements and building notices',
      ],
      proTip: 'Check your announcements board regularly for scheduled water or maintenance outages.',
      preferredPlacement: 'right',
      iconName: 'dashboard',
    },
    {
      id: 'tenant-nav-lease',
      selector: '[data-tour="tenant-nav-lease"]',
      route: '/tenant/lease',
      chapter: 'Contract & Legal',
      stationNumber: 2,
      totalInChapter: 5,
      badge: 'Rental Agreement',
      title: 'My Lease & Document Center',
      dialogue: 'Inspect your active rental contract, start and end dates, security deposit terms, and download official PDF copies of your agreement.',
      capabilities: [
        'Download initial and executed contract copies anytime',
        'Review security deposit holding terms and move-out requirements',
        'Submit lease renewal requests directly to your property manager',
      ],
      proTip: 'Your official executed agreement is permanently archived here for tax or passport residence proof.',
      preferredPlacement: 'right',
      iconName: 'leasing',
    },
    {
      id: 'tenant-nav-payments',
      selector: '[data-tour="tenant-nav-payments"]',
      route: '/tenant/payments',
      chapter: 'Rent & Payments',
      stationNumber: 3,
      totalInChapter: 5,
      badge: 'Settlements',
      title: 'Pay Rent Online & Review Receipts',
      dialogue: 'Settle monthly rent in seconds via Stripe, UPI QR, or PayPal, or upload your offline bank wire transfer reference.',
      capabilities: [
        'Instant digital checkout with auto-generated tax receipts',
        'Offline payment proof uploader for cash or bank transfers',
        'Full payment ledger and history of all settled invoices',
      ],
      proTip: 'Settling before your due date prevents automatic late fee calculations.',
      preferredPlacement: 'right',
      iconName: 'payments',
    },
    {
      id: 'tenant-nav-support',
      selector: '[data-tour="tenant-nav-support"]',
      route: '/tenant/support',
      chapter: 'Service Desk',
      stationNumber: 4,
      totalInChapter: 5,
      badge: 'Maintenance',
      title: 'Submit Repair & Service Requests',
      dialogue: 'Need a plumbing, electrical, or appliance repair? File tickets with photos and priority ratings directly to on-site technicians.',
      capabilities: [
        'Photo uploads for fast problem diagnosis',
        'Live technician dispatch and status tracking (Assigned ➔ In-Progress ➔ Resolved)',
        'Direct chat with maintenance staff regarding repair timing',
      ],
      proTip: 'Mark urgent issues like water leakage as "High Priority" for same-day dispatch.',
      preferredPlacement: 'right',
      iconName: 'maintenance',
    },
    {
      id: 'topbar-actions',
      selector: '[data-tour="topbar-actions"]',
      route: '/tenant/dashboard',
      chapter: 'Profile & Security',
      stationNumber: 5,
      totalInChapter: 5,
      badge: 'Controls',
      title: 'Alerts, KYC Verification & Theme',
      dialogue: 'Manage your contact information, upload updated KYC documents, toggle dark/light theme, and check instant payment confirmations.',
      capabilities: [
        'Upload verified Aadhaar, Passport, or National ID',
        'Receive instant SMS and email payment settlement receipts',
        'Configure notification and contact preferences',
      ],
      proTip: 'Keep your phone number up to date to receive automated rent and delivery alerts.',
      preferredPlacement: 'bottom',
      iconName: 'controls',
    },
  ],

  // =========================================================================
  // 3. PROPERTY MANAGER (Deep Operations Walkthrough)
  // =========================================================================
  manager: [
    {
      id: 'manager-nav-overview',
      selector: '[data-tour="manager-nav-overview"]',
      route: '/manager/dashboard',
      chapter: 'Operations Desk',
      stationNumber: 1,
      totalInChapter: 4,
      badge: 'Overview',
      title: 'Manager Operations Hub',
      dialogue: 'Oversee daily property operations across assigned buildings: monitor move-ins, repair queues, and occupant inquiries.',
      capabilities: [
        'Portfolio occupancy snapshot for assigned properties',
        'Urgent maintenance dispatch board',
        'Tenant move-in and turnover schedules',
      ],
      preferredPlacement: 'right',
      iconName: 'dashboard',
    },
    {
      id: 'manager-nav-properties',
      selector: '[data-tour="manager-nav-properties"]',
      route: '/manager/properties',
      chapter: 'Properties',
      stationNumber: 2,
      totalInChapter: 4,
      badge: 'Assigned Assets',
      title: 'Building Inventory & Unit Inspections',
      dialogue: 'Inspect assigned rental units, check vacancy turnaround schedules, and log property maintenance conditions.',
      capabilities: [
        'Unit occupancy status indicators',
        'Floorplan and amenity verifications',
        'Vacant unit turnover readiness logs',
      ],
      preferredPlacement: 'right',
      iconName: 'properties',
    },
    {
      id: 'manager-nav-maintenance',
      selector: '[data-tour="manager-nav-maintenance"]',
      route: '/manager/maintenance',
      chapter: 'Maintenance Dispatch',
      stationNumber: 3,
      totalInChapter: 4,
      badge: 'Dispatch Board',
      title: 'Technician Dispatch & Work Orders',
      dialogue: 'Triage incoming resident work orders, assign specialized staff technicians, approve parts expenses, and close out resolved tickets.',
      capabilities: [
        'Assign tickets to internal technicians or external vendors',
        'Track repair parts expenses and approval thresholds',
        'Monitor tenant resolution satisfaction ratings',
      ],
      preferredPlacement: 'right',
      iconName: 'maintenance',
    },
    {
      id: 'topbar-actions',
      selector: '[data-tour="topbar-actions"]',
      route: '/manager/dashboard',
      chapter: 'Radar',
      stationNumber: 4,
      totalInChapter: 4,
      badge: 'System Radar',
      title: 'Real-Time Operational Alerts',
      dialogue: 'Instant notifications regarding urgent maintenance escalation, owner broadcasts, and profile management.',
      capabilities: [
        'Real-time technician dispatch notifications',
        'Direct owner communication alerts',
        'Account profile and security settings',
      ],
      preferredPlacement: 'bottom',
      iconName: 'controls',
    },
  ],

  // =========================================================================
  // 4. MAINTENANCE STAFF (Technician Queue)
  // =========================================================================
  staff: [
    {
      id: 'staff-nav-overview',
      selector: '[data-tour="staff-nav-overview"]',
      route: '/staff/dashboard',
      chapter: 'Task Queue',
      stationNumber: 1,
      totalInChapter: 3,
      badge: 'Work Queue',
      title: 'Assigned Repair Tickets',
      dialogue: 'Your daily queue of field maintenance tasks. View unit numbers, tenant issue descriptions, photos, and update work status.',
      capabilities: [
        'Review resident issue photos and notes before dispatch',
        'Update ticket status: In-Progress ➔ Pending Parts ➔ Resolved',
        'Log completion photos and repair notes for manager sign-off',
      ],
      preferredPlacement: 'right',
      iconName: 'maintenance',
    },
    {
      id: 'staff-nav-payments',
      selector: '[data-tour="staff-nav-payments"]',
      route: '/staff/payments',
      chapter: 'Compensation',
      stationNumber: 2,
      totalInChapter: 3,
      badge: 'Task Fees',
      title: 'Service Compensation & Payouts',
      dialogue: 'Track task labor fees, approved work orders, and logged repair earnings for completed jobs.',
      capabilities: [
        'Per-task compensation and labor rate tracking',
        'Payout clearance history and settlement receipts',
        'Expense reimbursement logs for purchased repair parts',
      ],
      preferredPlacement: 'right',
      iconName: 'payments',
    },
    {
      id: 'topbar-actions',
      selector: '[data-tour="topbar-actions"]',
      route: '/staff/dashboard',
      chapter: 'Alerts',
      stationNumber: 3,
      totalInChapter: 3,
      badge: 'Dispatch Radar',
      title: 'Instant Job Notifications',
      dialogue: 'Get pinged immediately when a property manager or resident assigns an urgent repair task to you.',
      capabilities: [
        'Instant sound & banner dispatch notifications',
        'Work schedule & availability status settings',
        'Theme and mobile display controls',
      ],
      preferredPlacement: 'bottom',
      iconName: 'controls',
    },
  ],

  // =========================================================================
  // 5. SUPERADMIN (Command Center)
  // =========================================================================
  superadmin: [
    {
      id: 'superadmin-nav-overview',
      selector: '[data-tour="superadmin-nav-overview"]',
      route: '/superadmin/overview',
      chapter: 'Command Center',
      stationNumber: 1,
      totalInChapter: 4,
      badge: 'Global Overview',
      title: 'Platform Governance & SaaS Health',
      dialogue: 'Global overview of all property management portfolios, active owners, overall MRR, and platform database metrics.',
      capabilities: [
        'Platform-wide MRR, active owners & registered resident metrics',
        'Global subscription trial health & conversion monitoring',
        'Live system audit logs & administrative security controls',
      ],
      preferredPlacement: 'right',
      iconName: 'dashboard',
    },
    {
      id: 'superadmin-nav-users',
      selector: '[data-tour="superadmin-nav-users"]',
      route: '/superadmin/users',
      chapter: 'User Governance',
      stationNumber: 2,
      totalInChapter: 4,
      badge: 'Directory',
      title: 'Global Multi-Role User Oversight',
      dialogue: 'Audit and govern user profiles across all roles: Owners, Tenants, Managers, Staff, and Administrators.',
      capabilities: [
        'Cross-role account inspection and status suspension toggles',
        'Manual password resets & temporary credential issuance',
        'Admin security pin governance for high-privilege operations',
      ],
      preferredPlacement: 'right',
      iconName: 'tenants',
    },
    {
      id: 'superadmin-nav-plans',
      selector: '[data-tour="superadmin-nav-plans"]',
      route: '/superadmin/plans',
      chapter: 'Commercial Tiers',
      stationNumber: 3,
      totalInChapter: 4,
      badge: 'Plans & Pricing',
      title: 'Subscription Tiers & Trial Policies',
      dialogue: 'Configure commercial subscription quotas (properties, units, staff limits) and default free trial durations for new owners.',
      capabilities: [
        'Live pricing and tier quota adjustments (Starter, Growth, Scale)',
        'Free trial duration rules (e.g. 14 days default trial with feature caps)',
        'Plan popularity badges and public display toggles',
      ],
      preferredPlacement: 'right',
      iconName: 'sparkles',
    },
    {
      id: 'topbar-actions',
      selector: '[data-tour="topbar-actions"]',
      route: '/superadmin/overview',
      chapter: 'Radar',
      stationNumber: 4,
      totalInChapter: 4,
      badge: 'System Radar',
      title: 'Admin Security Radar & Controls',
      dialogue: 'Instant broadcast alerts, integrations status, and administrative security credentials.',
      capabilities: [
        'System broadcast dispatcher for scheduled maintenance outages',
        'Global payment gateway credential configuration (Stripe, Razorpay)',
        'Currency sync rates and platform configuration cache management',
      ],
      preferredPlacement: 'bottom',
      iconName: 'controls',
    },
  ],
};
