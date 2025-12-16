import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'show-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './show-message.component.html',
  styleUrls: ['./show-message.component.css']
})
export class ShowMessageComponent {
  @Input() message = '';
  @Output() closed = new EventEmitter<'ok' | 'x'>();

  onClose(reason: 'ok' | 'x') {
    this.closed.emit(reason);
  }
}
