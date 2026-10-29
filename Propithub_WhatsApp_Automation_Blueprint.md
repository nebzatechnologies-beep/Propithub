# Propithub: WhatsApp-First Omnichannel Automation Blueprint

**Document Version:** 1.0.0  
**Target Codebase:** `Propithub_v2` (Firebase Cloud Functions, Firestore, React/TypeScript Web & Expo Mobile)  
**Author:** Engineering & Systems Architecture Team  
**Date:** October 14, 2026  

---

## 1. Executive Summary

This blueprint outlines the architecture and execution plan for transforming **Propithub** into a **WhatsApp-First** property management ecosystem. 

Instead of requiring tenants, property owners, and field technicians to navigate a web portal or install an app for everyday tasks, **WhatsApp acts as the primary conversational interface (UI)**, while Propithub's existing **Firebase backend (Firestore, Cloud Functions, Cloud Storage)** handles all business logic, database transactions, and security checks. The web platform is reserved exclusively for high-level administrative tasks, complex property configuration, and consolidated financial audits.

---

## 2. Core Architectural Decisions

### A. Is n8n Needed?
**No. Firebase Cloud Functions is 100% sufficient.**
* **Security**: No external sharing of Firebase Admin credentials or private keys.
* **Latency**: Sub-second execution (100–300ms) with direct internal database triggers.
* **Cost**: $0 base compute cost (Google Cloud includes 2,000,000 free invocations/month).
* **Maintainability**: Keeps 100% of the platform's business logic in a single, version-controlled codebase without "split-brain" orchestration.

### B. Twilio vs. Meta Direct (WhatsApp Cloud API)
* **Direct Meta Cloud API (Recommended)**: 
  * Direct server-to-server connection (zero middleman latency).
  * **Zero per-message markup** (saves thousands of dollars at scale compared to Twilio’s +$0.005/msg fee).
  * **1,000 free service conversations** each month.
  * Native day-1 support for WhatsApp Flows (forms), Interactive Buttons, List Pickers, and WhatsApp Pay.
* **Twilio (Retained as Fallback)**:
  * Already integrated in `functions/src/index.ts`. Retained strictly for SMS fallback when a user does not have WhatsApp active.

### C. The AI Engine (Google Gemini API via Vertex AI)
* Handles voice note transcription and multi-lingual translation (e.g., Hindi, Arabic, English).
* Inspects uploaded photos (damage inspection, receipt verification).
* Executes autonomous **Function Calling / Tool Calling** to interact directly with Firestore.

---

## 3. High-Level System Architecture

```
[ Any Marketing Channel ]                [ Active Users: Tenants / Owners / Techs ]
 (Instagram, Google, QR)                                     │
           │                                                 │
           └────────────────────────┬────────────────────────┘
                                    │ (WhatsApp Interactive / Media Message)
                                    ▼
                     [ Meta WhatsApp Cloud API ]
                                    │ (HTTPS Webhook POST)
                                    ▼
              [ Firebase Cloud Function: /whatsappWebhook ]
                                    │
    ┌───────────────────────────────┼───────────────────────────────┐
    ▼                               ▼                               ▼
[ User & Role Check ]     [ Session State Machine ]        [ AI Brain (Gemini) ]
Match phone against       Track multi-step flows           Intent classification,
Firestore `/users`        `/whatsappSessions/{phone}`      voice/image inspection &
(Tenant / Owner / Staff)  (e.g., Step 2: Upload ID)        tool/function calling
    └───────────────────────────────┬───────────────────────────────┘
                                    │ (Executes internal actions)
                                    ▼
                     [ Propithub Core Services ]
    ┌───────────────────────────────┼───────────────────────────────┐
    ▼                               ▼                               ▼
[ Firestore Database ]      [ Cloud Storage ]             [ Payment Gateways ]
• `agreements` (Leases)     • Inspection Photos           • Razorpay / Stripe
• `invoices` (Rent dues)    • Lease PDF Documents         • Direct Checkout Links
• `tickets` (Maintenance)   • Tenant KYC Proofs           • Status Webhooks
• `owners` (Subscriptions)
```

---

## 4. End-to-End Operational Workflows (In-Chat)

### 1. Tenant Onboarding & 1-Click Owner Approval
1. **Initiation**: Manager/Owner enters tenant details or tenant scans a property QR code.
2. **KYC Submission**: Tenant submits full name, emergency contact, and snaps a photo of their ID card in WhatsApp (stored in Firebase Storage).
3. **Lease Generation**: Cloud Function generates `Lease_Agreement_Unit_104.pdf`.
4. **Owner Review in Chat**:
   * Owner receives the PDF document directly in WhatsApp with a summary:  
     *Unit 104 | Tenant: Pavan | Rent: ₹35,000 | Deposit: ₹70,000 | 11 Months*.
   * Interactive buttons: `[ ✅ Approve Lease ]` `[ ❌ Reject ]` `[ ✏️ Request Changes ]`.
5. **1-Click Execution**: When owner taps `[ Approve ]`, Firestore sets `agreements/{id}.status = 'owner_approved'` and automatically provisions the tenant in `users` via the existing `provisionUserAccount` logic.
6. **Tenant Signing**: Tenant receives approved PDF with an instant `[ Accept & Sign ]` action. Unit transitions to `'occupied'`.

### 2. Rent Invoicing & Direct Payments
1. **Automated Notice**: Scheduled sweep (`dispatchDailyRentReminders`) dispatches interactive payment card:  
   *Rent Due: ₹35,000 | Due Date: 1st of Month*.
2. **Payment Action**: Tenant clicks `[ 💳 Pay Rent Now ]` (launches Razorpay/Stripe checkout pre-filled with invoice ID) or pays natively via WhatsApp Pay.
3. **Instant Receipt**: Webhook captures payment, marks `invoices/{id}.status = 'paid'`, and sends official PDF tax receipt into WhatsApp chat.

### 3. Maintenance Reporting & Field Staff Dispatch
1. **Tenant Reports Issue**: Tenant sends a voice note or photo of a leaking pipe in WhatsApp.
2. **AI Classification**: Gemini categorizes issue as `Plumbing`, urgency `High`, and creates record in `tickets`.
3. **Technician Alert**: Assigned staff receives WhatsApp card with unit location and issue photo.
4. **Resolution**: Technician updates status via buttons: `[ Accept ]` ➔ `[ En Route ]` ➔ uploads repair photo ➔ `[ Mark Completed ]`. Calls `confirmTaskPayment` internally.

### 4. Lease Renewal & Move-Out Inspections
* **Renewal**: At T-30 days, tenant receives renewal prompt with buttons: `[ Renew 1-Year ]` `[ Discuss Terms ]` `[ Vacate ]`. Owner approves with 1-click.
* **Move-Out Checklist**: Manager walks unit answering WhatsApp step-by-step checklist prompts and uploading photos. System calculates damage deductions and sends final deposit settlement card to Owner:  
  *Deposit: ₹70,000 | Deductions: ₹5,000 | Refund: ₹65,000 | [ Approve Refund ]*.  
  Tapping approve triggers `finalizeMoveOutInspection` logic and marks unit `'vacant'`.

---

## 5. Omnichannel Marketing & Instant Free Trial Funnel

Any marketing channel connects to the same WhatsApp onboarding engine with **zero signup form friction**:

```
[ Instagram Ads / Reels ] ──┐
[ Google Search Ads ]     ──┤
[ Offline Expo QR Codes ] ──┼──> [ WhatsApp Opens ] ──> [ Auto-Provision 14-Day Free Trial ]
[ Website Hero Widget ]   ──┤    (Pre-filled Text)      (Firestore `owners/{id}.planStatus = 'trialing'`)
[ Real Estate Referrals ] ──┘
```

### Channel Attribution Mapping

| Marketing Channel | Deep Link / QR Payload | Firestore Record in `/owners/{uid}` |
| :--- | :--- | :--- |
| **Instagram Reel / Ad** | `wa.me/NUMBER?text=START_TRIAL_INSTA` | `leadSource: 'instagram'`, `campaign: 'reels_growth'` |
| **Google Search Ad** | `wa.me/NUMBER?text=START_TRIAL_GOOGLE` | `leadSource: 'google_search'`, `campaign: 'high_intent'` |
| **Physical Expo QR** | `wa.me/NUMBER?text=START_TRIAL_EXPO` | `leadSource: 'offline_expo'`, `campaign: 'proptech_summit'` |
| **Partner / Referral** | `wa.me/NUMBER?text=START_TRIAL_REF_PAVAN` | `leadSource: 'referral'`, `referredBy: 'Pavan'` |

### Onboarding Flow for Owners:
1. Lead sends the pre-filled message from any link or QR code.
2. Bot asks 2 quick qualifying questions: Full Name and Portfolio Size (`1-5 Units`, `6-20 Units`, `20+ Units`).
3. Firebase creates the user account with `planStatus: 'trialing'` and sets a 14-day expiry.
4. Bot sends a welcome card with options to `[ ➕ Add First Property in Chat ]` or `[ 🔑 1-Click Dashboard Magic Link ]`.

---

## 6. System Separation: WhatsApp vs. Web Platform

| Action / Capability | WhatsApp | Web Management Portal |
| :--- | :---: | :---: |
| Tenant Onboarding & ID Verification | ✅ Primary | ⚠️ Backup |
| Lease Document Inspection & 1-Click Approval | ✅ Primary | ⚠️ Backup |
| Rent Collection & Payment Reminders | ✅ Primary | ⚠️ View Only |
| Maintenance Ticket Logging & Status Dispatch | ✅ Primary | ⚠️ Monitor Only |
| Free Trial Activation & Marketing Leads | ✅ Primary | ⚠️ View Leads |
| Lease Renewal & Move-Out Settlement | ✅ Primary | ⚠️ Backup |
| Bulk Property / Multi-Unit Configuration | ❌ Not suited | ✅ **Primary** |
| Full Financial Tax Audits & Consolidated P&L | ❌ Not suited | ✅ **Primary** |
| Platform Gateway & API Secrets Management | ❌ Not suited | ✅ **Primary** |

---

## 7. Step-by-Step Implementation Guide

Follow this phase-by-phase roadmap to build this automation on top of the existing `Propithub_v2` codebase:

### Phase 1: Meta Cloud API Setup & Webhook Foundation
1. **Meta Developer Console**:
   * Create a Meta Developer App under your verified Meta Business Manager.
   * Add the **WhatsApp** product and register a dedicated business phone number.
   * Generate a System User permanent access token and note the `Phone Number ID` and `WABA ID`.
2. **Cloud Function Webhook**:
   * Add a new HTTPS Cloud Function endpoint in `functions/src/` (e.g., `whatsappWebhook`).
   * Implement the `GET` handler to respond to Meta’s Webhook Verification Challenge (`hub.verify_token` and `hub.challenge`).
   * Implement the `POST` handler to receive incoming message payloads (text, buttons, media, status receipts).

### Phase 2: User Resolution & Session Management
1. **User Identifier Resolver**:
   * Extract sender's WhatsApp phone number (format: e.g., `+919876543210`).
   * Query Firestore `/users` where `phone == senderPhone`.
   * Resolve user role (`owner`, `tenant`, `manager`, `staff`, or `guest/lead`).
2. **State Machine (`/whatsappSessions/{phone}`)**:
   * Store conversation state for multi-step flows:
     * `activeFlow`: e.g., `'TENANT_ONBOARDING'`, `'MOVE_OUT_INSPECTION'`, `'OWNER_SIGNUP'`.
     * `currentStep`: integer or step name.
     * `tempData`: collected fields prior to final database commit.
     * `lastInteraction`: timestamp to handle session expirations.

### Phase 3: AI Brain & Tool Calling Integration
1. **Initialize Gemini Client**:
   * Configure Google Gemini API (Vertex AI or Google Gen AI SDK) inside Firebase Cloud Functions.
2. **Define Agent Tools (Function Declarations)**:
   * `fetchUnpaidInvoices({ tenantId })`
   * `createMaintenanceTicket({ unitId, category, description, urgency, photoUrl })`
   * `dispatchOwnerLeaseApproval({ agreementId, ownerPhone })`
   * `approveLeaseAgreement({ agreementId, ownerId })`
   * `submitMoveOutInspection({ moveoutId, checklist, deductions })`
3. **Multimodal Media Handler**:
   * When an incoming WhatsApp message type is `audio` (voice note), stream the audio to Gemini for speech-to-text and intent parsing.
   * When message type is `image`, download the media via Meta Graph API, upload to Firebase Storage, and run Gemini vision check for damage assessment.

### Phase 4: Core Operational Workflows Hookup
1. **Owner Approval Cards**:
   * Connect lease creation to outbound WhatsApp template sending `Lease_Agreement.pdf` with interactive quick-reply buttons (`Approve` / `Reject`).
   * Handle incoming `button_reply` callback to invoke existing `signAgreement` logic and update unit occupancy in Firestore.
2. **Rent Invoicing & Direct Payments**:
   * Update `dispatchDailyRentReminders` to prioritize outbound WhatsApp interactive messages with Razorpay/Stripe checkout links.
   * Connect `onRentalInvoiceWrite` (when `status == 'paid'`) to automatically dispatch payment receipt PDF into the tenant's WhatsApp thread.
3. **Move-Out Inspections**:
   * Implement guided conversational questionnaire for managers/technicians to conduct move-out room checks via WhatsApp and trigger `finalizeMoveOutInspection`.

### Phase 5: Omnichannel Marketing Gateway
1. **Deep Link & QR Generation**:
   * Create unique `wa.me` links with URL-encoded parameters for each marketing channel:
     * `wa.me/<NUMBER>?text=TRIAL_INSTA`
     * `wa.me/<NUMBER>?text=TRIAL_GOOGLE`
     * `wa.me/<NUMBER>?text=TRIAL_EXPO`
   * Generate downloadable vector QR codes for offline print banners and brochures.
2. **Auto-Trial Provisioning**:
   * When an unrecognized number sends a `TRIAL_*` payload, route to the Owner Trial Onboarding flow.
   * Collect name and unit count, create the `/owners` record in Firestore with `planStatus: 'trialing'`, set 14-day trial window, and return immediate interactive welcome card.
3. **Trial Nurturing Sequence**:
   * Add a daily cron trigger to send automated WhatsApp tips on Day 3 and Day 7, and an upgrade payment link on Day 12.

---

## 8. Summary Checklist Before Development

- [ ] Meta Business Manager verified with official Business Phone Number.
- [ ] WhatsApp Webhook configured in Firebase Cloud Functions (`/whatsappWebhook`).
- [ ] System User Access Token stored in Firestore `/platformConfig/comms`.
- [ ] Gemini API key / Google Cloud Vertex AI credentials configured.
- [ ] Meta Message Templates submitted and approved for outbound utility alerts (Rent Reminders, Lease Approvals).
- [ ] Firestore indexes verified for `phone` lookups on `/users`.
