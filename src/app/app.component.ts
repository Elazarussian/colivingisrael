import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TopbarComponent } from './components/topbar/topbar.component'; // force rebuild
import { AuthModalComponent } from './components/auth-modal/auth-modal.component';
import { ShowMessageComponent } from './components/show-message/show-message.component';
import { AuthService } from './services/auth.service';
import { MessageService } from './services/message.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TopbarComponent, AuthModalComponent, ShowMessageComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  showAuthModal = false;
  title = 'coliving-israel';
  messageToShow = '';

  constructor(public auth: AuthService, private msg: MessageService) {
    this.auth.showAuthModal$.subscribe(v => {
      this.showAuthModal = v;
    });

    this.msg.message$.subscribe(m => {
      this.messageToShow = m || '';
    });
  }
  onMsgClosed(reason: 'ok' | 'x') {
    // hide message; real callers can react to reason
    this.messageToShow = '';
  }
}
