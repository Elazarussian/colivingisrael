import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { AboutComponent } from './components/about/about.component';
import { ProfileComponent } from './components/profile/profile.component';
import { AdminSettingsComponent } from './components/admin-settings/admin-settings.component';
import { OnboardingGuard } from './onboarding.guard';
import { ApartmentsComponent } from './components/apartments/apartments.component';
import { ApartmentsGuard } from './apartments.guard';
import { AuthGuard } from './auth.guard';

export const routes: Routes = [
    { path: '', component: HomeComponent, canActivate: [OnboardingGuard] },
    { path: 'search-groups', loadComponent: () => import('./components/search-groups/search-groups.component').then(m => m.SearchGroupsComponent), canActivate: [AuthGuard, OnboardingGuard] },
    { path: 'about', component: AboutComponent, canActivate: [OnboardingGuard] },
    { path: 'apartments', component: ApartmentsComponent, canActivate: [ApartmentsGuard, OnboardingGuard] },
    { path: 'profile', component: ProfileComponent } // No guard here to avoid loop
    , { path: 'admin-settings', component: AdminSettingsComponent }
];
