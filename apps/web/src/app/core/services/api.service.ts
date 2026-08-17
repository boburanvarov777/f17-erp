import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
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

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body ?? {});
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http.patch<T>(`${this.base}${path}`, body ?? {});
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.base}${path}`);
  }

  download(path: string, params?: Params): Observable<Blob> {
    return this.http.get(`${this.base}${path}`, { params: this.toParams(params), responseType: 'blob' });
  }

  upload<T>(path: string, file: File, field = 'file'): Observable<T> {
    const body = new FormData();
    body.append(field, file);
    return this.http.post<T>(`${this.base}${path}`, body);
  }
}
