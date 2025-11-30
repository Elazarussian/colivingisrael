import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TopbarComponent } from './topbar/topbar.component';
import { AuthModalComponent } from './auth-modal/auth-modal.component';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TopbarComponent, AuthModalComponent],
  template: `
    <app-topbar></app-topbar>
    <router-outlet></router-outlet>
    <app-auth-modal *ngIf="showAuthModal" (close)="auth.hideAuthModal()"></app-auth-modal>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  showAuthModal = false;
  constructor(public auth: AuthService) {
    this.auth.showAuthModal$.subscribe(v => {
      this.showAuthModal = v;
    });
  }
}
