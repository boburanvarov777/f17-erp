#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const APP = path.resolve('apps/web/src/app');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) out.push(...walk(f));
    else if (f.endsWith('.ts')) out.push(f);
  }
  return out;
}

function relFromApp(file) {
  return path.relative(APP, file).replace(/\\/g, '/');
}

function fixFile(file) {
  let c = readFileSync(file, 'utf8');
  const orig = c;
  const rel = relFromApp(file);

  // Deep feature pages/components: bump core/shared one level
  if (/features\/[^/]+\/(pages|components)\/[^/]+\/.+\.ts$/.test(rel)) {
    c = c.replace(/from '\.\.\/\.\.\/\.\.\/core\//g, "from '../../../../core/");
    c = c.replace(/from '\.\.\/\.\.\/\.\.\/shared\//g, "from '../../../../shared/");
    c = c.replace(/from '\.\.\/\.\.\/\.\.\/layout\//g, "from '../../../../layout/");
  }

  // Orders internal cross-imports
  if (rel.includes('features/orders/pages/')) {
    c = c.replace(/from '\.\/order-form\.component'/g, "from '../../components/order-form/order-form.component'");
    c = c.replace(/from '\.\/order-flow-preview\.component'/g, "from '../../components/order-flow-preview/order-flow-preview.component'");
  }
  if (rel.includes('features/orders/pages/orders-list')) {
    c = c.replace(/from '\.\/order-form\.component'/g, "from '../../components/order-form/order-form.component'");
  }

  // Miniapp page internal paths
  if (/features\/miniapp\/pages\/[^/]+\/.+\.ts$/.test(rel)) {
    c = c.replace(/from '\.\/miniapp\.service'/g, "from '../../services/miniapp.service'");
    c = c.replace(/from '\.\/telegram'/g, "from '../../utils/telegram'");
    c = c.replace(/from '\.\/miniapp-nav\.config'/g, "from '../../config/miniapp-nav.config'");
  }

  // Miniapp shell
  if (rel === 'features/miniapp/shell/miniapp-shell.component.ts') {
    c = c.replace(/from '\.\/miniapp-nav\.config'/g, "from '../config/miniapp-nav.config'");
    c = c.replace(/from '\.\/miniapp\.service'/g, "from '../services/miniapp.service'");
    c = c.replace(/from '\.\/telegram'/g, "from '../utils/telegram'");
    c = c.replace(/from '\.\.\/\.\.\/core\//g, "from '../../../core/");
    c = c.replace(/from '\.\.\/\.\.\/shared\//g, "from '../../../shared/");
  }

  // Miniapp services
  if (rel === 'features/miniapp/services/miniapp.service.ts') {
    c = c.replace(/from '\.\/telegram'/g, "from '../utils/telegram'");
    c = c.replace(/from '\.\.\/\.\.\/core\//g, "from '../../../core/");
  }

  // Miniapp config
  if (rel === 'features/miniapp/config/miniapp-nav.config.ts') {
    c = c.replace(/from '\.\.\/\.\.\/core\//g, "from '../../../core/");
  }

  // Archive imports order-detail
  if (rel.includes('features/archive/')) {
    c = c.replace(
      /from '\.\.\/\.\.\/orders\/order-detail\.component'/g,
      "from '../../orders/pages/order-detail/order-detail.component'",
    );
  }

  writeFileSync(file, c);
  return c !== orig;
}

function globalFixes() {
  const replacements = [
    // Chart split
    [/from '([^']*)shared\/ui\/chart\.component'/g, "from '$1shared/ui/bar-chart/bar-chart.component'"],
    [/BarChartComponent, ChartPoint, RankChartComponent/g, 'BarChartComponent, RankChartComponent'],
    [/BarChartComponent, ChartPoint, DonutChartComponent, RankChartComponent/g, 'BarChartComponent, RankChartComponent, DonutChartComponent'],
    [/import \{ ChartPoint \} from '([^']*)chart\.component'/g, "import { ChartPoint } from '$1chart.types'"],
    [/import type \{ ChartPoint \} from '([^']*)chart\.component'/g, "import type { ChartPoint } from '$1chart.types'"],
    // Add ChartPoint import where needed - handled separately

    // Loading split from empty
    [/EmptyComponent, LoadingComponent \} from '([^']*)empty\/empty\.component'/g, 'EmptyComponent } from \'$1empty/empty.component\';\nimport { LoadingComponent } from \'$1loading/loading.component\''],
    [/LoadingComponent \} from '([^']*)empty\/empty\.component'/g, "LoadingComponent } from '$1loading/loading.component'"],
    [/LoadingComponent \} from '\.\.\/ui\/empty\.component'/g, "LoadingComponent } from '../ui/loading/loading.component'"],

    // Priority split from status-badge
    [/PriorityBadgeComponent, StatusBadgeComponent \} from '([^']*)status-badge\/status-badge\.component'/g, 'StatusBadgeComponent } from \'$1status-badge/status-badge.component\';\nimport { PriorityBadgeComponent } from \'$1priority-badge/priority-badge.component\''],
    [/StatusBadgeComponent, PriorityBadgeComponent \} from '([^']*)status-badge\/status-badge\.component'/g, 'StatusBadgeComponent } from \'$1status-badge/status-badge.component\';\nimport { PriorityBadgeComponent } from \'$1priority-badge/priority-badge.component\''],

    // Core utils moved
    [/from '\.\.\/role\.util'/g, "from '../utils/role.util'"],
    [/from '\.\/role\.util'/g, "from '../utils/role.util'"],
    [/from '\.\.\/nav\.config'/g, "from '../config/nav.config'"],
    [/from '\.\.\/lang-options'/g, "from '../config/lang-options'"],
    [/from '\.\.\/dept-label'/g, "from '../utils/dept-label'"],
    [/from '\.\.\/permission-i18n'/g, "from '../utils/permission-i18n'"],
    [/from '\.\.\/nav-filter'/g, "from '../utils/nav-filter'"],
    [/from '\.\.\/tooltip-sync'/g, "from '../utils/tooltip-sync'"],

    // nav-filter internal
    [/from '\.\/models'/g, "from '../models'"],
    [/from '\.\/nav\.config'/g, "from '../config/nav.config'"],

    // shared/ui subfolders — icon, pipes, chart.types
    [/from '\.\/icon\.component'/g, "from '../icon.component'"],
    [/from '\.\.\/pipes\//g, "from '../../pipes/"],
    [/from '\.\.\/chart\.types'/g, "from '../chart.types'"],

    // empty component core path
    [/from '\.\.\/\.\.\/core\/services\/i18n\.service'/g, "from '../../../core/services/i18n.service'"],
  ];

  let count = 0;
  for (const file of walk(APP)) {
    let c = readFileSync(file, 'utf8');
    const orig = c;
    for (const [re, rep] of replacements) c = c.replace(re, rep);
    if (c !== orig) {
      writeFileSync(file, c);
      count++;
    }
  }
  return count;
}

let n = 0;
for (const file of walk(APP)) {
  if (fixFile(file)) n++;
}
console.log(`Path-specific fixes: ${n} files`);
console.log(`Global fixes: ${globalFixes()} files`);
