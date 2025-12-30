import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { GroupService, Group } from '../../services/group.service';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';

@Component({
  selector: 'app-search-groups',
  standalone: true,
  imports: [CommonModule, FormsModule, QuestionsManagerComponent],
  templateUrl: './search-groups.component.html',
  styleUrls: ['./search-groups.component.css']
})
export class SearchGroupsComponent implements OnInit {
  profile: any = null;
  allUsers: any[] = [];
  filteredUsers: any[] = [];
  searchTerm: string = '';

  groups: Group[] = [];
  selectedGroup: Group | null = null;
  newGroupName: string = '';

  expandedUserId: string | null = null;
  closingUserId: string | null = null;
  loading: boolean = false;
  error: string | null = null;
  private pendingInvitesUnsubscribe: (() => void) | null = null;
  private groupUnsubscribe: (() => void) | null = null;

  selectedGroupMembers: any[] = [];
  availableUsers: any[] = [];
  pendingInvites: Set<string> = new Set();

  constructor(
    public auth: AuthService,
    private groupService: GroupService,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    this.auth.profile$.subscribe(p => {
      this.profile = p;
      if (p && this.auth.isAdmin(p)) {
        this.loadData();
      }
    });
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
    const profilesCol = collection(this.auth.db, `${this.auth.dbPath}profiles`);
    const snapshot = await getDocs(profilesCol);
    this.allUsers = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(u => u.role !== 'admin');
    this.filterUsers();
  }

  async loadGroups() {
    this.groups = await this.groupService.getGroups();
    if (this.selectedGroup) {
      // Refresh selected group data
      this.selectedGroup = this.groups.find(g => g.id === this.selectedGroup?.id) || null;
      this.updateMemberLists();
    }
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
    return this.groups.find(g => (g.members || []).includes(userId)) || null;
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

  async createGroup() {
    if (!this.newGroupName.trim()) return;
    try {
      const id = await this.groupService.createGroup(this.newGroupName);
      this.newGroupName = '';
      await this.loadGroups();
      this.selectedGroup = this.groups.find(g => g.id === id) || null;
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
    if (!confirm(`האם אתה בטוח שברצונך להסיר את ${user.displayName || 'משתמש'} מהקבוצה?`)) return;

    try {
      await this.groupService.removeUserFromGroup(this.selectedGroup.id, user.id || user.uid);
      await this.loadGroups();
    } catch (err) {
      console.error('Error removing member', err);
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
      await this.groupService.inviteUserToGroup(
        this.selectedGroup.id,
        this.selectedGroup.name,
        user.id || user.uid
      );
      // No manual add needed, listener will update
      alert('הזמנה נשלחה בהצלחה');
    } catch (err: any) {
      console.error('❌ INVITE FAILED', err);
      alert('שגיאה בשליחת ההזמנה: ' + (err.message || 'שגיאה לא ידועה'));
    }
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

  ngOnDestroy() {
    if (this.pendingInvitesUnsubscribe) {
      this.pendingInvitesUnsubscribe();
    }
    if (this.groupUnsubscribe) {
      this.groupUnsubscribe();
    }
  }
}
