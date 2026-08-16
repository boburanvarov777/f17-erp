#!/usr/bin/env node
/** Converts [title] on interactive elements to [attr.data-tip] for styled CSS tooltips. */
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '../src');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const interactive =
  /(<(?:button|a)\b[^>]*?)\[title\]="((?:[^"]|\([^)]*\))*?)"/g;

let changed = 0;
for (const file of walk(root)) {
  let src = fs.readFileSync(file, 'utf8');
  const next = src.replace(interactive, '$1[attr.data-tip]="$2"');
  if (next !== src) {
    fs.writeFileSync(file, next);
    changed++;
    console.log('updated', path.relative(root, file));
  }
}
console.log(`Done. ${changed} file(s) updated.`);
