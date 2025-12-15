import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, QuestionsManagerComponent],
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
  showLogoutConfirm = false;

  allUsers: any[] = [];
  allUsersError: string | null = null;
  showUsersTable = false;

  showQuestionsManager = false;
  questionsMode: 'admin-registration' | 'admin-personal-data' | 'admin-maskir' | 'admin-apartment' | 'onboarding' | 'edit-answers' | 'view-answers' = 'onboarding';
  selectedUserId?: string;

  onboardingPrompted = false;

  constructor(
    public auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    this.auth.profile$.subscribe(async (p) => {
      this.profile = p;
      if (!p || this.onboardingPrompted) return;

      try {
        const showOnboardingRequested = this.route.snapshot.queryParams['showOnboarding'] === '1';
        const onboardingCompleted = p['onboardingCompleted'] === true;
        const isNewProfile = !onboardingCompleted && this.isRecentlyCreated(p, 15);

        if (!onboardingCompleted && (showOnboardingRequested || isNewProfile)) {
          // IMPORTANT: do not show onboarding to admins. Use AuthService helper to check role.
          const isAdmin = this.auth && typeof this.auth.isAdmin === 'function' ? this.auth.isAdmin(p) : (p?.role === 'admin');
          if (!isAdmin) {
            this.openOnboarding();
          } else {
            // Skip onboarding for admin users (they may have been recently created or the query param was present)
            console.debug('ProfileComponent: skipping onboarding for admin user', p?.uid || p);
          }
        }
      } catch (err) {
        console.error('Error during onboarding trigger:', err);
      } finally {
        this.onboardingPrompted = true;
      }
    });
  }

  ngOnInit() {
    this.auth.profile$.subscribe(p => {
      if (p && this.isAdmin()) {
        this.loadAllUsers();
      }
    });
  }

  isRecentlyCreated(profile: any, withinMinutes: number): boolean {
    if (!profile || !profile.createdAt) return false;
    const createdDate = new Date(profile.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    return diffMinutes <= withinMinutes;
  }

  isAdmin(): boolean { return this.auth.isAdmin(this.profile); }
  getUserRole(): string { return this.auth.getUserRole(this.profile); }
  fieldOrDefault(key: string, userVal: any, defaultVal: string): string { if (this.profile && this.profile[key]) return this.profile[key]; if (userVal) return userVal; return defaultVal; }

  openOnboarding() { this.questionsMode = 'onboarding'; this.showQuestionsManager = true; }
  openRegistrationQuestions() { this.questionsMode = 'admin-registration'; this.showQuestionsManager = true; }
  openPersonalDataQuestions() { this.questionsMode = 'admin-personal-data'; this.showQuestionsManager = true; }
  openMaskirQuestions() { this.questionsMode = 'admin-maskir'; this.showQuestionsManager = true; }
  openApartmentQuestions() { this.questionsMode = 'admin-apartment'; this.showQuestionsManager = true; }
  openEditAnswers() { this.questionsMode = 'edit-answers'; this.showQuestionsManager = true; }
  openUserAnswers(user: any) { this.selectedUserId = user.uid || user.id; this.questionsMode = 'view-answers'; this.showQuestionsManager = true; }
  onQuestionsCompleted() { this.showQuestionsManager = false; this.cdr.detectChanges(); }
  onQuestionsClosed() { this.showQuestionsManager = false; }

  toggleUsersTable() { this.showUsersTable = !this.showUsersTable; if (this.showUsersTable && this.allUsers.length === 0) { this.loadAllUsers(); } }

  async loadAllUsers() {
    if (!this.auth.db) { this.allUsersError = 'Database not initialized'; return; }
    try {
      this.allUsersError = null;
      const { collection, getDocs } = await import('firebase/firestore');
      const profilesCol = collection(this.auth.db, `${this.auth.dbPath}profiles`);
      const snapshot = await getDocs(profilesCol);
      this.allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      this.cdr.detectChanges();
    } catch (err: any) {
      console.error('Error loading users:', err);
      this.allUsersError = `שגיאה בטעינת משתמשים: ${err.message || 'Unknown error'}`;
    }
  }

  promptLogout() { this.showLogoutConfirm = true; }
  cancelLogout() { this.showLogoutConfirm = false; }
  async confirmLogout() { await this.auth.logout(); this.showLogoutConfirm = false; this.router.navigate(['/']); }
  goHome() { this.router.navigate(['/']); }
}
