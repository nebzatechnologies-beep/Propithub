# Propithub Mobile — iOS App Store Deployment Guide

This guide provides a comprehensive, step-by-step roadmap for publishing the **Propithub** mobile application to the **Apple App Store** using Expo and EAS (Expo Application Services).

---

## 1. Project Specifications

| Property | Configured Value | Source |
| :--- | :--- | :--- |
| **App Name** | Propithub | `mobile/app.json` |
| **Bundle Identifier** | `com.propithub.app` | `mobile/app.json` |
| **Current Version** | `2.4.0` (Build 1) | `mobile/app.json` |
| **Expo Slug** | `propithub-mobile` | `mobile/app.json` |
| **EAS Project ID** | `42573962-ad60-49c1-825a-994d52e57d4c` | `mobile/app.json` |
| **Device Support** | iPhone & iPad (`supportsTablet: true`) | `mobile/app.json` |

---

## 2. Phase 1: Prerequisites & Account Setup

### A. Apple Developer Program
1. Enroll in the Apple Developer Program at [developer.apple.com/programs](https://developer.apple.com/programs/).
   * **Individual Account ($99/yr)**: Registered under your personal legal name.
   * **Organization Account ($99/yr)**: Registered under your legal entity (requires a D-U-N-S number).
2. Ensure two-factor authentication (2FA) is enabled on your Apple ID.

### B. EAS (Expo Application Services) Setup
1. Install EAS CLI globally if not already installed:
   ```bash
   npm install -g eas-cli
   ```
2. Log into your Expo account linked to `nebzas-team`:
   ```bash
   eas login
   ```
3. Verify your configuration in the mobile directory:
   ```bash
   cd mobile
   eas whoami
   ```

---

## 3. Phase 2: App Store Connect Initial Setup

### A. Register the Bundle Identifier
1. Go to [Apple Developer Portal $\rightarrow$ Identifiers](https://developer.apple.com/account/resources/identifiers/list).
2. Click the blue **`+`** icon to register a new App ID.
3. Select **App IDs** $\rightarrow$ **App**.
4. Set:
   * **Description**: `Propithub Mobile App`
   * **Bundle ID (Explicit)**: `com.propithub.app`
5. Click **Continue** and then **Register**.

### B. Create App Record in App Store Connect
1. Navigate to [App Store Connect](https://appstoreconnect.apple.com).
2. Go to **My Apps** and click the **`+`** button $\rightarrow$ **New App**.
3. Fill in the required fields:
   * **Platforms**: iOS
   * **Name**: `Propithub` (or legal app marketing title)
   * **Primary Language**: English
   * **Bundle ID**: Select `com.propithub.app` from the dropdown.
   * **SKU**: Internal unique ID (e.g., `propithub-ios-app`)
   * **User Access**: Full Access
4. Click **Create**.

---

## 4. Phase 3: Store Assets, Metadata & Privacy Compliance

### A. App Screenshots
Upload screenshots to App Store Connect under **App Store $\rightarrow$ 1.0 Prepare for Submission**.

| Device Class | Required Dimensions | Notes |
| :--- | :--- | :--- |
| **6.7" iPhone Display** | 1290 $\times$ 2796 px (or 1179 $\times$ 2556 px) | iPhone 15/16 Pro Max (3–5 key screens) |
| **6.5" iPhone Display** | 1242 $\times$ 2688 px | iPhone 11 Pro Max / XS Max |
| **13" iPad Display** | 2048 $\times$ 2732 px (Portrait) | **Required** because `supportsTablet: true` |

> **Key screens to showcase**:
> 1. Tenant/Owner Home Dashboard
> 2. Digital Lease Agreement & Signature
> 3. Rent & Deposit Payment Ledger
> 4. Property Inspection Walkthrough & Damage Records
> 5. Maintenance Ticket Dispatch

### B. App Icon
* Must be **1024 $\times$ 1024 px PNG** with no alpha transparency.
* Configured in `mobile/assets/icon.png`.

### C. Required URLs
* **Privacy Policy URL**: Must be a publicly accessible URL (e.g., `https://propithub.com/privacy`).
* **Support URL**: Public help center or contact page (e.g., `https://propithub.com/support`).
* **Marketing URL** *(Optional)*: Main website homepage.

### D. App Privacy Questionnaire (Data Declarations)
In App Store Connect under **App Privacy**, disclose the data types collected:
* **Contact Information**: Name, Email, Phone number (for user account authentication).
* **User Content**: Photos and Documents (for unit inspections and signed lease documents).
* **Financial Information**: Rent and security deposit transaction histories.
* **Identifiers**: User ID (for multi-tenant data scoping).

### E. App Review Information (Mandatory Demo Credentials)
Apple's review team **must** be able to log in without needing physical OTPs or real bank payments:
* **Demo Email / Username**: e.g., `reviewer-tenant@propithub.com`
* **Demo Password**: `[Secure Temporary Password]`
* **Notes to Reviewer**: 
  > *"Propithub is a residential property and lease management platform. Use the demo credentials to review tenant lease signing, security deposit vouchers, and maintenance dispatch. All payments in the demo account are sandbox transactions."*

---

## 5. Phase 4: Building the iOS Production Binary

Propithub uses Expo EAS cloud builders, so you do **not** need a local macOS computer to compile the `.ipa`.

1. Navigate to the `mobile` workspace:
   ```bash
   cd mobile
   ```
2. Trigger the production cloud build:
   ```bash
   eas build --platform ios --profile production
   ```
3. **Credentials Management**:
   * When asked: *"Do you want Expo to handle your Apple credentials?"*
   * Press **Yes**.
   * EAS will automatically generate:
     1. Apple Distribution Certificate
     2. Apple Provisioning Profile for `com.propithub.app`
4. EAS will process and sign the build in the cloud. You will receive a URL to download the `.ipa` or view the build log.

---

## 6. Phase 5: Submission & TestFlight Beta Testing

### A. Submitting to App Store Connect
Submit the latest cloud build directly to App Store Connect:
```bash
eas submit --platform ios
```
* Select the latest build from the list.
* EAS will transmit the binary directly to Apple’s App Store Connect servers.
* Processing typically takes **10–25 minutes**. You will receive an email confirmation once processing is complete.

### B. Internal Beta Verification via TestFlight
1. Open [App Store Connect](https://appstoreconnect.apple.com) $\rightarrow$ select your app $\rightarrow$ **TestFlight** tab.
2. Under **Internal Testing**, add yourself and team members.
3. Install the **TestFlight** app from the iOS App Store on your iPhone.
4. Open the email invite or redeem code to install and test the actual App Store production build on physical hardware.

---

## 7. Phase 6: Submitting for Final App Review

1. In **App Store Connect** $\rightarrow$ **App Store** tab $\rightarrow$ **1.0 Prepare for Submission**:
   * Scroll down to **Build** $\rightarrow$ Click **+ Select a build**.
   * Choose your processed build (e.g., `Version 2.4.0 Build 1`).
   * Complete the text metadata:
     * **Description**: Detailed overview of Propithub features.
     * **Keywords**: `property management, lease, rent, tenant, landlord, proptech`
     * **Copyright**: `© 2026 Propithub Inc.`
   * Ensure the **App Review Information** credentials and notes are attached.
2. In the top right corner, click **Save**, then click **Add for Review**.
3. Confirm submission by clicking **Submit to App Review**.

---

## 8. Review Timeline & Release Options

* **Review Duration**: Typically **24 to 48 hours**.
* **Status Milestones**:
  `Waiting for Review` $\rightarrow$ `In Review` $\rightarrow$ `Pending Developer Release` or `Ready for Sale`.
* **Release Options**:
  * **Automatic Release**: Goes live on the App Store immediately upon approval.
  * **Manual Release**: You click "Release this version" when your team is ready.
  * **Scheduled Release**: Automatically launches at a specific date and time.

---

## 9. Common Apple Rejection Pitfalls & Preventative Checks

| Issue | Prevention in Propithub |
| :--- | :--- |
| **Missing Camera / Photo Permission strings** | Already configured in `mobile/app.json` (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`). |
| **Non-functioning reviewer login** | Ensure demo credentials provided in App Review Information do not require 2FA SMS or external physical verification. |
| **Broken tablet layouts** | Since `supportsTablet: true` is on, test iPad simulator layout or set `supportsTablet: false` in `app.json` if only targeting phones. |
| **Account deletion requirement** | Apple Guideline 5.1.1(v) requires an easy account deletion option for apps supporting account creation. Propithub already has `deleteUserAccount` support in account settings. |

