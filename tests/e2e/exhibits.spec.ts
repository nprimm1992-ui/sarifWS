import { test, expect } from '@playwright/test';

/**
 * Exhibition-hall round — engagement dossier pages + the lexicon
 * atlas (3D graph, inspector, traversal, filter sync).
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

test('lexicon atlas: scene renders with nodes, edges, grid and channels', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/lexicon/', { waitUntil: 'load' });
  await page.waitForSelector('[data-atlas][data-atlas-ready="true"]', { state: 'attached', timeout: 45_000 });

  const scene = await page.evaluate(() => {
    const root = document.querySelector('[data-atlas]');
    const first = document.querySelector('[data-atlas] [data-node] .atlas__node-tx');
    return {
      present: Boolean(root),
      nodes: document.querySelectorAll('[data-atlas] [data-node]').length,
      edges: document.querySelectorAll('[data-atlas] [data-edge-a]').length,
      gridLines: document.querySelectorAll('[data-atlas] .atlas__grid-line').length,
      channels: document.querySelectorAll('[data-atlas] .atlas__chip-dot').length,
      clusters: document.querySelectorAll('[data-atlas] [data-cluster]').length,
      /* The runtime camera writes a transform on every node group. */
      projected: first?.getAttribute('transform') ?? '',
      inspectorHidden: document.querySelector('[data-testid="atlas-inspector"]')?.hasAttribute('hidden') ?? false,
    };
  });

  expect(scene.present, 'atlas renders').toBe(true);
  expect(scene.nodes, 'all lexicon terms plotted').toBeGreaterThanOrEqual(10);
  expect(scene.edges, 'relationship edges plotted').toBeGreaterThan(10);
  expect(scene.gridLines, 'perspective floor grid renders').toBeGreaterThan(8);
  expect(scene.channels, 'channel chips carry colour dots').toBeGreaterThanOrEqual(4);
  expect(scene.clusters, 'cluster captions render').toBeGreaterThanOrEqual(4);
  expect(scene.projected, 'camera projects node positions').toMatch(/translate\(/);
  expect(scene.inspectorHidden, 'inspector starts closed').toBe(true);
});

test('lexicon atlas: selecting a node opens the inspector and traversal works', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/lexicon/', { waitUntil: 'load' });
  await page.waitForSelector('[data-atlas][data-atlas-ready="true"]', { state: 'attached', timeout: 45_000 });

  /* Nodes live inside an animated camera projection — their box moves
     between Playwright's hit-point calculation and dispatch under CI
     load. Dispatch a bubbling click on the node itself: the atlas
     delegates selection from the root, so this is the same code path a
     real click takes, minus the flake. */
  await page.evaluate(() => {
    document
      .querySelector('[data-testid="lexicon-node-ucim"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  await expect
    .poll(
      async () =>
        page.evaluate(() => ({
          selected: document.querySelector('[data-atlas]')?.getAttribute('data-selected') ?? '',
          inspectorOpen: !document.querySelector('[data-testid="atlas-inspector"]')?.hasAttribute('hidden'),
          card: document.querySelector('[data-atlas-card="ucim"]')?.hasAttribute('hidden') === false,
          readout: document.querySelector('[data-testid="atlas-readout-selected"]')?.textContent?.trim() ?? '',
        })),
      { timeout: 15_000, message: 'inspector opens on the selected term' },
    )
    .toMatchObject({ selected: 'ucim', inspectorOpen: true, card: true });

  /* Traversal: a related chip swaps the inspector to that term. */
  await page.locator('[data-atlas-card="ucim"] [data-testid="atlas-goto-jensen"]').click({ force: true });
  await expect
    .poll(
      async () =>
        page.evaluate(() => document.querySelector('[data-atlas]')?.getAttribute('data-selected') ?? ''),
      { timeout: 10_000, message: 'traversal re-centres on the related term' },
    )
    .toBe('jensen');

  /* Selection is shareable. */
  expect(page.url(), 'selection is written to the URL').toContain('term=jensen');

  /* Escape releases the field. */
  await page.keyboard.press('Escape');
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          document.querySelector('[data-testid="atlas-inspector"]')?.hasAttribute('hidden') ?? false,
        ),
      { timeout: 10_000, message: 'Escape closes the inspector' },
    )
    .toBe(true);
});

test('lexicon atlas: deep link selects a term on load', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/lexicon/?term=jensen', { waitUntil: 'load' });
  await page.waitForSelector('[data-atlas][data-atlas-ready="true"]', { state: 'attached', timeout: 45_000 });

  await expect
    .poll(
      async () =>
        page.evaluate(() => document.querySelector('[data-atlas]')?.getAttribute('data-selected') ?? ''),
      { timeout: 15_000, message: 'deep-linked term is selected' },
    )
    .toBe('jensen');
});

test('lexicon atlas: filter subtracts nodes from the field and the register', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/lexicon/', { waitUntil: 'load' });
  await page.waitForSelector('[data-lex-page][data-lex-page-wired="true"]', { state: 'attached', timeout: 60_000 });
  await page.waitForSelector('[data-atlas][data-atlas-ready="true"]', { state: 'attached', timeout: 45_000 });

  await page.locator('[data-testid="atlas-filter-input"]').fill('jensen');

  /* The filter is one control surface over two renderings: whatever the
     register hides must also leave the field. */
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const total = document.querySelectorAll('[data-lex-entry]').length;
          const registerHidden = document.querySelectorAll('[data-lex-entry][data-filtered-out="true"]').length;
          const out = document.querySelectorAll('[data-atlas] [data-node].is-out').length;
          return { synced: registerHidden > 0 && out === registerHidden, out, registerHidden, total };
        }),
      { timeout: 15_000, message: 'atlas and register hide the same terms' },
    )
    .toMatchObject({ synced: true });
});

test('lexicon register: hash arrival still expands the flat entry', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/lexicon/', { waitUntil: 'load' });
  await page.waitForSelector('[data-lex-page][data-lex-page-wired="true"]', {
    state: 'attached',
    timeout: 60_000,
  });

  const result = await page.evaluate(() => {
    const node = document.querySelector('[data-atlas] [data-node]');
    if (!node) return { clicked: false, id: '' };
    const id = node.getAttribute('data-node') ?? '';
    window.location.hash = `#${id}`;
    return { clicked: true, id };
  });
  expect(result.clicked, 'an atlas node exists').toBe(true);

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

test('praxis article: lexicon terms deep-link into the atlas view', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/praxis/one-operator-one-intelligence-layer/', { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const links = await page.evaluate(() =>
    [...document.querySelectorAll('[data-lex-anchor]')].map((a) => a.getAttribute('href') ?? ''),
  );
  expect(links.length, 'article auto-links lexicon terms').toBeGreaterThan(0);
  for (const href of links) {
    expect(href, 'term links target the atlas view').toMatch(/^\/lexicon\/\?term=[a-z0-9-]+$/);
  }

  /* Following one lands on the atlas with that term selected, and the
     flat register entry mirrors the selection. */
  await page.goto(links[0], { waitUntil: 'load' });
  await page.waitForSelector('[data-atlas][data-atlas-ready="true"]', { state: 'attached', timeout: 45_000 });
  const id = links[0].split('term=')[1];

  await expect
    .poll(
      async () =>
        page.evaluate((termId) => {
          const entry = document.getElementById(termId ?? '');
          return {
            selected: document.querySelector('[data-atlas]')?.getAttribute('data-selected') ?? '',
            registerOpen: entry instanceof HTMLDetailsElement ? entry.open : false,
          };
        }, id),
      { timeout: 15_000, message: 'atlas selects the deep-linked term and the register mirrors it' },
    )
    .toMatchObject({ selected: id, registerOpen: true });
});
