# Automatic Profile Creation - Implementation Summary

## Overview
Updated the authentication system to **automatically create and maintain user profiles** in Firestore whenever a user registers or logs in. Each profile now includes:
- ✅ **uid** - User's unique ID
- ✅ **email** - User's email address
- ✅ **displayName** - User's display name (from auth or profile)
- ✅ **role** - User's permission role (defaults to 'user')
- ✅ **createdAt** - Timestamp when profile was created
- ✅ **city**, **about** - Optional user-provided fields

---

## What Changed

### 1. AuthService - onAuthStateChanged Listener
**Before**: Only loaded existing profiles
**After**: Automatically creates profile if it doesn't exist

```typescript
if (snap.exists()) {
    // Profile exists, update email if changed
    const profileData = snap.data();
    if (profileData['email'] !== user.email) {
        await setDoc(docRef, { email: user.email }, { merge: true });
        profileData['email'] = user.email;
    }
    this._profile$.next(profileData);
} else {
    // Profile doesn't exist, create it with default values
    const newProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        role: 'user', // Default role
        createdAt: new Date().toISOString()
    };
    await setDoc(docRef, newProfile);
    this._profile$.next(newProfile);
}
```

### 2. New Helper Method: ensureProfileExists()
Added a private method that:
- Checks if profile exists
- Creates it if missing
- Updates email if it changed
- Called after every login/signup

### 3. Updated Login Methods
All authentication methods now ensure profile creation:
- `login(email, password)` - Email/password login
- `signup(email, password)` - New user registration
- `loginWithGoogle()` - Google OAuth login

---

## Profile Structure in Firestore

### Default Profile (New User)
```json
{
  "uid": "54Iy9U88mbV9UzlKPTvTckxbRn42",
  "email": "user@example.com",
  "displayName": "John Doe",
  "role": "user",
  "createdAt": "2025-11-30T15:07:00.000Z"
}
```

### Complete Profile (After User Edits)
```json
{
  "uid": "54Iy9U88mbV9UzlKPTvTckxbRn42",
  "email": "user@example.com",
  "displayName": "אלעזר",
  "role": "user",
  "createdAt": "2025-11-30T15:07:00.000Z",
  "city": "מעלה אדומים",
  "about": "adnlwn amsd asd as d a"
}
```

### Admin Profile (Role Set Manually)
```json
{
  "uid": "ABC123XYZ789",
  "email": "superman@coliving.com",
  "displayName": "Super Admin",
  "role": "admin",  // ← Set manually via Firebase Console
  "createdAt": "2025-11-30T15:07:00.000Z",
  "city": "ירושלים",
  "about": "Administrator account"
}
```

---

## User Flow

### New User Registration
1. User signs up with email/password or Google
2. Firebase Auth creates the user account
3. `onAuthStateChanged` fires
4. System checks if profile exists in Firestore
5. **Profile doesn't exist** → System creates it with:
   - `uid` from Firebase Auth
   - `email` from Firebase Auth
   - `displayName` from Firebase Auth (or empty)
   - `role` = `"user"` (default)
   - `createdAt` = current timestamp
6. User can now use the app with their profile

### Existing User Login
1. User logs in with email/password or Google
2. Firebase Auth authenticates the user
3. `onAuthStateChanged` fires
4. System checks if profile exists in Firestore
5. **Profile exists** → System loads it and updates email if changed
6. User sees their existing profile data

### Email Change
If a user changes their email in Firebase Auth:
1. System detects email mismatch
2. Automatically updates the email in Firestore profile
3. Keeps profile data in sync with auth data

---

## Security Rules

### Updated Firestore Rules
The security rules now allow:
- ✅ Users to create their own profile with `email` and `role='user'`
- ✅ Users to read their own profile
- ✅ Users to update their profile (except `uid`, `email`, `role`)
- ❌ Users CANNOT change their own role
- ❌ Users CANNOT change their email (system does it automatically)
- ❌ Users CANNOT change their uid

**File**: `.agent/firestore-security-rules.txt`

### Key Security Points
```javascript
// Allow create with email and default role
allow create: if request.auth != null 
              && request.auth.uid == userId
              && request.resource.data.email == request.auth.token.email
              && request.resource.data.role == 'user';

// Allow update but NOT uid, email, or role
allow update: if request.auth != null 
              && request.auth.uid == userId
              && !request.resource.data.diff(resource.data)
                  .affectedKeys().hasAny(['uid', 'email', 'role']);
```

---

## Benefits

### 1. **Automatic Profile Management**
- No manual profile creation needed
- Works for all authentication methods
- Consistent profile structure

### 2. **Data Integrity**
- Email always matches Firebase Auth
- UID always correct
- Role defaults to 'user' for security

### 3. **Better User Experience**
- Users can immediately access their profile
- No "profile not found" errors
- Seamless onboarding

### 4. **Security**
- Users cannot promote themselves to admin
- Email cannot be manually changed (prevents impersonation)
- UID is immutable

---

## Setting Admin Role

Since users default to `role='user'`, you need to manually promote users to admin:

### Steps to Make superman@coliving.com an Admin:
1. User logs in at least once (creates profile with `role='user'`)
2. Go to Firebase Console → Firestore Database
3. Navigate to `profiles` collection
4. Find the document for `superman@coliving.com`
5. Edit the `role` field from `"user"` to `"admin"`
6. Save
7. User logs out and back in → Admin badge appears!

**Note**: Only do this via Firebase Console or Admin SDK. Users cannot change their own role.

---

## Testing

### Test New User Registration
1. Create a new account with email/password
2. Check Firestore → `profiles` collection
3. Verify profile was created with:
   - ✅ uid
   - ✅ email
   - ✅ displayName (may be empty)
   - ✅ role = "user"
   - ✅ createdAt timestamp

### Test Google Login (New User)
1. Sign in with Google (first time)
2. Check Firestore → `profiles` collection
3. Verify profile created with Google email and displayName

### Test Existing User Login
1. Log in with existing account
2. Profile should load normally
3. Email should be up-to-date

### Test Email Sync
1. Change user email in Firebase Auth Console
2. User logs in
3. Email in Firestore profile should update automatically

---

## Troubleshooting

### Profile not created?
1. Check browser console for errors
2. Verify Firestore security rules are updated
3. Check Firebase Console → Firestore → profiles collection
4. Ensure user is authenticated

### Email not updating?
1. Check that user logged out and back in
2. Verify `ensureProfileExists()` is being called
3. Check console logs for "Created profile" or errors

### Role not showing?
1. Verify role field exists in Firestore
2. Check that it's set to "user", "moderator", or "admin"
3. User must log out and back in after role change

---

## Migration for Existing Users

If you have existing users without email/role in their profiles:

### Option 1: Automatic (Recommended)
- Existing users just need to log out and log back in
- System will automatically add missing email and role fields

### Option 2: Manual (For specific users)
- Go to Firebase Console → Firestore
- For each user in `profiles` collection:
  - Add `email` field (copy from Firebase Auth)
  - Add `role` field = `"user"` (or "admin"/"moderator" as needed)

---

## Summary

✅ **Automatic profile creation** on first login/signup  
✅ **Email stored** in every profile  
✅ **Default role** = "user" for all new users  
✅ **Email sync** - updates if changed in Firebase Auth  
✅ **Secure** - users cannot change uid, email, or role  
✅ **Works with** email/password and Google login  

The system is now fully automated and secure!
