import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { GroupService } from '../../services/group.service';
import { MessageService } from '../../services/message.service';
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
    showLogoutConfirm = false;
    pendingInvitationsCount = 0;

    constructor(
        public auth: AuthService,
        private groupService: GroupService,
        private messageService: MessageService,
        private router: Router
    ) {
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd)
        ).subscribe(() => {
            this.isMenuOpen = false;
        });

        // Listen for profile changes to load invitations
        this.auth.profile$.subscribe(p => {
            if (p) {
                this.loadInvitations(p.uid);
            } else {
                this.pendingInvitationsCount = 0;
            }
        });

        // Listen to invitations observable for live updates
        this.groupService.invitations$.subscribe(invs => {
            if (invs.length > this.pendingInvitationsCount) {
                this.messageService.show(`יש לך ${invs.length} הזמנות חדשות לקבוצות!`);
            }
            this.pendingInvitationsCount = invs.length;
        });
    }

    async loadInvitations(uid: string) {
        try {
            const invs = await this.groupService.getInvitationsForUser(uid);
            this.pendingInvitationsCount = invs.length;
        } catch (err) {
            console.error('Error loading invitations in topbar', err);
        }
    }

    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
    }

    closeMenu() {
        this.isMenuOpen = false;
    }

    goToInvitations() {
        this.closeMenu();
        const element = document.getElementById('groups-management-section');
        if (this.router.url.includes('/profile') && element) {
            element.scrollIntoView({ behavior: 'smooth' });
        } else {
            this.router.navigate(['/profile'], { fragment: 'groups-management-section' });
        }
    }

    performSearch() {
        if (this.searchTerm.trim()) {
            console.log('Searching for:', this.searchTerm);
            // Implement search logic here
            this.isMenuOpen = false;
            this.searchTerm = '';
        }
    }

    logout() {
        this.showLogoutConfirm = true;
        this.closeMenu();
    }

    cancelLogout() {
        this.showLogoutConfirm = false;
    }

    async confirmLogout() {
        try {
            this.showLogoutConfirm = false;
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
