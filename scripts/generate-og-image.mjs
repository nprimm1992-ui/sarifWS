/**
 * Verifies the branded social-preview raster and mirrors it to `og-image.png`
 * so legacy `/og-image.png` URLs stay in sync. Run: node scripts/generate-og-image.mjs
 */
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const brandedName = 'Create_a_premium_luxury_logo_for_SARIF_CONSULTING_-1776279344571.png';
const brandedPath = path.join(publicDir, brandedName);
const legacyPath = path.join(publicDir, 'og-image.png');

if (!existsSync(brandedPath)) {
  console.error(`Missing OG image (add to public/): ${brandedPath}`);
  process.exit(1);
}

copyFileSync(brandedPath, legacyPath);
console.log(`OG: ${brandedName} → og-image.png`);
