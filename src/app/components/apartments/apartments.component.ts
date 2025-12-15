import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ShowMessageComponent } from '../show-message/show-message.component';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';

@Component({
    selector: 'app-apartments',
    standalone: true,
    imports: [CommonModule, RouterModule, ShowMessageComponent, QuestionsManagerComponent],
    templateUrl: './apartments.component.html',
    styleUrls: ['./apartments.component.css']
})
export class ApartmentsComponent {
    // apartments loaded from Firestore
    apartmentsFromDb: any[] = [];
    // map of question key/id -> human text (from apartmentQuestions)
    questionTextMap: { [key: string]: string } = {};

    // UI state: whether to show the message for unregistered users
    showRegistrationRequired = false;

    constructor(public auth: AuthService) {
        // subscribe to profile observable to know if a user is registered
        this.auth.profile$.subscribe(p => {
            // profile$ is null for anonymous/unregistered users
            this.showRegistrationRequired = !p;
            // when profile status changes (and DB may be available), try loading data
            this.loadApartmentQuestions();
            this.loadApartments();
        });
    }

    // state for opening the add-apartment modal
    showAddApartment = false;

    openAddApartment() {
        this.showAddApartment = true;
    }

    onApartmentSaved() {
        this.showAddApartment = false;
        // Reload listings after a new apartment is saved
        this.loadApartments();
    }

    closeAddApartment() {
        this.showAddApartment = false;
    }

    // === Firestore loading ===
    async loadApartmentQuestions() {
        if (!this.auth.db) return;
        try {
            const { collection, getDocs } = await import('firebase/firestore');
            const snap = await getDocs(collection(this.auth.db, `${this.auth.dbPath}apartmentQuestions`));
            const qs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            // build map by key or id
            const map: { [k: string]: string } = {};
            for (const q of qs) {
                const key = q.key || q.id;
                if (key) map[key] = q.text || '';
            }
            this.questionTextMap = map;
        } catch (err) {
            console.error('Error loading apartment questions:', err);
        }
    }

    async loadApartments() {
        if (!this.auth.db) return;
        try {
            const { collection, getDocs } = await import('firebase/firestore');
            const snap = await getDocs(collection(this.auth.db, `${this.auth.dbPath}apartments`));
            const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            // sort by createdAt desc if available
            items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            this.apartmentsFromDb = items;
        } catch (err) {
            console.error('Error loading apartments:', err);
        }
    }

    // helper to iterate object keys in template
    keys(obj: any): string[] {
        if (!obj) return [];
        return Object.keys(obj).filter(k => k !== 'id' && k !== 'createdAt');
    }

    formatAnswer(ans: any): string {
        if (ans === null || ans === undefined) return '-';
        if (Array.isArray(ans)) return ans.join(', ');
        if (typeof ans === 'boolean') return ans ? 'כן' : 'לא';
        if (ans && typeof ans === 'object' && 'min' in ans && 'max' in ans) {
            return `${ans.min} - ${ans.max}`;
        }
        return String(ans);
    }
}
