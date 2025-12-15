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
        <ng-container *ngIf="auth.profile$ | async as profile">
             <div *ngIf="auth.isAdmin(profile)" class="db-switch" (click)="toggleDb()" [class.test-mode]="auth.isTestMode">
                <div class="knob"></div>
                <span class="switch-text">{{ auth.isTestMode ? 'TEST DATA' : 'REAL DATA' }}</span>
             </div>
        </ng-container>
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
    .topbar .left { display:flex; align-items:center; gap: 1rem; }
    .topbar .right { display:flex; gap:0.75rem; }
    /* debug user label positioned below the topbar so it doesn't overlay content */
  .debug-user { position: absolute; top: 3.25rem; right: 1.25rem; color: rgba(255,255,255,0.85); }
    
    .db-switch {
        position: relative;
        width: 160px;
        height: 36px;
        background: #4CAF50; /* Green for Real */
        border-radius: 36px;
        cursor: pointer;
        margin-right: 1rem;
        transition: background 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        box-sizing: border-box;
    }
    .db-switch.test-mode {
        background: #F44336; /* Red for Test */
    }
    .db-switch .knob {
        position: absolute;
        top: 4px;
        left: 4px;
        width: 28px;
        height: 28px;
        background: white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
        z-index: 2;
    }
    .db-switch.test-mode .knob {
        transform: translateX(124px); /* Width (160) - KnobWidth (28) - PaddingLeft (4) - PaddingRight (4) */
    }
    .switch-label {
        color: white;
        font-weight: 700;
        font-size: 0.8rem;
        z-index: 1;
        transition: opacity 0.2s;
        text-transform: uppercase;
        pointer-events: none;
        flex: 1;
        text-align: center;
    }
    .label-real {
        margin-left: 32px; /* Space for knob when on left */
    }
    .label-test {
        margin-right: 32px; /* Space for knob when on right */
    }
    /* Hide the opposite label or just have one dynamic label? 
       User wants "Left side real (green) right side test (red)" 
       Usually this means the background shows the state. 
       Let's use static text overlays that fade in/out or just one dynamic text.
       Actually, a common pattern:
       [ (Knob) REAL ] vs [ TEST (Knob) ]
    */
    .switch-text {
        position: absolute;
        width: 100%;
        text-align: center;
        color: rgba(255,255,255,0.9);
        font-weight: bold;
        font-size: 0.85rem;
        pointer-events: none;
    }
  `]
})
export class TopbarComponent {
  user$ = this.auth.user$;
  showHome = false;

  constructor(public auth: AuthService, private router: Router) {
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
  toggleDb() { this.auth.toggleDatabaseMode(); }
}
