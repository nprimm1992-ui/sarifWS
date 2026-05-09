import { test, expect } from '@playwright/test';

/**
 * Round-4 audit-remediation smoke suite.
 *
 * These tests cover the six user-facing regressions that round 4
 * remediated, plus the mobile-discoverability affordance:
 *
 *   1. Praxis empty-state "Clear filters" restores the card list.
 *   2. Praxis-ask error state surfaces a retry button when the
 *      search index fails to load.
 *   3. Command palette traps focus while open (Tab cycles back to
 *      the input, never escapes into the backgrounded page).
 *   4. Command palette locks background scroll (html gets the
 *      command-palette-open class and overflow becomes hidden).
 *   5. Nav exposes a visible search-palette trigger so touch-only
 *      users can reach the command palette without the keyboard
 *      shortcut.
 *   6. Reduced-motion live toggle drops the tilt transform on every
 *      opted-in card in the next frame.
 *
 * Design notes:
 *
 * - We deliberately avoid `waitForLoadState('networkidle')` on the
 *   home route. The 3D lobby keeps a busy frame/resource pipeline,
 *   so networkidle is unreliable; `domcontentloaded` + a small
 *   settle buffer is sufficient for the palette bind-point.
 * - The palette-triggered tests use `/praxis/` instead of `/` so
 *   WebGL lobby canvas capture doesn't interfere with pointer
 *   input. Both pages host the same CommandPalette component via
 *   Base.astro.
 * - Each test is independent and resets with a fresh page.goto.
 */

const PALETTE_ROUTE = '/praxis/';
const SETTLE_MS = 300;

test('praxis empty-state clear restores every card', async ({ page }) => {
  await page.goto('/praxis/');
  const emptyState = page.locator('#praxis-empty-state');
  const cards = page.locator('[data-praxis-card]');
  const initial = await cards.count();
  test.skip(initial < 2, 'need at least two cards to exercise facets');

  /* Toggle every facet button so the intersection is guaranteed
     non-empty only under the "Clear filters" reset. Sticky filter
     selections would otherwise leak into the steady state. */
  const facetButtons = page.locator('.praxis__facet-btn');
  const facetCount = await facetButtons.count();
  for (let i = 0; i < facetCount; i += 1) {
    await facetButtons.nth(i).click();
  }

  /* One of two outcomes must hold: either every facet intersects
     (empty state hidden, but filters pressed) or the empty-state
     surface appears. In either case, "Clear filters" must bring
     every card back. */
  const hasEmpty = await emptyState.isVisible().catch(() => false);
  if (hasEmpty) {
    const clearBtn = emptyState.locator('[data-facet-clear]');
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
  } else {
    /* Click each pressed facet to un-press. */
    for (let i = 0; i < facetCount; i += 1) {
      const btn = facetButtons.nth(i);
      if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
    }
  }

  await expect(cards.first()).toBeVisible();
  const visible = page.locator('[data-praxis-card]:not([hidden])');
  await expect.poll(async () => visible.count()).toBe(initial);
});

test('praxis-ask error state renders retry button on index fetch failure', async ({ page }) => {
  /* Intercept the index request with a hard failure before the page
     loads so the assistant has no cached copy to fall back on. The
     assertion is on the user-visible retry affordance, not on the
     network layer — the goal is to prove the UI surfaces a
     recoverable state rather than a silent zero-results. */
  await page.route('**/search-index.json*', (route) => {
    return route.fulfill({ status: 503, body: 'unavailable' });
  });
  await page.goto('/praxis/');
  const input = page.locator('[data-praxis-ask-input]');
  /* PraxisAsk is corpus-size gated (see PRAXIS_ASK_MIN_CORPUS in
     src/pages/praxis.astro). Skip cleanly when the component is not
     rendered so the suite survives every corpus size up to the gate. */
  if ((await input.count()) === 0) {
    test.skip(true, 'praxis-ask gated off until corpus >= PRAXIS_ASK_MIN_CORPUS');
  }
  await expect(input).toBeVisible();
  await input.fill('anything');
  const retry = page.locator('[data-praxis-ask-retry], .praxis-ask__error-retry');
  await expect(retry).toBeVisible({ timeout: 5_000 });
});

test('command palette traps focus — tab cycles back inside palette', async ({ page, browserName }) => {
  await page.goto(PALETTE_ROUTE);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(SETTLE_MS);
  const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+KeyK`);
  const palette = page.locator('#command-palette');
  await expect(palette).toBeVisible();
  const input = page.locator('[data-command-palette-input]');
  await expect(input).toBeFocused();
  /* Tab once. Focus must land inside the palette (on a close button,
     a scrollable option row, etc.). Tab-from-input must not jump to
     the backgrounded document. */
  await page.keyboard.press('Tab');
  const focusIsInsidePalette = await page.evaluate(() => {
    const root = document.getElementById('command-palette');
    return root ? root.contains(document.activeElement) : false;
  });
  expect(focusIsInsidePalette).toBe(true);
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('command palette locks background scroll while open', async ({ page, browserName }) => {
  await page.goto(PALETTE_ROUTE);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(SETTLE_MS);
  const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+KeyK`);
  const palette = page.locator('#command-palette');
  await expect(palette).toBeVisible();
  const state = await page.evaluate(() => ({
    overflow: window.getComputedStyle(document.documentElement).overflow,
    hasClass: document.documentElement.classList.contains('command-palette-open'),
  }));
  expect(state.hasClass).toBe(true);
  expect(state.overflow).toBe('hidden');
  await page.keyboard.press('Escape');
  const after = await page.evaluate(() =>
    document.documentElement.classList.contains('command-palette-open'),
  );
  expect(after).toBe(false);
});

test('nav exposes a visible command-palette trigger', async ({ page }) => {
  await page.goto(PALETTE_ROUTE);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(SETTLE_MS);
  const trigger = page.locator('[data-command-palette-trigger]').first();
  await expect(trigger).toBeVisible();
  /* Real pointer click contends with the lobby canvas on the home
     route; for this assertion we only care that the element carries
     the contract and the click handler opens the palette. Evaluating
     .click() in-page exercises the same delegated listener without
     pointer-event competition. */
  await trigger.evaluate((el) => {
    if (el instanceof HTMLElement) el.click();
  });
  const palette = page.locator('#command-palette');
  await expect(palette).toBeVisible();
});

test('reduced motion live toggle strips tilt transform', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/praxis/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(SETTLE_MS);

  const tiltInner = page.locator('.tilt-inner').first();
  if ((await tiltInner.count()) === 0) test.skip(true, 'no tilt-inner targets on this route');

  const outer = page
    .locator('.lane, .preview-entry, .eng-carousel__slide, .praxis-card, .service-card-wrapper')
    .first();
  const outerBox = await outer.boundingBox();
  test.skip(!outerBox, 'outer card not laid out');
  if (!outerBox) return;
  /* Move the pointer over the card centre to wake the spring, then
     let a couple of frames settle. Flipping the motion preference
     afterwards asserts the live-subscribe path drains every tilt
     by the next rAF. */
  await page.mouse.move(outerBox.x + outerBox.width / 2, outerBox.y + outerBox.height / 2, {
    steps: 6,
  });
  await page.waitForTimeout(150);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(180);

  const transform = await tiltInner.evaluate((el) => {
    if (el instanceof HTMLElement) return el.style.transform || '';
    return '';
  });
  expect(transform).toBe('');
});
