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

/* Collect EVERY declaration block for a selector in a file, with whitespace
   normalised. Several of these classes are declared more than once (base rule
   plus media-query overrides), and matching only the first one silently tests
   the wrong block. */
function declBlocks(file, selector) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = [];
  const re = new RegExp(esc + '\\s*\\{([^}]*)\\}', 'g');
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1].replace(/\s+/g, ' ').trim());
  return out;
}
const anyBlockHas = (file, sel, re) => declBlocks(file, sel).some((b) => re.test(b));
const noBlockHas  = (file, sel, re) => !declBlocks(file, sel).some((b) => re.test(b));

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

console.log('\n=== 9. Stats row vs. the navy hero wedge (PSU regression) ==========');

/* index.html is the only page whose hero sits on the light surface with a
   navy .hero-band panel occupying the diagram's grid column at full height.
   The stats strip lives in the copy column (grid-column:1), so no stat —
   including "Gov + PSU" — can ever sit on navy; the opaque surface
   background is kept as a belt-and-braces guarantee. These guards pin it. */

await check('the stats strip paints an opaque surface behind itself', () => {
  const blocks = declBlocks('index.html', '.hero-bottom');
  assert(blocks.length > 0, '.hero-bottom rule not found');
  const hit = blocks.find((b) => /background:\s*var\(--surface\)/.test(b));
  assert(hit, '.hero-bottom has no opaque background — the navy wedge shows through the stats');
  return `${blocks.length} .hero-bottom block(s); background: var(--surface)`;
});

await check('the hero wedges stay inside the column gap (one clean diagonal past the stats)', () => {
  /* The gap and the wedge bleed must come from the same --hero-gap custom
     property. An earlier version bled the band clamp(56px,6vw,96px) past
     column 2 — up to 40px into the copy column at the hero's bottom — so
     the stats strip's opaque background painted over the slanted edge and
     replaced the diagonal with a vertical seam plus two steps around
     "Gov + PSU". If the bleed and the gap can drift apart again, the same
     artifact returns. */
  const heroBlocks = declBlocks('index.html', '.hero');
  assert(heroBlocks.some((b) => /--hero-gap:\s*clamp\(28px,\s*4vw,\s*56px\)/.test(b)
        && /column-gap:\s*var\(--hero-gap\)/.test(b)),
    '.hero (≥961px) must define --hero-gap and set column-gap from it');
  assert(heroBlocks.some((b) => /--hero-gap:\s*28px/.test(b)),
    'the 961–1100px block must re-declare --hero-gap:28px so the bleed follows the narrower gap');
  const bandBlocks = declBlocks('index.html', '.hero > .hero-band');
  assert(bandBlocks.length > 0, '.hero > .hero-band rule not found');
  assert(bandBlocks.every((b) => !/clamp\(\s*56px,\s*6vw/.test(b)),
    'the band bleeds past the gap into the copy column again — the stats strip will step the slanted edge');
  assert(bandBlocks.some((b) => /margin-left:\s*calc\(-1 \* \(var\(--hero-gap\) - 2px\)\)/.test(b)),
    '.hero > .hero-band margin-left must be derived from --hero-gap');
  const innerBlocks = declBlocks('index.html', '.hero > .hero-band-inner');
  assert(innerBlocks.some((b) => /margin-left:[^;]*var\(--hero-gap\)/.test(b)),
    '.hero > .hero-band-inner margin-left must be capped by --hero-gap');
  return 'both wedge bleeds derived from --hero-gap';
});

await check('stats items can shrink instead of overflowing', () => {
  assert(noBlockHas('index.html', '.hero-bottom > div', /min-width:\s*max-content/),
    'min-width:max-content is back — it forces unwrapped widths past the clipped edge');
  assert(anyBlockHas('index.html', '.hero-bottom > div', /min-width:\s*0/),
    '.hero-bottom > div should declare min-width:0');
  return 'min-width:0, no max-content';
});

await check('the PSU acronym can break before, but never inside', () => {
  for (const page of ['index.html', 'strategic-growth-advisor.html']) {
    const blocks = declBlocks(page, '.psu-label');
    assert(blocks.length > 0, `${page}: .psu-label rule not found`);
    assert(blocks.some((b) => /white-space:\s*nowrap/.test(b)), `${page}: PSU could split mid-word`);
    assert(blocks.every((b) => !/display:\s*inline-block/.test(b)),
      `${page}: inline-block makes PSU an atomic inline that cannot break before`);
  }
  // the escape hatch: nowrap must not be forced on the whole stat line
  assert(noBlockHas('index.html', '.hero-bottom .stat-num', /white-space:\s*nowrap/),
    'nowrap on .stat-num removes the only place the line can break');
  return 'nowrap on the acronym only';
});

await check('stat numerals have room for the font metrics', () => {
  const blocks = declBlocks('index.html', '.stat-num');
  assert(blocks.length > 0, '.stat-num rule not found');
  const withLh = blocks.map((b) => b.match(/line-height:\s*([\d.]+)/)).filter(Boolean);
  assert(withLh.length > 0, 'no line-height on .stat-num');
  const lh = withLh[0];
  // Cormorant Garamond ascender+descender is ~1.22em, so line-height:1 gives
  // negative half-leading and glyphs spill outside the line box.
  assert(parseFloat(lh[1]) >= 1.1, `line-height ${lh[1]} is too tight for the serif`);
  return `line-height: ${lh[1]}`;
});

await check('only the homepage mixes a light hero with a navy wedge', () => {
  // Confirms the contrast hazard is unique to index.html, so the fix belongs there.
  const light = { 'index.html': 'var(--surface)', 'anthroprime_services.html': 'var(--navy)',
    'practices.html': 'var(--navy)', 'contact.html': 'var(--navy)' };
  for (const [page, bg] of Object.entries(light)) {
    const heroClass = { 'index.html': '.hero', 'anthroprime_services.html': '.services-hero',
      'practices.html': '.prac-hero', 'contact.html': '.contact-hero' }[page];
    assert(anyBlockHas(page, heroClass, new RegExp('background:\\s*' + bg.replace(/[()]/g, '\\$&'))),
      `${page}: ${heroClass} background is not ${bg}`);
  }
  return 'index=light+navy wedge; other three are navy-on-navy';
});

console.log('\n=== 10. Content below the diagram =================================');

await check('services pillar strip spans full width below the diagram', () => {
  const html = fs.readFileSync(path.join(ROOT, 'anthroprime_services.html'), 'utf8');
  assert(/\.services-hero\s*>\s*\.pillars-strip\{[^}]*grid-column\s*:\s*1\s*\/\s*-1[^}]*grid-row\s*:\s*2/.test(html),
    'pillar strip is not spanning row 2 across both columns');
  return 'grid-column: 1 / -1; grid-row: 2';
});

await check('contact quicklinks sit below the copy, clear of the diagram', () => {
  const html = fs.readFileSync(path.join(ROOT, 'contact.html'), 'utf8');
  assert(/\.contact-hero\s*>\s*\.hero-quicklinks\{[^}]*grid-column\s*:\s*1[^}]*grid-row\s*:\s*2/.test(html),
    'quicklinks are not pinned to column 1 / row 2');
  assert(/\.contact-hero\s*>\s*\.live-viz\{[^}]*grid-row\s*:\s*1\s*\/\s*span\s*2/.test(html),
    'diagram should span both rows so it cannot collide with the quicklinks');
  return 'quicklinks col 1 row 2; diagram spans rows 1-2 in col 2';
});

await check('growth-advisor stats live inside the copy column', () => {
  const doc = load('strategic-growth-advisor.html');
  const wrap = doc.querySelector('.hero .wrap');
  const stats = wrap.querySelector('.hero-stats');
  assert(stats, 'hero-stats not found');
  assert(!stats.parentElement.classList.contains('live-viz'), 'stats must not be inside the diagram');
  assert(stats.parentElement.hasAttribute('data-reveal'), 'stats should be in the copy column');
  const viz = wrap.querySelector(':scope > .live-viz');
  assert(viz, 'diagram is not a direct child of .wrap');
  assert(!viz.contains(stats), 'diagram contains the stats');
  return 'stats in col 1, diagram in col 2, no nesting';
});

/* ================================================================== */
console.log('\n' + '='.repeat(66));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('='.repeat(66));
if (failed) for (const f of failures) console.log(`  ✗ ${f.name}: ${f.message}`);
process.exit(failed ? 1 : 0);
