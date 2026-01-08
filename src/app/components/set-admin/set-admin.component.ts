import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { doc, setDoc } from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-set-admin',
    standalone: true,
    templateUrl: './set-admin.component.html'
})
export class SetAdminComponent {
    userEmail = '';
    currentRole = '';
    message = '';
    messageColor = 'black';

    constructor(private auth: AuthService) {
        this.auth.user$.subscribe(user => {
            this.userEmail = user?.email || 'Not logged in';
        });

        this.auth.profile$.subscribe(profile => {
            this.currentRole = profile?.role || 'No role set';
            console.log('SetAdmin - Profile updated:', profile);
        });
    }

    async setAdminRole() {
        try {
            const user = await firstValueFrom(this.auth.user$);
            if (!user) {
                this.message = 'No user logged in!';
                this.messageColor = 'red';
                return;
            }

            if (!this.auth.db) {
                this.message = 'Firestore not configured!';
                this.messageColor = 'red';
                return;
            }

            console.log('Setting admin role for user:', user.uid);
            const profileRef = doc(this.auth.db!, `${this.auth.dbPath}profiles`, user.uid);
            await setDoc(profileRef, { role: 'admin' }, { merge: true });

            this.message = '✅ Admin role set! Refreshing profile...';
            this.messageColor = 'green';

            await this.auth.reloadProfile();

            console.log('Profile reloaded, waiting before refresh...');
            setTimeout(() => { window.location.reload(); }, 1000);

        } catch (error: any) {
            this.message = '❌ Error: ' + error.message;
            this.messageColor = 'red';
            console.error('Error setting admin role:', error);
        }
    }
}
