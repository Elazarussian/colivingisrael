import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MessageService {
    private _message$ = new BehaviorSubject<string | null>(null);
    public message$: Observable<string | null> = this._message$.asObservable();

    show(message: string) {
        this._message$.next(message);
    }

    hide() {
        this._message$.next(null);
    }
}
