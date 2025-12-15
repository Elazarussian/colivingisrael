import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShowMessageComponent } from '../show-message/show-message.component';
import { AuthService } from '../../services/auth.service';
import { MessageService } from '../../services/message.service';
import { firstValueFrom } from 'rxjs';

export interface Question {
    id?: string;
    key?: string;
    text: string;
    textEn?: string;
    textRu?: string;
    textFr?: string;
    type: string;
    options?: string[];
    min?: number;
    max?: number;
    maxSelections?: number;
    order?: number;
    createdAt?: string;
    permanent?: boolean;
}

@Component({
    selector: 'app-questions-manager',
    standalone: true,
    imports: [CommonModule, FormsModule, ShowMessageComponent],
    templateUrl: './questions-manager.component.html',
    styleUrls: ['./questions-manager.component.css']
})
export class QuestionsManagerComponent implements OnInit {
    @Input() mode: 'admin-registration' | 'admin-personal-data' | 'admin-maskir' | 'admin-apartment' | 'onboarding' | 'edit-answers' | 'view-answers' | 'fill-apartment' = 'onboarding';
    @Input() profile: any = null;
    @Input() userId?: string;

    @Output() completed = new EventEmitter<void>();
    @Output() closed = new EventEmitter<void>();

    // Questions lists
    questions: Question[] = [];
    personalDataQuestions: Question[] = [];
    maskirQuestions: Question[] = [];
    apartmentQuestions: Question[] = [];
    onboardingQuestions: Question[] = [];
    onboardingPersonalDataQuestions: Question[] = [];
    onboardingMaskirQuestions: Question[] = [];
    editPersonalityQuestions: Question[] = [];

    // Form state for new questions
    newQuestion: Question = this.getEmptyQuestion();
    newPersonalDataQuestion: Question = this.getEmptyQuestion();
    newMaskirQuestion: Question = this.getEmptyQuestion();
    newApartmentQuestion: Question = this.getEmptyQuestion();
    newOption = '';
    newPersonalDataOption = '';
    newMaskirOption = '';
    newApartmentOption = '';

    // Edit question state
    editingQuestion: Question | null = null;
    isEditPersonalData = false;
    isEditMaskir = false;
    isEditApartment = false;
    editOption = '';

    // Answers state
    onboardingAnswers: { [questionId: string]: any } = {};
    editPersonalityAnswers: { [questionId: string]: any } = {};
    apartmentAnswers: { [questionId: string]: any } = {};
    viewedUserAnswers: { [k: string]: any } | null = null;
    viewedUser: any = null;
    viewedQuestionIds: string[] = [];
    questionTextMap: { [id: string]: string } = {};

    // Geo data (cities & neighborhoods)
    cities: Array<{ id: string; name: string; neighborhoods?: string[] }> = [];
    // Suggestions state per question id
    citySuggestions: { [qid: string]: Array<{ id: string; name: string; neighborhoods?: string[] }> } = {};
    neighborhoodSuggestions: { [qid: string]: string[] } = {};

    // UI state
    currentQuestionIndex = 0;
    currentQuestionGroup = 0; // 0 = personal data, 1 = personality
    currentEditQuestionIndex = 0;
    currentLang: 'he' | 'en' | 'ru' | 'fr' = 'he';
    registrationKeyManualMode = false;
    personalDataKeyManualMode = false;
    maskirKeyManualMode = false;
    apartmentKeyManualMode = false;

    // Phone support
    phonePrefixes = ['050', '051', '052', '053', '054', '055', '058'];

    constructor(
        public auth: AuthService,
        private cdr: ChangeDetectorRef,
        private msg: MessageService
    ) { }

    // Resize text inputs to show ~2 words by default and grow as user types
    autoSizeTextInput(el: HTMLInputElement | null) {
        if (!el) return;
        try {
            const text = el.value || el.getAttribute('placeholder') || '';
            // create a hidden measurer span if not present
            let measurer = document.getElementById('__input_measurer__') as HTMLSpanElement | null;
            if (!measurer) {
                measurer = document.createElement('span');
                measurer.id = '__input_measurer__';
                measurer.style.position = 'absolute';
                measurer.style.visibility = 'hidden';
                measurer.style.whiteSpace = 'pre';
                measurer.style.font = window.getComputedStyle(el).font || '16px sans-serif';
                document.body.appendChild(measurer);
            }
            // copy font styles for accurate measurement
            const cs = window.getComputedStyle(el);
            measurer.style.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            // measure text width, add small padding
            measurer.textContent = text || '';
            const padding = 24; // allow for caret & padding
            const px = Math.min(Math.max(measurer.offsetWidth + padding, 120), 900); // min 120px, max 900px
            el.style.width = px + 'px';
        } catch (err) {
            // fallback: ensure a reasonable min width
            if (el) el.style.width = '120px';
        }
    }

    // show-message state
    showMessageVisible = false;
    showMessageText = '';

    // called from template when show-message emits closed
    public onShowMessageClosed(reason: any) {
        this.showMessageVisible = false;
        this.showMessageText = '';
    }

    // show the permanent-warning when checkbox is toggled on
    public onPermanentCheckboxChanged(value: boolean) {
        if (value) {
            this.showMessageText = 'שים לב! לאחר סימון תיבה זאת - השאלה החדשה תהיינה קבוע ולא ניתנת למחיקה באופן ישיר, אלא רק על ידי מתכנת ישירות מהfirebase.';
            this.showMessageVisible = true;
        }
    }

    async ngOnInit() {
        await this.initializeMode();
    }

    private async initializeMode() {
        switch (this.mode) {
            case 'admin-registration':
                await this.loadQuestions();
                break;
            case 'admin-personal-data':
                await this.loadPersonalDataQuestions();
                break;
            case 'admin-maskir':
                await this.loadMaskirQuestions();
                break;
            case 'admin-apartment':
                await this.loadApartmentQuestions();
                break;
            case 'onboarding':
                await this.loadOnboardingQuestions();
                await this.loadCities();
                this.prepareOnboardingAnswers();
                break;
            case 'fill-apartment':
                await this.loadApartmentQuestionsForFill();
                await this.loadCities();
                this.prepareApartmentAnswers();
                break;
            case 'edit-answers':
                await this.loadEditPersonalityQuestions();
                await this.loadCities();
                this.prepareEditPersonalityAnswers();
                break;
            case 'view-answers':
                if (this.userId) {
                    await this.loadUserAnswers(this.userId);
                }
                break;
        }
    }

    // Load israeli cities collection used by geo-manager
    async loadCities() {
        if (!this.auth.db) return;
        try {
            const { collection, getDocs } = await import('firebase/firestore');
            const snap = await getDocs(collection(this.auth.db, `${this.auth.dbPath}israel_locations`));
            this.cities = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            this.cdr.detectChanges();
        } catch (err) {
            console.error('Error loading israel locations:', err);
            this.cities = [];
        }
    }

    // Helper used by template to get neighborhoods array for a given question's model
    getNeighborhoodsForModel(q: Question, model: any): string[] {
        try {
            const id = q.id || '';
            const cityId = model && model[id] && model[id].cityId ? model[id].cityId : '';
            if (!cityId) return [];
            const city = this.cities.find(c => c.id === cityId);
            return city && Array.isArray(city.neighborhoods) ? city.neighborhoods : [];
        } catch (err) {
            return [];
        }
    }

    // Ensure the answer object exists in the provided model for the question and return it.
    // This avoids runtime errors in templates when model entries are not initialized yet.
    getOrInitAnswer(model: any, q: Question): any {
        const id = q.id || '';
        if (!model) return { cityId: '', neighborhood: '' };
        if (!model[id] || typeof model[id] !== 'object') {
            model[id] = { cityId: '', neighborhood: '', cityName: '', neighborhoodName: '' } as any;
        } else {
            // ensure name fields exist and are strings to avoid 'undefined' showing in inputs
            if (model[id].cityName === undefined) model[id].cityName = '';
            if (model[id].neighborhoodName === undefined) model[id].neighborhoodName = '';
        }
        return model[id];
    }

    // Called when user types/selects a city name in the datalist input.
    onCityInput(q: Question, model: any, value: string) {
        const ans: any = this.getOrInitAnswer(model, q) as any;
        ans.cityName = value || '';
        // try to find matching city by exact name
        // Populate client-side suggestions (prefix match)
        const qid = q.id || '';
        if (!value || value.trim().length === 0) {
            this.citySuggestions[qid] = [];
            ans.cityId = '';
            ans.neighborhood = '';
            ans.neighborhoodName = '';
            return;
        }
        const inputLower = value.trim().toLowerCase();
        this.citySuggestions[qid] = this.cities.filter(c => (c.name || '').toLowerCase().includes(inputLower)).slice(0, 8);
        // don't set cityId until user selects
        ans.cityId = '';
        ans.neighborhood = '';
        ans.neighborhoodName = '';
    }

    onNeighborhoodInput(q: Question, model: any, value: string) {
        const ans: any = this.getOrInitAnswer(model, q) as any;
        ans.neighborhoodName = value || '';
        const city = this.cities.find(c => c.id === ans.cityId);
        const qid = q.id || '';
        if (!city) {
            this.neighborhoodSuggestions[qid] = [];
            ans.neighborhood = '';
            return;
        }
        if (!value || value.trim().length === 0) {
            this.neighborhoodSuggestions[qid] = [];
            ans.neighborhood = '';
            return;
        }
        const inputLower = value.trim().toLowerCase();
        this.neighborhoodSuggestions[qid] = (city.neighborhoods || []).filter(n => (n || '').toLowerCase().includes(inputLower)).slice(0, 8);
        ans.neighborhood = '';
    }

    // Called when user selects a city from app suggestions
    onCitySelect(q: Question, model: any, city: { id: string; name: string; neighborhoods?: string[] }) {
        const ans: any = this.getOrInitAnswer(model, q) as any;
        ans.cityId = city.id;
        ans.cityName = city.name;
        ans.neighborhood = '';
        ans.neighborhoodName = '';
        this.citySuggestions[q.id || ''] = [];
        // prefill neighborhood suggestions list for this city if needed
        this.neighborhoodSuggestions[q.id || ''] = (city.neighborhoods || []).slice(0, 8);
    }

    onNeighborhoodSelect(q: Question, model: any, neighborhood: string) {
        const ans: any = this.getOrInitAnswer(model, q) as any;
        ans.neighborhood = neighborhood;
        ans.neighborhoodName = neighborhood;
        this.neighborhoodSuggestions[q.id || ''] = [];
    }

    // Called when city input loses focus. Enforce that only exact city names are accepted.
    onCityBlur(q: Question, model: any) {
        const ans: any = this.getOrInitAnswer(model, q) as any;
        const typed = (ans.cityName || '').trim();
        if (!typed) {
            // empty -> clear selection
            ans.cityId = '';
            ans.neighborhood = '';
            ans.neighborhoodName = '';
            return;
        }
        // Find exact match (case-sensitive name stored in DB). Allow common whitespace normalization.
        const matched = this.cities.find(c => c.name && c.name.trim() === typed);
        if (matched) {
            ans.cityId = matched.id;
            ans.cityName = matched.name; // normalize to stored name
            // clear neighborhood when city set/changed
            ans.neighborhood = '';
            ans.neighborhoodName = '';
        } else {
            // No exact match -> clear input to force user to choose one from list
            ans.cityId = '';
            ans.cityName = '';
            ans.neighborhood = '';
            ans.neighborhoodName = '';
        }
    }

    // Called when neighborhood input loses focus. Enforce that only exact neighborhood names are accepted for the selected city.
    onNeighborhoodBlur(q: Question, model: any) {
        const ans: any = this.getOrInitAnswer(model, q) as any;
        const typed = (ans.neighborhoodName || '').trim();
        if (!typed) {
            ans.neighborhood = '';
            return;
        }
        const city = this.cities.find(c => c.id === ans.cityId);
        if (city && Array.isArray(city.neighborhoods) && city.neighborhoods.includes(typed)) {
            ans.neighborhood = typed; // exact match
            ans.neighborhoodName = typed;
        } else {
            // clear invalid neighborhood
            ans.neighborhood = '';
            ans.neighborhoodName = '';
        }
    }

    private getEmptyQuestion(): Question {
        return {
            text: '',
            textEn: '',
            textRu: '',
            textFr: '',
            key: '',
            type: 'text',
            options: [],
            min: 1,
            max: 5,
            maxSelections: undefined,
            permanent: false
        };
    }

    // === FIREBASE OPERATIONS (from service) ===
    async getRegistrationQuestions(): Promise<Question[]> {
        if (!this.auth.db) return [];
        try {
            const { collection, getDocs } = await import('firebase/firestore');
            const snapshot = await getDocs(collection(this.auth.db, `${this.auth.dbPath}newUsersQuestions`));
            const questions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
            // Sort by order field if present, otherwise by createdAt
            return questions.sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) {
                    return a.order - b.order;
                }
                if (a.order !== undefined) return -1;
                if (b.order !== undefined) return 1;
                return (a.createdAt || '').localeCompare(b.createdAt || '');
            });
        } catch (err) {
            console.error('Error loading registration questions:', err);
            return [];
        }
    }

    async getMaskirQuestions(): Promise<Question[]> {
        if (!this.auth.db) return [];
        try {
            const { collection, getDocs } = await import('firebase/firestore');
            const snapshot = await getDocs(collection(this.auth.db, `${this.auth.dbPath}maskirQuestions`));
            const questions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
            return questions.sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) {
                    return a.order - b.order;
                }
                if (a.order !== undefined) return -1;
                if (b.order !== undefined) return 1;
                return (a.createdAt || '').localeCompare(b.createdAt || '');
            });
        } catch (err) {
            console.error('Error loading maskir questions:', err);
            return [];
        }
    }

    async getPersonalDataQuestions(): Promise<Question[]> {
        if (!this.auth.db) return [];
        try {
            const { collection, getDocs } = await import('firebase/firestore');
            const snapshot = await getDocs(collection(this.auth.db, `${this.auth.dbPath}userPersonalDataQuestions`));
            const questions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
            // Sort by order field if present, otherwise by createdAt
            return questions.sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) {
                    return a.order - b.order;
                }
                if (a.order !== undefined) return -1;
                if (b.order !== undefined) return 1;
                return (a.createdAt || '').localeCompare(b.createdAt || '');
            });
        } catch (err) {
            console.error('Error loading personal data questions:', err);
            return [];
        }
    }

    async getApartmentQuestions(): Promise<Question[]> {
        if (!this.auth.db) return [];
        try {
            const { collection, getDocs } = await import('firebase/firestore');
            const snapshot = await getDocs(collection(this.auth.db, `${this.auth.dbPath}apartmentQuestions`));
            const questions = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));
            return questions.sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) {
                    return a.order - b.order;
                }
                if (a.order !== undefined) return -1;
                if (b.order !== undefined) return 1;
                return (a.createdAt || '').localeCompare(b.createdAt || '');
            });
        } catch (err) {
            console.error('Error loading apartment questions:', err);
            return [];
        }
    }

    async addQuestionToFirebase(collectionName: string, questionData: any): Promise<void> {
        if (!this.auth.db) return;
        try {
            const { collection, addDoc } = await import('firebase/firestore');
            // collectionName passed in is short name, need to prepend TABLE
            await addDoc(collection(this.auth.db, `${this.auth.dbPath}${collectionName}`), questionData);
        } catch (err) {
            console.error('Error adding question:', err);
            throw err;
        }
    }

    async deleteQuestionFromFirebase(collectionName: string, id: string): Promise<void> {
        if (!this.auth.db) return;
        try {
            const { doc, deleteDoc } = await import('firebase/firestore');
            await deleteDoc(doc(this.auth.db, `${this.auth.dbPath}${collectionName}`, id));
        } catch (err) {
            console.error('Error deleting question:', err);
            throw err;
        }
    }

    async updateQuestionInFirebase(collectionName: string, id: string, questionData: any): Promise<void> {
        if (!this.auth.db) return;
        try {
            const { doc, updateDoc } = await import('firebase/firestore');
            await updateDoc(doc(this.auth.db, `${this.auth.dbPath}${collectionName}`, id), questionData);
        } catch (err) {
            console.error('Error updating question:', err);
            throw err;
        }
    }

    async getUserAnswers(uid: string): Promise<any> {
        if (!this.auth.db) return {};
        try {
            const { doc, getDoc } = await import('firebase/firestore');
            const ref = doc(this.auth.db, `${this.auth.dbPath}profiles`, uid);
            const snap = await getDoc(ref);
            return snap.exists() ? (snap.data() as any).questions || {} : {};
        } catch (err) {
            console.error('Error fetching user answers:', err);
            throw err;
        }
    }

    async mapQuestionsToText(): Promise<{ [id: string]: string }> {
        const textMap: { [id: string]: string } = {};

        const [regQs, pdQs, mkQs] = await Promise.all([
            this.getRegistrationQuestions(),
            this.getPersonalDataQuestions(),
            this.getMaskirQuestions()
        ]);

        const mapQ = (q: Question) => {
            if (q.id) textMap[q.id] = q.text;
            if (q.key) textMap[q.key] = q.text;
        };

        regQs.forEach(mapQ);
        pdQs.forEach(mapQ);
        mkQs.forEach(mapQ);

        return textMap;
    }

    // === HELPER METHODS (from service) ===
    getPhonePrefix(val: any): string {
        if (!val || typeof val !== 'string') return '050';
        if (val.length >= 3) return val.substring(0, 3);
        return '050';
    }

    getPhoneNumber(val: any): string {
        if (!val || typeof val !== 'string') return '';
        if (val.length > 3) return val.substring(3);
        return '';
    }

    updatePhoneAnswer(qId: string, part: 'prefix' | 'number', value: string, targetAnswers: any) {
        const currentFull = targetAnswers[qId] || '050';
        let prefix = this.getPhonePrefix(currentFull);
        let number = this.getPhoneNumber(currentFull);

        if (part === 'prefix') {
            prefix = value;
        } else {
            number = value.replace(/\D/g, '');
        }

        targetAnswers[qId] = prefix + number;
    }

    toggleChecklist(current: any[] | undefined, option: string, maxSelections?: number) {
        const arr = Array.isArray(current) ? [...current] : [];
        const idx = arr.indexOf(option);

        if (idx === -1) {
            if (maxSelections && arr.length >= maxSelections) {
                this.msg.show(`ניתן לבחור עד ${maxSelections} אפשרויות בלבד.`);
                return arr;
            }
            arr.push(option);
        } else {
            arr.splice(idx, 1);
        }
        return arr;
    }

    formatAnswer(ans: any) {
        if (ans === null || ans === undefined) return '-';
        if (Array.isArray(ans)) return ans.join(', ');
        if (typeof ans === 'boolean') return ans ? 'כן' : 'לא';
        if (ans && typeof ans === 'object' && 'min' in ans && 'max' in ans) {
            return `${ans.min} - ${ans.max}`;
        }
        return String(ans);
    }

    transliterate(text: string): string {
        const map: { [key: string]: string } = {
            'א': 'a', 'b': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z', 'ח': 'h', 'ט': 't', 'י': 'y',
            'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p',
            'ף': 'p', 'צ': 'ts', 'ץ': 'ts', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't',
            ' ': '_'
        };

        return text.split('').map(char => {
            if (map[char]) return map[char];
            if (/[a-zA-Z0-9]/.test(char)) return char.toLowerCase();
            return '';
        }).join('');
    }

    generateKey(text: string, textEn?: string): string {
        if (textEn && textEn.trim()) {
            return this.transliterate(textEn);
        } else if (text) {
            return this.transliterate(text);
        }
        return '';
    }

    prepareQuestionPayload(q: Question): any {
        const questionData: any = {
            text: q.text,
            textEn: q.textEn || '',
            textRu: q.textRu || '',
            textFr: q.textFr || '',
            key: q.key || null,
            type: q.type,
            permanent: !!q.permanent,
            createdAt: q.createdAt || new Date().toISOString()
        };

        if (q.type === 'checklist' || q.type === 'radio') {
            questionData.options = q.options || [];
        }

        if (q.type === 'scale' || q.type === 'range') {
            if (q.min !== undefined && q.min !== null) questionData.min = q.min;
            if (q.max !== undefined && q.max !== null) questionData.max = q.max;
        }

        if (q.type === 'checklist') {
            if (q.maxSelections !== undefined && q.maxSelections !== null) questionData.maxSelections = q.maxSelections;
        }

        return questionData;
    }

    prepareAnswersMap(questions: Question[], existingAnswers: any): { [key: string]: any } {
        const answers: { [key: string]: any } = {};

        for (const q of questions) {
            const id = q.id || '';
            const key = q.key || id;

            if (existingAnswers) {
                if (existingAnswers[key] !== undefined) {
                    answers[id] = existingAnswers[key];
                    continue;
                } else if (existingAnswers[id] !== undefined) {
                    answers[id] = existingAnswers[id];
                    continue;
                }
            }

            switch (q.type) {
                case 'checklist':
                    answers[id] = [];
                    break;
                case 'yesno':
                    answers[id] = null;
                    break;
                case 'scale':
                    answers[id] = q.min || 1;
                    break;
                case 'date':
                    answers[id] = '';
                    break;
                case 'range':
                    answers[id] = { min: q.min || 0, max: q.max || 100 };
                    break;
                case 'radio':
                    answers[id] = null;
                    break;
                case 'phone':
                    answers[id] = '050';
                    break;
                case 'city_neighborhood':
                    // store as object { cityId: string, neighborhood: string }
                    if (existingAnswers && (existingAnswers[key] || existingAnswers[id])) {
                        const ex = existingAnswers[key] || existingAnswers[id];
                        // if saved as simple string, try to parse
                        if (typeof ex === 'string') {
                            answers[id] = { cityId: ex, neighborhood: '' };
                        } else if (typeof ex === 'object') {
                            answers[id] = { cityId: ex.cityId || '', neighborhood: ex.neighborhood || '' };
                        } else {
                            answers[id] = { cityId: '', neighborhood: '' };
                        }
                    } else {
                        answers[id] = { cityId: '', neighborhood: '' };
                    }
                    break;
                default:
                    answers[id] = '';
            }
        }
        return answers;
    }

    validateAnswer(q: Question, ans: any): boolean {
        if (!q) return false;

        if (q.type === 'checklist') {
            if (!Array.isArray(ans) || ans.length === 0) return false;
            if (q.maxSelections && ans.length > q.maxSelections) return false;
        } else if (q.type === 'yesno') {
            if (ans !== true && ans !== false) return false;
        } else if (q.type === 'scale') {
            if (ans === undefined || ans === null || isNaN(ans)) return false;
        } else if (q.type === 'date') {
            if (!ans || String(ans).trim() === '') return false;
        } else if (q.type === 'range') {
            if (!ans || typeof ans.min !== 'number' || typeof ans.max !== 'number') return false;
            if (ans.min > ans.max) return false;
            if (q.min !== undefined && ans.min < q.min) return false;
            if (q.max !== undefined && ans.max > q.max) return false;
        } else if (q.type === 'phone') {
            if (!ans || String(ans).length < 9) return false;
        } else if (q.type === 'city_neighborhood') {
            if (!ans || typeof ans !== 'object') return false;
            if (!ans.cityId || String(ans.cityId).trim() === '') return false;
            // neighborhood optional
            return true;
        } else if (q.type === 'radio') {
            if (!ans || String(ans).trim() === '') return false;
        } else {
            if (!ans || String(ans).trim() === '') return false;
        }
        return true;
    }

    // === LOAD METHODS ===
    async loadQuestions() {
        this.questions = await this.getRegistrationQuestions();
        this.cdr.detectChanges();
    }

    async loadPersonalDataQuestions() {
        this.personalDataQuestions = await this.getPersonalDataQuestions();
        this.cdr.detectChanges();
    }

    async loadMaskirQuestions() {
        this.maskirQuestions = await this.getMaskirQuestions();
        this.cdr.detectChanges();
    }

    async loadApartmentQuestions() {
        this.apartmentQuestions = await this.getApartmentQuestions();
        this.cdr.detectChanges();
    }

    async loadOnboardingQuestions() {
        this.onboardingPersonalDataQuestions = await this.getPersonalDataQuestions();
        this.onboardingQuestions = await this.getRegistrationQuestions();
        this.onboardingMaskirQuestions = await this.getMaskirQuestions();
        this.cdr.detectChanges();
    }

    async loadApartmentQuestionsForFill() {
        this.apartmentQuestions = await this.getApartmentQuestions();
        this.cdr.detectChanges();
    }

    prepareApartmentAnswers() {
        this.apartmentAnswers = this.prepareAnswersMap(this.apartmentQuestions || [], {});
    }

    /** Ensure a range answer object exists for the given question on the provided model. Returns the answer object. */
    ensureRangeAnswer(model: any, q: Question) {
        const id = q.id || '';
        if (!model[id] || typeof model[id] !== 'object') {
            model[id] = { min: q.min !== undefined ? q.min : 0, max: q.max !== undefined ? q.max : 100 };
        }
        return model[id];
    }

    private mapAnswersForSave(questions: Question[], answersObj: { [k: string]: any }) {
        const payload: any = {};
        for (const q of questions) {
            const id = q.id || '';
            const key = q.key || id;
            const val = answersObj[id];
            if (q.type === 'checklist') payload[key] = Array.isArray(val) ? val : [];
            else if (q.type === 'yesno') payload[key] = val === null ? null : !!val;
            else if (q.type === 'scale') payload[key] = Number(val);
            else payload[key] = val || '';
        }
        return payload;
    }

    async submitApartment() {
        if (!this.auth.db) {
            this.msg.show('Firestore לא מחובר.');
            return;
        }

        try {
            const { collection, addDoc } = await import('firebase/firestore');
            const payload = this.mapAnswersForSave(this.apartmentQuestions, this.apartmentAnswers || {});
            // mark as apartment listing and include createdAt
            payload.createdAt = new Date().toISOString();
            const ref = await addDoc(collection(this.auth.db, `${this.auth.dbPath}apartments`), payload);
            this.msg.show('הדירה נשמרה במאגר');
            this.completed.emit();
            this.close();
        } catch (err) {
            console.error('Error saving apartment:', err);
            this.msg.show('שגיאה בשמירת הדירה. נסה שוב.');
        }
    }

    async loadEditPersonalityQuestions() {
        this.editPersonalityQuestions = await this.getRegistrationQuestions();
        this.cdr.detectChanges();
    }

    async loadUserAnswers(uid: string) {
        try {
            this.viewedUserAnswers = await this.getUserAnswers(uid);
            this.questionTextMap = await this.mapQuestionsToText();
            this.viewedQuestionIds = Object.keys(this.viewedUserAnswers || {});
            this.cdr.detectChanges();
        } catch (err) {
            console.error('Error loading user answers:', err);
            this.msg.show('שגיאה בטעינת תשובות המשתמש');
        }
    }

    // === ADD/DELETE QUESTION METHODS ===
    async addQuestion() {
        if (!this.newQuestion.text) return;
        try {
            const questionData = this.prepareQuestionPayload(this.newQuestion);
            await this.addQuestionToFirebase('newUsersQuestions', questionData);
            this.resetQuestionForm();
            await this.loadQuestions();
        } catch (err) {
            console.error('Error adding question:', err);
            this.msg.show('שגיאה בהוספת השאלה. נסה שוב.');
        }
    }

    async addPersonalDataQuestion() {
        if (!this.newPersonalDataQuestion.text) return;
        try {
            const questionData = this.prepareQuestionPayload(this.newPersonalDataQuestion);
            await this.addQuestionToFirebase('userPersonalDataQuestions', questionData);
            this.resetPersonalDataQuestionForm();
            await this.loadPersonalDataQuestions();
        } catch (err) {
            console.error('Error adding personal data question:', err);
            this.msg.show('שגיאה בהוספת השאלה. נסה שוב.');
        }
    }

    async addMaskirQuestion() {
        if (!this.newMaskirQuestion.text) return;

        // Client-side check: ensure current profile is admin before attempting write
        const isAdminClient = this.auth && this.profile && this.auth.isAdmin ? this.auth.isAdmin(this.profile) : (this.profile?.role === 'admin');
        if (!isAdminClient) {
            this.msg.show('אין הרשאה להוסיף שאלות משכיר. ודא שאתה מחובר בפרופיל מנהל (role=admin) ורענן את הדף.');
            return;
        }

        try {
            const questionData = this.prepareQuestionPayload(this.newMaskirQuestion);
            await this.addQuestionToFirebase('maskirQuestions', questionData);
            this.resetMaskirQuestionForm();
            await this.loadMaskirQuestions();
        } catch (err: any) {
            console.error('Error adding maskir question:', err);
            // Friendly, actionable message for permission errors
            const code = err && (err.code || err.message || '').toString();
            if (code && (code.includes('permission') || code === 'permission-denied')) {
                this.msg.show('שגיאת הרשאה ב-Firestore: לא ניתן לכתוב ל-`maskirQuestions`. וודא שפריסת כללי Firestore כוללת `maskirQuestions` ושהפרופיל שלך role=\'admin\'. אם שינית את החוקים, הרץ `firebase deploy --only firestore:rules`.');
            } else {
                this.msg.show('שגיאה בהוספת השאלה. נסה שוב.');
            }
        }
    }

    async addApartmentQuestion() {
        if (!this.newApartmentQuestion.text) return;
        try {
            const questionData = this.prepareQuestionPayload(this.newApartmentQuestion);
            await this.addQuestionToFirebase('apartmentQuestions', questionData);
            this.resetApartmentQuestionForm();
            await this.loadApartmentQuestions();
        } catch (err) {
            console.error('Error adding apartment question:', err);
            this.msg.show('שגיאה בהוספת השאלה. נסה שוב.');
        }
    }

    async deleteApartmentQuestion(id: string) {
        const q = this.apartmentQuestions.find(x => x.id === id);
        if (q && q.permanent) { this.msg.show('שאלה זו קבועה ולא ניתנת למחיקה ישירות.'); return; }
        if (!confirm('האם אתה בטוח שברצונך למחוק שאלה זו?')) return;
        try {
            await this.deleteQuestionFromFirebase('apartmentQuestions', id);
            await this.loadApartmentQuestions();
        } catch (err) {
            console.error('Error deleting apartment question:', err);
            this.msg.show('שגיאה בפעולת המחיקה. נסה שוב.');
        }
    }

    async deleteQuestion(id: string) {
        const q = this.questions.find(x => x.id === id);
        if (q && q.permanent) { this.msg.show('שאלה זו קבועה ולא ניתנת למחיקה ישירות.'); return; }
        if (!confirm('האם אתה בטוח שברצונך למחוק שאלה זו?')) return;
        try {
            await this.deleteQuestionFromFirebase('newUsersQuestions', id);
            await this.loadQuestions();
        } catch (err) {
            console.error('Error deleting question:', err);
            this.msg.show('שגיאה בפעולת המחיקה. נסה שוב.');
        }
    }

    async deletePersonalDataQuestion(id: string) {
        const q = this.personalDataQuestions.find(x => x.id === id);
        if (q && q.permanent) { this.msg.show('שאלה זו קבועה ולא ניתנת למחיקה ישירות.'); return; }
        if (!confirm('האם אתה בטוח שברצונך למחוק שאלה זו?')) return;
        try {
            await this.deleteQuestionFromFirebase('userPersonalDataQuestions', id);
            await this.loadPersonalDataQuestions();
        } catch (err) {
            console.error('Error deleting personal data question:', err);
            this.msg.show('שגיאה בפעולת המחיקה. נסה שוב.');
        }
    }

    async deleteMaskirQuestion(id: string) {
        const q = this.maskirQuestions.find(x => x.id === id);
        if (q && q.permanent) { this.msg.show('שאלה זו קבועה ולא ניתנת למחיקה ישירות.'); return; }
        if (!confirm('האם אתה בטוח שברצונך למחוק שאלה זו?')) return;
        try {
            await this.deleteQuestionFromFirebase('maskirQuestions', id);
            await this.loadMaskirQuestions();
        } catch (err) {
            console.error('Error deleting maskir question:', err);
            this.msg.show('שגיאה בפעולת המחיקה. נסה שוב.');
        }
    }

    // === REORDER QUESTION METHODS ===
    async moveQuestionUp(index: number, isPersonalData: boolean, isMaskir: boolean = false, isApartment: boolean = false) {
        const list = isApartment ? this.apartmentQuestions : (isMaskir ? this.maskirQuestions : (isPersonalData ? this.personalDataQuestions : this.questions));
        if (index === 0) return; // Already at top

        // Swap with previous
        const temp = list[index];
        list[index] = list[index - 1];
        list[index - 1] = temp;

        // Update order values
    await this.updateQuestionOrders(list, isPersonalData, isMaskir, isApartment);
    }

    async moveQuestionDown(index: number, isPersonalData: boolean, isMaskir: boolean = false, isApartment: boolean = false) {
        const list = isApartment ? this.apartmentQuestions : (isMaskir ? this.maskirQuestions : (isPersonalData ? this.personalDataQuestions : this.questions));
        if (index === list.length - 1) return; // Already at bottom

        // Swap with next
        const temp = list[index];
        list[index] = list[index + 1];
        list[index + 1] = temp;

        // Update order values
    await this.updateQuestionOrders(list, isPersonalData, isMaskir, isApartment);
    }

    private async updateQuestionOrders(list: Question[], isPersonalData: boolean, isMaskir: boolean = false, isApartment: boolean = false) {
        const collectionName = isApartment ? 'apartmentQuestions' : (isMaskir ? 'maskirQuestions' : (isPersonalData ? 'userPersonalDataQuestions' : 'newUsersQuestions'));

        try {
            // Update order for each question
            for (let i = 0; i < list.length; i++) {
                const q = list[i];
                if (!q) continue; // skip empty/undefined entries
                if (q.id) {
                    await this.updateQuestionInFirebase(collectionName, q.id, { order: i });
                    q.order = i; // Update local copy
                }
            }
            this.cdr.detectChanges();
        } catch (err) {
            console.error('Error updating question orders:', err);
            this.msg.show('שגיאה בעדכון סדר השאלות');
        }
    }

    // === EDIT QUESTION METHODS ===
    openEditQuestion(q: Question, isPersonalData: boolean, isMaskir: boolean = false, isApartment: boolean = false) {
        if (q.permanent) {
            this.msg.show('שאלה זו קבועה ולא ניתנת לעריכה ישירות.');
            return;
        }
        this.isEditPersonalData = isPersonalData;
        this.isEditMaskir = !!isMaskir;
        this.isEditApartment = !!isApartment;
        this.editingQuestion = JSON.parse(JSON.stringify(q));
        if (!this.editingQuestion!.options) {
            this.editingQuestion!.options = [];
        }
        this.currentLang = 'he';
    }

    closeEditQuestion() {
        this.editingQuestion = null;
        this.editOption = '';
    }

    async updateQuestion() {
        if (!this.editingQuestion || !this.editingQuestion.id) return;
        // Do not allow updating permanent flag via UI
    const origList = this.isEditApartment ? this.apartmentQuestions : (this.isEditMaskir ? this.maskirQuestions : (this.isEditPersonalData ? this.personalDataQuestions : this.questions));
        const orig = origList.find(x => x.id === this.editingQuestion!.id);
        if (orig && orig.permanent) {
            this.msg.show('שאלה זו קבועה ולא ניתנת לעריכה ישירות.');
            this.closeEditQuestion();
            return;
        }
        try {
            const collectionName = this.isEditApartment ? 'apartmentQuestions' : (this.isEditMaskir ? 'maskirQuestions' : (this.isEditPersonalData ? 'userPersonalDataQuestions' : 'newUsersQuestions'));
            const questionData = this.prepareQuestionPayload(this.editingQuestion);
            delete questionData.key;
            delete questionData.createdAt;

            if (this.editingQuestion.type !== 'checklist' && this.editingQuestion.type !== 'radio') {
                questionData.options = [];
            }
            if (this.editingQuestion.type !== 'scale' && this.editingQuestion.type !== 'range') {
                questionData.min = null;
                questionData.max = null;
            }
            if (this.editingQuestion.type !== 'checklist') {
                questionData.maxSelections = null;
            }

            await this.updateQuestionInFirebase(collectionName, this.editingQuestion.id, questionData);
            this.closeEditQuestion();

            if (this.isEditMaskir) {
                await this.loadMaskirQuestions();
            } else if (this.isEditPersonalData) {
                await this.loadPersonalDataQuestions();
            } else {
                await this.loadQuestions();
            }
        } catch (err) {
            console.error('Error updating question:', err);
            this.msg.show('שגיאה בעדכון השאלה.');
        }
    }

    // === OPTION MANAGEMENT ===
    addOption(value?: string) {
        const candidate = (value !== undefined && value !== null) ? String(value).trim() : (this.newOption || '').trim();
        if (candidate) {
            if (!this.newQuestion.options) this.newQuestion.options = [];
            this.newQuestion.options.push(candidate);
            this.newOption = '';
        }
    }

    removeOption(index: number) {
        if (this.newQuestion.options) {
            this.newQuestion.options.splice(index, 1);
        }
    }

    addPersonalDataOption(value?: string) {
        const candidate = (value !== undefined && value !== null) ? String(value).trim() : (this.newPersonalDataOption || '').trim();
        if (candidate) {
            if (!this.newPersonalDataQuestion.options) this.newPersonalDataQuestion.options = [];
            this.newPersonalDataQuestion.options.push(candidate);
            this.newPersonalDataOption = '';
        }
    }

    addMaskirOption(value?: string) {
        const candidate = (value !== undefined && value !== null) ? String(value).trim() : (this.newMaskirOption || '').trim();
        if (candidate) {
            if (!this.newMaskirQuestion.options) this.newMaskirQuestion.options = [];
            this.newMaskirQuestion.options.push(candidate);
            this.newMaskirOption = '';
        }
    }

    removeMaskirOption(index: number) {
        if (this.newMaskirQuestion.options) {
            this.newMaskirQuestion.options.splice(index, 1);
        }
    }

    addApartmentOption(value?: string) {
        const candidate = (value !== undefined && value !== null) ? String(value).trim() : (this.newApartmentOption || '').trim();
        if (candidate) {
            if (!this.newApartmentQuestion.options) this.newApartmentQuestion.options = [];
            this.newApartmentQuestion.options.push(candidate);
            this.newApartmentOption = '';
        }
    }

    removeApartmentOption(index: number) {
        if (this.newApartmentQuestion.options) {
            this.newApartmentQuestion.options.splice(index, 1);
        }
    }


    removePersonalDataOption(index: number) {
        if (this.newPersonalDataQuestion.options) {
            this.newPersonalDataQuestion.options.splice(index, 1);
        }
    }

    addEditOption() {
        if (this.editOption.trim() && this.editingQuestion) {
            if (!this.editingQuestion.options) this.editingQuestion.options = [];
            this.editingQuestion.options.push(this.editOption.trim());
            this.editOption = '';
        }
    }

    removeEditOption(index: number) {
        if (this.editingQuestion && this.editingQuestion.options) {
            this.editingQuestion.options.splice(index, 1);
        }
    }

    // === ONBOARDING METHODS ===
    prepareOnboardingAnswers() {
        this.currentQuestionIndex = 0;
        // Start with registration questions (group 0)
        // If no registration questions, skip to personal data questions (group 1)
        this.currentQuestionGroup = this.onboardingQuestions.length > 0 ? 0 : 1;

        console.log('🔍 Onboarding Debug:', {
            personalDataCount: this.onboardingPersonalDataQuestions.length,
            personalDataFirst: this.onboardingPersonalDataQuestions[0]?.text,
            registrationCount: this.onboardingQuestions.length,
            registrationFirst: this.onboardingQuestions[0]?.text,
            startingGroup: this.currentQuestionGroup,
            groupName: this.currentQuestionGroup === 0 ? 'Registration' : 'Personal Data'
        });

        const isMaskir = this.profile?.role === 'maskir';
        const secondGroup = isMaskir ? this.onboardingMaskirQuestions : this.onboardingPersonalDataQuestions;
        const allQuestions = [...this.onboardingQuestions, ...secondGroup];
        const existingAnswers = this.profile?.questions;
        this.onboardingAnswers = this.prepareAnswersMap(allQuestions, existingAnswers);
    }

    async submitOnboardingAnswers() {
        const currentUser = await firstValueFrom(this.auth.user$);
        const uid = currentUser?.uid || this.profile?.uid;
        if (!uid) return;

        const answers: any = {};
        const isMaskir = this.profile?.role === 'maskir';
        const secondGroup = isMaskir ? this.onboardingMaskirQuestions : this.onboardingPersonalDataQuestions;
        const allQuestions = [...this.onboardingQuestions, ...secondGroup];

        for (const q of allQuestions) {
            const id = q.id || '';
            const key = q.key || id;
            const ans = this.onboardingAnswers[id];

            if (q.type === 'checklist') {
                answers[key] = Array.isArray(ans) ? ans : [];
            } else if (q.type === 'yesno') {
                answers[key] = ans === null ? null : !!ans;
            } else if (q.type === 'scale') {
                answers[key] = Number(ans);
            } else if (q.type === 'range') {
                answers[key] = ans;
            } else if (q.type === 'radio') {
                answers[key] = ans;
            } else {
                if (q.type === 'city_neighborhood') {
                    answers[key] = ans || { cityId: '', neighborhood: '' };
                } else {
                    answers[key] = ans || '';
                }
            }
        }

        try {
            await this.auth.saveProfile(uid, {
                questions: answers,
                onboardingCompleted: true
            });
            this.completed.emit();
        } catch (err) {
            console.error('Error saving onboarding answers:', err);
            this.msg.show('שגיאה בשמירת תשובות. יש לנסות שוב מאוחר יותר.');
        }
    }

    get currentQuestionList(): Question[] {
        if (this.currentQuestionGroup === 0) {
            return this.onboardingQuestions; // Group 0 = Registration
        } else {
            return this.profile?.role === 'maskir' ? this.onboardingMaskirQuestions : this.onboardingPersonalDataQuestions; // Group 1 = Personal Data or Maskir
        }
    }

    get currentOnboardingQuestion(): Question | undefined {
        return this.currentQuestionList[this.currentQuestionIndex];
    }

    get isLastOnboardingQuestion(): boolean {
        return this.currentQuestionIndex === this.currentQuestionList.length - 1;
    }

    get isLastGroup(): boolean {
        return this.currentQuestionGroup === 1;
    }

    get currentGroupTitle(): string {
        return this.currentQuestionGroup === 0 ? 'שאלות הרשמה' : 'פרטי משתמש';
    }

    get nextGroupPreview(): string {
        const isMaskir = this.profile?.role === 'maskir';
        const nextCount = isMaskir ? this.onboardingMaskirQuestions.length : this.onboardingPersonalDataQuestions.length;
        const nextLabel = isMaskir ? 'שאלון משכיר' : 'פרטי משתמש';
        if (this.currentQuestionGroup === 0 && nextCount > 0) {
            return `הבא: ${nextLabel} (${nextCount} שאלות)`;
        }
        return '';
    }

    get currentOnboardingProgress(): string {
        const currentList = this.currentQuestionList;
        if (currentList.length === 0) return '';
        return `${this.currentQuestionIndex + 1} / ${currentList.length}`;
    }

    get totalQuestionsCount(): string {
        const isMaskir = this.profile?.role === 'maskir';
        const secondCount = isMaskir ? this.onboardingMaskirQuestions.length : this.onboardingPersonalDataQuestions.length;
        const total = this.onboardingQuestions.length + secondCount;
        const answered = this.currentQuestionGroup === 0
            ? this.currentQuestionIndex + 1
            : this.onboardingQuestions.length + this.currentQuestionIndex + 1;
        return `${answered} / ${total}`;
    }

    nextQuestion() {
        if (!this.canProceedWithQuestion()) return;

        if (this.isLastOnboardingQuestion) {
            if (this.currentQuestionGroup === 0 && this.onboardingPersonalDataQuestions.length > 0) {
                this.currentQuestionGroup = 1;
                this.currentQuestionIndex = 0;
            }
        } else {
            this.currentQuestionIndex++;
        }
    }

    prevQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
        } else if (this.currentQuestionGroup === 1) {
            this.currentQuestionGroup = 0;
            this.currentQuestionIndex = this.onboardingQuestions.length - 1;
        }
    }

    canProceedWithQuestion(): boolean {
        const q = this.currentOnboardingQuestion;
        if (!q) return false;
        const id = q.id || '';
        const ans = this.onboardingAnswers[id];
        return this.validateAnswer(q, ans);
    }

    canSubmitOnboarding(): boolean {
        return this.onboardingPersonalDataQuestions.length > 0 && this.canProceedWithQuestion();
    }

    // === EDIT PERSONALITY METHODS ===
    prepareEditPersonalityAnswers() {
        const existingAnswers = this.profile?.questions;
        this.editPersonalityAnswers = this.prepareAnswersMap(this.editPersonalityQuestions, existingAnswers);
    }

    async submitEditPersonalityAnswers() {
        const currentUser = await firstValueFrom(this.auth.user$);
        const uid = currentUser?.uid || this.profile?.uid;
        if (!uid) return;

        const updatedAnswers: any = { ...(this.profile?.questions || {}) };

        for (const q of this.editPersonalityQuestions) {
            const id = q.id || '';
            const key = q.key || id;
            const ans = this.editPersonalityAnswers[id];

            if (q.type === 'checklist') {
                updatedAnswers[key] = Array.isArray(ans) ? ans : [];
            } else if (q.type === 'yesno') {
                updatedAnswers[key] = ans === null ? null : !!ans;
            } else if (q.type === 'scale') {
                updatedAnswers[key] = Number(ans);
            } else if (q.type === 'range') {
                updatedAnswers[key] = ans;
            } else if (q.type === 'radio') {
                updatedAnswers[key] = ans;
            } else {
                if (q.type === 'city_neighborhood') {
                    updatedAnswers[key] = ans || { cityId: '', neighborhood: '' };
                } else {
                    updatedAnswers[key] = ans || '';
                }
            }
        }

        try {
            await this.auth.saveProfile(uid, { questions: updatedAnswers });
            this.completed.emit();
        } catch (err) {
            console.error('Error saving edited answers:', err);
            this.msg.show('שגיאה בשמירת תשובות. יש לנסות שוב מאוחר יותר.');
        }
    }

    get currentEditQuestion(): Question | undefined {
        return this.editPersonalityQuestions[this.currentEditQuestionIndex];
    }

    get isLastEditQuestion(): boolean {
        return this.currentEditQuestionIndex === this.editPersonalityQuestions.length - 1;
    }

    get editQuestionProgress(): string {
        if (this.editPersonalityQuestions.length === 0) return '';
        return `${this.currentEditQuestionIndex + 1} / ${this.editPersonalityQuestions.length}`;
    }

    nextEditQuestion() {
        if (this.canProceedWithEditQuestion() && !this.isLastEditQuestion) {
            this.currentEditQuestionIndex++;
        }
    }

    prevEditQuestion() {
        if (this.currentEditQuestionIndex > 0) {
            this.currentEditQuestionIndex--;
        }
    }

    canProceedWithEditQuestion(): boolean {
        const q = this.currentEditQuestion;
        if (!q) return false;
        const id = q.id || '';
        const ans = this.editPersonalityAnswers[id];
        return this.validateAnswer(q, ans);
    }

    canSubmitEditAnswers(): boolean {
        return this.editPersonalityQuestions.length > 0 && this.canProceedWithEditQuestion();
    }

    cancelEdit() {
        this.closed.emit();
    }

    onQuestionTextChange(isPersonalData: boolean, isMaskir: boolean = false, isApartment: boolean = false) {
        let q: Question;
        if (isMaskir) q = this.newMaskirQuestion;
        else if (isPersonalData) q = this.newPersonalDataQuestion;
        else if (isApartment) q = this.newApartmentQuestion;
        else q = this.newQuestion;

        const isManual = isMaskir ? this.maskirKeyManualMode : (isPersonalData ? this.personalDataKeyManualMode : (isApartment ? this.apartmentKeyManualMode : this.registrationKeyManualMode));

        if (!isManual) {
            q.key = this.generateKey(q.text, q.textEn);
        }
    }

    toggleKeyManualMode(isPersonalData: boolean, isMaskir: boolean = false, isApartment: boolean = false) {
        if (isMaskir) {
            this.maskirKeyManualMode = !this.maskirKeyManualMode;
            if (!this.maskirKeyManualMode) this.onQuestionTextChange(false, true);
            return;
        }

        if (isApartment) {
            this.apartmentKeyManualMode = !this.apartmentKeyManualMode;
            if (!this.apartmentKeyManualMode) this.onQuestionTextChange(false, false, true);
            return;
        }

        if (isPersonalData) {
            this.personalDataKeyManualMode = !this.personalDataKeyManualMode;
            if (!this.personalDataKeyManualMode) {
                this.onQuestionTextChange(true);
            }
        } else {
            this.registrationKeyManualMode = !this.registrationKeyManualMode;
            if (!this.registrationKeyManualMode) {
                this.onQuestionTextChange(false);
            }
        }
    }

    setLanguage(lang: 'he' | 'en' | 'ru' | 'fr') {
        this.currentLang = lang;
    }

    close() {
        this.closed.emit();
    }

    private resetQuestionForm() {
        this.newQuestion = this.getEmptyQuestion();
        this.newOption = '';
        this.registrationKeyManualMode = false;
        this.currentLang = 'he';
    }

    private resetPersonalDataQuestionForm() {
        this.newPersonalDataQuestion = this.getEmptyQuestion();
        this.newPersonalDataOption = '';
        this.personalDataKeyManualMode = false;
        this.currentLang = 'he';
    }

    private resetMaskirQuestionForm() {
        this.newMaskirQuestion = this.getEmptyQuestion();
        this.newMaskirOption = '';
        this.maskirKeyManualMode = false;
        this.currentLang = 'he';
    }

    private resetApartmentQuestionForm() {
        this.newApartmentQuestion = this.getEmptyQuestion();
        this.newApartmentOption = '';
        this.currentLang = 'he';
        this.apartmentKeyManualMode = false;
    }
}
