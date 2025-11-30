import { Injectable, NgZone } from '@angular/core';
import { auth } from '../firebase-config';
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

    // Modal control for global open/close of auth modal
    private _showAuthModal$ = new BehaviorSubject<boolean>(false);
    public showAuthModal$ = this._showAuthModal$.asObservable();

    constructor(private ngZone: NgZone) {
        // listen to auth state changes and run updates inside Angular zone
        if (auth) {
            onAuthStateChanged(auth, (user) => {
                console.log('[AuthService] onAuthStateChanged ->', !!user, user ? user.uid : null);
                try {
                    this.ngZone.run(() => {
                        this._user$.next(user || null);
                    });
                } catch (e) {
                    // fallback
                    this._user$.next(user || null);
                }
                try {
                    // visible alert for debugging (temporary)
                    // eslint-disable-next-line no-alert
                    alert('[AuthService] onAuthStateChanged -> ' + (!!user) + ' ' + (user ? user.uid : 'null'));
                } catch (e) {
                    /* ignore */
                }
            });
        }
    }

    get auth() {
        return auth;
    }

    async login(email: string, password: string): Promise<UserCredential> {
        if (!auth) throw new Error('Firebase not configured');
    console.log('[AuthService] login()', email);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.log('[AuthService] login result ->', !!cred?.user, cred?.user?.uid);
    try { alert('[AuthService] login result -> ' + (!!cred?.user) + ' ' + (cred?.user?.uid || 'null')); } catch (e) {}
    try { this._user$.next(cred.user); } catch (e) { /* ignore */ }
    return cred;
    }

    async signup(email: string, password: string): Promise<UserCredential> {
        if (!auth) throw new Error('Firebase not configured');
    console.log('[AuthService] signup()', email);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log('[AuthService] signup result ->', !!cred?.user, cred?.user?.uid);
    try { alert('[AuthService] signup result -> ' + (!!cred?.user) + ' ' + (cred?.user?.uid || 'null')); } catch (e) {}
    try { this._user$.next(cred.user); } catch (e) { /* ignore */ }
    return cred;
    }

    async loginWithGoogle(): Promise<UserCredential> {
        if (!auth) throw new Error('Firebase not configured');
        const provider = new GoogleAuthProvider();
    console.log('[AuthService] loginWithGoogle()');
    const cred = await signInWithPopup(auth, provider);
    console.log('[AuthService] loginWithGoogle result ->', !!cred?.user, cred?.user?.uid);
    try { alert('[AuthService] loginWithGoogle result -> ' + (!!cred?.user) + ' ' + (cred?.user?.uid || 'null')); } catch (e) {}
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
            console.log('[AuthService] signOut -> success');
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
