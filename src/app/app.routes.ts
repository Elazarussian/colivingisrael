import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { AboutComponent } from './components/about/about.component';
import { ProfileComponent } from './components/profile/profile.component';
import { OnboardingGuard } from './onboarding.guard';
import { ApartmentsComponent } from './components/apartments/apartments.component';
import { ApartmentsGuard } from './apartments.guard';
import { SearchGroupsComponent } from './components/search-groups/search-groups.component';

export const routes: Routes = [
    { path: '', component: HomeComponent, canActivate: [OnboardingGuard] },
    { path: 'search-groups', component: SearchGroupsComponent },
    { path: 'about', component: AboutComponent },
    { path: 'apartments', component: ApartmentsComponent, canActivate: [ApartmentsGuard] },
    { path: 'profile', component: ProfileComponent } // No guard here to avoid loop
];
