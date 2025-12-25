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
    arrayRemove
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
}

export interface Invitation {
    id?: string;
    groupId: string;
    groupName: string;
    inviterId: string;
    inviteeId: string;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: any;
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


    async createGroup(name: string, description: string = ''): Promise<string> {
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
            members: [],
            membersJoinedAt: {},
            createdAt: serverTimestamp()
        };

        const docRef = await addDoc(this.groupsCollection, groupData);
        return docRef.id;
    }

    async getGroups(): Promise<Group[]> {
        const snap = await getDocs(this.groupsCollection);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Group));
    }

    async getGroupsForUser(uid: string): Promise<Group[]> {
        const q = query(this.groupsCollection, where('members', 'array-contains', uid));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as Group));
    }

    async addUserToGroup(groupId: string, userId: string): Promise<void> {
        const groupRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        const joinDateKey = `membersJoinedAt.${userId}`;
        await updateDoc(groupRef, {
            members: arrayUnion(userId),
            [joinDateKey]: serverTimestamp()
        });
    }

    async removeUserFromGroup(groupId: string, userId: string): Promise<void> {
        const groupRef = doc(db!, `${this.auth.dbPath}groups`, groupId);
        await updateDoc(groupRef, {
            members: arrayRemove(userId)
        });
    }

    async inviteUserToGroup(groupId: string, groupName: string, toUid: string) {
        const userProfile = this.auth.profile;
        if (!userProfile) return;

        const invitationData = {
            groupId,
            groupName,
            inviterUid: userProfile.uid,
            toUid: toUid,
            status: 'pending',
            createdAt: serverTimestamp()
        };

        console.group('📌 INVITE DEBUG');
        console.log('Group ID:', groupId, 'Group Name:', groupName, 'Invitee UID:', toUid);
        console.log('Inviter UID:', userProfile.uid);

        try {
            await addDoc(this.invitationsCollection, invitationData);
            console.log('✅ Invite successfully written');
        } catch (err) {
            console.error('❌ Firestore write failed:', err);
            throw err; // Re-throw so UI can handle it
        }
        console.groupEnd();
    }

    async getInvitationsForUser(uid: string): Promise<Invitation[]> {
        const q = query(
            this.invitationsCollection,
            where('toUid', '==', uid),
            where('status', '==', 'pending')
        );
        const snap = await getDocs(q);
        const invs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
        this._invitations$.next(invs);
        return invs;
    }

    async respondToInvitation(invitationId: string, groupId: string, status: 'accepted' | 'rejected'): Promise<void> {
        const invRef = doc(db!, `${this.auth.dbPath}groupInvites/${invitationId}`);
        await updateDoc(invRef, { status });

        if (status === 'accepted') {
            const user = await this.auth.auth?.currentUser;
            if (user) {
                await this.addUserToGroup(groupId, user.uid);
            }
        }

        // Refresh invitations list
        const user = await this.auth.auth?.currentUser;
        if (user) {
            await this.getInvitationsForUser(user.uid);
        }
    }
}
