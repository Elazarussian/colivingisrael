import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  styles: [
    `
    .profile-page { padding: 6rem 1rem 2rem; min-height: 70vh; }
    h1 { margin-top: 0; }
  `]
})
export class ProfileComponent implements OnInit {
  user$ = this.auth.user$;
  profile: any = null;
  editing = false;
  edit: any = { displayName: '', city: '', about: '' };
  showLogoutConfirm = false;

  constructor(private auth: AuthService, private router: Router, private cdr: ChangeDetectorRef) {
    this.auth.profile$.subscribe(p => {
      this.profile = p;
    });
  }

  fieldOrDefault(field: string, userFallback: any = null, def: string = '-') {
    const v = this.profile && (this.profile as any)[field];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    if (userFallback !== undefined && userFallback !== null && String(userFallback).trim() !== '') return userFallback;
    return def;
  }

  ngOnInit() {
    this.auth.reloadProfile();
    // ensure profile is loaded when the user becomes available
    this.auth.user$.subscribe(async (u: any) => {
      if (u && u.uid) {
        try {
          const p = await this.auth.getProfile(u.uid);
          if (p) {
            this.profile = p;
            this.cdr.detectChanges();
          }
        } catch (e) {
          // ignore
        }
      }
    });
  }

  startEdit() {
    this.editing = true;
    this.edit = {
      displayName: this.profile?.displayName || '',
      city: this.profile?.city || '',
      about: this.profile?.about || ''
    };
  }

  cancelEdit() {
    this.editing = false;
    this.edit = { displayName: '', city: '', about: '' };
  }

  async save() {
    const currentUser = await firstValueFrom(this.auth.user$);
    const uid = currentUser?.uid || this.profile?.uid;

    if (!uid) {
      console.error('No UID found, cannot save.');
      return;
    }

    // Remove empty-string fields from edit so we don't overwrite existing values with blanks
    const cleanedEdit: any = {};
    Object.entries(this.edit || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') cleanedEdit[k] = v;
    });
    const data = { ...this.profile, ...cleanedEdit };

    // Optimistic update: Update UI immediately
    this.profile = data;
    this.editing = false;
    this.cdr.detectChanges(); // Force update immediately

    try {
      await this.auth.saveProfile(uid, data);
      console.log('Profile saved successfully to backend.');
    } catch (error) {
      console.error('Error saving profile to backend:', error);
      alert('Changes saved locally. Sync to server failed (check connection).');
    }
  }

  async logout() {
    await this.auth.signOutUser();
    this.router.navigate(['/']);
  }

  promptLogout() {
    this.showLogoutConfirm = true;
  }

  cancelLogout() {
    this.showLogoutConfirm = false;
  }

  async confirmLogout() {
    this.showLogoutConfirm = false;
    await this.logout();
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
