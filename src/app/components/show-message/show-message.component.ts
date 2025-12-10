import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'show-message',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="overlay">
      <div class="card">
        <button class="close-x" (click)="onClose('x')">×</button>
        <div class="content">{{ message }}</div>
        <div class="actions">
          <button class="ok" (click)="onClose('ok')">OK</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
    .overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.4);
      z-index: 1000;
    }
    .card {
      background: #fff;
      border-radius: 8px;
      padding: 16px 20px 18px 20px;
      min-width: 260px;
      max-width: 90%;
      box-shadow: 0 6px 20px rgba(0,0,0,0.16);
      position: relative;
      text-align: center;
    }
    .close-x {
      position: absolute;
      top: 6px;
      right: 8px;
      border: none;
      background: transparent;
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
    }
    .content {
      margin: 12px 0 16px 0;
      color: #222;
      font-size: 15px;
    }
    .actions { display:flex; justify-content:center }
    .ok {
      background: #0078d4;
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
    }
    .ok:active { transform: translateY(1px) }
    `
  ]
})
export class ShowMessageComponent {
  @Input() message = '';
  @Output() closed = new EventEmitter<'ok'|'x'>();

  onClose(reason: 'ok'|'x') {
    this.closed.emit(reason);
  }
}
