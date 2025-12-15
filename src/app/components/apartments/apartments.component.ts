import { Component, OnInit } from '@angular/core';
import { combineLatest } from 'rxjs';
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
    // full list of apartment question documents (kept to resolve labels)
    apartmentQuestionList: any[] = [];

    // UI state: whether to show the message for unregistered users
    showRegistrationRequired = false;

    constructor(public auth: AuthService) {
        // Wait until auth initialization completes to decide whether to show
        // the registration-required overlay. This avoids showing the overlay
        // briefly while the profile document is still being loaded on refresh.
        combineLatest([this.auth.user$, this.auth.initialized$]).subscribe(([user, initialized]) => {
            if (!initialized) {
                // still initializing; don't show the overlay yet
                this.showRegistrationRequired = false;
                return;
            }
            // only show the registration-required message when there is no logged-in user
            this.showRegistrationRequired = !user;
            // when auth status changes (and DB may be available), try loading data
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
            this.apartmentQuestionList = qs;
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

    // return the first image url from common keys, or undefined
    getPrimaryImage(a: any): string | undefined {
        if (!a) return undefined;
        const possible = ['image', 'imageUrl', 'photo', 'photoUrl', 'pictures', 'images'];
        for (const k of possible) {
            const v = a[k];
            if (!v) continue;
            if (Array.isArray(v) && v.length) return v[0];
            if (typeof v === 'string' && v.trim()) return v;
        }
        // try to find any field that looks like a url
        for (const k of Object.keys(a)) {
            const v = a[k];
            if (typeof v === 'string' && v.match(/^https?:\/\//)) return v;
        }
        return undefined;
    }

    // choose which keys to display in the card (limit to 4 for brevity)
    visibleKeys(a: any): string[] {
        const all = this.keys(a).filter(k => {
            // hide large media or internal fields
            return !['images', 'pictures', 'photo', 'image', 'imageUrl', 'photoUrl'].includes(k);
        });
        return all.slice(0, 4);
    }

    // friendly title for the apartment card (fallback to address or owner)
    titleForApartment(a: any): string {
        if (!a) return 'דירה';
        const titleKeys = ['title', 'address', 'city', 'street', 'location', 'שם'];
        for (const k of titleKeys) {
            if (a[k]) return String(a[k]);
        }
        // fall back to first meaningful detail
        const k = this.visibleKeys(a)[0];
        if (k) return `${this.labelForKey(k)}: ${this.formatAnswer(a[k])}`;
        return 'דירה';
    }

    // return a friendly label for a question key (prefer apartment question 'text')
    labelForKey(k: string): string {
        if (!k) return '';
        const t = this.questionTextMap[k];
        if (t && String(t).trim()) return String(t);
        const q = this.apartmentQuestionList.find((x: any) => x.id === k || x.key === k);
        if (q && q.text) return q.text;
        return k;
    }
}
