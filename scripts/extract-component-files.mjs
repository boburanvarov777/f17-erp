#!/usr/bin/env node
/**
 * Split inline template/styles from *.component.ts into sibling .html / .scss files.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
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

function extractBacktick(source, openIdx) {
  if (source[openIdx] !== '`') return null;
  let out = '';
  for (let i = openIdx + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\\') {
      out += source[++i];
      continue;
    }
    if (ch === '`') return { text: out, end: i + 1 };
    out += ch;
  }
  return null;
}

function extractStylesArray(source, openBracketIdx) {
  let depth = 0;
  let i = openBracketIdx;
  for (; i < source.length; i++) {
    if (source[i] === '[') depth++;
    else if (source[i] === ']') {
      depth--;
      if (depth === 0) {
        return { inner: source.slice(openBracketIdx + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

function concatStyleParts(inner) {
  const parts = [];
  let idx = 0;
  while (idx < inner.length) {
    const tick = inner.indexOf('`', idx);
    if (tick === -1) break;
    const chunk = extractBacktick(inner, tick);
    if (!chunk) break;
    parts.push(chunk.text);
    idx = chunk.end;
  }
  return parts.join('\n').trim();
}

function processFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const componentIdx = content.indexOf('@Component({');
  if (componentIdx === -1) return false;

  const classIdx = content.indexOf('export class', componentIdx);
  if (classIdx === -1) return false;

  const base = filePath.replace(/\.component\.ts$/, '');
  const htmlPath = `${base}.component.html`;
  const scssPath = `${base}.component.scss`;
  const relHtml = `./${path.basename(htmlPath)}`;
  const relScss = `./${path.basename(scssPath)}`;

  const decorator = content.slice(componentIdx, classIdx);

  const templateKey = decorator.match(/template\s*:\s*`/);
  if (!templateKey) {
    console.warn(`skip (no template): ${filePath}`);
    return false;
  }

  const templateOpen = componentIdx + templateKey.index + templateKey[0].length - 1;
  const templateChunk = extractBacktick(content, templateOpen);
  if (!templateChunk) throw new Error(`template parse failed: ${filePath}`);

  let stylesChunk = null;
  const stylesKey = decorator.match(/styles\s*:\s*\[/);
  if (stylesKey) {
    const stylesOpen = componentIdx + stylesKey.index + stylesKey[0].length - 1;
    const arr = extractStylesArray(content, stylesOpen);
    if (!arr) throw new Error(`styles parse failed: ${filePath}`);
    stylesChunk = concatStyleParts(arr.inner);
  }

  if (existsSync(htmlPath) || existsSync(scssPath)) {
    console.warn(`skip (already extracted): ${filePath}`);
    return false;
  }

  writeFileSync(htmlPath, templateChunk.text.replace(/^\n/, '').replace(/\n\s*$/, '') + '\n');

  let newContent = content;

  // Remove template property (including trailing comma)
  const templatePropStart = componentIdx + templateKey.index;
  const templatePropEnd = templateChunk.end;
  newContent = newContent.slice(0, templatePropStart) + newContent.slice(templatePropEnd);
  const insertTemplateUrl = `templateUrl: '${relHtml}',\n  `;
  newContent = newContent.replace('@Component({\n', `@Component({\n  ${insertTemplateUrl}`);

  if (stylesChunk) {
    writeFileSync(scssPath, stylesChunk.replace(/^\n/, '').replace(/\n\s*$/, '') + '\n');
    const stylesKey2 = newContent.slice(componentIdx).match(/styles\s*:\s*\[/);
    if (!stylesKey2) throw new Error(`styles key missing after template removal: ${filePath}`);
    const stylesOpen2 = componentIdx + stylesKey2.index;
    const arr2 = extractStylesArray(newContent, stylesOpen2 + stylesKey2[0].length - 1);
    if (!arr2) throw new Error(`styles re-parse failed: ${filePath}`);
    // find start of "styles:" line
    let stylesLineStart = stylesOpen2;
    while (stylesLineStart > 0 && newContent[stylesLineStart - 1] !== '\n') stylesLineStart--;
    let stylesRemoveEnd = arr2.end;
    while (stylesRemoveEnd < newContent.length && /[\s,]/.test(newContent[stylesRemoveEnd])) stylesRemoveEnd++;
    newContent = newContent.slice(0, stylesLineStart) + newContent.slice(stylesRemoveEnd);
    newContent = newContent.replace(
      `@Component({\n  templateUrl: '${relHtml}',\n`,
      `@Component({\n  templateUrl: '${relHtml}',\n  styleUrl: '${relScss}',\n`,
    );
  }

  writeFileSync(filePath, newContent);
  console.log(`extracted: ${path.relative(ROOT, filePath)}`);
  return true;
}

const files = walk(ROOT);
let count = 0;
for (const f of files) {
  if (processFile(f)) count++;
}
console.log(`Done: ${count} components extracted.`);
