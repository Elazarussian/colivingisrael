import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

interface Question {
  id?: string;
  key?: string; // Readable key for the question (e.g. 'firstname')
  text: string;
  textEn?: string;
  textRu?: string;
  textFr?: string;
  type: string;
  options?: string[];
  min?: number;
  max?: number;
  maxSelections?: number; // For checklist: limit number of selections
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

  // Questions Management (Registration Questions)
  showQuestionsModal = false;
  questions: Question[] = [];
  newQuestion: Question = {
    text: '',
    textEn: '',
    textRu: '',
    textFr: '',
    key: '',
    type: 'text',
    options: [],
    min: 1,
    max: 5,
    maxSelections: undefined
  };
  newOption = '';

  // User Personal Data Questions Management
  showPersonalDataQuestionsModal = false;
  personalDataQuestions: Question[] = [];
  newPersonalDataQuestion: Question = {
    text: '',
    textEn: '',
    textRu: '',
    textFr: '',
    key: '',
    type: 'text',
    options: [],
    min: 1,
    max: 5,
    maxSelections: undefined
  };
  newPersonalDataOption = '';

  // Flags for manual key mode
  registrationKeyManualMode = false;
  personalDataKeyManualMode = false;

  // Language management
  currentLang: 'he' | 'en' | 'ru' | 'fr' = 'he';

  // Edit Question State
  showEditQuestionModal = false;
  editingQuestion: Question | null = null;
  isEditPersonalData = false;
  editOption = '';

  // Onboarding (for new users) - Two groups of questions
  showOnboardingModal = false;
  onboardingQuestions: Question[] = []; // Registration questions (personality)
  onboardingPersonalDataQuestions: Question[] = []; // Personal data questions
  onboardingAnswers: { [questionId: string]: any } = {};
  // Prevent showing onboarding multiple times during lifecycle
  onboardingPrompted = false;
  // Track which group we're currently showing (0 = personal data, 1 = personality)
  currentQuestionGroup = 0;

  // Edit Personality Questions (for existing users)
  showEditPersonalityModal = false;
  editPersonalityQuestions: Question[] = [];
  editPersonalityAnswers: { [questionId: string]: any } = {};
  currentEditQuestionIndex = 0;

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
          if (this.onboardingPersonalDataQuestions.length > 0 || this.onboardingQuestions.length > 0) {
            this.currentQuestionGroup = 0; // Start with personal data questions
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

  // Load onboarding questions for newly registered users (both groups)
  async loadOnboardingQuestions() {
    if (!this.auth.db) return;
    try {
      const { collection, getDocs, query, orderBy } = await import('firebase/firestore');

      // Load personal data questions
      const personalDataQuery = query(collection(this.auth.db, 'userPersonalDataQuestions'), orderBy('createdAt', 'asc'));
      const personalDataSnapshot = await getDocs(personalDataQuery);
      this.onboardingPersonalDataQuestions = personalDataSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));

      // Load personality/registration questions
      const registrationQuery = query(collection(this.auth.db, 'newUsersQuestions'), orderBy('createdAt', 'asc'));
      const registrationSnapshot = await getDocs(registrationQuery);
      this.onboardingQuestions = registrationSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));

      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error loading onboarding questions:', err);
    }
  }

  prepareOnboardingAnswers() {
    this.currentQuestionIndex = 0;
    this.onboardingAnswers = {};

    // Prepare answers for both question groups
    const allQuestions = [...this.onboardingPersonalDataQuestions, ...this.onboardingQuestions];

    for (const q of allQuestions) {
      const id = q.id || '';
      const key = q.key || id; // Use key if available, otherwise ID

      // If profile already has a saved answer, use it (check key first, then ID)
      if (this.profile && this.profile.questions) {
        if (this.profile.questions[key] !== undefined) {
          this.onboardingAnswers[id] = this.profile.questions[key];
          continue;
        } else if (this.profile.questions[id] !== undefined) {
          this.onboardingAnswers[id] = this.profile.questions[id];
          continue;
        }
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
        case 'radio':
          this.onboardingAnswers[id] = null;
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

    // Build answers object mapping questionId -> answer (from both groups)
    const answers: any = {};
    const allQuestions = [...this.onboardingPersonalDataQuestions, ...this.onboardingQuestions];

    for (const q of allQuestions) {
      const id = q.id || '';
      const key = q.key || id; // Use key if available, otherwise ID

      const ans = this.onboardingAnswers[id];
      // Normalize empty answers to undefined so saveProfile won't persist empty strings
      if (q.type === 'checklist') {
        answers[key] = Array.isArray(ans) ? ans : [];
      } else if (q.type === 'yesno') {
        // store boolean true/false or null
        answers[key] = ans === null ? null : !!ans;
      } else if (q.type === 'scale') {
        answers[key] = Number(ans);
      } else if (q.type === 'range') {
        answers[key] = ans; // {min, max} object
      } else if (q.type === 'radio') {
        answers[key] = ans;
      } else {
        answers[key] = ans || '';
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
  toggleChecklist(current: any[] | undefined, option: string, maxSelections?: number) {
    const arr = Array.isArray(current) ? [...current] : [];
    const idx = arr.indexOf(option);

    if (idx === -1) {
      // Adding option
      if (maxSelections && arr.length >= maxSelections) {
        alert(`ניתן לבחור עד ${maxSelections} אפשרויות בלבד.`);
        return arr;
      }
      arr.push(option);
    } else {
      // Removing option
      arr.splice(idx, 1);
    }
    return arr;
  }

  // Sequential Onboarding State
  currentQuestionIndex = 0;

  // Get the current active question list based on the group
  get currentQuestionList(): Question[] {
    if (this.currentQuestionGroup === 0) {
      return this.onboardingPersonalDataQuestions;
    } else {
      return this.onboardingQuestions;
    }
  }

  get currentOnboardingQuestion(): Question | undefined {
    return this.currentQuestionList[this.currentQuestionIndex];
  }

  get isLastOnboardingQuestion(): boolean {
    // Last question of current group
    return this.currentQuestionIndex === this.currentQuestionList.length - 1;
  }

  get isLastGroup(): boolean {
    return this.currentQuestionGroup === 1;
  }

  get currentGroupTitle(): string {
    if (this.currentQuestionGroup === 0) {
      return 'פרטי משתמש';
    } else {
      return 'שאלות אישיות';
    }
  }

  get nextGroupPreview(): string {
    if (this.currentQuestionGroup === 0 && this.onboardingQuestions.length > 0) {
      return `הבא: שאלות אישיות (${this.onboardingQuestions.length} שאלות)`;
    }
    return '';
  }

  get currentOnboardingProgress(): string {
    const currentList = this.currentQuestionList;
    if (currentList.length === 0) return '';
    return `${this.currentQuestionIndex + 1} / ${currentList.length}`;
  }

  get totalQuestionsCount(): string {
    const total = this.onboardingPersonalDataQuestions.length + this.onboardingQuestions.length;
    const answered = this.currentQuestionGroup === 0
      ? this.currentQuestionIndex + 1
      : this.onboardingPersonalDataQuestions.length + this.currentQuestionIndex + 1;
    return `${answered} / ${total}`;
  }

  nextQuestion() {
    if (!this.canProceedWithQuestion()) return;

    // If we're at the last question of the current group
    if (this.isLastOnboardingQuestion) {
      // If we're in group 0 (personal data) and there are personality questions
      if (this.currentQuestionGroup === 0 && this.onboardingQuestions.length > 0) {
        // Move to next group
        this.currentQuestionGroup = 1;
        this.currentQuestionIndex = 0;
      }
      // If we're in group 1 (personality), we'll submit via the submit button
    } else {
      // Move to next question in current group
      this.currentQuestionIndex++;
    }
  }

  prevQuestion() {
    if (this.currentQuestionIndex > 0) {
      // Go back within current group
      this.currentQuestionIndex--;
    } else if (this.currentQuestionGroup === 1) {
      // We're at the first question of group 1, go back to last question of group 0
      this.currentQuestionGroup = 0;
      this.currentQuestionIndex = this.onboardingPersonalDataQuestions.length - 1;
    }
  }


  canProceedWithQuestion(): boolean {
    const q = this.currentOnboardingQuestion;
    if (!q) return false;
    const id = q.id || '';
    const ans = this.onboardingAnswers[id];

    if (q.type === 'checklist') {
      if (!Array.isArray(ans) || ans.length === 0) return false;
      // Check maxSelections limit
      if (q.maxSelections && ans.length > q.maxSelections) return false;
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
    } else if (q.type === 'radio') {
      if (!ans || String(ans).trim() === '') return false;
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

      // load questions to map id/key -> text
      const qcol = collection(this.auth.db, 'newUsersQuestions');
      const qsnap = await getDocs(qcol);

      // Also load personal data questions for mapping
      const pdqcol = collection(this.auth.db, 'userPersonalDataQuestions');
      const pdqsnap = await getDocs(pdqcol);

      this.questionTextMap = {};

      const mapQuestion = (d: any) => {
        const data: any = d.data();
        // Map both ID and Key (if exists) to the question text
        this.questionTextMap[d.id] = data.text || '';
        if (data.key) {
          this.questionTextMap[data.key] = data.text || '';
        }
      };

      qsnap.docs.forEach(mapQuestion);
      pdqsnap.docs.forEach(mapQuestion);

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
      const questionData: any = {
        text: this.newQuestion.text,
        textEn: this.newQuestion.textEn || '',
        textRu: this.newQuestion.textRu || '',
        textFr: this.newQuestion.textFr || '',
        key: this.newQuestion.key || null,
        type: this.newQuestion.type,
        createdAt: new Date().toISOString()
      };

      if (this.newQuestion.type === 'checklist' || this.newQuestion.type === 'radio') {
        questionData.options = this.newQuestion.options || [];
      }

      if (this.newQuestion.type === 'scale' || this.newQuestion.type === 'range') {
        questionData.min = this.newQuestion.min || 1;
        questionData.max = this.newQuestion.max || 5;
      }

      if (this.newQuestion.type === 'checklist' && this.newQuestion.maxSelections) {
        questionData.maxSelections = this.newQuestion.maxSelections;
      }

      await addDoc(collection(this.auth.db, 'newUsersQuestions'), questionData);

      // Reset form
      this.newQuestion = { text: '', textEn: '', textRu: '', textFr: '', key: '', type: 'text', options: [], min: 1, max: 5, maxSelections: undefined };
      this.newOption = '';
      this.registrationKeyManualMode = false; // Reset manual mode
      this.currentLang = 'he'; // Reset language

      // Reload list
      await this.loadQuestions();
      // alert('השאלה נוספה בהצלחה!'); // Optional: feedback
    } catch (err) {
      console.error('Error adding question:', err);
      alert('שגיאה בהוספת השאלה. נסה שוב.');
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

  // User Personal Data Questions Management Methods
  openPersonalDataQuestions() {
    this.showPersonalDataQuestionsModal = true;
    this.loadPersonalDataQuestions();
  }

  closePersonalDataQuestionsModal() {
    this.showPersonalDataQuestionsModal = false;
  }

  async loadPersonalDataQuestions() {
    if (!this.auth.db) return;
    try {
      const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const q = query(collection(this.auth.db, 'userPersonalDataQuestions'), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      this.personalDataQuestions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error loading personal data questions:', err);
    }
  }

  async addPersonalDataQuestion() {
    if (!this.newPersonalDataQuestion.text) return;
    if (!this.auth.db) return;

    try {
      const { collection, addDoc } = await import('firebase/firestore');
      const questionData: any = {
        text: this.newPersonalDataQuestion.text,
        textEn: this.newPersonalDataQuestion.textEn || '',
        textRu: this.newPersonalDataQuestion.textRu || '',
        textFr: this.newPersonalDataQuestion.textFr || '',
        key: this.newPersonalDataQuestion.key || null,
        type: this.newPersonalDataQuestion.type,
        createdAt: new Date().toISOString()
      };

      if (this.newPersonalDataQuestion.type === 'checklist' || this.newPersonalDataQuestion.type === 'radio') {
        questionData.options = this.newPersonalDataQuestion.options || [];
      }

      if (this.newPersonalDataQuestion.type === 'scale' || this.newPersonalDataQuestion.type === 'range') {
        questionData.min = this.newPersonalDataQuestion.min || 1;
        questionData.max = this.newPersonalDataQuestion.max || 5;
      }

      if (this.newPersonalDataQuestion.type === 'checklist' && this.newPersonalDataQuestion.maxSelections) {
        questionData.maxSelections = this.newPersonalDataQuestion.maxSelections;
      }

      await addDoc(collection(this.auth.db, 'userPersonalDataQuestions'), questionData);

      // Reset form
      this.newPersonalDataQuestion = { text: '', textEn: '', textRu: '', textFr: '', key: '', type: 'text', options: [], min: 1, max: 5, maxSelections: undefined };
      this.newPersonalDataOption = '';
      this.personalDataKeyManualMode = false; // Reset manual mode
      this.currentLang = 'he'; // Reset language

      // Reload list
      await this.loadPersonalDataQuestions();
    } catch (err) {
      console.error('Error adding personal data question:', err);
      alert('שגיאה בהוספת השאלה. נסה שוב.');
    }
  }

  async deletePersonalDataQuestion(id: string) {
    if (!confirm('האם אתה בטוח שברצונך למחוק שאלה זו?')) return;
    if (!this.auth.db) return;

    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(this.auth.db, 'userPersonalDataQuestions', id));
      await this.loadPersonalDataQuestions();
    } catch (err) {
      console.error('Error deleting personal data question:', err);
    }
  }

  addPersonalDataOption() {
    if (this.newPersonalDataOption.trim()) {
      if (!this.newPersonalDataQuestion.options) {
        this.newPersonalDataQuestion.options = [];
      }
      this.newPersonalDataQuestion.options.push(this.newPersonalDataOption.trim());
      this.newPersonalDataOption = '';
    }
  }

  removePersonalDataOption(index: number) {
    if (this.newPersonalDataQuestion.options) {
      this.newPersonalDataQuestion.options.splice(index, 1);
    }
  }

  // Edit Question Methods
  openEditQuestion(q: Question, isPersonalData: boolean) {
    this.isEditPersonalData = isPersonalData;
    // Deep copy to avoid mutating the list directly before save
    this.editingQuestion = JSON.parse(JSON.stringify(q));
    // Ensure options array exists
    if (!this.editingQuestion!.options) {
      this.editingQuestion!.options = [];
    }
    this.currentLang = 'he'; // Default to Hebrew for editing view
    this.showEditQuestionModal = true;
  }

  closeEditQuestionModal() {
    this.showEditQuestionModal = false;
    this.editingQuestion = null;
    this.editOption = '';
  }

  addEditOption() {
    if (this.editOption.trim() && this.editingQuestion) {
      if (!this.editingQuestion.options) {
        this.editingQuestion.options = [];
      }
      this.editingQuestion.options.push(this.editOption.trim());
      this.editOption = '';
    }
  }

  removeEditOption(index: number) {
    if (this.editingQuestion && this.editingQuestion.options) {
      this.editingQuestion.options.splice(index, 1);
    }
  }

  async updateQuestion() {
    if (!this.editingQuestion || !this.editingQuestion.id || !this.auth.db) return;

    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const collectionName = this.isEditPersonalData ? 'userPersonalDataQuestions' : 'newUsersQuestions';

      const questionData: any = {
        text: this.editingQuestion.text,
        textEn: this.editingQuestion.textEn || '',
        textRu: this.editingQuestion.textRu || '',
        textFr: this.editingQuestion.textFr || '',
        type: this.editingQuestion.type,
        // Key is NOT updated
      };

      if (this.editingQuestion.type === 'checklist' || this.editingQuestion.type === 'radio') {
        questionData.options = this.editingQuestion.options || [];
      } else {
        questionData.options = []; // Clear options if type changed
      }

      if (this.editingQuestion.type === 'scale' || this.editingQuestion.type === 'range') {
        questionData.min = this.editingQuestion.min || 1;
        questionData.max = this.editingQuestion.max || 5;
      } else {
        questionData.min = null;
        questionData.max = null;
      }

      if (this.editingQuestion.type === 'checklist' && this.editingQuestion.maxSelections) {
        questionData.maxSelections = this.editingQuestion.maxSelections;
      } else {
        questionData.maxSelections = null;
      }

      await updateDoc(doc(this.auth.db, collectionName, this.editingQuestion.id), questionData);

      this.closeEditQuestionModal();

      // Reload appropriate list
      if (this.isEditPersonalData) {
        await this.loadPersonalDataQuestions();
      } else {
        await this.loadQuestions();
      }
    } catch (err) {
      console.error('Error updating question:', err);
      alert('שגיאה בעדכון השאלה.');
    }
  }

  // Transliteration Helper
  transliterate(text: string): string {
    const map: { [key: string]: string } = {
      'א': 'a', 'b': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z', 'ח': 'h', 'ט': 't', 'י': 'y',
      'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
      'ף': 'p', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't',
      ' ': '_'
    };

    return text.split('').map(char => {
      if (map[char]) return map[char];
      // Keep English letters and numbers, discard others
      if (/[a-zA-Z0-9]/.test(char)) return char.toLowerCase();
      return '';
    }).join('');
  }

  onQuestionTextChange(isPersonalData: boolean) {
    const q = isPersonalData ? this.newPersonalDataQuestion : this.newQuestion;
    const isManual = isPersonalData ? this.personalDataKeyManualMode : this.registrationKeyManualMode;

    // Auto-generate if not in manual mode
    if (!isManual) {
      if (q.textEn && q.textEn.trim()) {
        q.key = this.transliterate(q.textEn);
      } else if (q.text) {
        q.key = this.transliterate(q.text);
      } else {
        q.key = '';
      }
    }
  }

  toggleKeyManualMode(isPersonalData: boolean) {
    if (isPersonalData) {
      this.personalDataKeyManualMode = !this.personalDataKeyManualMode;
      // If switching back to auto (false), regenerate key immediately
      if (!this.personalDataKeyManualMode) {
        this.onQuestionTextChange(true);
      }
    } else {
      this.registrationKeyManualMode = !this.registrationKeyManualMode;
      // If switching back to auto (false), regenerate key immediately
      if (!this.registrationKeyManualMode) {
        this.onQuestionTextChange(false);
      }
    }
  }

  setLanguage(lang: 'he' | 'en' | 'ru' | 'fr') {
    this.currentLang = lang;
  }

  // Edit Personality Questions Methods
  async startEdit() {
    // Load personality questions and open edit modal
    await this.loadEditPersonalityQuestions();
    if (this.editPersonalityQuestions.length > 0) {
      this.prepareEditPersonalityAnswers();
      this.showEditPersonalityModal = true;
      this.currentEditQuestionIndex = 0;
      this.cdr.detectChanges();
    } else {
      alert('אין שאלות אישיות זמינות לעריכה');
    }
  }

  async loadEditPersonalityQuestions() {
    if (!this.auth.db) return;
    try {
      const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const q = query(collection(this.auth.db, 'newUsersQuestions'), orderBy('createdAt', 'asc'));
      const snapshot = await getDocs(q);
      this.editPersonalityQuestions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error loading personality questions for editing:', err);
    }
  }

  prepareEditPersonalityAnswers() {
    this.editPersonalityAnswers = {};

    for (const q of this.editPersonalityQuestions) {
      const id = q.id || '';
      const key = q.key || id;

      // Load existing answers from profile (check key first, then ID)
      if (this.profile && this.profile.questions) {
        if (this.profile.questions[key] !== undefined) {
          this.editPersonalityAnswers[id] = this.profile.questions[key];
          continue;
        } else if (this.profile.questions[id] !== undefined) {
          this.editPersonalityAnswers[id] = this.profile.questions[id];
          continue;
        }
      }

      // Initialize with defaults if no existing answer
      switch (q.type) {
        case 'checklist':
          this.editPersonalityAnswers[id] = [];
          break;
        case 'yesno':
          this.editPersonalityAnswers[id] = null;
          break;
        case 'scale':
          this.editPersonalityAnswers[id] = q.min || 1;
          break;
        case 'date':
          this.editPersonalityAnswers[id] = '';
          break;
        case 'range':
          this.editPersonalityAnswers[id] = { min: q.min || 0, max: q.max || 100 };
          break;
        case 'radio':
          this.editPersonalityAnswers[id] = null;
          break;
        default:
          this.editPersonalityAnswers[id] = '';
      }
    }
  }

  cancelEdit() {
    this.showEditPersonalityModal = false;
    this.editPersonalityAnswers = {};
    this.currentEditQuestionIndex = 0;
  }

  get currentEditQuestion(): Question | undefined {
    return this.editPersonalityQuestions[this.currentEditQuestionIndex];
  }

  get isLastEditQuestion(): boolean {
    return this.currentEditQuestionIndex === this.editPersonalityQuestions.length - 1;
  }

  get editQuestionProgress(): string {
    if (this.editPersonalityQuestions.length === 0) return '';
    return `${this.currentEditQuestionIndex + 1} / ${this.editPersonalityQuestions.length}`;
  }

  nextEditQuestion() {
    if (this.canProceedWithEditQuestion() && !this.isLastEditQuestion) {
      this.currentEditQuestionIndex++;
    }
  }

  prevEditQuestion() {
    if (this.currentEditQuestionIndex > 0) {
      this.currentEditQuestionIndex--;
    }
  }

  canProceedWithEditQuestion(): boolean {
    const q = this.currentEditQuestion;
    if (!q) return false;
    const id = q.id || '';
    const ans = this.editPersonalityAnswers[id];

    if (q.type === 'checklist') {
      if (!Array.isArray(ans) || ans.length === 0) return false;
      // Check maxSelections limit
      if (q.maxSelections && ans.length > q.maxSelections) return false;
    } else if (q.type === 'yesno') {
      if (ans !== true && ans !== false) return false;
    } else if (q.type === 'scale') {
      if (ans === undefined || ans === null || isNaN(ans)) return false;
    } else if (q.type === 'date') {
      if (!ans || String(ans).trim() === '') return false;
    } else if (q.type === 'range') {
      if (!ans || typeof ans.min !== 'number' || typeof ans.max !== 'number') return false;
      if (ans.min > ans.max) return false;
      if (q.min !== undefined && ans.min < q.min) return false;
      if (q.max !== undefined && ans.max > q.max) return false;
    } else if (q.type === 'radio') {
      if (!ans || String(ans).trim() === '') return false;
    } else {
      // text or other
      if (!ans || String(ans).trim() === '') return false;
    }
    return true;
  }

  canSubmitEditAnswers(): boolean {
    return this.editPersonalityQuestions.length > 0 && this.canProceedWithEditQuestion();
  }

  async submitEditPersonalityAnswers() {
    const currentUser = await firstValueFrom(this.auth.user$);
    const uid = currentUser?.uid || this.profile?.uid;
    if (!uid) return;

    // Build answers object for personality questions only
    const updatedAnswers: any = { ...(this.profile?.questions || {}) };

    for (const q of this.editPersonalityQuestions) {
      const id = q.id || '';
      const key = q.key || id;
      const ans = this.editPersonalityAnswers[id];

      if (q.type === 'checklist') {
        updatedAnswers[key] = Array.isArray(ans) ? ans : [];
      } else if (q.type === 'yesno') {
        updatedAnswers[key] = ans === null ? null : !!ans;
      } else if (q.type === 'scale') {
        updatedAnswers[key] = Number(ans);
      } else if (q.type === 'range') {
        updatedAnswers[key] = ans;
      } else if (q.type === 'radio') {
        updatedAnswers[key] = ans;
      } else {
        updatedAnswers[key] = ans || '';
      }
    }

    try {
      await this.auth.saveProfile(uid, { questions: updatedAnswers });
      this.profile = { ...this.profile, questions: updatedAnswers };
      this.showEditPersonalityModal = false;
      this.cdr.detectChanges();
      alert('התשובות עודכנו בהצלחה!');
    } catch (err) {
      console.error('Error saving edited answers:', err);
      alert('שגיאה בשמירת תשובות. יש לנסות שוב מאוחר יותר.');
    }
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
