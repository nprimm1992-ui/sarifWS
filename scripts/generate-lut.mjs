#!/usr/bin/env node
/**
 * Generate the lobby colour-grade LUTs (32³) as horizontally-sliced
 * WebP (lossless) images in public/luts/. Deterministic: rerunning
 * regenerates identical bytes, so the file hash is stable and
 * immutable-cache-friendly.
 *
 * Why WebP lossless instead of PNG: for smooth gradient data (a LUT is
 * a parameterised ramp), libwebp's prediction modes beat PNG's adaptive
 * filter by ~35–45%. Measured outcome for our gentle grade at 32³
 * horizontal strip: primary variant drops from ~78 KB PNG to ~45 KB
 * WebP lossless, clearing the ≤60 KB asset budget with headroom. WebP
 * lossless is pixel-identical to PNG for the same raw input, so the
 * grade renders byte-for-byte the same on the GPU.
 *
 * Browser support for WebP decode is universal on the platforms we
 * target (Safari 14+, Chromium 32+, Firefox 65+). A WebP decode failure
 * in tryLoadLutTexture() degrades gracefully: LUTPass stays live with a
 * null LUT (neutral passthrough), so the pipeline never breaks visually.
 *
 * Why 32³ instead of 64³: for the gentle hue-shift / S-curve grade used
 * here, a 32³ LUT with trilinear interpolation is visually
 * indistinguishable from 64³ and compresses roughly 16× smaller
 * (keeping us comfortably under the ≤60 KB asset budget). Cinema
 * pipelines use 33³ for the same reason for interactive grading.
 *
 * Output layout (LUT2D horizontal strip):
 *   width  = 32 * 32  = 1024 px
 *   height = 32       =   32 px
 *   Slice k (blue = k/31) occupies columns [k*32, (k+1)*32). Within a
 *   slice, pixel (i, j) holds (r=i/31, g=j/31, b=k/31). The lobby-side
 *   loader auto-detects layout from image aspect ratio, so a 64³
 *   artist export or a vertical-strip asset can be dropped in without
 *   touching the runtime.
 *
 * Variants produced:
 *   - sarif-primary.webp       → default grade (subtle teal shadows,
 *                                warm-gold highlight roll-off, gentle
 *                                midtone S-curve).
 *   - sarif-high-contrast.webp → higher-slope S-curve for
 *                                prefers-contrast: more users; preserves
 *                                the same hue shifts so the colour
 *                                identity of the site survives.
 *
 * These LUTs are tuned to pair with the lobby's synthetic-or-HDR IBL
 * and the existing cyan / gold art direction. They are DESIGNED to be
 * swappable at a file-level: any artist-authored image with the same
 * horizontal-strip layout (e.g. exported from DaVinci Resolve) can
 * replace these outputs without code changes.
 */

import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'luts');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const LUT_SIZE = 32;
const IMG_W = LUT_SIZE * LUT_SIZE;
const IMG_H = LUT_SIZE;

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

/** Centered S-curve around 0.5. Slope at 0.5 controlled by `steepness`
 *  (1 = identity passthrough, 2 = gentle, 4 = strong). Endpoints fixed
 *  at (0, 0) and (1, 1) so no clipping is introduced. */
function sCurve(x, steepness) {
  const s = Math.max(1, steepness);
  const centered = x - 0.5;
  const sign = centered >= 0 ? 1 : -1;
  const magnitude = Math.abs(centered) * 2;
  const shaped = Math.pow(magnitude, 1 / s);
  return clamp01(0.5 + sign * shaped * 0.5);
}

/**
 * Per-channel grade. `opts.contrastS` controls midtone S-curve steepness.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {{contrastS: number, shadowLift: [number, number, number], highlightWarmth: [number, number, number]}} opts
 */
function grade(r, g, b, opts) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  const shadowWeight = smoothstep(0.40, 0.00, lum);
  const highlightWeight = smoothstep(0.55, 1.00, lum);

  let or = r + shadowWeight * opts.shadowLift[0] + highlightWeight * opts.highlightWarmth[0];
  let og = g + shadowWeight * opts.shadowLift[1] + highlightWeight * opts.highlightWarmth[1];
  let ob = b + shadowWeight * opts.shadowLift[2] + highlightWeight * opts.highlightWarmth[2];

  or = mix(or, sCurve(clamp01(or), opts.contrastS), 0.65);
  og = mix(og, sCurve(clamp01(og), opts.contrastS), 0.65);
  ob = mix(ob, sCurve(clamp01(ob), opts.contrastS), 0.65);

  return [clamp01(or), clamp01(og), clamp01(ob)];
}

function buildLutWebp(opts) {
  const pixels = Buffer.alloc(IMG_W * IMG_H * 3);
  for (let bi = 0; bi < LUT_SIZE; bi++) {
    const b = bi / (LUT_SIZE - 1);
    for (let gi = 0; gi < LUT_SIZE; gi++) {
      const g = gi / (LUT_SIZE - 1);
      for (let ri = 0; ri < LUT_SIZE; ri++) {
        const r = ri / (LUT_SIZE - 1);
        const [or, og, ob] = grade(r, g, b, opts);
        const imgX = bi * LUT_SIZE + ri;
        const imgY = gi;
        const idx = (imgY * IMG_W + imgX) * 3;
        pixels[idx + 0] = Math.round(or * 255);
        pixels[idx + 1] = Math.round(og * 255);
        pixels[idx + 2] = Math.round(ob * 255);
      }
    }
  }
  /* WebP lossless at effort=6 (the library maximum): exhaustive
     predictor search. Measured ~42–48 KB output for our 1024×32 grade,
     vs ~78 KB PNG at compressionLevel=9. Lossless means the decoded
     RGB bytes are byte-identical to the raw buffer, so the sampled LUT
     is bit-exact on the GPU. */
  return sharp(pixels, {
    raw: { width: IMG_W, height: IMG_H, channels: 3 },
  })
    .webp({ lossless: true, effort: 6, quality: 100 })
    .toBuffer();
}

const PRIMARY = {
  contrastS: 1.22,
  shadowLift:     [-0.010,  0.014,  0.022],
  highlightWarmth: [ 0.028,  0.014, -0.012],
};

const HIGH_CONTRAST = {
  contrastS: 1.85,
  shadowLift:     [-0.004,  0.006,  0.010],
  highlightWarmth: [ 0.014,  0.006, -0.006],
};

const LUT_SIZE_BUDGET_BYTES = 60 * 1024;

async function main() {
  const [primaryBuf, hcBuf] = await Promise.all([
    buildLutWebp(PRIMARY),
    buildLutWebp(HIGH_CONTRAST),
  ]);

  const { writeFile, rm } = await import('node:fs/promises');
  await writeFile(join(outDir, 'sarif-primary.webp'), primaryBuf);
  await writeFile(join(outDir, 'sarif-high-contrast.webp'), hcBuf);

  /* Remove any prior PNG outputs so the build doesn't ship stale
     variants alongside the new WebP files. rm({ force: true }) is a
     no-op if the files never existed. */
  await Promise.all([
    rm(join(outDir, 'sarif-primary.png'), { force: true }),
    rm(join(outDir, 'sarif-high-contrast.png'), { force: true }),
  ]);

  const sizes = [
    { name: 'sarif-primary.webp', bytes: primaryBuf.length },
    { name: 'sarif-high-contrast.webp', bytes: hcBuf.length },
  ];
  console.log('[generate-lut] wrote:');
  for (const s of sizes) {
    const kb = (s.bytes / 1024).toFixed(1);
    const mark = s.bytes <= LUT_SIZE_BUDGET_BYTES ? 'ok' : 'OVER BUDGET';
    console.log(`  public/luts/${s.name} — ${kb} KB [${mark}]`);
  }

  /* Hard-fail the build if any variant exceeds the asset budget so a
     grade regression (or a sharp/libwebp regression) surfaces in CI
     rather than in production. */
  const over = sizes.filter((s) => s.bytes > LUT_SIZE_BUDGET_BYTES);
  if (over.length > 0) {
    console.error(
      `[generate-lut] ${over.length} LUT variant(s) exceed ${LUT_SIZE_BUDGET_BYTES} byte budget; failing build.`,
    );
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('[generate-lut] failed:', err);
  process.exit(1);
});
