// Section 1 to 8 Generator Module
export function renderPart1(b) {
  // ==========================================
  // SECTION 1: EXECUTIVE OVERVIEW
  // ==========================================
  b.h1(1, 'Executive Overview');

  b.p('Propithub is an enterprise-grade, multi-role property operations, leasing management, financial reconciliation, and facilities dispatch platform. This architectural specification establishes the comprehensive blueprint for a single, unified mobile application engineered to serve all non-administrative stakeholders of the ecosystem: Property Owners (Landlords), Tenant Residents, Delegated Property Managers, and Maintenance Staff.');

  b.callout(
    'Unified Mobile App Architecture Principle',
    'A single application binary (iOS / Android) serves every stakeholder role in the platform through dynamic Role-Based Access Control (RBAC). Upon authentication, the mobile client resolves the user profile, enforces strict security boundaries, and provisions a tailored operational workspace. The Superadmin role is strictly segregated to the desktop web control center and is omitted from the mobile application.',
    'note'
  );

  b.h2('1.1 Strategic Intent & Core Objectives');
  b.bullet('Unified Operational Surface', 'Eliminates cross-app friction by housing tenancy agreements, rent payments, work orders, move-out inspections, and team payouts in one cohesive mobile environment.');
  b.bullet('Strict Role Demarcation', 'Enforces structural boundaries, notably ensuring Property Managers have full operational control over assigned properties with zero access to financial balances, bank accounts, or gross revenue.');
  b.bullet('Dual-Channel Payment & Reconciliation', 'Supports integrated digital gateways (Stripe, Razorpay, PayPal) alongside structured offline proof reconciliations and a dual-confirmation cash handover protocol.');
  b.bullet('Offline & Field Resilience', 'Provides mobile-first convenience for on-site staff updating tickets in the field and landlords conducting physical property inspections.');

  b.h2('1.2 Architectural Scope Boundaries');
  b.keyValueGrid([
    { key: 'Platform Codebase', value: 'Propithub v2' },
    { key: 'Target Mobile Ecosystem', value: 'iOS (App Store) & Android (Google Play)' },
    { key: 'Included User Roles', value: 'Owner, Tenant, Manager, Staff' },
    { key: 'Excluded User Roles', value: 'Superadmin (Web Management Only)' },
    { key: 'Core Data Engine', value: 'Real-Time Firestore & Distributed Store' },
    { key: 'Financial Gateways', value: 'Stripe, Razorpay, PayPal, Cash Protocol' },
  ], 2);

  // ==========================================
  // SECTION 2: PLATFORM PURPOSE
  // ==========================================
  b.h1(2, 'Platform Purpose & Problem Statement');

  b.p('Residential and commercial property management suffers from chronic operational fragmentation: paper leases, untracked cash rent handovers, delayed repair requests, opaque security deposit deductions, and disconnected service technicians. Propithub unifies these siloed interactions into an automated, transparent, and auditable digital lifecycle.');

  b.h2('2.1 Core Problems Solved by the Platform');
  b.bullet('Lease Administration Friction', 'Replaces scattered paper contracts with digital agreement drafting, online dispatch, signature capture, countersigning, and automated renewal triggers.');
  b.bullet('Payment Reconciliation Disputes', 'Resolves tenant-landlord friction through structured digital invoicing, instant gateway capture, UTR transaction reference tracking, and dual-party confirmed cash handover claims.');
  b.bullet('Unregulated Security Deposit Deductions', 'Replaces informal deposit withholding with formal move-out checklist inspections, photo evidence attachment, itemized deductions, and tenant approval / contesting workflows.');
  b.bullet('Maintenance Queue Disorganization', 'Transforms tenant complaints into structured work orders with photo attachments, priority assignment, technician dispatch, task fees, and tenant satisfaction ratings.');
  b.bullet('Multi-Currency & Global Property Portfolios', 'Enables landlords with international assets to operate across 160+ currencies with real-time forex conversions and region-specific payout routing (UPI, ACH, IBAN, UK Sort, PayPal).');

  b.h2('2.2 Target User Personas');
  b.table(
    ['Persona', 'Primary Objectives', 'Key Value Driver'],
    [
      ['Property Owner', 'Maximize rent roll, minimize vacancies, ensure lease compliance, track real-time payments, supervise maintenance team.', 'Automated cash flow & legal protection'],
      ['Tenant Resident', 'Convenient rent payments, transparent lease terms, rapid repair turnaround, fair move-out deposit refund guarantee.', 'Self-service residency & transparency'],
      ['Property Manager', 'Oversee physical building operations, dispatch technicians, triage repairs, verify tenant leases with zero financial burden.', 'Operational efficiency without audit liability'],
      ['Maintenance Staff', 'Receive clear work order queue, navigate assigned units, report job progress, submit completion proof, track task fee earnings.', 'Clear daily task queue & prompt payout']
    ],
    { colWidths: [110, 240, 161], boldFirstCol: true }
  );

  // ==========================================
  // SECTION 3: USER ROLES
  // ==========================================
  b.h1(3, 'User Roles & System Personas');

  b.p('The Propithub platform architecture defines five distinct user roles. Four roles operate actively in field and tenancy workflows, while the fifth role is strictly dedicated to platform administration.');

  b.h2('3.1 Role Taxonomy & Authorization Hierarchy');
  b.table(
    ['Role Code', 'Display Name', 'Access Domain', 'Mobile App Scope'],
    [
      ['owner', 'Property Owner', 'Full ownership of assigned properties, tenants, leases, staff, and financial balances.', 'FULL MOBILE ACCESS'],
      ['tenant', 'Tenant Resident', 'Individual tenancy lease, rental billing, maintenance tickets, move-out settlement.', 'FULL MOBILE ACCESS'],
      ['manager', 'Property Manager', 'Delegated operational management of assigned properties & tickets. ZERO financial access.', 'FULL MOBILE ACCESS (NO FINANCE)'],
      ['staff', 'Maintenance Staff', 'Assigned maintenance work orders, daily schedule, task fee earnings, rating ledger.', 'FULL MOBILE ACCESS (QUEUE ONLY)'],
      ['superadmin', 'Platform Administrator', 'Master directory, subscription tiers, platform invoices, gateway connections, oversight.', 'STRICTLY EXCLUDED FROM MOBILE']
    ],
    { colWidths: [80, 110, 200, 121], boldFirstCol: true }
  );

  b.callout(
    'Superadmin Exclusion Rationale',
    'The Superadmin role oversees platform-wide billing, global database records, landing page CMS configurations, and master user audits. These capabilities require high-density desktop data tables, extensive JSON gateway credential configurations, and administrative oversight consoles that are intentionally inappropriate for mobile handheld form factors.',
    'restriction'
  );

  // ==========================================
  // SECTION 4: ROLE RESPONSIBILITIES
  // ==========================================
  b.h1(4, 'Granular Role Responsibilities & Boundaries');

  b.h2('4.1 Property Owner (Landlord)');
  b.bullet('Purpose', 'Autonomous portfolio management, financial monetization, and legal compliance across owned buildings and tenant leases.');
  b.bullet('Visibility', 'Full visibility into all owned properties, units, tenant directory, active leases, invoices, payment ledger, bank accounts, maintenance queues, staff roster, manager commissions, and landlord reviews.');
  b.bullet('Creation Rights', 'Properties, units, tenancy requests, digital and uploaded lease agreements, invoices, maintenance tickets, staff accounts, manager accounts, building announcements, move-out notices, and cash claims.');
  b.bullet('Approval & Rejection Rights', 'Approve/reject tenant-signed leases, countersign agreements, approve/reject tenant-signed lease renewals, confirm/reject cash claims, approve/reject move-out deposit settlements.');
  b.bullet('Financial Transactions', 'Receive rent & security deposits via gateways/wires/cash; disburse deposit refunds, technician task fees, and property manager monthly compensations.');
  b.bullet('Restrictions', 'Cannot access platform superadmin consoles; cannot delete occupied units without first terminating the active tenancy.');

  b.h2('4.2 Tenant Resident (Renter)');
  b.bullet('Purpose', 'Personal occupancy management, timely rental settlements, maintenance reporting, and lease renewal/vacate coordination.');
  b.bullet('Visibility', 'Personal lease agreement, upcoming rent due cycles, invoice history, payment receipts, maintenance tickets raised by tenant, deposit settlement calculations, and landlord reputation reviews.');
  b.bullet('Creation Rights', 'Maintenance tickets (with issue descriptions & photos), vacate notices, lease renewal requests, cash handover claims (when paying rent in cash), and landlord rating reviews.');
  b.bullet('Approval & Rejection Rights', 'Accept/decline tenancy requests; sign/upload lease agreements; approve/reject/contest move-out deposit deductions; confirm/contest landlord cash refund claims.');
  b.bullet('Financial Transactions', 'Pay rent, security deposits, and tenant-assigned maintenance repair fees via Stripe, Razorpay, PayPal, Bank Wire, or Cash Handover.');
  b.bullet('Restrictions', 'Zero visibility into building financials, other tenants, unassigned property units, staff compensation details, or owner account settings.');

  b.h2('4.3 Delegated Property Manager (Operational Lead)');
  b.bullet('Purpose', 'On-site facility supervision, tenant coordination, and maintenance dispatch on behalf of the property owner.');
  b.bullet('Visibility', 'Assigned properties, unit occupancy status, tenant directory contact information, view-only signed lease agreements, full repair ticket queue, operational disputes, and staff technician availability.');
  b.bullet('Creation Rights', 'Maintenance repair tickets, staff technician assignments, operational notes, and inspection progress notes.');
  b.bullet('Approval Rights', 'Mark maintenance repair tickets as in-progress or resolved; triage emergency work orders.');
  b.callout(
    'Critical Boundary: Zero Financial Access',
    'Property Managers are strictly forbidden from viewing rental revenue, invoice payment statuses, owner bank account details, payment gateway credentials, or security deposit balances. All financial tabs, metrics, and payment triggers are hidden from the manager workspace.',
    'restriction'
  );

  b.h2('4.4 Maintenance Staff (Field Technician)');
  b.bullet('Purpose', 'Field execution of physical building repairs, technical diagnostics, and tenant-facing maintenance resolution.');
  b.bullet('Visibility', 'Only tickets explicitly assigned to this technician (unit address, tenant contact info, issue description, priority, photos), personal schedule, task fee earnings, and tenant satisfaction ratings.');
  b.bullet('Creation & Edit Rights', 'Update ticket status (in_progress, resolved), log technician completion notes, upload repair completion photos, define personal payout bank/UPI details.');
  b.bullet('Financial Transactions', 'Receive task fee payouts from property owner; configure personal payout bank account, UPI ID, or PayPal email.');
  b.bullet('Restrictions', 'Zero visibility into leases, properties not assigned, other technicians’ work orders, tenant rental histories, or building finances.');

  // ==========================================
  // SECTION 5: COMPLETE FEATURE INVENTORY
  // ==========================================
  b.h1(5, 'Complete Feature Inventory');

  b.p('Below is the exhaustive inventory of all functional capabilities verified directly from the Propithub codebase, structured by operational subsystem.');

  const features = [
    {
      sub: '5.1 Authentication & Identity',
      items: [
        ['Email & Password Sign-In', 'Standard credential authentication verifying user role against database.', 'Owner, Tenant, Manager, Staff', 'Interactive'],
        ['Owner Self-Registration', 'Public onboarding capturing owner name, email, password, country, and phone.', 'Public / Owner', 'Interactive'],
        ['Tenant Self-Registration', 'Public onboarding capturing tenant credentials and unassigned directory record.', 'Public / Tenant', 'Interactive'],
        ['Secondary User Provisioning', 'Owner creates Manager/Staff/Tenant with temp credentials and role bindings.', 'Owner', 'Interactive'],
        ['Password Reset Flow', 'Firebase email password reset dispatch.', 'All Roles', 'Interactive'],
        ['Profile & Settings Edit', 'Update display name, contact phone number, and password.', 'All Roles', 'Interactive'],
        ['Notification Preferences', 'Toggle email invoices, maintenance alerts, announcements, and SMS.', 'All Roles', 'Interactive']
      ]
    },
    {
      sub: '5.2 Property & Unit Inventory',
      items: [
        ['Multi-Step Property Creation', 'Wizard: Google Places address, country, currency, building stats, rules.', 'Owner', 'Interactive'],
        ['Amenity Management & Photos', 'Attach building amenities with proof photos (gym, pool, elevator, security).', 'Owner, Manager (View)', 'Interactive'],
        ['House Rules Definition', 'Configure pet policy, smoking, subletting, min lease duration, notice period.', 'Owner', 'Interactive'],
        ['Unit Drafting & Bulk Generation', 'Generate units with floor, sqft, furnishing, rent, deposit, and meters.', 'Owner', 'Interactive'],
        ['Unit Detail & Status Edit', 'Modify unit status (occupied, vacant, reserved, maintenance), meters, photos.', 'Owner', 'Interactive'],
        ['Public Listing Toggle', 'Switch public availability of vacant units with confirmation dialog.', 'Owner', 'Interactive'],
        ['Unit Deletion Safeguard', 'Deletes vacant unit; strictly blocks deletion if status is occupied.', 'Owner', 'Interactive']
      ]
    },
    {
      sub: '5.3 Tenant Directory & Tenant 360',
      items: [
        ['Tenant Roster View', 'Directory of all active and past residents across owned units.', 'Owner, Manager', 'Interactive'],
        ['Resident Provisioning', 'Create tenant login credentials and link to specific vacant unit.', 'Owner', 'Interactive'],
        ['Search & Send Tenancy Request', 'Invite registered user to unit with lease terms and draft agreement PDF.', 'Owner', 'Interactive'],
        ['Tenant KYC Document Verification', 'Review uploaded tenant ID proof, income proof, and toggle verified state.', 'Owner', 'Interactive'],
        ['Tenant History & Multi-Unit Tracker', 'View prior landlord ratings, past tenancies, and multi-unit linkages.', 'Owner', 'Read-Only'],
        ['Vacate / Evict Trigger', 'Initiate move-out workflow directly from tenant profile drawer.', 'Owner', 'Interactive']
      ]
    },
    {
      sub: '5.4 Leasing & Digital Agreement Lifecycle',
      items: [
        ['Digital Agreement Dispatch', 'Create lease agreement with rent, deposit, due day, and template PDF.', 'Owner', 'Interactive'],
        ['Offline Executed Lease Import', 'Import pre-signed paper lease, mark unit occupied, record deposit as paid.', 'Owner', 'Interactive'],
        ['Digital Signature Pad', 'Tenant draws digital signature on canvas; stamped with ISO timestamp.', 'Tenant', 'Interactive'],
        ['Signed Lease Physical Upload', 'Tenant uploads countersigned physical PDF/image agreement document.', 'Tenant', 'Interactive'],
        ['Landlord Countersignature & Approval', 'Owner reviews tenant signature, signs/approves lease, updates unit to occupied.', 'Owner', 'Interactive'],
        ['Official Agreement PDF Download', 'Generate and download legal lease contract with embedded terms & signatures.', 'Owner, Tenant, Manager', 'Interactive']
      ]
    },
    {
      sub: '5.5 Lease Expiration & Renewals',
      items: [
        ['Automated Expiration Tracking', 'Calculates days left on active leases and triggers reminder badges.', 'Owner, Tenant, Manager', 'Read-Only'],
        ['Tenant Renewal Request', 'Tenant requests lease extension with proposed duration and notes.', 'Tenant', 'Interactive'],
        ['Landlord Renewal Offer', 'Owner proposes new rent, rent increase %, term months, and draft contract.', 'Owner', 'Interactive'],
        ['Tenant Renewal Decision', 'Tenant reviews offer: accepts & uploads signed doc, or rejects with reason.', 'Tenant', 'Interactive'],
        ['Renewal Final Approval', 'Owner inspects tenant-signed renewal doc, confirms approval, updates rent.', 'Owner', 'Interactive']
      ]
    },
    {
      sub: '5.6 Move-Out & Security Deposit Settlement',
      items: [
        ['Vacate Notice Initiation', 'Tenant or Owner logs move-out notice with target date and reason.', 'Owner, Tenant', 'Interactive'],
        ['Move-Out Inspection Scheduling', 'Owner schedules physical walk-through and expected refund date.', 'Owner', 'Interactive'],
        ['Amenity Checklist Inspection', 'Verify condition (good/fair/damaged) for walls, electric, plumbing, kitchen.', 'Owner, Manager', 'Interactive'],
        ['Inspection Photo Attachment', 'Upload photographic evidence of damages or fair wear and tear.', 'Owner, Manager', 'Interactive'],
        ['Itemized Deduction Calculation', 'Add deductions with category, amount, reason, and receipt proof URL.', 'Owner', 'Interactive'],
        ['Deposit Settlement Review', 'Tenant reviews net refund vs deductions; approves or contests with notes.', 'Tenant', 'Interactive'],
        ['Tenant Payout Profile Setup', 'Tenant inputs verified payout details (UPI, Bank Wire, ACH, IBAN, PayPal).', 'Tenant', 'Interactive'],
        ['Disbursement Execution', 'Owner disburses refund via gateway, bank wire slip, or cash claim.', 'Owner', 'Interactive'],
        ['Official Settlement Receipt PDF', 'Download comprehensive legal deposit settlement certificate.', 'Owner, Tenant', 'Interactive']
      ]
    },
    {
      sub: '5.7 Invoicing, Billing & Cash Protocol',
      items: [
        ['Rental Invoice Studio', 'Issue custom rental invoices with itemized line items, tax, and late fees.', 'Owner', 'Interactive'],
        ['Late Fee Auto-Calculation', 'Applies percentage or flat penalty after configured grace days.', 'Owner', 'Interactive'],
        ['Online Gateway Checkout', 'Process rent settlement via Stripe (Cards), Razorpay (UPI/Cards), or PayPal.', 'Tenant', 'Interactive'],
        ['Offline Payment Proof Upload', 'Tenant attaches bank transfer receipt, UTR reference number, and date.', 'Tenant', 'Interactive'],
        ['Owner Proof Verification', 'Owner confirms UTR reference match and marks invoice paid.', 'Owner', 'Interactive'],
        ['Cash Handover Claim Protocol', 'Party handing over cash submits claim with location, date, proof, and notes.', 'Owner, Tenant', 'Interactive'],
        ['Counterparty Cash Confirmation', 'Receiving party confirms or rejects cash claim, updating ledger automatically.', 'Owner, Tenant', 'Interactive'],
        ['Official Rental Invoice Document PDF', 'Download tax-compliant formal rental invoice document.', 'Owner, Tenant', 'Interactive']
      ]
    },
    {
      sub: '5.8 Maintenance & Facilities Dispatch',
      items: [
        ['Maintenance Ticket Submission', 'Tenant logs repair issue with category, priority (Low/Med/High), and photos.', 'Tenant', 'Interactive'],
        ['Ticket Triage & Assignment', 'Owner or Manager assigns ticket to staff technician and sets task fee.', 'Owner, Manager', 'Interactive'],
        ['Payer Allocation', 'Determine whether repair fee is billable to Owner or Tenant.', 'Owner, Manager', 'Interactive'],
        ['Technician Work Order Queue', 'Staff technician views assigned jobs, tenant contact phone, and location.', 'Staff', 'Interactive'],
        ['Job Status Progression', 'Technician advances ticket from open to in_progress to resolved.', 'Staff, Owner, Manager', 'Interactive'],
        ['Technician Completion Notes', 'Technician logs resolution summary and attaches proof of repair photo.', 'Staff', 'Interactive'],
        ['Task Fee Payout Recording', 'Owner pays technician via Bank Wire, UPI, PayPal, or Cash.', 'Owner', 'Interactive'],
        ['Resident Rating & Feedback', 'Tenant awards 1-5 stars and feedback review upon ticket resolution.', 'Tenant', 'Interactive']
      ]
    },
    {
      sub: '5.9 Broadcast Communications & Announcements',
      items: [
        ['Building Announcement Composer', 'Owner composes broadcast with category, priority, pin switch, and ack switch.', 'Owner', 'Interactive'],
        ['Audience Scoping Filter', 'Target all properties, specific property, or individual residents/staff.', 'Owner', 'Interactive'],
        ['Multi-Channel Dispatch', 'Synchronous push to In-App notification, SMS (Twilio), and Email (SendGrid).', 'Owner', 'Interactive'],
        ['Tenant Acknowledgment Tracker', 'Residents click "Acknowledge"; owner monitors read and ack audit trail.', 'Owner, Tenant', 'Interactive']
      ]
    },
    {
      sub: '5.10 Disputes & Landlord Reputation',
      items: [
        ['Dispute Filing Engine', 'Tenant logs formal dispute under Payment, Maintenance, Deposit, or Review.', 'Tenant', 'Interactive'],
        ['Evidence Submission', 'Attach documents, invoice numbers, and photos supporting the dispute.', 'Tenant, Owner', 'Interactive'],
        ['Dispute Resolution Workflow', 'Owner issues formal rebuttal, mutual resolution note, or partial refund.', 'Owner', 'Interactive'],
        ['Landlord Reputation Reviews', 'Tenants review verified landlords; public community star ratings.', 'Owner, Tenant', 'Interactive']
      ]
    }
  ];

  features.forEach((group) => {
    b.h2(group.sub);
    b.table(
      ['Feature Action', 'Functional Description', 'Authorized Roles', 'Mobile UX Mode'],
      group.items,
      { colWidths: [130, 200, 110, 71], boldFirstCol: true }
    );
  });

  // ==========================================
  // SECTION 6: COMPLETE SCREEN INVENTORY
  // ==========================================
  b.h1(6, 'Complete Screen Inventory (Platform Baseline)');

  b.p('The existing Propithub web workspace consists of 25 distinct screen views across roles. Below is the comprehensive baseline inventory of every screen, its UI components, interactive actions, and role access.');

  const screens = [
    { role: 'Property Owner', name: 'Owner Dashboard (/owner/dashboard)', elements: 'Property selector, currency selector, reminder hub, 4 KPI cards (Rent collected, expected roll, occupancy %, active tickets), 6-month revenue chart, overdue nudge button, cash claim widgets.' },
    { role: 'Property Owner', name: 'Properties Page (/owner/properties)', elements: 'Sub-tabs (properties vs directory), Add Property wizard modal, unit details modal, unit edit form modal, toggle public listing modal, delete safeguards.' },
    { role: 'Property Owner', name: 'Tenant 360 Page (/owner/tenants)', elements: 'Sub-tabs (active residents vs tenancy requests), provision resident modal, search & send tenancy request modal, KYC documents drawer, lease drawer, vacate button.' },
    { role: 'Property Owner', name: 'Leasing Page (/owner/leasing)', elements: 'Sub-tabs (agreements vs renewals), upload agreement modal, digital dispatch vs offline executed switches, inspect signed doc modal, renewal offer modal, approve renewal modal, PDF download.' },
    { role: 'Property Owner', name: 'Vacates & Move-Outs (/owner/vacates)', elements: 'Notice initiation modal, schedule inspection modal, inspection checklist modal (amenity condition + photo + deduction), refund payout modal (UPI, wire, cheque, cash), recalculate settlement modal.' },
    { role: 'Property Owner', name: 'Payments & Transactions (/owner/payments)', elements: '7 Sub-tabs: rent_due, deposit, transactions, invoices, methods, template, settings. Invoice studio modal, cash claim reconciliation modal, receipt viewer.' },
    { role: 'Property Owner', name: 'Owner Messages (/owner/messages)', elements: 'Sub-tabs (published, scheduled, draft, archived), announcement editor modal (category, priority, scope, ack required, SMS/Email toggles), ack audit table modal.' },
    { role: 'Property Owner', name: 'Maintenance Operations (/owner/maintenance)', elements: 'Sub-tabs (staff roster, tickets queue, task fee payments), onboard staff modal, credentials copy modal, ticket triage modal, mark task paid modal.' },
    { role: 'Property Owner', name: 'Team & Managers (/owner/team)', elements: 'Sub-tabs (managers roster vs manager payouts), add property manager modal, credentials copy modal, pay manager modal (month, amount, UTR ref, notes).' },
    { role: 'Property Owner', name: 'Disputes & Reviews (/owner/disputes)', elements: 'Sub-tabs (disputes vs reviews), resolve dispute modal, issue refund modal, reply to review form, star rating display.' },
    { role: 'Property Owner', name: 'Platform Helpdesk (/owner/helpdesk)', elements: 'Support ticket list, create ticket modal (category, priority, topic, detail), ticket detail drawer, close ticket with notes.' },
    { role: 'Property Owner', name: 'Plan Subscription (/owner/plan)', elements: 'Plan usage cards (properties, units, tenants, staff, managers), change plan modal, payment gateway selector (Stripe, Razorpay, PayPal, Mock), auto-renew switch, platform invoices list.' },
    { role: 'Tenant Resident', name: 'Tenant Dashboard (/tenant/dashboard)', elements: 'Active tenancy card, landlord contact card, reminder hub, tenancy request review banner, building announcements with ack button, cash claim confirm/reject card, deposit settlement review trigger.' },
    { role: 'Tenant Resident', name: 'My Lease Agreement (/tenant/lease)', elements: 'Sub-tabs (active lease vs renewals), initial agreement download, digital signature pad modal, physical signed lease upload modal, vacate notice modal, renewal request modal, 5-step move-out progress tracker.' },
    { role: 'Tenant Resident', name: 'Payments & Invoices (/tenant/payments)', elements: '4 Sub-tabs: rent_due, invoices, ledger, deposit. Pay now checkout modal (Razorpay, Stripe, PayPal, Mock), offline proof upload modal, cash handover claim form, deposit vouchers, settlement review modal.' },
    { role: 'Tenant Resident', name: 'Support & Tickets (/tenant/support)', elements: 'Ticket queue, submit repair ticket modal (issue, category, priority, description), pay repair fee modal (when tenant billable), rate completed repair modal (1-5 stars + text).' },
    { role: 'Tenant Resident', name: 'Landlord Reviews (/tenant/trust)', elements: 'Associated landlord search, write review modal (rating + text), landlord review history, dispute filing trigger.' },
    { role: 'Property Manager', name: 'Manager Dashboard (/manager/dashboard)', elements: 'Assigned property selector, portfolio occupancy KPI, active tickets KPI, manager reminder hub, operational bulletin feed, quick dispatch buttons (ZERO financial widgets).' },
    { role: 'Property Manager', name: 'Managed Properties (/manager/properties)', elements: 'Assigned properties card grid, unit occupancy status list, tenant names, building amenities, house rules.' },
    { role: 'Property Manager', name: 'Lease Documents (/manager/leasing)', elements: 'View-only table of active lease agreements, tenant names, lease start/end, document PDF view/download.' },
    { role: 'Property Manager', name: 'Repair Dispatch (/manager/maintenance)', elements: 'Ticket triage queue, assign technician modal, update ticket status, review technician completion notes.' },
    { role: 'Maintenance Staff', name: 'Staff Dashboard (/staff/dashboard)', elements: 'Assigned ticket queue cards (unit, tenant contact, issue, priority, photos), update status modal (In Progress, Resolved + completion notes), daily work schedule calendar, operational bulletins.' },
    { role: 'Maintenance Staff', name: 'Task Payments (/staff/payments)', elements: 'Configure payout accounts (Bank account, IFSC, UPI ID, PayPal email), task fee earnings ledger, payout receipt viewer.' },
    { role: 'Maintenance Staff', name: 'Staff Ratings (/staff/ratings)', elements: 'Overall technician performance score, rating count, list of resident reviews & feedback comments.' },
    { role: 'Common (All Roles)', name: 'Account Settings (/common/settings)', elements: 'Sub-tabs: profile (name, email, phone), security (change password), notification preferences (email invoices, maintenance, announcements, in-app, SMS).' }
  ];

  b.table(
    ['Role Domain', 'Screen Baseline Name', 'Key UI Components & Interactive Modules'],
    screens.map((s) => [s.role, s.name, s.elements]),
    { colWidths: [95, 140, 276], boldFirstCol: true }
  );

  // ==========================================
  // SECTION 7: ENTITY / RELATIONSHIP MODEL
  // ==========================================
  b.h1(7, 'Entity & Relationship Model');

  b.p('The platform data schema comprises 26 operational collections in Firestore. Below is the structural relationship topology connecting all platform entities.');

  b.h2('7.1 Core Entity Definitions');
  b.bullet('UserProfile', 'Canonical account record. Stores credentials, role, status, ownerId, phone, tempPassword, notificationPreferences.');
  b.bullet('Property', 'Physical real estate asset owned by ownerId. Contains address (Google Places), amenities, rules, assignedManagerId, currency.');
  b.bullet('Unit', 'Individual rentable dwelling bound to propertyId. Contains unitNumber, rent, deposit, status (occupied/vacant/reserved/maintenance), meters.');
  b.bullet('TenantRecord', 'Tenancy profile bound to tenantId. Tracks unitsRented, rental history, rating, KYC document verification records.');
  b.bullet('TenancyRequest', 'Formal invitation sent by owner to tenantId to occupy a unit with proposed rent, deposit, and draft agreement file.');
  b.bullet('Agreement', 'Legal lease contract between ownerId and tenantId for a unit. Tracks executionMode, signatures, documents, and depositStatus.');
  b.bullet('RenewalItem', 'Lease extension record. Tracks proposed rent, percentage increase, tenant signed doc, and owner approval.');
  b.bullet('Invoice', 'Billing demand issued by ownerId to tenantId for rent, deposit, utility, or late fees. Tracks items, tax, status, and payment proof.');
  b.bullet('PaymentTransaction', 'Financial ledger record. Stores amount, currency, direction (inflow vs outflow), method, invoiceId, cashClaimId, audit trail.');
  b.bullet('CashHandoverClaim', 'Dual-party physical cash protocol. Tracks claimedByRole, handoverLocation, proofPhotoUrl, confirmedBy, status.');
  b.bullet('Ticket', 'Maintenance work order raised by tenantId. Tracks issue, priority, assignedStaffId, payer (owner vs tenant), task fee, resident rating.');
  b.bullet('MoveOut', 'Vacate lifecycle record. Contains inspectionChecklist (amenity condition + photos), deductions, expected refund date, status.');
  b.bullet('DepositSettlement', 'Deposit refund agreement. Tracks grossDepositHeld, deductions, netRefundableAmount, chosenPayoutDetails, status.');
  b.bullet('TenantPayoutProfile', 'Tenant bank/UPI destination profile (region: IN, US, UK, EU, GLOBAL).');
  b.bullet('Announcement', 'Broadcast message composed by ownerId. Tracks category, priority, targetScope, and tenant acknowledgments.');
  b.bullet('Dispute', 'Formal grievance filed by tenant or owner. Contains type, detail, evidence, status, and resolution note.');

  b.h2('7.2 Entity Relationship Map (Cardinality)');
  b.keyValueGrid([
    { key: 'UserProfile -> Property', value: '1 : N (Owner owns many Properties)' },
    { key: 'Property -> Unit', value: '1 : N (Property contains many Units)' },
    { key: 'Property -> PropertyManager', value: 'N : 1 (Manager assigned to Property)' },
    { key: 'Unit -> Agreement', value: '1 : N (Unit has historic & active Leases)' },
    { key: 'Agreement -> Invoice', value: '1 : N (Lease generates periodic Invoices)' },
    { key: 'Invoice -> PaymentTransaction', value: '1 : 1 (Paid invoice yields Ledger Txn)' },
    { key: 'CashHandoverClaim -> Transaction', value: '1 : 1 (Confirmed cash yields Ledger Txn)' },
    { key: 'Agreement -> MoveOut', value: '1 : 1 (Lease conclusion triggers MoveOut)' },
    { key: 'MoveOut -> DepositSettlement', value: '1 : 1 (Inspected moveout yields Settlement)' },
    { key: 'Unit -> Ticket', value: '1 : N (Unit generates maintenance Tickets)' },
    { key: 'Ticket -> StaffMember', value: 'N : 1 (Technician assigned to many Tickets)' },
    { key: 'Owner -> Announcement', value: '1 : N (Owner publishes many Bulletins)' },
  ], 2);

  // ==========================================
  // SECTION 8: ROLE × FEATURE PERMISSION MATRIX
  // ==========================================
  b.h1(8, 'Role × Feature Permission Matrix');

  b.p('Legend: V = View, C = Create, E = Edit, D = Delete, A = Approve, R = Reject, P = Pay, RC = Receive, U = Upload, DL = Download.');

  const matrix = [
    ['Property & Unit Creation', 'V, C, E, D', 'None', 'V', 'None'],
    ['Unit Status & Public Listing', 'V, E', 'None', 'V', 'None'],
    ['Tenant Resident Directory', 'V, C, E', 'V (Own)', 'V (Contact)', 'None'],
    ['Tenant KYC Verification', 'V, E, A, R', 'V, U (Own)', 'V', 'None'],
    ['Digital Lease Drafting', 'V, C, E, D', 'None', 'V (Signed)', 'None'],
    ['Lease Signature & Upload', 'V, A, R, DL', 'V, C, U, DL', 'V, DL', 'None'],
    ['Lease Countersigning', 'V, E, A', 'None', 'None', 'None'],
    ['Lease Renewal Offers', 'V, C, E, A', 'V, A, R, U', 'V', 'None'],
    ['Move-Out Notice Initiation', 'V, C, A', 'V, C', 'V', 'None'],
    ['Inspection Checklist & Photos', 'V, C, E, U', 'V (Summary)', 'V, C, E, U', 'None'],
    ['Deposit Settlement & Deductions', 'V, C, E, A, P', 'V, A, R, P', 'None (No Fin)', 'None'],
    ['Tenant Payout Profile Config', 'V (Summary)', 'V, C, E', 'None', 'None'],
    ['Rental Invoicing Studio', 'V, C, E, D', 'V (Own Bills)', 'None (No Fin)', 'None'],
    ['Online Rent Payment Checkout', 'RC', 'V, P, DL', 'None', 'None'],
    ['Offline Proof Upload & UTR', 'V, A, R', 'V, C, U', 'None', 'None'],
    ['Cash Handover Protocol', 'V, C, A, R, P, RC', 'V, C, A, R, P, RC', 'None', 'None'],
    ['Maintenance Ticket Submission', 'V, C, E', 'V, C, U', 'V, C', 'V (Assigned)'],
    ['Ticket Triage & Assignment', 'V, E, A', 'None', 'V, E, A', 'None'],
    ['Technician Work Queue Status', 'V', 'V (Status)', 'V', 'V, E, U (Own)'],
    ['Task Fee Settlement', 'V, C, P', 'V, P (If Billable)', 'None', 'V, RC, E (Acct)'],
    ['Broadcast Announcements', 'V, C, E, D', 'V, A (Ack)', 'V', 'V'],
    ['Disputes & Rebuttals', 'V, E, A, P', 'V, C, U', 'V (Review)', 'None'],
    ['Landlord / Resident Reviews', 'V, C, E', 'V, C', 'V', 'V (Staff Rating)']
  ];

  b.table(
    ['Feature Module / Action', 'Property Owner', 'Tenant Resident', 'Property Manager', 'Maintenance Staff'],
    matrix,
    { colWidths: [155, 90, 85, 90, 91], boldFirstCol: true }
  );
}
