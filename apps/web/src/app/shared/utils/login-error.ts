/** Map login HTTP errors to i18n keys (never show raw server locale). */
export function loginErrorKey(err: { status?: number }, host = typeof window !== 'undefined' ? window.location.hostname : ''): string {
  const local = host === 'localhost' || host === '127.0.0.1';
  const status = err?.status ?? 0;

  if (status === 0 || status === 502 || status === 504) {
    return local ? 'login_error_network_local' : 'login_error_network_prod';
  }
  if (status === 404) return 'login_error_api_not_found';
  // ng serve proxy returns 500 when localhost:3000 API is down
  if (local && status === 500) return 'login_error_network_local';
  if (status === 401 || status === 403) return 'login_error';
  if (status >= 500) return 'login_error_server';
  return 'login_error';
}
