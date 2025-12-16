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
    templateUrl: './topbar.component.html',
    styleUrls: ['./topbar.component.css']
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

    toggleDb() {
        this.auth.toggleDatabaseMode();
    }
}
