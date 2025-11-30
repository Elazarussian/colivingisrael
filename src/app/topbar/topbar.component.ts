import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="topbar">
      <div class="left"> <!-- placeholder for logo or nav links -->
      </div>
      <div class="right">
        <button *ngIf="!(user$ | async)" class="btn register" (click)="openRegister()">הרשמה</button>
        <button *ngIf="user$ | async as user" class="btn profile" (click)="goToProfile()">{{ user.displayName || 'פרופיל' }}</button>
      </div>
      <div class="debug-user" *ngIf="(user$ | async) as dbgUser">
        <small>User: {{ dbgUser.uid }} {{ dbgUser.email }}</small>
      </div>
    </nav>
  `,
  styles: [`
    .topbar { position: fixed; top: 0; right: 0; left: 0; display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1.5rem; z-index: 2000; pointer-events:auto; }
    .topbar .right { display:flex; gap:0.75rem; }
    .btn { padding:0.5rem 1rem; border-radius:8px; border:none; cursor:pointer; }
    .register { background: rgba(255,255,255,0.06); color: white; }
    .profile { background: #4CAF50; color: white; }
    .debug-user { position: absolute; top: 3.25rem; right: 1.25rem; color: rgba(255,255,255,0.8); }
  `]
})
export class TopbarComponent {
  user$ = this.auth.user$;

  constructor(private auth: AuthService, private router: Router) {
  this.user$.subscribe(u => console.log('[Topbar] user$', !!u, u ? u.uid : null));
  }

  openRegister() {
    this.auth.showAuthModal();
    // ensure route to home so modal appears in context
    this.router.navigate(['/']);
  }

  goToProfile() {
    this.router.navigate(['/profile']);
  }
}
