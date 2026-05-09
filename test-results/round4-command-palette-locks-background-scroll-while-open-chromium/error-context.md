# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: round4.spec.ts >> command palette locks background scroll while open
- Location: tests\e2e\round4.spec.ts:122:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: keyboard.press: Test timeout of 30000ms exceeded.
```

# Test source

```ts
  27  |  *   settle buffer is sufficient for the palette bind-point.
  28  |  * - The palette-triggered tests use `/praxis/` instead of `/` so
  29  |  *   WebGL lobby canvas capture doesn't interfere with pointer
  30  |  *   input. Both pages host the same CommandPalette component via
  31  |  *   Base.astro.
  32  |  * - Each test is independent and resets with a fresh page.goto.
  33  |  */
  34  | 
  35  | const PALETTE_ROUTE = '/praxis/';
  36  | const SETTLE_MS = 300;
  37  | 
  38  | test('praxis empty-state clear restores every card', async ({ page }) => {
  39  |   await page.goto('/praxis/');
  40  |   const emptyState = page.locator('#praxis-empty-state');
  41  |   const cards = page.locator('[data-praxis-card]');
  42  |   const initial = await cards.count();
  43  |   test.skip(initial < 2, 'need at least two cards to exercise facets');
  44  | 
  45  |   /* Toggle every facet button so the intersection is guaranteed
  46  |      non-empty only under the "Clear filters" reset. Sticky filter
  47  |      selections would otherwise leak into the steady state. */
  48  |   const facetButtons = page.locator('.praxis__facet-btn');
  49  |   const facetCount = await facetButtons.count();
  50  |   for (let i = 0; i < facetCount; i += 1) {
  51  |     await facetButtons.nth(i).click();
  52  |   }
  53  | 
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
> 127 |   await page.keyboard.press(`${modifier}+KeyK`);
      |                       ^ Error: keyboard.press: Test timeout of 30000ms exceeded.
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
  154 |   await trigger.evaluate((el) => {
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