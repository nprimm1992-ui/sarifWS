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
