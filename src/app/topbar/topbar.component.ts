import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { NavigationEnd, RouterEvent } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="topbar">
      <div class="left"> <!-- placeholder for logo or nav links -->
  <button *ngIf="showHome" class="btn btn-regular" (click)="goHome()">בית</button>
      </div>
      <div class="right">
  <button *ngIf="!(user$ | async)" class="btn btn-approve" (click)="openRegister()">הרשמה</button>
  <button *ngIf="user$ | async as user" class="btn btn-special" (click)="goToProfile()">{{ user.displayName || 'פרופיל' }}</button>
      </div>
    </nav>
  `,
  styles: [`
    .topbar { position: fixed; top: 0; right: 0; left: 0; display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1.5rem; z-index: 2000; pointer-events:auto; }
    .topbar .right { display:flex; gap:0.75rem; }
    .debug-user { position: absolute; top: 3.25rem; right: 1.25rem; color: rgba(255,255,255,0.8); }
  `]
})
export class TopbarComponent {
  user$ = this.auth.user$;
  showHome = false;

  constructor(private auth: AuthService, private router: Router) {
    // update showHome based on current route
    this.updateShowHome(this.router.url || '/');
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(ev => {
      this.updateShowHome(ev.urlAfterRedirects || ev.url);
    });
  }

  private updateShowHome(url: string) {
    // show home button on any non-root path
    this.showHome = !(url === '/' || url === '' || url.startsWith('/?'));
  }

  openRegister() {
    this.auth.showAuthModal();
    // ensure route to home so modal appears in context
    this.router.navigate(['/']);
  }

  goToProfile() {
    this.router.navigate(['/profile']);
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
