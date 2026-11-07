#!/usr/bin/env node
/**
 * Enforce JS bundle size budgets against the build output.
 *
 * Budgets (gzip-equivalent, computed via zlib):
 *   - Any single JS chunk                  : 180 KB
 *   - three.js chunk (lazy, but watch it)  : 180 KB
 *   - Total JS on the home route entry     : 260 KB
 *
 * The point isn't precision — it's a tripwire. If a future dependency
 * swap silently balloons the bundle, this script fails loudly before it
 * hits production. Tune the caps when intentional.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist');

const KB = 1024;
const BUDGETS = {
  perChunk: 180 * KB,
  three: 180 * KB,
  homeRoute: 260 * KB,
};

if (!existsSync(distDir)) {
  console.warn('[check-bundle-budget] dist/ not found; skipping.');
  process.exit(0);
}

const jsFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const s = statSync(abs);
    if (s.isDirectory()) walk(abs);
    else if (entry.endsWith('.js') && !entry.endsWith('.map.js')) jsFiles.push(abs);
  }
}
walk(distDir);

function gzipSize(absPath) {
  const buf = readFileSync(absPath);
  return gzipSync(buf).length;
}

const failures = [];
let total = 0;
let threeSize = 0;
const perChunk = [];

for (const abs of jsFiles) {
  const rel = relative(distDir, abs);
  const sz = gzipSize(abs);
  total += sz;
  perChunk.push({ rel, sz });

  if (sz > BUDGETS.perChunk) {
    failures.push(
      `per-chunk budget exceeded (${(BUDGETS.perChunk / KB).toFixed(0)} KB): ${rel} = ${(sz / KB).toFixed(1)} KB gz`,
    );
  }
  if (rel.toLowerCase().includes('three') && sz > BUDGETS.three) {
    threeSize = sz;
    failures.push(
      `three budget exceeded (${(BUDGETS.three / KB).toFixed(0)} KB): ${rel} = ${(sz / KB).toFixed(1)} KB gz`,
    );
  } else if (rel.toLowerCase().includes('three')) {
    threeSize = sz;
  }
}

/**
 * Round-4 phase-5 polish — replace the old `entry|index|client` regex
 * heuristic with an exact HTML parse. Astro writes `dist/index.html`
 * for the root route; that document lists every critical-path script
 * the browser pulls before first paint (both `<script src>` and
 * Astro's renderer-script injection). We walk the `<script>` tags
 * with a non-greedy regex (no full DOM parser needed for a tripwire),
 * resolve each `src=` relative to dist/, and sum their gzip sizes.
 * This closes the accuracy gap where many non-home chunks (e.g.
 * admin/vitals/index.astro's chunk) matched `index` and inflated
 * the previous proxy metric.
 *
 * Fallbacks stay safe: if dist/index.html is missing (unusual build
 * output) we emit a warning and skip the home-route check rather
 * than producing a false negative.
 */
const homeHtmlPath = join(distDir, 'index.html');
if (!existsSync(homeHtmlPath)) {
  console.warn(
    '[check-bundle-budget] dist/index.html not found; home-route budget check skipped.',
  );
} else {
  const html = readFileSync(homeHtmlPath, 'utf8');
  const SCRIPT_TAG_RE = /<script\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')[^>]*>/gi;
  const scriptSrcs = new Set();
  for (const match of html.matchAll(SCRIPT_TAG_RE)) {
    const src = match[1] || match[2] || '';
    if (!src) continue;
    /* Skip off-origin scripts (Turnstile challenge etc.) — they have
       their own budget the platform enforces and aren't part of our
       own bundle. */
    if (/^https?:\/\//i.test(src)) continue;
    /* Drop leading '/' so we can join relative to dist/. */
    const rel = src.replace(/^\/+/, '');
    scriptSrcs.add(rel);
  }

  let homeEntry = 0;
  const missing = [];
  for (const rel of scriptSrcs) {
    const abs = join(distDir, rel);
    if (!existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    homeEntry += gzipSize(abs);
  }

  if (missing.length > 0) {
    console.warn(
      `[check-bundle-budget] ${missing.length} home-route script(s) referenced in index.html missing from dist/: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
    );
  }

  if (homeEntry > BUDGETS.homeRoute) {
    failures.push(
      `home route budget exceeded (${(BUDGETS.homeRoute / KB).toFixed(0)} KB): ${(homeEntry / KB).toFixed(1)} KB gz across ${scriptSrcs.size} chunks`,
    );
  }
  console.log(
    `  ── home route: ${(homeEntry / KB).toFixed(1)} KB gz across ${scriptSrcs.size} chunks (budget ${(BUDGETS.homeRoute / KB).toFixed(0)} KB)`,
  );
}

/**
 * Jensen is a lazy chunk. The launcher shell has to stay tiny because it
 * is on every page; the panel chunk and its CSS load only after intent.
 * `three` must not be pulled into either.
 */
const JENSEN_SHELL_MAX = 2 * KB;
const JENSEN_APP_MAX = 24 * KB;
const JENSEN_CSS_MAX = 8 * KB;

function chunkContaining(marker) {
  return jsFiles.find((abs) => readFileSync(abs, 'utf8').includes(marker)) ?? null;
}

function staticJsImports(abs) {
  const text = readFileSync(abs, 'utf8');
  const dir = dirname(abs);
  const refs = new Set();
  const pattern = /(?:from|import)\s*["'](\.[^"']+\.js)["']|import["'](\.[^"']+\.js)["']/g;
  for (const match of text.matchAll(pattern)) {
    refs.add(join(dir, match[1] || match[2]));
  }
  return [...refs];
}

const shellChunk = chunkContaining('sarif:jensen-loader');
if (!shellChunk) {
  failures.push('Jensen launcher marker sarif:jensen-loader was not found in dist JS');
} else {
  const shellSize = gzipSize(shellChunk);
  console.log(`  ── jensen shell: ${(shellSize / KB).toFixed(1)} KB gz (budget 2 KB)`);
  if (shellSize > JENSEN_SHELL_MAX) {
    failures.push(
      `jensen shell budget exceeded (2 KB): ${relative(distDir, shellChunk)} = ${(shellSize / KB).toFixed(1)} KB gz`,
    );
  }
}

const appChunk = chunkContaining('sarif:jensen-app');
if (!appChunk) {
  failures.push('Jensen app marker sarif:jensen-app was not found in dist JS');
} else {
  const seen = new Set();
  const queue = [appChunk];
  let appSize = 0;
  while (queue.length > 0) {
    const abs = queue.pop();
    if (!abs || seen.has(abs) || !existsSync(abs)) continue;
    seen.add(abs);
    const rel = relative(distDir, abs).replace(/\\/g, '/').toLowerCase();
    if (rel.includes('three')) {
      failures.push(`three.js is in the Jensen chunk graph via ${rel}`);
      continue;
    }
    appSize += gzipSize(abs);
    for (const next of staticJsImports(abs)) queue.push(next);
  }
  console.log(`  ── jensen app closure: ${(appSize / KB).toFixed(1)} KB gz (budget 24 KB)`);
  if (appSize > JENSEN_APP_MAX) {
    failures.push(`jensen app budget exceeded (24 KB): ${(appSize / KB).toFixed(1)} KB gz`);
  }
}

const cssFiles = [];
function walkCss(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const s = statSync(abs);
    if (s.isDirectory()) walkCss(abs);
    else if (entry.endsWith('.css')) cssFiles.push(abs);
  }
}
walkCss(distDir);
let jensenCss = 0;
let jensenCssFiles = 0;
for (const abs of cssFiles) {
  if (!readFileSync(abs, 'utf8').includes('jensen-trace-hub')) continue;
  jensenCss += gzipSize(abs);
  jensenCssFiles += 1;
}
console.log(`  ── jensen css: ${(jensenCss / KB).toFixed(1)} KB gz across ${jensenCssFiles} file(s) (budget 8 KB)`);
if (jensenCssFiles === 0) {
  failures.push('Jensen panel CSS (jensen-trace-hub) was not emitted');
} else if (jensenCss > JENSEN_CSS_MAX) {
  failures.push(`jensen css budget exceeded (8 KB): ${(jensenCss / KB).toFixed(1)} KB gz`);
}

perChunk.sort((a, b) => b.sz - a.sz);
console.log(
  `[check-bundle-budget] top JS chunks (gzip):\n` +
    perChunk
      .slice(0, 8)
      .map(({ rel, sz }) => `  ${(sz / KB).toFixed(1).padStart(6)} KB  ${rel}`)
      .join('\n') +
    `\n  ── total JS: ${(total / KB).toFixed(1)} KB gz` +
    (threeSize ? ` | three: ${(threeSize / KB).toFixed(1)} KB gz` : ''),
);

if (failures.length) {
  console.error(
    '\n[check-bundle-budget] BUDGET FAILURES:\n' + failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
