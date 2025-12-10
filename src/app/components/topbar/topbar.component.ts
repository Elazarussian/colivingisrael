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
  <button *ngIf="showHome" class="btn btn-regular" [routerLink]="['/']">בית</button>
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
    .topbar { position: fixed; top: 0; right: 0; left: 0; display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1.5rem; z-index: 2000; pointer-events:auto; }
    .topbar .right { display:flex; gap:0.75rem; }
    .debug-user { position: absolute; top: 3.25rem; right: 1.25rem; color: rgba(255,255,255,0.8); }
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
