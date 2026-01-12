import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { combineLatest, map, filter, take, switchMap, from, of, Observable } from 'rxjs';
import { AuthService } from './services/auth.service';
import { collection, getDocs, Firestore } from 'firebase/firestore';
import { Question } from './components/questions-manager/questions-manager.component';

@Injectable({ providedIn: 'root' })
export class OnboardingGuard implements CanActivate {

    constructor(private auth: AuthService, private router: Router) { }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
        return this.auth.initialized$.pipe(
            filter(Boolean),
            take(1),
            switchMap(() =>
                combineLatest([this.auth.user$, this.auth.profile$])
            ),
            // Wait until profile is loaded if user is logged in
            filter(([user, profile]) => {
                if (!user) return true; // Not logged in -> proceed
                return !!profile; // Logged in -> wait for profile
            }),
            take(1),
            switchMap(([user, profile]) => {
                // 1. Visitors and Admins
                if (!user || !profile) return of(true); // Allow visitors (or handle in component)
                if (this.auth.isAdmin(profile)) return of(true); // Admins always bypass

                // Allow access to profile page itself to avoid loops
                if (state.url.startsWith('/profile')) return of(true);

                if (!this.auth.db) return of(this.redirect('registration'));

                // 2. Check Level 1: Registration Questions (Always required for authenticated users)
                return this.checkQuestions('newUsersQuestions', profile.questions).pipe(
                    switchMap(regValid => {
                        if (!regValid) {
                            // Stage 1 incomplete
                            return of(this.redirect('registration'));
                        }

                        // 3. Check Level 2: Personal Questions (Required for Strict Routes)
                        // Strict routes: search-groups, apartments (maskir)
                        // Note: apartments route has ApartmentsGuard, but we enforce data completeness here too.
                        const strictRoutes = ['/search-groups', '/apartments'];
                        const isStrict = strictRoutes.some(path => state.url.includes(path));

                        if (isStrict) {
                            if (profile.onboardingCompleted) return of(true);

                            const isMaskir = profile.role === 'maskir';
                            const collectionName = isMaskir ? 'maskirQuestions' : 'userPersonalDataQuestions';

                            return this.checkQuestions(collectionName, profile.questions).pipe(
                                map(personalValid => {
                                    if (!personalValid) {
                                        // Stage 2 incomplete
                                        return this.redirect('onboarding');
                                    }
                                    return true;
                                })
                            );
                        }

                        // Not a strict route, and registration is done -> Allow
                        return of(true);
                    })
                );
            })
        );
    }

    private checkQuestions(collectionName: string, userAnswers: any = {}): Observable<boolean> {
        if (!this.auth.db) return of(false);
        const path = `${this.auth.dbPath}${collectionName}`;

        return from(getDocs(collection(this.auth.db, path))).pipe(
            map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }) as Question)),
            map(questions => this.isValid(userAnswers, questions))
        );
    }

    private redirect(mode: 'registration' | 'onboarding'): UrlTree {
        const queryParams = mode === 'registration'
            ? { showRegistration: '1' }
            : { showOnboarding: '1' };

        return this.router.createUrlTree(
            ['/profile'],
            { queryParams }
        );
    }

    private isValid(answers: any, questions: Question[]): boolean {
        if (!questions.length) return true; // No questions = valid by default

        return questions.every(q => {
            const key = String(q.key ?? q.id);
            const a = answers[key];
            // Check based on question type
            switch (q.type) {
                case 'checklist':
                    return Array.isArray(a) && a.length > 0 &&
                        (!q.maxSelections || a.length <= q.maxSelections);
                case 'yesno':
                    return a === true || a === false;
                case 'scale':
                    return typeof a === 'number';
                case 'date':
                case 'radio':
                    return !!a && String(a).trim().length > 0;
                case 'range':
                    return a && typeof a.min === 'number' && typeof a.max === 'number' && a.min <= a.max;
                case 'phone':
                    return typeof a === 'string' && a.length >= 9;
                case 'city_neighborhood':
                    return a && a.cityId;
                default:
                    // text, generic
                    return !!a && String(a).trim().length > 0;
            }
        });
    }
}
