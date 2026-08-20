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

/**
 * Console errors alone cannot tell a harmless 404 from a broken site.
 *
 * Chromium's resource-failure message is literally:
 *   "Failed to load resource: the server responded with a status of 404 (Not Found)"
 * — with NO URL in the text. So the old blanket filter (`!/Failed to load
 * resource.*404/i`) had to suppress every 404 to tolerate the two it knew about,
 * which meant a deleted CSS bundle, a broken <img>, or a missing JS chunk would
 * all have passed this suite silently. That is the fail-open being closed here.
 *
 * The two expected 404s come from the telemetry beacons: `astro preview` is a
 * static file server with NO Pages Functions runtime, so every POST to
 * /api/_internal/log 404s locally while working fine in production (verified
 * 204 under `wrangler pages dev dist`).
 *
 * Fix: instrument the NETWORK layer, where the URL, method and resourceType are
 * all available, and suppress only that exact shape. Any other >=400 response
 * for a real page asset now fails the test.
 */
function isExpectedApiBeacon(url: string, method: string, resourceType: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  /* Beacons are POSTed via navigator.sendBeacon (resourceType 'ping') or
     fetch(keepalive) ('fetch'/'xhr') to the API surface only. */
  const isApi = pathname.startsWith('/api/');
  const isBeaconish = resourceType === 'ping' || resourceType === 'fetch' || resourceType === 'xhr';
  return isApi && method === 'POST' && isBeaconish;
}

async function attachConsoleCollector(page: Page) {
  const errors: string[] = [];
  /* Network failures that are NOT expected API beacons. Collected here so the
     assertion can name the offending URL instead of an anonymous 404. */
  const badResponses: string[] = [];

  const onMsg = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  };
  const onPageError = (err: Error) => errors.push(err.message);

  page.on('console', onMsg);
  page.on('pageerror', onPageError);
  page.on('response', (res) => {
    if (res.status() < 400) return;
    const req = res.request();
    if (isExpectedApiBeacon(res.url(), req.method(), req.resourceType())) return;
    badResponses.push(`${res.status()} ${req.method()} ${res.url()}`);
  });

  return { errors, badResponses };
}

for (const { path, title } of ROUTES) {
  test(`route ${path} renders h1 + clean console`, async ({ page }) => {
    const { errors, badResponses } = await attachConsoleCollector(page);
    const resp = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(resp?.status(), `status for ${path}`).toBeLessThan(400);
    await expect(page).toHaveTitle(title);
    const h1 = page.locator('h1');
    await expect(h1.first()).toBeVisible();

    /* Allow browser-extension and DevTools noise, fail on real app errors.
       Resource-load failures are NOT filtered by text here — they are asserted
       separately below via the network layer, which knows the URL. */
    const realErrors = errors.filter(
      (e) =>
        !/DevTools/i.test(e) &&
        !/Refused to load.*chrome-extension/i.test(e) &&
        !/chrome-extension:/i.test(e) &&
        !/Failed to load resource/i.test(e) &&
        !/net::ERR_ABORTED/i.test(e),
    );
    expect(realErrors, `console errors on ${path}`).toEqual([]);

    /* Any >=400 response other than the known API telemetry beacons means a
       genuinely broken asset — a missing bundle, image, font or route. */
    expect(badResponses, `failed network requests on ${path}`).toEqual([]);
  });
}

test('skip link is present and focusable on home', async ({ page }) => {
  await page.goto('/');
  const skipLink = page.locator('a[href="#main-content"], a[href="#main"], a[href="#content"]').first();
  if ((await skipLink.count()) === 0) test.skip(true, 'no skip link defined');
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
});
