# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: nav-routes.spec.ts >> route /about/ renders h1 + clean console
- Location: tests\e2e\nav-routes.spec.ts:32:3

# Error details

```
Error: console errors on /about/

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 4

- Array []
+ Array [
+   "Failed to load resource: the server responded with a status of 404 (Not Found)",
+   "Failed to load resource: the server responded with a status of 404 (Not Found)",
+ ]
```

# Test source

```ts
  1  | import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Nav route smoke: every primary route renders an <h1>, responds 200,
  5  |  * and produces no console errors (warnings are tolerated because the
  6  |  * 3D lobby logs shader-compile diagnostics on GL-limited runners).
  7  |  */
  8  | 
  9  | const ROUTES: Array<{ path: string; title: RegExp }> = [
  10 |   { path: '/', title: /sarif/i },
  11 |   { path: '/about/', title: /about|sarif/i },
  12 |   { path: '/services/', title: /services|sarif/i },
  13 |   { path: '/engagements/', title: /engagements|sarif/i },
  14 |   { path: '/lexicon/', title: /lexicon|sarif/i },
  15 |   { path: '/praxis/', title: /praxis|sarif/i },
  16 |   { path: '/contact/', title: /contact|sarif/i },
  17 |   { path: '/privacy/', title: /privacy|sarif/i },
  18 | ];
  19 | 
  20 | async function attachConsoleCollector(page: Page) {
  21 |   const errors: string[] = [];
  22 |   const onMsg = (msg: ConsoleMessage) => {
  23 |     if (msg.type() === 'error') errors.push(msg.text());
  24 |   };
  25 |   const onPageError = (err: Error) => errors.push(err.message);
  26 |   page.on('console', onMsg);
  27 |   page.on('pageerror', onPageError);
  28 |   return { errors };
  29 | }
  30 | 
  31 | for (const { path, title } of ROUTES) {
  32 |   test(`route ${path} renders h1 + clean console`, async ({ page }) => {
  33 |     const { errors } = await attachConsoleCollector(page);
  34 |     const resp = await page.goto(path, { waitUntil: 'domcontentloaded' });
  35 |     expect(resp?.status(), `status for ${path}`).toBeLessThan(400);
  36 |     await expect(page).toHaveTitle(title);
  37 |     const h1 = page.locator('h1');
  38 |     await expect(h1.first()).toBeVisible();
  39 |     /* Allow React DevTools / CSP noise, fail on real app errors. */
  40 |     const realErrors = errors.filter(
  41 |       (e) =>
  42 |         !/DevTools/i.test(e) &&
  43 |         !/Refused to load.*chrome-extension/i.test(e) &&
  44 |         !/chrome-extension:/i.test(e),
  45 |     );
> 46 |     expect(realErrors, `console errors on ${path}`).toEqual([]);
     |                                                     ^ Error: console errors on /about/
  47 |   });
  48 | }
  49 | 
  50 | test('skip link is present and focusable on home', async ({ page }) => {
  51 |   await page.goto('/');
  52 |   const skipLink = page.locator('a[href="#main"], a[href="#content"]').first();
  53 |   if ((await skipLink.count()) === 0) test.skip(true, 'no skip link defined');
  54 |   await skipLink.focus();
  55 |   await expect(skipLink).toBeFocused();
  56 | });
  57 | 
```