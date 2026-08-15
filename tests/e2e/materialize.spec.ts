import { test, expect } from '@playwright/test';

/**
 * Materialization sequence E2E tests.
 *
 * Architecture: The lobby 3D scene boots in an "energized" state and
 * transitions to calm. Text elements decode from cipher → real during
 * this same window. No overlay layer — the canvas IS the substrate.
 *
 * Sequence runs ONLY on homepage ("/") on fresh page load.
 * All other entries and ClientRouter navigations skip immediately.
 */

const MATERIALIZE_TIMEOUT_MS = 5_000;

test.describe('materialization sequence — homepage', () => {
  test('completes materialization and content is visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete',
      { timeout: MATERIALIZE_TIMEOUT_MS }
    );

    const navWordmark = page.locator('.nav-wordmark');
    await expect(navWordmark).toBeVisible();

    const heroCta = page.locator('.hero__cta');
    await expect(heroCta).toBeVisible();
  });

  test('nav links decode to readable text', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete',
      { timeout: MATERIALIZE_TIMEOUT_MS }
    );

    /* Decode targets are the nav links (the wordmark no longer
       participates in the cipher — it renders readable from SSR).
       Both completion paths must yield readable text: the animated
       path leaves a .materialize-real span, the fallback/skip path
       resolves the attribute on the untouched SSR text. */
    const decodeTarget = page.locator('.nav-link[data-materialize-text]').first();
    await expect(decodeTarget).toHaveAttribute('data-materialize-text', 'resolved');
    await expect(decodeTarget).toBeVisible();
    await expect(decodeTarget).not.toHaveText('');
    await expect(decodeTarget.locator('.materialize-cipher')).toBeHidden();

    const wordmark = page.locator('.nav-wordmark');
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toContainText('SARIF CONSULTING');
  });

  test('CTA text decodes correctly', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete',
      { timeout: MATERIALIZE_TIMEOUT_MS }
    );

    /* The hero CTA is not a cipher target — it must read correctly
       and carry no cipher spans once the sequence completes. */
    const heroCta = page.locator('.hero__cta');
    await expect(heroCta).toBeVisible();
    await expect(heroCta).toContainText('Augment Your Intelligence');
    await expect(heroCta.locator('.materialize-cipher')).toHaveCount(0);
  });

  test('reduced-motion skips sequence entirely', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete',
      { timeout: 1_000 }
    );

    const navWordmark = page.locator('.nav-wordmark');
    await expect(navWordmark).toBeVisible();
  });

  test('cipher spans are hidden after completion', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete',
      { timeout: MATERIALIZE_TIMEOUT_MS }
    );

    const cipherSpans = page.locator('.materialize-cipher');
    const count = await cipherSpans.count();
    for (let i = 0; i < count; i++) {
      await expect(cipherSpans.nth(i)).toBeHidden();
    }
  });
});

test.describe('materialization sequence — inner pages skip', () => {
  test('direct inner page entry skips sequence immediately', async ({ page }) => {
    await page.goto('/services/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete',
      { timeout: 1_000 }
    );

    const heading = page.locator('#services-heading');
    await expect(heading).toBeVisible();
  });

  test('ClientRouter nav after homepage does not re-trigger', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete',
      { timeout: MATERIALIZE_TIMEOUT_MS }
    );

    await page.click('a[href="/about/"]');
    await page.waitForURL('/about/');

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete'
    );

    const heading = page.locator('#augmented-heading');
    await expect(heading).toBeVisible();
  });
});

test.describe('materialization — mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('completes within timing budget on mobile', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete',
      { timeout: MATERIALIZE_TIMEOUT_MS }
    );

    const navWordmark = page.locator('.nav-wordmark');
    await expect(navWordmark).toBeVisible();
  });
});

/**
 * Veil-resolution budget — the no-GPU path.
 *
 * The whole suite runs with WebGL disabled (see playwright.config.ts
 * launchOptions), so these tests exercise exactly the client profile that
 * was broken: a visitor whose browser will never produce a GL frame.
 *
 * Regression being locked down: `sarif:first-frame` was dispatched ONLY from
 * inside the GL render loop. Every fallback path — reduced-motion, absent
 * WebGL, thrown initScene(), missing canvas, failed module import — returned
 * without firing it, so the reveal veil stayed opaque until materialize.js's
 * 4s FALLBACK_TIMEOUT_MS safety net expired. Measured before the fix: ~4.85s
 * of blank overlay. After: ~0.87s.
 *
 * The pre-existing specs above could not catch this: their 5000ms timeout is
 * looser than the 4s fallback, so a fully-hung veil still passed.
 *
 * The budget below is deliberately well under FALLBACK_TIMEOUT_MS. If this
 * test fails, some path is once again reaching the timeout rather than
 * resolving the veil deliberately — do not "fix" it by raising the budget.
 */
const VEIL_BUDGET_MS = 2_500;

test.describe('reveal veil — no-GPU resolution budget', () => {
  test('homepage veil resolves well before the 4s fallback timeout', async ({ page }) => {
    const started = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('data-veil', 'gone', {
      timeout: VEIL_BUDGET_MS,
    });

    const elapsed = Date.now() - started;
    expect(
      elapsed,
      `veil took ${elapsed}ms — at or near the 4s fallback means a boot path ` +
        'is failing to dispatch sarif:first-frame',
    ).toBeLessThan(VEIL_BUDGET_MS);
  });

  test('first-frame reports a fallback reason, not a GL frame', async ({ page }) => {
    // Subscribe before navigation completes so the one-shot event isn't missed.
    await page.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {}, { once: true });
      document.addEventListener(
        'sarif:first-frame',
        (e) => {
          (window as unknown as Record<string, unknown>).__firstFrameReason =
            (e as CustomEvent).detail?.reason ?? 'unknown';
        },
        { once: true },
      );
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-veil', 'gone', {
      timeout: VEIL_BUDGET_MS,
    });

    const reason = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__firstFrameReason,
    );

    // With WebGL disabled the probe in initLobby() fails, so the no-webgl
    // fallback must be what resolved the veil. Any GL reason here would mean
    // the suite is not actually running GL-disabled.
    expect(
      ['no-webgl', 'init-failed', 'reduced-motion', 'no-canvas', 'module-load-failed'],
      `unexpected first-frame reason: ${String(reason)}`,
    ).toContain(reason);
  });

  test('interior route veil resolves promptly too', async ({ page }) => {
    const started = Date.now();
    await page.goto('/praxis/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('data-veil', 'gone', {
      timeout: VEIL_BUDGET_MS,
    });
    expect(Date.now() - started).toBeLessThan(VEIL_BUDGET_MS);
  });
});
