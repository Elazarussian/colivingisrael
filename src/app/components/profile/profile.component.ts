import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router, ActivatedRoute } from '@angular/router';
import { QuestionsManagerComponent } from '../questions-manager/questions-manager.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, QuestionsManagerComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  styles: [
    `
    .profile-page { padding: 6rem 1rem 2rem; min-height: 70vh; }
    h1 { margin-top: 0; }
  `]
})
export class ProfileComponent implements OnInit {
  user$ = this.auth.user$;
  profile: any = null;
  showLogoutConfirm = false;

  allUsers: any[] = [];
  allUsersError: string | null = null;
  showUsersTable = false;

  showQuestionsManager = false;
  questionsMode: 'admin-registration' | 'admin-personal-data' | 'admin-maskir' | 'admin-apartment' | 'onboarding' | 'edit-answers' | 'view-answers' = 'onboarding';
  selectedUserId?: string;

  onboardingPrompted = false;

  // Geo manager state
  showGeoManager = false;
  cities: Array<{ id: string; name: string; neighborhoods?: string[]; _editing?: boolean; _editName?: string; _expanded?: boolean; _neighborhoodEditing?: boolean[]; _neighborhoodEditValues?: string[] }> = [];
  selectedCityId?: string | null = null;
  selectedCityNeighborhoods: string[] = [];
  newCityName = '';
  newNeighborhoodName = '';
  selectedCityForView?: string | null = null;
  // city editing helpers
  // Each city object may receive temporary fields: _editing, _editName

  // neighborhood editing state for the selected city
  _neighborhoodEditing: boolean[] = [];
  _neighborhoodEditValues: string[] = [];

  constructor(
    public auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    this.auth.profile$.subscribe(async (p) => {
      this.profile = p;
      if (!p || this.onboardingPrompted) return;

      try {
        const showOnboardingRequested = this.route.snapshot.queryParams['showOnboarding'] === '1';
        const onboardingCompleted = p['onboardingCompleted'] === true;
        const isNewProfile = !onboardingCompleted && this.isRecentlyCreated(p, 15);

        if (!onboardingCompleted && (showOnboardingRequested || isNewProfile)) {
          // IMPORTANT: do not show onboarding to admins. Use AuthService helper to check role.
          const isAdmin = this.auth && typeof this.auth.isAdmin === 'function' ? this.auth.isAdmin(p) : (p?.role === 'admin');
          if (!isAdmin) {
            this.openOnboarding();
          } else {
            // Skip onboarding for admin users (they may have been recently created or the query param was present)
            console.debug('ProfileComponent: skipping onboarding for admin user', p?.uid || p);
          }
        }
      } catch (err) {
        console.error('Error during onboarding trigger:', err);
      } finally {
        this.onboardingPrompted = true;
      }
    });
  }

  ngOnInit() {
    this.auth.profile$.subscribe(p => {
      if (p && this.isAdmin()) {
        this.loadAllUsers();
      }
    });
  }

  isRecentlyCreated(profile: any, withinMinutes: number): boolean {
    if (!profile || !profile.createdAt) return false;
    const createdDate = new Date(profile.createdAt);
    const now = new Date();
    const diffMs = now.getTime() - createdDate.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    return diffMinutes <= withinMinutes;
  }

  isAdmin(): boolean { return this.auth.isAdmin(this.profile); }
  getUserRole(): string { return this.auth.getUserRole(this.profile); }
  fieldOrDefault(key: string, userVal: any, defaultVal: string): string { if (this.profile && this.profile[key]) return this.profile[key]; if (userVal) return userVal; return defaultVal; }

  openOnboarding() { this.questionsMode = 'onboarding'; this.showQuestionsManager = true; }
  openRegistrationQuestions() { this.questionsMode = 'admin-registration'; this.showQuestionsManager = true; }
  openPersonalDataQuestions() { this.questionsMode = 'admin-personal-data'; this.showQuestionsManager = true; }
  openMaskirQuestions() { this.questionsMode = 'admin-maskir'; this.showQuestionsManager = true; }
  openApartmentQuestions() { this.questionsMode = 'admin-apartment'; this.showQuestionsManager = true; }
  openEditAnswers() { this.questionsMode = 'edit-answers'; this.showQuestionsManager = true; }
  openUserAnswers(user: any) { this.selectedUserId = user.uid || user.id; this.questionsMode = 'view-answers'; this.showQuestionsManager = true; }
  onQuestionsCompleted() { this.showQuestionsManager = false; this.cdr.detectChanges(); }
  onQuestionsClosed() { this.showQuestionsManager = false; }

  toggleUsersTable() { this.showUsersTable = !this.showUsersTable; if (this.showUsersTable && this.allUsers.length === 0) { this.loadAllUsers(); } }

  // Geo manager methods
  openGeoManager() { this.showGeoManager = true; this.loadCities(); }
  closeGeoManager() { this.showGeoManager = false; }

  async loadCities() {
    if (!this.auth.db) return;
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const colRef = collection(this.auth.db, `${this.auth.dbPath}israel_locations`);
      const snap = await getDocs(colRef);
      this.cities = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      // ensure optional editor arrays exist for template safety
      this.cities.forEach(c => {
        if (!c._neighborhoodEditing) c._neighborhoodEditing = (c.neighborhoods || []).map(() => false);
        if (!c._neighborhoodEditValues) c._neighborhoodEditValues = (c.neighborhoods || []).map((n: string) => n);
      });
      // if a city is selected, refresh its neighborhoods
      if (this.selectedCityId) this.updateSelectedCityNeighborhoods();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error loading cities:', err);
    }
  }

  // helpers used by template to avoid undefined array access
  isNeighborhoodEditing(city: any, index: number): boolean {
    return !!(city && city._neighborhoodEditing && city._neighborhoodEditing[index]);
  }

  isSelectedNeighborhoodEditing(index: number): boolean {
    return !!(this._neighborhoodEditing && this._neighborhoodEditing[index]);
  }

  getCityNeighborhoodEditValue(city: any, index: number): string {
    if (!city) return '';
    if (!city._neighborhoodEditValues) city._neighborhoodEditValues = (city.neighborhoods || []).map((n: string) => n);
    return city._neighborhoodEditValues[index] || '';
  }

  setCityNeighborhoodEditValue(city: any, index: number, value: string) {
    if (!city) return;
    if (!city._neighborhoodEditValues) city._neighborhoodEditValues = (city.neighborhoods || []).map((n: string) => n);
    city._neighborhoodEditValues[index] = value;
  }

  async addCity() {
    const name = (this.newCityName || '').trim();
    if (!name || !this.auth.db) return;
    try {
      const { collection, addDoc } = await import('firebase/firestore');
      const colRef = collection(this.auth.db, `${this.auth.dbPath}israel_locations`);
      const docRef = await addDoc(colRef, { name, neighborhoods: [] });
      this.cities.push({ id: docRef.id, name, neighborhoods: [] });
      this.newCityName = '';
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error adding city:', err);
    }
  }

  async addNeighborhood() {
    const name = (this.newNeighborhoodName || '').trim();
    if (!name || !this.selectedCityId || !this.auth.db) return;
    try {
      const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');
      const docRef = doc(this.auth.db, `${this.auth.dbPath}israel_locations`, this.selectedCityId);
      await updateDoc(docRef, { neighborhoods: arrayUnion(name) });
      // update local copy
      const city = this.cities.find(c => c.id === this.selectedCityId);
      if (city) {
        city.neighborhoods = Array.from(new Set([...(city.neighborhoods || []), name]));
      }
      this.newNeighborhoodName = '';
      this.updateSelectedCityNeighborhoods();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error adding neighborhood:', err);
    }
  }

  updateSelectedCityNeighborhoods(cityId?: string | null) {
    // if a cityId is provided (from the view selector), use it; otherwise fall back to selectedCityId
    const idToUse = (typeof cityId !== 'undefined' && cityId !== null) ? cityId : this.selectedCityId;
    this.selectedCityForView = idToUse || null;
    const city = this.cities.find(c => c.id === idToUse);
    this.selectedCityNeighborhoods = city ? (city.neighborhoods || []) : [];
    // reset neighborhood editing state arrays to match selected city's neighborhoods
    this._neighborhoodEditing = this.selectedCityNeighborhoods.map(() => false);
    this._neighborhoodEditValues = this.selectedCityNeighborhoods.map(n => n);
  }

  // CITY edit/delete helpers
  startEditCity(city: any) {
    city._editing = true;
    city._editName = city.name;
  }

  toggleCityExpand(city: any) {
    city._expanded = !city._expanded;
    console.debug('toggleCityExpand:', city.id, city._expanded);
    if (city._expanded) {
      this.initCityNeighborhoodEditors(city);
      // also show this city's neighborhoods on the right panel for editing
      this.selectedCityForView = city.id;
  this.updateSelectedCityNeighborhoods(city.id);
  this.cdr.detectChanges();
    }
  }

  initCityNeighborhoodEditors(city: any) {
    const list = city.neighborhoods || [];
    city._neighborhoodEditing = list.map(() => false);
    city._neighborhoodEditValues = list.map((n: string) => n);
  }

  // per-city neighborhood handlers (inline list)
  startEditNeighborhoodForCity(city: any, index: number) {
    if (!city._neighborhoodEditing) this.initCityNeighborhoodEditors(city);
    city._neighborhoodEditing[index] = true;
  }

  cancelNeighborhoodEditForCity(city: any, index: number) {
    if (!city._neighborhoodEditing) return;
    city._neighborhoodEditing[index] = false;
    city._neighborhoodEditValues[index] = city.neighborhoods[index];
  }

  async saveNeighborhoodEditForCity(city: any, index: number) {
    const newVal = (city._neighborhoodEditValues?.[index] || '').trim();
    if (!newVal) return;
    if (!city.id || !this.auth.db) return;
    try {
      const { doc, updateDoc, arrayRemove, arrayUnion } = await import('firebase/firestore');
      const docRef = doc(this.auth.db, `${this.auth.dbPath}israel_locations`, city.id);
      const oldVal = city.neighborhoods[index];
      await updateDoc(docRef, { neighborhoods: arrayRemove(oldVal) });
      await updateDoc(docRef, { neighborhoods: arrayUnion(newVal) });
      // update local copy
      city.neighborhoods = (city.neighborhoods || []).map((n: string, i: number) => i === index ? newVal : n);
      // sync editors
      this.initCityNeighborhoodEditors(city);
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error saving neighborhood edit for city:', err);
    }
  }

  async deleteNeighborhoodForCity(city: any, index: number) {
    if (!city.id || !this.auth.db) return;
    try {
      const { doc, updateDoc, arrayRemove } = await import('firebase/firestore');
      const docRef = doc(this.auth.db, `${this.auth.dbPath}israel_locations`, city.id);
      const val = city.neighborhoods[index];
      await updateDoc(docRef, { neighborhoods: arrayRemove(val) });
      city.neighborhoods = (city.neighborhoods || []).filter((n: string, i: number) => i !== index);
      this.initCityNeighborhoodEditors(city);
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error deleting neighborhood for city:', err);
    }
  }

  cancelCityEdit(city: any) {
    city._editing = false;
    delete city._editName;
  }

  async saveCityEdit(city: any) {
    if (!city._editName || city._editName.trim() === '') return;
    const newName = city._editName.trim();
    if (!this.auth.db) return;
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const docRef = doc(this.auth.db, `${this.auth.dbPath}israel_locations`, city.id);
      await updateDoc(docRef, { name: newName });
      city.name = newName;
      city._editing = false;
      delete city._editName;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error saving city edit:', err);
    }
  }

  async deleteCity(city: any) {
    if (!this.auth.db) return;
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const docRef = doc(this.auth.db, `${this.auth.dbPath}israel_locations`, city.id);
      await deleteDoc(docRef);
      this.cities = this.cities.filter(c => c.id !== city.id);
      if (this.selectedCityId === city.id) {
        this.selectedCityId = null;
        this.updateSelectedCityNeighborhoods();
      }
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error deleting city:', err);
    }
  }

  // NEIGHBORHOOD edit/delete helpers (by index in selectedCityNeighborhoods)
  startEditNeighborhood(index: number) {
    this._neighborhoodEditing[index] = true;
  }

  cancelNeighborhoodEdit(index: number) {
    this._neighborhoodEditing[index] = false;
    this._neighborhoodEditValues[index] = this.selectedCityNeighborhoods[index];
  }

  async saveNeighborhoodEdit(index: number) {
    const newVal = (this._neighborhoodEditValues[index] || '').trim();
    if (!newVal) return;
    if (!this.selectedCityId || !this.auth.db) return;
    try {
      const { doc, updateDoc, arrayRemove, arrayUnion } = await import('firebase/firestore');
      const docRef = doc(this.auth.db, `${this.auth.dbPath}israel_locations`, this.selectedCityId);
      const oldVal = this.selectedCityNeighborhoods[index];
      // remove old and add new (Firestore doesn't support replace-in-array)
      await updateDoc(docRef, { neighborhoods: arrayRemove(oldVal) });
      await updateDoc(docRef, { neighborhoods: arrayUnion(newVal) });
      // update local copy
      const city = this.cities.find(c => c.id === this.selectedCityId);
      if (city) {
        city.neighborhoods = (city.neighborhoods || []).map((n: string) => n === oldVal ? newVal : n);
      }
      this.updateSelectedCityNeighborhoods();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error saving neighborhood edit:', err);
    }
  }

  async deleteNeighborhood(index: number) {
    if (!this.selectedCityId || !this.auth.db) return;
    try {
      const { doc, updateDoc, arrayRemove } = await import('firebase/firestore');
      const docRef = doc(this.auth.db, `${this.auth.dbPath}israel_locations`, this.selectedCityId);
      const val = this.selectedCityNeighborhoods[index];
      await updateDoc(docRef, { neighborhoods: arrayRemove(val) });
      const city = this.cities.find(c => c.id === this.selectedCityId);
      if (city) {
        city.neighborhoods = (city.neighborhoods || []).filter((n: string) => n !== val);
      }
      this.updateSelectedCityNeighborhoods();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error deleting neighborhood:', err);
    }
  }

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
      console.error('Error loading users:', err);
      this.allUsersError = `שגיאה בטעינת משתמשים: ${err.message || 'Unknown error'}`;
    }
  }

  promptLogout() { this.showLogoutConfirm = true; }
  cancelLogout() { this.showLogoutConfirm = false; }
  async confirmLogout() { await this.auth.logout(); this.showLogoutConfirm = false; this.router.navigate(['/']); }
  goHome() { this.router.navigate(['/']); }
}
