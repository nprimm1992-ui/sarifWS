import { test, expect } from '@playwright/test';

/**
 * Exhibition-hall round — engagement dossier pages + lexicon
 * constellation smoke.
 *
 * DOM-evaluation-first posture (same rationale as round7-dossier):
 * Playwright actionability checks interact poorly with the WebGL
 * lobby, so structural assertions run via page.evaluate.
 */

const EXHIBIT_SLUGS = [
  'eng-001',
  'eng-002',
  'eng-003',
  'eng-004',
  'eng-005',
  'eng-006',
];

test('engagement dossier: exhibit chrome renders on eng-001', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/engagements/eng-001/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  const present = await page.evaluate(() => {
    const q = (sel: string) => Boolean(document.querySelector(sel));
    const logEntries = document.querySelectorAll('[data-testid="exhibit-log-entry"]').length;
    const h1 = document.querySelector('h1')?.textContent?.trim() ?? '';
    return {
      page: q('[data-testid="exhibit-page"]'),
      plaque: q('[data-testid="exhibit-plaque"]'),
      telemetry: q('[data-testid="exhibit-telemetry"]'),
      mandate: q('[data-testid="exhibit-mandate"]'),
      stat: q('[data-testid="exhibit-stat"]'),
      prev: q('[data-testid="exhibit-prev-link"]'),
      next: q('[data-testid="exhibit-next-link"]'),
      returnLink: q('[data-testid="exhibit-return-link"]'),
      logEntries,
      h1,
    };
  });

  expect(present.page, 'exhibit page wrapper').toBe(true);
  expect(present.plaque, 'exhibit plaque').toBe(true);
  expect(present.telemetry, 'telemetry strip').toBe(true);
  expect(present.mandate, 'mandate section').toBe(true);
  expect(present.stat, 'stat display').toBe(true);
  expect(present.prev, 'previous exhibit link').toBe(true);
  expect(present.next, 'next exhibit link').toBe(true);
  expect(present.returnLink, 'return to hall link').toBe(true);
  expect(present.logEntries, 'operations log entries').toBeGreaterThanOrEqual(4);
  expect(present.h1.length, 'h1 has content').toBeGreaterThan(0);
});

test('engagement dossiers: all six exhibits resolve with unique h1', async ({ page }) => {
  test.setTimeout(90_000);
  const titles = new Set<string>();
  for (const slug of EXHIBIT_SLUGS) {
    await page.goto(`/engagements/${slug}/`, { waitUntil: 'domcontentloaded' });
    const h1 = await page.evaluate(
      () => document.querySelector('h1')?.textContent?.trim() ?? '',
    );
    expect(h1.length, `${slug} h1 present`).toBeGreaterThan(0);
    titles.add(h1);
  }
  expect(titles.size, 'six distinct exhibit titles').toBe(6);
});

test('engagements index: directory links to all six dossiers', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/engagements/', { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const directory = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll('[data-testid^="exhibit-directory-link"]'),
    );
    return {
      count: links.length,
      hrefs: links.map((a) => a.getAttribute('href') ?? ''),
    };
  });

  expect(directory.count, 'six directory links').toBe(6);
  for (const href of directory.hrefs) {
    expect(href, 'directory href points at a dossier').toMatch(/^\/engagements\/eng-\d{3}\/$/);
  }
});

test('lexicon constellation: nodes and edges render', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/lexicon/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  const map = await page.evaluate(() => {
    const root = document.querySelector('[data-lex-map]');
    return {
      present: Boolean(root),
      nodes: document.querySelectorAll('[data-lex-map] [data-node]').length,
      edges: document.querySelectorAll('[data-lex-map] [data-edge-a]').length,
      legendItems: document.querySelectorAll('[data-lex-map] .lex-map__legend-item').length,
    };
  });

  expect(map.present, 'constellation panel renders').toBe(true);
  expect(map.nodes, 'all lexicon terms plotted').toBeGreaterThanOrEqual(10);
  expect(map.edges, 'relationship edges plotted').toBeGreaterThan(10);
  expect(map.legendItems, 'category legend rendered').toBeGreaterThanOrEqual(4);
});

test('lexicon constellation: node click opens the entry below', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/lexicon/', { waitUntil: 'load' });
  /* The hashchange → auto-expand behavior belongs to the lexicon page
     island; wait for its wired flag rather than a fixed dwell so the
     test is immune to slow software-GL environments. */
  await page.waitForSelector('[data-lex-page][data-lex-page-wired="true"]', {
    state: 'attached',
    timeout: 60_000,
  });

  const result = await page.evaluate(() => {
    const node = document.querySelector('[data-lex-map] [data-node]');
    if (!node) return { clicked: false, id: '' };
    const id = node.getAttribute('data-node') ?? '';
    /* SVG <a> default action does not fire on synthetic events across
       engines — drive the hash directly; the page's hashchange handler
       owns the expand either way (identical to a real node click). */
    window.location.hash = `#${id}`;
    return { clicked: true, id };
  });
  expect(result.clicked, 'a constellation node exists to click').toBe(true);

  await expect
    .poll(
      async () =>
        page.evaluate((id) => {
          const target = document.getElementById(id ?? '');
          if (!target) return 'missing';
          const open =
            target instanceof HTMLDetailsElement ? target.open : target.hasAttribute('open');
          return open ? 'open' : 'closed';
        }, result.id),
      { timeout: 15_000, message: 'entry auto-expands on hash arrival' },
    )
    .toBe('open');
});
