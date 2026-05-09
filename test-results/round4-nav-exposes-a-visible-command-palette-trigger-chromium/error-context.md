# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: round4.spec.ts >> nav exposes a visible command-palette trigger
- Location: tests\e2e\round4.spec.ts:143:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.evaluate: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-command-palette-trigger]').first()

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
  54  |   /* One of two outcomes must hold: either every facet intersects
  55  |      (empty state hidden, but filters pressed) or the empty-state
  56  |      surface appears. In either case, "Clear filters" must bring
  57  |      every card back. */
  58  |   const hasEmpty = await emptyState.isVisible().catch(() => false);
  59  |   if (hasEmpty) {
  60  |     const clearBtn = emptyState.locator('[data-facet-clear]');
  61  |     await expect(clearBtn).toBeVisible();
  62  |     await clearBtn.click();
  63  |   } else {
  64  |     /* Click each pressed facet to un-press. */
  65  |     for (let i = 0; i < facetCount; i += 1) {
  66  |       const btn = facetButtons.nth(i);
  67  |       if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
  68  |     }
  69  |   }
  70  | 
  71  |   await expect(cards.first()).toBeVisible();
  72  |   const visible = page.locator('[data-praxis-card]:not([hidden])');
  73  |   await expect.poll(async () => visible.count()).toBe(initial);
  74  | });
  75  | 
  76  | test('praxis-ask error state renders retry button on index fetch failure', async ({ page }) => {
  77  |   /* Intercept the index request with a hard failure before the page
  78  |      loads so the assistant has no cached copy to fall back on. The
  79  |      assertion is on the user-visible retry affordance, not on the
  80  |      network layer — the goal is to prove the UI surfaces a
  81  |      recoverable state rather than a silent zero-results. */
  82  |   await page.route('**/search-index.json*', (route) => {
  83  |     return route.fulfill({ status: 503, body: 'unavailable' });
  84  |   });
  85  |   await page.goto('/praxis/');
  86  |   const input = page.locator('[data-praxis-ask-input]');
  87  |   /* PraxisAsk is corpus-size gated (see PRAXIS_ASK_MIN_CORPUS in
  88  |      src/pages/praxis.astro). Skip cleanly when the component is not
  89  |      rendered so the suite survives every corpus size up to the gate. */
  90  |   if ((await input.count()) === 0) {
  91  |     test.skip(true, 'praxis-ask gated off until corpus >= PRAXIS_ASK_MIN_CORPUS');
  92  |   }
  93  |   await expect(input).toBeVisible();
  94  |   await input.fill('anything');
  95  |   const retry = page.locator('[data-praxis-ask-retry], .praxis-ask__error-retry');
  96  |   await expect(retry).toBeVisible({ timeout: 5_000 });
  97  | });
  98  | 
  99  | test('command palette traps focus — tab cycles back inside palette', async ({ page, browserName }) => {
  100 |   await page.goto(PALETTE_ROUTE);
  101 |   await page.waitForLoadState('domcontentloaded');
  102 |   await page.waitForTimeout(SETTLE_MS);
  103 |   const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
  104 |   await page.keyboard.press(`${modifier}+KeyK`);
  105 |   const palette = page.locator('#command-palette');
  106 |   await expect(palette).toBeVisible();
  107 |   const input = page.locator('[data-command-palette-input]');
  108 |   await expect(input).toBeFocused();
  109 |   /* Tab once. Focus must land inside the palette (on a close button,
  110 |      a scrollable option row, etc.). Tab-from-input must not jump to
  111 |      the backgrounded document. */
  112 |   await page.keyboard.press('Tab');
  113 |   const focusIsInsidePalette = await page.evaluate(() => {
  114 |     const root = document.getElementById('command-palette');
  115 |     return root ? root.contains(document.activeElement) : false;
  116 |   });
  117 |   expect(focusIsInsidePalette).toBe(true);
  118 |   await page.keyboard.press('Escape');
  119 |   await expect(palette).toBeHidden();
  120 | });
  121 | 
  122 | test('command palette locks background scroll while open', async ({ page, browserName }) => {
  123 |   await page.goto(PALETTE_ROUTE);
  124 |   await page.waitForLoadState('domcontentloaded');
  125 |   await page.waitForTimeout(SETTLE_MS);
  126 |   const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
  127 |   await page.keyboard.press(`${modifier}+KeyK`);
  128 |   const palette = page.locator('#command-palette');
  129 |   await expect(palette).toBeVisible();
  130 |   const state = await page.evaluate(() => ({
  131 |     overflow: window.getComputedStyle(document.documentElement).overflow,
  132 |     hasClass: document.documentElement.classList.contains('command-palette-open'),
  133 |   }));
  134 |   expect(state.hasClass).toBe(true);
  135 |   expect(state.overflow).toBe('hidden');
  136 |   await page.keyboard.press('Escape');
  137 |   const after = await page.evaluate(() =>
  138 |     document.documentElement.classList.contains('command-palette-open'),
  139 |   );
  140 |   expect(after).toBe(false);
  141 | });
  142 | 
  143 | test('nav exposes a visible command-palette trigger', async ({ page }) => {
  144 |   await page.goto(PALETTE_ROUTE);
  145 |   await page.waitForLoadState('domcontentloaded');
  146 |   await page.waitForTimeout(SETTLE_MS);
  147 |   const trigger = page.locator('[data-command-palette-trigger]').first();
  148 |   await expect(trigger).toBeVisible();
  149 |   /* Real pointer click contends with the lobby canvas on the home
  150 |      route; for this assertion we only care that the element carries
  151 |      the contract and the click handler opens the palette. Evaluating
  152 |      .click() in-page exercises the same delegated listener without
  153 |      pointer-event competition. */
> 154 |   await trigger.evaluate((el) => {
      |                 ^ Error: locator.evaluate: Test timeout of 30000ms exceeded.
  155 |     if (el instanceof HTMLElement) el.click();
  156 |   });
  157 |   const palette = page.locator('#command-palette');
  158 |   await expect(palette).toBeVisible();
  159 | });
  160 | 
  161 | test('reduced motion live toggle strips tilt transform', async ({ page }) => {
  162 |   await page.emulateMedia({ reducedMotion: 'no-preference' });
  163 |   await page.goto('/praxis/');
  164 |   await page.waitForLoadState('domcontentloaded');
  165 |   await page.waitForTimeout(SETTLE_MS);
  166 | 
  167 |   const tiltInner = page.locator('.tilt-inner').first();
  168 |   if ((await tiltInner.count()) === 0) test.skip(true, 'no tilt-inner targets on this route');
  169 | 
  170 |   const outer = page
  171 |     .locator('.lane, .preview-entry, .eng-carousel__slide, .praxis-card, .service-card-wrapper')
  172 |     .first();
  173 |   const outerBox = await outer.boundingBox();
  174 |   test.skip(!outerBox, 'outer card not laid out');
  175 |   if (!outerBox) return;
  176 |   /* Move the pointer over the card centre to wake the spring, then
  177 |      let a couple of frames settle. Flipping the motion preference
  178 |      afterwards asserts the live-subscribe path drains every tilt
  179 |      by the next rAF. */
  180 |   await page.mouse.move(outerBox.x + outerBox.width / 2, outerBox.y + outerBox.height / 2, {
  181 |     steps: 6,
  182 |   });
  183 |   await page.waitForTimeout(150);
  184 |   await page.emulateMedia({ reducedMotion: 'reduce' });
  185 |   await page.waitForTimeout(180);
  186 | 
  187 |   const transform = await tiltInner.evaluate((el) => {
  188 |     if (el instanceof HTMLElement) return el.style.transform || '';
  189 |     return '';
  190 |   });
  191 |   expect(transform).toBe('');
  192 | });
  193 | 
```