import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SetAdminComponent } from '../set-admin/set-admin.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, SetAdminComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {
  constructor(public auth: AuthService) { }

  showAuthModal() {
    this.auth.showAuthModal();
  }

  scrollToContent() {
    const firstSection = document.querySelector('main .content-section');
    firstSection?.scrollIntoView({ behavior: 'smooth' });
  }
}
