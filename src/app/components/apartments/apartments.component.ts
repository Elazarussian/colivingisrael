import { Component, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { combineLatest, firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { MessageService } from '../../services/message.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ShowMessageComponent } from '../show-message/show-message.component';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';

@Component({
    selector: 'app-apartments',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, ShowMessageComponent, QuestionsManagerComponent],
    templateUrl: './apartments.component.html',
    styleUrls: ['./apartments.component.css']
})
export class ApartmentsComponent {
    apartmentsFromDb: any[] = [];
    allApartments: any[] = [];
    publisherFilter: string | null = null;
    publishers: Array<{ uid: string, displayName: string }> = [];
    publisherQuery: string = '';
    showPublisherSuggestions = false;
    forceShowAllSuggestions = false;
    @ViewChild('filterContainer') filterContainer!: ElementRef;
    questionTextMap: { [key: string]: string } = {};
    apartmentQuestionList: any[] = [];
    showRegistrationRequired = false;
    constructor(public auth: AuthService, private router: Router, private msg: MessageService) {
        combineLatest([this.auth.user$, this.auth.initialized$, this.auth.profile$]).subscribe(([user, initialized, profile]) => {
            if (!initialized) {
                this.showRegistrationRequired = false;
                return;
            }
            this.showRegistrationRequired = !user;

            if (user && profile) {
                const role = this.auth.getUserRole(profile);
                if (role !== 'admin' && role !== 'maskir') {
                    this.msg.show('אין הרשאה לצפות במאגר הדירות.');
                    this.router.navigate(['/']);
                    return;
                }
            }

            this.loadApartmentQuestions();
            this.loadApartments();
        });
    }

    showAddApartment = false;
    showEditApartment = false;
    editingApartment: { id: string, data: any } | null = null;

    openAddApartment() {
        this.showAddApartment = true;
    }

    onApartmentSaved() {
        this.showAddApartment = false;
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
            this.allApartments = items;
            await this.buildPublishers();
            this.applyFilters();
        } catch (err) {
            console.error('Error loading apartments:', err);
        }
    }

    async applyFilters() {
        // default behavior: admins see all, maskir see only their own, with optional admin publisher filter
        this.apartmentsFromDb = [];
        try {
            const profile = await firstValueFrom(this.auth.profile$);
            const role = this.auth.getUserRole(profile);
            
            if (role === 'admin') {
                if (this.publisherFilter) {
                    this.apartmentsFromDb = this.allApartments.filter(a => a.createdBy === this.publisherFilter);
                } else {
                    this.apartmentsFromDb = [...this.allApartments];
                }
            } else if (role === 'maskir') {
                const uid = profile?.uid || this.auth.auth?.currentUser?.uid;
                this.apartmentsFromDb = this.allApartments.filter(a => a.createdBy === uid);
                
            } else {
                // other roles should not reach here because guard redirects; show empty list
                this.apartmentsFromDb = [];
            }
        } catch (err) {
            console.error('Error applying filters:', err);
            this.apartmentsFromDb = [];
        }
    }

    async buildPublishers() {
        const uids = new Set<string>();
        let unknownCount = 0;

        // Phase 1: Collect unique UIDs and count unknowns.
        // We normalize 'missing' or explicitly named '__unknown__' as the unknown group.
        for (const a of this.allApartments) {
            if (!a) continue;
            if (!a.createdBy || a.createdBy === '__unknown__') {
                unknownCount++;
            } else {
                uids.add(String(a.createdBy));
            }
        }

        const map = new Map<string, string>();

        // Phase 2: Fetch profiles for all unique UIDs
        if (this.auth.db && uids.size > 0) {
            try {
                const { collection, query, where, getDocs, documentId } = await import('firebase/firestore');
                const profilesRef = collection(this.auth.db, `${this.auth.dbPath}profiles`);

                const uidList = Array.from(uids);
                // Firestore 'in' query has a limit of 30 items
                for (let i = 0; i < uidList.length; i += 30) {
                    const batch = uidList.slice(i, i + 30);
                    const q = query(profilesRef, where(documentId(), 'in', batch));
                    const snap = await getDocs(q);

                    snap.forEach(doc => {
                        const data = doc.data() as any;
                        const name = data.displayName || data.name || 'Anonymous';
                        const email = data.email || '';
                        // Format: Name | Email
                        const display = email ? `${name} | ${email}` : name;
                        map.set(doc.id, display);
                    });
                }
            } catch (err) {
                console.error('[Apartments] buildPublishers: Error fetching profiles:', err);
            }
        }

        // Phase 3: Handle Fallbacks for UIDs where profile fetch didn't return a record
        for (const uid of uids) {
            if (!map.has(uid)) {
                const apt = this.allApartments.find(a => a.createdBy === uid);
                const existingDisplay = apt?.createdByDisplayName;
                // If it looks like a formatted string already or a name, use it; else use UID
                if (existingDisplay && existingDisplay !== uid && existingDisplay !== '__unknown__') {
                    map.set(uid, existingDisplay);
                } else {
                    map.set(uid, uid);
                }
            }
        }

        // Phase 4: Handle "Unknown" group (usually attributed to an admin)
        let adminLabel = `לא ידוע (${unknownCount})`;
        if (unknownCount > 0) {
            try {
                if (this.auth.db) {
                    const { collection, query, where, getDocs, limit } = await import('firebase/firestore');
                    const profilesRef = collection(this.auth.db, `${this.auth.dbPath}profiles`);
                    const q = query(profilesRef, where('role', '==', 'admin'), limit(1));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const data = snap.docs[0].data() as any;
                        const name = data.displayName || data.name || 'Admin';
                        const email = data.email || '';
                        const formatted = email ? `${name} | ${email}` : name;
                        adminLabel = `${formatted} (לא משויך)`;
                    }
                }
            } catch (err) {
                // ignore admin detection errors
            }

            // Normalize all missing creators to '__unknown__' in allApartments
            for (const a of this.allApartments) {
                if (!a.createdBy || a.createdBy === '__unknown__') {
                    a.createdBy = '__unknown__';
                    a.createdByDisplayName = adminLabel;
                }
            }
            map.set('__unknown__', adminLabel);
        }

        // Phase 5: Finalize publishers list for dropdown and ensure card consistency
        this.publishers = Array.from(map.entries()).map(([uid, displayName]) => ({ uid, displayName }));

        // Ensure every apartment in the current view has the best possible display name
        for (const a of this.allApartments) {
            if (a.createdBy && map.has(a.createdBy)) {
                a.createdByDisplayName = map.get(a.createdBy);
            }
        }

        
    }

    getPublisherSuggestions(): Array<{ uid: string, displayName: string }> {
        if (this.forceShowAllSuggestions) return this.publishers;
        const q = (this.publisherQuery || '').toLowerCase().trim();
        if (!q) return this.publishers;
        return this.publishers.filter(p => (p.displayName || '').toLowerCase().includes(q));
    }

    togglePublisherSuggestions(forceShowAll: boolean = false) {
        if (forceShowAll) {
            this.forceShowAllSuggestions = true;
            this.showPublisherSuggestions = true;
        } else {
            this.showPublisherSuggestions = !this.showPublisherSuggestions;
            if (!this.showPublisherSuggestions) this.forceShowAllSuggestions = false;
        }
    }

    onPublisherInputChange() {
        this.showPublisherSuggestions = true;
        this.forceShowAllSuggestions = false;
        // clear active publisher filter until selection
        this.publisherFilter = null;
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        if (this.showPublisherSuggestions && this.filterContainer) {
            const clickedInside = this.filterContainer.nativeElement.contains(event.target);
            if (!clickedInside) {
                this.showPublisherSuggestions = false;
                this.forceShowAllSuggestions = false;
            }
        }
    }

    selectPublisher(uid: string) {
        this.publisherFilter = uid;
        const sel = this.publishers.find(p => p.uid === uid);
        this.publisherQuery = sel ? sel.displayName : uid;
        this.showPublisherSuggestions = false;
        this.applyFilters();
    }

    clearPublisher() {
        this.publisherFilter = null;
        this.publisherQuery = '';
        this.showPublisherSuggestions = false;
        this.applyFilters();
    }

    // Open the questions manager in edit mode for a given apartment
    openEditApartment(ap: any) {
        this.editingApartment = { id: ap.id, data: ap };
        this.showEditApartment = true;
    }

    closeEditApartment() {
        this.showEditApartment = false;
        this.editingApartment = null;
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

    // resolve a creator label for display: prefer createdByDisplayName, then publishers lookup, then raw uid
    getCreatorLabel(a: any): string {
        if (!a) return '';
        if (a.createdByDisplayName) return String(a.createdByDisplayName);
        const uid = a.createdBy;
        if (!uid) return '';
        const p = this.publishers.find(x => x.uid === uid);
        if (p && p.displayName) return p.displayName;
        return String(uid);
    }
}
