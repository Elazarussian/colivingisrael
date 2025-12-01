import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from './services/auth.service';
import { Observable, map, take, skip } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class OnboardingGuard implements CanActivate {

    constructor(private auth: AuthService, private router: Router) { }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {
        return this.auth.profile$.pipe(
            // Skip initial null value if profile is still loading (optional, but safer to wait for first real emission if possible)
            // However, BehaviorSubject emits immediately. If it's null, it might mean not loaded or not logged in.
            // We'll handle null by checking auth state.
            take(1),
            map(profile => {
                // If no profile (not logged in or loading), we might want to let them pass or check auth user
                // But if they are logged in, they MUST have a profile (AuthService creates one).

                // If not logged in, this guard doesn't block (AuthGuard handles login requirement).
                // We only care if they ARE logged in but haven't answered questions.

                // Actually, we need to know if the user is authenticated first.
                const user = this.auth.auth?.currentUser;
                if (!user) {
                    return true; // Not logged in, let them go (e.g. to home or about)
                }

                if (!profile) {
                    // Profile loading or error. Let's assume safe to proceed or maybe wait?
                    // For now, allow, to avoid blocking if firestore is slow.
                    return true;
                }

                // Check if user has answered questions
                const hasAnswers = profile.questions && Object.keys(profile.questions).length > 0;

                // If they have answers, they can go anywhere.
                if (hasAnswers) {
                    return true;
                }

                // If they DON'T have answers:
                // If they are already going to /profile, let them in (so they can answer).
                if (state.url.startsWith('/profile')) {
                    return true;
                }

                // Otherwise, redirect to profile
                return this.router.createUrlTree(['/profile'], { queryParams: { showOnboarding: '1' } });
            })
        );
    }
}
