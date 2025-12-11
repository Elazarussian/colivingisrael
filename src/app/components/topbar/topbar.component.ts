import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="topbar">
      <div class="left"> <!-- placeholder for logo or nav links -->
  <button *ngIf="showHome" class="btn btn-special" [routerLink]="['/']">בית</button>
      </div>
      <div class="right">
  <ng-container *ngIf="user$ | async as user; else notLogged">
    <button class="btn btn-special" (click)="goToProfile()">{{ user.displayName || 'פרופיל' }}</button>
    <button class="btn btn-cancel" (click)="logout()">התנתק</button>
  </ng-container>
  <ng-template #notLogged>
    <button class="btn btn-approve" (click)="openRegister()">הרשמה</button>
  </ng-template>
      </div>
    </nav>
  `,
  styles: [`
    .topbar { 
      position: fixed;
      top: 0;
      right: 0;
      left: 0;
      display:flex;
      justify-content:space-between;
      align-items:center;
      /* height is controlled by a CSS variable so the page can reserve space */
      height: var(--topbar-height, 64px);
      box-sizing: border-box;
      padding: 0 1.5rem;
      z-index: 2000; /* above page content but below modal overlays (modal-overlay z-index:2100) */
      /* match global site nav: dark, translucent with blur */
      background: rgba(0,0,0,0.35);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      color: rgba(255,255,255,0.95);
      pointer-events:auto;
    }
    /* make sure buttons inside topbar remain clickable and laid out */
  .topbar .right { display:flex; gap:0.75rem; }
    /* debug user label positioned below the topbar so it doesn't overlay content */
  .debug-user { position: absolute; top: 3.25rem; right: 1.25rem; color: rgba(255,255,255,0.85); }
  `]
})
export class TopbarComponent {
  user$ = this.auth.user$;
  showHome = false;

  constructor(private auth: AuthService, private router: Router) {
    this.updateShowHome(this.router.url || '/');
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(ev => {
      this.updateShowHome(ev.urlAfterRedirects || ev.url);
    });
  }

  async logout() {
    const confirmed = confirm('האם אתה בטוח שברצונך להתנתק?');
    if (!confirmed) return;
    try {
      await this.auth.logout();
      this.router.navigate(['/']);
    } catch (err) {
      console.error('Logout error', err);
    }
  }

  private updateShowHome(url: string) {
    this.showHome = !(url === '/' || url === '' || url.startsWith('/?'));
  }

  openRegister() { this.auth.showAuthModal(); this.router.navigate(['/']); }
  goToProfile() { this.router.navigate(['/profile']); }
  goHome() { this.router.navigate(['/']); }
}
