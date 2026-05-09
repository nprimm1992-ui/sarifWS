#!/usr/bin/env node
/**
 * Copies self-hosted font files from node_modules/@fontsource/* into
 * public/fonts/ so they ship with the static site and CSP can drop
 * fonts.googleapis.com entirely.
 *
 * Only latin subsets for the weights we actually use are synced — every
 * extra byte in font loading directly costs LCP on mobile.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const publicFonts = join(repoRoot, 'public', 'fonts');

if (!existsSync(publicFonts)) {
  mkdirSync(publicFonts, { recursive: true });
}

const SUBSET = 'latin';

const FAMILIES = [
  { pkg: 'orbitron', prefix: 'orbitron', weights: [400, 500, 600, 700] },
  { pkg: 'inter', prefix: 'inter', weights: [300, 400, 500, 600] },
  { pkg: 'space-grotesk', prefix: 'space-grotesk', weights: [400, 500, 600, 700] },
];

let copied = 0;
for (const { pkg, prefix, weights } of FAMILIES) {
  const src = join(repoRoot, 'node_modules', '@fontsource', pkg, 'files');
  if (!existsSync(src)) {
    console.warn(`[sync-fonts] skipping ${pkg}: package not installed.`);
    continue;
  }
  const available = new Set(readdirSync(src));
  for (const weight of weights) {
    const fileName = `${prefix}-${SUBSET}-${weight}-normal.woff2`;
    if (!available.has(fileName)) {
      console.warn(`[sync-fonts] missing ${fileName} in @fontsource/${pkg}`);
      continue;
    }
    const dstName = `${prefix}-${weight}.woff2`;
    copyFileSync(join(src, fileName), join(publicFonts, dstName));
    copied += 1;
  }
}

console.log(`[sync-fonts] copied ${copied} woff2 file(s) to public/fonts/.`);
