import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { AboutComponent } from './components/about/about.component';
import { ProfileComponent } from './components/profile/profile.component';
import { OnboardingGuard } from './onboarding.guard';
import { ApartmentsComponent } from './components/apartments/apartments.component';

export const routes: Routes = [
    { path: '', component: HomeComponent, canActivate: [OnboardingGuard] },
    { path: 'about', component: AboutComponent, canActivate: [OnboardingGuard] },
    { path: 'apartments', component: ApartmentsComponent },
    { path: 'profile', component: ProfileComponent } // No guard here to avoid loop
];
