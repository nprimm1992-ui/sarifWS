/**
 * Sarif favicon + apple-touch-icon pipeline.
 *
 * Source of truth (first match wins):
 *   1. public/phoenix-emblem-master.png — optional drop-in master (transparent PNG).
 *   2. public/Remove_background_from_this_golden_winged_emblem_i-1775897943419.png
 *      — legacy canonical name. Every raster surface (Praxis dossier, iOS home
 *      screen, Windows taskbar, high-DPI tab) is derived from this one file so
 *      the mark reads identically everywhere.
 *
 * Note: Base.astro intentionally does NOT expose favicon.svg as an <link
 * rel="icon" type="image/svg+xml">, because browsers that see both SVG and
 * PNG candidates prefer SVG — and the vector doesn't match the golden-winged
 * raster. PNG is authoritative for the tab icon.
 *
 * Outputs (full modern favicon set so every surface can pick a native-
 * resolution source rather than downscaling from a small master):
 *   public/phoenix-emblem.png       — 512×512 raster (Praxis dossier seal /
 *                                   watermark / footer mark, PWA splash, emblem fallback)
 *   public/apple-touch-icon.png     — 180×180 (iOS home screen)
 *   public/favicon-32.png           — 32×32  (browser tab @ 1× DPR)
 *   public/favicon-48.png           — 48×48  (Windows taskbar small)
 *   public/favicon-96.png           — 96×96  (browser tab @ 2–3× DPR, Android TV)
 *   public/favicon-192.png          — 192×192 (Android home screen, Chrome PWA)
 *   public/favicon-512.png          — 512×512 (Android max, PWA install)
 *
 * Run: node scripts/optimize-favicon.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const masterPath = path.join(pub, 'phoenix-emblem-master.png');
const legacyPath = path.join(
  pub,
  'Remove_background_from_this_golden_winged_emblem_i-1775897943419.png',
);
let sourcePath = legacyPath;
try {
  await fs.access(masterPath);
  sourcePath = masterPath;
} catch {
  /* use legacy */
}

const sourcePng = await fs.readFile(sourcePath);

const SQUARE_MAIN = 512;
const SQUARE_APPLE = 180;
/* Full favicon ladder. Browsers negotiate the best match for their
   rendering context (DPR, launcher icon slot, PWA splash) from the
   <link rel="icon" sizes=...> set declared in Base.astro — so shipping
   the full ladder is the correct answer to "max size": every surface
   gets a native-resolution source instead of downscaling from 48px. */
const FAVICON_SIZES = [32, 48, 96, 192, 512];

async function writePng(buffer, width, height, outPath) {
  await sharp(buffer)
    .resize(width, height, {
      fit: 'contain',
      position: 'center',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(outPath);
  console.log(`Wrote ${path.relative(root, outPath)} (${width}×${height})`);
}

/* Strip transparent edge padding from the source before resizing so the
   emblem fills the output canvas instead of sitting inside a tiny
   centered box. Without .trim(), a source PNG with 30% transparent
   border would render as a 22×22 emblem inside a 32×32 favicon — which
   is why the tab mark previously appeared unusually small. Threshold 10
   out of 255 tolerates mild fringe antialiasing without eating glyph
   edges. After trim the image is cropped to its content bounding box,
   then `fit: contain` resizes it into the square target preserving
   aspect ratio (adds minimal padding only on the shorter axis). */
const basePng = await sharp(sourcePng)
  .trim({ threshold: 10 })
  .resize(SQUARE_MAIN, SQUARE_MAIN, {
    fit: 'contain',
    position: 'center',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png({ compressionLevel: 9, effort: 10 })
  .toBuffer();

await fs.writeFile(path.join(pub, 'phoenix-emblem.png'), basePng);
console.log(`Wrote public/phoenix-emblem.png (${SQUARE_MAIN}×${SQUARE_MAIN})`);

await writePng(basePng, SQUARE_APPLE, SQUARE_APPLE, path.join(pub, 'apple-touch-icon.png'));

for (const size of FAVICON_SIZES) {
  await writePng(basePng, size, size, path.join(pub, `favicon-${size}.png`));
}
