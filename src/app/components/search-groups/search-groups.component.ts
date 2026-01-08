import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { take } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { GroupService, Group } from '../../services/group.service';
import { MessageService } from '../../services/message.service';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';
import { doc, getDoc } from 'firebase/firestore';

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

  groups: Group[] = []; // Displayed groups (filtered for user)
  allKnownGroups: Group[] = []; // All groups for lookup (badges)
  selectedGroup: Group | null = null;
  newGroupRequiredMembers: number = 2; // Default to 2 members

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
      }
    });

    // Handle case where user hits the page with an invite link but is not logged in
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (!user && this.route.snapshot.queryParamMap.get('inviteGroupId')) {
        this.auth.showAuthModal();
      }
    });
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

    const inviteId = `${this.profile.uid}_${group.id}`;

    try {
      // 1. Check if an invite already exists (environment-aware via GroupService logic)
      // We don't directly check existence here to avoid permission issues if doc doesn't exist,
      // instead we try to "proactively" ensure it exists.

      this.messageService.show('מעבד הצטרפות...');

      // 2. Proactively create/ensure self-invite exists to satisfy joining rules
      // This makes shared "Direct Invite Links" work for everyone.
      await this.groupService.inviteUserToGroup(group.id!, group.name, this.profile.uid);

      // 3. Small delay to ensure Firestore consistency for the rules engine
      await new Promise(resolve => setTimeout(resolve, 600));

      // 4. Join the group using the invite
      await this.groupService.respondToInvitation(inviteId, group.id!, 'accepted');

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
        // Regular users only see groups they are in (for sidebar)
        this.groups = this.allKnownGroups.filter(g => (g.members || []).includes(this.profile.uid));
      }

      // Handle selection preserverance / update
      if (this.selectedGroup) {
        const found = this.allKnownGroups.find(g => g.id === this.selectedGroup?.id);
        if (found) {
          // Check access rights if user was kicked or group deleted
          if (this.auth.isAdmin(this.profile) || (found.members || []).includes(this.profile.uid)) {
            this.selectedGroup = found;
            this.updateMemberLists();
          } else {
            this.deselectGroup(); // Access lost
          }
        } else {
          this.deselectGroup(); // Group deleted
        }
      }

      // Auto-select if regular user has a group and nothing selected
      if (!this.auth.isAdmin(this.profile) && this.groups.length > 0 && !this.selectedGroup) {
        this.selectGroup(this.groups[0]);
      }

      this.cdr.detectChanges();
    });
  }

  selectGroup(group: Group, event?: MouseEvent) {
    if (event) event.stopPropagation();
    this.selectedGroup = group;
    this.updateMemberLists();
    this.subscribeToPendingInvites();
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

    if (this.selectedGroup) {
      const memberIds = this.selectedGroup.members || [];
      this.availableUsers = baseList.filter(u => !memberIds.includes(u.id || u.uid));
      // Members are also filtered by search term
      this.selectedGroupMembers = this.allUsers.filter(u => memberIds.includes(u.id || u.uid));
      if (this.searchTerm.trim()) {
        const term = this.searchTerm.toLowerCase();
        this.selectedGroupMembers = this.selectedGroupMembers.filter(u =>
          (u.displayName || '').toLowerCase().includes(term) ||
          (u.email || '').toLowerCase().includes(term)
        );
      }
    } else {
      this.availableUsers = baseList;
    }
    this.cdr.detectChanges();
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
    // Restriction: User cannot create if already in a group (unless admin)
    if (!this.auth.isAdmin(this.profile) && this.groups.length > 0) {
      alert('לא ניתן ליצור קבוצה חדשה כאשר אתה כבר חבר בקבוצה.');
      return;
    }
    this.showCreateGroupModal = true;
    this.newGroupDescription = '';
    this.selectedProperties = [];
    this.newGroupRequiredMembers = 2;
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

    try {
      const id = await this.groupService.createGroup(
        autoGroupName,
        this.newGroupRequiredMembers,
        this.newGroupDescription,
        this.selectedProperties
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

  ngOnDestroy() {
    if (this.pendingInvitesUnsubscribe) {
      this.pendingInvitesUnsubscribe();
    }
    if (this.groupUnsubscribe) {
      this.groupUnsubscribe();
    }
    if (this.allGroupsUnsubscribe) {
      this.allGroupsUnsubscribe();
    }
  }
}
