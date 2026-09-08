#!/usr/bin/env node
/*
 * AnthroPrime — static + runtime QA audit.
 *
 * Runs the site's REAL assets/site.js and each page's real inline script
 * inside a jsdom DOM built from the real .html file, then reports:
 *
 *   1. runtime JS errors / console errors
 *   2. internal links + asset references that do not resolve on disk
 *   3. duplicate element IDs
 *   4. dead CSS selectors (selectors that match no element on any page)
 *   5. dead JS querySelectors (selectors the JS looks up but never finds)
 *   6. a11y basics: images without alt, form controls without labels,
 *      buttons without an accessible name
 *
 * Usage: node tools/qa/audit.mjs [--json]
 * Exits non-zero when any ERROR-severity finding is present.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const PAGES = [
  'index.html',
  'anthroprime_services.html',
  'practices.html',
  'contact.html',
  'strategic-growth-advisor.html',
];

const asJson = process.argv.includes('--json');
const findings = [];

function add(severity, code, page, message, where = '') {
  findings.push({ severity, code, page, message, where });
}

/* ------------------------------------------------------------------ */
/* 1. link + asset resolution                                          */
/* ------------------------------------------------------------------ */
const LOCAL_EXT = new Set(['.html', '.css', '.js', '.png', '.ico', '.svg', '.jpg', '.jpeg', '.webp', '.txt', '.xml', '.json']);

function checkReferences(page, html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const refs = [];

  for (const a of doc.querySelectorAll('a[href]')) refs.push(['a[href]', a.getAttribute('href')]);
  for (const l of doc.querySelectorAll('link[href]')) refs.push(['link[href]', l.getAttribute('href')]);
  for (const s of doc.querySelectorAll('script[src]')) refs.push(['script[src]', s.getAttribute('src')]);
  for (const i of doc.querySelectorAll('img[src]')) refs.push(['img[src]', i.getAttribute('src')]);
  for (const s of doc.querySelectorAll('source[src]')) refs.push(['source[src]', s.getAttribute('src')]);

  const seen = new Set();
  for (const [kind, raw] of refs) {
    if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith('file:')) continue;
    const key = kind + '|' + raw;
    if (seen.has(key)) continue;
    seen.add(key);

    const noHash = raw.split('#')[0];
    if (!noHash) continue;
    if (!LOCAL_EXT.has(path.extname(noHash).toLowerCase())) continue;

    const abs = path.resolve(ROOT, path.dirname(page), noHash);
    if (!fs.existsSync(abs)) {
      add('ERROR', 'BROKEN_REF', page, `${kind}="${raw}" does not resolve to a file on disk`);
    }
  }

  // anchor targets
  const ids = new Set([...doc.querySelectorAll('[id]')].map((e) => e.id));
  for (const a of doc.querySelectorAll('a[href^="#"]')) {
    const id = a.getAttribute('href').slice(1);
    if (id && !ids.has(id)) {
      add('ERROR', 'BROKEN_ANCHOR', page, `href="#${id}" has no matching id on this page`);
    }
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* 2. duplicate ids                                                    */
/* ------------------------------------------------------------------ */
function checkDuplicateIds(page, html) {
  const dom = new JSDOM(html);
  const counts = new Map();
  for (const el of dom.window.document.querySelectorAll('[id]')) {
    counts.set(el.id, (counts.get(el.id) || 0) + 1);
  }
  for (const [id, n] of counts) {
    if (n > 1) add('ERROR', 'DUP_ID', page, `id="${id}" appears ${n} times (must be unique)`);
  }
}

/* ------------------------------------------------------------------ */
/* 3. a11y basics                                                      */
/* ------------------------------------------------------------------ */
function checkA11y(page, html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  for (const img of doc.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) {
      add('ERROR', 'IMG_NO_ALT', page, `<img src="${img.getAttribute('src')}"> has no alt attribute`);
    }
  }

  for (const ctl of doc.querySelectorAll('input, textarea, select')) {
    if (ctl.getAttribute('type') === 'hidden') continue;
    // Netlify form definitions are declared in a `hidden` form purely so the
    // build can register the fields; they are never rendered or focused.
    if (ctl.closest('[hidden]')) continue;
    const id = ctl.getAttribute('id');
    const labelled =
      (id && [...doc.querySelectorAll('label[for]')].some((l) => l.getAttribute('for') === id)) ||
      ctl.closest('label') ||
      ctl.getAttribute('aria-label') ||
      ctl.getAttribute('aria-labelledby');
    if (!labelled) {
      add('ERROR', 'CTL_NO_LABEL', page, `<${ctl.tagName.toLowerCase()} name="${ctl.getAttribute('name') || ''}" id="${id || ''}"> has no associated label`);
    }
  }

  for (const btn of doc.querySelectorAll('button')) {
    const name = (btn.textContent || '').trim() || btn.getAttribute('aria-label') || '';
    if (!name) {
      add('WARN', 'BTN_NO_NAME', page, `<button> with no accessible name: ${btn.outerHTML.slice(0, 90)}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 4. runtime execution of the real scripts                            */
/* ------------------------------------------------------------------ */
const SITE_JS = fs.readFileSync(path.join(ROOT, 'assets/site.js'), 'utf8');

/* jsdom does not implement matchMedia; the site gates a lot of behaviour
   on it, so provide a faithful stub driven by a pretend viewport. */
function installMatchMedia(win, { reduceMotion = false, coarse = false, fine = true } = {}) {
  win.matchMedia = function (query) {
    const q = query.replace(/\s+/g, ' ').trim();
    let matches = false;
    if (/prefers-reduced-motion:\s*reduce/.test(q)) matches = reduceMotion;
    else if (/pointer:\s*coarse/.test(q)) matches = coarse;
    else if (/\(hover:\s*hover\)/.test(q) && /pointer:\s*fine/.test(q)) matches = fine;
    else if (/\(hover:\s*hover\)/.test(q)) matches = fine;
    return {
      matches,
      media: q,
      onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return false; },
    };
  };
}

function runPage(page, opts = {}) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message.split('\n')[0]));
  vc.on('error', (m) => errors.push('console.error: ' + m));

  // Strip the <script src=...> tag so jsdom does not try to fetch it over the
  // network; we execute the real file contents in-page right after.
  const htmlForDom = html.replace(/<script[^>]*\bsrc="assets\/site\.js"[^>]*><\/script>/g, '');

  const dom = new JSDOM(htmlForDom, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url || 'https://www.anthroprime.com/' + page,
    virtualConsole: vc,
    beforeParse(win) {
      installMatchMedia(win, opts);
      // jsdom has no layout, so give the geometry-dependent code sane values.
      Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', { get() { return 400; }, configurable: true });
      Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { get() { return 200; }, configurable: true });
      Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { get() { return 1200; }, configurable: true });
      Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { get() { return 600; }, configurable: true });
      Object.defineProperty(win, 'innerWidth', { value: opts.width || 1440, writable: true, configurable: true });
      Object.defineProperty(win, 'innerHeight', { value: opts.height || 900, writable: true, configurable: true });
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.scrollTo = function () {};
      // The mesh background only needs a 2D context that accepts calls.
      const noop = () => {};
      const ctx2d = new Proxy({}, {
        get(t, k) {
          if (k === 'canvas') return null;
          if (k === 'setTransform' || k === 'createLinearGradient') {
            return k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop;
          }
          return noop;
        },
        set() { return true; },
      });
      win.HTMLCanvasElement.prototype.getContext = function () { return ctx2d; };
    },
  });

  // Now execute the real shared bundle exactly as the browser would.
  try {
    dom.window.eval(SITE_JS);
  } catch (e) {
    errors.push('assets/site.js threw: ' + e.message);
  }
  return { dom, errors };
}

/* ------------------------------------------------------------------ */
/* 5. dead CSS selector detection                                      */
/* ------------------------------------------------------------------ */
function stripCommentsAndMedia(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function selectorsFromCss(css) {
  const clean = stripCommentsAndMedia(css);
  const out = [];
  // naive block scanner: capture everything before '{' that is not an at-rule prelude
  let depth = 0;
  let buf = '';
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      depth++;
      if (prelude && !prelude.startsWith('@') && !prelude.includes('%') && !/^\d/.test(prelude)) {
        out.push(prelude);
      }
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      buf = '';
      continue;
    }
    if (ch === ';') {
      buf = '';
      continue;
    }
    buf += ch;
  }
  return out;
}

function simpleSelectorMatchesSomething(selector, docs) {
  // Split on ',' and test each part; a part is "live" if any doc matches it.
  const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return true;
  for (const part of parts) {
    // Keyframe offsets and at-rule preludes are not selectors.
    if (/^(from|to|\d+(\.\d+)?%)$/.test(part)) return true;
    // Skip keyframe names, pseudo-only and vendor/functional bits jsdom can't parse.
    const probe = part
      .replace(/::?(before|after|first-line|first-letter|placeholder|selection|marker|backdrop)/gi, '')
      .replace(/:(hover|focus|active|visited|focus-visible|focus-within|checked|disabled|first-child|last-child|nth-child\([^)]*\)|nth-last-child\([^)]*\)|nth-of-type\([^)]*\)|not\([^)]*\)|is\([^)]*\)|where\([^)]*\)|has\([^)]*\))/gi, '')
      .trim();
    if (!probe) continue; // e.g. ":root" style / pseudo-only
    if (probe.includes('color-mix') || probe.includes('var(')) continue;
    try {
      for (const doc of docs) {
        if (doc.querySelector(probe)) return true;
      }
    } catch {
      return true; // unparseable → don't flag
    }
  }
  return false;
}

/* Classes the site only ever applies at runtime, in response to scroll,
   hover, a click or a fetch. The audit cannot observe those states, so a
   selector built from them is NOT evidence of dead CSS — reporting them
   would bury the genuinely orphaned rules in noise. */
const RUNTIME_STATE = [
  'is-active', 'is-focused', 'is-open', 'is-scrolled', 'is-visible', 'is-selected',
  'is-loading', 'is-leaving', 'is-entering', 'active', 'expanded', 'done', 'show',
  'visible', 'in-view', 'gh-cursor-hover', 'gh-cursor-down', 'gh-spotlighting',
  'ap-ripple', 'theme-transitioning',
];

/* A selector is only worth reporting as dead if none of its comma parts
   survive the filter above. Theme-scoped rules (html[data-theme="dark"] …)
   are reported separately because they are state-dependent, not orphaned. */
function classifyDead(selector) {
  const flat = selector.replace(/\s+/g, ' ').trim();
  if (flat === 'to' || flat === 'from') return null;
  // Runtime-only state, and pseudo-classes that depend on user interaction.
  if (RUNTIME_STATE.some((c) => flat.includes('.' + c))) return null;
  if (/:(focus|focus-visible|focus-within|hover|active|selection)/.test(flat)) return null;
  if (/::selection/.test(flat)) return null;
  return flat;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
const docs = [];
for (const page of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const { dom, errors } = runPage(page);
  for (const e of errors) add('ERROR', 'JS_ERROR', page, e);
  checkReferences(page, html);
  checkDuplicateIds(page, html);
  checkA11y(page, html);
  // Use the POST-EXECUTION document: site.js and the page scripts inject
  // real elements (.theme-toggle, .back-to-top, .site-aurora, .live-viz
  // internals, scheduler pills), and a selector is only dead if it matches
  // nothing even after the site has finished building itself.
  docs.push(dom.window.document);
}

// CSS audit — inline <style> blocks + shared stylesheet
const cssSources = [];
for (const page of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  styles.forEach((s, i) => cssSources.push({ where: `${page} <style>#${i + 1}`, css: s }));
}
cssSources.push({ where: 'assets/site.css', css: fs.readFileSync(path.join(ROOT, 'assets/site.css'), 'utf8') });

/* A selector is dead only if it matches nothing in EITHER theme. Half the
   stylesheet is `html[data-theme="dark"] …` scoped, so flip the attribute
   on each runtime document and probe again — otherwise every dark rule
   would be reported as orphaned. */
function matchesInAnyTheme(selector, docs) {
  for (const theme of ['light', 'dark']) {
    for (const doc of docs) doc.documentElement.setAttribute('data-theme', theme);
    if (simpleSelectorMatchesSomething(selector, docs)) return true;
  }
  for (const doc of docs) doc.documentElement.removeAttribute('data-theme');
  return false;
}

const deadSelectors = new Set();
for (const { where, css } of cssSources) {
  for (const sel of selectorsFromCss(css)) {
    const flat = classifyDead(sel);
    if (!flat) continue;
    if (!matchesInAnyTheme(sel, docs)) {
      deadSelectors.add(`${flat}  ⟵ ${where}`);
    }
  }
}
for (const s of [...deadSelectors].sort()) {
  add('WARN', 'DEAD_CSS', '(all)', `selector matches no element on any page: ${s}`);
}

// JS audit — querySelector strings the code looks for but never finds
const jsSources = [{ where: 'assets/site.js', js: fs.readFileSync(path.join(ROOT, 'assets/site.js'), 'utf8') }];
for (const page of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  scripts.forEach((s, i) => jsSources.push({ where: `${page} <script>#${i + 1}`, js: s }));
}
const deadJs = new Set();
for (const { where, js } of jsSources) {
  const cleaned = js.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of cleaned.matchAll(/querySelector(?:All)?\(\s*(['"`])([^'"`]+)\1\s*\)/g)) {
    const sel = m[2];
    if (sel.includes('${') || sel.includes('+')) continue;
    const probe = sel.split(',')[0].trim();
    let found = false;
    for (const doc of docs) {
      try {
        if (doc.querySelector(probe)) { found = true; break; }
      } catch { found = true; break; }
    }
    if (!found) deadJs.add(`${sel}  ⟵ ${where}`);
  }
}
for (const s of [...deadJs].sort()) {
  add('WARN', 'DEAD_JS_SELECTOR', '(all)', `JS queries a selector that matches nothing: ${s}`);
}

/* ------------------------------------------------------------------ */
/* report                                                              */
/* ------------------------------------------------------------------ */
if (asJson) {
  process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
} else {
  const byCode = new Map();
  for (const f of findings) {
    const k = f.code;
    if (!byCode.has(k)) byCode.set(k, []);
    byCode.get(k).push(f);
  }
  const order = ['JS_ERROR', 'BROKEN_REF', 'BROKEN_ANCHOR', 'DUP_ID', 'IMG_NO_ALT', 'CTL_NO_LABEL', 'BTN_NO_NAME', 'DEAD_JS_SELECTOR', 'DEAD_CSS'];
  console.log('');
  console.log('='.repeat(72));
  console.log('ANTHROPRIME QA AUDIT');
  console.log('='.repeat(72));
  for (const code of order) {
    const list = byCode.get(code);
    if (!list || !list.length) continue;
    console.log(`\n[${code}] — ${list.length} finding(s)`);
    for (const f of list) console.log(`  ${f.severity.padEnd(5)} ${f.page.padEnd(30)} ${f.message}`);
  }
  const errors = findings.filter((f) => f.severity === 'ERROR').length;
  const warns = findings.filter((f) => f.severity === 'WARN').length;
  console.log('\n' + '-'.repeat(72));
  console.log(`TOTAL: ${errors} error(s), ${warns} warning(s)`);
  console.log('-'.repeat(72));
}

process.exit(findings.some((f) => f.severity === 'ERROR') ? 1 : 0);
