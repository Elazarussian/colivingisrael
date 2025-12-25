import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';
import { GeoManagerComponent } from '../geo-manager/geo-manager.component';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, QuestionsManagerComponent, GeoManagerComponent],
  templateUrl: './admin-settings.component.html',
  styleUrls: ['./admin-settings.component.css']
})
export class AdminSettingsComponent {
  profile: any = null;
  allUsers: any[] = [];
  allUsersError: string | null = null;
  showUsersTable = false;

  showQuestionsManager = false;
  questionsMode: 'admin-registration' | 'admin-personal-data' | 'admin-maskir' | 'admin-apartment' | 'view-answers' = 'admin-registration';
  selectedUserId?: string;

  showGeoManager = false;

  showGenerateModal = false;
  testUserAmount = 5;
  isGenerating = false;
  generationProgress = 0;
  generationError: string | null = null;

  constructor(public auth: AuthService, private cdr: ChangeDetectorRef) {
    this.auth.profile$.subscribe(p => { this.profile = p; if (p && this.auth.isAdmin(p)) { this.loadAllUsers(); } });
  }

  isAdmin() { return this.auth.isAdmin(this.profile); }

  toggleUsersTable() { this.showUsersTable = !this.showUsersTable; if (this.showUsersTable && this.allUsers.length === 0) { this.loadAllUsers(); } }

  openRegistrationQuestions() { this.questionsMode = 'admin-registration'; this.showQuestionsManager = true; }
  openPersonalDataQuestions() { this.questionsMode = 'admin-personal-data'; this.showQuestionsManager = true; }
  openMaskirQuestions() { this.questionsMode = 'admin-maskir'; this.showQuestionsManager = true; }
  openApartmentQuestions() { this.questionsMode = 'admin-apartment'; this.showQuestionsManager = true; }
  openUserAnswers(u: any) { this.selectedUserId = u.uid || u.id; this.questionsMode = 'view-answers'; this.showQuestionsManager = true; }
  onQuestionsClosed() { this.showQuestionsManager = false; }
  onQuestionsCompleted() { this.showQuestionsManager = false; this.cdr.detectChanges(); }

  openGeoManager() { this.showGeoManager = true; }
  closeGeoManager() { this.showGeoManager = false; }

  async loadAllUsers() {
    if (!this.auth.db) { this.allUsersError = 'Database not initialized'; return; }
    try {
      this.allUsersError = null;
      const { collection, getDocs } = await import('firebase/firestore');
      const profilesCol = collection(this.auth.db, `${this.auth.dbPath}profiles`);
      const snapshot = await getDocs(profilesCol);
      this.allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      this.cdr.detectChanges();
    } catch (err: any) {
      console.error('Error loading users (admin-settings):', err);
      this.allUsersError = `שגיאה בטעינת משתמשים: ${err.message || 'Unknown error'}`;
    }
  }

  openGenerateModal() {
    this.showGenerateModal = true;
    this.generationError = null;
    this.generationProgress = 0;
  }

  closeGenerateModal() {
    if (this.isGenerating) return;
    this.showGenerateModal = false;
  }

  async generateTestUsers() {
    if (this.isGenerating || !this.auth.db) return;
    this.isGenerating = true;
    this.generationError = null;
    this.generationProgress = 0;

    try {
      const { collection, getDocs, doc, setDoc } = await import('firebase/firestore');

      // Load all relevant questions to generate valid answers
      const regQs = await this.loadQuestionsList('newUsersQuestions');
      const personalQs = await this.loadQuestionsList('userPersonalDataQuestions');
      const maskirQs = await this.loadQuestionsList('maskirQuestions');

      for (let i = 0; i < this.testUserAmount; i++) {
        const userId = 'test_gen_' + Math.random().toString(36).substring(2, 9);
        const firstName = this.getRandomFirstName();
        const lastName = this.getRandomLastName();
        const email = `test_${userId}@generated.com`;

        const answers: any = {};
        [...regQs, ...personalQs, ...maskirQs].forEach(q => {
          const qId = q.id || q.key || '';
          if (!qId) return;
          answers[qId] = this.generateRandomAnswer(q);
        });

        const profileData = {
          uid: userId,
          email: email,
          displayName: `${firstName} ${lastName}`,
          role: Math.random() > 0.8 ? 'maskir' : 'user',
          createdAt: new Date().toISOString(),
          isGenerated: true,
          questions: answers
        };

        // Always save to test database profiles
        const profileRef = doc(this.auth.db, `testdata/db/profiles`, userId);
        await setDoc(profileRef, profileData);

        this.generationProgress = Math.round(((i + 1) / this.testUserAmount) * 100);
        this.cdr.detectChanges();
      }

      this.showGenerateModal = false;
      this.isGenerating = false;
      // If we are currently viewing test data, reload the users table
      if (this.auth.isTestMode) {
        this.loadAllUsers();
      }
    } catch (err: any) {
      console.error('Error generating users:', err);
      this.generationError = `שגיאה ביצירת משתמשים: ${err.message || 'Unknown error'}`;
      this.isGenerating = false;
    }
  }

  private async loadQuestionsList(collectionName: string): Promise<any[]> {
    const { collection, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(this.auth.db!, `${this.auth.dbPath}${collectionName}`));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  private generateRandomAnswer(q: any): any {
    switch (q.type) {
      case 'text':
      case 'textarea':
        return 'בדיקה - ' + this.getRandomHebrewWord();
      case 'checklist':
        if (!q.options || q.options.length === 0) return [];
        const count = Math.floor(Math.random() * (q.maxSelections || q.options.length)) + 1;
        const shuffled = [...q.options].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
      case 'radio':
        if (!q.options || q.options.length === 0) return null;
        return q.options[Math.floor(Math.random() * q.options.length)];
      case 'yesno':
        return Math.random() > 0.5;
      case 'scale':
        const min = q.min ?? 1;
        const max = q.max ?? 5;
        return Math.floor(Math.random() * (max - min + 1)) + min;
      case 'range':
        const rMin = q.min ?? 0;
        const rMax = q.max ?? 100;
        const v1 = Math.floor(Math.random() * (rMax - rMin + 1)) + rMin;
        const v2 = Math.floor(Math.random() * (rMax - rMin + 1)) + rMin;
        return { min: Math.min(v1, v2), max: Math.max(v1, v2) };
      case 'phone':
        return '05' + Math.floor(Math.random() * 10) + Math.floor(1000000 + Math.random() * 9000000);
      case 'date':
        const d = new Date();
        d.setFullYear(d.getFullYear() - Math.floor(Math.random() * 50));
        return d.toISOString().split('T')[0];
      case 'city_neighborhood':
        return { cityId: 'test_city', cityName: 'עיר בדיקה', neighborhood: 'שכונת בדיקה', neighborhoodName: 'שכונת בדיקה' };
      default:
        return '';
    }
  }

  private getRandomFirstName() {
    const names = ['ישראל', 'אבי', 'משה', 'דוד', 'שרה', 'רבקה', 'מיכל', 'נועה', 'עידו', 'עומר'];
    return names[Math.floor(Math.random() * names.length)];
  }

  private getRandomLastName() {
    const names = ['ישראלי', 'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'אזולאי'];
    return names[Math.floor(Math.random() * names.length)];
  }

  private getRandomHebrewWord() {
    const words = ['שלום', 'בדיקה', 'טקסט', 'מידע', 'משתמש', 'דוגמה', 'תוצאה', 'ערך'];
    return words[Math.floor(Math.random() * words.length)];
  }
}
