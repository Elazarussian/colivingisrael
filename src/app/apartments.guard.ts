import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, map, take } from 'rxjs';
import { AuthService } from './services/auth.service';
import { MessageService } from './services/message.service';

@Injectable({ providedIn: 'root' })
export class ApartmentsGuard implements CanActivate {
    constructor(private auth: AuthService, private router: Router, private msg: MessageService) {}

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {
        return this.auth.profile$.pipe(
            take(1),
            map(profile => {
                const user = this.auth.auth?.currentUser;
                if (!user) {
                    // Not logged in - show message and block access
                    this.msg.show('אין כניסה למאגר דירות ללא הרשמה לאתר. יש להירשם לפני הצפייה במודעות.');
                    return false;
                }

                if (!profile) {
                    // No profile exists (shouldn't happen for logged in users) - block and show message
                    this.msg.show('אין כניסה למאגר דירות ללא פרופיל. פנה למערכת לרענון הפרופיל.');
                    return false;
                }

                // If profile exists, allow access
                return true;
            })
        );
    }
}
