import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TopbarComponent } from './components/topbar/topbar.component';
import { AuthModalComponent } from './components/auth-modal/auth-modal.component';
import { ShowMessageComponent } from './components/show-message/show-message.component';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TopbarComponent, AuthModalComponent, ShowMessageComponent],
  template: `
    <app-topbar></app-topbar>
    <router-outlet></router-outlet>
    <app-auth-modal *ngIf="showAuthModal" (close)="auth.hideAuthModal()"></app-auth-modal>
    <show-message *ngIf="messageToShow" [message]="messageToShow" (closed)="onMsgClosed($event)"></show-message>
  `,
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  showAuthModal = false;
  title = 'coliving-israel';
  constructor(public auth: AuthService) {
    this.auth.showAuthModal$.subscribe(v => {
      this.showAuthModal = v;
    });
    // demo message (component is standalone; other components can set messageToShow)
    this.messageToShow = '';
  }

  messageToShow = '';

  onMsgClosed(reason: 'ok'|'x') {
    // hide message; real callers can react to reason
    this.messageToShow = '';
  }
}
