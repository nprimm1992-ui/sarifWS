# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: round7-dossier.spec.ts >> praxis index: facets aside and first card do not overlap at 1280
- Location: tests\e2e\round7-dossier.spec.ts:13:1

# Error details

```
Error: facets right edge should sit left of the card column

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 64
Received:    1216
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2]:
    - /url: "#main-content"
  - banner [ref=e4]:
    - navigation "Main navigation" [ref=e5]:
      - link "Sarif Consulting — Home" [ref=e6]:
        - /url: /
        - text: SARIF CONSULTING
      - list [ref=e7]:
        - listitem [ref=e8]:
          - link "About" [ref=e9]:
            - /url: /about/
        - listitem [ref=e10]:
          - link "Engagements" [ref=e11]:
            - /url: /engagements/
        - listitem [ref=e12]:
          - link "Services" [ref=e13]:
            - /url: /services/
        - listitem [ref=e14]:
          - link "Praxis" [ref=e15]:
            - /url: /praxis/
        - listitem [ref=e16]:
          - link "Contact" [ref=e17]:
            - /url: /contact/
  - main [ref=e19]:
    - region "Praxis" [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - paragraph [ref=e23]: Learn more
          - heading "Praxis" [level=1] [ref=e24]
          - generic [ref=e25]:
            - heading "Practice made public. Intelligence architecture, ethics, systems design." [level=2] [ref=e26]
            - paragraph [ref=e27]: Praxis is the Sarif publication where operational thinking, methodology in progress and architectural observations are published as they are developed — not retrofitted into polished deliverables. Each piece is an operational position that has already been tested against real engagements before it is written up. Expect a single considered release per month, not a feed.
        - complementary "Filter Praxis articles" [ref=e28]:
          - paragraph [ref=e29]: Filter
          - generic [ref=e30]:
            - paragraph [ref=e31]: lens
            - list [ref=e32]:
              - listitem [ref=e33]:
                - button "Architectural Depth" [ref=e34] [cursor=pointer]
              - listitem [ref=e35]:
                - button "Methodology" [ref=e36] [cursor=pointer]
          - generic [ref=e37]:
            - paragraph [ref=e38]: tags
            - list [ref=e39]:
              - listitem [ref=e40]:
                - button "Field Observation" [ref=e41] [cursor=pointer]
              - listitem [ref=e42]:
                - button "Methodology" [ref=e43] [cursor=pointer]
              - listitem [ref=e44]:
                - button "Operating Model" [ref=e45] [cursor=pointer]
              - listitem [ref=e46]:
                - button "Systems" [ref=e47] [cursor=pointer]
              - listitem [ref=e48]:
                - button "UCIM" [ref=e49] [cursor=pointer]
          - button "Clear all Praxis filters" [ref=e50] [cursor=pointer]: Clear filters
        - list [ref=e51]:
          - listitem [ref=e52]:
            - generic: "01"
            - link "Praxis No. 01 Apr 11, 2026 Architectural Depth One Operator, One Intelligence Layer The consulting model that eliminates coherence decay is not a larger team. It is a smaller one — with a persistent intelligence substrate underneath it." [ref=e53]:
              - /url: /praxis/one-operator-one-intelligence-layer/
              - generic [ref=e54]:
                - generic [ref=e55]: Praxis No. 01
                - time [ref=e57]: Apr 11, 2026
              - generic [ref=e58]: Architectural Depth
              - heading "One Operator, One Intelligence Layer" [level=3] [ref=e59]
              - paragraph [ref=e60]: The consulting model that eliminates coherence decay is not a larger team. It is a smaller one — with a persistent intelligence substrate underneath it.
          - listitem [ref=e62]:
            - generic: "02"
            - link "Praxis No. 02 Apr 11, 2026 Methodology What the Matrix Metabolizes UCIM is not a knowledge base. It is a digestive system. What the matrix ingests, reinforces and discards across an engagement — and why the distinction matters." [ref=e63]:
              - /url: /praxis/what-the-matrix-metabolizes/
              - generic [ref=e64]:
                - generic [ref=e65]: Praxis No. 02
                - time [ref=e67]: Apr 11, 2026
              - generic [ref=e68]: Methodology
              - heading "What the Matrix Metabolizes" [level=3] [ref=e69]
              - paragraph [ref=e70]: UCIM is not a knowledge base. It is a digestive system. What the matrix ingests, reinforces and discards across an engagement — and why the distinction matters.
  - contentinfo [ref=e72]:
    - generic [ref=e73]:
      - paragraph [ref=e74]:
        - generic [ref=e75]: © 2026 Sarif Consulting
        - generic [ref=e76]: ·
        - generic [ref=e77]: Portland, Oregon
      - generic [ref=e78]:
        - navigation "Footer navigation" [ref=e79]:
          - link "Lexicon" [ref=e80]:
            - /url: /lexicon/
          - generic [ref=e81]: ·
          - link "Privacy" [ref=e82]:
            - /url: /privacy/
          - generic [ref=e83]: ·
          - link "Terms" [ref=e84]:
            - /url: /terms/
          - generic [ref=e85]: ·
          - link "Accessibility" [ref=e86]:
            - /url: /accessibility/
        - group "Search and ambient audio" [ref=e87]:
          - button "Open search (Ctrl+K)" [ref=e88] [cursor=pointer]:
            - img [ref=e89]
            - generic [ref=e92]: ⌘K
          - button "Toggle ambient audio" [ref=e93] [cursor=pointer]:
            - generic [ref=e98]: "OFF"
            - generic [ref=e99]: "Ambient audio:"
    - region "Cookie and infrastructure notice" [ref=e100]:
      - generic [ref=e101]:
        - paragraph [ref=e102]:
          - text: Strictly necessary cookies only — no third-party advertising or behavioural tracking.
          - link "Details" [ref=e103]:
            - /url: /privacy#cookies
          - text: .
        - button "Dismiss" [ref=e104] [cursor=pointer]
  - dialog:
    - button
    - document:
      - banner:
        - generic:
          - generic:
            - generic: ❯
            - generic: NAVIGATE · SARIF
          - generic:
            - generic: ⌘
            - generic: K
        - heading [level=2]: Command
        - paragraph:
          - text: Search Praxis, Lexicon, Engagements, and pages. Press
          - generic: /
          - text: anywhere to reopen.
      - generic:
        - img
        - combobox
        - generic: ESC
      - toolbar:
        - button [pressed]:
          - generic: ◆
          - generic: All
        - button:
          - generic: P
          - generic: Praxis
        - button:
          - generic: L
          - generic: Lexicon
        - button:
          - generic: E
          - generic: Engagements
        - button:
          - generic: §
          - generic: Pages
      - contentinfo:
        - generic:
          - generic: ↑
          - generic: ↓
          - generic: navigate
        - generic:
          - generic: ⏎
          - generic: open
        - generic:
          - generic: ⌘
          - generic: ⏎
          - generic: new tab
        - generic:
          - generic: tab
          - generic: scope
        - generic:
          - generic: esc
          - generic: close
  - status
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * Round-7 — Praxis dossier smoke.
  5   |  *
  6   |  * These tests are DOM-evaluation-first (via `page.evaluate`) to avoid
  7   |  * the known flakiness on this repo where Playwright's actionability
  8   |  * checks interact poorly with the WebGL lobby and sticky layouts. We
  9   |  * assert structural invariants (geometry, presence, session state)
  10  |  * that compile to plain JS reads against the document.
  11  |  */
  12  | 
  13  | test('praxis index: facets aside and first card do not overlap at 1280', async ({ page }) => {
  14  |   /* `load` lets the WebGL lobby scene start its rAF loop before we
  15  |      evaluate DOM geometry; `domcontentloaded` can race the module
  16  |      graph and leave evaluate() stalled behind paint work. */
  17  |   test.setTimeout(60_000);
  18  |   await page.setViewportSize({ width: 1280, height: 900 });
  19  |   await page.goto('/praxis/', { waitUntil: 'load' });
  20  |   await page.waitForTimeout(1200);
  21  | 
  22  |   const geometry = await page.evaluate(() => {
  23  |     const facets = document.querySelector('.praxis__facets');
  24  |     const card = document.querySelector('[data-praxis-card]');
  25  |     if (!facets || !card) {
  26  |       return { facetsPresent: Boolean(facets), cardPresent: Boolean(card) };
  27  |     }
  28  |     const facetsRect = facets.getBoundingClientRect();
  29  |     const cardRect = card.getBoundingClientRect();
  30  |     return {
  31  |       facetsPresent: true,
  32  |       cardPresent: true,
  33  |       facetsRight: facetsRect.right,
  34  |       cardLeft: cardRect.left,
  35  |       facetsWidth: facetsRect.width,
  36  |       cardWidth: cardRect.width,
  37  |     };
  38  |   });
  39  | 
  40  |   expect(geometry.facetsPresent, 'facets element must render').toBe(true);
  41  |   expect(geometry.cardPresent, 'first card must render').toBe(true);
  42  |   if (!geometry.facetsRight || !geometry.cardLeft) return;
  43  |   expect(
  44  |     geometry.facetsRight,
  45  |     'facets right edge should sit left of the card column',
> 46  |   ).toBeLessThanOrEqual(geometry.cardLeft);
      |     ^ Error: facets right edge should sit left of the card column
  47  | });
  48  | 
  49  | test('praxis article: dossier case renders all chrome regions', async ({ page }) => {
  50  |   /* Same posture as the runtime-state test: `load` + dwell gives the
  51  |      WebGL scene and inline module script time to settle. */
  52  |   test.setTimeout(60_000);
  53  |   await page.goto('/praxis/one-operator-one-intelligence-layer/', { waitUntil: 'load' });
  54  |   await page.waitForTimeout(1200);
  55  | 
  56  |   const present = await page.evaluate(() => {
  57  |     const q = (sel: string) => Boolean(document.querySelector(sel));
  58  |     const headerText =
  59  |       document.querySelector('.praxis-case__header')?.textContent?.trim() ?? '';
  60  |     return {
  61  |       case: q('[data-praxis-case]'),
  62  |       header: q('.praxis-case__header'),
  63  |       headerTime: q('.praxis-case__header time'),
  64  |       headerHasPraxisRef: /PRX-\s*\d{2}/i.test(headerText),
  65  |       title: q('.praxis-case__title'),
  66  |       hero: q('.praxis-case__hero'),
  67  |       sealEmblem: q('.praxis-case__seal-emblem'),
  68  |       footer: q('.praxis-case__footer'),
  69  |     };
  70  |   });
  71  | 
  72  |   expect(present.case, 'praxis-case wrapper').toBe(true);
  73  |   expect(present.header, 'praxis-case__header').toBe(true);
  74  |   expect(present.headerTime, 'published date in case header').toBe(true);
  75  |   expect(present.headerHasPraxisRef, 'PRX ref in case header').toBe(true);
  76  |   expect(present.title, 'praxis-case__title').toBe(true);
  77  |   expect(present.hero, 'praxis-case__hero').toBe(true);
  78  |   expect(present.sealEmblem, 'praxis-case__seal-emblem').toBe(true);
  79  |   expect(present.footer, 'praxis-case__footer').toBe(true);
  80  | });
  81  | 
  82  | test('praxis article: dossier runtime reaches opened state', async ({ page }) => {
  83  |   /* Three navigations through the WebGL-heavy lobby plus 1.5s dwell
  84  |      after each exceeds the 30s default. 90s gives headroom without
  85  |      inviting drift. */
  86  |   test.setTimeout(90_000);
  87  | 
  88  |   /* Force reduced-motion off so the full cinematic path runs — this
  89  |      test asserts end state, not the specific animation stages. On
  90  |      browsers with reduce enabled the else-branch fires instead; we
  91  |      accept either path since both terminate at 'open'. */
  92  |   await page.emulateMedia({ reducedMotion: 'no-preference' });
  93  | 
  94  |   const slug = 'one-operator-one-intelligence-layer';
  95  |   /* `load` ensures all module scripts (including the lobby scene)
  96  |      have had a chance to start. DOMContentLoaded races the Astro
  97  |      module loader on this repo. */
  98  |   await page.goto(`/praxis/${slug}/`, { waitUntil: 'load' });
  99  |   await page.waitForTimeout(1500);
  100 | 
  101 |   const firstVisit = await page.evaluate(() => {
  102 |     return document
  103 |       .querySelector('[data-praxis-case]')
  104 |       ?.getAttribute('data-praxis-open') ?? null;
  105 |   });
  106 |   expect(firstVisit, 'first visit should resolve the case into an opened state').toBe('open');
  107 | 
  108 |   /* Revisit: attribute must still end at 'open' regardless of path.
  109 |      The session flag only writes on the cinematic path; we therefore
  110 |      only assert the final state (both paths converge on 'open'). */
  111 |   await page.goto('/praxis/', { waitUntil: 'load' });
  112 |   await page.goto(`/praxis/${slug}/`, { waitUntil: 'load' });
  113 |   await page.waitForTimeout(1500);
  114 | 
  115 |   const revisit = await page.evaluate(() => {
  116 |     return document
  117 |       .querySelector('[data-praxis-case]')
  118 |       ?.getAttribute('data-praxis-open') ?? null;
  119 |   });
  120 |   expect(revisit, 'revisit should also resolve the case into an opened state').toBe('open');
  121 | });
  122 | 
```