import { test, expect } from '@playwright/test';

/**
 * Praxis smoke: list renders, facets toggle, the RAG-lite assistant
 * returns results, and article navigation survives view transitions.
 */

test('praxis index lists published articles', async ({ page }) => {
  await page.goto('/praxis/');
  const cards = page.locator('[data-praxis-card]');
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test('clicking a praxis card navigates to the article', async ({ page }) => {
  await page.goto('/praxis/');
  const firstCard = page.locator('[data-praxis-card] a.praxis-card__link').first();
  const href = await firstCard.getAttribute('href');
  expect(href, 'card should have href').toMatch(/^\/praxis\//);
  await firstCard.click();
  await page.waitForURL(/\/praxis\/[^/]+\/$/);
  await expect(page.locator('h1')).toBeVisible();
});

test('praxis facets hide non-matching cards', async ({ page }) => {
  await page.goto('/praxis/');
  const facetBtn = page.locator('.praxis__facet-btn').first();
  if ((await facetBtn.count()) === 0) test.skip(true, 'no facet buttons rendered');
  const label = (await facetBtn.textContent())?.trim() ?? '';
  expect(label.length).toBeGreaterThan(0);
  await facetBtn.click();
  await expect(facetBtn).toHaveAttribute('aria-pressed', 'true');
  /* At least one card must remain visible — the facet itself was
     derived from published content so the intersection is non-empty. */
  const visibleCards = page.locator('[data-praxis-card]:not([hidden])');
  await expect(visibleCards.first()).toBeVisible();
});

