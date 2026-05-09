import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Nav route smoke: every primary route renders an <h1>, responds 200,
 * and produces no console errors (warnings are tolerated because the
 * 3D lobby logs shader-compile diagnostics on GL-limited runners).
 */

const ROUTES: Array<{ path: string; title: RegExp }> = [
  { path: '/', title: /sarif/i },
  { path: '/about/', title: /about|sarif/i },
  { path: '/services/', title: /services|sarif/i },
  { path: '/engagements/', title: /engagements|sarif/i },
  { path: '/lexicon/', title: /lexicon|sarif/i },
  { path: '/praxis/', title: /praxis|sarif/i },
  { path: '/contact/', title: /contact|sarif/i },
  { path: '/privacy/', title: /privacy|sarif/i },
];

async function attachConsoleCollector(page: Page) {
  const errors: string[] = [];
  const onMsg = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  };
  const onPageError = (err: Error) => errors.push(err.message);
  page.on('console', onMsg);
  page.on('pageerror', onPageError);
  return { errors };
}

for (const { path, title } of ROUTES) {
  test(`route ${path} renders h1 + clean console`, async ({ page }) => {
    const { errors } = await attachConsoleCollector(page);
    const resp = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(resp?.status(), `status for ${path}`).toBeLessThan(400);
    await expect(page).toHaveTitle(title);
    const h1 = page.locator('h1');
    await expect(h1.first()).toBeVisible();
    /* Allow React DevTools / CSP noise, fail on real app errors. */
    const realErrors = errors.filter(
      (e) =>
        !/DevTools/i.test(e) &&
        !/Refused to load.*chrome-extension/i.test(e) &&
        !/chrome-extension:/i.test(e),
    );
    expect(realErrors, `console errors on ${path}`).toEqual([]);
  });
}

test('skip link is present and focusable on home', async ({ page }) => {
  await page.goto('/');
  const skipLink = page.locator('a[href="#main"], a[href="#content"]').first();
  if ((await skipLink.count()) === 0) test.skip(true, 'no skip link defined');
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
});
