#!/usr/bin/env node
/**
 * Enforce GLB size budgets in public/*.glb before they ship to dist/.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pub = join(__dirname, '..', 'public');

const KB = 1024;
const MB = 1024 * KB;

/** Emblem and small props. */
const MAX_GLB_DEFAULT = 0.5 * MB;
/** Center lobby garden (terraced-garden-3d-model-low). */
const MAX_GLB_CENTER_PLANTER = 1.0 * MB;
/** Side concrete planters after simplify pipeline (~1.5–1.7 MB). */
const MAX_GLB_SIDE_PLANTER = 1.7 * MB;

const CENTER_PLANTER = 'terraced-garden-3d-model-low.glb';
const SIDE_PLANTER_PATTERN = /concrete-planter|concrete-planters/i;

/**
 * @param {string} name
 * @returns {number}
 */
function maxBytesForGlb(name) {
  if (name === CENTER_PLANTER) return MAX_GLB_CENTER_PLANTER;
  if (SIDE_PLANTER_PATTERN.test(name)) return MAX_GLB_SIDE_PLANTER;
  return MAX_GLB_DEFAULT;
}

if (!existsSync(pub)) {
  console.warn('[check-glb-budget] public/ not found; skipping.');
  process.exit(0);
}

const glbs = readdirSync(pub)
  .filter((f) => f.endsWith('.glb'))
  .map((f) => {
    const abs = join(pub, f);
    return { name: f, abs, sz: statSync(abs).size };
  });

if (glbs.length === 0) {
  console.log('[check-glb-budget] no GLBs in public/ — OK');
  process.exit(0);
}

const failures = [];
for (const { name, sz } of glbs) {
  const max = maxBytesForGlb(name);
  if (sz > max) {
    failures.push(
      `${name}: ${(sz / MB).toFixed(2)} MB (budget ${(max / MB).toFixed(2)} MB)`,
    );
  }
}

glbs.sort((a, b) => b.sz - a.sz);
console.log(
  '[check-glb-budget] public GLBs:\n' +
    glbs
      .map(({ name, sz }) => `  ${(sz / MB).toFixed(2).padStart(5)} MB  ${name}`)
      .join('\n'),
);

if (failures.length) {
  console.error(
    '\n[check-glb-budget] BUDGET FAILURES:\n' + failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}

console.log('[check-glb-budget] OK — all GLBs within budget.');
