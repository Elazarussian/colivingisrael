import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

interface Question {
  id?: string;
  text: string;
  type: string;
  options?: string[];
  min?: number;
  max?: number;
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
  currentUserId: string | null = null;


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
    type: 'yesno',
    options: [],
    min: 1,
    max: 5
  };
  newOption = '';

  // Onboarding (for new users)
  showOnboardingModal = false;
  onboardingQuestions: Question[] = [];
  onboardingAnswers: { [questionId: string]: any } = {};
  // Prevent showing onboarding multiple times during lifecycle
  onboardingPrompted = false;

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute, private cdr: ChangeDetectorRef) {
    // Keep local profile updated and trigger onboarding when profile becomes available
    this.auth.profile$.subscribe(async (p) => {
      this.profile = p;
      if (!p || this.onboardingPrompted) return;

      try {
        const showOnboardingRequested = this.route.snapshot.queryParams['showOnboarding'] === '1';
        const hasAnswered = p['questions'] && Object.keys(p['questions'] || {}).length > 0;

        // Only show onboarding if explicitly requested (signup flow)
        // OR if the profile was just created and has no answers (new user registration)
        const isNewProfile = !hasAnswered && this.isRecentlyCreated(p, 15);
        if (showOnboardingRequested || isNewProfile) {
          await this.loadOnboardingQuestions();
          if (this.onboardingQuestions.length > 0) {
            this.prepareOnboardingAnswers();
            this.showOnboardingModal = true;
            this.cdr.detectChanges();
          }
        }
      } catch (err) {
        console.error('Error during onboarding trigger:', err);
      } finally {
        this.onboardingPrompted = true;
      }
    });
  }

  // Returns true if profile.createdAt is within the last `minutes` minutes
  isRecentlyCreated(profile: any, minutes: number = 15): boolean {
    if (!profile) return false;
    const created = profile['createdAt'] || profile.createdAt;
    if (!created) return false;
    const d = new Date(created);
    if (isNaN(d.getTime())) return false;
    const ageMs = Date.now() - d.getTime();
    return ageMs <= minutes * 60 * 1000;
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

  async ngOnInit() {
    // Trigger a profile reload; onboarding is handled in the profile$ subscription above
    this.auth.reloadProfile();
    // Get current user ID for preventing self-deletion
    const user = await firstValueFrom(this.auth.user$);
    this.currentUserId = user?.uid || null;
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

  // Load onboarding questions for newly registered users
  async loadOnboardingQuestions() {
    if (!this.auth.db) return;
    try {
      const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const q = query(collection(this.auth.db, 'newUsersQuestions'), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      this.onboardingQuestions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error loading onboarding questions:', err);
    }
  }

  prepareOnboardingAnswers() {
    this.currentQuestionIndex = 0;
    this.onboardingAnswers = {};
    for (const q of this.onboardingQuestions) {
      const id = q.id || '';
      // If profile already has a saved answer, use it
      if (this.profile && this.profile.questions && this.profile.questions[id] !== undefined) {
        this.onboardingAnswers[id] = this.profile.questions[id];
        continue;
      }
      switch (q.type) {
        case 'checklist':
          this.onboardingAnswers[id] = [];
          break;
        case 'yesno':
          this.onboardingAnswers[id] = null;
          break;
        case 'scale':
          this.onboardingAnswers[id] = q.min || 1;
          break;
        case 'date':
          this.onboardingAnswers[id] = '';
          break;
        case 'range':
          this.onboardingAnswers[id] = { min: q.min || 0, max: q.max || 100 };
          break;
        default:
          this.onboardingAnswers[id] = '';
      }
    }
  }

  async submitOnboardingAnswers() {
    const currentUser = await firstValueFrom(this.auth.user$);
    const uid = currentUser?.uid || this.profile?.uid;
    if (!uid) return;

    // Build answers object mapping questionId -> answer
    const answers: any = {};
    for (const q of this.onboardingQuestions) {
      const id = q.id || '';
      const ans = this.onboardingAnswers[id];
      // Normalize empty answers to undefined so saveProfile won't persist empty strings
      if (q.type === 'checklist') {
        answers[id] = Array.isArray(ans) ? ans : [];
      } else if (q.type === 'yesno') {
        // store boolean true/false or null
        answers[id] = ans === null ? null : !!ans;
      } else if (q.type === 'scale') {
        answers[id] = Number(ans);
      } else {
        answers[id] = ans || '';
      }
    }

    try {
      // Save into profiles/{uid}.questions as an object
      await this.auth.saveProfile(uid, { questions: answers });
      // Update local profile and close modal
      this.profile = { ...this.profile, questions: answers };
      this.showOnboardingModal = false;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error saving onboarding answers:', err);
      alert('שגיאה בשמירת תשובות. יש לנסות שוב מאוחר יותר.');
    }
  }

  // Helper for template checkbox toggling
  toggleChecklist(current: any[] | undefined, option: string) {
    const arr = Array.isArray(current) ? [...current] : [];
    const idx = arr.indexOf(option);
    if (idx === -1) arr.push(option);
    else arr.splice(idx, 1);
    return arr;
  }

  // Sequential Onboarding State
  currentQuestionIndex = 0;

  get currentOnboardingQuestion(): Question | undefined {
    return this.onboardingQuestions[this.currentQuestionIndex];
  }

  get isLastOnboardingQuestion(): boolean {
    return this.currentQuestionIndex === this.onboardingQuestions.length - 1;
  }

  get currentOnboardingProgress(): string {
    if (this.onboardingQuestions.length === 0) return '';
    return `${this.currentQuestionIndex + 1} / ${this.onboardingQuestions.length}`;
  }

  nextQuestion() {
    if (this.canProceedWithQuestion()) {
      this.currentQuestionIndex++;
    }
  }

  prevQuestion() {
    if (this.currentQuestionIndex > 0) {
      this.currentQuestionIndex--;
    }
  }

  canProceedWithQuestion(): boolean {
    const q = this.currentOnboardingQuestion;
    if (!q) return false;
    const id = q.id || '';
    const ans = this.onboardingAnswers[id];

    if (q.type === 'checklist') {
      if (!Array.isArray(ans) || ans.length === 0) return false;
    } else if (q.type === 'yesno') {
      if (ans !== true && ans !== false) return false;
    } else if (q.type === 'scale') {
      if (ans === undefined || ans === null || isNaN(ans)) return false;
    } else if (q.type === 'date') {
      if (!ans || String(ans).trim() === '') return false;
    } else if (q.type === 'range') {
      if (!ans || typeof ans.min !== 'number' || typeof ans.max !== 'number') return false;
      if (ans.min > ans.max) return false;
      // Optional: enforce bounds if strict validation is needed
      if (q.min !== undefined && ans.min < q.min) return false;
      if (q.max !== undefined && ans.max > q.max) return false;
    } else {
      // text or other
      if (!ans || String(ans).trim() === '') return false;
    }
    return true;
  }

  // Ensure all onboarding questions have an answer (global check, though we enforce per step now)
  canSubmitOnboarding(): boolean {
    // We rely on step-by-step validation, but final check doesn't hurt
    return this.onboardingQuestions.length > 0 && this.canProceedWithQuestion();
  }

  // --- Admin: view another user's answers ---
  showUserAnswersModal = false;
  viewedUser: any = null;
  viewedUserAnswers: { [k: string]: any } | null = null;
  viewedQuestionIds: string[] = [];
  questionTextMap: { [id: string]: string } = {};

  async openUserAnswers(userProfile: any) {
    if (!this.auth.db) return;
    try {
      this.viewedUser = userProfile;

      // load user's profile doc to get questions (answers)
      const { doc, getDoc, collection, getDocs } = await import('firebase/firestore');
      const ref = doc(this.auth.db, 'profiles', userProfile.uid || userProfile.id);
      const snap = await getDoc(ref);
      this.viewedUserAnswers = snap.exists() ? (snap.data() as any).questions || {} : {};

      // load questions to map id -> text
      const qcol = collection(this.auth.db, 'newUsersQuestions');
      const qsnap = await getDocs(qcol);
      this.questionTextMap = {};
      qsnap.docs.forEach(d => {
        const data: any = d.data();
        this.questionTextMap[d.id] = data.text || '';
      });

      this.viewedQuestionIds = Object.keys(this.viewedUserAnswers || {});
      this.showUserAnswersModal = true;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error loading user answers:', err);
      alert('שגיאה בטעינת תשובות המשתמש');
    }
  }

  closeUserAnswersModal() {
    this.showUserAnswersModal = false;
    this.viewedUser = null;
    this.viewedUserAnswers = null;
    this.viewedQuestionIds = [];
    this.questionTextMap = {};
  }

  formatAnswer(ans: any) {
    if (ans === null || ans === undefined) return '-';
    if (Array.isArray(ans)) return ans.join(', ');
    if (typeof ans === 'boolean') return ans ? 'כן' : 'לא';
    if (ans && typeof ans === 'object' && 'min' in ans && 'max' in ans) {
      return `${ans.min} - ${ans.max}`;
    }
    return String(ans);
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
        min: (this.newQuestion.type === 'scale' || this.newQuestion.type === 'range') ? (this.newQuestion.min || 1) : null,
        max: (this.newQuestion.type === 'scale' || this.newQuestion.type === 'range') ? (this.newQuestion.max || 5) : null,
        createdAt: new Date().toISOString()
      });

      // Reset form
      this.newQuestion = { text: '', type: 'yesno', options: [], min: 1, max: 5 };
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
