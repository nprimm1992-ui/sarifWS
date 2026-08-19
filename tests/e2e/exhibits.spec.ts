import { test, expect } from '@playwright/test';

/**
 * Exhibition-hall round — engagement dossier pages + the lexicon
 * atlas (3D graph, inspector, traversal, filter sync).
 *
 * DOM-evaluation-first posture (same rationale as round7-dossier):
 * Playwright actionability checks interact poorly with the WebGL
 * lobby, so structural assertions run via page.evaluate.
 */

/**
 * Exhibit slugs are discovered from the live directory rather than
 * hardcoded. The hall is authored content — engagements get added,
 * replaced, and renumbered — so a frozen list turns every legitimate
 * content edit into a red suite. Discovery keeps this a structural
 * guard (every dossier resolves, titles are unique, the walk is a
 * closed ring) instead of a content snapshot.
 */
async function discoverExhibitSlugs(page: import('@playwright/test').Page): Promise<string[]> {
  await page.goto('/engagements/', { waitUntil: 'domcontentloaded' });
  const slugs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="exhibit-directory-link"]'))
      .map((a) => a.getAttribute('href') ?? '')
      .map((href) => href.replace(/^\/engagements\/|\/$/g, ''))
      .filter(Boolean),
  );
  expect(slugs.length, 'exhibition directory is not empty').toBeGreaterThan(0);
  return slugs;
}

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

test('engagement dossiers: every exhibit resolves with a unique h1', async ({ page }) => {
  test.setTimeout(120_000);
  const slugs = await discoverExhibitSlugs(page);
  const titles = new Set<string>();
  for (const slug of slugs) {
    await page.goto(`/engagements/${slug}/`, { waitUntil: 'domcontentloaded' });
    const h1 = await page.evaluate(
      () => document.querySelector('h1')?.textContent?.trim() ?? '',
    );
    expect(h1.length, `${slug} h1 present`).toBeGreaterThan(0);
    titles.add(h1);
  }
  expect(titles.size, 'every exhibit title is distinct').toBe(slugs.length);
});

test('engagement dossiers: exhibit walk is a closed ring', async ({ page }) => {
  test.setTimeout(120_000);
  const slugs = await discoverExhibitSlugs(page);

  /* Follow `next` from the first exhibit and assert we traverse every
     dossier exactly once before returning to the start. This is the
     property the modulo arithmetic in [slug].astro is meant to provide
     — the hall has no dead ends — and it holds at any hall size. */
  const start = slugs[0];
  const walk: string[] = [];
  let current = start;

  for (let i = 0; i < slugs.length; i += 1) {
    walk.push(current);
    await page.goto(`/engagements/${current}/`, { waitUntil: 'domcontentloaded' });
    const nextHref = await page.evaluate(
      () =>
        document
          .querySelector('[data-testid="exhibit-next-link"]')
          ?.getAttribute('href') ?? '',
    );
    expect(nextHref, `${current} has a next link`).toMatch(/^\/engagements\/.+\/$/);
    current = nextHref.replace(/^\/engagements\/|\/$/g, '');
  }

  expect(new Set(walk).size, 'walk visits each exhibit exactly once').toBe(slugs.length);
  expect(current, 'walk wraps back to the first exhibit').toBe(start);
});

test('engagements index: directory links to every dossier', async ({ page }) => {
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

  expect(directory.count, 'directory is populated').toBeGreaterThan(0);
  for (const href of directory.hrefs) {
    expect(href, 'directory href points at a dossier').toMatch(/^\/engagements\/eng-\d{3}\/$/);
  }
});

test('lexicon atlas: scene renders frameless with nodes, edges and channels', async ({ page }) => {
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
      nebula: document.querySelectorAll('[data-atlas] .atlas__nebula').length,
      rings: document.querySelectorAll('[data-atlas] [data-poly]').length,
      chords: document.querySelectorAll('[data-atlas] .atlas__glyph-pair--octagram').length,
      spokes: document.querySelectorAll('[data-atlas] .atlas__glyph-pair--spoke').length,
      edgeUnderlays: document.querySelectorAll('[data-atlas] .atlas__edge-under').length,
      channels: document.querySelectorAll('[data-atlas] .atlas__chip-dot').length,
      clusters: document.querySelectorAll('[data-atlas] [data-cluster]').length,
      /* The runtime camera writes a transform on every node group. */
      projected: first?.getAttribute('transform') ?? '',
      inspectorHidden: document.querySelector('[data-testid="atlas-inspector"]')?.hasAttribute('hidden') ?? false,
    };
  });

  expect(scene.present, 'atlas renders').toBe(true);
  expect(scene.nodes, 'all lexicon terms plotted').toBeGreaterThanOrEqual(9);
  expect(scene.edges, 'relationship edges plotted').toBeGreaterThan(10);
  /* The tracking scrim was retired in favour of a static nebula bed plus the
     `.atlas__controls` gradient; assert the surviving atmospheric layer so this
     stays a real regression guard rather than dead coverage. */
  expect(scene.nebula, 'atmospheric nebula bed renders').toBe(1);
  /* Octagonal armature: four rings, eight spokes, the {8/3} octagram. */
  expect(scene.rings, 'octagon rings render').toBe(4);
  expect(scene.spokes, 'eight radial spokes render').toBe(8);
  expect(scene.chords, 'octagram chords render').toBe(8);
  expect(scene.edgeUnderlays, 'every edge carries a dark underlay for legibility').toBe(scene.edges);
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

test('lexicon atlas: filter subtracts nodes from the field', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/lexicon/', { waitUntil: 'load' });
  await page.waitForSelector('[data-lex-page][data-lex-page-wired="true"]', { state: 'attached', timeout: 60_000 });
  await page.waitForSelector('[data-atlas][data-atlas-ready="true"]', { state: 'attached', timeout: 45_000 });

  await page.locator('[data-testid="atlas-filter-input"]').fill('jensen');

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const total = document.querySelectorAll('[data-atlas] [data-node]').length;
          const out = document.querySelectorAll('[data-atlas] [data-node].is-out').length;
          return { filtered: out > 0 && out < total, out, total };
        }),
      { timeout: 15_000, message: 'atlas hides non-matching terms' },
    )
    .toMatchObject({ filtered: true });
});

test('lexicon atlas: hash arrival selects the term in the inspector', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/lexicon/', { waitUntil: 'load' });
  await page.waitForSelector('[data-lex-page][data-lex-page-wired="true"]', {
    state: 'attached',
    timeout: 60_000,
  });
  await page.waitForSelector('[data-atlas][data-atlas-ready="true"]', { state: 'attached', timeout: 45_000 });

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
        page.evaluate((id) => ({
          selected: document.querySelector('[data-atlas]')?.getAttribute('data-selected') ?? '',
          inspectorOpen: !document.querySelector('[data-testid="atlas-inspector"]')?.hasAttribute('hidden'),
        }), result.id),
      { timeout: 15_000, message: 'hash arrival selects the term and opens the inspector' },
    )
    .toMatchObject({ selected: result.id, inspectorOpen: true });
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

  /* Following one lands on the atlas with that term selected. */
  await page.goto(links[0], { waitUntil: 'load' });
  await page.waitForSelector('[data-atlas][data-atlas-ready="true"]', { state: 'attached', timeout: 45_000 });
  const id = links[0].split('term=')[1];

  await expect
    .poll(
      async () =>
        page.evaluate((termId) => ({
          selected: document.querySelector('[data-atlas]')?.getAttribute('data-selected') ?? '',
          inspectorOpen: !document.querySelector('[data-testid="atlas-inspector"]')?.hasAttribute('hidden'),
        }), id),
      { timeout: 15_000, message: 'atlas selects the deep-linked term' },
    )
    .toMatchObject({ selected: id, inspectorOpen: true });
});

test('lexicon atlas: inspector shows term provenance that navigates to the source', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/lexicon/?term=ucim', { waitUntil: 'load' });
  await page.waitForSelector('[data-atlas][data-atlas-ready="true"]', { state: 'attached', timeout: 45_000 });

  const uses = await page.evaluate(() => {
    const card = document.querySelector('[data-atlas-card="ucim"]');
    const links = [...(card?.querySelectorAll('.atlas-card__use') ?? [])];
    return {
      label: card?.querySelector('.atlas-card__provenance .atlas-card__edges-label')?.textContent?.trim() ?? '',
      count: links.length,
      hrefs: links.map((a) => a.getAttribute('href') ?? ''),
      hasHits: links.every((a) => (a.querySelector('.atlas-card__use-hits')?.textContent ?? '').includes('×')),
    };
  });

  expect(uses.label, 'provenance section is labelled').toBe('Used in');
  expect(uses.count, 'ucim is cited by published articles').toBeGreaterThan(0);
  expect(uses.hasHits, 'each citation reports its occurrence count').toBe(true);
  for (const href of uses.hrefs) {
    expect(href, 'citations point at real routes').toMatch(/^\/(praxis|engagements)\/[a-z0-9-]+\/$/);
  }

  /* The link actually resolves to the cited document. */
  const first = uses.hrefs[0];
  await page.goto(first, { waitUntil: 'load' });
  const heading = await page.evaluate(() => document.querySelectorAll('h1').length);
  expect(heading, 'cited document renders').toBe(1);
});
