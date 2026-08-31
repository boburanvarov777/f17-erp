import { HttpClient, HttpEvent, HttpEventType, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type Params = Record<string, string | number | boolean | undefined | null>;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  readonly base = environment.apiUrl;

  private toParams(params?: Params): HttpParams {
    let p = new HttpParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
      }
    }
    return p;
  }

  get<T>(path: string, params?: Params, opts?: { noCache?: boolean }): Observable<T> {
    let p = this.toParams(params);
    if (opts?.noCache) p = p.set('_', Date.now().toString());
    return this.http.get<T>(`${this.base}${path}`, {
      params: p,
      ...(opts?.noCache ? { headers: new HttpHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' }) } : {}),
    });
  }

  post<T>(path: string, body?: unknown, opts?: { silent?: boolean }): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body ?? {}, this.requestOpts(opts));
  }

  patch<T>(path: string, body?: unknown, opts?: { silent?: boolean }): Observable<T> {
    return this.http.patch<T>(`${this.base}${path}`, body ?? {}, this.requestOpts(opts));
  }

  private requestOpts(opts?: { silent?: boolean }) {
    return opts?.silent ? { headers: new HttpHeaders({ 'X-Silent': '1' }) } : {};
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.base}${path}`);
  }

  download(path: string, params?: Params): Observable<Blob> {
    return this.http.get(`${this.base}${path}`, { params: this.toParams(params), responseType: 'blob' });
  }

  upload<T>(path: string, file: File, field = 'file'): Observable<T> {
    const body = new FormData();
    body.append(field, file, file.name);
    body.append('displayName', file.name);
    return this.http.post<T>(`${this.base}${path}`, body);
  }

  /** Multipart upload with byte progress (0–100). */
  uploadWithProgress<T>(path: string, file: File, field = 'file'): Observable<{ progress: number; result?: T }> {
    const body = new FormData();
    body.append(field, file, file.name);
    body.append('displayName', file.name);
    return this.http.post<T>(`${this.base}${path}`, body, { reportProgress: true, observe: 'events' }).pipe(
      map((ev: HttpEvent<T>) => {
        if (ev.type === HttpEventType.UploadProgress) {
          const total = ev.total ?? file.size;
          const progress = total ? Math.min(99, Math.max(1, Math.round((ev.loaded / total) * 100))) : 1;
          return { progress };
        }
        if (ev.type === HttpEventType.Response) return { progress: 100, result: ev.body ?? undefined };
        return { progress: 0 };
      }),
      filter((x) => x.progress > 0),
    );
  }
}
