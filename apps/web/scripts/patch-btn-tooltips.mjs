#!/usr/bin/env node
/** Adds [attr.data-tip] to common .btn buttons that lack tooltips, using visible label i18n keys. */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '../src/app/features');

const rules = [
  { re: /<button class="btn btn-primary btn-sm" type="button" \(click\)="open\(\{\}\)"(?![^>]*data-tip)/g, tip: `[attr.data-tip]="'new_user' | t"` },
  { re: /<button class="btn btn-primary btn-sm" type="button" \(click\)="open\(\{\}\)"(?![^>]*data-tip)/g, tip: `[attr.data-tip]="'new_department' | t"` },
  { re: /<button class="btn btn-primary btn-sm" type="button" \(click\)="open\(\{\}\)"(?![^>]*data-tip)/g, tip: '' },
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.component.ts')) out.push(p);
  }
  return out;
}

const patches = [
  ['orders-list.component.ts', 'exportCsv()', `'export' | t`],
  ['orders-list.component.ts', 'editing.set({})', `'new_order' | t`],
  ['orders-list.component.ts', 'clearFilters()', `'reset' | t`],
  ['models-list.component.ts', "view.set('grid')", `'view_grid' | t`],
  ['models-list.component.ts', "view.set('table')", `'view_table' | t`],
  ['models-list.component.ts', 'open({})', `'new_model' | t`],
  ['models-list.component.ts', '(click)="open(m)"', `'edit' | t`],
  ['models-list.component.ts', 'archiving.set(m)', `'archive' | t`],
  ['users.component.ts', 'open({})', `'new_user' | t`],
  ['departments.component.ts', 'open({})', `'new_department' | t`],
  ['departments.component.ts', '(click)="open(d)"', `'edit' | t`],
  ['roles.component.ts', 'open({ permissions', `'new_role' | t`],
  ['roles.component.ts', '(click)="open(r)"', `'edit' | t`],
  ['roles.component.ts', '(click)="remove(r)"', `'delete' | t`],
  ['audit.component.ts', 'detail.set(l)', `'view' | t`],
  ['my-tasks.component.ts', 'open({})', `'new_task' | t`],
  ['my-tasks.component.ts', '(click)="open(t)"', `'edit' | t`],
  ['order-detail.component.ts', 'print()', `'print' | t`],
  ['order-detail.component.ts', 'editing.set(o)', `'edit' | t`],
  ['order-detail.component.ts', 'addComment()', `'add_comment' | t`],
  ['monitoring.component.ts', 'openPlan(r)', `'set_daily_norm' | t`],
];

for (const [file, click, tipKey] of patches) {
  const full = path.join(root, ...file.split('/'));
  if (!fs.existsSync(full)) {
    // try find in subdirs
    const found = walk(root).find((f) => f.endsWith(file));
    if (!found) continue;
    patch(found, click, tipKey);
  } else patch(full, click, tipKey);
}

function patch(file, click, tipKey) {
  let src = fs.readFileSync(file, 'utf8');
  const esc = click.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(<button\\b[^>]*\\(click\\)="${esc}"[^>]*)(>)`, 'g');
  const next = src.replace(re, (m, pre, end) => {
    if (pre.includes('data-tip')) return m;
    return `${pre} [attr.data-tip]="${tipKey}"${end}`;
  });
  if (next !== src) {
    fs.writeFileSync(file, next);
    console.log('patched', path.basename(file), click);
  }
}

console.log('done');
