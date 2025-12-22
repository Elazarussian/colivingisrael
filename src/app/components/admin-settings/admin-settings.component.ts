import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';
import { GeoManagerComponent } from '../geo-manager/geo-manager.component';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, QuestionsManagerComponent, GeoManagerComponent],
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
}
