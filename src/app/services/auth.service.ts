import { Injectable, NgZone } from '@angular/core';
import { auth, db } from '../firebase-config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    UserCredential,
    onAuthStateChanged,
    User
} from 'firebase/auth';
import { BehaviorSubject, Observable } from 'rxjs';
import { signOut } from 'firebase/auth';

@Injectable({
    providedIn: 'root'
})
export class AuthService {

    private _user$ = new BehaviorSubject<User | null>(null);
    public user$: Observable<User | null> = this._user$.asObservable();

    private _profile$ = new BehaviorSubject<any | null>(null);
    public profile$ = this._profile$.asObservable();

    // Modal control for global open/close of auth modal
    private _showAuthModal$ = new BehaviorSubject<boolean>(false);
    public showAuthModal$ = this._showAuthModal$.asObservable();

    constructor(private ngZone: NgZone) {
        // listen to auth state changes and run updates inside Angular zone
        if (auth) {
            onAuthStateChanged(auth, (user) => {
                try {
                    this.ngZone.run(async () => {
                        this._user$.next(user || null);
                        if (user && db) {
                            // load profile document
                            const docRef = doc(db, 'profiles', user.uid);
                            const snap = await getDoc(docRef);
                            this._profile$.next(snap.exists() ? snap.data() : null);
                        } else {
                            this._profile$.next(null);
                        }
                    });
                } catch (e) {
                    // fallback
                    this._user$.next(user || null);
                }
            });
        }
    }

    get auth() {
        return auth;
    }

    get db() { return db; }

    // Profile read/write
    async getProfile(uid: string) {
        if (!db) throw new Error('Firestore not configured');
        const docRef = doc(db, 'profiles', uid);
        const snap = await getDoc(docRef);
        return snap.exists() ? snap.data() : null;
    }

    async saveProfile(uid: string, data: any) {
        if (!db) {
            console.error('Firestore not configured in AuthService');
            throw new Error('Firestore not configured');
        }
        console.log('AuthService: saveProfile called for', uid, data);

        const docRef = doc(db, 'profiles', uid);
        let payload: any = { ...data, uid };
        // remove empty-string fields so we don't persist blanks
        Object.keys(payload).forEach(k => {
            if (k === 'uid') return;
            if (payload[k] === '') delete payload[k];
        });

        // OPTIMISTIC UPDATE: Update the observable immediately
        this._profile$.next(payload);

        // Create a timeout promise
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Firestore operation timed out. Please check your internet connection and Firestore setup.')), 10000)
        );

        try {
            // Race between setDoc and timeout
            await Promise.race([
                setDoc(docRef, payload, { merge: true }),
                timeout
            ]);
            console.log('AuthService: setDoc completed');
        } catch (error) {
            console.error('AuthService: saveProfile error', error);
            throw error;
        }
    }

    // Allow manual reload of profile (useful after app start)
    async reloadProfile() {
        const user = this._user$.getValue();
        if (user && db) {
            const docRef = doc(db, 'profiles', user.uid);
            const snap = await getDoc(docRef);
            this._profile$.next(snap.exists() ? snap.data() : null);
        }
    }

    async login(email: string, password: string): Promise<UserCredential> {
        if (!auth) throw new Error('Firebase not configured');
        const cred = await signInWithEmailAndPassword(auth, email, password);
        try { this._user$.next(cred.user); } catch (e) { /* ignore */ }
        return cred;
    }

    async signup(email: string, password: string): Promise<UserCredential> {
        if (!auth) throw new Error('Firebase not configured');
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        try { this._user$.next(cred.user); } catch (e) { /* ignore */ }
        return cred;
    }

    async loginWithGoogle(): Promise<UserCredential> {
        if (!auth) throw new Error('Firebase not configured');
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(auth, provider);
        try { this._user$.next(cred.user); } catch (e) { /* ignore */ }
        return cred;
    }

    // Global modal control
    showAuthModal() {
        this._showAuthModal$.next(true);
    }

    hideAuthModal() {
        this._showAuthModal$.next(false);
    }

    async signOutUser() {
        if (!auth) return;
        try {
            await signOut(auth);
            this._user$.next(null);
        } catch (e) {
            console.error('[AuthService] signOut error', e);
        }
    }

    getHebrewErrorMessage(errorCode: string): string {
        const errorMessages: { [key: string]: string } = {
            'auth/email-already-in-use': 'האימייל כבר בשימוש',
            'auth/invalid-email': 'אימייל לא תקין',
            'auth/operation-not-allowed': 'פעולה לא מורשית',
            'auth/weak-password': 'הסיסמה חלשה מדי',
            'auth/user-disabled': 'המשתמש חסום',
            'auth/user-not-found': 'משתמש לא נמצא',
            'auth/wrong-password': 'סיסמה שגויה',
            'auth/missing-password': 'סיסמה חסרה',
            'auth/popup-closed-by-user': 'החלון נסגר',
        };
        return errorMessages[errorCode] || 'שגיאה לא ידועה';
    }
}
