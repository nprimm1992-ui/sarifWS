/**
 * Sarif Consulting — social-preview (Open Graph / Twitter card) raster
 * pipeline.
 *
 * Source of truth:
 *   public/Create_a_premium_luxury_logo_for_SARIF_CONSULTING_-1776279344571.png
 *   — the canonical branded master. Historically this 1.9 MB raster
 *   was *also* served verbatim as `/og-image.png` (a copy created by
 *   the prior version of this script). Two consequences:
 *     1. Every share-render (Slack, Discord, iMessage, Twitter, LinkedIn,
 *        Mastodon, Bluesky) pulled 1.9 MB to render the same card, and
 *        the OG endpoint was missing the canonical 1.91 : 1 (1200 × 630)
 *        aspect that crawlers expect for `og:image`.
 *     2. The 1.9 MB asset was implicitly part of every page's resource
 *        tree (referenced by Base.astro's `<meta property="og:image">`
 *        / `<meta name="twitter:image">`), competing for connection
 *        slots during cold fetches.
 *
 * This script now does the right thing:
 *
 *   - Writes a 1200 × 630 JPEG (`/og-image.jpg`) as the universal OG
 *     fallback — every social crawler accepts JPEG and the canonical
 *     aspect ratio is the only one Slack/Discord/Twitter agree on.
 *   - Writes a 1200 × 630 AVIF (`/og-image.avif`) as a smaller-payload
 *     variant for browsers / crawlers that negotiate Accept: image/avif
 *     (modern Chrome / Safari / Firefox); the JPEG is the fallback.
 *   - Replaces the legacy `/og-image.png` content with the JPEG bytes
 *     so any external citation that still hard-codes `.png` (we cannot
 *     break old URLs) receives a small, correctly-sized payload. The
 *     bytes-level Content-Type is overridden in public/_headers so
 *     crawlers see `image/jpeg` regardless of the URL's `.png` suffix.
 *
 * Cold-network impact: the prior 1.9 MB pair is replaced by roughly
 * 80 KB AVIF + 120 KB JPEG. Net savings approach ~3.5 MB of cold bytes
 * the moment a page is shared on the modern social web.
 *
 * Sharp is used instead of an external optimizer (libvips ships with
 * Sharp; no system install required), matching the rest of the build
 * pipeline (`optimize-favicon.mjs`, `downsize-hdr.mjs`).
 *
 * Run: node scripts/generate-og-image.mjs
 */

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');

const SOURCE_NAME = 'Create_a_premium_luxury_logo_for_SARIF_CONSULTING_-1776279344571.png';
const sourcePath = path.join(pub, SOURCE_NAME);

if (!existsSync(sourcePath)) {
  console.error(`[generate-og-image] missing branded source: ${sourcePath}`);
  process.exit(1);
}

/* Canonical OG dimensions per the Open Graph protocol (1.91 : 1).
   Twitter, Slack, LinkedIn, Discord, iMessage, Mastodon, Bluesky all
   accept these — anything wider is letterboxed at the consumer end. */
const OG_W = 1200;
const OG_H = 630;

/* Smart-crop fits the image into the canonical aspect ratio without
   distorting it. The branded master is square-ish; sharp's `attention`
   strategy preserves the strongest visual feature (the wing emblem)
   in the centre of the cropped output. `fit: cover` ensures the
   1.91 : 1 frame is fully filled — no letterboxing, no transparent
   padding (JPEG has no alpha anyway). */
const sourceBuf = await fs.readFile(sourcePath);

/* Guard: source file exists but has no content (e.g. git LFS pointer not
   resolved in this environment). Existing og-image.* files are kept. */
if (sourceBuf.length === 0) {
  console.warn(
    `[generate-og-image] source image is empty (${SOURCE_NAME}) — ` +
    'skipping regeneration; existing public/og-image.* files are unchanged.',
  );
  process.exit(0);
}

const cropped = await sharp(sourceBuf)
  .resize(OG_W, OG_H, {
    fit: 'cover',
    position: sharp.strategy.attention,
  })
  .toBuffer();

/* JPEG output. Quality 82 + mozjpeg trellis quantisation is the
   industry-standard sweet spot for OG previews — visually
   indistinguishable from the source after social-platform recompression
   while landing under ~130 KB. `chromaSubsampling: '4:2:0'` is the
   universal default and what every social crawler expects. */
const jpegOut = path.join(pub, 'og-image.jpg');
await sharp(cropped)
  .jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:2:0', progressive: true })
  .toFile(jpegOut);
const jpegBytes = (await fs.stat(jpegOut)).size;
console.log(`Wrote public/og-image.jpg (${OG_W}×${OG_H}, ${(jpegBytes / 1024).toFixed(1)} KB)`);

/* AVIF — modern, small. `effort: 6` is a balance between encode time
   and final size; effort 9 saves <2% but takes ~6× as long and we run
   this every build. */
const avifOut = path.join(pub, 'og-image.avif');
await sharp(cropped)
  .avif({ quality: 60, effort: 6 })
  .toFile(avifOut);
const avifBytes = (await fs.stat(avifOut)).size;
console.log(`Wrote public/og-image.avif (${OG_W}×${OG_H}, ${(avifBytes / 1024).toFixed(1)} KB)`);

/* Legacy URL preservation. Old shares + cached crawler indexes still
   reference `/og-image.png`. Rather than serve the bloated 1.9 MB PNG
   forever, overwrite that file with the JPEG bytes. The CDN serves
   the smaller payload at the legacy URL; the matching Content-Type
   override lives in public/_headers so crawlers see `image/jpeg`. */
const legacyPng = path.join(pub, 'og-image.png');
await fs.copyFile(jpegOut, legacyPng);
console.log(`Mirrored og-image.jpg → og-image.png (legacy URL parity)`);
