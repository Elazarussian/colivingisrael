import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

interface Question {
  id?: string;
  text: string;
  type: string;
  options?: string[];
  createdAt?: string;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  styles: [
    `
    .profile-page { padding: 6rem 1rem 2rem; min-height: 70vh; }
    h1 { margin-top: 0; }
  `]
})
export class ProfileComponent implements OnInit {
  user$ = this.auth.user$;
  profile: any = null;
  editing = false;
  edit: any = { displayName: '', city: '', about: '' };
  showLogoutConfirm = false;
  // Admin mode lists
  allUsers: any[] = [];
  selectedUser: any = null;
  allUsersError: string | null = null;
  showUsersTable = false;

  // Password change properties
  changingPassword = false;
  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  passwordError = '';
  passwordSuccess = '';

  // Questions Management
  showQuestionsModal = false;
  questions: Question[] = [];
  newQuestion: Question = {
    text: '',
    type: 'text',
    options: []
  };
  newOption = '';

  constructor(private auth: AuthService, private router: Router, private cdr: ChangeDetectorRef) {
    this.auth.profile$.subscribe(p => {
      this.profile = p;
    });
  }

  fieldOrDefault(field: string, userFallback: any = null, def: string = '-') {
    const v = this.profile && (this.profile as any)[field];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    if (userFallback !== undefined && userFallback !== null && String(userFallback).trim() !== '') return userFallback;
    return def;
  }

  isAdmin(): boolean {
    return this.auth.isAdmin(this.profile);
  }

  isModerator(): boolean {
    return this.auth.isModerator(this.profile);
  }

  getUserRole(): string {
    return this.auth.getUserRole(this.profile);
  }

  ngOnInit() {
    this.auth.reloadProfile();
    this.auth.user$.subscribe(async (u: any) => {
      if (u && u.uid) {
        try {
          const p = await this.auth.getProfile(u.uid);
          console.log('Profile loaded:', p);
          console.log('Is admin?', this.auth.isAdmin(p));
          if (p) {
            this.profile = p;
            this.cdr.detectChanges();
          }
        } catch (e) {
          console.error('Error loading profile:', e);
        }
      }
    });
  }

  toggleUsersTable() {
    this.showUsersTable = !this.showUsersTable;
    if (this.showUsersTable && this.allUsers.length === 0) {
      this.loadAllUsers();
    }
  }

  async loadAllUsers() {
    if (!this.auth.db) return;
    try {
      const user = await firstValueFrom(this.auth.user$);
      console.log('AUTH USER UID:', user?.uid);

      if (user && typeof user.getIdTokenResult === 'function') {
        try {
          const tokenResult = await user.getIdTokenResult(true);
          console.log('AUTH TOKEN claims:', tokenResult.claims);
        } catch (tokErr) {
          console.warn('Could not get id token:', tokErr);
        }
      }

      const { doc, getDoc, collection, getDocs } = await import('firebase/firestore');

      const profileDocRef = doc(this.auth.db, 'profiles', user?.uid || '');
      const profileDocSnap = await getDoc(profileDocRef);
      if (profileDocSnap.exists()) {
        const profileData = profileDocSnap.data() as any;
        console.log('DEBUG: Current user PROFILE data:', profileData);
        console.log('DEBUG: Current user PROFILE role:', profileData['role']);
      } else {
        console.warn('DEBUG: No PROFILE document found for current user!');
      }

      const profilesCol = collection(this.auth.db, 'profiles');
      const snapshot = await getDocs(profilesCol);
      this.allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      this.allUsersError = null;
      this.cdr.detectChanges();
    } catch (err: any) {
      console.error('Error loading profiles:', err);
      if (err && err.code === 'permission-denied') {
        this.allUsersError = 'הרשאות חסרות: ודא ש-role=admin מופיע בטוקן שלך או ב-Firestore.';
      } else {
        this.allUsersError = 'שגיאה בטעינת משתמשים.';
      }
      this.cdr.detectChanges();
    }
  }

  async viewUser(uid: string) {
    if (!this.auth.db) return;
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const ref = doc(this.auth.db, 'profiles', uid);
      const snap = await getDoc(ref);
      this.selectedUser = snap.exists() ? snap.data() : null;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  }

  // Questions Management Methods
  openNewUserQuestions() {
    this.showQuestionsModal = true;
    this.loadQuestions();
  }

  closeQuestionsModal() {
    this.showQuestionsModal = false;
  }

  async loadQuestions() {
    if (!this.auth.db) return;
    try {
      const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const q = query(collection(this.auth.db, 'newUsersQuestions'), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      this.questions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error loading questions:', err);
    }
  }

  async addQuestion() {
    if (!this.newQuestion.text) return;
    if (!this.auth.db) return;

    try {
      const { collection, addDoc } = await import('firebase/firestore');
      await addDoc(collection(this.auth.db, 'newUsersQuestions'), {
        text: this.newQuestion.text,
        type: this.newQuestion.type,
        options: this.newQuestion.options || [],
        createdAt: new Date().toISOString()
      });

      // Reset form
      this.newQuestion = { text: '', type: 'text', options: [] };
      this.newOption = '';

      // Reload list
      await this.loadQuestions();
    } catch (err) {
      console.error('Error adding question:', err);
    }
  }

  async deleteQuestion(id: string) {
    if (!confirm('האם אתה בטוח שברצונך למחוק שאלה זו?')) return;
    if (!this.auth.db) return;

    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(this.auth.db, 'newUsersQuestions', id));
      await this.loadQuestions();
    } catch (err) {
      console.error('Error deleting question:', err);
    }
  }

  addOption() {
    if (this.newOption.trim()) {
      if (!this.newQuestion.options) {
        this.newQuestion.options = [];
      }
      this.newQuestion.options.push(this.newOption.trim());
      this.newOption = '';
    }
  }

  removeOption(index: number) {
    if (this.newQuestion.options) {
      this.newQuestion.options.splice(index, 1);
    }
  }

  startEdit() {
    this.editing = true;
    this.edit = {
      displayName: this.profile?.displayName || '',
      city: this.profile?.city || '',
      about: this.profile?.about || ''
    };
  }

  cancelEdit() {
    this.editing = false;
    this.edit = { displayName: '', city: '', about: '' };
  }

  async save() {
    const currentUser = await firstValueFrom(this.auth.user$);
    const uid = currentUser?.uid || this.profile?.uid;

    if (!uid) {
      console.error('No UID found, cannot save.');
      return;
    }

    const cleanedEdit: any = {};
    Object.entries(this.edit || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') cleanedEdit[k] = v;
    });
    const data = { ...this.profile, ...cleanedEdit };

    this.profile = data;
    this.editing = false;
    this.cdr.detectChanges();

    try {
      await this.auth.saveProfile(uid, data);
      console.log('Profile saved successfully to backend.');
    } catch (error) {
      console.error('Error saving profile to backend:', error);
      alert('Changes saved locally. Sync to server failed (check connection).');
    }
  }

  async logout() {
    await this.auth.signOutUser();
    this.router.navigate(['/']);
  }

  promptLogout() {
    this.showLogoutConfirm = true;
  }

  cancelLogout() {
    this.showLogoutConfirm = false;
  }

  async confirmLogout() {
    this.showLogoutConfirm = false;
    await this.logout();
  }

  startChangePassword() {
    this.changingPassword = true;
    this.passwordError = '';
    this.passwordSuccess = '';
    this.passwordForm = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
  }

  cancelChangePassword() {
    this.changingPassword = false;
    this.passwordError = '';
    this.passwordSuccess = '';
    this.passwordForm = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    };
  }

  async submitPasswordChange() {
    this.passwordError = '';
    this.passwordSuccess = '';

    if (!this.passwordForm.currentPassword) {
      this.passwordError = 'נא להזין את הסיסמה הנוכחית';
      return;
    }

    if (!this.passwordForm.newPassword) {
      this.passwordError = 'נא להזין סיסמה חדשה';
      return;
    }

    if (this.passwordForm.newPassword.length < 6) {
      this.passwordError = 'הסיסמה החדשה חייבת להכיל לפחות 6 תווים';
      return;
    }

    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.passwordError = 'הסיסמאות אינן תואמות';
      return;
    }

    if (this.passwordForm.currentPassword === this.passwordForm.newPassword) {
      this.passwordError = 'הסיסמה החדשה זהה לסיסמה הנוכחית';
      return;
    }

    try {
      await this.auth.changePassword(
        this.passwordForm.currentPassword,
        this.passwordForm.newPassword
      );

      this.passwordSuccess = 'הסיסמה שונתה בהצלחה!';

      setTimeout(() => {
        this.cancelChangePassword();
      }, 2000);

    } catch (error: any) {
      console.error('Password change error:', error);
      const errorCode = error?.code || error?.message || 'unknown';
      this.passwordError = this.auth.getHebrewErrorMessage(errorCode);
    }
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
