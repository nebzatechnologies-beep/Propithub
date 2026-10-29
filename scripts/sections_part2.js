// Section 9 to 16 Generator Module
export function renderPart2(b) {
  // ==========================================
  // SECTION 9: BUSINESS WORKFLOWS
  // ==========================================
  b.h1(9, 'Comprehensive Business Workflows');

  b.p('Every major and minor platform process follows structured event sequences across triggers, user actions, system operations, state updates, notifications, and branch conditions.');

  const workflows = [
    {
      num: '9.1',
      name: 'Digital Lease Agreement Execution',
      trigger: 'Landlord selects a vacant unit and drafts an agreement or issues a tenancy request.',
      steps: [
        '1. Trigger: Landlord selects vacant unit, chooses tenant, sets rent, deposit, lease start/end, and uploads template PDF.',
        '2. System Action: Generates Agreement record with status "awaiting_tenant_signature" (or "awaiting_tenant_upload"); marks Unit status as "reserved".',
        '3. Notification: Dispatches in-app notification & email alert to Tenant with deep link to review terms.',
        '4. Tenant Action (Branch A - Digital): Tenant opens lease, reviews clauses, and signs via digital signature pad on mobile.',
        '5. Tenant Action (Branch B - Physical): Tenant downloads contract, signs physical document, and uploads camera scan.',
        '6. Status Change: Agreement updates to "pending_countersign" (or "pending_approval"). Landlord notified.',
        '7. Landlord Action: Landlord inspects signature/document, provides counter-signature notes, and clicks "Approve & Execute".',
        '8. Final State: Agreement transitions to "active"; Unit status becomes "occupied"; security deposit invoice auto-generated; countersigned PDF generated.'
      ],
      branches: 'Rejection: Tenant declines request -> Agreement cancelled, Unit reverts to "vacant". Expiration: Lease unsigned after 14 days -> Auto-cancelled.'
    },
    {
      num: '9.2',
      name: 'Offline Executed Lease Onboarding',
      trigger: 'Landlord brings a tenant who already signed a physical lease contract prior to joining Propithub.',
      steps: [
        '1. Trigger: Landlord opens Leasing Hub, selects "Upload Executed Agreement", switches toggle to "Already Executed Offline".',
        '2. User Action: Uploads scan of signed lease, enters tenant details, rent, deposit, start/end dates, and confirms offline deposit collected.',
        '3. System Action: Directly creates Agreement with status "active"; immediately updates Unit to "occupied".',
        '4. System Action: Automatically records PaymentTransaction of type "deposit" marked as "paid" with method "Offline Cash/Wire".',
        '5. System Action: Upserts TenantRecord in directory; generates initial month rental invoice.',
        '6. Final State: Fully active tenancy with reconciled security deposit ledger.'
      ],
      branches: 'Deposit Not Collected: If switch unchecked -> Agreement active, but depositStatus set to "unpaid" and deposit invoice issued.'
    },
    {
      num: '9.3',
      name: 'Rental Invoicing & Online Gateway Payment',
      trigger: 'Scheduled recurring rent billing cycle reached or landlord manually generates rental invoice.',
      steps: [
        '1. Trigger: Invoice generated with status "sent" (or "draft"); includes rent, utility additions, and tax percentage.',
        '2. Notification: Tenant receives in-app bill alert and push notification.',
        '3. Grace Period & Late Fees: If unpaid past due date + grace days (e.g. 5 days), system updates status to "overdue" and applies late fee calculation.',
        '4. Tenant Action: Tenant opens Payments tab, taps "Pay Now", selects Stripe, Razorpay, or PayPal.',
        '5. Payment Processing: Gateway modal collects card/UPI credentials and authorizes transaction.',
        '6. Webhook / Confirmation: Gateway sends success response; system marks Invoice "paid" and creates PaymentTransaction record.',
        '7. Final State: Payment receipt PDF generated; landlord notified; revenue reflected on dashboard.'
      ],
      branches: 'Gateway Failure: Gateway returns error -> Invoice remains "sent" or "overdue"; tenant prompted to retry or use alternative payment method.'
    },
    {
      num: '9.4',
      name: 'Offline Payment Proof Upload & Reconciliation',
      trigger: 'Tenant settles rent via direct bank NEFT/IMPS transfer or standalone UPI QR code.',
      steps: [
        '1. Tenant Action: Tenant makes transfer outside app, opens invoice in app, enters UTR reference number and payment date, attaches receipt screenshot.',
        '2. Status Change: Invoice transitions from "sent" to "pending_confirmation".',
        '3. Notification: Landlord receives urgent reconciliation task in Action Hub.',
        '4. Landlord Action: Landlord checks bank statement; verifies UTR number match.',
        '5. Landlord Decision (Approve): Landlord taps "Confirm Payment" -> Invoice marks "paid", PaymentTransaction recorded.',
        '6. Landlord Decision (Reject): Landlord taps "Reject" -> Enters rejection reason (e.g. "Amount not received"). Invoice reverts to "sent" or "overdue".',
        '7. Final State: Reconciled transaction ledger with verified payment slip attached.'
      ],
      branches: 'Dispute: Tenant contests rejection -> Tenant files Payment dispute in Disputes module with bank stamped statement.'
    },
    {
      num: '9.5',
      name: 'Cash Handover Claim Dual-Confirmation Protocol',
      trigger: 'Tenant pays rent/deposit in cash, or landlord hands cash deposit refund during key handover.',
      steps: [
        '1. Handover Action: Physical cash handed over between Tenant and Landlord.',
        '2. Claim Submission: The party handing over cash submits Cash Claim (specifying direction: Inflow vs Outflow, amount, handover location, witness, proof photo).',
        '3. Status Change: Claim created with status "pending_confirmation"; counterparty receives high-priority action card.',
        '4. Counterparty Verification: Receiving party opens claim, verifies cash count matches.',
        '5. Decision (Confirm): Receiving party clicks "Confirm Receipt" -> Claim marks "confirmed"; system auto-creates PaymentTransaction and marks linked Invoice/Settlement "paid".',
        '6. Decision (Reject): Receiving party clicks "Contest / Reject" -> Enters reason (e.g. "Received ₹10,000 instead of ₹15,000"). Claim marks "rejected".',
        '7. Final State: Downloadable official Cash Handover Receipt PDF generated with dual digital signatures.'
      ],
      branches: 'Partial Cash: Receiving party rejects claim with discrepancy note -> Originating party re-submits corrected amount.'
    },
    {
      num: '9.6',
      name: 'Maintenance Ticket Lifecycle & Facilities Dispatch',
      trigger: 'Resident discovers plumbing leak, electrical failure, or appliance malfunction.',
      steps: [
        '1. Tenant Action: Taps "Raise Ticket", enters issue title, selects category (Plumbing, Electrical, etc.), chooses priority (Low, Med, High), uploads damage photos.',
        '2. Status Change: Ticket created with status "open"; notification sent to Landlord and assigned Property Manager.',
        '3. Manager / Owner Triage: Reviews ticket, selects on-site Staff Technician, specifies payer ("owner" or "tenant"), assigns task fee amount.',
        '4. Status Change: Ticket updates to "assigned"; assignedStaffId bound; technician receives mobile work order.',
        '5. Technician Action (In Progress): Technician arrives at unit, updates status to "in_progress", performs repairs.',
        '6. Technician Action (Resolved): Technician logs completion notes, attaches repair photo, updates status to "resolved".',
        '7. Tenant Verification & Rating: Tenant receives resolution alert, inspects work, awards 1-5 stars and feedback review.',
        '8. Payout Execution: If owner billable, owner records task fee payout to technician.'
      ],
      branches: 'Tenant Billable: If payer set to "tenant", tenant sees "Pay Repair Fee" card in mobile app and pays before closure.'
    },
    {
      num: '9.7',
      name: 'Lease Expiration & Renewal Workflow',
      trigger: 'Active lease approaches expiration date (e.g. 60-90 days remaining).',
      steps: [
        '1. Trigger: Automated reminder hub surfaces upcoming lease expiration to both Landlord and Tenant.',
        '2. Landlord Offer: Landlord initiates renewal offer (current rent, percentage increase, proposed new rent, lease term months, draft agreement attachment).',
        '3. Status Change: Renewal record created with status "renewal_offered". Tenant receives offer sheet.',
        '4. Tenant Review: Tenant inspects terms. Tenant accepts, signs renewal contract, and uploads signed document.',
        '5. Status Change: Renewal status becomes "signed_by_tenant". Landlord notified.',
        '6. Landlord Approval: Landlord inspects signed document, confirms approval -> Agreement updated with new end date; unit rent updated.',
        '7. Final State: Renewal status becomes "accepted" (or "auto_renew_set"). Tenancy continuity preserved.'
      ],
      branches: 'Tenant Rejection: Tenant declines offer with counter-notes -> Landlord can revise offer or initiate Vacate Notice.'
    },
    {
      num: '9.8',
      name: 'Move-Out Notice, Inspection & Deposit Settlement',
      trigger: 'Tenant or Landlord initiates vacate notice concluding tenancy tenure.',
      steps: [
        '1. Notice Initiation: Tenant logs vacate notice with intended move-out date; MoveOut record created with status "requested".',
        '2. Inspection Scheduling: Landlord sets physical inspection date and target refund date; status becomes "inspection_scheduled".',
        '3. Physical Inspection: Landlord/Manager walks through unit, verifies checklist (walls, electric, plumbing, kitchen), notes damages, uploads condition photos.',
        '4. Deduction Calculation: Landlord calculates damages & utility arrears, submits itemized deductions; status becomes "inspected".',
        '5. Deposit Settlement Creation: System drafts DepositSettlement (gross deposit minus deductions = net refundable amount); status "awaiting_tenant_approval".',
        '6. Tenant Review: Tenant reviews deductions on mobile. Tenant approves settlement and provides payout details (UPI, bank wire, or PayPal).',
        '7. Disbursement: Landlord executes payment via chosen payout route, attaches transfer reference; status becomes "refund_completed".',
        '8. Final State: Unit marked "vacant"; tenant occupancy ended; official Settlement Receipt PDF generated.'
      ],
      branches: 'Contested Deductions: Tenant rejects deductions with rebuttal -> Status becomes "contested"; Landlord recalculates settlement.'
    }
  ];

  workflows.forEach((wf) => {
    b.h2(`${wf.num} ${wf.name}`);
    b.p(wf.trigger, { italic: true });
    wf.steps.forEach((s) => b.bullet('', s));
    b.callout('Exception & Branch Handling', wf.branches, 'amber');
  });

  // ==========================================
  // SECTION 10: STATUS & STATE TRANSITIONS
  // ==========================================
  b.h1(10, 'Status & State Transition System');

  b.p('State machines govern entity lifecycles across the platform. Below are the verified operational states, permitted transitions, and terminal boundaries.');

  b.h2('10.1 Unit Status Lifecycle');
  b.table(
    ['State', 'Description', 'Permitted Next States', 'Terminal?'],
    [
      ['vacant', 'Unit is unoccupied and available for tenancy.', 'reserved, maintenance', 'No'],
      ['reserved', 'Lease drafted / tenancy request sent; awaiting signature.', 'occupied, vacant', 'No'],
      ['occupied', 'Tenant actively residing with executed active lease.', 'maintenance, vacant', 'No'],
      ['maintenance', 'Unit undergoing repairs or renovation; unrentable.', 'vacant, occupied', 'No']
    ],
    { colWidths: [80, 200, 160, 71], boldFirstCol: true }
  );

  b.h2('10.2 Agreement (Lease) Status Lifecycle');
  b.table(
    ['State', 'Description', 'Permitted Next States', 'Terminal?'],
    [
      ['draft', 'Initial contract drafting in progress.', 'awaiting_tenant_signature, awaiting_tenant_upload', 'No'],
      ['awaiting_tenant_signature', 'Digital lease dispatched to tenant mobile.', 'pending_countersign, draft', 'No'],
      ['awaiting_tenant_upload', 'Contract dispatched; awaiting tenant physical upload.', 'pending_approval, draft', 'No'],
      ['pending_countersign', 'Tenant signed digitally; awaiting owner countersign.', 'active, draft', 'No'],
      ['pending_approval', 'Tenant uploaded signed doc; awaiting owner approval.', 'active, draft', 'No'],
      ['active', 'Executed legally binding lease; rent roll active.', 'terminated', 'No'],
      ['terminated', 'Tenancy concluded, move-out completed or evicted.', 'None (Historical Archive)', 'Yes']
    ],
    { colWidths: [120, 175, 145, 71], boldFirstCol: true }
  );

  b.h2('10.3 Invoice Status Lifecycle');
  b.table(
    ['State', 'Description', 'Permitted Next States', 'Terminal?'],
    [
      ['draft', 'Unissued invoice stored in billing studio.', 'sent, cancelled', 'No'],
      ['sent', 'Delivered to tenant; awaiting payment.', 'paid, overdue, pending_confirmation, cancelled', 'No'],
      ['overdue', 'Unpaid past due date + grace days; late fees applied.', 'paid, pending_confirmation, cancelled', 'No'],
      ['pending_confirmation', 'Offline transfer proof or cash claim submitted.', 'paid, sent, overdue', 'No'],
      ['paid', 'Payment settled and reconciled in ledger.', 'refunded', 'Yes (Unless Refunded)'],
      ['refunded', 'Payment refunded back to tenant.', 'None', 'Yes'],
      ['cancelled', 'Invoice voided prior to settlement.', 'None', 'Yes']
    ],
    { colWidths: [110, 175, 155, 71], boldFirstCol: true }
  );

  b.h2('10.4 Maintenance Ticket Status Lifecycle');
  b.table(
    ['State', 'Description', 'Permitted Next States', 'Terminal?'],
    [
      ['open', 'Ticket submitted by resident; unassigned.', 'assigned, resolved', 'No'],
      ['assigned', 'Technician selected; task fee configured.', 'in_progress, resolved, open', 'No'],
      ['in_progress', 'Technician on-site performing diagnostic / repair.', 'resolved, assigned', 'No'],
      ['resolved', 'Repair finished; completion notes & photos attached.', 'None (Rated by Tenant)', 'Yes']
    ],
    { colWidths: [90, 195, 155, 71], boldFirstCol: true }
  );

  b.h2('10.5 Move-Out & Deposit Settlement Lifecycle');
  b.table(
    ['State', 'Description', 'Permitted Next States', 'Terminal?'],
    [
      ['requested', 'Vacate notice logged; target date registered.', 'inspection_scheduled', 'No'],
      ['inspection_scheduled', 'Physical walk-through date booked.', 'inspected', 'No'],
      ['inspected', 'Amenity checklist verified; deductions calculated.', 'refund_scheduled', 'No'],
      ['refund_scheduled', 'Deposit settlement created; awaiting tenant review.', 'refund_completed', 'No'],
      ['refund_completed', 'Net refund disbursed; unit vacated and freed.', 'None', 'Yes']
    ],
    { colWidths: [115, 175, 140, 81], boldFirstCol: true }
  );

  // ==========================================
  // SECTION 11: NOTIFICATION SYSTEM
  // ==========================================
  b.h1(11, 'Notification & Communication System');

  b.p('Propithub incorporates a multi-tier notification engine routing alerts across four channels: In-App Badges/Banners, Mobile Push Notifications, SMS via Twilio, and Email via SendGrid.');

  b.table(
    ['Event Trigger', 'Recipient', 'Channels', 'Message Purpose & Mobile Action'],
    [
      ['Tenancy Request Dispatched', 'Tenant', 'In-App, Push, Email', 'Invites tenant to review proposed lease terms; opens request modal.'],
      ['Lease Signed by Tenant', 'Owner', 'In-App, Push', 'Alerts landlord to inspect signature and provide countersignature.'],
      ['Lease Countersigned / Active', 'Tenant', 'In-App, Push, Email', 'Notifies tenant lease is fully executed; provides agreement PDF.'],
      ['Rent Invoice Issued', 'Tenant', 'In-App, Push, Email', 'Delivers rental demand with itemized breakdown; opens Pay Now.'],
      ['Rent Overdue / Delinquency', 'Tenant', 'In-App, Push, SMS', 'Warns tenant of grace period expiry and late fee penalties.'],
      ['Offline Payment Proof Uploaded', 'Owner', 'In-App, Push', 'Prompts owner to reconcile UTR reference against bank records.'],
      ['Cash Handover Claim Created', 'Recipient', 'In-App, Push', 'High-priority card requiring recipient to confirm physical cash count.'],
      ['Maintenance Ticket Submitted', 'Owner, Manager', 'In-App, Push', 'Alerts management to dispatch staff technician to unit.'],
      ['Technician Work Order Assigned', 'Staff', 'In-App, Push', 'Adds repair job to technician mobile queue with unit address.'],
      ['Repair Completed', 'Tenant', 'In-App, Push', 'Requests resident verification and 1-5 star quality rating.'],
      ['Vacate Notice Submitted', 'Owner', 'In-App, Push', 'Prompts landlord to book physical move-out inspection.'],
      ['Deposit Settlement Prepared', 'Tenant', 'In-App, Push, Email', 'Requests tenant review of deductions and payout profile setup.'],
      ['Deposit Refund Disbursed', 'Tenant', 'In-App, Push, Email', 'Delivers final deposit settlement voucher and wire reference.'],
      ['Emergency Building Announcement', 'All Residents', 'In-App, Push, SMS', 'Urgent building bulletin requiring mandatory read acknowledgment.']
    ],
    { colWidths: [115, 75, 95, 226], boldFirstCol: true }
  );

  // ==========================================
  // SECTION 12: PAYMENT & FINANCIAL FLOWS
  // ==========================================
  b.h1(12, 'Payment & Financial Workflows');

  b.p('Propithub distinguishes cleanly between business ownership of funds and technical payment processing. All rental revenue and security deposits flow directly between tenant and property owner without platform intermediaries holding custody.');

  b.h2('12.1 Financial Movement Topology');
  b.keyValueGrid([
    { key: 'Inflow: Rent Payments', value: 'Tenant -> Owner (Stripe / Razorpay / PayPal / Wire / Cash)' },
    { key: 'Inflow: Security Deposit', value: 'Tenant -> Owner Trust Account (Settled upon lease execution)' },
    { key: 'Inflow: Tenant Repair Fees', value: 'Tenant -> Owner / Staff (If maintenance is tenant-billable)' },
    { key: 'Outflow: Deposit Refunds', value: 'Owner -> Tenant (Post move-out deduction settlement)' },
    { key: 'Outflow: Staff Task Fees', value: 'Owner -> Staff Technician (Per completed maintenance work order)' },
    { key: 'Outflow: Manager Payouts', value: 'Owner -> Property Manager (Monthly operational compensation)' },
  ], 2);

  b.h2('12.2 Multi-Gateway Architecture');
  b.bullet('Stripe Connect', 'Global credit/debit card processing in USD/EUR/GBP. Instant webhook reconciliation.');
  b.bullet('Razorpay', 'Domestic Indian payment gateway supporting UPI (Google Pay, PhonePe, Paytm), Netbanking, and domestic RuPay/Visa cards.');
  b.bullet('PayPal International', 'Cross-border wallet settlement and authorized card processing.');
  b.bullet('Direct Bank Wire / NEFT / IMPS', 'Displays owner account number, routing code, and IFSC; tenant attaches UTR reference slip.');
  b.bullet('Dual-Party Cash Protocol', 'Physical cash exchange tracked with location, date, photos, and counterparty confirmation.');

  b.h2('12.3 Late Fee & Tax Calculation Engines');
  b.bullet('Late Fee Engine', 'Owner defines graceDays (e.g. 5 days), type ("percent" vs "flat"), value (e.g. 2% or ₹500), and cap (e.g. ₹1,000 max). Automatically appended to overdue invoices.');
  b.bullet('Tax Engine', 'Configurable taxLabel (e.g. "GST", "VAT", "Service Tax") and percent (e.g. 18%). Auto-calculated on invoice line items.');

  // ==========================================
  // SECTION 13: DOCUMENT MANAGEMENT
  // ==========================================
  b.h1(13, 'Document Management & Legal Artifacts');

  b.p('The platform manages legal documents, photographic records, and verified proofs. Below is the complete catalog of managed documents and their lifecycle states.');

  b.table(
    ['Document Type', 'Originator', 'Reviewer', 'Storage Format', 'Downloadable PDF?'],
    [
      ['Draft Lease Agreement', 'Owner', 'Tenant', 'PDF / Data URL', 'Yes (Official Agreement)'],
      ['Tenant Signed Lease', 'Tenant', 'Owner', 'Canvas PNG / Uploaded PDF', 'Yes (With Signature)'],
      ['Countersigned Final Lease', 'Owner', 'Tenant, Manager', 'Flattened Vector PDF', 'Yes (Complete Legal Contract)'],
      ['Rental Invoice Document', 'Owner / System', 'Tenant', 'Formatted Vector PDF', 'Yes (Tax Invoice)'],
      ['Offline Payment Proof Slip', 'Tenant', 'Owner', 'Image JPG/PNG / PDF', 'Yes (Attached Slip)'],
      ['Cash Handover Receipt', 'System', 'Owner, Tenant', 'Generated Legal PDF', 'Yes (Signed Receipt)'],
      ['Move-Out Inspection Checklist', 'Owner / Manager', 'Tenant', 'Checklist + Damage Photos', 'Yes (Inspection Report)'],
      ['Deposit Settlement Voucher', 'Owner / System', 'Tenant', 'Itemized Statement PDF', 'Yes (Settlement Certificate)'],
      ['Tenant KYC Identification', 'Tenant', 'Owner', 'Government ID Scan / Photo', 'Yes (Verified Attachment)']
    ],
    { colWidths: [130, 80, 85, 115, 101], boldFirstCol: true }
  );

  // ==========================================
  // SECTION 14: MOBILE APPLICATION SCOPE
  // ==========================================
  b.h1(14, 'Mobile Application Scope & Architecture');

  b.p('The unified mobile application is designed as a single native-compiled application supporting all four non-admin roles: Property Owner, Tenant Resident, Delegated Property Manager, and Maintenance Staff.');

  b.h2('14.1 Role Detection & Dynamic Workspace Routing');
  b.bullet('Unified Auth Gateway', 'Single sign-in screen accepting registered email and password. No separate app downloads required.');
  b.bullet('Profile Resolution', 'Upon credential verification, mobile app queries users/{uid}. Resolves role attribute (owner, tenant, manager, staff).');
  b.bullet('Dynamic Navigation Switcher', 'Mounts the appropriate role layout: Owner Workspace, Tenant Workspace, Manager Workspace, or Staff Workspace.');
  b.bullet('Role Switching Support', 'If a user account holds dual identities (e.g. a landlord who also rents an apartment elsewhere), the user profile menu exposes "Switch Workspace" to toggle operational modes without logging out.');

  b.h2('14.2 Offline Field Operation & Local Caching');
  b.bullet('Technician Offline Queue', 'Staff technicians can view today’s jobs and draft completion notes in low-connectivity building basements.');
  b.bullet('Optimistic State Updates', 'UI updates instantly upon button click; background sync reconciles with Firestore upon reconnection.');
  b.bullet('Biometric Authentication', 'Supports FaceID / TouchID / Fingerprint unlock for rapid re-entry without retyping credentials.');

  // ==========================================
  // SECTION 15: MOBILE INFORMATION ARCHITECTURE
  // ==========================================
  b.h1(15, 'Mobile Information Architecture (IA)');

  b.p('The mobile navigation architecture utilizes standard bottom tab navigation tailored dynamically to each user role, paired with a contextual top app bar, global notification center, and profile drawer.');

  b.h2('15.1 Role Bottom Tab Configurations');
  b.table(
    ['User Role', 'Tab 1 (Home)', 'Tab 2', 'Tab 3', 'Tab 4', 'Top Right Actions'],
    [
      ['Property Owner', 'Overview / Hub', 'Properties & Units', 'Leasing & Vacates', 'Transactions & Invoices', 'Currency Converter, Notifications, Profile'],
      ['Tenant Resident', 'Home & Hub', 'My Lease & Renewals', 'Payments & Bills', 'Maintenance & Support', 'Currency Converter, Notifications, Profile'],
      ['Property Manager', 'Operations Hub', 'Managed Properties', 'Repair Dispatch', 'Lease Documents', 'Notifications, Profile (No Currency/Finance)'],
      ['Maintenance Staff', 'Job Queue', 'Daily Schedule', 'Task Earnings', 'Quality Ratings', 'Notifications, Profile (No Finance)']
    ],
    { colWidths: [90, 85, 95, 105, 95, 41], boldFirstCol: true }
  );

  // ==========================================
  // SECTION 16: NAVIGATION ARCHITECTURE
  // ==========================================
  b.h1(16, 'Navigation Architecture & Transitions');

  b.bullet('Root Level', 'Splash Screen -> Auth Guard -> Dynamic Role Router -> Role Workspace Shell.');
  b.bullet('Modal Sheets', 'Forms requiring high focus (Add Property, Pay Now, Submit Ticket, Cash Claim) open as draggable bottom sheets.');
  b.bullet('Deep Linking', 'Push notifications link directly to target entity screens (e.g. tapping "Invoice Sent" opens invoice pay sheet).');
  b.bullet('Back Stack Handling', 'Strict hardware and gesture back navigation returning to parent tab root before triggering app exit.');
}
