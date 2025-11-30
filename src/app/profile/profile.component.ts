import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="profile-page">
      <div class="container">
        <h1>פרופיל משתמש</h1>
        <div *ngIf="user$ | async as user; else loggedOut">
          <p><strong>שם:</strong> {{ user.displayName || 'לא מוגדר' }}</p>
          <p><strong>אימייל:</strong> {{ user.email }}</p>
          <p><strong>UID:</strong> {{ user.uid }}</p>
          <p><strong>עיר:</strong> <em>להשלים</em></p>
          <p><strong>אודות:</strong> <em>להשלים</em></p>
          <div style="margin-top:1.25rem; display:flex; gap:0.75rem; justify-content:flex-end;">
            <button class="btn secondary" (click)="goHome()">חזרה לבית</button>
            <button class="btn profile" (click)="logout()">התנתק</button>
          </div>
        </div>
        <ng-template #loggedOut>
          <p>אנא התחבר כדי לראות את הפרופיל.</p>
        </ng-template>
      </div>
    </section>
  `,
  styles: [`
    .profile-page { padding: 6rem 1rem 2rem; min-height: 70vh; }
    .container { max-width: 900px; margin: 0 auto; background: rgba(255,255,255,0.04); padding: 2rem; border-radius: 12px; }
    h1 { margin-top: 0; }
  `]
})
export class ProfileComponent {
  user$ = this.auth.user$;
  constructor(private auth: AuthService, private router: Router) { }

  async logout() {
    await this.auth.signOutUser();
    this.router.navigate(['/']);
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
