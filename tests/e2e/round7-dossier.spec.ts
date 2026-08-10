import { test, expect } from '@playwright/test';

/**
 * Round-7 — Praxis dossier smoke.
 *
 * These tests are DOM-evaluation-first (via `page.evaluate`) to avoid
 * the known flakiness on this repo where Playwright's actionability
 * checks interact poorly with the WebGL lobby and sticky layouts. We
 * assert structural invariants (geometry, presence, session state)
 * that compile to plain JS reads against the document.
 */

test('praxis index: horizontal facet bar sits above card list at 1280', async ({ page }) => {
  /* Facets are a full-width horizontal strip (grid row), not a left
     sidebar. Assert vertical stacking: facet bar bottom ≤ card top. */
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/praxis/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const geometry = await page.evaluate(() => {
    const facets = document.querySelector('.praxis__facets');
    const card = document.querySelector('[data-praxis-card]');
    if (!facets || !card) {
      return { facetsPresent: Boolean(facets), cardPresent: Boolean(card) };
    }
    const facetsRect = facets.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      facetsPresent: true,
      cardPresent: true,
      facetsBottom: facetsRect.bottom,
      cardTop: cardRect.top,
      facetsWidth: facetsRect.width,
    };
  });

  expect(geometry.facetsPresent, 'facets element must render').toBe(true);
  expect(geometry.cardPresent, 'first card must render').toBe(true);
  if (geometry.facetsBottom == null || geometry.cardTop == null) return;
  expect(
    geometry.facetsBottom,
    'facet bar should sit above the card list (vertical stack)',
  ).toBeLessThanOrEqual(geometry.cardTop + 2);
  /* The facet strip shares its grid row with the Ask widget at
     desktop widths, so it spans roughly half the content column —
     assert "substantially rendered", not "viewport-wide". */
  expect(geometry.facetsWidth ?? 0, 'facet bar should be substantially rendered').toBeGreaterThan(300);
});

test('praxis article: dossier case renders all chrome regions', async ({ page }) => {
  /* Same posture as the runtime-state test: `load` + dwell gives the
     WebGL scene and inline module script time to settle. */
  test.setTimeout(60_000);
  await page.goto('/praxis/one-operator-one-intelligence-layer/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const present = await page.evaluate(() => {
    const q = (sel: string) => Boolean(document.querySelector(sel));
    const headerText =
      document.querySelector('.praxis-case__header')?.textContent?.trim() ?? '';
    return {
      case: q('[data-praxis-case]'),
      header: q('.praxis-case__header'),
      headerTime: q('.praxis-case__header time'),
      headerHasPraxisRef: /PRX-\s*\d{2}/i.test(headerText),
      title: q('.praxis-case__title'),
      hero: q('.praxis-case__hero'),
      sealEmblem: q('.praxis-case__seal-emblem'),
      footer: q('.praxis-case__footer'),
    };
  });

  expect(present.case, 'praxis-case wrapper').toBe(true);
  expect(present.header, 'praxis-case__header').toBe(true);
  expect(present.headerTime, 'published date in case header').toBe(true);
  expect(present.headerHasPraxisRef, 'PRX ref in case header').toBe(true);
  expect(present.title, 'praxis-case__title').toBe(true);
  expect(present.hero, 'praxis-case__hero').toBe(true);
  expect(present.sealEmblem, 'praxis-case__seal-emblem').toBe(true);
  expect(present.footer, 'praxis-case__footer').toBe(true);
});

test('praxis article: dossier runtime reaches opened state', async ({ page }) => {
  /* Three navigations through the WebGL-heavy lobby plus 1.5s dwell
     after each exceeds the 30s default. 90s gives headroom without
     inviting drift. */
  test.setTimeout(90_000);

  /* Force reduced-motion off so the full cinematic path runs — this
     test asserts end state, not the specific animation stages. On
     browsers with reduce enabled the else-branch fires instead; we
     accept either path since both terminate at 'open'. */
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const slug = 'one-operator-one-intelligence-layer';
  /* `load` ensures all module scripts (including the lobby scene)
     have had a chance to start. DOMContentLoaded races the Astro
     module loader on this repo. */
  await page.goto(`/praxis/${slug}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const firstVisit = await page.evaluate(() => {
    return document
      .querySelector('[data-praxis-case]')
      ?.getAttribute('data-praxis-open') ?? null;
  });
  expect(firstVisit, 'first visit should resolve the case into an opened state').toBe('open');

  /* Revisit: attribute must still end at 'open' regardless of path.
     The session flag only writes on the cinematic path; we therefore
     only assert the final state (both paths converge on 'open'). */
  await page.goto('/praxis/', { waitUntil: 'load' });
  await page.goto(`/praxis/${slug}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const revisit = await page.evaluate(() => {
    return document
      .querySelector('[data-praxis-case]')
      ?.getAttribute('data-praxis-open') ?? null;
  });
  expect(revisit, 'revisit should also resolve the case into an opened state').toBe('open');
});
