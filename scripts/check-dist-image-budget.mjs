#!/usr/bin/env node
/**
 * Enforce dist/_astro image weight budgets — tripwire against Picture PNG
 * fallback bloat (Astro emits PNG <img> fallbacks even with avif/webp formats).
 *
 * Budgets (raw bytes in dist/_astro/):
 *   - Total PNG bytes across dist/_astro/*.png : 5 MB
 *   - Any single PNG file                    : 800 KB
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const astroDir = join(repoRoot, 'dist', '_astro');

const KB = 1024;
const MB = 1024 * KB;
const BUDGETS = {
  totalPng: 5 * MB,
  singlePng: 800 * KB,
};

if (!existsSync(astroDir)) {
  console.warn('[check-dist-image-budget] dist/_astro/ not found; skipping.');
  process.exit(0);
}

const pngFiles = [];
let totalPng = 0;

for (const entry of readdirSync(astroDir)) {
  if (!entry.endsWith('.png')) continue;
  const abs = join(astroDir, entry);
  const sz = statSync(abs).size;
  totalPng += sz;
  pngFiles.push({ rel: relative(repoRoot, abs), sz });
}

pngFiles.sort((a, b) => b.sz - a.sz);

const failures = [];

if (totalPng > BUDGETS.totalPng) {
  failures.push(
    `total PNG budget exceeded (${(BUDGETS.totalPng / MB).toFixed(1)} MB): dist/_astro = ${(totalPng / MB).toFixed(2)} MB across ${pngFiles.length} file(s)`,
  );
}

for (const { rel, sz } of pngFiles) {
  if (sz > BUDGETS.singlePng) {
    failures.push(
      `single PNG budget exceeded (${(BUDGETS.singlePng / KB).toFixed(0)} KB): ${rel} = ${(sz / KB).toFixed(1)} KB`,
    );
  }
}

console.log(
  `[check-dist-image-budget] dist/_astro PNG: ${(totalPng / MB).toFixed(2)} MB across ${pngFiles.length} file(s) (budget ${(BUDGETS.totalPng / MB).toFixed(1)} MB total)`,
);
if (pngFiles.length > 0) {
  console.log(
    '  top PNG files:\n' +
      pngFiles
        .slice(0, 5)
        .map(({ rel, sz }) => `    ${(sz / KB).toFixed(1).padStart(7)} KB  ${rel}`)
        .join('\n'),
  );
}

if (failures.length) {
  console.error(
    '\n[check-dist-image-budget] BUDGET FAILURES:\n' + failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
