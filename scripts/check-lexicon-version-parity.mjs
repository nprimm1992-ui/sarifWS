#!/usr/bin/env node
/**
 * Enforces lockstep between:
 *   - src/lib/lexicon-version.ts          (Astro / site)
 *   - functions/api/_shared/lexicon-version.js  (Cloudflare Pages Functions)
 *
 * LEXICON_VERSION is a versioned pointer to the canonical lexicon state stamped
 * onto every /api/transmit row. Drift between these two constants means the
 * site and the API disagree on which corpus was active at intake — silently
 * poisoning future Jensen drafts. Build fails fast if they diverge.
 *
 * Runs as part of `npm run build` (via `prebuild`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const VERSION_RE = /LEXICON_VERSION\s*=\s*['"]([^'"]+)['"]/;

function readVersion(relPath) {
  const abs = join(repoRoot, relPath);
  const text = readFileSync(abs, 'utf8');
  const m = text.match(VERSION_RE);
  if (!m) {
    throw new Error(`LEXICON_VERSION export not found in ${relPath}`);
  }
  return m[1];
}

const siteVersion = readVersion('src/lib/lexicon-version.ts');
const fnVersion = readVersion('functions/api/_shared/lexicon-version.js');

if (siteVersion !== fnVersion) {
  console.error(
    `\u001b[31m[lexicon-version parity] DRIFT DETECTED\u001b[0m\n` +
      `  src/lib/lexicon-version.ts          = ${siteVersion}\n` +
      `  functions/api/_shared/lexicon-version.js = ${fnVersion}\n` +
      `\n` +
      `These must match. Bump both together per the policy in src/lib/lexicon-version.ts.`,
  );
  process.exit(1);
}

console.log(`lexicon-version parity OK: ${siteVersion}`);
