#!/usr/bin/env node
/**
 * Enforce per-page HTML size budget against build output.
 *
 * Each dist/**\/*.html file must gzip to less than HTML_MAX_GZ_KB.
 * A bloated page usually means an island-flattening regression in Astro
 * or accidentally-rendered large JSON blobs; both are worth noticing fast.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist');

const KB = 1024;
const HTML_MAX_GZ_BYTES = 100 * KB;

if (!existsSync(distDir)) {
  console.warn('[check-html-budget] dist/ not found; skipping.');
  process.exit(0);
}

const htmlFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const s = statSync(abs);
    if (s.isDirectory()) walk(abs);
    else if (entry.endsWith('.html')) htmlFiles.push(abs);
  }
}
walk(distDir);

/*
 * Coverage floor.
 *
 * Without this the script was fail-open by omission: if `walk()` found no
 * HTML at all — a moved output directory, an Astro `outDir` change, a build
 * that emitted only assets — the loop below would iterate zero times, no
 * failure would be recorded, and the gate would print an empty "top HTML
 * pages" list and exit 0. A budget check that passes because it measured
 * nothing is worse than no budget check, because it looks like one.
 *
 * Graduated, not `> 0`: the site ships 22 HTML routes. Nobody deletes all of
 * them, but a routing or collection regression can quietly drop a whole
 * directory of them. 20 leaves headroom to remove a page deliberately while
 * still catching wholesale loss.
 */
const MIN_HTML_PAGES = 20;
if (htmlFiles.length < MIN_HTML_PAGES) {
  console.error(
    `[check-html-budget] FAIL — only ${htmlFiles.length} HTML page(s) found under dist/, ` +
      `expected at least ${MIN_HTML_PAGES}.\n` +
      '  Either the build emitted almost nothing, outDir moved, or the walk is\n' +
      '  looking in the wrong place. Measuring zero pages and reporting success is\n' +
      '  the failure mode this floor exists to prevent.',
  );
  process.exit(1);
}

const results = [];
const failures = [];

for (const abs of htmlFiles) {
  const rel = relative(distDir, abs);
  const gz = gzipSync(readFileSync(abs)).length;
  results.push({ rel, gz });
  if (gz > HTML_MAX_GZ_BYTES) {
    failures.push(`${rel} = ${(gz / KB).toFixed(1)} KB gz (budget ${(HTML_MAX_GZ_BYTES / KB).toFixed(0)} KB)`);
  }
}

results.sort((a, b) => b.gz - a.gz);
console.log(
  `[check-html-budget] top HTML pages (gzip):\n` +
    results
      .slice(0, 6)
      .map(({ rel, gz }) => `  ${(gz / KB).toFixed(1).padStart(6)} KB  ${rel}`)
      .join('\n'),
);

if (failures.length) {
  console.error(
    '\n[check-html-budget] HTML BUDGET FAILURES:\n' + failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
