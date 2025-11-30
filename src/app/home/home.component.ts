import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router'; // <-- add this
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule], // <-- add RouterModule
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  constructor(public auth: AuthService) {}

  showAuthModal() {
  console.log('[Home] showAuthModal()');
  this.auth.showAuthModal();
  }

  scrollToContent() {
    const firstSection = document.querySelector('main .content-section');
    firstSection?.scrollIntoView({ behavior: 'smooth' });
  }
}
