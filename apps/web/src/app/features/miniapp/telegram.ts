/** Minimal typing for the Telegram WebApp bridge we actually use. */
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; last_name?: string; username?: string } };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  ready(): void;
  expand(): void;
  close(): void;
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
  MainButton: { text: string; show(): void; hide(): void; onClick(cb: () => void): void; setText(t: string): void };
}

export function tg(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp: TelegramWebApp } }).Telegram?.WebApp;
}

export function haptic(type: 'success' | 'error' | 'warning' = 'success'): void {
  tg()?.HapticFeedback?.notificationOccurred(type);
}
