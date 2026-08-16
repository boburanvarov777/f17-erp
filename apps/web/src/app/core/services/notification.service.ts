import { Injectable, inject, signal } from '@angular/core';
import type { NotificationItem } from '../models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = inject(ApiService);

  readonly items = signal<NotificationItem[]>([]);
  readonly unread = signal(0);

  load(): void {
    this.api.get<NotificationItem[]>('/notifications').subscribe({
      next: (items) => {
        this.items.set(items);
        this.unread.set(items.filter((i) => !i.isRead).length);
      },
      error: () => void 0,
    });
  }

  markRead(id: string): void {
    this.api.post(`/notifications/${id}/read`).subscribe({ next: () => this.load(), error: () => void 0 });
  }

  markAllRead(): void {
    this.api.post('/notifications/read-all').subscribe({ next: () => this.load(), error: () => void 0 });
  }
}
