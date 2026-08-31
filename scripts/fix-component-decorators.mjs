#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = path.resolve('apps/web/src');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.component.ts')) out.push(full);
  }
  return out;
}

let fixed = 0;
for (const file of walk(ROOT)) {
  let c = readFileSync(file, 'utf8');
  const orig = c;

  c = c.replace(/\n  ,\n(\}\))/g, '\n$1');

  c = c.replace(
    /@Component\(\{\n  templateUrl: '([^']+)',\n  styleUrl: '([^']+)',\n    selector: '([^']+)',/g,
    "@Component({\n  selector: '$3',\n  templateUrl: '$1',\n  styleUrl: '$2',",
  );

  c = c.replace(
    /@Component\(\{\n  templateUrl: '([^']+)',\n    selector: '([^']+)',/g,
    "@Component({\n  selector: '$2',\n  templateUrl: '$1',",
  );

  if (c !== orig) {
    writeFileSync(file, c);
    fixed++;
  }
}

console.log(`Fixed ${fixed} files.`);
