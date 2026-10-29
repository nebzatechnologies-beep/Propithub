import { UserRole } from '../../types';

export interface MobileTourStep {
  id: string;
  targetId: string;
  fallbackTargetId?: string;
  screenKey: string;
  chapter: string;
  stationNumber: number;
  totalInChapter: number;
  badge: string;
  title: string;
  dialogue: string;
  capabilities: string[];
  proTip?: string;
  preferredPlacement: 'top' | 'bottom';
  icon: string;
  iconLib?: 'feather' | 'mci';
}

export const MOBILE_TOUR_STEPS: Record<UserRole, MobileTourStep[]> = {
  // =========================================================================
  // 1. PROPERTY OWNER (Comprehensive Multi-Chapter Interactive Quest — Web Parity)
  // =========================================================================
  owner: [
    // Chapter 1: Command Center
    {
      id: 'owner-kpi-grid',
      targetId: 'owner-kpi-grid',
      fallbackTargetId: 'topbar-actions',
      screenKey: 'owner_dashboard',
      chapter: 'Chapter 1: Command Center',
      stationNumber: 1,
      totalInChapter: 1,
      badge: 'Executive Telemetry',
      title: 'Operational Pulse & Real-Time KPIs',
      dialogue:
        'Welcome, Commander! This is your operational pulse. Review your high-level cashflow, occupancy health, and open work orders across all properties in real-time.',
      capabilities: [
        'Live collected rent converted to your display currency',
        'Real-time portfolio occupancy rate & vacant unit counts',
        'Active tenant maintenance repair tickets requiring attention',
      ],
      proTip:
        'The property & currency filter pills above automatically recalculate and convert all financial metrics to your selected global currency.',
      preferredPlacement: 'bottom',
      icon: 'grid',
      iconLib: 'feather',
    },

    // Chapter 2: Real Estate Vault (Station 2 & 3)
    {
      id: 'properties-subtabs',
      targetId: 'properties-subtabs',
      fallbackTargetId: 'tab-property_portfolio',
      screenKey: 'property_portfolio',
      chapter: 'Chapter 2: Real Estate Vault',
      stationNumber: 2,
      totalInChapter: 2,
      badge: 'Asset Portfolio',
      title: 'Building Hierarchies & Unit Inventories',
      dialogue:
        'Your physical real estate inventory lives here. Organize properties by building, manage floor levels, and track rental status per room.',
      capabilities: [
        'Multi-unit floorplans with individual rent and deposit tags',
        'Unit amenity checklists (Air Conditioning, Furnishing, Parking)',
        'Public listing toggles to publish units to vacancy directories',
      ],
      proTip:
        'Switch between "Properties" and "Units" to inspect individual sub-meters, deposits, and public listing statuses.',
      preferredPlacement: 'bottom',
      icon: 'layers',
      iconLib: 'feather',
    },
    {
      id: 'properties-add-btn',
      targetId: 'properties-add-btn',
      fallbackTargetId: 'properties-subtabs',
      screenKey: 'property_portfolio',
      chapter: 'Chapter 2: Real Estate Vault',
      stationNumber: 3,
      totalInChapter: 2,
      badge: 'Property Provisioning',
      title: 'Adding Buildings & Rapid Unit Generation',
      dialogue:
        'Provision a new asset in seconds. Attach verified addresses, upload building cover photos, and bulk-generate room numbers.',
      capabilities: [
        'Step-by-step property creation wizard with verified addresses',
        'Bulk unit creator (e.g. generate units 101 to 120 automatically)',
        'Individual electricity & water meter number logging',
      ],
      proTip:
        'Use the "+ Add Property" button below to launch the wizard and generate multi-unit apartment complexes in one tap.',
      preferredPlacement: 'top',
      icon: 'plus-circle',
      iconLib: 'feather',
    },

    // Chapter 3: Digital Legal Desk (Station 4 & 5)
    {
      id: 'leasing-subtabs',
      targetId: 'leasing-subtabs',
      fallbackTargetId: 'tab-__more__',
      screenKey: 'leasing_hub',
      chapter: 'Chapter 3: Digital Legal Desk',
      stationNumber: 4,
      totalInChapter: 2,
      badge: 'Contracts & Terms',
      title: 'Rental Agreements, Renewals & Library',
      dialogue:
        'Your complete rental contract repository. Manage active tenancies, review upcoming lease expirations, and store standard templates.',
      capabilities: [
        'Active Leases: Live agreements with rent due dates and deposits',
        'Renewals: Automated 30/60-day lease extension offers',
        'Lease Templates: Master PDF templates reusable across units',
      ],
      proTip:
        'Draft leases allow you to prepare contract terms in advance without locking the unit until tenant assignment.',
      preferredPlacement: 'bottom',
      icon: 'file-text',
      iconLib: 'feather',
    },
    {
      id: 'leasing-issue-btn',
      targetId: 'leasing-issue-btn',
      fallbackTargetId: 'leasing-subtabs',
      screenKey: 'leasing_hub',
      chapter: 'Chapter 3: Digital Legal Desk',
      stationNumber: 5,
      totalInChapter: 2,
      badge: 'Contract Dispatch',
      title: 'Issuing Leases: Offline vs. Digital Dispatch',
      dialogue:
        'Execute contracts with precision. Supports uploading existing paper leases signed in-person or dispatching digital invites to applicants.',
      capabilities: [
        'Already Executed Offline: Upload signed PDFs & record settled deposits',
        'Digital Dispatch: Send agreement terms with mandatory KYC verification',
        'Automated rent due dates & security deposit reconciliation',
      ],
      proTip:
        'Enable "Require Tenant ID" when issuing a lease to enforce Passport, Aadhaar, or National ID verification before portal access.',
      preferredPlacement: 'bottom',
      icon: 'send',
      iconLib: 'feather',
    },

    // Chapter 4: Financial & Cashflow Engine (Station 6 & 7)
    {
      id: 'payments-subtabs',
      targetId: 'payments-subtabs',
      fallbackTargetId: 'tab-financial_ledger',
      screenKey: 'financial_ledger',
      chapter: 'Chapter 4: Financial Engine',
      stationNumber: 6,
      totalInChapter: 2,
      badge: 'Cashflow Ledger',
      title: 'Rent Roll Receivables & Gateways',
      dialogue:
        'Your financial nerve center. Monitor rent receivables, manage tenant security deposit accounts, and configure online gateways.',
      capabilities: [
        'Rent Due: Live countdown of active rent dues & overdue balances',
        'Deposits: Escrow ledger with move-out inspection deductions',
        'Rules & Gateways: Automated late fees & Stripe/Razorpay/UPI setup',
      ],
      proTip:
        'Configure late fee rules in the "Rules & Reminders" tab to automatically apply daily or percentage penalties after the grace period.',
      preferredPlacement: 'bottom',
      icon: 'credit-card',
      iconLib: 'feather',
    },
    {
      id: 'payments-record-offline',
      targetId: 'payments-record-offline',
      fallbackTargetId: 'payments-subtabs',
      screenKey: 'financial_ledger',
      chapter: 'Chapter 4: Financial Engine',
      stationNumber: 7,
      totalInChapter: 2,
      badge: 'Offline Reconciliation',
      title: 'Logging Cash & Bank Wire Settlements',
      dialogue:
        'Tenants paying via cash or bank NEFT? Record physical receipts here to automatically reconcile open invoices and send receipt confirmations.',
      capabilities: [
        'Cash collection receipts with on-site handover location tags',
        'Bank transfer reference tracking & wire verification',
        'Instant settled invoice generation and tenant balance updates',
      ],
      proTip:
        'Logging an offline settlement automatically marks the corresponding month invoice as PAID in both owner and tenant portals.',
      preferredPlacement: 'bottom',
      icon: 'check-circle',
      iconLib: 'feather',
    },

    // Chapter 5: Resident CRM (Station 8)
    {
      id: 'tenants-tabs',
      targetId: 'tenants-tabs',
      fallbackTargetId: 'tab-__more__',
      screenKey: 'tenant_roster',
      chapter: 'Chapter 5: Resident CRM',
      stationNumber: 8,
      totalInChapter: 1,
      badge: 'Tenant Directory',
      title: 'Tenant 360 & KYC Document Vault',
      dialogue:
        'Complete resident relationship management. Review verified identity documents, emergency contacts, active tenancies, and communication logs.',
      capabilities: [
        'KYC Document Vault: Review Aadhaar, Passports, and Voter IDs',
        'Tenant ratings & mutual rental reliability feedback scores',
        'Requests Tab: Track unaccepted resident onboarding invitations',
      ],
      proTip:
        'Tap any resident card to open their full 360-degree ledger including past payments, maintenance tickets, and contract history.',
      preferredPlacement: 'bottom',
      icon: 'users',
      iconLib: 'feather',
    },

    // Chapter 6: Dispatch Engine (Station 9)
    {
      id: 'owner-maintenance',
      targetId: 'owner-maintenance-controls',
      fallbackTargetId: 'topbar-actions',
      screenKey: 'owner_maintenance_dispatch',
      chapter: 'Chapter 6: Dispatch Engine',
      stationNumber: 9,
      totalInChapter: 1,
      badge: 'Repairs & Operations',
      title: 'Work Orders & Field Staff Dispatch',
      dialogue:
        'Stay ahead of property maintenance. Triage urgent tenant issues (plumbing, electrical, HVAC), assign field technicians, and track work order approvals.',
      capabilities: [
        'Real-time technician assignment with labor & material cost tracking',
        'Review before-and-after photo attachments submitted by tenants',
        'Approve or close completed work orders with one touch',
      ],
      proTip:
        'Assign payer responsibility (Owner vs Tenant) when dispatching a technician to automatically route repair invoices.',
      preferredPlacement: 'bottom',
      icon: 'tool',
      iconLib: 'feather',
    },

    // Chapter 7: System Radar (Station 10)
    {
      id: 'topbar-actions',
      targetId: 'owner-radar-controls',
      fallbackTargetId: 'topbar-actions',
      screenKey: 'owner_dashboard',
      chapter: 'Chapter 7: System Radar',
      stationNumber: 10,
      totalInChapter: 1,
      badge: 'System Radar',
      title: 'Global Controls, Converter & Reminders',
      dialogue:
        'Always accessible from your dashboard: convert international currencies on the fly, filter by property, check notification bells, and open the More drawer.',
      capabilities: [
        'Live foreign exchange currency converter with real-time rates',
        'Dark obsidian / light paper workspace theme toggle in Settings',
        'Priority Actions Hub: Aggregated reminders for overdue rent & approvals',
      ],
      proTip:
        'Use the property and currency filter pills at the top of your dashboard to isolate metrics for any single building.',
      preferredPlacement: 'bottom',
      icon: 'compass',
      iconLib: 'feather',
    },
  ],

  // =========================================================================
  // 2. TENANT RESIDENT (5-Station Deep Walkthrough — Web Parity)
  // =========================================================================
  tenant: [
    {
      id: 'tenant-nav-overview',
      targetId: 'tenant-overview-hero',
      fallbackTargetId: 'tab-tenant_dashboard',
      screenKey: 'tenant_dashboard',
      chapter: 'Resident Overview',
      stationNumber: 1,
      totalInChapter: 5,
      badge: 'Resident Portal',
      title: 'Welcome to Your Home Hub',
      dialogue:
        'Your personal resident command center. Review your unit details, lease term dates, upcoming rent due notices, and owner announcements.',
      capabilities: [
        'Upcoming rent countdown with instant payment buttons',
        'Active lease overview and emergency landlord contacts',
        'Community announcements and building notices',
      ],
      proTip:
        'Check your announcements board regularly for scheduled water or maintenance outages.',
      preferredPlacement: 'bottom',
      icon: 'home',
      iconLib: 'feather',
    },
    {
      id: 'tenant-nav-lease',
      targetId: 'tenant-lease-subtabs',
      fallbackTargetId: 'tab-tenant_lease',
      screenKey: 'tenant_lease',
      chapter: 'Contract & Legal',
      stationNumber: 2,
      totalInChapter: 5,
      badge: 'Rental Agreement',
      title: 'My Lease & Document Center',
      dialogue:
        'Inspect your active rental contract, start and end dates, security deposit terms, and download official PDF copies of your agreement.',
      capabilities: [
        'Download initial and executed contract copies anytime',
        'Review security deposit holding terms and move-out requirements',
        'Submit lease renewal requests directly to your property manager',
      ],
      proTip:
        'Your official executed agreement is permanently archived here for tax or passport residence proof.',
      preferredPlacement: 'bottom',
      icon: 'file-text',
      iconLib: 'feather',
    },
    {
      id: 'tenant-nav-payments',
      targetId: 'tenant-payments-hero',
      fallbackTargetId: 'tab-tenant_payments',
      screenKey: 'tenant_payments',
      chapter: 'Rent & Payments',
      stationNumber: 3,
      totalInChapter: 5,
      badge: 'Settlements',
      title: 'Pay Rent Online & Review Receipts',
      dialogue:
        'Settle monthly rent in seconds via Stripe, Razorpay, UPI QR, or PayPal, or upload your offline bank wire transfer reference.',
      capabilities: [
        'Instant digital checkout with auto-generated tax receipts',
        'Offline payment proof uploader for cash or bank transfers',
        'Full payment ledger and history of all settled invoices',
      ],
      proTip:
        'Settling before your due date prevents automatic late fee calculations and builds your verified tenant rating.',
      preferredPlacement: 'bottom',
      icon: 'credit-card',
      iconLib: 'feather',
    },
    {
      id: 'tenant-nav-support',
      targetId: 'tenant-maintenance-hero',
      fallbackTargetId: 'tab-__more__',
      screenKey: 'tenant_maintenance',
      chapter: 'Service Desk',
      stationNumber: 4,
      totalInChapter: 5,
      badge: 'Maintenance',
      title: 'Submit Repair & Service Requests',
      dialogue:
        'Need a plumbing, electrical, or appliance repair? File tickets with photos and priority ratings directly to on-site technicians.',
      capabilities: [
        'Photo uploads for fast problem diagnosis',
        'Live technician dispatch and status tracking (Assigned ➔ In-Progress ➔ Resolved)',
        'Rate technician service quality upon job completion',
      ],
      proTip:
        'Mark urgent issues like water leakage as "High Priority" for same-day dispatch.',
      preferredPlacement: 'bottom',
      icon: 'tool',
      iconLib: 'feather',
    },
    {
      id: 'tenant-topbar-actions',
      targetId: 'tenant-topbar-actions',
      fallbackTargetId: 'tab-__more__',
      screenKey: 'tenant_dashboard',
      chapter: 'Profile & Security',
      stationNumber: 5,
      totalInChapter: 5,
      badge: 'Controls',
      title: 'Alerts, KYC Verification & Theme',
      dialogue:
        'Manage your display currency, check instant payment notifications, upload updated KYC documents, and toggle dark/light theme.',
      capabilities: [
        'Upload verified Aadhaar, Passport, or National ID',
        'Receive instant push and email payment settlement receipts',
        'Switch between Dark Obsidian and Light Paper themes in Settings',
      ],
      proTip:
        'Keep your phone number up to date in Settings to receive automated rent and delivery alerts.',
      preferredPlacement: 'bottom',
      icon: 'sliders',
      iconLib: 'feather',
    },
  ],

  // =========================================================================
  // 3. PROPERTY MANAGER (4-Station Deep Operations Walkthrough — Web Parity)
  // =========================================================================
  manager: [
    {
      id: 'manager-nav-overview',
      targetId: 'manager-overview-hero',
      fallbackTargetId: 'tab-manager_operations',
      screenKey: 'manager_operations',
      chapter: 'Operations Desk',
      stationNumber: 1,
      totalInChapter: 4,
      badge: 'Overview',
      title: 'Manager Operations Hub',
      dialogue:
        'Oversee daily property operations across assigned buildings: monitor move-ins, repair queues, and occupant inquiries.',
      capabilities: [
        'Portfolio occupancy snapshot for assigned properties',
        'Urgent maintenance dispatch board',
        'Tenant move-in and turnover schedules',
      ],
      proTip:
        'Focus on priority maintenance tickets first to keep resident satisfaction and building occupancy high.',
      preferredPlacement: 'bottom',
      icon: 'home',
      iconLib: 'feather',
    },
    {
      id: 'manager-nav-properties',
      targetId: 'manager-properties-list',
      fallbackTargetId: 'tab-manager_properties',
      screenKey: 'manager_properties',
      chapter: 'Properties',
      stationNumber: 2,
      totalInChapter: 4,
      badge: 'Assigned Assets',
      title: 'Building Inventory & Unit Inspections',
      dialogue:
        'Inspect assigned rental units, check vacancy turnaround schedules, and log property maintenance conditions.',
      capabilities: [
        'Unit occupancy status indicators and public listing toggles',
        'Floorplan and amenity verifications',
        'Routine unit inspection condition logging',
      ],
      proTip:
        'Tap "Inspection Log" on any unit card to record unit condition notes directly from the field.',
      preferredPlacement: 'bottom',
      icon: 'grid',
      iconLib: 'feather',
    },
    {
      id: 'manager-nav-maintenance',
      targetId: 'manager-maintenance-subtabs',
      fallbackTargetId: 'tab-manager_repair_dispatch',
      screenKey: 'manager_repair_dispatch',
      chapter: 'Maintenance Dispatch',
      stationNumber: 3,
      totalInChapter: 4,
      badge: 'Dispatch Board',
      title: 'Technician Dispatch & Work Orders',
      dialogue:
        'Triage incoming resident work orders, assign specialized staff technicians, approve parts expenses, and close out resolved tickets.',
      capabilities: [
        'Assign tickets to internal technicians or external vendors',
        'Track repair parts expenses and approval thresholds',
        'Monitor tenant resolution satisfaction ratings',
      ],
      proTip:
        'Filter by "Emergency" or "High" priority to triage critical building issues immediately.',
      preferredPlacement: 'bottom',
      icon: 'tool',
      iconLib: 'feather',
    },
    {
      id: 'manager-topbar-actions',
      targetId: 'topbar-actions',
      fallbackTargetId: 'tab-__more__',
      screenKey: 'manager_operations',
      chapter: 'Radar',
      stationNumber: 4,
      totalInChapter: 4,
      badge: 'System Radar',
      title: 'Real-Time Operational Alerts',
      dialogue:
        'Instant notifications regarding urgent maintenance escalation, owner broadcasts, and profile management.',
      capabilities: [
        'Real-time technician dispatch notifications',
        'Direct owner communication alerts',
        'Account profile and security settings',
      ],
      proTip:
        'Tap the notification bell in the top header anytime to review recent escalations.',
      preferredPlacement: 'bottom',
      icon: 'bell',
      iconLib: 'feather',
    },
  ],

  // =========================================================================
  // 4. MAINTENANCE STAFF (4-Station Technician Walkthrough — Web Parity)
  // =========================================================================
  staff: [
    {
      id: 'staff-nav-overview',
      targetId: 'staff-queue-subtabs',
      fallbackTargetId: 'tab-staff_job_queue',
      screenKey: 'staff_job_queue',
      chapter: 'Task Queue',
      stationNumber: 1,
      totalInChapter: 4,
      badge: 'Work Queue',
      title: 'Assigned Repair Tickets',
      dialogue:
        'Your daily queue of field maintenance tasks. View unit numbers, tenant issue descriptions, photos, and update work status.',
      capabilities: [
        'Review resident issue photos and notes before dispatch',
        'Update ticket status: In-Progress ➔ Pending Parts ➔ Resolved',
        'Log completion photos and repair notes for manager sign-off',
      ],
      proTip:
        'Always update your ticket to "In Progress" when you arrive at the unit so the resident knows you are on site.',
      preferredPlacement: 'bottom',
      icon: 'list',
      iconLib: 'feather',
    },
    {
      id: 'staff-nav-payments',
      targetId: 'staff-earnings-grid',
      fallbackTargetId: 'tab-staff_task_fees',
      screenKey: 'staff_task_fees',
      chapter: 'Compensation',
      stationNumber: 2,
      totalInChapter: 4,
      badge: 'Task Fees',
      title: 'Service Compensation & Payouts',
      dialogue:
        'Track task labor fees, approved work orders, and logged repair earnings for completed jobs.',
      capabilities: [
        'Per-task compensation and labor rate tracking',
        'Payout clearance history and settlement confirmations',
        'Expense reimbursement logs for purchased repair parts',
      ],
      proTip:
        'Confirm settled payouts as soon as they reach your account to keep your technician ledger reconciled.',
      preferredPlacement: 'bottom',
      icon: 'credit-card',
      iconLib: 'feather',
    },
    {
      id: 'staff-nav-ratings',
      targetId: 'staff-ratings-hero',
      fallbackTargetId: 'tab-staff_ratings',
      screenKey: 'staff_ratings',
      chapter: 'Performance',
      stationNumber: 3,
      totalInChapter: 4,
      badge: 'Trust & Reputation',
      title: 'Verified Tenant Ratings & Reviews',
      dialogue:
        'Build your professional credibility. View customer satisfaction scores, completion badges, and verified reviews from residents.',
      capabilities: [
        '5-star ratings breakdown and customer feedback comments',
        'Top Rated Technician and Resident Approved badges',
        'Complete archive of resolved work orders and notes',
      ],
      proTip:
        'High customer satisfaction ratings unlock priority job dispatches across your property network.',
      preferredPlacement: 'bottom',
      icon: 'award',
      iconLib: 'feather',
    },
    {
      id: 'staff-topbar-actions',
      targetId: 'staff-topbar-actions',
      fallbackTargetId: 'tab-__more__',
      screenKey: 'staff_job_queue',
      chapter: 'Alerts',
      stationNumber: 4,
      totalInChapter: 4,
      badge: 'Dispatch Radar',
      title: 'Instant Job Notifications',
      dialogue:
        'Get pinged immediately when a property manager or owner assigns an urgent repair task to you.',
      capabilities: [
        'Instant active job counter and dispatch alerts',
        'Work schedule & shift logging controls',
        'Theme and mobile display settings in the More menu',
      ],
      proTip:
        'Tap the active badge or More tab to access your profile, notifications, and workspace settings.',
      preferredPlacement: 'bottom',
      icon: 'zap',
      iconLib: 'feather',
    },
  ],
};
