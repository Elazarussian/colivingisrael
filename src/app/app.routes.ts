import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AboutComponent } from './about/about.component';
import { ProfileComponent } from './profile/profile.component';
import { NewQuestionsComponent } from './admin/new-questions.component';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'about', component: AboutComponent }
    ,{ path: 'profile', component: ProfileComponent }
    ,{ path: 'admin/new-questions', component: NewQuestionsComponent }
];
