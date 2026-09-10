# AnthroPrime — Diagnosis & Fix Plan

Audit run: `node tools/qa/audit.mjs` (executes the real `assets/site.js` + each page's
real inline script in a jsdom DOM built from the real HTML files).

Site is a zero-build static site: 5 HTML pages, `assets/site.css` (1702 lines),
`assets/site.js` (1140 lines), deployed to Netlify (`netlify.toml`, `publish = "."`).

---

## Phase 0 — root cause of "diagram / content cutting out of screen"

### D1. `body { zoom: .9; width: 111.111111% }`  — `assets/site.css:1581`
Applied at `@media (min-width:961px)`, i.e. on every desktop.

* `zoom` is a legacy non-standard property. Firefox only shipped it in v126 (2024).
  In any engine that ignores it, `width:111.111111%` still applies → **body is 11.1vw
  wider than the viewport**, so content is pushed off the right edge.
* `strategic-growth-advisor.html` has **no** `body{overflow-x:hidden}` (its body rule is
  line 64 and sets only margin/font/color/background/line-height), so on that page the
  overflow produces a real horizontal scrollbar. `index/contact/practices/services` hide
  it, which masks the bug rather than fixing it.
* Where `zoom` *is* honoured, viewport units are scaled too: `.hero{min-height:100vh}`
  renders at 90% of the viewport. Only `body` was compensated
  (`min-height:111.111111vh`) — the hero was not.
* `position:fixed` descendants inherit the 0.9 scale. `assets/site.js:372` sets
  `transform: translate3d(clientX px, clientY px, 0)` on `.gh-cursor-dot` /
  `.gh-cursor-ring` from real `clientX/clientY` → **the custom cursor renders 10% short
  of the real pointer** (120px off at 1200px across) and drifts further the further from
  the origin you move.

**Fix:** delete the zoom block. Nothing else references `--ap-desktop-scale`
(verified by grep: the only `zoom` occurrence in the repo is `assets/site.css:1584`).

### D2. `.live-viz` is absolutely positioned and out of flow on 3 of 5 pages
`assets/site.css:1409`: `position:absolute; right:4%; top:50%; transform:translateY(-50%); width:min(44vw,420px)`.

`index.html:90` and `strategic-growth-advisor.html:132` override it into a real grid
column. `anthroprime_services.html`, `practices.html`, `contact.html` do **not**, so on
those three the diagram floats over the hero copy:

| page | hero copy width | diagram left edge @1280px | overlap |
|---|---|---|---|
| services | `.pillars-strip{max-width:960px}` (from 56px → 1016px) | 1280−51−420 = 809px | **207px** |
| contact | `.contact-hero-inner{max-width:760px}` (→ 816px) | 809px | **7px** (160px @1100px) |
| practices | `.prac-hero-inner{max-width:760px}` (→ 816px) | 809px | **7px** (160px @1100px) |

The card is ~620px tall (head + tabs + 1:1 stage + readout + legend + hint) and is
vertically centred on heroes that are only ~430–520px tall, so it **also spills above and
below the hero band onto the next section**.

**Fix:** promote the in-flow grid treatment to `assets/site.css` so all five pages share
it, and give the three heroes a matching two-column grid.

### D3. HUD chip rail paints over the diagram
`.site-mesh-hud` is declared twice — `assets/site.css:698` (`inset:0; padding:9rem 3rem 0`)
then `assets/site.css:1157` (`inset:auto 4% 18% auto; z-index:2`), which wins. It is
`appendChild`ed as the hero's **last** child, so it stacks above `.live-viz`.
The collision guard `.hero-diagram ~ .site-mesh-hud{display:none}` never fires: the audit
reports `.hero-diagram, .hero-orbit` matches **no element on any page** (those visuals
were replaced by `.live-viz` and the guard was never updated).

**Fix:** guard on `.live-viz` and keep the rail clear of the diagram column.

---

## Phase 1 — functional bugs

### D4. contact.html scheduler is entirely dead  ← hard failure, reproduced
```
TypeError: Cannot set properties of undefined (setting 'innerHTML')
    at updateSummary (contact.html:138)
    at HTMLDivElement.<anonymous> (contact.html:91)
    at HTMLDivElement.click (contact.html:94)
```
`dates.forEach(... pill.click())` runs at line 560, but `summaryEl`, `btnOutlook`,
`btnIcs` and `btnRequestSlot` are only *assigned* at lines 611–614. `var` hoists the name
but not the value, so `updateSummary()` dereferences `undefined`, the IIFE throws, and
**none of the remaining code runs**. Measured post-run state:

```
date pills rendered : 10      time pills rendered : 6
btnOutlook disabled : true    btnIcs disabled : true    btnRequestSlot disabled : true
```

So "Add to Outlook", "Download .ics" and "Request this slot" have no listeners and can
never be enabled. **Fix:** hoist the element lookups above the render calls.

### D5. Keyboard-inaccessible interactive lists
`practices.html` checklists toggle on `<li>` click with no `role`, `tabindex` or key
handler. Same for the index service cards (they are `<div>` with a click handler).

### D6. Navigation polish
* No `aria-expanded` / `aria-controls` on `.site-burger`.
* No focus management when the mobile menu or the service overlay opens.
* `.service-card[data-service]` cards are clickable `<div>`s with no `role="button"` or
  keyboard path.

---

## Phase 2 — cleanup

* Dead CSS: the audit flags selectors that match no element on any page —
  `.hero-diagram`, `.hero-orbit`, `.orbit-packet`, `.ap-viz*`, `.dg-ring/.dg-sweep/.dg-pack`,
  `.diagram-*`, `.ap-pointer-light`, `.count-up`, `[data-stagger]`, `[data-parallax]`,
  `.segmented`, `.float-gentle`, `.glow-pulse`.
* Dead JS: `[data-stagger]`, `[data-parallax]`, `.fade-in-up`, `.hero-diagram, .hero-orbit`
  blocks in `assets/site.js` never match anything.
* No `.gitignore`, no README content, no way to run the checks.

---

## Delivery order

1. **P0** Remove the `zoom` hack (D1).
2. **P0** Promote `.live-viz` to an in-flow grid item site-wide; fix the 3 heroes (D2).
3. **P0** Fix the HUD/diagram collision (D3).
4. **P0** Fix the contact scheduler init order (D4).
5. **P1** Accessibility + navigation (D5, D6).
6. **P2** Dead-code removal, `.gitignore`, README, `npm run qa`.

Verification after each phase: `node tools/qa/audit.mjs` (runtime + static) and
`node tools/qa/interactions.mjs` (drives the real components: theme toggle, mobile menu,
overlay open/switch/close, live-viz tabs + node detail, contact form + scheduler,
pillar tabs, checklists, nav routing on every page).

---

## Outcome

All phases delivered. Final numbers from the harness:

| | before | after |
|---|---|---|
| audit errors | 11 | **0** |
| audit warnings | 364 | **4** (all runtime-state false positives) |
| behaviour assertions (`interactions.mjs`) | — | **61 passed, 0 failed** |
| structure assertions (`structure.mjs`) | — | **50 passed, 0 failed** |
| `assets/site.css` | 1702 lines / 72,846 B | 1328 lines / 58,775 B (**−19.3%**) |
| inline `on*=` handlers | 27 | **0** |

The 111 assertions are mutation-tested. Reintroducing each of the three original
defects turns the matching check red and nothing else:

| reintroduced defect | caught by |
|---|---|
| `body{ zoom:.9; width:111.111111% }` | `interactions.mjs` — "no page uses the removed desktop zoom hack" |
| `.live-viz{ position:absolute; right:4% }` | `interactions.mjs` — "the live diagram is never absolutely positioned" |
| contact scheduler declarations moved back below `dates.forEach` | `audit.mjs` (JS_ERROR) **and** `interactions.mjs` — "contact.html boots cleanly" |

The 4 remaining warnings are not dead code: `#services-overlay.open`,
`.sched-summary strong` and `.checklist-items li.done` only exist after an
interaction, and `[data-reveal="fade"]` is a documented opt-in variant of the
reveal system that no page currently uses.

Changes by file:

* `assets/site.css` — removed the `zoom` hack; `.live-viz` is now
  `position:relative` and grid-placed; removed the HUD chip rail and three
  retired diagram systems (`.ap-viz*`, `.dg-*`, `.diagram-*` / `.hero-orbit`);
  added a document-level `overflow-x` guard.
* `assets/site.js` — `getContext('2d')` null guard; `aria-expanded` /
  `aria-controls` on the menu button; removed the dead HUD injection, the
  orphaned `.hero-diagram` / `.hero-orbit` glow block and the unused
  `.fade-in-up` / `[data-stagger]` / `[data-parallax]` utilities.
* `index.html` — service cards get `role="button"`, a tab stop and keyboard
  activation; the overlay is a real `role="dialog"` with a focus trap, focus
  restoration and `aria-hidden` management.
* `contact.html` — **scheduler init-order bug fixed** (the IIFE threw before it
  wired any listener, so all three action buttons were permanently disabled);
  hero is a two-column grid; dead `.side-card.light .side-item` rules replaced
  with the `.sla-row` equivalent that actually renders.
* `anthroprime_services.html` — 27 inline `onclick` handlers replaced with
  delegated listeners; pillar strip moved out of the copy column so it can span
  the hero; tabs get `role="tab"` + arrow-key roving tabindex; cards get
  `aria-expanded` / `aria-controls`.
* `practices.html` — checklist items are real checkboxes (`role`, `tabindex`,
  `aria-checked`, Space/Enter) with a focus ring; hero is a two-column grid.
* `strategic-growth-advisor.html` — dropped the unreachable `.on-light` and
  `.bench-grid .wide` rules.
* `tools/qa/` — the harness described above, plus `.gitignore` and this README.

Not verified: no browser engine could be installed in this environment
(`cdn.playwright.dev` and `storage.googleapis.com` are unreachable, and no
Chrome/Firefox binary is present), so **pixel-level rendering and real
`getBoundingClientRect` geometry were not measured**. The layout fixes are
verified structurally — grid placement, absence of `position:absolute`, absence
of `zoom` — by the regression guards in section 13 of `interactions.mjs`.
