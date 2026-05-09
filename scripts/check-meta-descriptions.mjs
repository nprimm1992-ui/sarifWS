#!/usr/bin/env node
/**
 * Enforce meta description length across all generated HTML pages.
 *
 * SEO search-snippet guidelines: 120–170 chars renders cleanly across
 * Google/Bing/DuckDuckGo without truncation. We use 110 as a lower floor
 * (below that, snippets look thin) and 180 as the upper bound.
 *
 * Fails the build if any non-noindex page has a meta description outside
 * this range. Pages with `<meta name="robots" content="noindex">` are
 * skipped (they don't surface in search anyway).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist');

const MIN = 110;
const MAX = 180;

if (!existsSync(distDir)) {
  console.warn('[check-meta-descriptions] dist/ not found; skipping.');
  process.exit(0);
}

const META_DESC_RE = /<meta\s+name=["']description["']\s+content=["']([^"']*)["'][^>]*>/i;
const NOINDEX_RE = /<meta\s+name=["']robots["']\s+content=["']noindex/i;

// Third-party bundled HTML we don't author (eg. the UCIM visualizer
// React build output) is excluded — we can't hand-edit its <head>.
const EXCLUDED_DIRS = new Set(['ucim-visualizer']);

const htmlFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    const s = statSync(abs);
    if (s.isDirectory()) walk(abs);
    else if (entry.endsWith('.html')) htmlFiles.push(abs);
  }
}
walk(distDir);

const failures = [];
const results = [];

for (const abs of htmlFiles) {
  const rel = relative(distDir, abs);
  const html = readFileSync(abs, 'utf8');

  if (NOINDEX_RE.test(html)) continue;

  const m = html.match(META_DESC_RE);
  if (!m) {
    failures.push(`${rel} — missing <meta name="description">`);
    continue;
  }

  const desc = m[1];
  const len = desc.length;
  results.push({ rel, len });

  if (len < MIN || len > MAX) {
    failures.push(
      `${rel} — description ${len} chars (must be ${MIN}-${MAX}): "${desc.slice(0, 80)}${desc.length > 80 ? '…' : ''}"`,
    );
  }
}

results.sort((a, b) => a.len - b.len);
console.log(
  `[check-meta-descriptions] scanned ${results.length} indexable page(s). Length range: ${
    results[0]?.len ?? 0
  }–${results[results.length - 1]?.len ?? 0} chars.`,
);

if (failures.length) {
  console.error(
    '\n[check-meta-descriptions] FAILURES:\n' + failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
