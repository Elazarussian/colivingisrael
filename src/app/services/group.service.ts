import { Injectable } from '@angular/core';
import { db } from '../firebase-config';
import { AuthService } from './auth.service';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    getDoc,
    setDoc,
    arrayUnion,
    arrayRemove,
    onSnapshot,
    Unsubscribe,
    Timestamp,
    writeBatch
} from 'firebase/firestore';
import { BehaviorSubject, Observable } from 'rxjs';
import { GroupNotification } from '../models/notification.model';

export interface Group {
    id?: string;
    name: string;
    description?: string;
    adminId: string;
    creatorName?: string;
    creatorEmail?: string;
    members: string[]; // UIDs
    membersJoinedAt?: { [uid: string]: any }; // UID -> Timestamp
    createdAt: any;
    fullMembers?: any[]; // For rich display in profile
    requiredMembers?: number;
    properties?: string[];
    purpose?: string;
    apartmentId?: string;
    apartmentData?: any;
    // Auto-destruct fields
    expirationTime?: any; // Timestamp
    status?: 'active' | 'expired' | 'completed';
    groupThresholdPercent?: number; // percent used to decide expiration (stored at creation)
}

export interface Invitation {
    id?: string;
    groupId: string;
    groupName: string;
    inviterUid: string;  // Changed from inviterId to match data
    toUid: string;       // Changed from inviteeId to match data
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: any;
    // Optional details for display
    groupDescription?: string;
    memberNames?: string[];
    fullMembers?: any[]; // For rich display
    creatorName?: string;
    adminId?: string;
    type?: 'manual' | 'link'; // 'manual' = invited via users list, 'link' = joining via fast link
}

@Injectable({
    providedIn: 'root'
})
export class GroupService {
    private _invitations$ = new BehaviorSubject<Invitation[]>([]);
    public invitations$ = this._invitations$.asObservable();

    constructor(private auth: AuthService) { }

    private get groupsCollection() {
        return collection(db!, `${this.auth.dbPath}groups`);
    }

    private get invitationsCollection() {
        return collection(db!, `${this.auth.dbPath}groupInvites`);
    }


    async createGroup(
        name: string,
        requiredMembers: number,
        description: string = '',
        properties: string[] = [],
        purpose: string = '',
        apartmentId: string = '',
        apartmentData: any = null
    ): Promise<string> {
        const user = await this.auth.auth?.currentUser;
        if (!user) throw new Error('User not authenticated');

        // Fetch creator profile for name/email
        const profile = await this.auth.getProfile(user.uid);

        const groupData: Partial<Group> = {
            name,
            description,
            adminId: user.uid,
            creatorName: profile ? profile['displayName'] : 'Admin',
            creatorEmail: profile ? profile['email'] : (user.email || ''),
            members: [user.uid],
            membersJoinedAt: {
                [user.uid]: serverTimestamp()
            },
            createdAt: serverTimestamp(),
            requiredMembers,
            properties,
            purpose,
            apartmentData
        };

        // Calculate Expiration
        try {
            const settingsRef = doc(db!, `${this.auth.dbPath}systemSettings`, 'general');
            const settingsSnap = await getDoc(settingsRef);
            let hours = 24; // default
            if (settingsSnap.exists()) {
                const sData = settingsSnap.data();
                if (sData && sData['groupTimeoutHours']) {
                    hours = Number(sData['groupTimeoutHours']);
                }
                // Persist the threshold percent on the group so future changes to settings
                // don't affect already created groups
                if (sData && sData['groupThresholdPercent'] !== undefined) {
                    groupData.groupThresholdPercent = Number(sData['groupThresholdPercent']);
                }
            }
            const now = new Date();
            const expiry = new Date(now.getTime() + hours * 60 * 60 * 1000);

            groupData.expirationTime = Timestamp.fromDate(expiry);
            groupData.status = 'active';

        } catch (e) {
            console.error('Error calculating expiration:', e);
            // Fallback
            groupData.status = 'active';
            // Default 24h
            const now = new Date();
            groupData.expirationTime = Timestamp.fromDate(new Date(now.getTime() + 24 * 60 * 60 * 1000));
        }

        const docRef = await addDoc(this.groupsCollection, groupData);
        return docRef.id;
    }

    async getGroups(): Promise<Group[]> {
        const snap = await getDocs(this.groupsCollection);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Group));
    }

    async getGroupById(groupId: string): Promise<Group | null> {
        const docRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        const snap = await getDoc(docRef);
        return snap.exists() ? { id: snap.id, ...snap.data() } as Group : null;
    }

    listenToGroup(groupId: string, callback: (group: Group | null) => void): Unsubscribe {
        const docRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        return onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                callback({ id: snap.id, ...snap.data() } as Group);
            } else {
                callback(null);
            }
        });
    }

    listenToAllGroups(callback: (groups: Group[]) => void): Unsubscribe {
        const unsub = onSnapshot(this.groupsCollection, (snapshot) => {
            const groups = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Group));
            callback(groups);
        });
        return unsub;
    }

    /**
     * Ensure that groups which are no longer active do not retain members.
     * This will clear the members array and optionally notify former members.
     */
    private async cleanupInactiveGroups(groups: Group[]): Promise<void> {
        if (!Array.isArray(groups)) return;

        for (const g of groups) {
            try {
                if (!g || !g.id) continue;
                const status = g.status || 'active';
                // Treat any non-active status as inactive to avoid strict string literal checks
                const inactive = status !== 'active';
                if (inactive && Array.isArray(g.members) && g.members.length > 0) {
                    const memberIds = [...g.members];
                    const gRef = doc(db!, `${this.auth.dbPath}groups`, g.id);
                    // Clear members so they are no longer considered part of the group
                    await updateDoc(gRef, { members: [] });

                    // Notify former members about closure/cleanup (best-effort)
                    try {
                        await this.notifyGroupExpiration(g.id!, g.name, memberIds);
                    } catch (e) {
                        // non-fatal
                        console.error('Failed to notify members after cleanup for group', g.id, e);
                    }
                }
            } catch (e) {
                console.error('Error during cleanupInactiveGroups for group', g && g.id, e);
            }
        }
    }

    async getGroupsForUser(uid: string): Promise<Group[]> {
        const q = query(this.groupsCollection, where('members', 'array-contains', uid));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Group));
    }

    listenToUserGroups(uid: string, callback: (groups: Group[]) => void): Unsubscribe {
        const q = query(this.groupsCollection, where('members', 'array-contains', uid));
        return onSnapshot(q, (snapshot) => {
            const groups = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Group));
            callback(groups);
        });
    }


    async addUserToGroup(groupId: string, userId: string): Promise<void> {
        const groupRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        console.log('[JOIN] groupRef.path =', groupRef.path);

        console.log('[JOIN] getDoc(groupRef) START');
        const snap = await getDoc(groupRef);
        console.log('[JOIN] getDoc(groupRef) OK, exists=', snap.exists());

        if (!snap.exists()) throw new Error('Group not found');

        const data = snap.data() as any;
        const status = data.status || 'active';
        if (status !== 'active') {
            throw new Error('Cannot join an inactive group');
        }
        console.log('[JOIN] members field type =', Array.isArray(data.members) ? 'array' : typeof data.members);
        console.log('[JOIN] membersJoinedAt type =', data.membersJoinedAt && typeof data.membersJoinedAt);

        console.log('[JOIN] updateDoc(groupRef) START');
        await updateDoc(groupRef, {
            members: arrayUnion(userId),
            [`membersJoinedAt.${userId}`]: serverTimestamp(),
        });
        console.log('[JOIN] updateDoc(groupRef) OK');
    }


    async removeUserFromGroup(groupId: string, userId: string): Promise<void> {
        const { deleteField } = await import('firebase/firestore');
        const groupRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        const memberRef = doc(db!, `${this.auth.dbPath}groups/${groupId}/members/${userId}`);

        const batch = writeBatch(db!);

        // 1. Remove from members array
        // 2. Clear membersJoinedAt entry
        batch.update(groupRef, {
            members: arrayRemove(userId),
            [`membersJoinedAt.${userId}`]: deleteField()
        });

        // 3. Delete member subcollection doc
        batch.delete(memberRef);

        await batch.commit();
    }

    async deleteGroup(groupId: string): Promise<void> {
        const groupRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        await deleteDoc(groupRef);
    }

    async updateGroupRequiredMembers(groupId: string, count: number): Promise<void> {
        const groupRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        await updateDoc(groupRef, {
            requiredMembers: count
        });
    }

    async updateGroupDetails(
        groupId: string,
        description: string,
        properties: string[],
        purpose?: string,
        apartmentId?: string,
        apartmentData?: any
    ): Promise<void> {
        const groupRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        const update: any = {
            description,
            properties
        };
        if (purpose !== undefined) update.purpose = purpose;
        if (apartmentId !== undefined) update.apartmentId = apartmentId;
        if (apartmentData !== undefined) update.apartmentData = apartmentData;

        await updateDoc(groupRef, update);
    }

    async updateGroupAdmin(groupId: string, newAdminId: string): Promise<void> {
        const groupRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        await updateDoc(groupRef, {
            adminId: newAdminId
        });
    }


    async inviteUserToGroup(groupId: string, groupName: string, toUid: string, type: 'manual' | 'link' = 'manual') {
        const userProfile = this.auth.profile;
        if (!userProfile) return;

        // Rules expect: inviteId == `${toUid}_${groupId}`
        const inviteId = `${toUid}_${groupId}`;
        const invRef = doc(db!, `${this.auth.dbPath}groupInvites/${inviteId}`);

        const invitationData = {
            groupId,
            groupName,
            inviterUid: userProfile.uid,
            toUid,
            status: 'pending',
            type,
            createdAt: serverTimestamp(),
        };

        await setDoc(invRef, invitationData, { merge: false });
    }

    private invitationsUnsubscribe: (() => void) | null = null;

    async getInvitationsForUser(uid: string): Promise<Invitation[]> {
        // Clear any previous listener
        if (this.invitationsUnsubscribe) {
            this.invitationsUnsubscribe();
        }

        const q = query(
            this.invitationsCollection,
            where('toUid', '==', uid),
            where('status', '==', 'pending'),
            where('type', '==', 'manual')
        );

        // For immediate return of current state
        const snap = await getDocs(q);
        const invs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
        this._invitations$.next(invs);

        // Setup live listener
        const { onSnapshot } = await import('firebase/firestore');
        this.invitationsUnsubscribe = onSnapshot(q, (snapshot) => {
            const liveInvs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
            this._invitations$.next(liveInvs);
        }, (err) => {
            console.error('Error in invitations listener:', err);
        });

        return invs;
    }

    listenToGroupPendingInvitations(groupId: string, callback: (invites: Invitation[]) => void): Unsubscribe {
        const q = query(
            this.invitationsCollection,
            where('groupId', '==', groupId),
            where('status', '==', 'pending')
        );
        return onSnapshot(q, (snapshot) => {
            const invites = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
            callback(invites);
        });
    }

    async getPendingInvitationsForGroup(groupId: string): Promise<Invitation[]> {
        const q = query(
            this.invitationsCollection,
            where('groupId', '==', groupId),
            where('status', '==', 'pending')
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
    }

    async joinGroupDirectly(groupId: string): Promise<void> {
        const user = this.auth.auth?.currentUser;
        if (!user) throw new Error('User not authenticated');
        const userId = user.uid;

        const groupRef = doc(db!, `${this.auth.dbPath}groups/${groupId}`);
        const snap = await getDoc(groupRef);
        if (!snap.exists()) throw new Error('Group not found');

        const data = snap.data() as any;
        const status = data.status || 'active';
        if (status !== 'active') throw new Error('Cannot join an inactive group');

        const members: string[] = Array.isArray(data.members) ? data.members : [];
        if (members.includes(userId)) return; // Already a member

        // 1. Update group document (satisfies isJoiningSelf rule)
        await updateDoc(groupRef, {
            members: arrayUnion(userId),
            [`membersJoinedAt.${userId}`]: serverTimestamp(),
        });

        // 2. Create member subcollection doc (satisfies members subcollection rule)
        const memberRef = doc(db!, `${this.auth.dbPath}groups/${groupId}/members/${userId}`);
        const memberSnap = await getDoc(memberRef);
        if (!memberSnap.exists()) {
            await setDoc(memberRef, {
                uid: userId,
                inviteId: 'direct_link',
                joinedAt: serverTimestamp(),
            });
        }
    }

    async respondToInvitation(
        invitationIdFromUi: string,
        _groupIdFromUi: string,
        status: 'accepted' | 'rejected'
    ): Promise<void> {
        const user = this.auth.auth?.currentUser;
        if (!user) throw new Error('User not authenticated');

        // Read invite by the id coming from UI (doc id is `${toUid}_${groupId}`)
        const invRef = doc(db!, `${this.auth.dbPath}groupInvites/${invitationIdFromUi}`);
        const invSnap = await getDoc(invRef);
        if (!invSnap.exists()) throw new Error('Invitation not found');

        const invData = invSnap.data() as any;

        // Must be the recipient
        if (invData.toUid !== user.uid) throw new Error('Not allowed');

        const groupId: string = invData.groupId;
        if (!groupId) throw new Error('Invitation missing groupId');

        // Enforce your convention (optional but keeps things consistent)
        const expectedId = `${user.uid}_${groupId}`;
        if (invitationIdFromUi !== expectedId) {
            throw new Error(`Bad invite id. Expected ${expectedId}`);
        }

        if (status === 'accepted') {
            const groupRef = doc(db!, `${this.auth.dbPath}groups/${groupId}`);
            const groupSnap = await getDoc(groupRef);
            if (!groupSnap.exists()) throw new Error('Group not found');

            const groupData = groupSnap.data() as any;
            const gStatus = groupData.status || 'active';
            if (gStatus !== 'active') throw new Error('Cannot join an inactive group');
            const members: string[] = Array.isArray(groupData.members) ? groupData.members : [];

            const alreadyMember = members.includes(user.uid);

            // Only attempt the join update if it will actually grow the array by 1
            if (!alreadyMember) {
                const nextMembers = [...members, user.uid];

                try {
                    // Update ONLY members + membersJoinedAt (exactly what your rule allows)
                    await updateDoc(groupRef, {
                        members: nextMembers,
                        [`membersJoinedAt.${user.uid}`]: serverTimestamp(),
                    });
                } catch (e) {
                    // If a race happened (someone else updated) re-check membership.
                    const reSnap = await getDoc(groupRef);
                    const reData = reSnap.exists() ? (reSnap.data() as any) : null;
                    const reMembers: string[] = reData && Array.isArray(reData.members) ? reData.members : [];

                    if (!reMembers.includes(user.uid)) {
                        throw e; // still not a member -> real failure
                    }
                    // else: user became a member anyway, continue
                }
            }

            // Create member subcollection doc ONLY if missing (updates are forbidden)
            const memberRef = doc(db!, `${this.auth.dbPath}groups/${groupId}/members/${user.uid}`);
            const memberSnap = await getDoc(memberRef);
            if (!memberSnap.exists()) {
                await setDoc(memberRef, {
                    uid: user.uid,
                    inviteId: invitationIdFromUi,
                    joinedAt: serverTimestamp(),
                });
            }
        }

        // Delete invite (allowed by your rules)
        await deleteDoc(invRef);
    }

    async cancelInvitation(groupId: string, toUid: string): Promise<void> {
        const inviteId = `${toUid}_${groupId}`;
        const invRef = doc(db!, `${this.auth.dbPath}groupInvites/${inviteId}`);
        await deleteDoc(invRef);
    }

    // --- Group Properties Management ---

    private get groupPropertiesCollection() {
        return collection(db!, `${this.auth.dbPath}groupProperties`);
    }

    async getGroupProperties(): Promise<string[]> {
        const snap = await getDocs(this.groupPropertiesCollection);
        return snap.docs.map(d => d.data()['name'] as string);
    }

    async addGroupProperty(name: string): Promise<void> {
        const q = query(this.groupPropertiesCollection, where('name', '==', name));
        const snap = await getDocs(q);
        if (!snap.empty) return; // Already exists

        await addDoc(this.groupPropertiesCollection, {
            name,
            createdAt: serverTimestamp()
        });
    }

    async removeGroupProperty(name: string): Promise<void> {
        const q = query(this.groupPropertiesCollection, where('name', '==', name));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
            await deleteDoc(d.ref);
        }
    }

    // --- Notifications Management ---

    private get notificationsCollection() {
        return collection(db!, `${this.auth.dbPath}notifications`);
    }

    async createNotification(notification: Omit<GroupNotification, 'id' | 'createdAt'>): Promise<void> {
        await addDoc(this.notificationsCollection, {
            ...notification,
            createdAt: serverTimestamp()
        });
    }

    async getUserNotifications(userId: string): Promise<GroupNotification[]> {
        const q = query(
            this.notificationsCollection,
            where('userId', '==', userId)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as GroupNotification));
    }

    listenToUserNotifications(userId: string, callback: (notifications: GroupNotification[]) => void): Unsubscribe {
        const q = query(
            this.notificationsCollection,
            where('userId', '==', userId)
        );
        return onSnapshot(q, (snapshot) => {
            const notifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as GroupNotification));
            callback(notifications);
        });
    }

    async markNotificationAsRead(notificationId: string): Promise<void> {
        const notifRef = doc(db!, `${this.auth.dbPath}notifications`, notificationId);
        await updateDoc(notifRef, { read: true });
    }

    async deleteNotification(notificationId: string): Promise<void> {
        const notifRef = doc(db!, `${this.auth.dbPath}notifications`, notificationId);
        await deleteDoc(notifRef);
    }

    async notifyGroupExpiration(groupId: string, groupName: string, memberIds: string[]): Promise<void> {
        // Create notifications for all members
        const batch = writeBatch(db!);

        for (const memberId of memberIds) {
            const notifRef = doc(this.notificationsCollection);
            batch.set(notifRef, {
                userId: memberId,
                groupId,
                groupName,
                type: 'group_expired',
                message: `הקבוצה "${groupName}" פגה תוקפה ונסגרה. כעת תוכל ליצור קבוצה חדשה או להצטרף לקבוצה קיימת.`,
                read: false,
                createdAt: serverTimestamp()
            });
        }

        await batch.commit();
    }
}

