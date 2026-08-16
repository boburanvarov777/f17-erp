import { Injectable, NgZone, inject, signal } from '@angular/core';
import { io, type Socket } from 'socket.io-client';
import { AuthService } from './auth.service';

export interface ProductionEvent {
  orderId: string; orderNumber: string; stage: string;
  doneQty: number; planQty: number; progress: number;
  status: string; by: string; source: string; at: string;
}

/** Thin WebSocket layer: dashboards and stage boards update without a refresh. */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private auth = inject(AuthService);
  private zone = inject(NgZone);
  private socket?: Socket;

  readonly connected = signal(false);
  readonly lastProduction = signal<ProductionEvent | null>(null);
  readonly tick = signal(0);

  connect(): void {
    if (this.socket?.connected) return;
    const token = this.auth.accessToken;
    if (!token) return;

    this.socket = io(`${location.origin}/realtime`, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnectionDelay: 1500,
    });

    this.socket.on('connect', () => this.zone.run(() => this.connected.set(true)));
    this.socket.on('disconnect', () => this.zone.run(() => this.connected.set(false)));
    this.socket.on('production:updated', (p: ProductionEvent) =>
      this.zone.run(() => {
        this.lastProduction.set(p);
        this.tick.update((n) => n + 1);
      }),
    );
    for (const ev of ['order:created', 'order:updated', 'defect:added', 'shipment:updated', 'dashboard:refresh', 'notification']) {
      this.socket.on(ev, () => this.zone.run(() => this.tick.update((n) => n + 1)));
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = undefined;
    this.connected.set(false);
  }
}
