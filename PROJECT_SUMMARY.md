# CoLiving Israel - Project Summary

Welcome to the **CoLiving Israel** project documentation! This document provides a detailed breakdown of the application. It is designed to be easily read by **non-programmers** to understand what the system does, while remaining **technically detailed** so that other AI coding assistants can immediately digest the architecture, code conventions, and file structure to build new features.

---

## 📋 1. Project Purpose & High-Level Overview

**CoLiving Israel** is a community-driven roommate matchmaking and group housing application designed specifically for Israel. 

### What it does (User Perspective):
1. **Register and Setup Profiles:** Users register using their Email/Password or Google Login. During their first visit, they complete a two-phase questionnaire (first entering personal data, then personality traits).
2. **Form Co-Living Groups:** Users can form groups (e.g., "Group 3") with a target number of desired roommates. They can customize group descriptions, required member sizes, group purpose (e.g., "we have an apartment and want roommates" or "we are looking for an apartment together"), and specific tags like Kosher, Sabbath-observant, pet-friendly, etc.
3. **Find Partners/Roommates:** Users can search and filter other registered users in Israel, inspect their questionnaire responses, check compatibility, and invite them to their co-living group.
4. **Group Expiration (Auto-Destruct):** To keep the platform fresh, groups have an expiration timer (e.g., 24 hours). If a group doesn't gather enough members (based on a configurable threshold percentage) before the time runs out, the group automatically expires, members are freed, and they receive a notification so they can try again. If they meet the threshold, the group "goes live"!
5. **Apartment Integration:** Apartment managers (called **Maskirs** - *משכירים*) and Administrators can upload and manage apartment listings in a database. Co-living groups can associate themselves with a specific apartment.
6. **Administrator Controls:** Administrators have full power to manage the list of cities/locations, add/remove/edit questionnaire questions, assign roles, view all user profiles and answers, delete users, and toggle between a **Real Database** and a **Test Database** to safely test new updates without affecting real users.

---

## 🛠️ 2. Technology Stack & Languages

The project is built as a modern, clean web application using the following technologies:

| Layer | Technology | Details / Purpose |
| :--- | :--- | :--- |
| **Core Framework** | **Angular 18** | High-performance frontend framework. Uses **Standalone Components** (no old-school modules) and modern routing. |
| **Programming Language** | **TypeScript** | Structured, type-safe programming language for all client-side logic. |
| **Database & Auth** | **Firebase** | Cloud database and user management system. |
| **Database Engine** | **Firestore** | Real-time, NoSQL cloud database storing JSON documents. |
| **User Directory** | **Firebase Authentication** | Manages user registrations, logins, passwords, and Google Single Sign-On (SSO). |
| **Hosting** | **Firebase Hosting** | Deploys static build files so the application is live on the internet. |
| **Backend Functions** | **Firebase Cloud Functions** | Serverless backend logic. Written in **JavaScript (Node.js)** to perform privileged actions (like deleting users). |
| **Styling** | **Vanilla CSS (Cascading Style Sheets)** | Clean, customized visual layouts. Uses modern CSS custom variables and a glassmorphism (semi-transparent glass) aesthetic. |
| **Languages & Direction** | **Hebrew & RTL** | The UI is fully in Hebrew. Standardized to Right-to-Left (`direction: rtl`) layout. |

---

## 📁 3. Directory and File Structure

Here is a map of the project files and what they do:

```
CoLivingIsrael/
├── .angular/                     # Angular build cache (auto-generated)
├── .firebase/                    # Firebase cache (auto-generated)
├── functions/                    # Backend Cloud Functions (Server-side code)
│   ├── index.js                  # Main backend functions (User deletion APIs)
│   ├── package.json              # Node.js backend dependencies
│   └── tsconfig.json             # TypeScript configuration for functions
├── src/                          # Application source code (Frontend)
│   ├── app/                      # Main Angular application files
│   │   ├── components/           # UI Components (Pages, modals, menus)
│   │   │   ├── about/            # About page
│   │   │   ├── admin-settings/   # Global timeout and threshold settings panel
│   │   │   ├── apartments/       # Apartment upload and management views
│   │   │   ├── auth-modal/       # User sign-in/registration popup window
│   │   │   ├── geo-manager/      # Admin page for adding cities/neighborhoods
│   │   │   ├── group-properties-manager/ # Admin page for managing group tags (e.g. Kosher)
│   │   │   ├── home/             # Landing page
│   │   │   ├── profile/          # User profile details and onboarding form modals
│   │   │   ├── questions-manager/# Admin portal to manage questionnaire questions
│   │   │   ├── search-groups/    # Primary dashboard for browsing groups and users
│   │   │   ├── set-admin/        # Quick admin tool for development testing
│   │   │   ├── show-message/     # In-app notification toast alerts
│   │   │   └── topbar/           # Navigation bar header
│   │   ├── models/               # Shared TypeScript data models
│   │   │   └── notification.model.ts
│   │   ├── services/             # Services containing application logic/state
│   │   │   ├── auth.service.ts   # Logins, user roles, profile state
│   │   │   ├── group.service.ts  # Groups, invitations, and properties CRUD
│   │   │   └── message.service.ts# Controls the toast messages
│   │   ├── apartments.guard.ts   # Blocks non-authorized users from apartment panel
│   │   ├── app.component.ts      # Root component
│   │   ├── app.config.ts         # App startup configuration
│   │   ├── app.routes.ts         # Page URL routing system
│   │   ├── auth.guard.ts         # Blocks unauthenticated users from page routes
│   │   ├── firebase-config.ts    # Connection configurations for Firebase SDK
│   │   └── onboarding.guard.ts   # Redirects users who haven't completed questionnaire
│   ├── assets/                   # Public assets (Images, icons, fonts)
│   ├── index.html                # Single HTML entry file for the application
│   ├── main.ts                   # Bootstraps the Angular frontend
│   └── styles.css                # Global styles (Glassmorphism layout, buttons)
├── angular.json                  # Angular CLI build workspace settings
├── firebase.json                 # Firebase local emulation and hosting config
├── firestore.rules               # Database read/write security rules
├── package.json                  # Frontend dependencies and executable scripts
└── tsconfig.json                 # TypeScript build configuration
```

---

## 🔄 4. Core User Flows & Business Logic

### A. Two-Phase Onboarding System
When a user signs up, the application blocks access to matching dashboards until they complete two levels of questions:
1. **Phase 1: Registration Questions (`newUsersQuestions` collection):** Core registration info. (e.g. Name, Phone, Age).
2. **Phase 2: Personal / Role Data (`userPersonalDataQuestions` or `maskirQuestions` collections):** Compatibility, roommate habits (cleanliness, smoking, noise) or apartment-specific properties if the user is a landlord (`maskir`).
- **Enforcement:** The `OnboardingGuard` intercepts navigation requests. If Phase 1 is incomplete, it redirects the user to `/profile?showRegistration=1`. If Phase 2 is incomplete (for strict routes like `/search-groups`), it redirects to `/profile?showOnboarding=1`.

### B. Group Lifecycle, Status, and Countdown
- **Creation:** A user creates a group. The system automatically computes an `expirationTime` based on the global settings (e.g. 24 hours in the future) and saves it to Firestore.
- **Timer / Countdown:** The group details screen displays a real-time ticking clock showing hours/minutes/seconds remaining.
- **Goes Live ("הקבוצה באוויר"):** If the group successfully recruits members equal to or greater than the threshold (for example, target member count is 5, threshold setting is 40% = 2 members), the countdown stops, and the group status is marked as live.
- **Auto-Expiration (Auto-Destruct):** When the time expires, if the group has *not* met the threshold:
  1. The group status changes to `expired`.
  2. The group's `members` array is cleared (allowing members to join/create other groups).
  3. A batch write sends a notification to each member: *"The group [Name] expired and was closed. You can now join a new group."*

### C. Live Database Toggling (Real vs. Test Mode)
Admins have a button in the navigation bar to toggle between **Real Data** and **Test Data**.
- When in Test Mode, `AuthService` appends `testdata/db/` to all database requests.
- Example document write path:
  - Real Mode: `profiles/{uid}`
  - Test Mode: `testdata/db/profiles/{uid}`
- This creates an isolated database sandbox for staging/testing features without touching real user accounts.

---

## 🗄️ 5. Database Schema (Firestore Collections)

Below are the details of the Firestore database structure used by the app:

### 1. `profiles`
*Path: `/profiles/{uid}` (or `/testdata/db/profiles/{uid}`)*
Represents a registered user profile.
- **`uid`** *(string)*: Unique User ID from Firebase Auth.
- **`email`** *(string)*: User's email address.
- **`displayName`** *(string)*: User's full name (automatically derived from first and last name questions).
- **`role`** *(string)*: Permission tier. Values: `'user' | 'maskir' | 'admin'`.
- **`createdAt`** *(string)*: ISO timestamp when registered.
- **`onboardingCompleted`** *(boolean)*: True if the user finished Phase 2 questionnaire.
- **`questions`** *(map)*: Key-value map storing question answers, where keys are question IDs.

### 2. `groups`
*Path: `/groups/{groupId}` (or `/testdata/db/groups/{groupId}`)*
Represents a formed co-living group.
- **`id`** *(string)*: Auto-generated group ID.
- **`name`** *(string)*: Group name (e.g. "קבוצה 3").
- **`description`** *(string)*: Text description of the group.
- **`purpose`** *(string)*: Group purpose (e.g. "יש דירה מחפש שותפים" or "מחפשים שותפים ודירה").
- **`adminId`** *(string)*: UID of the creator/leader.
- **`creatorName`** *(string)*: Name of the creator.
- **`creatorEmail`** *(string)*: Email of the creator.
- **`members`** *(array of strings)*: List of member UIDs.
- **`membersJoinedAt`** *(map)*: Maps member UID to the timestamp when they joined.
- **`requiredMembers`** *(number)*: Desired target group size.
- **`properties`** *(array of strings)*: Group tags (e.g. "שומר שבת", "טבעוני").
- **`expirationTime`** *(Timestamp)*: Firebase timestamp indicating when the group expires.
- **`status`** *(string)*: Current state. Values: `'active' | 'expired' | 'completed'`.
- **`groupThresholdPercent`** *(number)*: The threshold percentage copied from global settings at creation time.

### 3. `groupInvites`
*Path: `/groupInvites/{inviteId}` (or `/testdata/db/groupInvites/{inviteId}`)*
*Document ID Format:* `${toUid}_${groupId}` (Strictly enforced by security rules).
Stores pending group invitations.
- **`groupId`** *(string)*: ID of the group.
- **`groupName`** *(string)*: Name of the group.
- **`inviterUid`** *(string)*: UID of the inviter.
- **`toUid`** *(string)*: UID of the invited user.
- **`status`** *(string)*: Invite state. Values: `'pending' | 'accepted' | 'rejected'`.
- **`type`** *(string)*: Invite method. Values: `'manual'` (invited via members search) or `'link'` (joined via shared URL invite link).
- **`createdAt`** *(Timestamp)*: Firebase server timestamp.

### 4. `notifications`
*Path: `/notifications/{id}` (or `/testdata/db/notifications/{id}`)*
System-generated alerts for users (e.g., group expiration notices).
- **`userId`** *(string)*: Recipient's UID.
- **`type`** *(string)*: Type of notification (e.g. `'group_expired'`).
- **`message`** *(string)*: Message body text in Hebrew.
- **`read`** *(boolean)*: True if clicked/opened.
- **`createdAt`** *(Timestamp)*: Time created.

### 5. `systemSettings`
*Path: `/systemSettings/general` (or `/testdata/db/systemSettings/general`)*
System settings document.
- **`groupTimeoutHours`** *(number)*: Expiration window in hours (default: `24`).
- **`groupThresholdPercent`** *(number)*: The percentage of desired group members required to avoid expiration (default: `40`).

### 6. Dynamic Questionnaire Collections
Stores questions created and managed by administrators:
- **`newUsersQuestions`** (Phase 1 registration questions)
- **`userPersonalDataQuestions`** (Phase 2 roommate compatibility questions)
- **`maskirQuestions`** (Phase 2 questionnaire for landlords/apartment managers)
- **`apartmentQuestions`** (Metadata fields for listing apartments)

**Question Object Structure:**
```typescript
{
  id?: string;
  key?: string;           // Key mapping to the user's answer field
  text: string;           // Hebrew question text
  type: string;           // Input type: 'text' | 'yesno' | 'checklist' | 'date' | 'scale' | 'range' | 'radio'
  options?: string[];     // Dropdown/choice list (for checklist & radio)
  min?: number;           // Slider minimum value (for scale & range)
  max?: number;           // Slider maximum value (for scale & range)
  createdAt: string;      // ISO timestamp
}
```

---

## 🔐 6. Role-Based Permissions & Security Rules

Firestore security is locked down in `firestore.rules` using role check functions:

*   **Visitors (Not Logged In):**
    *   Can view questions (read access to `newUsersQuestions`, `userPersonalDataQuestions`, etc.).
    *   Can view listings (read access to `apartments` and `israel_locations`).
    *   Cannot write/modify any data.
*   **Regular Users (Authenticated):**
    *   Can read and write their own profile document (`/profiles/{userId}`).
    *   Can read all groups and profile documents to browse roommates.
    *   Can write/create a group where they are the group admin (`request.resource.data.adminId == request.auth.uid`).
    *   Can update a group to add themselves to the `members` array *if* they possess a valid invite document.
    *   Can delete/accept/decline invitations addressed to them.
*   **Landlords / Maskirs:**
    *   Inherit regular user rights.
    *   Get access to Phase 2 questionnaires tailored to apartments.
    *   Can view and manage their own apartment listings in the database.
*   **Administrators:**
    *   Full read and write override rights on all database collections (settings, questions, groups, cities, properties, profiles).
    *   Can invoke Firebase Cloud Functions to delete users completely.

---

## 🎨 7. Coding Style & CSS Aesthetics

### Coding Style (TypeScript):
- **Standalone components:** Angular standalone files (`standalone: true`) importing `CommonModule`, `FormsModule` directly.
- **Reactive state:** Uses RxJS observables (`BehaviorSubject`) in services to manage user session state (`user$`, `profile$`, `invitations$`). Components subscribe to these feeds to get automated, real-time UI updates.
- **Optimistic Updates:** In network calls (like joining/inviting), the app performs an "optimistic update" (updates the client UI immediately) and rolls back only if the Firebase request throws an error. This keeps the UX snappy.

### User Interface & Aesthetics:
- **Glassmorphism Design:** Semi-transparent glass container boxes (`backdrop-filter: blur(15px); background: rgba(255, 255, 255, 0.04)`) layered on top of a fixed background image of buildings (`assets/building.png`).
- **Color Palette:**
  - Primary color: Emerald Green (`linear-gradient(135deg, #66bb6a 0%, #4caf50 100%)`)
  - Accent / Links: Purple (`linear-gradient(135deg, #7b1fa2 0%, #9c27b0 100%)`)
  - Danger / Cancel: Soft Red (`#ff5252`)
- **Typography:** Uses Google Font `Inter` with fallback system sans-serif fonts.
- **RTL / Hebrew:** Layout elements align right-to-left (`direction: rtl`). Forms, placeholders, and error state messages are customized with natural Hebrew translations.

---

## 🚀 8. Deployment & Scripts

Useful scripts defined in `package.json`:

- `npm start`: Runs local development web server at `http://localhost:4200/`.
- `npm run build`: Compiles the Angular app for deployment.
- `npm run deploy`: Builds the Angular project configuration for production and deploys files directly to Firebase Hosting.
- `npm run deploy:functions`: Deploys Cloud Functions backend API scripts.
- `npm run serve:emulators`: Boots up local Firebase emulators for offline database/auth testing.
