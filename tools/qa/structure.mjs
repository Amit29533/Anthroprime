#!/usr/bin/env node
/*
 * AnthroPrime — structural integrity checks.
 *
 * Where interactions.mjs drives behaviour, this file verifies the document
 * structure the markup and CSS promise each other:
 *
 *   • every aria-controls / aria-labelledby points at a real id
 *   • role="tab" elements live inside a role="tablist"
 *   • one <h1> per page, plus lang / title / description / viewport
 *   • no duplicate element or SVG-gradient ids after the diagram builds
 *   • every netlify.toml redirect target exists on disk
 *   • the hero grid each page's CSS targets actually contains the diagram
 *     as a direct child (this is what stops the overlay regression)
 *   • keyboard-operable widgets have a visible focus style
 *
 * Usage: node tools/qa/structure.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SITE_JS = fs.readFileSync(path.join(ROOT, 'assets/site.js'), 'utf8');
const PAGES = ['index.html', 'anthroprime_services.html', 'practices.html', 'contact.html', 'strategic-growth-advisor.html'];

let passed = 0, failed = 0;
const failures = [];
const verbose = process.argv.includes('--verbose');

async function check(name, fn) {
  try {
    const d = await fn();
    passed++;
    if (verbose) console.log(`   ok  ${name}${d ? ' — ' + d : ''}`);
  } catch (e) {
    failed++;
    failures.push({ name, message: e.message });
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`); };

/* Load a page and run the real scripts so JS-injected nodes are present. */
function load(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8')
    .replace(/<script[^>]*\bsrc="assets\/site\.js"[^>]*><\/script>/g, '');
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://www.anthroprime.com/' + page, virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = (q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      const noop = () => {};
      win.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
      Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', { get: () => 400, configurable: true });
      Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { get: () => 200, configurable: true });
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.scrollTo = () => {};
    },
  });
  dom.window.eval(SITE_JS);
  return dom.window.document;
}

/* ================================================================== */
console.log('\n=== 1. ARIA wiring =================================================');

for (const page of PAGES) {
  await check(`${page} aria-controls targets exist`, () => {
    const doc = load(page);
    const ids = new Set([...doc.querySelectorAll('[id]')].map((e) => e.id));
    const bad = [];
    for (const el of doc.querySelectorAll('[aria-controls]')) {
      for (const ref of el.getAttribute('aria-controls').split(/\s+/)) {
        if (ref && !ids.has(ref)) bad.push(`${el.tagName.toLowerCase()}.${el.className} -> #${ref}`);
      }
    }
    eq(bad.length, 0, 'dangling aria-controls: ' + bad.join('; '));
    return `${doc.querySelectorAll('[aria-controls]').length} reference(s) resolve`;
  });
}

for (const page of PAGES) {
  await check(`${page} aria-labelledby targets exist`, () => {
    const doc = load(page);
    const ids = new Set([...doc.querySelectorAll('[id]')].map((e) => e.id));
    const bad = [];
    for (const el of doc.querySelectorAll('[aria-labelledby]')) {
      for (const ref of el.getAttribute('aria-labelledby').split(/\s+/)) {
        if (ref && !ids.has(ref)) bad.push(`#${ref}`);
      }
    }
    eq(bad.length, 0, 'dangling aria-labelledby: ' + bad.join(', '));
    return 'ok';
  });
}

await check('services pillar tabs sit inside a tablist', () => {
  const doc = load('anthroprime_services.html');
  const list = doc.querySelector('[role="tablist"]');
  assert(list, 'no role="tablist" container');
  const tabs = [...doc.querySelectorAll('[role="tab"]')];
  eq(tabs.length, 5, 'tab count');
  for (const t of tabs) {
    assert(list.contains(t), `${t.textContent.trim()} is not inside the tablist`);
    assert(t.hasAttribute('aria-selected'), `${t.textContent.trim()} has no aria-selected`);
  }
  eq(tabs.filter((t) => t.getAttribute('aria-selected') === 'true').length, 1, 'exactly one selected tab');
  return `tablist with ${tabs.length} tabs, 1 selected`;
});

await check('every tab controls an existing panel', () => {
  const doc = load('anthroprime_services.html');
  for (const t of doc.querySelectorAll('[role="tab"]')) {
    const id = t.getAttribute('aria-controls');
    assert(id, 'tab without aria-controls');
    const panel = doc.getElementById(id);
    assert(panel, `panel #${id} does not exist`);
    assert(panel.classList.contains('pillar-panel'), `#${id} is not a pillar panel`);
  }
  return '5 tabs -> 5 panels';
});

await check('exactly one tab is a tab stop (roving tabindex)', () => {
  const doc = load('anthroprime_services.html');
  const tabs = [...doc.querySelectorAll('[role="tab"]')];
  const stops = tabs.filter((t) => t.tabIndex === 0);
  eq(stops.length, 1, 'roving tabindex should leave exactly one tab stop');
  return `${stops[0].textContent.trim()} is the tab stop`;
});

console.log('\n=== 2. Document head ==============================================');

for (const page of PAGES) {
  await check(`${page} has exactly one <h1>`, () => {
    const doc = load(page);
    // The homepage also renders six <h1>s inside the hidden service overlay;
    // those are legitimately scoped to the dialog, so count only the page's
    // own top-level heading.
    const all = [...doc.querySelectorAll('h1')];
    const outsideOverlay = all.filter((h) => !h.closest('#services-overlay'));
    eq(outsideOverlay.length, 1, `expected 1 page-level h1, found ${outsideOverlay.length}`);
    return outsideOverlay[0].textContent.replace(/\s+/g, ' ').trim().slice(0, 48);
  });
}

for (const page of PAGES) {
  await check(`${page} head is complete`, () => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert(/<html\s+lang="en"/.test(html), 'missing <html lang="en">');
    assert(/<meta\s+charset="UTF-8"/i.test(html), 'missing charset');
    assert(/<meta\s+name="viewport"[^>]*width=device-width/.test(html), 'missing responsive viewport');
    const titles = html.match(/<title>/g) || [];
    eq(titles.length, 1, 'exactly one <title>');
    assert(/<meta\s+name="description"\s+content="[^"]{40,}"/.test(html), 'missing or thin meta description');
    return 'lang, charset, viewport, title, description';
  });
}

console.log('\n=== 3. Id uniqueness (incl. JS-injected SVG) =======================');

for (const page of PAGES) {
  await check(`${page} has no duplicate ids after scripts run`, () => {
    const doc = load(page);
    const seen = new Map();
    for (const el of doc.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) || 0) + 1);
    const dups = [...seen].filter(([, n]) => n > 1);
    eq(dups.length, 0, 'duplicate ids: ' + dups.map(([i, n]) => `${i}×${n}`).join(', '));
    return `${seen.size} unique ids`;
  });
}

await check('diagram gradient ids are unique per page', () => {
  for (const page of PAGES) {
    const doc = load(page);
    const grads = [...doc.querySelectorAll('linearGradient[id], radialGradient[id]')].map((g) => g.id);
    const dups = grads.filter((g, i) => grads.indexOf(g) !== i);
    eq(dups.length, 0, `${page}: duplicate gradient ids ${dups.join(', ')}`);
  }
  return 'no collisions across all 5 diagrams';
});

console.log('\n=== 4. Netlify config =============================================');

await check('every netlify redirect target exists', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  const targets = [...toml.matchAll(/^\s*to\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
  assert(targets.length > 0, 'no redirects parsed from netlify.toml');
  for (const t of targets) {
    if (!t.startsWith('/')) continue;
    const abs = path.join(ROOT, t);
    assert(fs.existsSync(abs), `redirect target ${t} does not exist on disk`);
  }
  return `${targets.length} redirect(s) verified`;
});

await check('netlify.toml publishes the repo root', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert(/publish\s*=\s*"\."/.test(toml), 'publish dir is not "."');
  assert(!/^\s*command\s*=/m.test(toml), 'a build command would break this zero-build site');
  return 'publish = "." with no build command';
});

console.log('\n=== 5. Hero structure matches the CSS =============================');

const HERO_OF = {
  'index.html': ['.hero', '.live-viz'],
  'anthroprime_services.html': ['.services-hero', '.live-viz'],
  'practices.html': ['.prac-hero', '.live-viz'],
  'contact.html': ['.contact-hero', '.live-viz'],
  'strategic-growth-advisor.html': ['.hero .wrap', '.live-viz'],
};

for (const [page, [heroSel, vizSel]] of Object.entries(HERO_OF)) {
  await check(`${page}: diagram is a direct child of its hero`, () => {
    const doc = load(page);
    const hero = doc.querySelector(heroSel);
    assert(hero, `hero ${heroSel} not found`);
    const viz = hero.querySelector(':scope > ' + vizSel);
    assert(viz, `.live-viz is not a direct child of ${heroSel} — the grid placement cannot apply`);
    return `${heroSel} > ${vizSel}`;
  });
}

await check('services pillar strip moved out of the copy column', () => {
  const doc = load('anthroprime_services.html');
  const hero = doc.querySelector('.services-hero');
  const strip = hero.querySelector(':scope > .pillars-strip');
  assert(strip, '.pillars-strip is not a direct child of .services-hero');
  const inner = doc.querySelector('.hero-content-inner');
  assert(!inner.contains(strip), '.pillars-strip is still nested inside .hero-content-inner');
  return 'direct child of the hero, spans both grid columns';
});

console.log('\n=== 6. Keyboard affordances =======================================');

await check('keyboard-operable widgets declare a focus style', () => {
  const specs = [
    ['practices.html', '.checklist-items li:focus-visible'],
    ['anthroprime_services.html', '.pillar-chip:focus-visible'],
    ['index.html', '.service-card:focus-visible'],
  ];
  for (const [page, sel] of specs) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert(html.includes(sel), `${page} is missing a ${sel} rule`);
  }
  return '3/3 focus-visible rules present';
});

await check('diagram nodes are focusable buttons', () => {
  for (const page of PAGES) {
    const doc = load(page);
    const nodes = [...doc.querySelectorAll('.lv-node')];
    eq(nodes.length, 6, `${page} node count`);
    for (const n of nodes) {
      eq(n.getAttribute('tabindex'), '0', `${page}: node not a tab stop`);
      eq(n.getAttribute('role'), 'button', `${page}: node has no button role`);
      assert(n.getAttribute('aria-label'), `${page}: node has no accessible name`);
    }
  }
  return '30 nodes across 5 pages, all focusable + labelled';
});

await check('service cards on the homepage are focusable buttons', () => {
  const doc = load('index.html');
  const cards = [...doc.querySelectorAll('.service-card[data-service]')];
  eq(cards.length, 6, 'card count');
  for (const c of cards) {
    eq(c.getAttribute('role'), 'button', 'no button role');
    eq(c.tabIndex, 0, 'not a tab stop');
    eq(c.getAttribute('aria-haspopup'), 'dialog', 'no aria-haspopup');
    assert(c.getAttribute('aria-label'), 'no accessible name');
  }
  return '6 cards, all focusable + labelled';
});

await check('services page cards are focusable buttons', () => {
  const doc = load('anthroprime_services.html');
  const cards = [...doc.querySelectorAll('.service-card[data-service-id]')];
  eq(cards.length, 22, 'card count');
  for (const c of cards) {
    eq(c.getAttribute('role'), 'button', 'no button role');
    eq(c.tabIndex, 0, 'not a tab stop');
    assert(c.getAttribute('aria-controls'), 'no aria-controls');
    eq(c.getAttribute('aria-expanded'), 'false', 'initial aria-expanded');
  }
  return '22 cards, all focusable + wired';
});

await check('the overlay is a labelled modal dialog', () => {
  const doc = load('index.html');
  const ov = doc.getElementById('services-overlay');
  eq(ov.getAttribute('role'), 'dialog', 'no dialog role');
  eq(ov.getAttribute('aria-modal'), 'true', 'not modal');
  eq(ov.getAttribute('aria-hidden'), 'true', 'should start hidden from AT');
  assert(ov.getAttribute('aria-label') || ov.getAttribute('aria-labelledby'), 'dialog has no accessible name');
  return ov.getAttribute('aria-label');
});

console.log('\n=== 7. Form integrity =============================================');

await check('every visible form control has a label', () => {
  const doc = load('contact.html');
  const bad = [];
  for (const ctl of doc.querySelectorAll('input, textarea, select')) {
    if (ctl.getAttribute('type') === 'hidden') continue;
    if (ctl.closest('[hidden]')) continue;
    const id = ctl.getAttribute('id');
    const ok = (id && [...doc.querySelectorAll('label[for]')].some((l) => l.getAttribute('for') === id))
      || ctl.closest('label') || ctl.getAttribute('aria-label') || ctl.getAttribute('aria-labelledby');
    if (!ok) bad.push(`${ctl.tagName.toLowerCase()}[name="${ctl.getAttribute('name')}"]`);
  }
  eq(bad.length, 0, 'unlabelled controls: ' + bad.join(', '));
  return `${doc.querySelectorAll('input:not([type=hidden]), textarea, select').length} controls labelled`;
});

await check('required fields are marked required', () => {
  const doc = load('contact.html');
  const req = ['fullName', 'workEmail'];
  for (const id of req) {
    const el = doc.getElementById(id);
    assert(el, `#${id} missing`);
    assert(el.hasAttribute('required'), `#${id} is not required`);
  }
  eq(doc.getElementById('workEmail').getAttribute('type'), 'email', 'email field should validate as email');
  return 'name + email required, email typed';
});

await check('Netlify forms declare a honeypot and form-name', () => {
  const doc = load('contact.html');
  for (const form of doc.querySelectorAll('form[data-netlify]')) {
    assert(form.getAttribute('netlify-honeypot'), 'missing honeypot attribute');
    const hp = form.querySelector(`[name="${form.getAttribute('netlify-honeypot')}"]`);
    assert(hp, 'honeypot input missing');
  }
  assert(doc.querySelector('input[name="form-name"]'), 'form-name field missing');
  return 'honeypot + form-name present';
});

console.log('\n=== 8. Asset references ===========================================');

for (const page of PAGES) {
  await check(`${page} references only files that exist`, () => {
    const doc = new JSDOM(fs.readFileSync(path.join(ROOT, page), 'utf8')).window.document;
    const refs = [];
    for (const sel of ['a[href]', 'link[href]', 'script[src]', 'img[src]']) {
      for (const el of doc.querySelectorAll(sel)) refs.push(el.getAttribute(sel.match(/\[(\w+)\]/)[1]));
    }
    let n = 0;
    for (const r of refs) {
      if (!r || r.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(r)) continue;
      const file = r.split('#')[0];
      if (!file || !/\.(html|css|js|png|ico|svg|jpg|webp)$/i.test(file)) continue;
      n++;
      assert(fs.existsSync(path.resolve(ROOT, path.dirname(page), file)), `missing file: ${file}`);
    }
    return `${n} local reference(s) resolve`;
  });
}

/* ================================================================== */
console.log('\n' + '='.repeat(66));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('='.repeat(66));
if (failed) for (const f of failures) console.log(`  ✗ ${f.name}: ${f.message}`);
process.exit(failed ? 1 : 0);
