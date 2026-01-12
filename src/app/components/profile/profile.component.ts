import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';
import { GroupService, Group, Invitation } from '../../services/group.service';
import { GroupNotification } from '../../models/notification.model';
import { combineLatest } from 'rxjs';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, QuestionsManagerComponent, RouterModule],
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
  activeGroup: any = null; // Enriched group object for single-group display
  invitations: Invitation[] = [];
  notifications: GroupNotification[] = [];
  loadingGroups = false;
  private groupsUnsubscribe: (() => void) | null = null;
  private notificationsUnsubscribe: (() => void) | null = null;

  // Questions / onboarding (user-facing)
  showQuestionsManager = false;
  questionsMode: 'onboarding' | 'registration' | 'edit-answers' | 'view-answers' = 'onboarding';
  selectedUserId?: string;
  // Expansion state for member cards in invitations
  expandedMemberId: string | null = null;
  closingMemberId: string | null = null;


  onboardingPrompted = false;

  constructor(
    public auth: AuthService,
    private groupService: GroupService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    // Combine profile and query params to handle onboarding triggers reactively
    combineLatest([this.auth.profile$, this.route.queryParams]).subscribe(async ([p, params]) => {
      console.log('📌 ProfileComponent: Subscribed update', { profile: !!p, params });
      this.profile = p;
      if (!p) {
        console.log('📌 ProfileComponent: No profile yet');
        return;
      }

      try {
        const onboardingCompleted = p['onboardingCompleted'] === true;
        const isAdmin = this.auth && typeof this.auth.isAdmin === 'function' ? this.auth.isAdmin(p) : (p?.role === 'admin');

        console.log('📌 ProfileComponent: Status', { onboardingCompleted, isAdmin, showQuestions: this.showQuestionsManager, mode: this.questionsMode });

        // Explicit trigger via query params
        if (params['showRegistration'] === '1') {
          console.log('📌 ProfileComponent: Triggering Registration Mode');
          if (!this.showQuestionsManager || this.questionsMode !== 'registration') {
            this.questionsMode = 'registration';
            this.showQuestionsManager = true;
            this.cdr.detectChanges(); // Force check
          }
        } else if (params['showOnboarding'] === '1') {
          if (!this.showQuestionsManager || this.questionsMode !== 'onboarding') {
            this.questionsMode = 'onboarding';
            this.showQuestionsManager = true;
          }
        }
        // Fallback: If not completed and no explicit param, assume we need to finish onboarding
        // Fallback: If not completed and no explicit param
        // We only want to FORCE 'registration' if registration answers are missing.
        // We do NOT want to force 'onboarding' (personal Qs) automatically; that should be user-initiated or guard-initiated.
        else if (!onboardingCompleted && !isAdmin && !this.showQuestionsManager && !this.onboardingPrompted) {
          // Check if registration questions are missing.
          // We can check this by seeing if any answer maps to a registration question (rough check) or
          // better, rely on the fact that if they were missing, the 'showRegistration' param would likely have been passed by Guard/Auth.

          // However, for manual navigation to /profile, we should be careful.
          // If we blindly call openOnboarding(), it opens stage 2. We don't want that.

          // Let's check if the user has answered ANY registration questions?
          // Or simpler: Just DON'T auto-open onboarding here.
          // The OnboardingGuard protects the site. If they are here, they either:
          // 1. Have showRegistration=1 (handled above).
          // 2. Have showOnboarding=1 (handled above).
          // 3. Are just looking at their profile.

          // So we should remove the auto-trigger for general onboarding.
          // But we MUST ensure that if they somehow bypassed registration check, they get it.
          // Since OnboardingGuard handles the mandatory registration check on accessing Home,
          // we can trust that if they are here without params, they likely satisfied Stage 1.

          // So: Remove the fallback auto-open.
          // this.openOnboarding(); 
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

    // Profile keeps only user-facing features (onboarding / edit answers)
    // Preload question definitions for display purposes
    this.loadQuestionMaps();

    // Subscribe to live invitations
    this.groupService.invitations$.subscribe(async (invs) => {
      // Create a fresh copy to avoid modifying the behavior subject's internal state directly
      const enhancedInvs = JSON.parse(JSON.stringify(invs));

      for (const inv of enhancedInvs) {
        try {
          const group = await this.groupService.getGroupById(inv.groupId);
          if (group) {
            inv.groupDescription = group.description;
            // Fetch creator name if missing in group object (though usually there)
            inv.creatorName = group.creatorName;
            inv.adminId = group.adminId;

            if (group.members && group.members.length > 0) {
              const memberProfiles = await this.auth.getProfiles(group.members);
              inv.memberNames = memberProfiles.map(p => p.displayName || 'משתמש');
              inv.fullMembers = memberProfiles; // Store full profiles
            } else {
              inv.memberNames = [];
              inv.fullMembers = [];
            }
          }
        } catch (e) {
          console.error('Error enhancing live invitation:', e);
        }
      }

      // Use setTimeout to ensure we are outside the change detection cycle
      setTimeout(() => {
        this.invitations = enhancedInvs;
        this.cdr.detectChanges();
      });
    });

    // Subscribe to notifications
    this.auth.profile$.subscribe(p => {
      if (p && p.uid) {
        if (this.notificationsUnsubscribe) {
          this.notificationsUnsubscribe();
        }
        this.notificationsUnsubscribe = this.groupService.listenToUserNotifications(p.uid, (notifications) => {
          this.notifications = notifications.filter(n => !n.read).sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime; // Most recent first
          });
          this.cdr.detectChanges();
        });
      }
    });
  }

  ngOnDestroy() {
    if (this.groupsUnsubscribe) {
      this.groupsUnsubscribe();
    }
    if (this.notificationsUnsubscribe) {
      this.notificationsUnsubscribe();
    }
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

      const regSnap = await getDocs(collection(db!, regCol));
      regSnap.docs.forEach(d => {
        const obj: any = { id: d.id, ...((d.data && (d.data() as any)) || {}) };
        this.registrationQuestionMap[d.id] = obj;
        // also map by key if provided
        if (obj && obj.key) this.registrationQuestionMap[obj.key] = obj;
      });

      const pdSnap = await getDocs(collection(db!, pdCol));
      pdSnap.docs.forEach(d => {
        const obj: any = { id: d.id, ...((d.data && (d.data() as any)) || {}) };
        this.personalDataQuestionMap[d.id] = obj;
        if (obj && obj.key) this.personalDataQuestionMap[obj.key] = obj;
      });

      // Also load Maskir questions for display in 'Personal Answers' section if user is Maskir
      const maskirCol = `${this.auth.dbPath}maskirQuestions`;
      const maskirSnap = await getDocs(collection(db!, maskirCol));
      maskirSnap.docs.forEach(d => {
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

  get hasAnyPersonalAnswers(): boolean {
    if (!this.profile || !this.profile.questions) return false;
    return Object.keys(this.profile.questions).some(k => this.hasPersonalQuestion(k));
  }

  get onBoardingFinished(): boolean {
    return this.profile?.onboardingCompleted === true;
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
      // Listen to groups
      if (this.groupsUnsubscribe) {
        this.groupsUnsubscribe();
      }
      this.groupsUnsubscribe = this.groupService.listenToUserGroups(uid, async (groups) => {
        this.userGroups = groups;
        if (groups.length > 0) {
          // Assume single group per rule
          // Assume single group per rule
          const g = { ...groups[0] };

          if (g.members && g.members.length > 0) {
            const profiles = await this.auth.getProfiles(g.members);
            g.fullMembers = profiles;
          } else {
            g.fullMembers = [];
          }
          this.activeGroup = g;
        } else {
          this.activeGroup = null;
        }
        this.cdr.detectChanges();
      });

      // Init invitations (they have their own subscription in ngOnInit via invitations$)
      await this.groupService.getInvitationsForUser(uid);
    } catch (err) {
      console.error('Error loading groups/invitations', err);
    } finally {
      this.loadingGroups = false;
      this.cdr.detectChanges();
    }
  }

  async acceptInvitation(inv: Invitation) {
    if (!inv.id) return;
    if (this.userGroups.length > 0) {
      alert('ניתן להיות חבר בקבוצה אחת בלבד. אנא צא מהקבוצה הנוכחית לפני קבלת הזמנה חדשה.');
      return;
    }
    try {
      await this.groupService.respondToInvitation(inv.id, inv.groupId, 'accepted');
      alert('הזמנה התקבלה בהצלחה');
      if (this.profile) {
        // Just refresh invitations, groups update automatically via listener
        await this.groupService.getInvitationsForUser(this.profile.uid);
      }
    } catch (err) {
      console.error('Error accepting invitation', err);
    }
  }

  async rejectInvitation(inv: Invitation) {
    if (!inv.id) return;
    try {
      await this.groupService.respondToInvitation(inv.id, inv.groupId, 'rejected');
      alert('הזמנה נדחתה');
      if (this.profile) {
        await this.groupService.getInvitationsForUser(this.profile.uid);
      }
    } catch (err) {
      console.error('Error rejecting invitation', err);
    }
  }

  async leaveGroup(group: any) {
    if (!confirm(`האם אתה בטוח שברצונך לצאת מהקבוצה "${group.name}"?`)) return;
    try {
      await this.groupService.removeUserFromGroup(group.id, this.profile.uid);
      // No need to manually refresh groups list as we have a real-time listener active
    } catch (err) {
      console.error('Error leaving group:', err);
      alert('שגיאה ביציאה מהקבוצה');
    }
  }

  toggleQuickView(userId: string) {
    if (this.expandedMemberId === userId) {
      // Start closing animation
      this.closingMemberId = userId;
      this.expandedMemberId = null;
      // Wait for animation to finish before clearing closingUserId
      setTimeout(() => {
        if (this.closingMemberId === userId) {
          this.closingMemberId = null;
          this.cdr.detectChanges();
        }
      }, 400); // Matches transition duration
    } else {
      this.expandedMemberId = userId;
      this.closingMemberId = null;
    }
  }

  async dismissNotification(notification: GroupNotification) {
    if (!notification.id) return;
    try {
      await this.groupService.deleteNotification(notification.id);
    } catch (err) {
      console.error('Error dismissing notification:', err);
    }
  }

  async clearAllNotifications() {
    try {
      for (const notif of this.notifications) {
        if (notif.id) {
          await this.groupService.deleteNotification(notif.id);
        }
      }
    } catch (err) {
      console.error('Error clearing notifications:', err);
    }
  }
}
