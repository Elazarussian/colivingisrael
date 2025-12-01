import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-new-questions',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="admin-page">
      <div class="container">
        <h1>שאלות הרשמה חדשות</h1>
  <div *ngIf="questions.length === 0">אין שאלות חדשות.</div>
        <ul>
          <li *ngFor="let q of questions">
            <strong>{{q.email}}</strong> - {{q.question}}
            <pre>{{q | json}}</pre>
          </li>
        </ul>
      </div>
    </section>
  `
})
export class NewQuestionsComponent implements OnInit {
  questions: any[] = [];

  constructor(private auth: AuthService) {}

  async ngOnInit() {
    if (!this.auth.db) return;
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const col = collection(this.auth.db, 'newUserQuestions');
      const snap = await getDocs(col);
      this.questions = snap.docs.map(d => d.data());
    } catch (e) {
      console.error('Error loading newUserQuestions', e);
    }
  }
}
