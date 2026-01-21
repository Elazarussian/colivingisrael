import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, map, take, filter } from 'rxjs';
import { AuthService } from './services/auth.service';
import { MessageService } from './services/message.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
    constructor(
        private auth: AuthService,
        private router: Router,
        private msg: MessageService
    ) { }

    canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ): Observable<boolean | UrlTree> {
        return this.auth.initialized$.pipe(
            filter(initialized => initialized),
            take(1),
            map(() => {
                const user = this.auth.auth?.currentUser;
                if (user) {
                    return true;
                }

                // Not logged in
                this.msg.show('יש להתחבר כדי לגשת לעמוד זה.');
                this.auth.showAuthModal();
                return this.router.parseUrl('/');
            })
        );
    }
}
