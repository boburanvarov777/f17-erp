import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; type: 'success' | 'error' | 'info'; title: string; body?: string; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  private push(type: Toast['type'], title: string, body?: string, ttl = 4200): void {
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { id, type, title, body }]);
    setTimeout(() => this.dismiss(id), ttl);
  }

  success(title: string, body?: string) { this.push('success', title, body); }
  error(title: string, body?: string) { this.push('error', title, body, 6500); }
  info(title: string, body?: string) { this.push('info', title, body); }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
