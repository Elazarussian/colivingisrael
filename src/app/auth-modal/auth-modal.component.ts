import { Component, EventEmitter, Output, ElementRef, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-modal.component.html',
  styleUrls: ['./auth-modal.component.css']
})
export class AuthModalComponent {
  @Output() close = new EventEmitter<void>();

  activeTab: 'login' | 'signup' = 'login';
  email = '';
  password = '';
  errorMessage = '';
  submitting = false;

  constructor(private authService: AuthService, private el: ElementRef, private renderer: Renderer2) { }

  ngOnInit(): void {
    // Move host element to document.body so the modal isn't trapped by ancestor stacking contexts
    try {
      this.renderer.appendChild(document.body, this.el.nativeElement);
    } catch (e) {
      // ignore in environments where document is not available
      console.warn('Could not append auth modal to body', e);
    }
  }

  ngOnDestroy(): void {
    try {
      const parent = this.el.nativeElement.parentNode;
      if (parent) {
        this.renderer.removeChild(parent, this.el.nativeElement);
      }
    } catch (e) {
      console.warn('Could not remove auth modal from body', e);
    }
  }

  closeModal() {
  this.close.emit();
    this.resetForm();
  }

  resetForm() {
    this.email = '';
    this.password = '';
    this.errorMessage = '';
    this.activeTab = 'login';
  }

  switchTab(tab: 'login' | 'signup') {
    this.activeTab = tab;
    this.errorMessage = '';
  }

  async onSubmit() {
    if (!this.authService.auth) {
  // Firebase not configured
      return;
    }
  this.submitting = true;
  try {
      if (this.activeTab === 'signup') {
        await this.authService.signup(this.email, this.password);
      } else {
        await this.authService.login(this.email, this.password);
      }
  this.submitting = false;
  this.closeModal();
    } catch (error: any) {
      console.error('Auth error:', error);
      this.errorMessage = this.authService.getHebrewErrorMessage(error.code);
  this.submitting = false;
    }
  }

  async onGoogleSignIn() {
    if (!this.authService.auth) {
  // Firebase not configured
      return;
    }

    this.submitting = true;
    try {
      await this.authService.loginWithGoogle();
      this.submitting = false;
      this.closeModal();
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      this.errorMessage = this.authService.getHebrewErrorMessage(error.code);
      this.submitting = false;
    }
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal')) {
      this.closeModal();
    }
  }
}
