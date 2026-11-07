#!/usr/bin/env node
/**
 * Unit mirror of check-dist-image-budget postbuild gate thresholds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const astroDir = join(__dirname, '..', 'dist', '_astro');
const MB = 1024 * 1024;
const TOTAL_BUDGET = 5 * MB;
const SINGLE_BUDGET = 800 * 1024;

test('dist/_astro PNG weight stays within deploy budget when dist exists', () => {
  if (!existsSync(astroDir)) {
    return;
  }
  let total = 0;
  for (const entry of readdirSync(astroDir)) {
    if (!entry.endsWith('.png')) continue;
    const sz = statSync(join(astroDir, entry)).size;
    total += sz;
    assert.ok(sz <= SINGLE_BUDGET, `${entry} exceeds single PNG budget`);
  }
  assert.ok(total <= TOTAL_BUDGET, `total PNG ${total} exceeds budget`);
});
