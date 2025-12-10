import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ShowMessageComponent } from '../show-message/show-message.component';

@Component({
    selector: 'app-apartments',
    standalone: true,
    imports: [CommonModule, RouterModule, ShowMessageComponent],
    templateUrl: './apartments.component.html',
    styleUrls: ['./apartments.component.css']
})
export class ApartmentsComponent {
    // Placeholder data for now
    apartments = [
        { id: 'a1', title: 'Spacious 3BR in Tel Aviv', city: 'Tel Aviv', price: '₪4,500' },
        { id: 'a2', title: 'Cozy room near Haifa University', city: 'Haifa', price: '₪1,800' }
    ];

    // UI state: whether to show the message for unregistered users
    showRegistrationRequired = false;

    constructor(public auth: AuthService) {
        // subscribe to profile observable to know if a user is registered
        this.auth.profile$.subscribe(p => {
            // profile$ is null for anonymous/unregistered users
            this.showRegistrationRequired = !p;
        });
    }
}
