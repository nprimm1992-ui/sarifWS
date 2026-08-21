import { test, expect } from '@playwright/test';

/**
 * Scope handoff: /services/ -> /contact/ -> the transmitted signal.
 *
 * WHY THIS SPEC EXISTS
 * The unit tests prove the codec's behaviour and the build gate proves both
 * pages render every sku. Neither proves the FEATURE WORKS, because the thing
 * connecting them is a browser: checkbox state, a real GET submit, an
 * intercepted submit that rewrites the query string, `hidden` attributes
 * toggled at runtime, and sessionStorage. Every defect this feature has
 * actually shipped — a summary whose title and price ran together, a confirm
 * block painting all 28 rows because an author `display:` defeated `hidden` —
 * was invisible to both other lanes and visible in a rendered page.
 *
 * So these tests assert RENDERED GEOMETRY AND VISIBILITY, not markup presence.
 * `toBeVisible()` is used deliberately over attribute checks: it is the
 * assertion that would have caught the `hidden`-override defect, which had
 * perfectly correct markup.
 *
 * A note on the two wire shapes. The no-JS path submits repeated params
 * (`?scope=a&scope=b`); the enhanced path writes the pipe shape (`?scope=a|b`).
 * Both are exercised here by navigating directly to each shape, because the
 * whole point of supporting both is that turning JavaScript off must not
 * silently lose the prospect's selection.
 */

/** The reader-facing cost label. Must match `COST_LABEL` in service-catalogue.ts. */
const COST_LABEL = 'Estimated cost';

/**
 * Select a deliverable the way a person does: by clicking its card.
 *
 * The `<input type="checkbox">` is a REAL input that is deliberately invisible
 * (`opacity: 0; width: 0`) with the wrapping `<label>` as the hit target — the
 * correct accessible pattern, and the reason `.check()` on the input times out
 * with "element is not visible". Playwright is right to refuse: no user can
 * click a zero-by-zero transparent box.
 *
 * The lane is also a collapsed `<details>`, so it must be opened first. Doing
 * that here means every test drives the same path a prospect drives, rather
 * than reaching past the UI with `force: true` or a dispatched event — either
 * of which would make these tests pass on a page nobody can operate.
 */
async function selectDeliverable(page: import('@playwright/test').Page, index: number) {
  /* Resolve the sku FIRST and address everything by value afterwards.
     `page.locator('details.lane', { has: <a .nth() locator> })` does not
     compose: `has:` re-evaluates its argument relative to each candidate
     ancestor, so an index-based inner locator resolves to nothing and the
     filter matches no lane. Selecting by the unique `value` attribute is
     unambiguous and reads better at the call site. */
  const sku = String(
    await page
      .locator('#scope-form input[type="checkbox"][name="scope"]')
      .nth(index)
      .getAttribute('value'),
  );
  return selectDeliverableBySku(page, sku);
}

/** Click the card for a specific sku, opening its lane if needed. */
async function selectDeliverableBySku(page: import('@playwright/test').Page, sku: string) {
  const input = page.locator(`#scope-form input[type="checkbox"][value="${sku}"]`);
  await expect(input).toBeAttached();

  // Open the enclosing lane if it is still collapsed.
  const lane = page.locator('details.lane', {
    has: page.locator(`input[type="checkbox"][value="${sku}"]`),
  });
  await expect(lane).toHaveCount(1);
  if (!(await lane.evaluate((el: Element) => (el as HTMLDetailsElement).open))) {
    await lane.locator('summary.lane-summary').click();
  }

  const label = page.locator('label.deliverable__label', {
    has: page.locator(`input[type="checkbox"][value="${sku}"]`),
  });
  await expect(label).toBeVisible();
  await label.click();
  await expect(input).toBeChecked();
  return sku;
}

/** Fill the contact form's required fields so a submit can actually proceed. */
async function fillRequiredContactFields(
  page: import('@playwright/test').Page,
  signalText: string,
) {
  // `signal` is required with minlength=20; name and email are required too.
  await page.locator('#contact-signal').fill(signalText);
  await page.locator('#contact-name').fill('Test Operator');
  await page.locator('#contact-email').fill('operator@example.com');
}

test.describe('services page — assembling a scope', () => {
  test('summary starts empty and the form is a real GET form to /contact/', async ({ page }) => {
    await page.goto('/services/');

    const form = page.locator('#scope-form');
    await expect(form).toHaveAttribute('method', /get/i);
    await expect(form).toHaveAttribute('action', '/contact/');

    /* Server-rendered empty state: the summary exists but claims nothing. */
    const summary = page.locator('#scope-summary');
    await expect(summary).toHaveAttribute('data-scope-empty', '');
    await expect(page.locator('[data-scope-empty-copy]')).toBeVisible();
    await expect(page.locator('[data-scope-body]')).toBeHidden();
  });

  test('checking a deliverable reveals exactly that row, with a separated title and price', async ({
    page,
  }) => {
    await page.goto('/services/');

    const sku = await selectDeliverable(page, 0);
    expect(sku).toBeTruthy();

    const body = page.locator('[data-scope-body]');
    await expect(body).toBeVisible();

    /* Exactly one row visible — not all of them. This is the assertion that
       catches an author `display:` defeating the `hidden` attribute. */
    const visibleRows = page.locator('#scope-summary-list [data-scope-row]:visible');
    await expect(visibleRows).toHaveCount(1);
    await expect(page.locator(`#scope-summary-list [data-scope-row="${sku}"]`)).toBeVisible();

    /* GEOMETRY: the title and the price must not collide. The Astro
       CSS-scoping defect produced correct markup that painted them as one run
       of text, which no markup assertion could see. */
    const row = page.locator(`#scope-summary-list [data-scope-row="${sku}"]`);
    const titleBox = await row.locator('.scope-summary__item-title').boundingBox();
    const priceBox = await row.locator('.scope-summary__item-price').boundingBox();
    expect(titleBox).not.toBeNull();
    expect(priceBox).not.toBeNull();
    if (titleBox && priceBox) {
      const sameLine = Math.abs(titleBox.y - priceBox.y) < Math.max(titleBox.height, 8);
      if (sameLine) {
        // Laid out as a row: the price must begin after the title ends.
        expect(priceBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width - 1);
      } else {
        // Laid out as a column: the price must sit below the title.
        expect(priceBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
      }
    }
  });

  test('the estimate reads as an estimate — never "indicative", never a total', async ({ page }) => {
    await page.goto('/services/');
    await selectDeliverable(page, 0);

    await expect(page.locator('.scope-summary__figure-label')).toHaveText(COST_LABEL);

    const figure = page.locator('#scope-floor');
    await expect(figure).toBeVisible();
    await expect(figure).toHaveText(/^\$[\d,]+$/);
    // A selected priced deliverable must move the number off zero.
    await expect(figure).not.toHaveText('$0');

    /* Posture: this is a briefing request, not a checkout. */
    const body = (await page.locator('main').innerText()).toLowerCase();
    for (const banned of ['add to cart', 'shopping cart', 'checkout', 'subtotal', 'grand total', 'order total', 'buy now']) {
      expect(body, `page uses cart language: "${banned}"`).not.toContain(banned);
    }
    expect(body, 'the superseded wording "indicative" came back').not.toContain('indicative');
  });

  test('unchecking everything returns the summary to its empty state', async ({ page }) => {
    await page.goto('/services/');

    const sku = await selectDeliverable(page, 0);
    await expect(page.locator('[data-scope-body]')).toBeVisible();

    // Click the same card again to deselect — the same gesture, reversed.
    // Re-derive the label locator (see selectDeliverableBySku: `has:` cannot
    // take an already-scoped inner locator).
    const input = page.locator(`#scope-form input[type="checkbox"][value="${sku}"]`);
    await page
      .locator('label.deliverable__label', {
        has: page.locator(`input[type="checkbox"][value="${sku}"]`),
      })
      .click();
    await expect(input).not.toBeChecked();

    await expect(page.locator('#scope-summary')).toHaveAttribute('data-scope-empty', '');
    await expect(page.locator('[data-scope-body]')).toBeHidden();
    await expect(page.locator('#scope-summary-list [data-scope-row]:visible')).toHaveCount(0);
  });

  test('submitting carries the selection to /contact/ as a query string', async ({ page }) => {
    await page.goto('/services/');

    const sku = await selectDeliverable(page, 0);

    await page.locator('#scope-form button[type="submit"]').click();

    await expect(page).toHaveURL(/\/contact\/\?.*scope=/);
    expect(page.url()).toContain(sku);
  });
});

test.describe('contact page — receiving a scope', () => {
  test('no scope param renders no confirm block at all', async ({ page }) => {
    await page.goto('/contact/');
    // Present in the DOM is fine; visible without a selection is not.
    await expect(page.locator('#scope-confirm')).toBeHidden();
  });

  /* Both wire shapes must converge. The pipe shape is what JS writes; the
     repeated shape is what a native no-JS submit produces. */
  for (const [label, build] of [
    ['pipe-separated (?scope=a|b)', (a: string, b: string) => `scope=${a}|${b}`],
    ['repeated params (?scope=a&scope=b)', (a: string, b: string) => `scope=${a}&scope=${b}`],
  ] as Array<[string, (a: string, b: string) => string]>) {
    test(`decodes the ${label} shape and shows only the chosen rows`, async ({ page }) => {
      // Discover two real skus from the services page rather than hardcoding.
      await page.goto('/services/');
      const boxes = page.locator('#scope-form input[type="checkbox"][name="scope"]');
      const a = String(await boxes.nth(0).getAttribute('value'));
      const b = String(await boxes.nth(1).getAttribute('value'));
      expect(a).not.toEqual(b);

      await page.goto(`/contact/?${build(a, b)}`);

      const confirm = page.locator('#scope-confirm');
      await expect(confirm).toBeVisible();

      const visibleRows = page.locator('#scope-confirm-list [data-scope-row]:visible');
      await expect(visibleRows).toHaveCount(2);
      await expect(page.locator(`#scope-confirm-list [data-scope-row="${a}"]`)).toBeVisible();
      await expect(page.locator(`#scope-confirm-list [data-scope-row="${b}"]`)).toBeVisible();

      await expect(page.locator('.scope-confirm__figure-label')).toHaveText(COST_LABEL);
      await expect(page.locator('#scope-confirm-floor')).toHaveText(/^\$[\d,]+$/);
    });
  }

  test('unknown skus are dropped rather than echoed into the page', async ({ page }) => {
    await page.goto('/services/');
    const real = String(
      await page.locator('#scope-form input[type="checkbox"][name="scope"]').nth(0).getAttribute('value'),
    );

    await page.goto(`/contact/?scope=${real}|totally-not-a-sku`);

    await expect(page.locator('#scope-confirm')).toBeVisible();
    await expect(page.locator('#scope-confirm-list [data-scope-row]:visible')).toHaveCount(1);
    const text = await page.locator('#scope-confirm').innerText();
    expect(text).not.toContain('totally-not-a-sku');
  });

  test('an entirely unknown scope shows no confirm block', async ({ page }) => {
    await page.goto('/contact/?scope=ghost-one|ghost-two');
    await expect(page.locator('#scope-confirm')).toBeHidden();
  });

  test('THE HANDOFF: the scope is composed into the signal that would be sent', async ({ page }) => {
    /* This is the assertion that matters most. `/api/transmit` reads only
       signal/name/email/organization — there is no scope column — so if the
       brief were not composed INTO the signal, the prospect would see their
       scope confirmed on screen and it would arrive nowhere. A fail-open that
       is invisible everywhere except here. */
    await page.goto('/services/');
    const boxes = page.locator('#scope-form input[type="checkbox"][name="scope"]');
    const a = String(await boxes.nth(0).getAttribute('value'));
    await page.goto(`/contact/?scope=${a}`);

    await expect(page.locator('#scope-confirm')).toBeVisible();

    /* All required fields, or the browser's own validation blocks the submit
       and the fetch never fires — which would look exactly like a broken
       handoff. `signal` also carries minlength=20. */
    const operatorMessage = 'Interested in discussing this scope in more detail.';
    await fillRequiredContactFields(page, operatorMessage);

    /* Intercept rather than transmit: `astro preview` is a static server with
       no Functions runtime, and this test must not depend on a live endpoint. */
    let posted: string | null = null;
    await page.route('**/api/transmit', async (route) => {
      posted = route.request().postData();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.locator('#contact-form button[type="submit"]').first().click();

    await expect
      .poll(() => posted, { timeout: 10_000, message: 'no POST to /api/transmit was observed' })
      .not.toBeNull();

    const sent = String(posted);
    const body = (() => {
      try {
        return JSON.parse(sent) as Record<string, unknown>;
      } catch {
        return Object.fromEntries(new URLSearchParams(sent)) as Record<string, unknown>;
      }
    })();

    const signalText = String(body.signal ?? '');
    expect(signalText, 'the operator message did not survive').toContain(operatorMessage);
    expect(signalText, 'the scope brief was not composed into the signal').toContain(
      'Requested scope',
    );
    expect(signalText, 'the estimate line is missing from the brief').toContain(COST_LABEL);
  });

  test('the textarea reserves budget for the scope brief', async ({ page }) => {
    /* The scope rides inside `signal`, so the textarea's maxlength is reduced
       by the worst-case brief length. Without this, a long message plus a
       scope block can exceed the server's SIGNAL_MAX and 400 on the honest
       path — the user is punished for a budget the page failed to keep. */
    await page.goto('/services/');
    const a = String(
      await page.locator('#scope-form input[type="checkbox"][name="scope"]').nth(0).getAttribute('value'),
    );

    await page.goto('/contact/');
    const bare = await page.locator('#contact-signal').getAttribute('maxlength');

    await page.goto(`/contact/?scope=${a}`);
    const withScope = await page.locator('#contact-signal').getAttribute('maxlength');

    expect(bare).toBeTruthy();
    expect(withScope).toBeTruthy();
    expect(Number(withScope)).toBeLessThan(Number(bare));
  });
});
