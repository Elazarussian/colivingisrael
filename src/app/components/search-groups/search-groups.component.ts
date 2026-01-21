import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { take } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { GroupService, Group } from '../../services/group.service';
import { MessageService } from '../../services/message.service';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';
import { doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore'; // Import Timestamp
import { db } from '../../firebase-config'; // Import db directly for updates if needed
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-search-groups',
  standalone: true,
  imports: [CommonModule, FormsModule, QuestionsManagerComponent],
  templateUrl: './search-groups.component.html',
  styleUrls: ['./search-groups.component.css']
})
export class SearchGroupsComponent implements OnInit, OnDestroy {
  profile: any = null;
  allUsers: any[] = [];
  filteredUsers: any[] = [];
  searchTerm: string = '';
  showAllParticipants: boolean = false;

  groups: Group[] = []; // ALL groups user can see (active + expired)
  activeGroups: Group[] = [];
  expiredGroups: Group[] = [];

  // Helper to check if user needs to be restricted (has an ACTIVE group)
  get hasActiveGroup(): boolean {
    if (!this.profile) return false;
    return this.activeGroups.some(g => (g.members || []).includes(this.profile.uid));
  }

  allKnownGroups: Group[] = []; // All groups for lookup (badges)

  countdowns: { [groupId: string]: string } = {};
  private timerSub: Subscription | null = null;
  selectedGroup: Group | null = null;
  newGroupRequiredMembers: number = 2; // Default to 2 members

  // Cached threshold percentage from settings
  private cachedThresholdPercent: number = 40; // Default 40%

  directInviteGroup: Group | null = null; // Group from URL invitation link

  expandedUserId: string | null = null;
  closingUserId: string | null = null;
  loading: boolean = false;
  error: string | null = null;
  private pendingInvitesUnsubscribe: (() => void) | null = null;
  private groupUnsubscribe: (() => void) | null = null;
  private allGroupsUnsubscribe: (() => void) | null = null;

  selectedGroupMembers: any[] = [];
  availableUsers: any[] = [];
  pendingInvites: Set<string> = new Set();
  inviteCopySuccess: boolean = false;

  showCreateGroupModal: boolean = false;
  newGroupDescription: string = '';
  availableProperties: string[] = [];
  selectedProperties: string[] = [];

  isEditingGroupDetails: boolean = false;
  editGroupDescription: string = '';
  editGroupProperties: string[] = [];

  newGroupPurpose: string = '';
  newGroupApartmentId: string = '';
  newGroupApartmentData: any = null;
  allApartments: any[] = [];
  showApartmentSelection: boolean = false;
  showAddOwnApartment: boolean = false;

  showLeaderRemovalModal: boolean = false;
  userToRemove: any = null;

  constructor(
    public auth: AuthService,
    private groupService: GroupService,
    private messageService: MessageService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute
  ) { }

  async ngOnInit() {
    this.auth.profile$.subscribe(p => {
      this.profile = p;
      if (p) {
        this.loadData();
        this.handleAutoInvite();
        this.loadAvailableProperties();
        this.loadApartments();
        this.loadThresholdPercent();
      }
    });

    this.timerSub = interval(1000).subscribe(() => this.updateCountdowns());
  }

  ngOnDestroy() {
    if (this.timerSub) this.timerSub.unsubscribe();
    this.deselectGroup();
    if (this.allGroupsUnsubscribe) this.allGroupsUnsubscribe();
  }

  async handleAutoInvite() {
    const inviteGroupId = this.route.snapshot.queryParamMap.get('inviteGroupId');
    if (inviteGroupId && this.profile && this.profile.uid) {
      // Check if user is already in this group (members array check is faster/direct)
      const group = await this.groupService.getGroupById(inviteGroupId);
      if (group) {
        if (group.members.includes(this.profile.uid)) {
          this.messageService.show('הינך כבר חבר בקבוצה זו.');
          return;
        }

        // Check if user is already a member of ANY *ACTIVE* group
        const userGroups = await this.groupService.getGroupsForUser(this.profile.uid);
        const hasActive = userGroups.some(g => g.status !== 'expired' && g.status !== 'completed'); // Check status

        if (hasActive) {
          this.messageService.show('את\\ה כבר חבר\\ה בקבוצה פעילה, על מנת להצטרף לקבוצה חדשה, עליך לצאת מהקבוצה הנוכחית');
          return;
        }

        // Fetch member profiles for display in the modal
        if (group.members && group.members.length > 0) {
          try {
            (group as any).fullMembers = await this.auth.getProfiles(group.members);
          } catch (err) {
            console.error('Error fetching profiles for auto invite', err);
          }
        }

        // Instead of auto-inviting, show a popup modal
        this.directInviteGroup = group;
        this.cdr.detectChanges();
      }
    }
  }


  async acceptDirectInvite() {
    if (!this.directInviteGroup || !this.profile) return;

    const group = this.directInviteGroup;
    this.directInviteGroup = null;

    try {
      this.messageService.show('מעבד הצטרפות...');

      // Use the new direct join method which doesn't require an invitation document
      // and satisfies the "isJoiningSelf" Firestore rule.
      await this.groupService.joinGroupDirectly(group.id!);

      this.messageService.show(`הצטרפת בהצלחה לקבוצה: ${group.name}`);
      await this.loadGroups();
    } catch (err: any) {
      console.error('❌ FAILED TO JOIN VIA DIRECT INVITE:', err);
      if (err.message?.includes('permission')) {
        this.messageService.show('שגיאת הרשאות: וודא שאתה מחובר ושיש לך הרשאה מתאימה.');
      } else {
        this.messageService.show('שגיאה בהצטרפות לקבוצה. נסה שוב מאוחר יותר.');
      }
    }
  }


  closeDirectInvite() {
    this.directInviteGroup = null;
  }

  async loadData() {
    this.loading = true;
    try {
      await Promise.all([
        this.loadAllUsers(),
        this.loadGroups()
      ]);
    } catch (err) {
      this.error = 'Failed to load data';
      console.error(err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async loadAllUsers() {
    if (!this.auth.db) return;
    const { collection, getDocs } = await import('firebase/firestore');
    const profilesCol = collection(this.auth.db!, `${this.auth.dbPath}profiles`);
    const snapshot = await getDocs(profilesCol);
    this.allUsers = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(u => u.role !== 'admin');
    this.filterUsers();
  }

  async loadThresholdPercent() {
    try {
      const settingsRef = doc(db!, `${this.auth.dbPath}systemSettings`, 'general');
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const sData = settingsSnap.data();
        if (sData && sData['groupThresholdPercent'] !== undefined) {
          this.cachedThresholdPercent = Number(sData['groupThresholdPercent']);
        }
      }
    } catch (e) {
      console.error('Error loading threshold percent:', e);
    }
  }

  async loadGroups() {
    if (!this.profile) return;

    // Clear old subscription if exists
    if (this.allGroupsUnsubscribe) {
      this.allGroupsUnsubscribe();
    }

    // Subscribe to ALL groups real-time for everyone (needed for badges)
    this.allGroupsUnsubscribe = this.groupService.listenToAllGroups((allGroups) => {
      this.allKnownGroups = allGroups;


      if (this.auth.isAdmin(this.profile)) {
        this.groups = [...this.allKnownGroups];
      } else {
        // Regular users see all groups they are a member of (Active AND Expired)
        // This allows them to see history in the sidebar
        this.groups = this.allKnownGroups.filter(g => (g.members || []).includes(this.profile.uid));
      }

      // Re-categorize active vs expired
      this.categorizeGroups();

      // Handle selection preserverance / update
      if (this.selectedGroup) {
        // ... (existing logic)
        const found = this.allKnownGroups.find(g => g.id === this.selectedGroup?.id);
        if (found) {
          // Allow viewing expired groups too
          if (this.auth.isAdmin(this.profile) || (found.members || []).includes(this.profile.uid)) {
            this.selectedGroup = found;
            this.updateMemberLists();
          } else {
            // If regular user and group is expired, they can still view if they were a member?
            // Logic above covers it.
            this.deselectGroup();
          }
        } else {
          this.deselectGroup();
        }
      }

      // Auto-select
      if (!this.auth.isAdmin(this.profile) && this.activeGroups.length > 0 && !this.selectedGroup) {
        this.selectGroup(this.activeGroups[0]);
      }

      this.cdr.detectChanges();
    });
  }

  categorizeGroups() {
    this.activeGroups = [];
    this.expiredGroups = [];

    this.groups.forEach(g => {
      // Check for auto-destruct condition
      this.checkAutoDestruct(g);

      if (g.status === 'expired') {
        this.expiredGroups.push(g);
      } else {
        this.activeGroups.push(g);
      }
    });
  }

  async checkAutoDestruct(g: Group) {
    if (g.status === 'expired' || g.status === 'completed') return;

    if (!g.expirationTime) return;

    const now = new Date();
    // Handle Timestamp or Date object
    const expiresAt = g.expirationTime.toDate ? g.expirationTime.toDate() : new Date(g.expirationTime);

    if (now > expiresAt) {
      // Time passed. Check Threshold.
      const currentMembers = g.members.length;
      const target = g.requiredMembers || 0;

      // Use per-group stored threshold if present, otherwise fetch settings (default 40%)
      let thresholdPercent = 40;
      if (g.groupThresholdPercent !== undefined && g.groupThresholdPercent !== null) {
        thresholdPercent = Number(g.groupThresholdPercent);
      } else {
        try {
          const settingsRef = doc(db!, `${this.auth.dbPath}systemSettings`, 'general');
          const settingsSnap = await getDoc(settingsRef);
          if (settingsSnap.exists()) {
            const sData = settingsSnap.data();
            if (sData && sData['groupThresholdPercent'] !== undefined) {
              thresholdPercent = Number(sData['groupThresholdPercent']);
            }
          }
        } catch (e) {
          console.error('Error fetching threshold percent:', e);
        }
      }

      const threshold = target * (thresholdPercent / 100);

      if (currentMembers < threshold) {
        // EXPIRE IT
        // Update local state immediately to avoid flickers
        g.status = 'expired';

        // Store member IDs before clearing
        const memberIds = [...g.members];

        // If I am the admin or just a user, trigger the db update (lazy cleanup)
        // Only trigger if no one else has done it (status check again inside function?)
        try {
          const gRef = doc(db!, `${this.auth.dbPath}groups`, g.id!);

          // Update group status to expired and clear members array
          await updateDoc(gRef, {
            status: 'expired',
            members: [] // Clear members so they're no longer restricted
          });

          // Send notifications to all former members
          await this.groupService.notifyGroupExpiration(g.id!, g.name, memberIds);

          console.log(`✅ Group ${g.name} expired and ${memberIds.length} members notified`);
        } catch (e) {
          console.error('Error auto-expiring group:', e);
        }
      }
    }
  }

  updateCountdowns() {
    const now = new Date().getTime();
    this.activeGroups.forEach(g => {
      if (!g.expirationTime || g.status !== 'active') {
        this.countdowns[g.id!] = '';
        return;
      }

      // Check if threshold met - if so, countdown stops
      const currentMembers = g.members.length;
      const target = g.requiredMembers || 0;

      // Prefer per-group stored thresholdPercent; fallback to cached global
      const usePercent = g.groupThresholdPercent !== undefined && g.groupThresholdPercent !== null
        ? Number(g.groupThresholdPercent)
        : this.cachedThresholdPercent;
      const threshold = target * (usePercent / 100);

      if (currentMembers >= threshold) {
        this.countdowns[g.id!] = 'הקבוצה באוויר!'; // "Group is Live!"
        return;
      }

      const expiresAt = (g.expirationTime.toDate ? g.expirationTime.toDate() : new Date(g.expirationTime)).getTime();
      const diff = expiresAt - now;

      if (diff <= 0) {
        this.countdowns[g.id!] = 'פג תוקף';
      } else {
        // Format HH:MM:SS
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        this.countdowns[g.id!] = `${hours}ש ${minutes}ד ${seconds}ש`;
      }
    });
    this.cdr.detectChanges();
  }

  selectGroup(group: Group, event?: MouseEvent) {
    if (event) event.stopPropagation();

    // Toggle selection: if clicking the already-selected group, deselect it
    if (this.selectedGroup && this.selectedGroup.id === group.id) {
      this.deselectGroup();
      return;
    }

    // If the group is inactive, prevent selection and clear members
    if (group.status && group.status !== 'active') {
      // Ensure UI shows it but doesn't allow join actions
      this.selectedGroup = group;
      this.updateMemberLists();
      this.cdr.detectChanges();
      return;
    }

    this.selectedGroup = group;
    this.updateMemberLists();

    // Only subscribe to pending invites if user is admin or group creator
    if (this.auth.isAdmin(this.profile) || group.adminId === this.profile?.uid) {
      this.subscribeToPendingInvites();
    }

    this.subscribeToGroupUpdates();
    this.cdr.detectChanges();
  }

  deselectGroup() {
    this.selectedGroup = null;
    this.selectedGroupMembers = [];
    this.pendingInvites.clear();
    this.isEditingGroupDetails = false;
    if (this.pendingInvitesUnsubscribe) {
      this.pendingInvitesUnsubscribe();
      this.pendingInvitesUnsubscribe = null;
    }
    if (this.groupUnsubscribe) {
      this.groupUnsubscribe();
      this.groupUnsubscribe = null;
    }
    this.updateMemberLists();
    this.cdr.detectChanges();
  }

  updateMemberLists() {
    if (!this.selectedGroup) {
      this.selectedGroupMembers = [];
      this.filterUsers();
      return;
    }

    const memberIds = this.selectedGroup.members || [];
    this.selectedGroupMembers = this.allUsers.filter(u => memberIds.includes(u.id || u.uid));
    this.filterUsers(); // Re-apply search filter
  }

  filterUsers() {
    let baseList = [...this.allUsers];

    // Search filter
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      baseList = baseList.filter(u =>
        (u.displayName || '').toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term)
      );
    }

    // Requirement: always show all users in the participants list (do not hide members of the selected group)
    // availableUsers therefore equals the filtered baseList irrespective of selectedGroup
    this.availableUsers = baseList;

    // Maintain a separate list of selected group members for the members panel and keep it searchable
    if (this.selectedGroup) {
      const memberIds = this.selectedGroup.members || [];
      this.selectedGroupMembers = this.allUsers.filter(u => memberIds.includes(u.id || u.uid));
      if (this.searchTerm.trim()) {
        const term = this.searchTerm.toLowerCase();
        this.selectedGroupMembers = this.selectedGroupMembers.filter(u =>
          (u.displayName || '').toLowerCase().includes(term) ||
          (u.email || '').toLowerCase().includes(term)
        );
      }
    }
    this.cdr.detectChanges();
  }

  /**
   * Return all groups that the given user belongs to (uses the cached allKnownGroups list).
   * This is used to render multiple badges for a user when applicable.
   */
  getUserGroups(user: any): Group[] {
    const userId = user.id || user.uid;
    return this.allKnownGroups.filter(g => (g.members || []).includes(userId));
  }

  getUserGroup(user: any): Group | null {
    const userId = user.id || user.uid;
    // Look in ALL known groups, not just the filtered list
    return this.allKnownGroups.find(g => (g.members || []).includes(userId)) || null;
  }

  toggleQuickView(userId: string) {
    if (this.expandedUserId === userId) {
      // Start closing animation
      this.closingUserId = userId;
      this.expandedUserId = null;
      // Wait for animation to finish before clearing closingUserId
      setTimeout(() => {
        if (this.closingUserId === userId) {
          this.closingUserId = null;
          this.cdr.detectChanges();
        }
      }, 400); // Matches transition duration
    } else {
      this.expandedUserId = userId;
      this.closingUserId = null;
    }
  }

  get expandedUser() {
    return this.allUsers.find(u => (u.id || u.uid) === this.expandedUserId);
  }

  async loadAvailableProperties() {
    try {
      this.availableProperties = await this.groupService.getGroupProperties();
    } catch (err) {
      console.error('Error loading properties:', err);
    }
  }

  toggleProperty(prop: string) {
    if (this.selectedProperties.includes(prop)) {
      this.selectedProperties = this.selectedProperties.filter(p => p !== prop);
    } else {
      this.selectedProperties.push(prop);
    }
  }

  isPropertySelected(prop: string): boolean {
    return this.selectedProperties.includes(prop);
  }

  openCreateGroupModal() {
    // Restriction: User cannot create if already in an ACTIVE group (unless admin)
    if (!this.auth.isAdmin(this.profile) && this.hasActiveGroup) {
      alert('לא ניתן ליצור קבוצה חדשה כאשר אתה כבר חבר בקבוצה פעילה.');
      return;
    }
    this.showCreateGroupModal = true;
    this.newGroupDescription = '';
    this.selectedProperties = [];
    this.newGroupRequiredMembers = 2;
    this.newGroupPurpose = '';
    this.newGroupApartmentId = '';
    this.newGroupApartmentData = null;
    this.showApartmentSelection = false;
    this.showAddOwnApartment = false;
  }

  closeCreateGroupModal() {
    this.showCreateGroupModal = false;
  }

  async createGroup() {
    // Determine the next group name
    const groupNumbers = this.allKnownGroups
      .map(g => {
        const match = g.name.match(/קבוצה\s+(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      });
    const nextNumber = Math.max(0, ...groupNumbers) + 1;
    const autoGroupName = `קבוצה ${nextNumber}`;

    if (!this.newGroupPurpose) {
      alert('אנא בחר את מטרת הקבוצה.');
      return;
    }

    if (this.newGroupPurpose === 'יש דירה מחפש שותפים' && !this.newGroupApartmentId && !this.newGroupApartmentData) {
      alert('יש לבחור דירה או למלא פרטי דירה.');
      return;
    }

    try {
      const id = await this.groupService.createGroup(
        autoGroupName,
        this.newGroupRequiredMembers,
        this.newGroupDescription,
        this.selectedProperties,
        this.newGroupPurpose,
        this.newGroupApartmentId,
        this.newGroupApartmentData
      );

      this.showCreateGroupModal = false;
      this.newGroupRequiredMembers = 2;
      this.newGroupDescription = '';
      this.selectedProperties = [];

      // Ensure groups are loaded
      await this.loadGroups();

      // Poll for the new group in the real-time list
      let found = null;
      for (let i = 0; i < 5; i++) {
        found = this.allKnownGroups.find(g => g.id === id);
        if (found) break;
        await new Promise(r => setTimeout(r, 300));
      }

      if (found) {
        this.selectGroup(found);
      } else {
        // Fallback: manual fetch if listener is slow
        const manual = await this.groupService.getGroupById(id);
        if (manual) this.selectGroup(manual);
      }
    } catch (err) {
      console.error('Error creating group', err);
    }
  }

  async addToGroup(user: any) {
    if (!this.selectedGroup || !this.selectedGroup.id) return;
    if (this.selectedGroup.status && this.selectedGroup.status !== 'active') {
      this.messageService.show('לא ניתן להצטרף לקבוצה שאינה פעילה.');
      return;
    }
    try {
      await this.groupService.addUserToGroup(this.selectedGroup.id, user.id || user.uid);
      await this.loadGroups();
    } catch (err) {
      console.error('Error adding to group', err);
    }
  }

  async removeMember(user: any) {
    if (!this.selectedGroup || !this.selectedGroup.id) return;
    const targetUid = user.id || user.uid;

    // 1. Restriction: Creator/Admin cannot remove themselves
    if (targetUid === this.selectedGroup.adminId && this.profile.uid === this.selectedGroup.adminId) {
      alert('מנהל קבוצה אינו יכול להסיר את עצמו. עליך למחוק את הקבוצה לחלוטין אם ברצונך לצאת.');
      return;
    }

    // 2. Special logic: Site Administrator removes the Group Leader
    if (targetUid === this.selectedGroup.adminId && this.auth.isAdmin(this.profile)) {
      this.userToRemove = user;
      this.showLeaderRemovalModal = true;
      return;
    }

    // 3. Normal Removal logic
    if (!confirm(`האם אתה בטוח שברצונך להסיר את ${user.displayName || 'משתמש'} מהקבוצה?`)) return;

    try {
      await this.groupService.removeUserFromGroup(this.selectedGroup.id, targetUid);
      this.messageService.show(`המשתמש ${user.displayName || 'משתמש'} הוסר מהקבוצה.`);
      await this.loadGroups();
    } catch (err) {
      console.error('Error removing member', err);
    }
  }

  async deleteGroupAndRemove() {
    if (!this.selectedGroup || !this.userToRemove) return;
    const groupId = this.selectedGroup.id!;
    const userName = this.userToRemove.displayName || 'מנהל הקבוצה';

    try {
      await this.groupService.deleteGroup(groupId);
      this.showLeaderRemovalModal = false;
      this.userToRemove = null;
      this.deselectGroup();
      this.messageService.show(`הקבוצה נמחקה והמשתמש ${userName} הוסר.`);
    } catch (err) {
      console.error('Error deleting group during leader removal:', err);
      alert('שגיאה במחיקת הקבוצה');
    }
  }

  async transferLeadershipAndRemove(newAdminId: string) {
    if (!this.selectedGroup || !this.userToRemove) return;
    const groupId = this.selectedGroup.id!;
    const oldAdminId = this.userToRemove.id || this.userToRemove.uid;

    try {
      // 1. Update group admin to the new person
      await this.groupService.updateGroupAdmin(groupId, newAdminId);
      // 2. Remove the old admin
      await this.groupService.removeUserFromGroup(groupId, oldAdminId);

      this.showLeaderRemovalModal = false;
      this.userToRemove = null;
      this.messageService.show('ניהול הקבוצה הועבר והמשתמש הוסר בהצלחה.');
      await this.loadGroups();
    } catch (err) {
      console.error('Error transferring leadership:', err);
      alert('שגיאה בהעברת הניהול');
    }
  }

  async deleteGroup(group: Group) {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הקבוצה "${group.name}"? פעולה זו אינה הפיכה.`)) return;

    try {
      if (group.id) {
        await this.groupService.deleteGroup(group.id);
        await this.loadGroups();
        if (this.selectedGroup?.id === group.id) {
          this.deselectGroup();
        }
      }
    } catch (err) {
      console.error('Error deleting group', err);
      alert('שגיאה במחיקת הקבוצה');
    }
  }

  async inviteToGroup(user: any) {
    if (!this.selectedGroup || !this.selectedGroup.id) return;
    if (this.selectedGroup.status && this.selectedGroup.status !== 'active') {
      this.messageService.show('לא ניתן להזמין לקבוצה שאינה פעילה.');
      return;
    }

    const payload = {
      inviterUid: this.profile?.uid,
      inviterRole: this.profile?.role,
      groupId: this.selectedGroup.id,
      groupName: this.selectedGroup.name,
      toUid: user.id || user.uid,
      dbPath: this.auth.dbPath
    };

    console.group('🔥 INVITE DEBUG');
    console.log('payload', payload);
    console.log('isAdmin', this.auth.isAdmin(this.profile));
    console.log('selectedGroup full', this.selectedGroup);
    console.log('user full', user);
    console.groupEnd();

    try {
      const targetUid = user.id || user.uid;

      // Optimistic UI update
      this.pendingInvites = new Set(this.pendingInvites);
      this.pendingInvites.add(targetUid);
      this.cdr.detectChanges();

      await this.groupService.inviteUserToGroup(
        this.selectedGroup.id,
        this.selectedGroup.name,
        targetUid
      );
      this.messageService.show(`הזמנה נשלחה בהצלחה ל-${user.displayName || user.email}`);
    } catch (err: any) {
      // Revert optimistic update on error
      const targetUid = user.id || user.uid;
      this.pendingInvites = new Set(this.pendingInvites);
      this.pendingInvites.delete(targetUid);
      this.cdr.detectChanges();

      console.error('❌ INVITE FAILED', err);
      alert('שגיאה בשליחת ההזמנה: ' + (err.message || 'שגיאה לא ידועה'));
    }

  }

  async cancelInvite(user: any) {
    if (!this.selectedGroup || !this.selectedGroup.id) return;
    const targetUid = user.id || user.uid;

    try {
      // Optimistic UI update
      this.pendingInvites = new Set(this.pendingInvites);
      this.pendingInvites.delete(targetUid);
      this.cdr.detectChanges();

      await this.groupService.cancelInvitation(this.selectedGroup.id, targetUid);
      this.messageService.show(`ההזמנה ל-${user.displayName || user.email} בוטלה`);
    } catch (err: any) {
      // Revert if failed (add back to pending)
      this.pendingInvites = new Set(this.pendingInvites);
      this.pendingInvites.add(targetUid);
      this.cdr.detectChanges();
      console.error('Error cancelling invite:', err);
      alert('שגיאה בביטול ההזמנה');
    }
  }

  async leaveGroup(group: Group) {
    if (!confirm(`האם אתה בטוח שברצונך לצאת מהקבוצה "${group.name}"?`)) return;
    try {
      if (group.id) {
        await this.groupService.removeUserFromGroup(group.id, this.profile.uid);
        this.deselectGroup();
      }
    } catch (err) {
      console.error('Error leaving group:', err);
      alert('שגיאה ביציאה מהקבוצה');
    }
  }

  async updateRequiredMembers(count: string | number) {
    if (!this.selectedGroup || !this.selectedGroup.id) return;
    const num = typeof count === 'string' ? parseInt(count, 10) : count;
    if (isNaN(num) || num < 2) return;

    try {
      await this.groupService.updateGroupRequiredMembers(this.selectedGroup.id, num);
      this.messageService.show('מספר השותפים הדרוש עודכן');
    } catch (err) {
      console.error('Error updating required members:', err);
      alert('שגיאה בעדכון מספר השותפים');
    }
  }

  startEditingGroupDetails() {
    if (!this.selectedGroup) return;
    this.isEditingGroupDetails = true;
    this.editGroupDescription = this.selectedGroup.description || '';
    this.editGroupProperties = [...(this.selectedGroup.properties || [])];
  }

  cancelEditingGroupDetails() {
    this.isEditingGroupDetails = false;
  }

  async saveGroupDetails() {
    if (!this.selectedGroup || !this.selectedGroup.id) return;

    try {
      await this.groupService.updateGroupDetails(
        this.selectedGroup.id,
        this.editGroupDescription,
        this.editGroupProperties
      );
      this.isEditingGroupDetails = false;
      this.messageService.show('פרטי הקבוצה עודכנו בהצלחה');
    } catch (err) {
      console.error('Error saving group details:', err);
      alert('שגיאה בעדכון פרטי הקבוצה');
    }
  }

  toggleEditProperty(prop: string) {
    if (this.editGroupProperties.includes(prop)) {
      this.editGroupProperties = this.editGroupProperties.filter(p => p !== prop);
    } else {
      this.editGroupProperties.push(prop);
    }
  }

  isEditPropertySelected(prop: string): boolean {
    return this.editGroupProperties.includes(prop);
  }

  isUserInSelectedGroup(user: any): boolean {
    if (!this.selectedGroup) return false;
    return this.selectedGroup.members.includes(user.id || user.uid);
  }

  subscribeToPendingInvites() {
    // Clear old subscription
    if (this.pendingInvitesUnsubscribe) {
      this.pendingInvitesUnsubscribe();
      this.pendingInvitesUnsubscribe = null;
    }

    if (!this.selectedGroup || !this.selectedGroup.id) return;

    this.pendingInvitesUnsubscribe = this.groupService.listenToGroupPendingInvitations(
      this.selectedGroup.id,
      (invites) => {
        this.pendingInvites = new Set(invites.map(i => i.toUid));
        this.cdr.detectChanges();
      }
    );
  }

  hasPendingInvite(user: any): boolean {
    return this.pendingInvites.has(user.id || user.uid);
  }

  subscribeToGroupUpdates() {
    if (this.groupUnsubscribe) {
      this.groupUnsubscribe();
      this.groupUnsubscribe = null;
    }

    if (!this.selectedGroup || !this.selectedGroup.id) return;

    this.groupUnsubscribe = this.groupService.listenToGroup(
      this.selectedGroup.id,
      (updatedGroup) => {
        if (updatedGroup) {
          this.selectedGroup = updatedGroup;
          // If group became inactive, clear members and deselect to prevent actions
          if (updatedGroup.status && updatedGroup.status !== 'active') {
            this.selectedGroupMembers = [];
            this.pendingInvites.clear();
            // Keep the group view but don't allow actions
            this.cdr.detectChanges();
            return;
          }

          this.updateMemberLists(); // Refresh lists with new members
          this.cdr.detectChanges();
        }
      }
    );
  }

  async copyInviteLink() {
    if (!this.selectedGroup || !this.selectedGroup.id) return;

    // Use window.location.origin to work on both localhost and production
    const baseUrl = window.location.origin;
    const inviteLink = `${baseUrl}/search-groups?inviteGroupId=${this.selectedGroup.id}`;

    try {
      await navigator.clipboard.writeText(inviteLink);
      //this.messageService.show('קישור להזמנה הועתק ללוח!');

      // Visual feedback state
      this.inviteCopySuccess = true;
      this.cdr.detectChanges();
      setTimeout(() => {
        this.inviteCopySuccess = false;
        this.cdr.detectChanges();
      }, 2000);

    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = inviteLink;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        //קישור להזמנה הועתק ללוח!
        //this.messageService.show('קישור להזמנה הועתק ללוח!');
      } catch (err) {
        alert('שגיאה בהעתקת הקישור: ' + inviteLink);
      }
      document.body.removeChild(textArea);
    }
  }

  async loadApartments() {
    if (!this.auth.db) return;
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const snap = await getDocs(collection(this.auth.db, `${this.auth.dbPath}apartments`));
      this.allApartments = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    } catch (err) {
      console.error('Error loading apartments:', err);
    }
  }

  onPurposeChange() {
    this.newGroupApartmentId = '';
    this.newGroupApartmentData = null;
    this.showApartmentSelection = false;
    this.showAddOwnApartment = false;
    this.cdr.detectChanges();
  }

  toggleApartmentSelection() {
    this.showApartmentSelection = !this.showApartmentSelection;
    this.showAddOwnApartment = false;
  }

  toggleAddOwnApartment() {
    this.showAddOwnApartment = !this.showAddOwnApartment;
    this.showApartmentSelection = false;
  }

  selectApartment(apt: any) {
    this.newGroupApartmentId = apt.id;
    this.newGroupApartmentData = null;
    this.showApartmentSelection = false;
    this.messageService.show(`נבחרה הדירה: ${apt.title || apt.address || apt.id}`);
  }

  onApartmentDataSaved(data: any) {
    this.newGroupApartmentData = data;
    this.newGroupApartmentId = '';
    this.showAddOwnApartment = false;
    this.messageService.show('נתוני הדירה נשמרו בהצלחה לקבוצה');
  }

  getApartmentTitle(apt: any): string {
    return apt.title || apt.address || 'דירה ללא כותרת';
  }

  getGroupManagerName(group: Group): string {
    if (!group || !group.adminId) return 'ללא מנהל';
    if (this.profile && group.adminId === this.profile.uid) return this.profile.displayName || 'אני';

    // Search in allUsers
    const manager = this.allUsers.find(u => (u.id || u.uid) === group.adminId);
    if (manager) return manager.displayName || 'משתמש';

    return 'לא נמצא';
  }

  keys(obj: any): string[] {
    if (!obj) return [];
    return Object.keys(obj).filter(k => k !== 'id' && k !== 'createdAt' && k !== 'createdBy' && k !== 'createdByDisplayName');
  }

  formatAnswer(ans: any): string {
    if (ans === null || ans === undefined) return '-';
    if (Array.isArray(ans)) return ans.join(', ');
    if (typeof ans === 'boolean') return ans ? 'כן' : 'לא';
    if (ans && typeof ans === 'object' && 'min' in ans && 'max' in ans) {
      return `${ans.min} - ${ans.max}`;
    }
    return String(ans);
  }

}
