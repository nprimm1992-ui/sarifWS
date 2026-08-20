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

/*
 * Quote-aware attribute capture.
 *
 * The previous pattern used `content=["']([^"']*)["']` — a character class
 * excluding BOTH quote styles. That terminates the capture at the first
 * apostrophe inside the value, so a description containing "the firm's"
 * was measured only up to "the firm" and the remainder was invisible to
 * the length check.
 *
 * That is a measure-then-validate-the-measurement bug: the gate silently
 * truncated its own input and then passed the truncation. `/about` shipped
 * a 209-char description (29 over MAX) while this script reported 130 and
 * exited 0. It is also why src/pages/engagements/[slug].astro strips
 * apostrophes from generated descriptions — a workaround for this bug
 * rather than a real constraint.
 *
 * The fix backreferences the opening delimiter (\1) and uses a lazy body,
 * so the capture ends only at the matching quote. Values are then HTML-
 * entity-decoded before measuring, because `&amp;` occupies 5 characters
 * in the markup but renders as 1 in a search snippet — and the snippet is
 * what the 110–180 budget is actually about.
 */
const META_DESC_RE = /<meta\s+name=(["'])description\1\s+content=(["'])([\s\S]*?)\2/i;
/* Same quote-aware shape. Robots values are keyword tokens (`noindex,
   nofollow`) so an apostrophe is implausible here, but keeping one pattern
   style across the file means nobody has to re-derive which regex is safe. */
const NOINDEX_RE = /<meta\s+name=(["'])robots\1\s+content=(["'])[\s\S]*?noindex[\s\S]*?\2/i;

/** Decode the entity subset Astro emits when escaping attribute values. */
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&amp;/g, '&'); /* last — so &amp;lt; does not become < */
}

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

  const desc = decodeEntities(m[3]);
  const len = desc.length;
  results.push({ rel, len });

  if (len < MIN || len > MAX) {
    failures.push(
      `${rel} — description ${len} chars (must be ${MIN}-${MAX}): "${desc.slice(0, 80)}${desc.length > 80 ? '…' : ''}"`,
    );
  }
}

/*
 * Fail-open guard.
 *
 * Every finding in this script is derived from pages it actually found. If
 * `dist/` is empty — a failed or skipped build, a wrong working directory —
 * there are no pages to fault, so the script would print "scanned 0" and exit
 * 0, reporting success for work it never inspected. That is the most dangerous
 * possible outcome for a gate: silence indistinguishable from a pass.
 *
 * The floor is deliberately a constant rather than a computed count: the point
 * is to detect "the site did not build", not to track the page total.
 */
const MIN_EXPECTED_PAGES = 5;
if (results.length < MIN_EXPECTED_PAGES) {
  console.error(
    `[check-meta-descriptions] FAIL — scanned only ${results.length} indexable ` +
      `page(s), expected at least ${MIN_EXPECTED_PAGES}. dist/ is empty or ` +
      `incomplete, so this check inspected nothing. Run \`astro build\` first.`,
  );
  process.exit(1);
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
