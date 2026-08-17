#!/usr/bin/env node
/** Smoke-test authenticated API routes (local or production). */
const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const LOGIN = process.env.API_LOGIN || 'admin';
const PASS = process.env.API_PASSWORD || 'Admin!2026';
const DEPT = process.env.API_DEPT || 'ADMIN';

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
  return { status: res.status, body: json };
}

const endpoints = [
  ['GET', '/departments/public', { public: true }],
  ['POST', '/auth/login', { public: true, body: { login: LOGIN, password: PASS, departmentCode: DEPT } }],
  ['GET', '/auth/me'],
  ['GET', '/users?limit=5'],
  ['GET', '/users/monitoring'],
  ['GET', '/roles'],
  ['GET', '/roles/permissions'],
  ['GET', '/departments'],
  ['GET', '/clients'],
  ['GET', '/models?limit=5'],
  ['GET', '/orders?limit=5'],
  ['GET', '/orders/schedule?from=2026-01-01&to=2026-12-31'],
  ['GET', '/orders/export'],
  ['GET', '/warehouse?limit=5'],
  ['GET', '/warehouse/transactions?limit=5'],
  ['GET', '/tasks?limit=5'],
  ['GET', '/tasks/my?limit=5'],
  ['GET', '/plans/DAILY'],
  ['GET', '/plans/DAILY/candidates'],
  ['GET', '/plans/WEEKLY'],
  ['GET', '/dashboard'],
  ['GET', '/dashboard/kpis'],
  ['GET', '/dashboard/trend'],
  ['GET', '/reports/production'],
  ['GET', '/reports/orders'],
  ['GET', '/reports/defects'],
  ['GET', '/reports/warehouse'],
  ['GET', '/notifications'],
  ['GET', '/notifications/unread-count'],
  ['GET', '/search?q=test'],
  ['GET', '/audit?limit=5'],
  ['GET', '/audit/actions'],
  ['GET', '/production/summary'],
  ['GET', '/production/cutting?limit=5'],
  ['GET', '/production/shipments'],
];

async function main() {
  console.log(`Testing ${BASE}\n`);
  let token = '';
  const failures = [];

  for (const [method, path, opts = {}] of endpoints) {
    const r = await req(method, path, { token: opts.public ? undefined : token, body: opts.body });
    if (path === '/auth/login' && r.status === 201) token = r.body.accessToken;
    if (path === '/auth/login' && r.status === 200) token = r.body.accessToken;
    const ok = r.status >= 200 && r.status < 300;
    const line = `${ok ? 'OK ' : 'ERR'} ${r.status} ${method} ${path}`;
    console.log(line);
    if (!ok) failures.push({ method, path, status: r.status, body: r.body });
  }

  const code = `TEST-${Date.now()}`;
  const created = await req('POST', '/models', {
    token,
    body: { code, name: 'API smoke test', sizes: [{ size: 'S', qty: 1 }] },
  });
  console.log(`${created.status >= 200 && created.status < 300 ? 'OK ' : 'ERR'} ${created.status} POST /models (create)`);
  if (created.status >= 400) failures.push({ method: 'POST', path: '/models', status: created.status, body: created.body });

  const modelId = created.body?.id;
  if (modelId) {
    const detail = await req('GET', `/models/${modelId}`, { token });
    console.log(`${detail.status < 300 ? 'OK ' : 'ERR'} ${detail.status} GET /models/:id`);
    if (detail.status >= 400) failures.push({ method: 'GET', path: '/models/:id', status: detail.status, body: detail.body });

    const badPhoto = await req('POST', '/models', {
      token,
      body: { code: `BAD-${Date.now()}`, name: 'Bad', photo: 'data:image/png;base64,abc', sizes: [{ size: 'S', qty: 1 }] },
    });
    const expect400 = badPhoto.status === 400;
    console.log(`${expect400 ? 'OK ' : 'ERR'} ${badPhoto.status} POST /models (reject base64 photo)`);
    if (!expect400) failures.push({ method: 'POST', path: '/models base64', status: badPhoto.status, body: badPhoto.body });

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 't.png');
    const upRes = await fetch(`${BASE}/models/${modelId}/photos`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    const upText = await upRes.text();
    console.log(`${upRes.status < 300 ? 'OK ' : 'ERR'} ${upRes.status} POST /models/:id/photos`);
    if (upRes.status >= 400) failures.push({ method: 'POST', path: '/models/:id/photos', status: upRes.status, body: upText.slice(0, 200) });

    const del = await req('DELETE', `/models/${modelId}`, { token });
    console.log(`${del.status < 300 ? 'OK ' : 'ERR'} ${del.status} DELETE /models/:id`);
  }

  console.log(`\n${failures.length ? `FAILED: ${failures.length}` : 'All endpoints OK'}`);
  if (failures.length) {
    for (const f of failures) console.log(JSON.stringify(f, null, 2));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
