# AnthroPrime Technology

Marketing site for AnthroPrime Technology — consulting across AI, data, cloud,
cybersecurity and AI infrastructure, plus Strategic Growth Advisory.

**Zero-build static site.** Plain HTML, one shared stylesheet, one shared script.
No bundler, no framework, no runtime dependencies. Deployed to Netlify.

## Pages

| File | Route | Purpose |
|---|---|---|
| `index.html` | `/` | Homepage — capabilities, services, approach, service-detail overlay |
| `anthroprime_services.html` | `/services` | Five service pillars with expandable detail panels |
| `practices.html` | `/practices` | Frameworks, maturity ladder, interactive checklists |
| `contact.html` | `/contact` | Contact form (Netlify Forms) + consultation scheduler |
| `strategic-growth-advisor.html` | `/growth-advisor` | Growth Advisory offering |

Routes are mapped in [`netlify.toml`](netlify.toml).

## Shared assets

* `assets/site.css` — site chrome: header, footer, theme tokens, page
  transitions, scroll reveal, ambient hero layers, and the live diagram card.
* `assets/site.js` — theme toggle, mobile menu, active-link detection, page
  transitions, scroll reveal, ambient canvas, custom cursor, back-to-top, and
  the live AI / cybersecurity / data diagram builder.

Every page loads both, so the chrome is identical everywhere. Per-page styling
lives in that page's own `<style>` block.

## Local development

Any static file server works:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Checks

The QA harness lives in `tools/qa` and runs the site's **real** HTML and JS in a
DOM (jsdom) — it does not reimplement any site logic.

```bash
cd tools/qa
npm install

npm run audit           # runtime errors, broken links/anchors, duplicate ids, a11y, dead code
npm test                # all three suites below
npm run test:ui         # behaviour: theme, nav, overlay, diagram, forms, scheduler
npm run test:structure  # structure: ARIA wiring, head, ids, netlify config, hero layout
npm run test:sweep      # breadth: every service, pillar, checklist, theme and viewport
npm run qa              # audit + all three suites
```

`audit` exits non-zero on any error-severity finding; both suites exit non-zero
on any failed assertion.

### What the checks cover

`tools/qa/audit.mjs`
* executes `assets/site.js` plus each page's inline script and fails on any throw
* every `a[href]`, `link`, `script[src]`, `img[src]` resolves to a file on disk
* every `href="#…"` has a matching `id` on the same page
* no duplicate element ids
* images have `alt`; form controls have a label; buttons have an accessible name
* CSS selectors and JS `querySelector` strings that match nothing on any page

`tools/qa/interactions.mjs` (61 assertions)
* all five pages boot without a runtime error
* theme toggle flips, persists to `localStorage`, syncs `aria-pressed`
* mobile menu opens, closes on Escape, closes on link click, reports `aria-expanded`
* active nav link resolves on every page, including the homepage served at `/`
* internal links play the wipe transition; external and `mailto:` links do not
* in-page anchors scroll without the wipe
* live diagram builds 6 nodes / 3 tabs / 6 metrics; tab switching, node click,
  keyboard parity, detail panel close, telemetry ticking
* service overlay opens by click and keyboard, switches pages, closes on Escape
  and returns focus to the card that opened it
* pillar tabs switch by click and arrow keys with roving tabindex
* service cards expand, accordion, and collapse
* checklists toggle by click, Space and Enter and update their counter
* contact form posts to Netlify and shows success or error state
* scheduler auto-selects a date, enables actions on slot selection, resets on
  date change, and validates name + email
* progress bar, sticky header state, back-to-top
* reduced motion disables the mesh canvas and custom cursor
* regression guards: no `zoom` hack, the diagram is never `position:absolute`,
  every hero places the diagram in a grid column, no inline `on*=` handlers

`tools/qa/structure.mjs` (58 assertions)
* every `aria-controls` / `aria-labelledby` resolves to a real id
* `role="tab"` elements live inside a `role="tablist"`; each controls a real panel
* roving tabindex leaves exactly one tab stop
* exactly one page-level `<h1>`, plus `lang`, charset, viewport, title, description
* no duplicate ids **after** the scripts run (catches JS-injected collisions)
* diagram gradient ids don't collide within a page
* every `netlify.toml` redirect target exists; `publish = "."` with no build command
* the hero each page's grid CSS targets really does contain `.live-viz` as a
  direct child — this is the guard that stops the overlay regression returning
* keyboard-operable widgets declare a `:focus-visible` style
* form controls are labelled, required fields are `required`, Netlify honeypot present

The suite is mutation-tested: reintroducing the `zoom` hack, setting `.live-viz`
back to `position:absolute`, or reverting the contact scheduler's declaration
order each turns the relevant check red.

`tools/qa/sweep.mjs` (53 assertions) — walks every instance of every repeated
component rather than a representative sample:
* all 5 pages boot in 4 configurations each — light/dark × desktop/phone,
  coarse pointer, reduced motion (20 configurations)
* all 6 homepage service detail pages render their full copy and stay in sync
  with the sidebar; all 6 switch cleanly in sequence
* all 5 service pillars render, and all 22 expandable cards open and collapse
* all 30 checklist items across 6 practice checklists toggle and reset
* nav and footer link sets are identical across all 5 pages; 76 internal links
  and every in-page anchor resolve
* all 3 diagram domains render on all 5 pages; all 18 nodes have copy
* a theme set on one page is applied before first paint on the next
* a full click-through on each page produces zero runtime errors

`tools/qa/strip-dead-css.mjs` is a maintenance script used to remove CSS whose
selectors only ever matched retired visuals. It removes a block only when
*every* selector in its list is dead.

## Design notes

**Dark mode** is applied to `<html data-theme>` by an inline snippet in each
page's `<head>` before first paint, so there is no flash of the wrong theme.
The toggle in the header writes to `localStorage` under `ap-theme` and open tabs
stay in sync via the `storage` event.

**The hero diagram is a grid item, not an overlay.** An earlier version floated
it with `position:absolute; right:4%`, which let it cover the hero copy and
spill outside the hero band. Every hero now defines a two-column grid and the
diagram occupies the right column; it hides below 961px.

**No `zoom`.** A `body{zoom:.9; width:111.111111%}` desktop-density hack used to
live in `assets/site.css`. `zoom` is a legacy property that Firefox only shipped
in v126, so engines ignoring it still applied the 111% width and pushed content
off the right edge; where it was honoured it scaled viewport units and
`position:fixed` chrome, so heroes rendered at 90% height and the custom cursor
trailed the real pointer. It is gone — do not reintroduce it.
