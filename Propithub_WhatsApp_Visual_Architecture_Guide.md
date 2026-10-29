# Propithub: Visual Architecture & Transition Guide
## Expanding from Dual-Channel (Web + Mobile) to Tri-Channel with WhatsApp Superpower

**Document Version:** 1.0.0  
**Target Codebase:** `Propithub_v2` (Firebase Core, React/TS Web, Expo Mobile, Meta WhatsApp Cloud API)  
**Date:** October 14, 2026  

---

## 1. The Core Concept: An Additive Superpower (Not a Replacement)

> [!IMPORTANT]
> **Full Feature Parity Maintained**: All features and workflows remain 100% operational on the **Web Management Portal** and the **Expo Mobile App**. WhatsApp does not replace them. Instead, WhatsApp acts as an **additive conversational superpower**—a zero-friction "remote control" allowing users to interact with Propithub from wherever they are, without opening a browser or logging into an app.

```
                               ┌────────────────────────────────────────────────────────┐
                               │             THE TRI-CHANNEL PROPIDHUB FRONTEND         │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │
          ┌───────────────────────────────────────────────┼───────────────────────────────────────────────┐
          ▼                                               ▼                                               ▼
┌──────────────────┐                            ┌──────────────────┐                            ┌──────────────────┐
│    Web Portal    │                            │    Mobile App    │                            │   WhatsApp Bot   │
│ (React/TS + Vite)│                            │  (Expo / React   │                            │ (Meta Cloud API  │
│                  │                            │     Native)      │                            │  Conversational) │
├──────────────────┤                            ├──────────────────┤                            ├──────────────────┤
│ • Bulk Config    │                            │ • Resident Push  │                            │ • 1-Click Action │
│ • Deep Analytics │                            │ • Digital Key    │                            │ • Voice/Photo In │
│ • Heavy Audits   │                            │ • In-App Chat    │                            │ • Zero-App UX    │
└─────────┬────────┘                            └─────────┬────────┘                            └─────────┬────────┘
          │                                               │                                               │
          └───────────────────────────────────────────────┼───────────────────────────────────────────────┘
                                                          │
                                                          ▼
                               ┌────────────────────────────────────────────────────────┐
                               │           UNIFIED FIREBASE BACKEND ENGINE              │
                               │                                                        │
                               │  • Firestore Database (`agreements`, `invoices`, etc.) │
                               │  • Firebase Cloud Storage (PDFs, Media, KYC)           │
                               │  • Cloud Functions Logic (`signAgreement`, etc.)       │
                               │  • Payment Gateways (Razorpay / Stripe)                │
                               └────────────────────────────────────────────────────────┘
```

---

## 2. The Architectural Transition (Before vs. After)

```mermaid
graph TD
    subgraph "CURRENT STATE (Dual Channel)"
        W1[Web Dashboard] -->|User clicks buttons| F1[(Firebase Core)]
        M1[Mobile App] -->|User clicks buttons| F1
        F1 -->|Outbound Reminders| SMS[Twilio SMS / SendGrid Email]
        SMS -.->|Passive One-Way Link| U1[Tenant / Owner]
    end

    subgraph "FUTURE STATE (Unified Tri-Channel Engine)"
        W2[Web Dashboard] -->|Full Control| F2[(Firebase Core)]
        M2[Mobile App] -->|Full Control| F2
        
        WA[WhatsApp Superpower] <-->|Two-Way Conversation + 1-Click Buttons| U2[Tenant / Owner / Staff]
        WA <-->|Meta Cloud API Webhook| F2
        
        F2 -->|Multi-Channel Sync| Sync[Instant Sync Across All 3 Screens]
        Sync --> W2
        Sync --> M2
        Sync --> WA
    end

    style WA fill:#25D366,stroke:#128C7E,stroke-width:2px,color:#fff
    style F2 fill:#FFA611,stroke:#E65100,stroke-width:2px,color:#fff
```

---

## 3. Visual Workflow 1: Tenant Onboarding & 1-Click Owner Approval

This illustrates how an agreement can be drafted, reviewed, approved, and activated entirely within WhatsApp or interchangeably across Web/Mobile:

```mermaid
sequenceDiagram
    autonumber
    actor Tenant as 👤 Tenant (WhatsApp)
    actor Owner as 👔 Owner (WhatsApp / Web)
    participant FB as 🔥 Firebase Core
    participant WA as 💬 Meta WhatsApp API

    Tenant->>WA: Enters KYC details & uploads ID photo
    WA->>FB: Saves to Storage & creates draft agreement
    FB->>FB: Generates Lease Agreement PDF
    
    rect rgb(235, 248, 255)
    Note over Owner,WA: Instant Delivery & Review directly in WhatsApp
    FB->>WA: Dispatches Lease PDF + Summary Card + Buttons
    WA->>Owner: Delivers PDF: "Unit 104 Lease | Rent: ₹35,000"
    end

    alt Owner prefers WhatsApp
        Owner->>WA: Taps [ ✅ Approve Lease ] Button
        WA->>FB: Webhook fires: calls internal approval logic
    else Owner prefers Web Dashboard
        Owner->>FB: Logs in and clicks "Approve" on portal
    end

    FB->>FB: Updates Firestore: status = 'active', unit = 'occupied'
    FB->>WA: Sends approved executed lease PDF to Tenant
    WA->>Tenant: "🎉 Your lease is active! Download your copy."
```

---

## 4. Visual Workflow 2: Rent Invoicing & Direct Payments

```mermaid
sequenceDiagram
    autonumber
    actor Tenant as 👤 Tenant (WhatsApp)
    participant Sched as ⏰ Cloud Scheduler (Midnight)
    participant FB as 🔥 Firebase Core
    participant Pay as 💳 Razorpay / Stripe
    participant WA as 💬 Meta WhatsApp API

    Sched->>FB: Trigger daily rent sweep
    FB->>WA: Send Rent Due Card with 1-Click Payment Link
    WA->>Tenant: "Rent due: ₹35,000 [ 💳 Pay via UPI / Card ]"
    
    Tenant->>Pay: Clicks button & completes payment
    Pay->>FB: Payment Webhook confirmation (status: 'paid')
    
    FB->>FB: Generates Official Tax Receipt PDF
    FB->>WA: Dispatches Receipt PDF directly into chat
    WA->>Tenant: Delivers Receipt PDF: "Payment confirmed!"
    
    Note over FB,Tenant: Balance updates live on Web Portal and Mobile App simultaneously
```

---

## 5. Visual Workflow 3: Omnichannel Marketing to Instant Free Trial

How an owner goes from seeing an ad to starting a live 14-day trial in 30 seconds:

```mermaid
flowchart LR
    A[Instagram Reel / Ad] -->|Tap 'Message Us'| WA[WhatsApp Opens]
    B[Google Search Ad] -->|Tap 'Click to Chat'| WA
    C[Offline Expo QR Code] -->|Scan QR| WA
    D[Website Hero Button] -->|Tap 'Start Trial'| WA

    WA -->|Pre-filled Text: TRIAL_CHANNEL| WH[Firebase Cloud Function Webhook]
    
    subgraph "Automated 30-Second Provisioning"
        WH --> Q1[Bot: 'What is your Name?']
        Q1 --> Q2[Bot: 'How many units do you manage?']
        Q2 --> DB[(Firestore: /owners)]
        DB --> ACT[Activate: planStatus = 'trialing'<br>14-Day Expiry Set]
    end

    ACT --> RES[Welcome Card Sent to WhatsApp]
    RES --> OPT1[➕ Add 1st Property in Chat]
    RES --> OPT2[🔑 1-Click Magic Login for Web]

    style WA fill:#25D366,stroke:#128C7E,color:#fff
    style DB fill:#FFA611,stroke:#E65100,color:#fff
    style ACT fill:#2196F3,stroke:#0D47A1,color:#fff
```

---

## 6. What Can Be Done Where (Tri-Channel Matrix)

| Operational Action | Web Portal | Mobile App | WhatsApp Superpower | Best Used For |
| :--- | :---: | :---: | :---: | :--- |
| **New Lead Trial Onboarding** | ✅ Yes | ✅ Yes | ⚡ **Fastest (30s)** | Social ads, QR codes, cold leads |
| **Review & Approve Lease** | ✅ Yes | ✅ Yes | ⚡ **Instant (1-Tap)** | Owners on the move |
| **Rent Reminder & Pay** | ✅ Yes | ✅ Yes | ⚡ **Direct Link/UPI**| Highest open and conversion rate (>95%) |
| **Log Maintenance Ticket** | ✅ Yes | ✅ Yes | ⚡ **Voice / Photo** | Tenants without app installation |
| **Field Tech Job Updates** | ✅ Yes | ✅ Yes | ⚡ **Quick Buttons** | Technicians who don't open portals |
| **Bulk 50-Unit Import** | 💻 **Optimal** | ⚠️ Complex | ❌ Not suited | Initial landlord onboarding |
| **Consolidated P&L Audits** | 💻 **Optimal** | ⚠️ Summary only| ❌ Summary only | End-of-year tax accounting |

---

## 7. Immediate Next Steps to Implement This

Here is the exact step-by-step checklist to begin execution:

### Step 1: Meta Business & WhatsApp API Setup (Day 1)
- [ ] Go to [developers.facebook.com](https://developers.facebook.com) and create a **Business App**.
- [ ] Add the **WhatsApp** product to your app.
- [ ] Link or create your **Meta Business Manager** account.
- [ ] Register your dedicated business phone number (or start with Meta’s free Test Phone Number for sandbox testing).
- [ ] Generate a permanent **System User Access Token** with `whatsapp_business_messaging` permissions.

### Step 2: Create the Firebase Webhook Endpoint (Day 2)
- [ ] In `Propithub_v2/functions/src/index.ts`, add an HTTPS endpoint: `export const whatsappWebhook = functions.https.onRequest(...)`.
- [ ] Handle Meta’s **Verification Challenge** (`hub.mode`, `hub.verify_token`, `hub.challenge`).
- [ ] Paste the webhook URL into your Meta App Dashboard and click **Verify and Save**.
- [ ] Subscribe to the `messages` event.

### Step 3: Implement Phone-to-User Role Resolver (Day 3)
- [ ] When a message arrives at the webhook, extract the sender’s phone number: `const phone = payload.entry[0].changes[0].value.messages[0].from`.
- [ ] Query Firestore `/users` by phone number:
  - If role == `'owner'` ➔ Return Owner Quick-Action Menu.
  - If role == `'tenant'` ➔ Return Tenant Action Menu.
  - If role == `'staff'` ➔ Return Field Technician Worklist.
  - If not found ➔ Route to Lead / Free-Trial Onboarding flow.

### Step 4: Plug in the 1-Click Owner Lease Approval (Day 4)
- [ ] When a new lease is created in `agreements`, send an interactive WhatsApp message to the owner’s phone with:
  - Attachment: The agreement PDF URL.
  - Two buttons: `[ ✅ Approve ]` and `[ ❌ Reject ]`.
- [ ] In the webhook handler, catch `type === 'interactive'` and button ID `approve_lease_{agreementId}`.
- [ ] Call the existing `signAgreement` / update logic to mark the lease active and the unit occupied.

### Step 5: Connect Daily Rent Reminders to WhatsApp (Day 5)
- [ ] In `functions/src/index.ts` under `dispatchDailyRentReminders`, add WhatsApp delivery alongside the existing SMS and email calls.
- [ ] Send an interactive message with a direct link button pointing to your Razorpay/Stripe checkout URL.
- [ ] Confirm receipt PDF delivery on payment success in `onRentalInvoiceWrite`.

### Step 6: Launch Omnichannel Marketing Funnel (Day 6)
- [ ] Generate your tracking deep links (`wa.me/<NUMBER>?text=TRIAL_INSTA`, `wa.me/<NUMBER>?text=TRIAL_EXPO`).
- [ ] Set up the handler: when an incoming message starts with `TRIAL_`, automatically create an owner profile with `planStatus: 'trialing'` and send the interactive welcome card.
