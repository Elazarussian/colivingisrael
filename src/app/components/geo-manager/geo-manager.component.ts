import { Component, EventEmitter, Output, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-geo-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './geo-manager.component.html',
  styleUrls: ['./geo-manager.component.css']
})
export class GeoManagerComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  // Geo manager state (copied from ProfileComponent)
  cities: Array<{ id: string; name: string; neighborhoods?: string[]; _editing?: boolean; _editName?: string; _expanded?: boolean; _neighborhoodEditing?: boolean[]; _neighborhoodEditValues?: string[] }> = [];
  selectedCityId?: string | null = null;
  selectedCityNeighborhoods: string[] = [];
  newCityName = '';
  newNeighborhoodName = '';
  selectedCityForView?: string | null = null;
  _neighborhoodEditing: boolean[] = [];
  _neighborhoodEditValues: string[] = [];

  constructor(public auth: AuthService, private cdr: ChangeDetectorRef) { }

  ngOnInit() {
    this.loadCities();
  }

  closeGeoManager() { this.closed.emit(); }

  async loadCities() {
    if (!this.auth.db) return;
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const colRef = collection(this.auth.db!, `${this.auth.dbPath}israel_locations`);
      const snap = await getDocs(colRef);
      this.cities = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      this.cities.forEach(c => {
        if (!c._neighborhoodEditing) c._neighborhoodEditing = (c.neighborhoods || []).map(() => false);
        if (!c._neighborhoodEditValues) c._neighborhoodEditValues = (c.neighborhoods || []).map((n: string) => n);
      });
      if (this.selectedCityId) this.updateSelectedCityNeighborhoods();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error loading cities:', err);
    }
  }

  isNeighborhoodEditing(city: any, index: number): boolean {
    return !!(city && city._neighborhoodEditing && city._neighborhoodEditing[index]);
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
      const colRef = collection(this.auth.db!, `${this.auth.dbPath}israel_locations`);
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
      const docRef = doc(this.auth.db!, `${this.auth.dbPath}israel_locations`, this.selectedCityId);
      await updateDoc(docRef, { neighborhoods: arrayUnion(name) });
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
    const idToUse = (typeof cityId !== 'undefined' && cityId !== null) ? cityId : this.selectedCityId;
    this.selectedCityForView = idToUse || null;
    const city = this.cities.find(c => c.id === idToUse);
    this.selectedCityNeighborhoods = city ? (city.neighborhoods || []) : [];
    this._neighborhoodEditing = this.selectedCityNeighborhoods.map(() => false);
    this._neighborhoodEditValues = this.selectedCityNeighborhoods.map(n => n);
  }

  startEditCity(city: any) { city._editing = true; city._editName = city.name; }

  toggleCityExpand(city: any) {
    city._expanded = !city._expanded;
    if (city._expanded) {
      this.initCityNeighborhoodEditors(city);
      this.selectedCityForView = city.id;
      this.updateSelectedCityNeighborhoods(city.id);
      this.cdr.detectChanges();
    }
  }

  hasExpandedCity(): boolean {
    return this.cities.some(c => !!c._expanded);
  }

  initCityNeighborhoodEditors(city: any) {
    const list = city.neighborhoods || [];
    city._neighborhoodEditing = list.map(() => false);
    city._neighborhoodEditValues = list.map((n: string) => n);
  }

  startEditNeighborhoodForCity(city: any, index: number) { if (!city._neighborhoodEditing) this.initCityNeighborhoodEditors(city); city._neighborhoodEditing[index] = true; }

  cancelNeighborhoodEditForCity(city: any, index: number) { if (!city._neighborhoodEditing) return; city._neighborhoodEditing[index] = false; city._neighborhoodEditValues[index] = city.neighborhoods[index]; }

  async saveNeighborhoodEditForCity(city: any, index: number) {
    const newVal = (city._neighborhoodEditValues?.[index] || '').trim();
    if (!newVal) return;
    if (!city.id || !this.auth.db) return;
    try {
      const { doc, updateDoc, arrayRemove, arrayUnion } = await import('firebase/firestore');
      const docRef = doc(this.auth.db!, `${this.auth.dbPath}israel_locations`, city.id);
      const oldVal = city.neighborhoods[index];
      await updateDoc(docRef, { neighborhoods: arrayRemove(oldVal) });
      await updateDoc(docRef, { neighborhoods: arrayUnion(newVal) });
      city.neighborhoods = (city.neighborhoods || []).map((n: string, i: number) => i === index ? newVal : n);
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
      const docRef = doc(this.auth.db!, `${this.auth.dbPath}israel_locations`, city.id);
      const val = city.neighborhoods[index];
      await updateDoc(docRef, { neighborhoods: arrayRemove(val) });
      city.neighborhoods = (city.neighborhoods || []).filter((n: string, i: number) => i !== index);
      this.initCityNeighborhoodEditors(city);
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error deleting neighborhood for city:', err);
    }
  }

  cancelCityEdit(city: any) { city._editing = false; delete city._editName; }

  async saveCityEdit(city: any) {
    if (!city._editName || city._editName.trim() === '') return;
    const newName = city._editName.trim();
    if (!this.auth.db) return;
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const docRef = doc(this.auth.db!, `${this.auth.dbPath}israel_locations`, city.id);
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
      const docRef = doc(this.auth.db!, `${this.auth.dbPath}israel_locations`, city.id);
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

  startEditNeighborhood(index: number) { this._neighborhoodEditing[index] = true; }

  cancelNeighborhoodEdit(index: number) { this._neighborhoodEditing[index] = false; this._neighborhoodEditValues[index] = this.selectedCityNeighborhoods[index]; }

  async saveNeighborhoodEdit(index: number) {
    const newVal = (this._neighborhoodEditValues[index] || '').trim();
    if (!newVal) return;
    if (!this.selectedCityId || !this.auth.db) return;
    try {
      const { doc, updateDoc, arrayRemove, arrayUnion } = await import('firebase/firestore');
      const docRef = doc(this.auth.db!, `${this.auth.dbPath}israel_locations`, this.selectedCityId);
      const oldVal = this.selectedCityNeighborhoods[index];
      await updateDoc(docRef, { neighborhoods: arrayRemove(oldVal) });
      await updateDoc(docRef, { neighborhoods: arrayUnion(newVal) });
      const city = this.cities.find(c => c.id === this.selectedCityId);
      if (city) {
        city.neighborhoods = (city.neighborhoods || []).map((n: string) => n === oldVal ? newVal : n);
      }
      this.updateSelectedCityNeighborhoods();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error saving neighborhood:', err);
    }
  }

  async deleteNeighborhood(index: number) {
    if (!this.selectedCityId || !this.auth.db) return;
    try {
      const { doc, updateDoc, arrayRemove } = await import('firebase/firestore');
      const docRef = doc(this.auth.db!, `${this.auth.dbPath}israel_locations`, this.selectedCityId);
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
}
