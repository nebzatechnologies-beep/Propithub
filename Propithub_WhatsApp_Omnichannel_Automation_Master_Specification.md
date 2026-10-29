# Propithub: WhatsApp Omnichannel Automation Master Specification
**Comprehensive End-to-End Operational Blueprint & Edge Case Matrix**  
*Document Version: 2.0 • Status: Production Specification • Non-Destructive Tri-Channel Layer*

---

## 1. Executive Summary & Architectural Philosophy

The **Propithub WhatsApp Automation Engine** transforms WhatsApp into a complete, real-time operating system for real estate operations alongside the existing React Web Platform and Mobile Apps. 

### Core Architectural Rules:
1. **Tri-Channel Non-Destructive Superpower**: The existing React Web App (`https://propithub.web.app`) and Mobile App remain 100% active. WhatsApp communicates directly with the same underlying **Google Cloud Firestore** database in real time.
2. **Single Central Business Number**: All 4 user roles (Owners, Tenants, Managers, Staff) and prospective leads communicate through **one single verified WhatsApp Business number**. Landlords' private phone numbers are strictly protected and never exposed.
3. **Dynamic Owner-Configured Payment Resolution**: Rent and deposit demands dynamically resolve to whichever payment gateway that specific unit's owner has configured in Firestore (`resolveGatewayConfig(ownerId)` — Razorpay UPI, Stripe, Bank Transfer, or Cash Handover).
4. **Zero Automated Dispute Engine**: Per platform design, there are no bot-arbitrated disputes. Any resident billing questions or maintenance queries route directly to the designated human Property Manager.
5. **Role-Based Security & Financial Perimeters**:
   - **Owners**: Full portfolio authority, banking configuration, subscription tier, and payout tracking.
   - **Tenants**: KYC, lease signing, rent payment via owner gateway, repair voice notes, move-out settlement.
   - **Managers**: Operational oversight, technician dispatch, unit inspections, and lease tracking with **strict zero-access** to owner bank credentials or revenue.
   - **Staff**: Mobile-first dispatch queue, 1-tap progress updates, completion proof photos, and instant UPI task fee payout receipts.

---

## 2. Infrastructure & Technical Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │               Meta WhatsApp Cloud API                   │
                    │      (Inbound Webhooks & Outbound Interactive MSGs)     │
                    └────────────────────────────┬────────────────────────────┘
                                                 │ HTTPS POST (Signature Verified)
                                                 ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │       Firebase Cloud Functions (Node.js 20)             │
                    │               whatsappWebhook Endpoint                  │
                    └─────────┬──────────────────────┬──────────────────────┬─┘
                              │                      │                      │
                 HMAC-SHA256  │        Session State │       Multimodal AI  │
                 Verification │          Persistence │          Processing  │
                              ▼                      ▼                      ▼
                    ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
                    │ Security Filter  │   │ /whatsappSessions│   │ Vertex AI /      │
                    │ (Meta App Secret)│   │  (TTL: 24 Hours) │   │ Gemini 1.5 Flash │
                    └──────────────────┘   └─────────┬────────┘   └─────────┬────────┘
                                                     │                      │
                                                     ▼                      ▼
                    ┌─────────────────────────────────────────────────────────────────┐
                    │                  Core Firestore Database                        │
                    │  /users • /properties • /units • /agreements • /invoices        │
                    │  /tickets • /propertyInspections • /transactions • /moveouts    │
                    └─────────────────────────────────────────────────────────────────┘
```

### 2.1 Webhook Handshake & Security
* **Verification Challenge**: `GET /whatsappWebhook` validates `hub.mode === 'subscribe'` and `hub.verify_token === config.whatsappVerifyToken`.
* **HMAC Signature Check**: `POST /whatsappWebhook` inspects the `X-Hub-Signature-256` header, hashing the raw request body with the platform's `whatsappAppSecret`. Unverified payloads are discarded instantly with HTTP 403.
* **Idempotency Safeguard**: Every incoming message ID (`entry[0].changes[0].value.messages[0].id`) is checked against `/processedWhatsAppMessages/{messageId}` to prevent duplicate processing from Meta retries.

### 2.2 The Session State Machine (`/whatsappSessions/{phone}`)
Multi-step conversational flows (such as property creation, KYC submission, and ticket assignment) are tracked in a transient Firestore session document:
```typescript
interface WhatsAppSession {
  phone: string;              // E.164 formatted sender phone (+91...)
  userId?: string;            // Resolved Firestore UID
  role: 'owner' | 'tenant' | 'manager' | 'staff' | 'lead';
  activeFlow?: 'onboarding' | 'unit_create' | 'kyc_upload' | 'ticket_dispatch' | 'cash_claim' | 'inspection_log';
  flowStep: number;
  flowData: Record<string, any>; // Temporary data accumulator
  lastInteractionAt: string;  // ISO timestamp (triggers 24h window expiry)
}
```

### 2.3 Sender Role Resolver Matrix
When a message arrives, the engine queries Firestore `/users` by phone number:
1. **Single Match**: Automatically authenticates session as Owner, Tenant, Manager, or Staff.
2. **Multiple Roles** (e.g. A user is both an Owner and a Tenant in another building): Bot presents a 1-tap interactive menu: `[👔 Landlord Portal]` vs `[👤 Resident Portal]`.
3. **No Match**: Automatically initiates the **Role Qualification Flow** (*"Welcome to Propithub! Are you a Property Owner or looking to Rent?"*).

### 2.4 Multimodal Gemini 1.5 Flash Processing
* **Voice Notes (Audio .ogg/.mp4)**: Sent directly to Gemini API with prompt: *"Extract property maintenance issue, urgency level, and asset involved from this voice recording."*
* **Photos & Documents (.jpg/.png/.pdf)**:
  * KYC: OCR extracts Name, Document Number (Aadhaar/Passport), and Expiration Date.
  * Inspections: Analyzes room cleanliness, wall paint, and fixture condition.
  * Repairs: Compares pre-repair vs post-repair images to verify plumbing/electrical completion.

---

## 3. Owner Full Lifecycle Workflows & Edge Cases

### Flow 3.1: Inbound Lead Qualification & Onboarding
1. **Trigger**: User clicks a *"Message on WhatsApp"* ad or marketing link (`wa.me/number?text=Hi_Propithub`).
2. **Bot Prompt**: Presents interactive buttons: `[👔 I am a Property Owner]` | `[👤 I am a Tenant]`.
3. **User Action**: Taps `[👔 I am a Property Owner]`.
4. **Data Action**: System initializes 14-Day Free Trial record in `/users` and `/owners/{ownerId}` with `planStatus: 'trialing'`.
5. **Edge Case - User already has an account**: If sender's phone exists in `/users`, bot bypasses registration and welcomes them back with their current portfolio occupancy.

### Flow 3.2: Conversational Property & Unit Creation
1. **Owner Prompt**: Owner texts *"Add 5 flats at Sunrise Heights, Bengaluru"*.
2. **Gemini Extraction**:
   * Property Name: `Sunrise Heights`
   * City: `Bengaluru`
   * Total Units: `5`
3. **Bot Confirmation**: Bot asks: *"What is the standard monthly rent and deposit per flat?"*
4. **Owner Reply**: *"₹25,000 rent and ₹80,000 deposit"*.
5. **Execution**: Cloud Function provisions the Property in `/properties` and generates 5 units (`101`, `102`, `103`, `104`, `105`) in `/units`.
6. **Edge Case - Mixed Pricing**: If flats have different rents (e.g., 2BHK vs 3BHK), the bot presents interactive quick-edit buttons per unit.

### Flow 3.3: Tenant Invitation & 1-Click Lease Issuance
1. **Owner Trigger**: Owner texts *"Onboard tenant Rahul Sharma +919876543210 for Flat 101"*.
2. **System Action**: 
   * Pre-fills lease draft in `/agreements` with term: 12 months, rent: ₹25,000, deposit: ₹80,000.
   * Dispatches WhatsApp invite to Rahul with interactive onboarding link.
3. **Owner Alert**: Once tenant signs, owner receives WhatsApp alert with executed agreement PDF: `[✅ Approve & Counter-Sign]` | `[❌ Request Revision]`.
4. **1-Tap Counter-Sign**: Owner taps Approve; status updates to `'signed'`, generating initial deposit & rent invoices.

### Flow 3.4: Dynamic Gateway Rent Tracking & Reconciliation
1. **Invoice Due Alert**: WhatsApp alerts owner: *"Rent demand of ₹25,000 sent to Rahul (Flat 101) via your active Razorpay UPI gateway."*
2. **Payment Confirmation**: When tenant pays online, webhook triggers instant owner receipt:
   * *"🎉 Rent Received! ₹25,000 credited to your Razorpay account. Flat 101 is marked PAID for November."*
3. **Cash Handover Reconciliation (Edge Case)**:
   * If tenant hands physical cash to landlord or on-site staff, tenant taps *"Claim Cash Handover"* in WhatsApp.
   * Owner receives interactive approval card: *"Rahul claims cash payment of ₹25,000 for Flat 101."*
   * Buttons: `[✅ Confirm Cash Received]` | `[❌ Deny Claim]`.
   * Tapping Confirm instantly marks the invoice `'paid'`, logs transaction in `/transactions`, and sends official PDF receipt to tenant.

### Flow 3.5: Voice Note Maintenance Triage & Dispatch
1. **Alert Received**: Owner gets ping: *"New Emergency Maintenance Ticket #TKT-882 (Flat 302 - Kitchen Pipe Leak). Listen to audio voice note: [▶️ Audio 0:12]"*
2. **1-Tap Dispatch**: Bot lists assigned team: `[👨‍🔧 Ramesh (Plumber)]` | `[⚡ Suresh (Electrician)]`.
3. **Cost Allocation**: Bot asks: *"Who pays for this repair?"*
   * `[🏢 Owner Paid (₹500)]` | `[👤 Tenant Paid (₹500)]`.
4. **Resolution**: Once technician submits completion photo, owner receives verification card and digital sign-off button.

### Flow 3.6: Move-Out Notice & Net Deposit Settlement
1. **Notice Alert**: Owner alerted 30 days prior: *"Rahul (Flat 302) submitted vacation notice for Dec 31."*
2. **Inspection Summary**: Manager uploads checkout inspection notes showing ₹3,000 cabinet damage.
3. **Math Breakdown in Chat**:
   * Initial Deposit: ₹80,000
   * Less Deductions: ₹3,000
   * **Net Refund Due: ₹77,000**
4. **Payout Execution**: Owner confirms payout; WhatsApp sends final statement PDF to resident and archives tenancy.

### Flow 3.7: 14-Day Free Trial Expiry & Plan Upgrade
1. **Day 11 Warning**: *"Your Propithub Free Trial expires in 3 days. Upgrade to Starter ($29/mo) to keep automated rent reminders and lease tracking active."*
2. **1-Tap Upgrade**: Tapping `[💳 Upgrade Plan]` opens Stripe/Razorpay checkout link pre-filled with owner details.

---

## 4. Tenant Full Lifecycle Workflows & Edge Cases

### Flow 4.1: KYC Identification Upload
1. **Onboarding Prompt**: *"Welcome Rahul! To complete your lease for Flat 302, please send a photo of your Aadhaar Card, Passport, or Driving License."*
2. **Resident Action**: Takes photo of ID card and sends image in WhatsApp.
3. **Gemini OCR Verification**: Extracts legal name, document number, and verifies image clarity. Saves file to Firebase Storage (`/kyc/`).
4. **Edge Case - Blurry Image**: If image quality is poor, bot replies: *"Image was too blurry to read document number. Please re-snap in good lighting."*

### Flow 4.2: Lease Review & 1-Tap Digital Signing
1. **Document Dispatch**: Bot sends agreement PDF attachment directly into chat: `Executed_Lease_Draft_Flat302.pdf`.
2. **Term Summary**: Displays Rent: ₹25,000, Deposit: ₹80,000, Term: Nov 1, 2026 – Oct 31, 2027.
3. **Interactive Sign**: Buttons: `[✍️ Tap to Digitally Sign]` | `[📄 Request Change]`.
4. **Signature Stamp**: Tapping sign captures timestamp, sender phone, and IP, recording digital consent into `/agreements/{id}`.

### Flow 4.3: Rent Payment via Owner's Configured Gateway
1. **Bill Demand**: On the 1st of each month, tenant receives:
   * *"Hello Rahul, rent of ₹25,000 for Flat 302 is due by Nov 5th."*
2. **Dynamic Routing**:
   * If Owner uses **Razorpay**: Message includes UPI Intent link (`upi://pay?pa=owner@upi...`) enabling 1-tap Google Pay / PhonePe / Paytm checkout.
   * If Owner uses **Stripe**: Message includes encrypted Stripe hosted checkout link.
   * If Owner uses **Bank Transfer**: Message displays bank account number, IFSC, and routing details.
   * If Owner uses **Cash**: Message provides button `[💵 I will pay Cash]`.
3. **Autopay Mandate (Optional)**: Message offers `[🔄 Enable Auto-Debit Every Month]`. Tapping sets up recurring mandate via Stripe SetupIntent or Razorpay Mandate.

### Flow 4.4: Late Fee Escalation (Edge Case)
1. **Grace Period**: Owner allows 5 grace days. On Day 6, invoice automatically increments per owner's late fee policy (e.g. +₹500 flat or +2% daily).
2. **WhatsApp Alert**: *"Notice: Rent for Flat 302 is past due. A late fee of ₹500 has been added per your lease agreement. Revised Total: ₹25,500."*

### Flow 4.5: Voice Note / Photo Maintenance Requests
1. **Submission**: Tenant sends voice note in any language: *"Kitchen sink tap toot gaya hai, paani beh raha hai."* + attaches a photo.
2. **AI Categorization**:
   * Category: `Plumbing`
   * Priority: `High`
   * Transcription: *"Kitchen sink tap broken, water flowing."*
3. **Confirmation**: *"🔧 Work order #TKT-882 created. Your property manager has been alerted."*
4. **Live ETA**: When technician is assigned, tenant receives: *"Plumber Ramesh (+91 98221 00000) is en route. ETA: 15 minutes."*

### Flow 4.6: Zero Dispute Protocol (Edge Case)
* **Resident Inquiry**: Tenant texts *"Why is there a ₹400 extra charge on my bill?"*
* **Architectural Action**: The bot **does not** arbitrate or guess. It immediately responds:
  * *"I have connected you directly with your Property Manager, Rajesh (+91 98765 00000). He will message you right away to clarify."*
  * Dispatches alert card to Rajesh's WhatsApp with full context.

---

## 5. Property Manager Workflows & Edge Cases

### Flow 5.1: 8:00 AM Daily Operations Briefing
1. **Morning Digest**: At 8:00 AM, the bot sends an automated executive summary:
   * *"🏢 Good morning Manager Rajesh! Sunrise Heights Status:*
     - *Occupancy: 92% (23 Occupied, 2 Vacant)*
     - *Open Urgent Repairs: 2 Tickets*
     - *Leases Expiring in 30 Days: 1 (Flat 204)*
     - *Unassigned Work Orders: 1"*
   * Buttons: `[🔧 Dispatch Repairs]` | `[📋 View Vacant Units]` | `[📄 Expiring Leases]`.
2. **Zero Financial Access Guardrail**: If manager asks *"Show me owner earnings or bank balance"*, the bot responds: *"🔒 Financial accounts and payout credentials are strictly restricted to the Portfolio Owner."*

### Flow 5.2: Work Order Dispatch & Cost Allocation
1. **Incoming Ticket Alert**: Manager gets notified of tenant's broken tap.
2. **Technician Selector**: Interactive menu lists active staff: `[👨‍🔧 Ramesh (Plumber)]` | `[⚡ Suresh (Electrician)]`.
3. **Payer Allocation**: Manager taps `[🏢 Owner Paid (₹500)]` or `[👤 Tenant Paid (₹500)]`.
4. **Sync**: Ticket in `/tickets` updates with `assignedStaffId`, triggering instant WhatsApp dispatch to the technician.

### Flow 5.3: On-Site Room Inspection Logging
1. **Walk-through**: Manager walks into vacant Flat 401 and texts: *"Inspection Unit 401: Routine move-in check. All wall paints fresh, AC serviced, faucet checked. Condition Good."*
2. **Photo Request**: Bot prompts: *"Please upload 1-3 walk-through photos."*
3. **Manager Uploads**: Snaps 2 photos of living room and master bath.
4. **Audit Trail**: New document written to `/propertyInspections` in Firestore with photos, inspector UID, and timestamp.

### Flow 5.4: Public Vacancy Listing Toggle
* Manager texts *"List Flat 401 publicly"*.
* Bot updates `units/401` with `isListedPublicly: true` and confirms: *"Flat 401 is now live on the public rental directory."*

---

## 6. Maintenance Staff / Technician Workflows & Edge Cases

### Flow 6.1: Instant Dispatch Alert & Resident Coordination
1. **Job Ping**: Technician receives WhatsApp alert:
   * *"🚨 New Work Order Assigned: #TKT-882*
     - *Building: Sunrise Heights, Flat 302*
     - *Issue: Kitchen sink tap leaking heavily*
     - *Resident: Rahul Sharma (+91 98765 43210)*
     - *Approved Fee: ₹500 (Owner Paid)"*
2. **1-Tap Response**: `[✅ Accept & Start En Route]` | `[⏱️ Set Time: 2:00 PM]` | `[❌ Decline Job]`.

### Flow 6.2: Status Updates & ETA Sharing
* Technician taps `[✅ Accept & Start En Route]`.
* Bot updates ticket status to `in_progress`.
* Bot immediately notifies resident: *"Technician Ramesh is en route to your flat."*

### Flow 6.3: Completion Proof Photo & Voice Notes
1. **Job Done**: Technician takes picture of fixed tap with running water.
2. **Voice Note**: Sends audio: *"Paani leak theek ho gaya hai, naya washer laga diya."*
3. **Resolution**: Bot attaches photo and transcribed note to `/tickets/TKT-882`, marks status `resolved`, and increments technician's completed jobs counter in `/staff/{id}`.

### Flow 6.4: Instant Task Fee Payout Receipt
1. **Verification**: Manager or owner marks repair approved.
2. **Payout Trigger**: ₹500 credited via UPI to `ramesh@upi`.
3. **WhatsApp Voucher**:
   * *"🎉 Payout Credit Confirmed!*
     - *Task: Kitchen Sink Repair (#TKT-882)*
     - *Amount: ₹500*
     - *Ref: UPI-773920194*
     - *Month Total Earnings: ₹8,500 (17 jobs completed)."*

### Flow 6.5: Resident Review & Daily Agenda
* Resident rates job 5 stars.
* Technician receives review alert: *"⭐ Resident Rahul rated you: ★★★★★ 'Ramesh fixed the leak in 15 mins!' Your overall rating: 4.9 ★ (Top Rated Technician)."*
* Bot sends tomorrow's scheduled maintenance appointments.

---

## 7. Master Edge Cases & Exception Handling Matrix

| Scenario / Edge Case | What Happens on WhatsApp | Firestore & System Recovery Action |
| :--- | :--- | :--- |
| **Unregistered Phone Number** | Bot asks: *"Are you a Property Owner or looking to Rent?"* | Initializes temporary lead session in `/whatsappSessions`. |
| **Multi-Property Owner** | When owner says *"Show rent"*, bot presents: `[🏢 Sunrise Heights]` | `[🌴 Palm Residency]`. | Prompts disambiguation picker before executing query. |
| **Ambiguous / Gibberish Input** | Bot replies: *"I didn't quite catch that. Here are the actions you can take right now:"* | Displays interactive button menu matching current role. |
| **Expired 24-Hour WhatsApp Window** | Meta prohibits free-form messages after 24h of inactivity. | System sends an approved **Meta WhatsApp Template Message** with quick-reply button to re-open the 24h conversation window. |
| **Payment Gateway Downtime** | If active gateway (e.g. Razorpay) errors out during invoice creation. | System automatically fails over to Bank Transfer (NEFT/RTGS) details or Cash Claim option. |
| **Duplicate Message / Network Retry** | WhatsApp sends same webhook payload twice due to mobile network lag. | System checks `/processedWhatsAppMessages/{id}`; if ID exists, returns HTTP 200 immediately and ignores duplicate. |
| **Dispute / Argument over Charges** | Tenant claims rent calculation is wrong or unfair. | System **does not** use AI to argue; it transfers the chat directly to the human Property Manager with full ledger context. |
| **Tenant Moves Out Without Notice** | Tenant vacates abruptly. | Owner triggers WhatsApp command *"Force Vacate Flat 101"*; system archives tenancy and marks unit `'vacant'` on public directory. |
| **Technician Fails to Show Up** | Ticket remains `in_progress` past 4 hours without completion proof. | WhatsApp alert fires to Property Manager: *"Work order #TKT-882 overdue. Reassign technician?"* |

---

## 8. Summary of All Database Entities & Sync Touchpoints

```
WhatsApp Action                             Firestore Entity Affected
─────────────────────────────────────────────────────────────────────────────
Owner creates property/units       ──►     /properties/{id} & /units/{id}
Tenant submits KYC photos          ──►     /users/{id} & /kycDocuments
Tenant signs agreement             ──►     /agreements/{id} status: 'signed'
Tenant pays rent via gateway link  ──►     /invoices/{id} status: 'paid' & /transactions
Tenant claims cash payment         ──►     /cashHandoverClaims/{id}
Owner confirms cash receipt        ──►     /invoices/{id} & /transactions
Tenant sends voice-note ticket     ──►     /tickets/{id} priority: 'High'
Manager dispatches technician      ──►     /tickets/{id} assignedStaffId & payer
Manager logs walk-through room     ──►     /propertyInspections/{id}
Technician submits repair photo    ──►     /tickets/{id} status: 'resolved'
Technician receives task fee       ──►     /staff/{id} completed & payout vouchers
Owner settles move-out deposit     ──►     /moveouts/{id} status: 'refund_completed'
```

---

## 9. Implementation Readiness & Phasing

When ready to commence implementation, execution proceeds in 5 non-breaking steps:

1. **Phase 1: Meta Cloud API Integration**: Configure Webhook endpoint (`whatsappWebhook`) in `functions/src/index.ts` with HMAC signature validation and token handshake.
2. **Phase 2: SuperAdmin Configuration UI**: Add credentials input for WhatsApp Phone Number ID, WABA ID, and Permanent Token into `src/pages/superadmin/ConnectionsPage.tsx` saving to `/platformConfig/comms`.
3. **Phase 3: Session State Machine & Role Resolver**: Implement `/whatsappSessions` management to track conversational progress for Owners, Tenants, Managers, and Technicians.
4. **Phase 4: Gemini Multimodal Handlers**: Connect audio voice note transcription and photo analysis for repair tickets and unit inspections.
5. **Phase 5: Operational Action Dispatches**: Wire up 1-tap interactive buttons for lease signing, dynamic gateway rent cards, cash reconciliations, and technician fee payouts.
