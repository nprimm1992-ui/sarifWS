import { test, expect } from '@playwright/test';

/**
 * Command palette smoke (P9a): Cmd+K (or Ctrl+K on Linux) opens the
 * palette, typing narrows the result set, Escape closes.
 */

test('palette opens with Ctrl+K and surfaces results', async ({ page, browserName }) => {
  await page.goto('/');
  /* Wait past the initial lobby boot so the key handler is bound. */
  await page.waitForLoadState('networkidle');
  const modifier = browserName === 'webkit' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+KeyK`);
  const palette = page.locator('#command-palette');
  await expect(palette).toBeVisible();
  const input = page.locator('[data-command-palette-input]');
  await input.fill('contact');
  const results = page.locator('[data-command-palette-results] [role="option"]');
  await expect(results.first()).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});
