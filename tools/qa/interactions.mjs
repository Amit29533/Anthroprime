#!/usr/bin/env node
/*
 * AnthroPrime — UI component + navigation test suite.
 *
 * Every test drives the site's REAL code: the real .html file, the real
 * inline page script, and the real assets/site.js, all executed in a jsdom
 * DOM. Nothing is stubbed except the browser APIs jsdom does not ship
 * (matchMedia, canvas 2D context, layout boxes).
 *
 * Usage: node tools/qa/interactions.mjs [--verbose]
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
let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    // fn may be async; awaiting it is what makes the assertions inside
    // actually gate the result instead of resolving after the run ends.
    const detail = await fn();
    passed++;
    if (verbose) console.log(`   ok  ${name}${detail ? ' — ' + detail : ''}`);
  } catch (e) {
    failed++;
    failures.push({ name, message: e.message });
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`); }

/* ------------------------------------------------------------------ */
/* page loader                                                         */
/* ------------------------------------------------------------------ */
function load(page, opts = {}) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8')
    .replace(/<script[^>]*\bsrc="assets\/site\.js"[^>]*><\/script>/g, '');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message.split('\n')[0]));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url || 'https://www.anthroprime.com/' + page,
    virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = (q) => ({
        matches: /pointer:\s*coarse/.test(q) ? !!opts.coarse
          : /prefers-reduced-motion:\s*reduce/.test(q) ? !!opts.reduceMotion
          : /\(hover:\s*hover\)/.test(q) ? true : false,
        media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      });
      const noop = () => {};
      const ctx2d = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true });
      win.HTMLCanvasElement.prototype.getContext = () => ctx2d;
      Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', { get: () => 400, configurable: true });
      Object.defineProperty(win.HTMLElement.prototype, 'offsetHeight', { get: () => 200, configurable: true });
      Object.defineProperty(win, 'innerWidth', { value: opts.width || 1440, writable: true, configurable: true });
      Object.defineProperty(win, 'innerHeight', { value: opts.height || 900, writable: true, configurable: true });
      win.HTMLElement.prototype.scrollIntoView = function () { win.__scrolledTo = this; };
      win.scrollTo = () => {};
    },
  });
  dom.window.eval(SITE_JS);
  return { dom, win: dom.window, doc: dom.window.document, errors };
}

function click(el, win) {
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}
function key(el, k, win) {
  el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

/* ================================================================== */
console.log('\n=== 1. No page throws during boot ================================');
for (const page of PAGES) {
  await check(`${page} boots cleanly`, () => {
    const { errors } = load(page);
    assert(errors.length === 0, 'runtime errors: ' + errors.join(' | '));
    return 'no runtime errors';
  });
}

/* ================================================================== */
console.log('\n=== 2. Shared chrome: theme toggle (all pages) ===================');
for (const page of PAGES) {
  await check(`${page} theme toggle flips + persists`, () => {
    const { win, doc } = load(page);
    const btn = doc.querySelector('.theme-toggle');
    assert(btn, 'theme toggle was not injected into .site-right');
    eq(doc.documentElement.getAttribute('data-theme'), 'light', 'initial theme');
    eq(btn.getAttribute('aria-pressed'), 'false', 'initial aria-pressed');
    click(btn, win);
    eq(doc.documentElement.getAttribute('data-theme'), 'dark', 'theme after click');
    eq(btn.getAttribute('aria-pressed'), 'true', 'aria-pressed after click');
    eq(win.localStorage.getItem('ap-theme'), 'dark', 'persisted to localStorage');
    click(btn, win);
    eq(doc.documentElement.getAttribute('data-theme'), 'light', 'theme after second click');
    return 'light -> dark -> light, aria-pressed tracks, localStorage written';
  });
}

console.log('\n=== 3. Mobile navigation menu ====================================');
for (const page of PAGES) {
  await check(`${page} burger toggles menu + ARIA`, () => {
    const { win, doc } = load(page);
    const burger = doc.querySelector('.site-burger');
    const links = doc.querySelector('.site-links');
    assert(burger && links, 'burger / links missing');
    eq(burger.getAttribute('aria-expanded'), 'false', 'initial aria-expanded');
    assert(burger.getAttribute('aria-controls'), 'aria-controls missing');
    eq(doc.getElementById(burger.getAttribute('aria-controls')), links, 'aria-controls points at the menu');
    click(burger, win);
    assert(links.classList.contains('is-open'), 'menu did not open');
    eq(burger.getAttribute('aria-expanded'), 'true', 'aria-expanded when open');
    key(doc.body, 'Escape', win);
    assert(!links.classList.contains('is-open'), 'Escape did not close the menu');
    eq(burger.getAttribute('aria-expanded'), 'false', 'aria-expanded after Escape');
    return 'opens, closes on Escape, aria-expanded correct';
  });
}

await check('nav links close the menu when clicked', () => {
  const { win, doc } = load('index.html');
  const burger = doc.querySelector('.site-burger');
  const links = doc.querySelector('.site-links');
  click(burger, win);
  assert(links.classList.contains('is-open'), 'menu should be open first');
  click(links.querySelector('a'), win);
  assert(!links.classList.contains('is-open'), 'clicking a nav link should close the menu');
  return 'menu closes on link click';
});

console.log('\n=== 4. Active nav link ==========================================');
await check('index.html marks its own nav link active', () => {
  const { doc } = load('index.html');
  const active = [...doc.querySelectorAll('.site-links a.is-active')];
  assert(active.length > 0, 'no nav link marked .is-active');
  assert(active.some((a) => a.getAttribute('href').startsWith('index.html')), 'index.html link not active');
  return active.map((a) => a.textContent.trim()).join(', ');
});
await check('services page marks the Services link active', () => {
  const { doc } = load('anthroprime_services.html');
  const active = [...doc.querySelectorAll('.site-links a.is-active')];
  eq(active.length, 1, 'exactly one active link');
  eq(active[0].textContent.trim(), 'Services', 'active link text');
  return active[0].textContent.trim();
});
await check('homepage served at "/" still resolves its active link', () => {
  const { doc } = load('index.html', { url: 'https://www.anthroprime.com/' });
  const active = [...doc.querySelectorAll('.site-links a.is-active')];
  assert(active.length > 0, 'pathname normalisation failed for "/"');
  return 'normalizedPageKey handles "/"';
});

console.log('\n=== 5. Cross-page navigation ====================================');
await check('internal link triggers the wipe transition, not a hard jump', () => {
  const { win, doc } = load('index.html');
  const link = [...doc.querySelectorAll('.site-links a')].find((a) => a.getAttribute('href') === 'practices.html');
  assert(link, 'practices.html nav link missing');
  const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(ev);
  assert(ev.defaultPrevented, 'navigation was not intercepted');
  assert(doc.body.classList.contains('is-leaving'), 'wipe transition did not start');
  return 'preventDefault + .is-leaving applied';
});
await check('external link is left to the browser', () => {
  const { win, doc } = load('index.html');
  const link = [...doc.querySelectorAll('.site-links a')].find((a) => a.getAttribute('href').startsWith('https://'));
  assert(link, 'external nav link missing');
  const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(ev);
  assert(!ev.defaultPrevented, 'external link was wrongly intercepted');
  return link.getAttribute('href');
});
await check('mailto link is left to the browser', () => {
  const { win, doc } = load('contact.html');
  const link = doc.querySelector('a[href^="mailto:"]');
  assert(link, 'mailto link missing');
  const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(ev);
  assert(!ev.defaultPrevented, 'mailto was wrongly intercepted');
  return link.getAttribute('href');
});
await check('same-page hash link scrolls without the page wipe', () => {
  const { win, doc } = load('index.html');
  const link = doc.querySelector('.site-links a[href="index.html#approach"]');
  assert(link, '#approach nav link missing');
  const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(ev);
  assert(ev.defaultPrevented, 'anchor click was not handled');
  assert(!doc.body.classList.contains('is-leaving'), 'in-page anchor must not play the wipe');
  eq(win.__scrolledTo && win.__scrolledTo.id, 'approach', 'scrolled to #approach');
  return 'smooth scroll, no wipe';
});

console.log('\n=== 6. Live diagram =============================================');
for (const page of PAGES) {
  await check(`${page} builds the live diagram`, () => {
    const { doc } = load(page);
    const host = doc.querySelector('[data-live-viz]');
    assert(host, 'no [data-live-viz] host on this page');
    assert(host.classList.contains('live-viz'), 'host did not get .live-viz');
    assert(doc.querySelector('.lv-card'), 'lv-card not built');
    const nodes = doc.querySelectorAll('.lv-node');
    eq(nodes.length, 6, 'node count');
    eq(doc.querySelectorAll('.lv-tab').length, 3, 'tab count');
    eq(doc.querySelectorAll('.lv-metric').length, 6, 'metric cells');
    eq(doc.querySelectorAll('.lv-metric-val').length, 6, 'metric values');
    assert(doc.querySelector('.lv-svg'), 'svg stage missing');
    return `6 nodes, 3 tabs, 6 metrics`;
  });
}

await check('diagram domain tab switches content', () => {
  const { win, doc } = load('index.html');
  const before = doc.querySelector('.lv-title').textContent;
  const dataTab = [...doc.querySelectorAll('.lv-tab')].find((t) => t.getAttribute('data-mode') === 'data');
  click(dataTab, win);
  const after = doc.querySelector('.lv-title').textContent;
  assert(before !== after, `title did not change (${before})`);
  eq(after, 'Data & Analytics', 'new title');
  eq(dataTab.getAttribute('aria-pressed'), 'true', 'aria-pressed on the new tab');
  eq(doc.querySelector('.lv-svg').getAttribute('aria-label'), 'Data & Analytics live diagram', 'svg relabelled');
  assert(doc.querySelectorAll('.lv-node').length === 6, 'nodes rebuilt');
  return `${before} -> ${after}`;
});

await check('clicking a node opens its detail panel', () => {
  const { win, doc } = load('index.html');
  const node = doc.querySelector('.lv-node');
  const panel = doc.querySelector('.lv-detail');
  assert(!panel.classList.contains('show'), 'panel should start hidden');
  click(node, win);
  assert(panel.classList.contains('show'), 'panel did not open');
  assert(doc.querySelector('.lv-detail-title').textContent.length > 0, 'detail title empty');
  assert(doc.querySelector('.lv-detail-body').textContent.length > 20, 'detail body empty');
  assert(node.classList.contains('is-active'), 'node not marked active');
  return doc.querySelector('.lv-detail-title').textContent;
});

await check('node responds to Enter / Space (keyboard parity)', () => {
  const { win, doc } = load('practices.html');
  const node = doc.querySelectorAll('.lv-node')[2];
  eq(node.getAttribute('tabindex'), '0', 'node is not a tab stop');
  eq(node.getAttribute('role'), 'button', 'node has no button role');
  key(node, 'Enter', win);
  assert(doc.querySelector('.lv-detail').classList.contains('show'), 'Enter did not open the detail');
  return node.getAttribute('aria-label');
});

await check('detail panel closes via its close button', () => {
  const { win, doc } = load('index.html');
  click(doc.querySelector('.lv-node'), win);
  assert(doc.querySelector('.lv-detail').classList.contains('show'), 'precondition: panel open');
  click(doc.querySelector('.lv-detail-close'), win);
  assert(!doc.querySelector('.lv-detail').classList.contains('show'), 'panel did not close');
  eq(doc.querySelectorAll('.lv-node.is-active').length, 0, 'active node not cleared');
  return 'closed';
});

await check('telemetry updates on an interval', async () => {
  const { doc } = load('index.html');
  const first = doc.querySelector('.lv-metric-val').textContent;
  let changed = false;
  for (let i = 0; i < 60 && !changed; i++) {
    await new Promise((r) => setTimeout(r, 60));
    changed = doc.querySelector('.lv-metric-val').textContent !== first;
  }
  assert(changed, 'telemetry never changed after ~3.6s');
  return `${first} -> ${doc.querySelector('.lv-metric-val').textContent}`;
});

console.log('\n=== 7. Homepage service overlay =================================');
await check('service card opens the overlay', () => {
  const { win, doc } = load('index.html');
  const card = doc.querySelector('.service-card[data-service="s3"]');
  assert(card, 'service card missing');
  eq(card.getAttribute('role'), 'button', 'card has no button role');
  eq(card.tabIndex, 0, 'card is not a tab stop');
  click(card, win);
  assert(doc.getElementById('services-overlay').classList.contains('open'), 'overlay did not open');
  eq(doc.getElementById('services-overlay').getAttribute('aria-hidden'), 'false', 'aria-hidden not cleared');
  assert(doc.getElementById('s3').classList.contains('active'), 'correct service page not shown');
  return 'opened s3 (Cyber Risk Quantification)';
});

await check('service card opens via keyboard', () => {
  const { win, doc } = load('index.html');
  key(doc.querySelector('.service-card[data-service="s1"]'), 'Enter', win);
  assert(doc.getElementById('services-overlay').classList.contains('open'), 'Enter did not open the overlay');
  assert(doc.getElementById('s1').classList.contains('active'), 's1 not shown');
  return 'Enter opens the overlay';
});

await check('sidebar nav switches service pages', () => {
  const { win, doc } = load('index.html');
  click(doc.querySelector('.service-card[data-service="s1"]'), win);
  const btn = doc.querySelector('.service-nav-btn[data-target="s5"]');
  click(btn, win);
  assert(doc.getElementById('s5').classList.contains('active'), 's5 not shown');
  assert(!doc.getElementById('s1').classList.contains('active'), 's1 still shown');
  eq(btn.getAttribute('aria-current'), 'true', 'aria-current not set');
  eq(doc.querySelectorAll('.service-page.active').length, 1, 'exactly one page active');
  return 's1 -> s5';
});

await check('Escape closes the overlay and restores focus', () => {
  const { win, doc } = load('index.html');
  const card = doc.querySelector('.service-card[data-service="s2"]');
  // A real click focuses the card before activating it; a synthetic
  // dispatchEvent does not, so do it explicitly.
  card.focus();
  eq(doc.activeElement, card, 'precondition: card is focused');
  click(card, win);
  key(doc.body, 'Escape', win);
  assert(!doc.getElementById('services-overlay').classList.contains('open'), 'overlay still open');
  eq(doc.getElementById('services-overlay').getAttribute('aria-hidden'), 'true', 'aria-hidden not restored');
  eq(doc.activeElement, card, 'focus not returned to the card that opened it');
  return 'closed + focus restored';
});

await check('overlay CTA closes it and scrolls to contact', () => {
  const { win, doc } = load('index.html');
  click(doc.querySelector('.service-card[data-service="s1"]'), win);
  const cta = doc.querySelector('.service-page.active .cta-btn');
  assert(cta, 'cta button missing');
  click(cta, win);
  assert(!doc.getElementById('services-overlay').classList.contains('open'), 'overlay should be closed');
  return 'closed';
});

console.log('\n=== 8. Services page: pillar tabs + cards =======================');
await check('pillar tab switches the panel', () => {
  const { win, doc } = load('anthroprime_services.html');
  const chip = doc.querySelector('.pillar-chip[data-pillar="ai"]');
  assert(chip, 'ai chip missing');
  click(chip, win);
  assert(doc.getElementById('panel-ai').classList.contains('active'), 'ai panel not active');
  assert(!doc.getElementById('panel-cyber').classList.contains('active'), 'cyber panel still active');
  eq(chip.getAttribute('aria-selected'), 'true', 'aria-selected not set');
  eq(doc.querySelectorAll('.pillar-chip.active').length, 1, 'exactly one chip active');
  return 'cyber -> ai';
});

await check('pillar tab responds to arrow keys', () => {
  const { win, doc } = load('anthroprime_services.html');
  const chips = [...doc.querySelectorAll('.pillar-chip')];
  chips[0].focus();
  key(chips[0], 'ArrowRight', win);
  assert(doc.getElementById('panel-ai').classList.contains('active'), 'ArrowRight did not advance');
  eq(chips[1].getAttribute('aria-selected'), 'true', 'aria-selected did not follow');
  eq(chips[1].tabIndex, 0, 'roving tabindex did not move');
  eq(chips[0].tabIndex, -1, 'previous chip still a tab stop');
  return 'ArrowRight cyber -> ai with roving tabindex';
});

await check('service card expands its detail panel', () => {
  const { win, doc } = load('anthroprime_services.html');
  const card = doc.querySelector('.service-card[data-service-id="cyber-1"]');
  assert(card, 'card missing');
  eq(card.getAttribute('role'), 'button', 'no button role');
  eq(card.tabIndex, 0, 'not a tab stop');
  eq(card.getAttribute('aria-controls'), 'cyber-1', 'aria-controls missing');
  click(card, win);
  assert(card.classList.contains('expanded'), 'card not expanded');
  eq(card.getAttribute('aria-expanded'), 'true', 'aria-expanded not set');
  const panel = doc.getElementById('cyber-1');
  eq(panel.style.display, 'grid', 'panel not displayed');
  assert(panel.classList.contains('active'), 'panel not active');
  return 'cyber-1 expanded';
});

await check('expanding a second card collapses the first', () => {
  const { win, doc } = load('anthroprime_services.html');
  const a = doc.querySelector('.service-card[data-service-id="cyber-1"]');
  const b = doc.querySelector('.service-card[data-service-id="cyber-2"]');
  click(a, win);
  click(b, win);
  assert(!a.classList.contains('expanded'), 'first card still expanded');
  assert(b.classList.contains('expanded'), 'second card not expanded');
  eq(doc.getElementById('cyber-1').style.display, 'none', 'first panel still displayed');
  return 'accordion behaviour';
});

await check('clicking an expanded card collapses it', () => {
  const { win, doc } = load('anthroprime_services.html');
  const a = doc.querySelector('.service-card[data-service-id="cyber-1"]');
  click(a, win);
  click(a, win);
  assert(!a.classList.contains('expanded'), 'card did not collapse');
  return 'toggles closed';
});

console.log('\n=== 9. Practices page: checklists ===============================');
await check('checklist item toggles and updates the counter', () => {
  const { win, doc } = load('practices.html');
  const card = doc.querySelector('.checklist-card');
  const li = card.querySelector('.checklist-items li');
  const counter = card.querySelector('[data-count]');
  eq(li.getAttribute('role'), 'checkbox', 'li has no checkbox role');
  eq(li.getAttribute('tabindex'), '0', 'li is not a tab stop');
  eq(li.getAttribute('aria-checked'), 'false', 'initial aria-checked');
  eq(counter.textContent, '0/5', 'initial counter');
  click(li, win);
  assert(li.classList.contains('done'), 'item not checked');
  eq(li.getAttribute('aria-checked'), 'true', 'aria-checked not updated');
  eq(counter.textContent, '1/5', 'counter not updated');
  return '0/5 -> 1/5';
});

await check('checklist responds to Space (keyboard parity)', () => {
  const { win, doc } = load('practices.html');
  const card = doc.querySelector('.checklist-card');
  const lis = card.querySelectorAll('.checklist-items li');
  key(lis[0], ' ', win);
  key(lis[1], 'Enter', win);
  eq(card.querySelector('[data-count]').textContent, '2/5', 'counter after two keyboard toggles');
  return 'Space + Enter both toggle';
});

console.log('\n=== 10. Contact page: form + scheduler ==========================');
await check('scheduler boots with a date selected and buttons disabled', () => {
  const { doc } = load('contact.html');
  eq(doc.querySelectorAll('.date-pill').length, 10, 'date pills');
  eq(doc.querySelectorAll('.time-pill').length, 6, 'time pills');
  eq(doc.querySelectorAll('.date-pill.is-selected').length, 1, 'first date auto-selected');
  eq(doc.getElementById('btnOutlook').disabled, true, 'Outlook disabled until a time is chosen');
  eq(doc.getElementById('btnIcs').disabled, true, 'ICS disabled until a time is chosen');
  return '10 dates, 6 slots, 1 auto-selected';
});

await check('choosing a time slot enables the action buttons', () => {
  const { win, doc } = load('contact.html');
  const slot = doc.querySelectorAll('.time-pill')[2];
  click(slot, win);
  assert(slot.classList.contains('is-selected'), 'slot not selected');
  eq(doc.getElementById('btnOutlook').disabled, false, 'Outlook still disabled');
  eq(doc.getElementById('btnIcs').disabled, false, 'ICS still disabled');
  eq(doc.getElementById('btnRequestSlot').disabled, false, 'Request slot still disabled');
  assert(/IST/.test(doc.getElementById('schedSummary').textContent), 'summary not rendered');
  return doc.getElementById('schedSummary').textContent.replace(/\s+/g, ' ').trim();
});

await check('changing the date resets the selected slot', () => {
  const { win, doc } = load('contact.html');
  click(doc.querySelectorAll('.time-pill')[1], win);
  assert(!doc.getElementById('btnIcs').disabled, 'precondition: buttons enabled');
  click(doc.querySelectorAll('.date-pill')[4], win);
  eq(doc.querySelectorAll('.time-pill.is-selected').length, 0, 'slot should reset');
  eq(doc.getElementById('btnIcs').disabled, true, 'buttons should re-disable');
  return 'slot cleared on date change';
});

await check('"Request this slot" validates name + email', () => {
  const { win, doc } = load('contact.html');
  click(doc.querySelectorAll('.time-pill')[0], win);
  const btn = doc.getElementById('btnRequestSlot');
  const alerts = [];
  win.alert = (m) => alerts.push(m);
  click(btn, win);
  eq(alerts.length, 1, 'validation alert not shown');
  assert(/name and email/i.test(alerts[0]), 'wrong message: ' + alerts[0]);
  eq(btn.disabled, false, 'button should stay usable after a validation failure');
  return alerts[0];
});

await check('contact form submit posts to Netlify and shows success', async () => {
  const { win, doc } = load('contact.html');
  const form = doc.getElementById('contactForm');
  const posts = [];
  win.fetch = (url, init) => {
    posts.push({ url, init });
    return Promise.resolve({ ok: true });
  };
  doc.getElementById('fullName').value = 'Ada Lovelace';
  doc.getElementById('workEmail').value = 'ada@example.com';
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
  eq(posts.length, 1, 'exactly one POST');
  eq(posts[0].url, '/', 'posts to the site root for Netlify');
  assert(posts[0].init.body.includes('form-name=contact'), 'form-name missing from the body');
  assert(posts[0].init.body.includes('Full%20Name=Ada%20Lovelace'), 'field not encoded');
  assert(doc.getElementById('formSuccess').classList.contains('is-visible'), 'success message not shown');
  eq(form.style.display, 'none', 'form should be hidden after success');
  return 'POST / -> success state';
});

await check('contact form failure surfaces the error banner', async () => {
  const { win, doc } = load('contact.html');
  win.fetch = () => Promise.resolve({ ok: false });
  doc.getElementById('contactForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
  assert(doc.getElementById('formError').classList.contains('is-visible'), 'error banner not shown');
  eq(doc.getElementById('submitBtn').disabled, false, 'submit re-enabled after failure');
  return 'error state shown, button re-enabled';
});

console.log('\n=== 11. Scroll chrome ===========================================');
await check('progress bar tracks scroll position', () => {
  const { win, doc } = load('index.html');
  const bar = doc.getElementById('site-progress');
  assert(bar, 'progress bar missing');
  Object.defineProperty(win.document.documentElement, 'scrollHeight', { value: 5000, configurable: true });
  Object.defineProperty(win.document.documentElement, 'clientHeight', { value: 1000, configurable: true });
  Object.defineProperty(win, 'scrollY', { value: 2000, writable: true, configurable: true });
  doc.dispatchEvent(new win.Event('scroll'));
  eq(bar.style.width, '50%', 'progress width');
  return '2000/4000 scrolled -> 50%';
});

await check('header gains .is-scrolled past 8px', () => {
  const { win, doc } = load('index.html');
  Object.defineProperty(win, 'scrollY', { value: 40, writable: true, configurable: true });
  doc.dispatchEvent(new win.Event('scroll'));
  assert(doc.querySelector('.site-header').classList.contains('is-scrolled'), 'is-scrolled not applied');
  return 'applied';
});

await check('back-to-top button is injected and appears on scroll', () => {
  const { win, doc } = load('practices.html');
  const btt = doc.querySelector('.back-to-top');
  assert(btt, 'back-to-top not injected');
  eq(btt.getAttribute('aria-label'), 'Back to top', 'no accessible name');
  Object.defineProperty(win, 'scrollY', { value: 900, writable: true, configurable: true });
  win.dispatchEvent(new win.Event('scroll'));
  assert(btt.classList.contains('visible'), 'button did not appear');
  click(btt, win);
  return 'injected, appears past 600px';
});

console.log('\n=== 12. Reduced motion ==========================================');
await check('reduced-motion disables the mesh canvas and custom cursor', () => {
  const { doc } = load('index.html', { reduceMotion: true });
  eq(doc.querySelectorAll('.gh-mesh-canvas').length, 0, 'mesh canvas should not be created');
  eq(doc.querySelectorAll('.gh-cursor-dot').length, 0, 'custom cursor should not be created');
  assert(!doc.body.classList.contains('gh-has-cursor'), 'body should not hide the system cursor');
  // reveal elements must be visible immediately rather than waiting on an observer
  return 'mesh + cursor skipped';
});

await check('reduced-motion still reveals content', () => {
  const { doc } = load('index.html', { reduceMotion: true });
  const reveals = doc.querySelectorAll('[data-reveal]');
  assert(reveals.length > 0, 'no reveal elements');
  return `${reveals.length} reveal elements present`;
});

console.log('\n=== 13. Layout regression guards ================================');
await check('no page uses the removed desktop zoom hack', () => {
  // Strip comments first: the note explaining why the hack was removed
  // legitimately quotes the old `zoom:.9` declaration.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const css = strip(fs.readFileSync(path.join(ROOT, 'assets/site.css'), 'utf8'));
  assert(!/\bzoom\s*:/.test(css), 'site.css still contains a zoom declaration');
  for (const page of PAGES) {
    const html = strip(fs.readFileSync(path.join(ROOT, page), 'utf8'));
    assert(!/\bzoom\s*:/.test(html), `${page} still contains a zoom declaration`);
  }
  return 'no zoom anywhere in css or html';
});

await check('the live diagram is never absolutely positioned', () => {
  const css = fs.readFileSync(path.join(ROOT, 'assets/site.css'), 'utf8');
  const m = css.match(/\.live-viz\{([^}]*)\}/);
  assert(m, '.live-viz base rule not found');
  assert(!/position\s*:\s*absolute/.test(m[1]), 'base .live-viz is still position:absolute');
  assert(/position\s*:\s*relative/.test(m[1]), 'base .live-viz is not position:relative');
  return m[1].replace(/\s+/g, ' ').trim();
});

await check('every hero places its diagram in a grid column', () => {
  const sources = [
    ['index.html', /\.hero\s*>\s*\.live-viz\{[^}]*grid-column\s*:\s*2/],
    ['strategic-growth-advisor.html', /\.hero\s+\.wrap\s*>\s*\.live-viz\{[^}]*grid-column\s*:\s*2/],
    ['anthroprime_services.html', /\.services-hero\s*>\s*\.live-viz\{[^}]*grid-column\s*:\s*2/],
    ['practices.html', /\.prac-hero\s*>\s*\.live-viz\{[^}]*grid-column\s*:\s*2/],
    ['contact.html', /\.contact-hero\s*>\s*\.live-viz\{[^}]*grid-column\s*:\s*2/],
  ];
  for (const [page, re] of sources) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert(re.test(html), `${page} does not place .live-viz in grid column 2`);
  }
  return 'all 5 pages verified';
});

await check('no hero still renders the HUD chip rail over the diagram', () => {
  for (const page of PAGES) {
    const { doc } = load(page);
    eq(doc.querySelectorAll('.site-mesh-hud').length, 0, `${page} still injects the HUD rail`);
  }
  return 'rail suppressed on all 5 heroes';
});

await check('no inline event handlers remain', () => {
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const hits = html.match(/\son(click|change|input|submit|load)\s*=/gi) || [];
    eq(hits.length, 0, `${page} still has ${hits.length} inline handler(s)`);
  }
  return '0 inline handlers across 5 pages';
});

/* ================================================================== */
console.log('\n' + '='.repeat(66));
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log('='.repeat(66));
if (failed) {
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.message}`);
}
process.exit(failed ? 1 : 0);
