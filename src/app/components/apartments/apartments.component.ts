import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-apartments',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './apartments.component.html',
    styleUrls: ['./apartments.component.css']
})
export class ApartmentsComponent {
    // Placeholder data for now
    apartments = [
        { id: 'a1', title: 'Spacious 3BR in Tel Aviv', city: 'Tel Aviv', price: '₪4,500' },
        { id: 'a2', title: 'Cozy room near Haifa University', city: 'Haifa', price: '₪1,800' }
    ];
}
