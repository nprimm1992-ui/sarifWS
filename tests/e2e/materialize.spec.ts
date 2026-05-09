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

  test('nav wordmark decodes to readable text', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete',
      { timeout: MATERIALIZE_TIMEOUT_MS }
    );

    const wordmark = page.locator('.nav-wordmark');
    await expect(wordmark).toHaveAttribute('data-materialize-text', 'resolved');

    const realSpan = wordmark.locator('.materialize-real');
    await expect(realSpan).toBeVisible();
    await expect(realSpan).toContainText('SARIF CONSULTING');
  });

  test('CTA text decodes correctly', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute(
      'data-materialize',
      'complete',
      { timeout: MATERIALIZE_TIMEOUT_MS }
    );

    const ctaSpan = page.locator('.sarif-hover-sheen[data-materialize-text]');
    await expect(ctaSpan).toHaveAttribute('data-materialize-text', 'resolved');

    const realSpan = ctaSpan.locator('.materialize-real');
    await expect(realSpan).toContainText('Augment Your Intelligence');
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
