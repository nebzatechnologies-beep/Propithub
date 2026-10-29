# Propithub Mobile App: Play Store & App Store Deployment Guide
**Document Version:** 1.0  
**Application Name:** Propithub  
**Package / Bundle ID:** `com.propithub.app`  
**Framework:** React Native / Expo (EAS Build & Submit)  
**Target Stores:** Google Play Store (Android) & Apple App Store (iOS)  

---

## Executive Summary & Cost Overview

| Platform | Account Type | Cost | Review Time | Key Gateways |
| :--- | :--- | :--- | :--- | :--- |
| **Google Play Console** | Developer Account | **$25** (One-time fee) | 24–72 hours | • Gov ID verification<br>• **Mandatory 14-day closed test with 12–20 testers** (for Personal accounts created after Nov 2023) |
| **Apple Developer** | Individual / Organization | **$99** / year | 24–48 hours | • Apple ID with 2FA on Apple device<br>• D-U-N-S Number (if registered as Organization) |

---

## Table of Contents
1. [Pre-Requisite Preparation & Store Assets](#1-pre-requisite-preparation--store-assets)
2. [EAS Build Automation (React Native / Expo)](#2-eas-build-automation-react-native--expo)
3. [Google Play Store: Step-by-Step Deployment](#3-google-play-store-step-by-step-deployment)
4. [Apple App Store: Step-by-Step Deployment](#4-apple-app-store-step-by-step-deployment)
5. [Critical Reviewer Guidelines & Rejection Avoidance](#5-critical-reviewer-guidelines--rejection-avoidance)
6. [Post-Launch Maintenance & Version Updates](#6-post-launch-maintenance--version-updates)

---

## 1. Pre-Requisite Preparation & Store Assets

Before initiating console submissions, gather all legal, graphic, and credential assets in one folder:

### A. Legal & Security Assets
- **Hosted Privacy Policy URL (Mandatory)**: Must detail that Propithub collects contact information, property/KYC documents, photos, and biometric credentials.
- **Account Deletion Link / In-App Deletion (Mandatory)**: Both Apple and Google reject apps that require user accounts without a self-service way to delete accounts and associated data.
- **Support / Contact URL**: A functional public landing page or helpdesk form.
- **App Reviewer Test Account**:
  - Email: `reviewer@propithub.com` (or similar active test user)
  - Password: `SecurePassword123!`
  - Preloaded State: Preload sample properties, leases, maintenance tickets, and rent records so reviewers can evaluate the app without getting stuck on an empty screen.

### B. Visual & Marketing Assets
- **App Icon**:
  - Google Play: 512 × 512 px (PNG 32-bit, transparent or opaque background, max 1MB).
  - Apple App Store: 1024 × 1024 px (PNG, no alpha transparency).
- **Feature Graphic (Google Play only)**:
  - 1024 × 500 px (PNG/JPEG, no transparency, highlights core value prop).
- **Screenshots (Minimum 4 per format)**:
  - **Android Phones**: Minimum 1080 × 1920 or 1080 × 2400 (aspect ratio 16:9 or 9:16).
  - **iPhone 6.7" Display**: 1290 × 2796 px (iPhone 15 / 16 Pro Max).
  - **iPhone 6.5" Display**: 1242 × 2688 px (iPhone 11 Pro Max / XS Max).
  - **iPad (12.9" Display)** *(Required if `supportsTablet: true`)*: 2048 × 2732 px.

---

## 2. EAS Build Automation (React Native / Expo)

Propithub's configuration is already set up in `mobile/app.json` and `mobile/eas.json`.

### Step 1: Open Terminal and Navigate to Mobile Directory
```bash
cd mobile
```

### Step 2: Install EAS CLI & Authenticate
```bash
npm install -g eas-cli
eas login
```

### Step 3: Trigger Production Builds

#### Android Production Build (`.aab` bundle):
```bash
eas build --platform android --profile production
```
> **Keystore Prompt**: When prompted on your first run: *"Generate a new Android Keystore?"* $\rightarrow$ Select **Yes**. EAS securely handles and backs up this keystore.

#### iOS Production Build (`.ipa` bundle):
```bash
eas build --platform ios --profile production
```
> **Apple Credentials**: Provide your Apple Developer ID credentials when prompted. EAS automatically generates and signs your Distribution Certificate and Provisioning Profile.

---

## 3. Google Play Store: Step-by-Step Deployment

```
[Create Developer Account ($25)]
              │
              ▼
    [Identity Verification]
              │
              ▼
   [Create App: "Propithub"]
              │
              ▼
   [App Content & Data Safety]
              │
              ▼
[Closed Testing (20 Testers x 14 Days)]  <-- Mandatory for new personal accounts
              │
              ▼
   [Apply for Production Access]
              │
              ▼
[Upload .aab & Roll out to Production]
```

### Step 3.1: Account Creation & Verification
1. Navigate to the [Google Play Console](https://play.google.com/console/signup).
2. Choose account type:
   - **Personal**: Quickest to register, but **requires 14-day closed testing with 12–20 testers**.
   - **Organization**: Requires a D-U-N-S number and organization documentation, but bypasses the 20-tester requirement.
3. Pay the **$25 one-time registration fee**.
4. Submit a Government-issued Photo ID (Passport or Driving License) for identity verification (approved in 24–48 hours).

### Step 3.2: Create App Entry
1. In the console dashboard, click **Create app**.
2. Fill in basic metadata:
   - **App name**: `Propithub`
   - **Default language**: `English (United States)` or `English (India)`
   - **App or game**: `App`
   - **Free or paid**: `Free`
3. Accept the US Export Laws and Developer Program Policies, then click **Create app**.

### Step 3.3: Complete "Set up your app" Tasks
Complete each item under the **App Content** tab:
1. **Privacy Policy**: Enter your hosted privacy policy URL.
2. **App Access**: Choose *"All or some functionality is restricted"*. Provide login instructions with the reviewer demo credentials.
3. **Ads**: Select *"No, my app does not contain ads"*.
4. **Content Ratings**: Complete the questionnaire (Real estate management $\rightarrow$ assigned "Everyone / 3+").
5. **Target Audience**: Select `18 and over`.
6. **Data Safety Declarations**:
   - *Personal Info*: Name, email address, phone number collected for account setup.
   - *Photos and Documents*: Uploaded for KYC verification and unit damage documentation.
   - *Security Practices*: Declare data is encrypted in transit and users can request data deletion.
7. **Store Listing**:
   - Short description (up to 80 chars)
   - Full description (up to 4000 chars)
   - Upload 512×512 icon, 1024×500 feature graphic, and phone screenshots.

### Step 3.4: Closed Testing Phase (Mandatory for Personal Accounts)
1. In the left navigation, click **Testing** $\rightarrow$ **Closed testing**.
2. Click **Create track** (or select Alpha).
3. Under **Testers**:
   - Create an email list containing **20 real email addresses** of team members/testers.
   - Save and copy the opt-in link provided by Google Play.
4. Click **Create new release**:
   - Upload the `.aab` file from your EAS build.
   - Enter Release Name: `2.4.0 (1)`.
   - Click **Save** and **Review release**, then **Start rollout to closed testing**.
5. **The 14-Day Testing Rule**:
   - All 20 testers must open the opt-in link, install the app on an Android device, and remain opted in for **14 consecutive days**.
6. After 14 days, click **Apply for Production Access** on the dashboard and answer Google’s questionnaire regarding tester feedback.

### Step 3.5: Final Production Release
1. Once granted production access, navigate to **Release** $\rightarrow$ **Production**.
2. Click **Create new release** $\rightarrow$ select your tested `.aab` build.
3. Review release and click **Start rollout to Production**.
4. Review typically takes **1 to 3 business days**.

---

## 4. Apple App Store: Step-by-Step Deployment

```
[Enroll in Apple Developer ($99/yr)]
                 │
                 ▼
      [Identity Verification]
                 │
                 ▼
[Create App on App Store Connect]
                 │
                 ▼
[Configure App Privacy & Pricing]
                 │
                 ▼
   [EAS Submit / Upload .ipa]
                 │
                 ▼
     [TestFlight (Beta Test)]
                 │
                 ▼
  [App Review Submission (24-48h)]
```

### Step 4.1: Developer Program Enrollment
1. Ensure you have an **Apple ID** with **Two-Factor Authentication (2FA)** enabled on an Apple device.
2. Go to [Apple Developer Program Enrollment](https://developer.apple.com/programs/enroll/) (or enroll directly via the **Apple Developer App** on an iPhone/iPad for faster verification).
3. Choose enrollment type:
   - **Individual**: Your legal personal name appears as the seller.
   - **Organization**: Company name appears as seller. Requires a free **D-U-N-S Number** ([Request D-U-N-S](https://developer.apple.com/enroll/duns-lookup/)) and business registration.
4. Pay the **$99 USD / year** membership fee. Activation takes **24–48 hours**.

### Step 4.2: Create App Record in App Store Connect
1. Sign in to [App Store Connect](https://appstoreconnect.apple.com).
2. Go to **Apps** $\rightarrow$ click the **`+`** icon $\rightarrow$ **New App**:
   - **Platforms**: iOS
   - **Name**: `Propithub`
   - **Primary Language**: English
   - **Bundle ID**: Choose `com.propithub.app`
   - **SKU**: `propithub-mobile`
   - **User Access**: Full Access
3. Click **Create**.

### Step 4.3: App Store Information & App Privacy
1. **App Information**:
   - Privacy Policy URL: Paste your public link.
   - Primary Category: `Business` or `Lifestyle` (Real Estate).
2. **Pricing and Availability**:
   - Price: **Free** ($0.00).
   - Availability: Worldwide or select target territories.
3. **App Privacy (Nutrition Labels)**:
   - Declare: Contact Info (Email, Phone, Name), User Content (Photos/Files for KYC), and Identifiers (User ID).
   - Specify that all items are linked to the user account for core app functionality.

### Step 4.4: Uploading the iOS Build via EAS
Run EAS submit from your terminal:
```bash
eas submit --platform ios
```
* EAS will either prompt for your App Store Connect API Key or your Apple ID credentials, and upload the build directly to Apple servers.
* Allow 10–15 minutes for Apple to process the binary before it appears in App Store Connect.

### Step 4.5: Internal / External Testing with TestFlight
1. In App Store Connect, go to the **TestFlight** tab.
2. Add internal testers (team members) to test immediately on physical iOS devices using the TestFlight app.
3. Validate camera permissions, photo uploads, and biometric login on a real iPhone.

### Step 4.6: Prepare Version Submission
1. In App Store Connect, open **iOS App** $\rightarrow$ **Prepare for Submission**:
   - Upload **6.7"** and **6.5"** screenshots.
   - Fill in **Description**, **Keywords**, and **Support URL**.
   - Under **Build**, click **Add Build** and select your processed version.
2. Under **App Review Information (CRITICAL)**:
   - Check **Sign-in required**.
   - Enter the test credentials:
     - Username: `reviewer@propithub.com`
     - Password: `SecurePassword123!`
   - In **Notes for Reviewer**, provide context:
     > *"Propithub is a comprehensive property and tenancy management platform. The test account provided allows access to sample rental units, inspection reports, and repair tickets. Camera and photo library permissions are used exclusively for uploading tenant KYC proofs and maintenance damage reports."*
   - Provide direct reviewer contact details (Name, Phone, Email).
3. Click **Save** $\rightarrow$ **Add for Review** $\rightarrow$ **Submit to App Review**.
4. Apple reviews usually conclude within **24 to 48 hours**.

---

## 5. Critical Reviewer Guidelines & Rejection Avoidance

To ensure approval on your very first submission, verify the following 5 common rejection reasons:

| Rejection Cause | Solution Implemented in Propithub |
| :--- | :--- |
| **Missing Account Deletion** | Both Apple Guideline 5.1.1(v) and Google Play Policy require apps with user accounts to offer an easy account deletion option directly inside the app settings. |
| **Vague Permission Strings** | Propithub's `app.json` has explicit explanations for `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, and `NSFaceIDUsageDescription`. |
| **Empty Test Account State** | Ensure `reviewer@propithub.com` has active mock properties and leases so the reviewer does not see blank screens. |
| **Broken Web Links** | Ensure the Privacy Policy URL and Support URL load cleanly on both desktop and mobile web browsers without 404s. |
| **Non-Compliant External Payments** | If charging rent or deposits, these are physical real-world services and exempt from Apple’s 30% In-App Purchase rule under Guideline 3.1.5. State clearly in review notes that payments represent offline real-estate tenancy transactions. |

---

## 6. Post-Launch Maintenance & Version Updates

When releasing version updates (bug fixes or new features):

1. **Increment Versioning**:
   - In `mobile/app.json`:
     - Update `"version"` (e.g., `2.4.1`)
     - Increment `"versionCode"` for Android (e.g., `2`)
     - Increment `"buildNumber"` for iOS (e.g., `"2"`)
2. **Re-build**:
   ```bash
   eas build --platform all --profile production
   ```
3. **Submit**:
   ```bash
   eas submit --platform all
   ```
4. In Google Play Console & App Store Connect, write your **"What's New in this Version"** release notes and submit for rapid review (updates typically get approved within 12–24 hours).
