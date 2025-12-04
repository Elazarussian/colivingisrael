<!-- MANUAL EDIT INSTRUCTIONS FOR profile.component.html -->

## Step 1: Add "פעולות" column header (around line 30)

Find this line:
                <th>תשובות</th>

Add this line right after it:
                <th>פעולות</th>

## Step 2: Add delete button (around line 38)

Find this line:
                <td><button class="btn btn-regular btn-sm" (click)="openUserAnswers(u)">תשובות</button></td>

Add these lines right after it:
                <td>
                  <button class="btn btn-danger btn-sm" 
                          (click)="promptDeleteUser(u)" 
                          [disabled]="(u.uid || u.id) === currentUserId"
                          [title]="(u.uid || u.id) === currentUserId ? 'לא ניתן למחוק את עצמך' : 'מחק משתמש'">
                    מחק
                  </button>
                </td>

## Step 3: Add delete confirmation modal (at the very end, before the last </div>)

Find the very last lines of the file (around line 325-326):
  </div>
</div>

Replace with:
  </div>
</div>

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
