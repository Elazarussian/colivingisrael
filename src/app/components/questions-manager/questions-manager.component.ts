import { Component, OnInit, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
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
}

@Component({
    selector: 'app-questions-manager',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './questions-manager.component.html',
    styleUrls: ['./questions-manager.component.css']
})
export class QuestionsManagerComponent implements OnInit {
    @Input() mode: 'admin-registration' | 'admin-personal-data' | 'onboarding' | 'edit-answers' | 'view-answers' = 'onboarding';
    @Input() profile: any = null;
    @Input() userId?: string;

    @Output() completed = new EventEmitter<void>();
    @Output() closed = new EventEmitter<void>();

    // Questions lists
    questions: Question[] = [];
    personalDataQuestions: Question[] = [];
    onboardingQuestions: Question[] = [];
    onboardingPersonalDataQuestions: Question[] = [];
    editPersonalityQuestions: Question[] = [];

    // Form state for new questions
    newQuestion: Question = this.getEmptyQuestion();
    newPersonalDataQuestion: Question = this.getEmptyQuestion();
    newOption = '';
    newPersonalDataOption = '';

    // Edit question state
    editingQuestion: Question | null = null;
    isEditPersonalData = false;
    editOption = '';

    // Answers state
    onboardingAnswers: { [questionId: string]: any } = {};
    editPersonalityAnswers: { [questionId: string]: any } = {};
    viewedUserAnswers: { [k: string]: any } | null = null;
    viewedUser: any = null;
    viewedQuestionIds: string[] = [];
    questionTextMap: { [id: string]: string } = {};

    // UI state
    currentQuestionIndex = 0;
    currentQuestionGroup = 0; // 0 = personal data, 1 = personality
    currentEditQuestionIndex = 0;
    currentLang: 'he' | 'en' | 'ru' | 'fr' = 'he';
    registrationKeyManualMode = false;
    personalDataKeyManualMode = false;

    // Phone support
    phonePrefixes = ['050', '051', '052', '053', '054', '055', '058'];

    constructor(
        public auth: AuthService,
        private cdr: ChangeDetectorRef
    ) { }

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
            case 'onboarding':
                await this.loadOnboardingQuestions();
                this.prepareOnboardingAnswers();
                break;
            case 'edit-answers':
                await this.loadEditPersonalityQuestions();
                this.prepareEditPersonalityAnswers();
                break;
            case 'view-answers':
                if (this.userId) {
                    await this.loadUserAnswers(this.userId);
                }
                break;
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
            maxSelections: undefined
        };
    }

    // === FIREBASE OPERATIONS (from service) ===
    async getRegistrationQuestions(): Promise<Question[]> {
        if (!this.auth.db) return [];
        try {
            const { collection, getDocs } = await import('firebase/firestore');
            const snapshot = await getDocs(collection(this.auth.db, 'newUsersQuestions'));
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

    async getPersonalDataQuestions(): Promise<Question[]> {
        if (!this.auth.db) return [];
        try {
            const { collection, getDocs } = await import('firebase/firestore');
            const snapshot = await getDocs(collection(this.auth.db, 'userPersonalDataQuestions'));
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

    async addQuestionToFirebase(collectionName: string, questionData: any): Promise<void> {
        if (!this.auth.db) return;
        try {
            const { collection, addDoc } = await import('firebase/firestore');
            await addDoc(collection(this.auth.db, collectionName), questionData);
        } catch (err) {
            console.error('Error adding question:', err);
            throw err;
        }
    }

    async deleteQuestionFromFirebase(collectionName: string, id: string): Promise<void> {
        if (!this.auth.db) return;
        try {
            const { doc, deleteDoc } = await import('firebase/firestore');
            await deleteDoc(doc(this.auth.db, collectionName, id));
        } catch (err) {
            console.error('Error deleting question:', err);
            throw err;
        }
    }

    async updateQuestionInFirebase(collectionName: string, id: string, questionData: any): Promise<void> {
        if (!this.auth.db) return;
        try {
            const { doc, updateDoc } = await import('firebase/firestore');
            await updateDoc(doc(this.auth.db, collectionName, id), questionData);
        } catch (err) {
            console.error('Error updating question:', err);
            throw err;
        }
    }

    async getUserAnswers(uid: string): Promise<any> {
        if (!this.auth.db) return {};
        try {
            const { doc, getDoc } = await import('firebase/firestore');
            const ref = doc(this.auth.db, 'profiles', uid);
            const snap = await getDoc(ref);
            return snap.exists() ? (snap.data() as any).questions || {} : {};
        } catch (err) {
            console.error('Error fetching user answers:', err);
            throw err;
        }
    }

    async mapQuestionsToText(): Promise<{ [id: string]: string }> {
        const textMap: { [id: string]: string } = {};

        const [regQs, pdQs] = await Promise.all([
            this.getRegistrationQuestions(),
            this.getPersonalDataQuestions()
        ]);

        const mapQ = (q: Question) => {
            if (q.id) textMap[q.id] = q.text;
            if (q.key) textMap[q.key] = q.text;
        };

        regQs.forEach(mapQ);
        pdQs.forEach(mapQ);

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
                alert(`ניתן לבחור עד ${maxSelections} אפשרויות בלבד.`);
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
            createdAt: q.createdAt || new Date().toISOString()
        };

        if (q.type === 'checklist' || q.type === 'radio') {
            questionData.options = q.options || [];
        }

        if (q.type === 'scale' || q.type === 'range') {
            questionData.min = q.min;
            questionData.max = q.max;
        }

        if (q.type === 'checklist') {
            questionData.maxSelections = q.maxSelections;
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

    async loadOnboardingQuestions() {
        this.onboardingPersonalDataQuestions = await this.getPersonalDataQuestions();
        this.onboardingQuestions = await this.getRegistrationQuestions();
        this.cdr.detectChanges();
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
            alert('שגיאה בטעינת תשובות המשתמש');
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
            alert('שגיאה בהוספת השאלה. נסה שוב.');
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
            alert('שגיאה בהוספת השאלה. נסה שוב.');
        }
    }

    async deleteQuestion(id: string) {
        if (!confirm('האם אתה בטוח שברצונך למחוק שאלה זו?')) return;
        try {
            await this.deleteQuestionFromFirebase('newUsersQuestions', id);
            await this.loadQuestions();
        } catch (err) {
            console.error('Error deleting question:', err);
        }
    }

    async deletePersonalDataQuestion(id: string) {
        if (!confirm('האם אתה בטוח שברצונך למחוק שאלה זו?')) return;
        try {
            await this.deleteQuestionFromFirebase('userPersonalDataQuestions', id);
            await this.loadPersonalDataQuestions();
        } catch (err) {
            console.error('Error deleting personal data question:', err);
        }
    }

    // === REORDER QUESTION METHODS ===
    async moveQuestionUp(index: number, isPersonalData: boolean) {
        const list = isPersonalData ? this.personalDataQuestions : this.questions;
        if (index === 0) return; // Already at top

        // Swap with previous
        const temp = list[index];
        list[index] = list[index - 1];
        list[index - 1] = temp;

        // Update order values
        await this.updateQuestionOrders(list, isPersonalData);
    }

    async moveQuestionDown(index: number, isPersonalData: boolean) {
        const list = isPersonalData ? this.personalDataQuestions : this.questions;
        if (index === list.length - 1) return; // Already at bottom

        // Swap with next
        const temp = list[index];
        list[index] = list[index + 1];
        list[index + 1] = temp;

        // Update order values
        await this.updateQuestionOrders(list, isPersonalData);
    }

    private async updateQuestionOrders(list: Question[], isPersonalData: boolean) {
        const collectionName = isPersonalData ? 'userPersonalDataQuestions' : 'newUsersQuestions';

        try {
            // Update order for each question
            for (let i = 0; i < list.length; i++) {
                const q = list[i];
                if (q.id) {
                    await this.updateQuestionInFirebase(collectionName, q.id, { order: i });
                    q.order = i; // Update local copy
                }
            }
            this.cdr.detectChanges();
        } catch (err) {
            console.error('Error updating question orders:', err);
            alert('שגיאה בעדכון סדר השאלות');
        }
    }

    // === EDIT QUESTION METHODS ===
    openEditQuestion(q: Question, isPersonalData: boolean) {
        this.isEditPersonalData = isPersonalData;
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
        try {
            const collectionName = this.isEditPersonalData ? 'userPersonalDataQuestions' : 'newUsersQuestions';
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

            if (this.isEditPersonalData) {
                await this.loadPersonalDataQuestions();
            } else {
                await this.loadQuestions();
            }
        } catch (err) {
            console.error('Error updating question:', err);
            alert('שגיאה בעדכון השאלה.');
        }
    }

    // === OPTION MANAGEMENT ===
    addOption() {
        if (this.newOption.trim()) {
            if (!this.newQuestion.options) this.newQuestion.options = [];
            this.newQuestion.options.push(this.newOption.trim());
            this.newOption = '';
        }
    }

    removeOption(index: number) {
        if (this.newQuestion.options) {
            this.newQuestion.options.splice(index, 1);
        }
    }

    addPersonalDataOption() {
        if (this.newPersonalDataOption.trim()) {
            if (!this.newPersonalDataQuestion.options) this.newPersonalDataQuestion.options = [];
            this.newPersonalDataQuestion.options.push(this.newPersonalDataOption.trim());
            this.newPersonalDataOption = '';
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

        const allQuestions = [...this.onboardingQuestions, ...this.onboardingPersonalDataQuestions];
        const existingAnswers = this.profile?.questions;
        this.onboardingAnswers = this.prepareAnswersMap(allQuestions, existingAnswers);
    }

    async submitOnboardingAnswers() {
        const currentUser = await firstValueFrom(this.auth.user$);
        const uid = currentUser?.uid || this.profile?.uid;
        if (!uid) return;

        const answers: any = {};
        const allQuestions = [...this.onboardingQuestions, ...this.onboardingPersonalDataQuestions];

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
                answers[key] = ans || '';
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
            alert('שגיאה בשמירת תשובות. יש לנסות שוב מאוחר יותר.');
        }
    }

    get currentQuestionList(): Question[] {
        if (this.currentQuestionGroup === 0) {
            return this.onboardingQuestions; // Group 0 = Registration
        } else {
            return this.onboardingPersonalDataQuestions; // Group 1 = Personal Data
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
        if (this.currentQuestionGroup === 0 && this.onboardingPersonalDataQuestions.length > 0) {
            return `הבא: פרטי משתמש (${this.onboardingPersonalDataQuestions.length} שאלות)`;
        }
        return '';
    }

    get currentOnboardingProgress(): string {
        const currentList = this.currentQuestionList;
        if (currentList.length === 0) return '';
        return `${this.currentQuestionIndex + 1} / ${currentList.length}`;
    }

    get totalQuestionsCount(): string {
        const total = this.onboardingQuestions.length + this.onboardingPersonalDataQuestions.length;
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
                updatedAnswers[key] = ans || '';
            }
        }

        try {
            await this.auth.saveProfile(uid, { questions: updatedAnswers });
            this.completed.emit();
        } catch (err) {
            console.error('Error saving edited answers:', err);
            alert('שגיאה בשמירת תשובות. יש לנסות שוב מאוחר יותר.');
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

    onQuestionTextChange(isPersonalData: boolean) {
        const q = isPersonalData ? this.newPersonalDataQuestion : this.newQuestion;
        const isManual = isPersonalData ? this.personalDataKeyManualMode : this.registrationKeyManualMode;

        if (!isManual) {
            q.key = this.generateKey(q.text, q.textEn);
        }
    }

    toggleKeyManualMode(isPersonalData: boolean) {
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
}
