import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GroupService } from '../../services/group.service';
import { MessageService } from '../../services/message.service';

@Component({
    selector: 'app-group-properties-manager',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="properties-manager">
      <h3>ניהול מאפייני קבוצה</h3>
      <p class="subtitle">הגדר את המאפיינים שמשתמשים יכולים לבחור בעת יצירת קבוצה</p>

      <div class="add-property">
        <input 
          type="text" 
          [(ngModel)]="newProperty" 
          (keyup.enter)="addProperty()" 
          placeholder="שם מאפיין חדש (למשל: שומרי שבת, טבעונים...)"
          class="property-input"
        >
        <button (click)="addProperty()" class="btn-approve">הוסף מאפיין</button>
      </div>

      <div class="properties-list">
        <div *ngIf="loading" class="loading">טוען...</div>
        <div *ngIf="!loading && properties.length === 0" class="empty">אין מאפיינים מוגדרים</div>
        
        <div *ngFor="let prop of properties" class="property-item">
          <span>{{ prop }}</span>
          <button (click)="removeProperty(prop)" class="btn-close-small">✕</button>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .properties-manager {
      padding: 20px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: white;
    }

    h3 {
      margin-bottom: 5px;
      color: var(--accent-color, #00d2ff);
    }

    .subtitle {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 20px;
    }

    .add-property {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }

    .property-input {
      flex: 1;
      padding: 10px 15px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(0, 0, 0, 0.3);
      color: white;
      outline: none;
    }

    .properties-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .property-item {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.1);
      padding: 5px 12px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .btn-close-small {
      background: none;
      border: none;
      color: #ff4d4d;
      cursor: pointer;
      font-weight: bold;
      font-size: 1.1rem;
      padding: 0;
      line-height: 1;
    }

    .btn-close-small:hover {
      color: #ff3333;
    }

    .empty, .loading {
      color: rgba(255, 255, 255, 0.4);
      font-style: italic;
    }
  `]
})
export class GroupPropertiesManagerComponent implements OnInit {
    properties: string[] = [];
    newProperty: string = '';
    loading: boolean = false;

    constructor(
        private groupService: GroupService,
        private messageService: MessageService
    ) { }

    async ngOnInit() {
        this.loadProperties();
    }

    async loadProperties() {
        this.loading = true;
        try {
            this.properties = await this.groupService.getGroupProperties();
        } catch (err) {
            console.error('Error loading properties:', err);
        } finally {
            this.loading = false;
        }
    }

    async addProperty() {
        const trimmed = this.newProperty.trim();
        if (!trimmed) return;

        if (this.properties.includes(trimmed)) {
            this.messageService.show('מאפיין זה כבר קיים');
            return;
        }

        try {
            await this.groupService.addGroupProperty(trimmed);
            this.properties.push(trimmed);
            this.newProperty = '';
            this.messageService.show('מאפיין נוסף בהצלחה');
        } catch (err) {
            console.error('Error adding property:', err);
            this.messageService.show('שגיאה בהוספת מאפיין');
        }
    }

    async removeProperty(prop: string) {
        if (!confirm(`האם אתה בטוח שברצונך להסיר את המאפיין "${prop}"?`)) return;

        try {
            await this.groupService.removeGroupProperty(prop);
            this.properties = this.properties.filter(p => p !== prop);
            this.messageService.show('מאפיין הוסר');
        } catch (err) {
            console.error('Error removing property:', err);
            this.messageService.show('שגיאה בהסרת מאפיין');
        }
    }
}
