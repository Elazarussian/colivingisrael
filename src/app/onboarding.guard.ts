import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { combineLatest, map, filter, take, switchMap, from, of } from 'rxjs';
import { AuthService } from './services/auth.service';
import { collection, getDocs } from 'firebase/firestore';
import { Question } from './components/questions-manager/questions-manager.component';

@Injectable({ providedIn: 'root' })
export class OnboardingGuard implements CanActivate {

    constructor(private auth: AuthService, private router: Router) { }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
        return this.auth.initialized$.pipe(
            filter(Boolean),
            take(1),
            switchMap(() =>
                combineLatest([this.auth.user$, this.auth.profile$]).pipe(take(1))
            ),
            switchMap(([user, profile]) => {
                if (!user || !profile) return of(true);
                if (this.auth.isAdmin(profile)) return of(true);
                if (profile.onboardingCompleted) return of(true);
                if (state.url.startsWith('/profile')) return of(true);
                if (!this.auth.db) return of(this.redirect());

                const isMaskir = profile.role === 'maskir';
                const path = isMaskir
                    ? `${this.auth.dbPath}maskirQuestions`
                    : `${this.auth.dbPath}userPersonalDataQuestions`;

                return from(getDocs(collection(this.auth.db, path))).pipe(
                    map(snap => snap.docs.map(d => ({ id: d.id, ...d.data() }) as Question)),
                    map(questions =>
                        this.isValid(profile.questions || {}, questions)
                            ? true
                            : this.redirect()
                    )
                );
            })
        );
    }

    private redirect(): UrlTree {
        return this.router.createUrlTree(
            ['/profile'],
            { queryParams: { showOnboarding: '1' } }
        );
    }

    private isValid(answers: any, questions: Question[]): boolean {
        if (!questions.length) return false;

        return questions.every(q => {
            const key = String(q.key ?? q.id);
            const a = answers[key];

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
                    return !!a;
                case 'range':
                    return a && typeof a.min === 'number' && typeof a.max === 'number' && a.min <= a.max;
                case 'phone':
                    return typeof a === 'string' && a.length >= 9;
                case 'city_neighborhood':
                    return a && a.cityId;
                default:
                    return !!a;
            }
        });
    }
}
