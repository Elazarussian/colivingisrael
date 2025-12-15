import { Injectable, NgZone } from '@angular/core';
import { auth, db } from '../firebase-config';
import { environment } from '../../environments/environment';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    UserCredential,
    onAuthStateChanged,
    User,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential
} from 'firebase/auth';
import { BehaviorSubject, Observable } from 'rxjs';
import { signOut } from 'firebase/auth';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    // Current DB state: 'real' | 'test'
    // Default to 'real' in production unless overridden by localStorage (only for admins)
    private _isTestMode = false;
    get isTestMode() { return this._isTestMode; }


    private _user$ = new BehaviorSubject<User | null>(null);
    public user$: Observable<User | null> = this._user$.asObservable();

    private _profile$ = new BehaviorSubject<any | null>(null);
    public profile$ = this._profile$.asObservable();

    // Emits true once the initial Firebase auth state has been processed.
    private _initialized$ = new BehaviorSubject<boolean>(false);
    public initialized$ = this._initialized$.asObservable();

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
                            const docRef = doc(db, `${this.dbPath}profiles`, user.uid);
                            console.log('AuthService: Loading profile from:', docRef.path);
                            const snap = await getDoc(docRef);

                            if (snap.exists()) {
                                // Profile exists, update it with latest email if changed
                                const profileData = snap.data();
                                if (profileData['email'] !== user.email) {
                                    await setDoc(docRef, { email: user.email }, { merge: true });
                                    profileData['email'] = user.email;
                                }
                                this._profile$.next(profileData);
                            } else {
                                // Profile doesn't exist, create it with default values
                                const newProfile = {
                                    uid: user.uid,
                                    email: user.email || '',
                                    displayName: user.displayName || '',
                                    role: 'user', // Default role
                                    createdAt: new Date().toISOString()
                                };
                                await setDoc(docRef, newProfile);
                                this._profile$.next(newProfile);
                                console.log('Created new profile for user:', user.uid);
                                // ensure users collection has a corresponding entry
                                // await this.ensureUserExists(user); // REMOVED: using profiles only
                            }
                // signal that initialization has completed after profile load
                this._initialized$.next(true);
                        } else {
                            this._profile$.next(null);
                // signal that initialization has completed when there is no user
                this._initialized$.next(true);
                        }
                    });
                } catch (e) {
                    console.error('Error in auth state change:', e);
                    // fallback
                    this._user$.next(user || null);
            this._initialized$.next(true);
                }
            });
        }

        // Initialize DB mode from local storage if set
        const savedMode = localStorage.getItem('admin_db_mode');
        if (savedMode) {
            this._isTestMode = (savedMode === 'test');
        } else {
            // Default behavior: Users always see Real.
            // In dev environment, if environment.TABLE points to testdata, we respect that as default.
            if (environment.TABLE.includes('testdata')) {
                this._isTestMode = true;
            }
        }
    }

    get auth() {
        return auth;
    }

    get db() { return db; }

    get dbPath(): string {
        // If explicitly in test mode (via toggle or dev env), return test path
        if (this._isTestMode) {
            return 'testdata/db/';
        }
        // Otherwise return root path (Real Data)
        return '';
    }

    toggleDatabaseMode() {
        this._isTestMode = !this._isTestMode;
        localStorage.setItem('admin_db_mode', this._isTestMode ? 'test' : 'real');
        // reload to ensure fresh data
        window.location.reload();
    }


    // Profile read/write
    async getProfile(uid: string) {
        if (!db) throw new Error('Firestore not configured');
        const docRef = doc(db, `${this.dbPath}profiles`, uid);
        const snap = await getDoc(docRef);
        return snap.exists() ? snap.data() : null;
    }

    async saveProfile(uid: string, data: any) {
        if (!db) {
            console.error('Firestore not configured in AuthService');
            throw new Error('Firestore not configured');
        }
        console.log('AuthService: saveProfile called for', uid, data);

        const docRef = doc(db, `${this.dbPath}profiles`, uid);
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
            const docRef = doc(db, `${this.dbPath}profiles`, user.uid);
            const snap = await getDoc(docRef);
            this._profile$.next(snap.exists() ? snap.data() : null);
        }
    }

    // Logout method
    async logout() {
        if (auth) {
            await signOut(auth);
            this._user$.next(null);
            this._profile$.next(null);
        }
    }

    // Role-based permission methods
    getUserRole(profile: any): string {
        // Returns the role from the profile, defaults to 'user'
        return profile?.role || 'user';
    }

    isAdmin(profile: any): boolean {
        return this.getUserRole(profile) === 'admin';
    }

    hasPermission(profile: any, requiredRole: 'admin' | 'maskir' | 'user'): boolean {
        const role = this.getUserRole(profile);
        const roleHierarchy: { [key: string]: number } = {
            'admin': 3,
            'maskir': 2,
            'user': 1
        };
        return (roleHierarchy[role] || 0) >= (roleHierarchy[requiredRole] || 0);
    }

    // Helper method to ensure profile exists for a user
    private async ensureProfileExists(user: User): Promise<void> {
        if (!db) return;

        const docRef = doc(db, `${this.dbPath}profiles`, user.uid);
        const snap = await getDoc(docRef);

        if (!snap.exists()) {
            // Create profile with default values
            const newProfile = {
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || '',
                role: 'user', // Default role
                createdAt: new Date().toISOString()
            };
            await setDoc(docRef, newProfile);
            console.log('Created profile for user:', user.uid);
        } else {
            // Update email if it changed
            const profileData = snap.data();
            if (profileData['email'] !== user.email) {
                await setDoc(docRef, { email: user.email }, { merge: true });
            }
        }
    }

    // Helper method to ensure there is an entry in `users` collection for the user
    // REMOVED: using profiles only
    // private async ensureUserExists(user: User): Promise<void> { ... }

    async login(email: string, password: string): Promise<UserCredential> {
        if (!auth) throw new Error('Firebase not configured');
        const cred = await signInWithEmailAndPassword(auth, email, password);
        try {
            this._user$.next(cred.user);
            await this.ensureProfileExists(cred.user);
            await this.ensureProfileExists(cred.user);
            // await this.ensureUserExists(cred.user);
        } catch (e) {
            console.error('Error in login:', e);
        }
        return cred;
    }

    async signup(email: string, password: string, role: 'user' | 'maskir' = 'user'): Promise<UserCredential> {
        if (!auth) throw new Error('Firebase not configured');
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        try {
            this._user$.next(cred.user);
            // Create profile with the selected role
            if (db) {
                const docRef = doc(db, `${this.dbPath}profiles`, cred.user.uid);
                const newProfile = {
                    uid: cred.user.uid,
                    email: cred.user.email || '',
                    displayName: cred.user.displayName || '',
                    role: role,
                    createdAt: new Date().toISOString()
                };
                await setDoc(docRef, newProfile);
                this._profile$.next(newProfile);
                console.log('Created new profile with role:', role);
            }
        } catch (e) {
            console.error('Error in signup:', e);
        }
        return cred;
    }

    async loginWithGoogle(): Promise<UserCredential> {
        if (!auth) throw new Error('Firebase not configured');
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(auth, provider);
        try {
            this._user$.next(cred.user);
            await this.ensureProfileExists(cred.user);
            await this.ensureProfileExists(cred.user);
            // await this.ensureUserExists(cred.user);
        } catch (e) {
            console.error('Error in Google login:', e);
        }
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

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        if (!auth || !auth.currentUser) {
            throw new Error('No authenticated user');
        }

        const user = auth.currentUser;

        // User must have an email to use email/password authentication
        if (!user.email) {
            throw new Error('auth/no-email');
        }

        // Re-authenticate the user with their current password
        const credential = EmailAuthProvider.credential(user.email, currentPassword);

        try {
            await reauthenticateWithCredential(user, credential);
            // If re-authentication succeeds, update the password
            await updatePassword(user, newPassword);
        } catch (error: any) {
            // Re-throw with the original error code for proper error handling
            throw error;
        }
    }

    getHebrewErrorMessage(errorCode: string): string {
        const errorMessages: { [key: string]: string } = {
            'auth/email-already-in-use': 'האימייל כבר בשימוש',
            'auth/invalid-email': 'אימייל לא תקין',
            'auth/operation-not-allowed': 'פעולה לא מורשית',
            'auth/weak-password': 'הסיסמה חלשה מדי (לפחות 6 תווים)',
            'auth/user-disabled': 'המשתמש חסום',
            'auth/user-not-found': 'משתמש לא נמצא',
            'auth/wrong-password': 'סיסמה שגויה',
            'auth/missing-password': 'סיסמה חסרה',
            'auth/popup-closed-by-user': 'החלון נסגר',
            'auth/no-email': 'לא ניתן לשנות סיסמה למשתמשים ללא אימייל',
            'auth/requires-recent-login': 'יש להתחבר מחדש לפני שינוי סיסמה',
        };
        return errorMessages[errorCode] || 'שגיאה לא ידועה';
    }
}
