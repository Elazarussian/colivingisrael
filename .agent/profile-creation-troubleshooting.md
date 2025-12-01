# Profile Creation Troubleshooting Guide

## Issue: Profile not created for superman@coliving.com

### Steps to Debug:

1. **Check Browser Console**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for errors related to Firestore or profile creation
   - Look for messages like "Created profile for user:" or "Error in auth state change:"

2. **Check Firestore Rules**
   - ✅ **DONE**: Updated and deployed firestore.rules
   - Rules now allow profile creation for authenticated users

3. **Verify Authentication**
   - Make sure you're logged in as superman@coliving.com
   - Check that Firebase Auth shows the user is authenticated

4. **Manual Profile Creation (If Needed)**
   If automatic creation still fails, create the profile manually:
   
   a. Go to Firebase Console: https://console.firebase.google.com/
   b. Select project: israelcoliving
   c. Go to Firestore Database
   d. Click "Start collection" or open "profiles" collection
   e. Add document with ID = your UID (from Firebase Auth)
   f. Add fields:
      - `uid`: (string) your UID
      - `email`: (string) "superman@coliving.com"
      - `displayName`: (string) "Super Admin"
      - `role`: (string) "admin"
      - `createdAt`: (timestamp) now

5. **Test Profile Creation**
   - Log out completely
   - Clear browser cache (Ctrl+Shift+Delete)
   - Log back in as superman@coliving.com
   - Check browser console for "Created profile for user:" message
   - Check Firestore Database for new profile document

6. **Check Network Tab**
   - Open DevTools → Network tab
   - Filter by "firestore"
   - Log in again
   - Look for requests to Firestore
   - Check if any requests are failing (red status)

## Common Issues:

### Issue 1: Permission Denied
**Symptom**: Error in console: "Missing or insufficient permissions"
**Solution**: 
- Firestore rules have been updated and deployed
- Wait 1-2 minutes for rules to propagate
- Try logging out and back in

### Issue 2: Profile Created but Missing Fields
**Symptom**: Profile exists but no email or role
**Solution**:
- Log out and log back in (triggers ensureProfileExists)
- Or manually add fields in Firebase Console

### Issue 3: Multiple Login Attempts
**Symptom**: Logged in multiple times but still no profile
**Solution**:
- Check browser console for specific errors
- Verify internet connection
- Check Firebase Console → Firestore → Usage to see if writes are happening

## Quick Test Script

Open browser console and run:
```javascript
// Check if user is authenticated
firebase.auth().currentUser

// Check current profile
// (This will be available in your app's AuthService)
```

## Next Steps:

1. **Log out** from the application
2. **Clear browser cache** (Ctrl+Shift+Delete)
3. **Log back in** as superman@coliving.com
4. **Open browser console** (F12) and look for:
   - "Created profile for user: [UID]" ← Success message
   - Any error messages
5. **Check Firestore** in Firebase Console
6. **If still not working**, create profile manually (see step 4 above)

## After Profile is Created:

1. Set role to "admin" in Firebase Console
2. Log out and back in
3. Admin badge should appear on profile page
