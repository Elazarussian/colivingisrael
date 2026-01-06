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
    Unsubscribe
} from 'firebase/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

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


    async createGroup(name: string, requiredMembers: number, description: string = ''): Promise<string> {
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
            requiredMembers
        };

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
        return onSnapshot(this.groupsCollection, (snapshot) => {
            const groups = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Group));
            callback(groups);
        });
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
        const groupRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        await updateDoc(groupRef, {
            members: arrayRemove(userId)
        });
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


    async inviteUserToGroup(groupId: string, groupName: string, toUid: string) {
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
            where('status', '==', 'pending')
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
}
