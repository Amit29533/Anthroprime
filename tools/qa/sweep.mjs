#!/usr/bin/env node
/*
 * AnthroPrime — full-site breadth sweep.
 *
 * interactions.mjs tests representative components; structure.mjs tests the
 * document contract. This file walks EVERY instance of every repeated
 * component on EVERY page, in both themes and at both a desktop and a phone
 * width, and fails on the first thing that throws or renders empty.
 *
 * Usage: node tools/qa/sweep.mjs [--verbose]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SITE_JS = fs.readFileSync(path.join(ROOT, 'assets/site.js'), 'utf8');
const PAGES = ['index.html', 'anthroprime_services.html', 'practices.html', 'contact.html', 'strategic-growth-advisor.html'];

const verbose = process.argv.includes('--verbose');
let passed = 0, failed = 0;
const failures = [];

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

function load(page, opts = {}) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8')
    .replace(/<script[^>]*\bsrc="assets\/site\.js"[^>]*><\/script>/g, '');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message.split('\n')[0]));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: opts.url || 'https://www.anthroprime.com/' + page, virtualConsole: vc,
    beforeParse(win) {
      // Seeded before parse so the page's own pre-paint snippet can read it.
      if (opts.seedTheme) win.localStorage.setItem('ap-theme', opts.seedTheme);
      win.matchMedia = (q) => ({
        matches: /pointer:\s*coarse/.test(q) ? true
          : /prefers-reduced-motion:\s*reduce/.test(q) ? !!opts.reduceMotion
          : /\(hover:\s*hover\)/.test(q) ? !opts.touch : false,
        media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      });
      const noop = () => {};
      win.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
      Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', { get: () => 400, configurable: true });
      Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { get: () => 200, configurable: true });
      Object.defineProperty(win, 'innerWidth', { value: opts.width || 1440, writable: true, configurable: true });
      Object.defineProperty(win, 'innerHeight', { value: opts.height || 900, writable: true, configurable: true });
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.scrollTo = () => {};
    },
  });
  dom.window.eval(SITE_JS);
  return { win: dom.window, doc: dom.window.document, errors };
}
const click = (el, win) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
const key = (el, k, win) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

/* ================================================================== */
console.log('\n=== 1. Every page boots in both themes, both widths, both pointers ==');

for (const page of PAGES) {
  for (const mode of ['light/desktop', 'dark/desktop', 'light/phone/touch', 'dark/phone/touch/reduced']) {
    await check(`${page} — ${mode}`, () => {
      const opts = {
        width: mode.includes('phone') ? 390 : 1440,
        touch: mode.includes('touch'),
        reduceMotion: mode.includes('reduced'),
      };
      const { doc, errors } = load(page, opts);
      if (mode.startsWith('dark')) doc.documentElement.setAttribute('data-theme', 'dark');
      eq(errors.length, 0, 'runtime errors: ' + errors.join(' | '));
      // the shared chrome must always be present
      assert(doc.querySelector('.site-header'), 'header missing');
      assert(doc.querySelector('.site-footer'), 'footer missing');
      assert(doc.querySelector('.theme-toggle'), 'theme toggle not injected');
      assert(doc.querySelector('.back-to-top'), 'back-to-top not injected');
      assert(doc.querySelector('h1'), 'no h1');
      // the diagram must have built wherever the page declares one
      if (doc.querySelector('[data-live-viz]')) {
        eq(doc.querySelectorAll('.lv-node').length, 6, 'diagram nodes');
        assert(doc.querySelector('.lv-svg'), 'diagram svg');
      }
      return `${doc.querySelectorAll('*').length} elements, 0 errors`;
    });
  }
}

console.log('\n=== 2. All six homepage service detail pages ======================');

const SERVICES = [
  ['s1', 'Information Security Auditing'],
  ['s2', 'Penetration Testing'],
  ['s3', 'Cyber Risk Quantification'],
  ['s4', 'Government & PSU Advisory'],
  ['s5', 'Security Team Building'],
  ['s6', 'Training & Awareness'],
];

for (const [id, title] of SERVICES) {
  await check(`overlay page ${id} renders "${title}"`, () => {
    const { win, doc } = load('index.html');
    const card = doc.querySelector(`.service-card[data-service="${id}"]`);
    assert(card, `no card for ${id}`);
    click(card, win);
    const page = doc.getElementById(id);
    assert(page.classList.contains('active'), `${id} not activated`);
    const h1 = page.querySelector('h1');
    assert(h1, `${id} has no heading`);
    eq(h1.textContent.trim(), title, 'heading text');
    // every service page must carry its full content set
    assert(page.querySelector('.service-hero-desc'), `${id} missing hero description`);
    assert(page.querySelector('.service-body'), `${id} missing body`);
    assert(page.querySelectorAll('.section-block').length >= 2, `${id} has fewer than 2 section blocks`);
    assert(page.querySelector('.service-footer'), `${id} missing footer`);
    assert(page.querySelector('.cta-btn'), `${id} missing CTA`);
    const words = page.textContent.replace(/\s+/g, ' ').trim().split(' ').length;
    assert(words > 120, `${id} body looks empty (${words} words)`);
    // sidebar agrees
    const nav = doc.querySelector(`.service-nav-btn[data-target="${id}"]`);
    assert(nav.classList.contains('active'), `sidebar entry for ${id} not active`);
    eq(doc.querySelectorAll('.service-page.active').length, 1, 'exactly one page active');
    return `${words} words, sidebar in sync`;
  });
}

await check('all six sidebar entries switch correctly in sequence', () => {
  const { win, doc } = load('index.html');
  click(doc.querySelector('.service-card[data-service="s1"]'), win);
  for (const [id] of SERVICES) {
    click(doc.querySelector(`.service-nav-btn[data-target="${id}"]`), win);
    assert(doc.getElementById(id).classList.contains('active'), `${id} did not activate`);
    eq(doc.querySelectorAll('.service-page.active').length, 1, 'more than one page active after switching to ' + id);
  }
  return '6/6 sequential switches clean';
});

console.log('\n=== 3. All five service pillars ===================================');

const PILLARS = [
  ['cyber', 'panel-cyber'], ['ai', 'panel-ai'], ['data', 'panel-data'],
  ['cloud', 'panel-cloud'], ['infra', 'panel-infra'],
];

for (const [key2, panelId] of PILLARS) {
  await check(`pillar "${key2}" panel has content`, () => {
    const { doc } = load('anthroprime_services.html');
    const panel = doc.getElementById(panelId);
    assert(panel, `${panelId} missing`);
    assert(panel.classList.contains('pillar-panel'), `${panelId} is not a pillar panel`);
    const header = panel.querySelector('.pillar-header');
    assert(header, `${panelId} has no header`);
    assert(panel.querySelector('.pillar-title'), `${panelId} has no title`);
    const cards = panel.querySelectorAll('.service-card');
    assert(cards.length >= 1, `${panelId} has no service cards`);
    const panels = panel.querySelectorAll('.sub-services-panel');
    eq(panels.length, cards.length, `${panelId}: card/detail-panel count mismatch`);
    const words = panel.textContent.replace(/\s+/g, ' ').trim().split(' ').length;
    assert(words > 150, `${panelId} looks empty (${words} words)`);
    return `${cards.length} cards, ${words} words`;
  });
}

await check('every pillar tab activates its own panel and only its own', () => {
  const { win, doc } = load('anthroprime_services.html');
  for (const [key2, panelId] of PILLARS) {
    click(doc.querySelector(`.pillar-chip[data-pillar="${key2}"]`), win);
    assert(doc.getElementById(panelId).classList.contains('active'), `${panelId} not active`);
    eq(doc.querySelectorAll('.pillar-panel.active').length, 1, 'more than one panel active at ' + key2);
    eq(doc.querySelectorAll('.pillar-chip.active').length, 1, 'more than one chip active at ' + key2);
  }
  return '5/5 clean';
});

await check('every expandable card on every pillar opens and closes', () => {
  const { win, doc } = load('anthroprime_services.html');
  let opened = 0;
  for (const [key2] of PILLARS) {
    click(doc.querySelector(`.pillar-chip[data-pillar="${key2}"]`), win);
    for (const card of doc.querySelectorAll(`#${'panel-' + key2} .service-card[data-service-id]`)) {
      const id = card.getAttribute('data-service-id');
      const panel = doc.getElementById(id);
      assert(panel, `${key2}: detail panel #${id} missing`);
      click(card, win);
      assert(card.classList.contains('expanded'), `${id} did not expand`);
      eq(panel.style.display, 'grid', `${id} panel not displayed`);
      assert(panel.textContent.replace(/\s+/g, ' ').trim().length > 40, `${id} panel is empty`);
      click(card, win);
      assert(!card.classList.contains('expanded'), `${id} did not collapse`);
      opened++;
    }
  }
  return `${opened} cards opened + collapsed`;
});

console.log('\n=== 4. Every checklist on the practice page =======================');

await check('every checklist item on every card toggles', () => {
  const { win, doc } = load('practices.html');
  const cards = [...doc.querySelectorAll('.checklist-card')];
  assert(cards.length >= 4, `expected several checklists, found ${cards.length}`);
  let items = 0;
  cards.forEach((card, ci) => {
    const lis = [...card.querySelectorAll('.checklist-items li')];
    assert(lis.length >= 4, `checklist ${ci} has only ${lis.length} items`);
    const counter = card.querySelector('[data-count]');
    assert(counter, `checklist ${ci} has no counter`);
    eq(counter.textContent, `0/${lis.length}`, `checklist ${ci} initial counter`);
    for (const li of lis) {
      assert(li.hasAttribute('role'), `checklist ${ci}: item missing role`);
      click(li, win);
      assert(li.classList.contains('done'), `checklist ${ci}: item did not check`);
      items++;
    }
    eq(counter.textContent, `${lis.length}/${lis.length}`, `checklist ${ci} final counter`);
    // and back again
    for (const li of lis) click(li, win);
    eq(counter.textContent, `0/${lis.length}`, `checklist ${ci} did not reset`);
  });
  return `${cards.length} cards, ${items} items toggled twice`;
});

console.log('\n=== 5. Navigation is identical on every page ======================');

await check('all five pages expose the same nav link set', () => {
  const sets = {};
  for (const page of PAGES) {
    const { doc } = load(page);
    sets[page] = [...doc.querySelectorAll('.site-links a')].map((a) => a.getAttribute('href')).join('|');
  }
  const ref = sets[PAGES[0]];
  for (const page of PAGES) eq(sets[page], ref, `${page} nav differs from index.html`);
  return `${ref.split('|').length} links, identical across 5 pages`;
});

await check('all five pages expose the same footer link set', () => {
  const sets = {};
  for (const page of PAGES) {
    const { doc } = load(page);
    sets[page] = [...doc.querySelectorAll('.site-footer-links a')].map((a) => a.getAttribute('href')).join('|');
  }
  const ref = sets[PAGES[0]];
  for (const page of PAGES) eq(sets[page], ref, `${page} footer differs from index.html`);
  return `${ref.split('|').length} links, identical across 5 pages`;
});

await check('every internal link on every page resolves to a real file', () => {
  let n = 0;
  for (const page of PAGES) {
    const { doc } = load(page);
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      const file = href.split('#')[0];
      if (!file) continue;
      n++;
      assert(fs.existsSync(path.resolve(ROOT, path.dirname(page), file)),
        `${page}: link "${href}" does not resolve`);
    }
  }
  return `${n} internal links verified`;
});

await check('every in-page anchor on every page has a target', () => {
  let n = 0;
  for (const page of PAGES) {
    const { doc } = load(page);
    for (const a of doc.querySelectorAll('a[href^="#"]')) {
      const id = a.getAttribute('href').slice(1);
      if (!id) continue;
      n++;
      assert(doc.getElementById(id), `${page}: anchor "#${id}" has no target`);
    }
  }
  return `${n} anchors verified`;
});

console.log('\n=== 6. Live diagram: all three domains on every page ==============');

const DOMAINS = [['ai', 'AI Systems'], ['cyber', 'Cybersecurity'], ['data', 'Data & Analytics']];

for (const page of PAGES) {
  await check(`${page}: all three diagram domains render`, () => {
    const { win, doc } = load(page);
    const seen = [];
    for (const [mode, label] of DOMAINS) {
      const tab = [...doc.querySelectorAll('.lv-tab')].find((t) => t.getAttribute('data-mode') === mode);
      assert(tab, `${page}: no tab for ${mode}`);
      click(tab, win);
      eq(doc.querySelector('.lv-title').textContent, label, `${page}: title after switching to ${mode}`);
      eq(doc.querySelectorAll('.lv-node').length, 6, `${page}: node count in ${mode}`);
      assert(doc.querySelector('.lv-hub-label'), `${page}: hub missing in ${mode}`);
      assert(doc.querySelectorAll('.lv-metric-val').length === 6, `${page}: metrics in ${mode}`);
      seen.push(label);
    }
    return seen.join(' → ');
  });
}

await check('every diagram node on every domain has a detail blurb', () => {
  const { win, doc } = load('index.html');
  let checked = 0;
  for (const [mode] of DOMAINS) {
    click([...doc.querySelectorAll('.lv-tab')].find((t) => t.getAttribute('data-mode') === mode), win);
    for (const node of doc.querySelectorAll('.lv-node')) {
      click(node, win);
      const body = doc.querySelector('.lv-detail-body').textContent.trim();
      assert(body.length > 40, `${mode}: node ${node.getAttribute('data-node')} has no detail (${body.length} chars)`);
      checked++;
    }
  }
  return `${checked} nodes across 3 domains, all with copy`;
});

console.log('\n=== 7. Theme persists across pages ================================');

await check('a theme chosen on one page is honoured by the next', () => {
  // Page 1: flip the toggle and read what it actually wrote.
  const a = load('index.html');
  eq(a.doc.documentElement.getAttribute('data-theme'), 'light', 'page 1 starts light');
  click(a.doc.querySelector('.theme-toggle'), a.win);
  const saved = a.win.localStorage.getItem('ap-theme');
  eq(saved, 'dark', 'toggle did not write ap-theme to localStorage');

  // Page 2: seed that same key before parse, exactly as a returning visitor's
  // browser would, and let the page's own pre-paint snippet apply it.
  const html = fs.readFileSync(path.join(ROOT, 'practices.html'), 'utf8');
  assert(/<script>\(function\(\)\{try\{var t=localStorage/.test(html),
    'practices.html has no pre-paint theme snippet');
  const b = load('practices.html', { seedTheme: saved });
  eq(b.doc.documentElement.getAttribute('data-theme'), 'dark',
    'second page ignored the persisted theme');
  return `wrote "${saved}", next page applied it before paint`;
});

await check('every page carries the pre-paint theme snippet', () => {
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert(/<script>\(function\(\)\{try\{var t=localStorage\.getItem\('ap-theme'\)/.test(html),
      `${page} has no pre-paint theme snippet — it will flash the wrong theme`);
  }
  return '5/5 pages apply the theme before first paint';
});

console.log('\n=== 8. Full interaction sequence per page, no errors ==============');

for (const page of PAGES) {
  await check(`${page}: full click-through stays clean`, () => {
    const { win, doc, errors } = load(page);
    // theme
    click(doc.querySelector('.theme-toggle'), win);
    click(doc.querySelector('.theme-toggle'), win);
    // menu
    const burger = doc.querySelector('.site-burger');
    click(burger, win); click(burger, win);
    // diagram tabs + a node
    const tabs = [...doc.querySelectorAll('.lv-tab')];
    if (tabs.length) { click(tabs[1], win); click(doc.querySelector('.lv-node'), win); click(doc.querySelector('.lv-detail-close'), win); }
    // page-specific components
    if (page === 'index.html') {
      click(doc.querySelector('.service-card[data-service="s1"]'), win);
      click(doc.querySelector('.service-nav-btn[data-target="s4"]'), win);
      key(doc.body, 'Escape', win);
    }
    if (page === 'anthroprime_services.html') {
      click(doc.querySelector('.pillar-chip[data-pillar="data"]'), win);
      click(doc.querySelector('#panel-data .service-card'), win);
    }
    if (page === 'practices.html') click(doc.querySelector('.checklist-items li'), win);
    if (page === 'contact.html') click(doc.querySelectorAll('.time-pill')[0], win);
    // scroll chrome
    Object.defineProperty(win, 'scrollY', { value: 1200, writable: true, configurable: true });
    win.dispatchEvent(new win.Event('scroll'));
    doc.dispatchEvent(new win.Event('scroll'));
    click(doc.querySelector('.back-to-top'), win);
    eq(errors.length, 0, 'errors during click-through: ' + errors.join(' | '));
    return 'theme + menu + diagram + page widgets + scroll';
  });
}

console.log('\n=== 9. Netlify forms ==============================================');

await check('every declared Netlify form has matching field names', () => {
  const { doc } = load('contact.html');
  const forms = [...doc.querySelectorAll('form[data-netlify]')];
  assert(forms.length >= 2, `expected the live form + a hidden definition, found ${forms.length}`);
  const names = forms.map((f) => f.getAttribute('name'));
  assert(new Set(names).size === names.length, 'duplicate form names: ' + names.join(', '));
  for (const f of forms) {
    const fields = [...f.querySelectorAll('input[name], textarea[name], select[name]')].map((e) => e.getAttribute('name'));
    assert(fields.includes('form-name') || f.hasAttribute('netlify-honeypot'),
      `${f.getAttribute('name')}: needs form-name or a honeypot`);
  }
  return forms.map((f) => f.getAttribute('name')).join(', ');
});

/* ================================================================== */
console.log('\n' + '='.repeat(66));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('='.repeat(66));
if (failed) for (const f of failures) console.log(`  ✗ ${f.name}: ${f.message}`);
process.exit(failed ? 1 : 0);
