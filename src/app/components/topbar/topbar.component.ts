import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { filter } from 'rxjs/operators';

@Component({
    selector: 'app-topbar',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    template: `
    <nav class="topbar" [class.expanded]="isMenuOpen">
      <!-- Top Bar Header (All items aligned right) -->
      <div class="bar-header">
          <!-- Admin DB Switch (Only for Admins) -->
          <ng-container *ngIf="auth.profile$ | async as profile">
             <div *ngIf="auth.isAdmin(profile)" class="db-switch" (click)="toggleDb()" [class.test-mode]="auth.isTestMode">
                <div class="knob"></div>
                <span class="switch-text">{{ auth.isTestMode ? 'TEST' : 'REAL' }}</span>
             </div>
          </ng-container>

          <!-- Logo / Brand -->
          <a routerLink="/" class="brand-logo" (click)="closeMenu()">CoLiving</a>
          
          <!-- Mobile/Expand Toggle -->
          <button class="menu-toggle" (click)="toggleMenu()" [class.active]="isMenuOpen" aria-label="Toggle Menu">
             <span class="bar top"></span>
             <span class="bar mid"></span>
             <span class="bar bot"></span>
          </button>
      </div>

      <!-- Expanding Menu Content -->
      <div class="menu-content" [class.open]="isMenuOpen">
         <!-- Search Bar -->
         <div class="search-wrapper">
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input type="text" placeholder="חיפוש באתר..." [(ngModel)]="searchTerm" (keyup.enter)="performSearch()">
            </div>
         </div>
         
         <!-- Navigation Links -->
         <div class="nav-links">
            <a routerLink="/" (click)="closeMenu()" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}">
              <span class="icon">🏠</span> בית
            </a>
            <a routerLink="/about" (click)="closeMenu()" routerLinkActive="active">
              <span class="icon">ℹ️</span> אודות
            </a>
            <a routerLink="/apartments" (click)="closeMenu()" routerLinkActive="active">
              <span class="icon">🏢</span> דירות
            </a>
            
            <div class="divider"></div>

            <ng-container *ngIf="user$ | async as user; else guestLinks">
               <a routerLink="/profile" (click)="closeMenu()" routerLinkActive="active" class="profile-link">
                 <div class="avatar-circle">{{ (user.displayName || 'U')[0] | uppercase }}</div>
                 <span class="user-name">{{ user.displayName || 'פרופיל' }}</span>
               </a>
               <a (click)="logout()" class="action-link logout">
                 <span class="icon">🚪</span> התנתק
               </a>
            </ng-container>
            
            <ng-template #guestLinks>
               <a (click)="openRegister(); closeMenu()" class="action-link login">
                 <span class="icon">👤</span> הרשמה / התחברות
               </a>
            </ng-template>
         </div>
      </div>
    </nav>
  `,
    styles: [`
    :host {
      --glass-bg: rgba(20, 20, 30, 0.85);
      --glass-border: rgba(255, 255, 255, 0.1);
      --primary-color: #4CAF50;
      --accent-color: #2196F3;
      --text-main: #ffffff;
      --text-muted: rgba(255,255,255,0.7);
      --transition-speed: 0.3s;
    }

    .topbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2000;
      background: var(--glass-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--glass-border);
      transition: height var(--transition-speed) ease;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
      height: 64px;
    }
    
    .topbar.expanded {
      height: 100vh;
      background: rgba(10, 10, 15, 0.98);
    }
    @media (min-height: 500px) {
       .topbar.expanded {
          height: auto;
          min-height: 300px;
          border-bottom-left-radius: 20px;
          border-bottom-right-radius: 20px;
       }
    }

    /* Header Bar */
    .bar-header {
      display: flex;
      /* Render header in ltr so flex-end visually places items at the right on RTL pages */
      direction: ltr;
      justify-content: flex-end;
      align-items: center;
      padding: 0 1.5rem;
      height: 64px;
      width: 100%;
      flex-shrink: 0;
      box-sizing: border-box;
      gap: 1.5rem; /* Space between items */
    }

    .brand-logo {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--text-main);
      text-decoration: none;
      letter-spacing: 0.5px;
      cursor: pointer;
      background: linear-gradient(135deg, #fff 0%, #aaa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-left: 0; /* Clear previous margins if any */
    }

    .menu-toggle {
      background: transparent;
      border: none;
      width: 40px;
      height: 40px;
      position: relative;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 6px;
      padding: 0;
    }

    .menu-toggle .bar {
      width: 24px;
      height: 2px;
      background-color: var(--text-main);
      border-radius: 2px;
      transition: all var(--transition-speed) ease;
    }

    .menu-toggle.active .top { transform: rotate(45deg) translate(5px, 6px); }
    .menu-toggle.active .mid { opacity: 0; }
    .menu-toggle.active .bot { transform: rotate(-45deg) translate(5px, -6px); }

    /* Expanded Content */
    .menu-content {
      display: flex;
      flex-direction: column;
      padding: 0 1.5rem 2rem 1.5rem;
      opacity: 0;
      transform: translateY(-10px);
      transition: opacity var(--transition-speed) ease 0.1s, transform var(--transition-speed) ease 0.1s;
      pointer-events: none;
      flex-grow: 1;
    }
    
    .menu-content.open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }

    /* Search */
    .search-wrapper {
      margin-bottom: 1.5rem;
      margin-top: 0.5rem;
    }
    .search-box {
      display: flex;
      align-items: center;
      background: rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 0.6rem 1rem;
      border: 1px solid rgba(255,255,255,0.05);
      transition: border-color 0.2s;
    }
    .search-box:focus-within {
      border-color: rgba(255,255,255,0.3);
      background: rgba(255,255,255,0.12);
    }
    .search-icon {
      font-size: 1.1rem;
      margin-left: 0.5rem;
      opacity: 0.7;
    }
    .search-box input {
      background: transparent;
      border: none;
      color: white;
      width: 100%;
      font-size: 1rem;
      outline: none;
    }
    .search-box input::placeholder {
      color: rgba(255,255,255,0.4);
    }

    /* Links */
    .nav-links {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .nav-links a {
      font-size: 1.1rem;
      color: var(--text-muted);
      text-decoration: none;
      display: flex; /* Hebrew usually RTL, so text aligns naturally */
      align-items: center;
      gap: 1rem;
      padding: 0.75rem;
      border-radius: 12px;
      transition: all 0.2s;
      cursor: pointer;
    }
    .nav-links a:hover, .nav-links a.active {
      color: white;
      background: rgba(255,255,255,0.08);
      padding-right: 1.25rem;
    }
    .nav-links .icon {
      font-size: 1.3rem;
      width: 32px;
      text-align: center;
    }

    .divider {
      height: 1px;
      background: rgba(255,255,255,0.1);
      margin: 0.5rem 0;
    }

    .profile-link {
        display: flex;
        align-items: center;
    }
    .avatar-circle {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      font-weight: bold;
      font-size: 0.9rem;
    }

    .action-link.logout { color: #ff6b6b; }
    .action-link.logout:hover { background: rgba(255, 107, 107, 0.1); }
    
    .action-link.login { color: #4CAF50; }
    .action-link.login:hover { background: rgba(76, 175, 80, 0.1); }

  /* DB Switch Styles */
  .db-switch {
    position: relative;
    width: 120px;
    height: 28px;
    background: #4CAF50;
    border-radius: 28px;
    cursor: pointer;
    transition: background 0.3s ease;
    display: none;
    align-items: center;
    justify-content: space-between;
    padding: 2px;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
    box-sizing: border-box;
    touch-action: manipulation;
    z-index: 2100;
  }
  /* Desktop: show full switch */
  @media(min-width: 400px) { .db-switch { display: flex; } }
  /* Mobile: show compact switch so it's visible on smartphones */
  @media(max-width: 399px) {
    .db-switch { display: flex; width: 84px; height: 26px; padding: 2px; border-radius: 20px; }
    .db-switch .knob { left: 3px; top: 2px; width: 20px; height: 20px; }
    .db-switch.test-mode .knob { transform: translateX(54px); } /* 84 - 20 - 3 -3 */
    .switch-text { font-size: 0.62rem; }
  }

  .db-switch.test-mode { background: #F44336; }
  .db-switch .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
    z-index: 2;
  }
  .db-switch.test-mode .knob { transform: translateX(92px); } /* 120 - 22 - 3 - 3 */
  .switch-text {
    position: absolute;
    width: 100%;
    text-align: center;
    color: rgba(255,255,255,0.95);
    font-weight: bold;
    font-size: 0.7rem;
    pointer-events: none;
    user-select: none;
  }
  `]
})
export class TopbarComponent {
    user$ = this.auth.user$;
    isMenuOpen = false;
    searchTerm = '';

    constructor(public auth: AuthService, private router: Router) {
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd)
        ).subscribe(() => {
            this.isMenuOpen = false;
        });
    }

    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
    }

    closeMenu() {
        this.isMenuOpen = false;
    }

    performSearch() {
        if (this.searchTerm.trim()) {
            console.log('Searching for:', this.searchTerm);
            // Implement search logic here
            this.isMenuOpen = false;
            this.searchTerm = '';
        }
    }

    async logout() {
        const confirmed = confirm('האם אתה בטוח שברצונך להתנתק?');
        if (!confirmed) return;
        try {
            this.closeMenu();
            await this.auth.logout();
            this.router.navigate(['/']);
        } catch (err) {
            console.error('Logout error', err);
        }
    }

    openRegister() {
        this.auth.showAuthModal();
        this.closeMenu();
        this.router.navigate(['/']);
    }

    toggleDb() { this.auth.toggleDatabaseMode(); }
}
