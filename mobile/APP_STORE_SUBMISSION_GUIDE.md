# Propithub — App Store & Google Play Submission Guide

This document contains official test credentials and compliance notes to be pasted directly into **App Store Connect** (under *App Review Information*) and **Google Play Console** (under *App Content > App Access*).

---

## 1. App Store Connect Review Information

### Demo Reviewer Credentials (No 2FA Required)

#### Account 1: Property Owner / Landlord (Full SaaS Management)
- **Username / Email**: `reviewer.owner@propithub.app`
- **Password**: `ReviewerPass2026!`
- **Role**: `owner`
- **Pre-populated Datasets**:
  - **Properties**: *Skyline Residencies* (Multi-unit residential tower with active leases, unit occupancy stats).
  - **Invoices**: Multiple rent invoices across statuses (Paid, Pending, Overdue with daily late-fee calculations).
  - **Maintenance**: Active plumbing and HVAC work orders assigned to staff technicians.
  - **Leasing Hub**: Dispatched agreements and physical ink tenancy documents.

#### Account 2: Resident Tenant (Resident Portal & Payments)
- **Username / Email**: `reviewer.tenant@propithub.app`
- **Password**: `ReviewerPass2026!`
- **Role**: `tenant`
- **Pre-populated Datasets**:
  - **Active Lease**: Unit 302 Tenancy Agreement.
  - **Payment Hub**: Outstanding monthly rent invoice with multiple gateway checkout flows (Razorpay, Stripe, Cash confirmation).
  - **Maintenance Dispatch**: Create ticket with camera/photo upload and resolution tracking.

> **Convenience Note**: The Sign-In screen features a dedicated **"Reviewer & Demo Quick Fill"** toolbar directly below the sign-in form for rapid 1-tap credential entry without manual typing.

---

## 2. Guideline & Policy Compliance Notes for Reviewers

### Apple App Store Review Guidelines

1. **Guideline 2.1 — App Completeness & Hardware Permissions**:
   - Camera & Photo Library access are requested only when uploading inspection photos, signed leases, or receipt vouchers (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`).
   - Unused biometric permissions (`NSFaceIDUsageDescription`) have been removed.

2. **Guideline 3.1.1 — Business / Enterprise SaaS Multiplatform Subscriptions**:
   - Propithub is an enterprise B2B property management tool.
   - For iOS devices, credit card input for organizational SaaS plans is directed to the multiplatform organization dashboard (`propithub.app`), fully respecting Apple StoreKit digital services boundaries while enabling multiplatform enterprise subscriptions.

3. **Guideline 5.1.1(v) — Account Deletion**:
   - In-app self-service account deletion is accessible under **Account Settings > Security & Privacy > Request Permanent Account Deletion**.
   - Initiates an irrevocable 7-day grace window complying with Apple guidelines.

4. **App Icon Compliance (ITMS-90717)**:
   - `assets/icon.png` is an opaque 1024x1024 24-bit RGB PNG with zero alpha/transparency channels.

---

## 3. Recommended Reviewer Verification Steps

1. **Launch App**: The app cold-boots instantly from offline `AsyncStorage` cache.
2. **Reviewer Quick-Fill**: Tap **"Owner Demo"** on the Sign-In screen and tap **"Sign In to Account"**.
3. **Explore Portfolio**: Navigate to **Properties** tab to see property listings, unit occupancy, and tenant records.
4. **Financial Ledger**: Navigate to **Ledger / Invoices** to view receipts, generate invoice PDFs, and review payment audit trails.
5. **Tenant Experience**: Switch or log in with **"Tenant Demo"** to review the resident portal, pending rent balance, and maintenance dispatch.
