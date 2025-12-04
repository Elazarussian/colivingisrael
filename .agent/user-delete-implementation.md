# User Delete Functionality Implementation Guide

## Overview
Add ability for admins to delete users from both Firebase Authentication and Firestore database.

## Frontend Changes

### 1. HTML Template (profile.component.html)

**Line 30:** Add new column header "פעולות" (Actions) after "תשובות"
```html
<th>פעולות</th>
```

**Line 38:** Add delete button cell after the answers button
```html
<td>
  <button class="btn btn-danger btn-sm" 
          (click)="promptDeleteUser(u)" 
          [disabled]="(u.uid || u.id) === currentUserId"
          [title]="(u.uid || u.id) === currentUserId ? 'לא ניתן למחוק את עצמך' : 'מחק משתמש'">
    מחק
  </button>
</td>
```

### 2. TypeScript Component (profile.component.ts)

Add these properties:
```typescript
currentUserId: string | null = null;
userToDelete: any = null;
showDeleteConfirm = false;
deleteError = '';
```

Add these methods:
```typescript
async ngOnInit() {
  this.auth.reloadProfile();
  const user = await firstValueFrom(this.auth.user$);
  this.currentUserId = user?.uid || null;
}

promptDeleteUser(userProfile: any) {
  this.userToDelete = userProfile;
  this.showDeleteConfirm = true;
  this.deleteError = '';
}

cancelDeleteUser() {
  this.showDeleteConfirm = false;
  this.userToDelete = null;
  this.deleteError = '';
}

async confirmDeleteUser() {
  if (!this.userToDelete) return;
  
  const uid = this.userToDelete.uid || this.userToDelete.id;
  const email = this.userToDelete.email;
  
  try {
    // Delete from Firestore profiles collection
    if (this.auth.db) {
      const { doc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(this.auth.db, 'profiles', uid));
    }
    
    // Call Firebase Function to delete from Authentication
    // Note: This requires a backend Firebase Function
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const functions = getFunctions();
    const deleteUserFn = httpsCallable(functions, 'deleteUser');
    await deleteUserFn({ uid });
    
    // Remove from local list
    this.allUsers = this.allUsers.filter(u => (u.uid || u.id) !== uid);
    this.showDeleteConfirm = false;
    this.userToDelete = null;
    this.cdr.detectChanges();
    
    alert(`משתמש ${email} נמחק בהצלחה`);
  } catch (error: any) {
    console.error('Error deleting user:', error);
    this.deleteError = 'שגיאה במחיקת המשתמש: ' + (error.message || 'שגיאה לא ידועה');
  }
}
```

### 3. Add Delete Confirmation Modal to HTML

Add before closing `</section>` tag:
```html
<!-- Delete User Confirmation Modal -->
<div *ngIf="showDeleteConfirm" class="modal-overlay">
  <div class="modal-content" style="max-width: 500px;">
    <div class="modal-header">
      <h2>אישור מחיקת משתמש</h2>
      <button class="btn-close" (click)="cancelDeleteUser()">X</button>
    </div>
    <div class="modal-body">
      <p style="margin-bottom: 1rem;">האם אתה בטוח שברצונך למחוק את המשתמש?</p>
      <div *ngIf="userToDelete" style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
        <p><strong>UID:</strong> {{ userToDelete.uid || userToDelete.id }}</p>
        <p><strong>אימייל:</strong> {{ userToDelete.email }}</p>
        <p><strong>תפקיד:</strong> {{ userToDelete.role }}</p>
      </div>
      <p style="color: #ff6b6b; font-weight: 600;">פעולה זו תמחק את המשתמש מ:</p>
      <ul style="color: #ff6b6b;">
        <li>Firebase Authentication</li>
        <li>Firestore Profiles Collection</li>
      </ul>
      <p style="color: #ff6b6b; font-weight: 600;">פעולה זו אינה הפיכה!</p>
      
      <div *ngIf="deleteError" class="error-message" style="margin-top: 1rem;">
        {{ deleteError }}
      </div>
      
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem;">
        <button class="btn btn-regular" (click)="cancelDeleteUser()">ביטול</button>
        <button class="btn btn-danger" (click)="confirmDeleteUser()">כן, מחק משתמש</button>
      </div>
    </div>
  </div>
</div>
```

## Backend Changes (Firebase Functions)

Create `functions/src/index.ts`:
```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

export const deleteUser = functions.https.onCall(async (data, context) => {
  // Check if requester is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  // Check if requester is admin
  const requesterUid = context.auth.uid;
  const requesterProfile = await admin.firestore().collection('profiles').doc(requesterUid).get();
  const requesterRole = requesterProfile.data()?.role;
  
  if (requesterRole !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can delete users');
  }
  
  const { uid } = data;
  
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'UID is required');
  }
  
  // Prevent self-deletion
  if (uid === requesterUid) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot delete yourself');
  }
  
  try {
    // Delete from Authentication
    await admin.auth().deleteUser(uid);
    
    // Delete from Firestore (if not already deleted)
    await admin.firestore().collection('profiles').doc(uid).delete();
    
    return { success: true, message: 'User deleted successfully' };
  } catch (error: any) {
    console.error('Error deleting user:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
```

## Deployment Steps

1. Install Firebase Functions dependencies:
```bash
cd functions
npm install firebase-functions firebase-admin
```

2. Deploy the function:
```bash
firebase deploy --only functions
```

3. Update Firestore security rules to allow admins to delete profiles:
```
match /profiles/{userId} {
  allow delete: if request.auth != null && 
                   get(/databases/$(database)/documents/profiles/$(request.auth.uid)).data.role == 'admin';
}
```

4. Deploy security rules:
```bash
firebase deploy --only firestore:rules
```
