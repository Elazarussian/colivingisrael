# Role-Based Permission System - Implementation Guide

## Overview
Implemented a secure, Firestore-based role permission system that supports multiple user roles (admin, moderator, user) without exposing sensitive information in the frontend code.

## Security Improvements
✅ **No hardcoded emails** - Admin identities are not exposed in frontend code  
✅ **Server-side storage** - Roles stored securely in Firestore  
✅ **Scalable** - Easy to add/remove admins and moderators  
✅ **Hierarchical permissions** - Role hierarchy system (admin > moderator > user)

---

## Role Hierarchy

| Role | Level | Permissions |
|------|-------|-------------|
| **admin** | 3 | Full access to all features |
| **moderator** | 2 | Moderate access (can be customized) |
| **user** | 1 | Standard user access (default) |

---

## How to Set User Roles

### Method 1: Firebase Console (Recommended)
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **CoLivingIsrael**
3. Navigate to **Firestore Database**
4. Find the `profiles` collection
5. Locate the user document by their UID
6. Add/Edit the `role` field:
   - For admin: Set `role` to `"admin"`
   - For moderator: Set `role` to `"moderator"`
   - For regular user: Set `role` to `"user"` (or leave empty, defaults to "user")

### Method 2: Programmatically (Advanced)
You can create an admin script to set roles:

```typescript
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase-config';

async function setUserRole(uid: string, role: 'admin' | 'moderator' | 'user') {
  const userRef = doc(db, 'profiles', uid);
  await setDoc(userRef, { role }, { merge: true });
  console.log(`User ${uid} role set to ${role}`);
}

// Example usage:
// setUserRole('USER_UID_HERE', 'admin');
```

---

## Setting superman@coliving.com as Admin

### Step-by-Step:
1. Have the user `superman@coliving.com` log in at least once
2. This creates their profile document in Firestore
3. Go to Firebase Console → Firestore Database → `profiles` collection
4. Find the document with the email `superman@coliving.com`
5. Note the document ID (this is the UID)
6. Edit the document and add field:
   - **Field**: `role`
   - **Type**: string
   - **Value**: `admin`
7. Save the document
8. User needs to log out and log back in to see the changes

---

## Implementation Details

### AuthService Methods

```typescript
// Get user's role (defaults to 'user')
getUserRole(profile: any): string

// Check if user is admin
isAdmin(profile: any): boolean

// Check if user is moderator
isModerator(profile: any): boolean

// Check if user has required permission level
hasPermission(profile: any, requiredRole: 'admin' | 'moderator' | 'user'): boolean
```

### Usage in Components

```typescript
// In any component:
constructor(private auth: AuthService) {}

// Check if current user is admin
if (this.auth.isAdmin(this.profile)) {
  // Show admin features
}

// Check if user has at least moderator permission
if (this.auth.hasPermission(this.profile, 'moderator')) {
  // Show moderator features
}
```

---

## Profile Page Features

### Visual Badges
- **Admin Badge**: Large red badge with "ADMIN" text
- **Moderator Badge**: Medium blue badge with "MODERATOR" text  
- **Role Display**: Shows user's role in profile information

### Badge Styling
- **Admin**: Red gradient, 2.5rem font, pulsing animation
- **Moderator**: Blue gradient, 1.8rem font, pulsing animation
- Both badges have subtle animations to draw attention

---

## Firestore Security Rules

**IMPORTANT**: Update your Firestore security rules to prevent users from changing their own roles:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /profiles/{userId} {
      // Users can read their own profile
      allow read: if request.auth != null && request.auth.uid == userId;
      
      // Users can update their profile EXCEPT the role field
      allow update: if request.auth != null 
                    && request.auth.uid == userId
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role']);
      
      // Users can create their profile (on first login)
      allow create: if request.auth != null && request.auth.uid == userId;
      
      // Only admins can modify roles (implement admin check via custom claims or backend)
      // For now, roles must be set manually via Firebase Console
    }
  }
}
```

---

## Future Enhancements

### 1. Custom Claims (More Secure)
Use Firebase Custom Claims for even better security:
- Roles stored in Firebase Auth tokens
- No need to query Firestore for every permission check
- Requires Cloud Functions

### 2. Admin Panel
Create an admin-only page where admins can:
- View all users
- Assign/change user roles
- Manage permissions

### 3. More Granular Permissions
Add specific permissions beyond roles:
- `canEditPosts`
- `canDeleteComments`
- `canBanUsers`
- etc.

### 4. Role-Based Routing
Protect routes based on user roles:
```typescript
canActivate: [AuthGuard, RoleGuard],
data: { requiredRole: 'admin' }
```

---

## Testing

### Test Scenarios:
1. ✅ Regular user sees no badge, role shows "user"
2. ✅ Moderator sees blue badge, role shows "moderator"
3. ✅ Admin sees red badge, role shows "admin"
4. ✅ Users cannot edit their own role field
5. ✅ Role persists across sessions

### Test Users:
- **Admin**: `superman@coliving.com` (after setting role in Firestore)
- **Regular User**: Any other user

---

## Troubleshooting

### Badge not showing?
1. Check Firestore - is the `role` field set correctly?
2. Log out and log back in
3. Check browser console for errors
4. Verify profile is loading: `console.log(this.profile)`

### Role not updating?
1. Clear browser cache
2. Check Firestore security rules
3. Ensure user logged out and back in after role change

### Permission denied errors?
1. Update Firestore security rules
2. Ensure user is authenticated
3. Check that profile document exists

---

## Summary

This implementation provides:
- ✅ Secure role-based permissions
- ✅ No hardcoded admin emails
- ✅ Easy role management via Firebase Console
- ✅ Visual badges for admins and moderators
- ✅ Scalable permission system
- ✅ Hierarchical role checking

The system is production-ready and can be extended with more roles and permissions as needed!
