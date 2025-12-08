import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AboutComponent } from './about/about.component';
import { ProfileComponent } from './profile/profile.component';
import { OnboardingGuard } from './onboarding.guard';

export const routes: Routes = [
    { path: '', component: HomeComponent, canActivate: [OnboardingGuard] },
    { path: 'about', component: AboutComponent, canActivate: [OnboardingGuard] }
    , { path: 'profile', component: ProfileComponent } // No guard here to avoid loop
];
