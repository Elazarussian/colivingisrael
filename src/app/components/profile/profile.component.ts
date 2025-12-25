import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';
import { GroupService, Group, Invitation } from '../../services/group.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, QuestionsManagerComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  user$ = this.auth.user$;
  profile: any = null;
  showLogoutConfirm = false;

  // Question text maps for rendering answers
  registrationQuestionMap: { [id: string]: any } = {};
  personalDataQuestionMap: { [id: string]: any } = {};

  // Groups and Invitations
  userGroups: Group[] = [];
  invitations: Invitation[] = [];
  loadingGroups = false;

  // Questions / onboarding (user-facing)
  showQuestionsManager = false;
  questionsMode: 'onboarding' | 'edit-answers' | 'view-answers' = 'onboarding';
  selectedUserId?: string;

  onboardingPrompted = false;

  constructor(
    public auth: AuthService,
    private groupService: GroupService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    this.auth.profile$.subscribe(async (p) => {
      this.profile = p;
      if (!p) return;

      try {
        // If onboarding has not been completed, always force the onboarding modal for non-admin users.
        // This ensures that even if the user navigates manually to /profile they will be required
        // to finish the personal-data onboarding before accessing profile functionality.
        const onboardingCompleted = p['onboardingCompleted'] === true;
        const isAdmin = this.auth && typeof this.auth.isAdmin === 'function' ? this.auth.isAdmin(p) : (p?.role === 'admin');

        if (!onboardingCompleted && !isAdmin && !this.showQuestionsManager) {
          this.openOnboarding();
        }
      } catch (err) {
        console.error('Error during onboarding trigger:', err);
      } finally {
        this.onboardingPrompted = true;
      }

      if (p) {
        this.loadGroupsAndInvitations(p.uid);
      }
    });
  }

  ngOnInit() {
    // Profile keeps only user-facing features (onboarding / edit answers)
    // Preload question definitions for display purposes
    this.loadQuestionMaps();
  }

  // Load question definitions and build maps from id/key -> question metadata
  async loadQuestionMaps() {
    try {
      // The QuestionsManager component uses collections: newUsersQuestions and userPersonalDataQuestions
      const regCol = `${this.auth.dbPath}newUsersQuestions`;
      const pdCol = `${this.auth.dbPath}userPersonalDataQuestions`;
      // Use the AuthService's Firestore instance
      const db = this.auth.db;
      if (!db) return;
      // Dynamic imports to avoid adding firestore imports at top-level of this file
      const { collection, getDocs } = await import('firebase/firestore');

      const regSnap = await getDocs(collection(db, regCol));
      regSnap.docs.forEach(d => {
        const obj: any = { id: d.id, ...((d.data && (d.data() as any)) || {}) };
        this.registrationQuestionMap[d.id] = obj;
        // also map by key if provided
        if (obj && obj.key) this.registrationQuestionMap[obj.key] = obj;
      });

      const pdSnap = await getDocs(collection(db, pdCol));
      pdSnap.docs.forEach(d => {
        const obj: any = { id: d.id, ...((d.data && (d.data() as any)) || {}) };
        this.personalDataQuestionMap[d.id] = obj;
        if (obj && obj.key) this.personalDataQuestionMap[obj.key] = obj;
      });
    } catch (err) {
      console.warn('ProfileComponent: could not load question maps', err);
    }
  }

  // Given a question id or key, return a human label if available
  questionLabel(idOrKey: string) {
    if (!idOrKey) return '';
    const r = this.registrationQuestionMap[idOrKey] || this.personalDataQuestionMap[idOrKey];
    // Newer question docs store a `text` field for the user-facing question label.
    // Prefer `text`, then `title`, then fall back to `key`, `id`, or the raw idOrKey.
    if (r) {
      if (r.text) return r.text;
      if (r.title) return r.title;
      if (r.key) return r.key;
      if (r.id) return r.id;
    }
    return idOrKey;
  }

  // Template-safe wrapper for unknown key types
  safeQuestionLabel(k: any) { return this.questionLabel(String(k)); }

  // Helpers to safely check question map membership from templates
  hasRegistrationQuestion(k: any): boolean {
    try { return !!this.registrationQuestionMap && !!this.registrationQuestionMap[String(k)]; } catch { return false; }
  }

  hasPersonalQuestion(k: any): boolean {
    try { return !!this.personalDataQuestionMap && !!this.personalDataQuestionMap[String(k)]; } catch { return false; }
  }

  // Format an answer for display (arrays, objects, booleans)
  formatAnswer(val: any) {
    if (val === null || val === undefined || val === '') return '—';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') {
      // Common object shapes: { cityId, neighborhood } or { min, max }
      if ('cityId' in val || 'neighborhood' in val) {
        const city = val.cityId || '';
        const n = val.neighborhood || '';
        return `${city}${n ? ' — ' + n : ''}`.trim();
      }
      if ('min' in val || 'max' in val) {
        return `${val.min || ''} — ${val.max || ''}`;
      }
      try { return JSON.stringify(val); } catch { return String(val); }
    }
    if (typeof val === 'boolean') return val ? 'כן' : 'לא';
    return String(val);
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
  openEditAnswers() { this.questionsMode = 'edit-answers'; this.showQuestionsManager = true; }
  onQuestionsCompleted() { this.showQuestionsManager = false; this.cdr.detectChanges(); }
  onQuestionsClosed() { this.showQuestionsManager = false; }

  promptLogout() { this.showLogoutConfirm = true; }
  cancelLogout() { this.showLogoutConfirm = false; }
  async confirmLogout() { await this.auth.logout(); this.showLogoutConfirm = false; this.router.navigate(['/']); }
  goHome() { this.router.navigate(['/']); }

  async loadGroupsAndInvitations(uid: string) {
    this.loadingGroups = true;
    try {
      const [groups, invs] = await Promise.all([
        this.groupService.getGroupsForUser(uid),
        this.groupService.getInvitationsForUser(uid)
      ]);
      this.userGroups = groups;
      this.invitations = invs;
    } catch (err) {
      console.error('Error loading groups/invitations', err);
    } finally {
      this.loadingGroups = false;
      this.cdr.detectChanges();
    }
  }

  async acceptInvitation(inv: Invitation) {
    if (!inv.id) return;
    try {
      await this.groupService.respondToInvitation(inv.id, inv.groupId, 'accepted');
      alert('הזמנה התקבלה בהצלחה');
      if (this.profile) await this.loadGroupsAndInvitations(this.profile.uid);
    } catch (err) {
      console.error('Error accepting invitation', err);
    }
  }

  async rejectInvitation(inv: Invitation) {
    if (!inv.id) return;
    try {
      await this.groupService.respondToInvitation(inv.id, inv.groupId, 'rejected');
      alert('הזמנה נדחתה');
      if (this.profile) await this.loadGroupsAndInvitations(this.profile.uid);
    } catch (err) {
      console.error('Error rejecting invitation', err);
    }
  }
}
