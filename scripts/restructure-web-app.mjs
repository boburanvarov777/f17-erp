#!/usr/bin/env node
/**
 * Restructure apps/web/src/app to senior-level feature-based layout.
 * Run from repo root: node scripts/restructure-web-app.mjs
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';

const APP = path.resolve('apps/web/src/app');

/** @type {Array<[string, string]>} oldRelativeFromApp, newRelativeFromApp (without extension) */
const COMPONENT_MOVES = [
  // auth
  ['features/auth/login.component', 'features/auth/pages/login/login.component'],
  // single-page features
  ['features/dashboard/dashboard.component', 'features/dashboard/pages/dashboard/dashboard.component'],
  ['features/analytics/analytics.component', 'features/analytics/pages/analytics/analytics.component'],
  ['features/archive/archive.component', 'features/archive/pages/archive/archive.component'],
  ['features/audit/audit.component', 'features/audit/pages/audit/audit.component'],
  ['features/profile/profile.component', 'features/profile/pages/profile/profile.component'],
  ['features/reports/reports.component', 'features/reports/pages/reports/reports.component'],
  ['features/schedule/schedule.component', 'features/schedule/pages/schedule/schedule.component'],
  ['features/warehouse/warehouse.component', 'features/warehouse/pages/warehouse/warehouse.component'],
  ['features/production/production.component', 'features/production/pages/production/production.component'],
  // models
  ['features/models/models-list.component', 'features/models/pages/models-list/models-list.component'],
  ['features/models/model-detail.component', 'features/models/pages/model-detail/model-detail.component'],
  // orders
  ['features/orders/orders-list.component', 'features/orders/pages/orders-list/orders-list.component'],
  ['features/orders/order-detail.component', 'features/orders/pages/order-detail/order-detail.component'],
  ['features/orders/order-form.component', 'features/orders/components/order-form/order-form.component'],
  ['features/orders/order-flow-preview.component', 'features/orders/components/order-flow-preview/order-flow-preview.component'],
  // users
  ['features/users/users.component', 'features/users/pages/users/users.component'],
  ['features/users/roles.component', 'features/users/pages/roles/roles.component'],
  ['features/users/departments.component', 'features/users/pages/departments/departments.component'],
  // tasks
  ['features/tasks/monitoring.component', 'features/tasks/pages/monitoring/monitoring.component'],
  ['features/tasks/my-tasks.component', 'features/tasks/pages/my-tasks/my-tasks.component'],
  // miniapp
  ['features/miniapp/miniapp-shell.component', 'features/miniapp/shell/miniapp-shell.component'],
  ['features/miniapp/ma-redirect.component', 'features/miniapp/pages/ma-redirect/ma-redirect.component'],
  ['features/miniapp/ma-home.component', 'features/miniapp/pages/ma-home/ma-home.component'],
  ['features/miniapp/ma-warehouse.component', 'features/miniapp/pages/ma-warehouse/ma-warehouse.component'],
  ['features/miniapp/ma-manage.component', 'features/miniapp/pages/ma-manage/ma-manage.component'],
  ['features/miniapp/ma-plan-detail.component', 'features/miniapp/pages/ma-plan-detail/ma-plan-detail.component'],
  ['features/miniapp/ma-profile.component', 'features/miniapp/pages/ma-profile/ma-profile.component'],
  ['features/miniapp/ma-report.component', 'features/miniapp/pages/ma-report/ma-report.component'],
  ['features/miniapp/ma-analytics.component', 'features/miniapp/pages/ma-analytics/ma-analytics.component'],
  ['features/miniapp/ma-tasks.component', 'features/miniapp/pages/ma-tasks/ma-tasks.component'],
  ['features/miniapp/miniapp.service', 'features/miniapp/services/miniapp.service'],
  ['features/miniapp/miniapp-nav.config', 'features/miniapp/config/miniapp-nav.config'],
  ['features/miniapp/telegram', 'features/miniapp/utils/telegram'],
  // core
  ['core/nav.config', 'core/config/nav.config'],
  ['core/lang-options', 'core/config/lang-options'],
  ['core/dept-label', 'core/utils/dept-label'],
  ['core/role.util', 'core/utils/role.util'],
  ['core/permission-i18n', 'core/utils/permission-i18n'],
  ['core/nav-filter', 'core/utils/nav-filter'],
  ['core/tooltip-sync', 'core/utils/tooltip-sync'],
  // shared ui — bar chart renames chart files
  ['shared/ui/bar-chart.component', 'shared/ui/bar-chart/bar-chart.component'],
  ['shared/ui/rank-chart.component', 'shared/ui/rank-chart/rank-chart.component'],
  ['shared/ui/donut-chart.component', 'shared/ui/donut-chart/donut-chart.component'],
  ['shared/ui/empty.component', 'shared/ui/empty/empty.component'],
  ['shared/ui/loading.component', 'shared/ui/loading/loading.component'],
  ['shared/ui/status-badge.component', 'shared/ui/status-badge/status-badge.component'],
  ['shared/ui/priority-badge.component', 'shared/ui/priority-badge/priority-badge.component'],
];

const EXTENSIONS = ['.ts', '.html', '.scss'];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) out.push(...walk(f));
    else if (f.endsWith('.ts') || f.endsWith('.html')) out.push(f);
  }
  return out;
}

function moveComponent(oldBase, newBase) {
  const oldDir = path.dirname(path.join(APP, oldBase));
  const newDir = path.dirname(path.join(APP, newBase));
  mkdirSync(newDir, { recursive: true });
  for (const ext of EXTENSIONS) {
    const from = path.join(APP, oldBase + ext);
    const to = path.join(APP, newBase + ext);
    if (existsSync(from)) {
      renameSync(from, to);
      console.log(`  moved ${path.relative(APP, from)} → ${path.relative(APP, to)}`);
    }
  }
}

function buildReplacements() {
  /** @type {Array<[RegExp, string]>} */
  const reps = [];
  for (const [oldP, newP] of COMPONENT_MOVES) {
    const oldSlash = oldP.replace(/\\/g, '/');
    const newSlash = newP.replace(/\\/g, '/');
    // import paths with or without .ts
    reps.push([new RegExp(oldSlash.replace(/\//g, '\\/') + '(?=\\b)', 'g'), newSlash]);
  }
  return reps;
}

function depthDiff(oldP, newP) {
  return newP.split('/').length - oldP.split('/').length;
}

function fixRelativeImports(filePath, oldBase, newBase) {
  const diff = depthDiff(oldBase, newBase);
  if (diff === 0) return;
  let content = readFileSync(filePath, 'utf8');
  const prefix = diff > 0 ? '../'.repeat(diff) : null;
  if (diff > 0) {
    // bump relative imports that go outside the file's folder
    content = content.replace(/from '(\.\.\/[^']+)'/g, (m, imp) => `from '${ '../'.repeat(diff) + imp.slice(3) }'`);
    content = content.replace(/from "(\.\.\/[^"]+)"/g, (m, imp) => `from "${ '../'.repeat(diff) + imp.slice(3) }"`);
  }
  writeFileSync(filePath, content);
}

function main() {
  console.log('Moving files...');
  for (const [oldB, newB] of COMPONENT_MOVES) {
    moveComponent(oldB, newB);
    for (const ext of ['.ts', '.html']) {
      const f = path.join(APP, newB + ext);
      if (existsSync(f)) fixRelativeImports(f, oldB, newB);
    }
  }

  console.log('Updating import paths project-wide...');
  const reps = buildReplacements();
  for (const file of walk(APP)) {
    let c = readFileSync(file, 'utf8');
    const orig = c;
    for (const [re, rep] of reps) c = c.replace(re, rep);
    if (c !== orig) writeFileSync(file, c);
  }

  console.log('Done.');
}

main();
