#!/usr/bin/env node
/**
 * Build sentinel: media must be REFERENCED, not merely present and decodable.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * check-media-integrity.mjs verifies that shipped video assets DECODE. It says
 * nothing about whether any page actually points at them. Those are different
 * questions, and the gap between them shipped a real defect:
 *
 *   /about/ rendered ZERO <video> elements for an unknown number of builds.
 *   The assets were present and decoded perfectly, so the integrity sentinel
 *   stayed green. A path bug (`import.meta.url` resolving into dist/) made
 *   every existsSync() false, and the video-pair resolver silently returned {}.
 *   No error, no warning — a feature simply absent from the built HTML.
 *
 * This sentinel closes that gap in two directions:
 *
 *   A. BROKEN REFERENCE — a URL referenced by built HTML that has no
 *      corresponding file in dist/. This is a guaranteed production 404.
 *
 *   B. REQUIRED FEATURE MISSING — a declared expectation about what a page
 *      must contain (e.g. "/about/ ships >= 2 <video> elements referencing
 *      context-flow"). This is the direction that catches silent omission,
 *      which no amount of asset-side checking can detect.
 *
 * Expectation B is deliberately conditional on the source asset existing: if
 * someone intentionally removes public/media/about/context-flow.mp4, that is a
 * content decision, not a regression, and the check adapts. But while the asset
 * is on disk, a page that fails to reference it is a bug.
 *
 * ── Fail-loud posture ───────────────────────────────────────────────────────
 *
 * Graduated coverage floors, never `> 0`. If the dist/ walk or the reference
 * regex breaks, the run FAILS rather than reporting a clean zero.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist');

/* Extensions treated as media/static assets worth resolving. */
const MEDIA_RE = /\.(mp4|webm|mov|hdr|glb|gltf|png|jpe?g|webp|avif|svg|woff2?|ico)$/i;

/* Graduated floors — current tree: 22 HTML pages, ~136 referenced media URLs. */
const MIN_PAGES = 15;
const MIN_REFS = 80;

/**
 * Declared per-page media expectations (direction B).
 *
 * `requiresAsset` makes the expectation conditional on a source file, so
 * deliberate content removal is not reported as a regression. `pattern` must
 * appear in the built HTML at least `min` times.
 */
const EXPECTATIONS = [
  {
    page: 'about/index.html',
    label: 'about-page dossier videos',
    requiresAsset: 'public/media/about/context-flow.mp4',
    checks: [
      { pattern: /<video/g, min: 2, what: '<video> element(s)' },
      { pattern: /context-flow\.mp4/g, min: 1, what: 'reference(s) to context-flow.mp4' },
      { pattern: /context-flow\.av1\.webm/g, min: 1, what: 'reference(s) to context-flow.av1.webm' },
    ],
  },
];

if (!existsSync(DIST)) {
  console.error('[check-media-references] FAILED — dist/ not found. Run the build first.');
  process.exit(1);
}

/** Collect built HTML files. */
function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...htmlFiles(abs));
    else if (entry.endsWith('.html')) out.push(abs);
  }
  return out;
}

const pages = htmlFiles(DIST);

/* --- Direction A: every referenced media URL must resolve in dist/ --- */
const refs = new Map(); // url -> Set<page>
const ATTR_RE = /(?:src|href|data-src|srcset|content)="([^"]+)"/g;

for (const file of pages) {
  const text = readFileSync(file, 'utf8');
  let m;
  while ((m = ATTR_RE.exec(text)) !== null) {
    // srcset carries comma-separated "url widthDescriptor" pairs.
    for (const candidate of m[1].split(',')) {
      const raw = candidate.trim().split(/\s+/)[0];
      if (!raw || !raw.startsWith('/') || raw.startsWith('//')) continue;
      let url;
      try {
        url = decodeURIComponent(raw.split('?')[0].split('#')[0]);
      } catch {
        url = raw.split('?')[0].split('#')[0];
      }
      if (!MEDIA_RE.test(url)) continue;
      if (!refs.has(url)) refs.set(url, new Set());
      refs.get(url).add(relative(DIST, file));
    }
  }
}

const broken = [];
for (const [url, pageSet] of refs) {
  if (!existsSync(join(DIST, url))) {
    broken.push({ url, pages: [...pageSet] });
  }
}

/* --- Direction B: declared features must actually be present --- */
const unmet = [];
for (const exp of EXPECTATIONS) {
  if (exp.requiresAsset && !existsSync(join(ROOT, exp.requiresAsset))) {
    console.log(
      `[check-media-references] note — skipping "${exp.label}": source asset ` +
        `${exp.requiresAsset} is absent (treated as an intentional content decision).`,
    );
    continue;
  }
  const abs = join(DIST, exp.page);
  if (!existsSync(abs)) {
    unmet.push(`${exp.page} — page not built at all (expected for "${exp.label}")`);
    continue;
  }
  const html = readFileSync(abs, 'utf8');
  for (const c of exp.checks) {
    const found = (html.match(c.pattern) || []).length;
    if (found < c.min) {
      unmet.push(
        `${exp.page} — found ${found} ${c.what}, expected at least ${c.min} ("${exp.label}")`,
      );
    }
  }
}

/* --- Coverage floor: this check must not pass by measuring nothing --- */
if (pages.length < MIN_PAGES || refs.size < MIN_REFS) {
  console.error(
    `[check-media-references] FAILED — coverage floor not met: ${pages.length} page(s) ` +
      `(min ${MIN_PAGES}), ${refs.size} media reference(s) (min ${MIN_REFS}).\n` +
      '  Either the dist/ walk or the attribute scan is broken. A green run here\n' +
      '  would mean "nothing was inspected", not "nothing is wrong".',
  );
  process.exit(1);
}

if (broken.length > 0 || unmet.length > 0) {
  console.error('[check-media-references] FAILED\n');
  if (broken.length > 0) {
    console.error(`  Broken reference(s) — guaranteed 404 in production: ${broken.length}`);
    for (const b of broken) {
      console.error(`    ✗ ${b.url}`);
      console.error(`        referenced by: ${b.pages.slice(0, 5).join(', ')}`);
    }
    console.error('');
  }
  if (unmet.length > 0) {
    console.error(`  Unmet media expectation(s) — a feature silently vanished: ${unmet.length}`);
    for (const u of unmet) console.error(`    ✗ ${u}`);
    console.error(
      '\n  This is the direction asset-integrity checks cannot see: the file is\n' +
        '  present and decodes, but nothing points at it. Check the page\'s\n' +
        '  build-time path resolution — and never resolve public/ from\n' +
        '  import.meta.url, which points into dist/ during a build.',
    );
  }
  process.exit(1);
}

console.log(
  `[check-media-references] OK — ${refs.size} media reference(s) across ${pages.length} page(s) ` +
    `all resolve; ${EXPECTATIONS.length} page expectation(s) satisfied.`,
);
