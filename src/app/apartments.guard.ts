import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, map, take, filter, switchMap } from 'rxjs';
import { AuthService } from './services/auth.service';
import { MessageService } from './services/message.service';

@Injectable({ providedIn: 'root' })
export class ApartmentsGuard implements CanActivate {
    constructor(private auth: AuthService, private router: Router, private msg: MessageService) { }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {
        return this.auth.initialized$.pipe(
            filter(initialized => initialized), // Wait until initialized becomes true
            take(1),                            // Take the first 'true' and complete this inner waiting
            switchMap(() => this.auth.profile$), // Switch to the profile stream
            take(1),                            // Take the current profile value
            map(profile => {
                const user = this.auth.auth?.currentUser;
                if (!user) {
                    // Not logged in - show message and block access
                    this.msg.show('אין כניסה למאגר דירות ללא הרשמה לאתר. יש להירשם לפני הצפייה במודעות.');
                    return this.router.parseUrl('/');
                }

                if (!profile) {
                    // No profile exists (shouldn't happen for logged in users) - block and show message
                    this.msg.show('אין כניסה למאגר דירות ללא פרופיל. פנה למערכת לרענון הפרופיל.');
                    return this.router.parseUrl('/');
                }

                // Only allow admin or maskir roles to access the apartments section
                const role = this.auth.getUserRole(profile);
                if (role === 'admin' || role === 'maskir') {
                    return true;
                }

                // Other roles (e.g., 'user') are not permitted
                this.msg.show('אין הרשאה לצפות במאגר הדירות. יש לפנות למנהל המערכת לקבלת הרשאות.');
                return this.router.parseUrl('/');
            })
        );
    }
}
