#!/usr/bin/env node
/*
 * One-off maintenance script: strip CSS rule blocks whose selectors only
 * ever matched the retired hero visuals (.ap-viz, .dg-*, .diagram-*,
 * .hero-orbit / .hero-diagram and friends).
 *
 * A block is removed only when EVERY selector in its selector list is dead,
 * so mixed rules such as `.hero-orbit, .hero-ring{...}` are kept — with the
 * dead half pruned out of the selector list.
 *
 * Usage: node tools/qa/strip-dead-css.mjs [--dry-run] <file>
 */
import fs from 'node:fs';

const DRY = process.argv.includes('--dry-run');
// slice(2) — anything else picks up process.argv[0] (the node binary path)
const file = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0];
if (!file) {
  console.error('usage: node strip-dead-css.mjs [--dry-run] <file>');
  process.exit(2);
}

/* Class-name prefixes that appear nowhere in any .html or in site.js.
   Verified by grep before running this script. */
const DEAD_ROOTS = [
  'ap-viz', 'ap-node', 'ap-core', 'ap-hex', 'ap-blip', 'ap-sweep', 'ap-scan',
  'ap-packet', 'ap-pointer-light', 'ap-ring', 'ap-cross', 'ap-grid-line', 'ap-link',
  'dg-core', 'dg-node', 'dg-pack', 'dg-ring', 'dg-sub', 'dg-sweep', 'dg-label', 'dg-node',
  'diagram-node', 'diagram-line', 'diagram-hub', 'diagram-label', 'diagram-orbit-ring',
  'diagram-packet', 'diagram-rotate',
  'hero-diagram', 'hero-orbit',
  'orbit-packet', 'orbit-line', 'orbit-node', 'orbit-hub-circle',
  'count-up', 'float-gentle', 'glow-pulse', 'glow-text', 'stat-pulse',
  'typewriter-cursor', 'gh-glass', 'gh-lift', 'lv-hub-sub', 'node-circle',
];

/* State modifiers that are toggled at runtime. They must not rescue a
   selector from deletion: `.ap-viz .ap-node.is-active` is just as dead as
   `.ap-viz .ap-node`, because nothing ever builds an .ap-viz any more. */
const STATE_CLASSES = new Set([
  'is-active', 'is-focused', 'is-open', 'is-scrolled', 'is-visible', 'is-selected',
  'is-loading', 'is-leaving', 'is-entering', 'active', 'expanded', 'done', 'show',
  'visible', 'in-view', 'reverse', 'inner', 'strong', 'dash', 'rev',
]);

function isDeadSelector(sel) {
  const classes = [...sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)]
    .map((m) => m[1])
    .filter((c) => !STATE_CLASSES.has(c));
  if (!classes.length) return false;
  // Dead only if every remaining class belongs to a retired family.
  return classes.every((c) => DEAD_ROOTS.some((r) => c === r || c.startsWith(r)));
}

/* ---- tokenizer: comments | rule | at-rule ---- */
function parse(css) {
  const items = [];
  let i = 0;
  let text = '';
  const flushText = () => { if (text) { items.push({ type: 'ws', value: text }); text = ''; } };

  while (i < css.length) {
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? css.length : end + 2;
      flushText();
      items.push({ type: 'comment', value: css.slice(i, stop) });
      i = stop;
      continue;
    }
    if (css[i] === '{') {
      const prelude = text;
      text = '';
      // find the matching close brace
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        if (css.startsWith('/*', j)) { j = css.indexOf('*/', j + 2) + 2; continue; }
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      const body = css.slice(i + 1, j - 1);
      flushText();
      if (prelude.trim().startsWith('@')) {
        const inner = /@(media|supports|layer)/i.test(prelude.trim().split(/\s/)[0])
          ? parse(body)
          : [{ type: 'decl', value: body }];
        items.push({ type: 'atrule', prelude, children: inner });
      } else {
        items.push({ type: 'rule', prelude, body });
      }
      i = j;
      continue;
    }
    text += css[i];
    i++;
  }
  flushText();
  return items;
}

let removedBlocks = 0;
let prunedSelectors = 0;

function prune(items) {
  const out = [];
  for (const it of items) {
    if (it.type === 'rule') {
      const parts = it.prelude.split(',');
      const keep = parts.filter((p) => !isDeadSelector(p));
      if (keep.length === 0) { removedBlocks++; continue; }
      if (keep.length !== parts.length) {
        prunedSelectors += parts.length - keep.length;
        // keep the original indentation of the first surviving selector
        out.push({ type: 'rule', prelude: keep.join(','), body: it.body });
      } else {
        out.push(it);
      }
      continue;
    }
    if (it.type === 'atrule') {
      const before = JSON.stringify(it.children.length);
      const kids = prune(it.children);
      const hasContent = kids.some((k) => k.type !== 'ws' && k.type !== 'comment');
      if (!hasContent) { removedBlocks++; continue; }
      void before;
      out.push({ type: 'atrule', prelude: it.prelude, children: kids });
      continue;
    }
    out.push(it);
  }
  return out;
}

function emit(items) {
  let s = '';
  for (const it of items) {
    if (it.type === 'ws') { s += it.value; continue; }
    if (it.type === 'comment') { s += it.value; continue; }
    if (it.type === 'decl') { s += it.value; continue; }
    if (it.type === 'rule') { s += it.prelude + '{' + it.body + '}'; continue; }
    if (it.type === 'atrule') { s += it.prelude + '{' + emit(it.children) + '}'; continue; }
  }
  return s;
}

const src = fs.readFileSync(file, 'utf8');
const result = emit(prune(parse(src)));
// collapse the runs of blank lines the removals leave behind
const cleaned = result.replace(/\n{3,}/g, '\n\n');

console.log(`removed ${removedBlocks} rule/at-rule block(s), pruned ${prunedSelectors} dead selector(s)`);
console.log(`${src.length} -> ${cleaned.length} bytes (-${src.length - cleaned.length})`);

if (!DRY) fs.writeFileSync(file, cleaned);
else console.log('(dry run — nothing written)');
