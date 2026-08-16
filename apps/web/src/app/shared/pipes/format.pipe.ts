import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'num', standalone: true })
export class NumPipe implements PipeTransform {
  transform(v: number | string | null | undefined, digits = 0): string {
    if (v === null || v === undefined || v === '') return '—';
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
}

@Pipe({ name: 'shortDate', standalone: true })
export class ShortDatePipe implements PipeTransform {
  transform(v: string | Date | null | undefined, withTime = false): string {
    if (!v) return '—';
    const d = new Date(v);
    if (Number.isNaN(+d)) return '—';
    const date = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return withTime ? `${date} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : date;
  }
}

@Pipe({ name: 'ago', standalone: true })
export class AgoPipe implements PipeTransform {
  transform(v: string | Date | null | undefined): string {
    if (!v) return '—';
    const diff = Date.now() - +new Date(v);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'hozir';
    if (min < 60) return `${min} daq`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} soat`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} kun`;
    return new Date(v).toLocaleDateString('ru-RU');
  }
}

@Pipe({ name: 'initials', standalone: true })
export class InitialsPipe implements PipeTransform {
  transform(first?: string | null, last?: string | null): string {
    const a = (last ?? '').trim()[0] ?? '';
    const b = (first ?? '').trim()[0] ?? '';
    return (a + b).toUpperCase() || '—';
  }
}
