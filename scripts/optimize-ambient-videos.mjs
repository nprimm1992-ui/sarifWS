/**
 * Sarif Consulting — ambient video optimisation pipeline.
 *
 * Why this exists:
 *   The repo ships two decorative video clips referenced from
 *   `src/components/AboutDossierCard.astro`:
 *
 *     public/Context flow.mp4  (~6.1 MB, H.264)
 *     public/Amber_Light_Network_..._kY2lTZ1w.mp4  (~3.3 MB, H.264)
 *
 *   The card consumes these at most a few hundred CSS pixels tall and
 *   loops them silently. Shipping them at full quality / size wastes
 *   roughly 9 MB of cold bandwidth per visit to /about/, and (because
 *   speculation rules used to prerender that route from /) a chunk of
 *   that 9 MB was paid on the landing page itself. Even after switching
 *   to `prefetch` and lazy-loading the <video> elements, the bytes
 *   themselves remain large.
 *
 * What this script does:
 *   When `ffmpeg` is available on PATH, re-encodes each clip in-place
 *   to:
 *
 *     - AV1 / WebM   (smallest, modern: ~50–60% the size at the same
 *                      perceptual quality; played by Chrome/Edge/Firefox
 *                      with hardware decode on most desktops shipped
 *                      since 2021)
 *     - H.264 / MP4  (universal fallback; resampled to a sane bitrate
 *                      and downscaled to a max of 960 px wide, which
 *                      exceeds the largest CSS pixel size the card
 *                      ever renders at on a 4K viewport)
 *
 *   Both variants are emitted next to the original; a future commit
 *   that updates AboutDossierCard.astro to render `<source>` tags for
 *   AV1 + MP4 will let the browser negotiate the smallest supported
 *   variant.
 *
 *   When ffmpeg is NOT installed, the script logs the canonical
 *   commands and exits 0. This keeps `npm run build:assets` green on
 *   environments without ffmpeg (CI, the in-repo development sandbox)
 *   while giving the local maintainer a copy-paste path to do the
 *   re-encoding themselves and commit the smaller files.
 *
 * Run: node scripts/optimize-ambient-videos.mjs
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');

/** Clips referenced by AboutDossierCard. Each entry is a candidate
 *  source filename (relative to /public). The first existing match
 *  wins — matches AboutDossierCard's own pickAboutVideoUrl logic so
 *  this script always operates on the file the page actually serves. */
const CLIPS = [
  {
    label: 'methodology',
    candidates: [
      'Context flow.mp4',
      'media/about/context-flow.mp4',
    ],
  },
  {
    label: 'principle',
    candidates: [
      'Amber_Light_Network_In_a_cinematic_style_a_man_with_short_brown_hair_kY2lTZ1w.mp4',
      'media/about/amber-network.mp4',
    ],
  },
];

const MAX_WIDTH = 960;
const TARGET_FPS = 24;
const AV1_CRF = 32;
const H264_CRF = 23;

function which(cmd) {
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function pickSource(clip) {
  for (const candidate of clip.candidates) {
    const abs = path.join(pub, candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function av1OutPath(srcPath) {
  return srcPath.replace(/\.mp4$/i, '.av1.webm');
}
function mp4OutPath(srcPath) {
  return srcPath.replace(/\.mp4$/i, '.opt.mp4');
}

async function encodeClip(srcPath) {
  const stat = await fs.stat(srcPath);
  console.log(`\n[${path.basename(srcPath)}] source: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);

  /* AV1 / WebM. libaom-av1 is universally available in static builds;
     SVT-AV1 is faster but not present in every distribution package.
     `-row-mt 1 -tile-columns 2` is the standard recipe for a sane
     encoder time on multi-core desktops. Audio is dropped (silent loop). */
  const av1Out = av1OutPath(srcPath);
  await run('ffmpeg', [
    '-y', '-i', srcPath,
    '-an',
    '-vf', `scale='min(${MAX_WIDTH},iw)':-2,fps=${TARGET_FPS}`,
    '-c:v', 'libaom-av1',
    '-crf', String(AV1_CRF),
    '-b:v', '0',
    '-row-mt', '1',
    '-tile-columns', '2',
    '-cpu-used', '5',
    '-pix_fmt', 'yuv420p',
    av1Out,
  ]);

  /* H.264 / MP4 fallback. faststart moves the moov atom to the front
     so the file begins playing while it streams (matters on slow
     connections; the lazy-load IO already preloads it before viewport). */
  const mp4Out = mp4OutPath(srcPath);
  await run('ffmpeg', [
    '-y', '-i', srcPath,
    '-an',
    '-vf', `scale='min(${MAX_WIDTH},iw)':-2,fps=${TARGET_FPS}`,
    '-c:v', 'libx264',
    '-preset', 'slower',
    '-crf', String(H264_CRF),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    mp4Out,
  ]);

  /* Replace the original with the optimised MP4 so existing references
     keep working without any markup change. The AV1 variant is emitted
     next to it for future <source> negotiation. */
  await fs.rename(mp4Out, srcPath);

  const after = await fs.stat(srcPath);
  const av1 = await fs.stat(av1Out);
  console.log(`  → mp4: ${(after.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`  → av1: ${(av1.size / (1024 * 1024)).toFixed(2)} MB (${path.relative(root, av1Out)})`);
}

async function main() {
  const hasFfmpeg = await which('ffmpeg');
  if (!hasFfmpeg) {
    console.log('[optimize-ambient-videos] ffmpeg not found on PATH — skipping.');
    console.log('To re-encode locally and commit the smaller files, run:');
    console.log('');
    for (const clip of CLIPS) {
      const src = await pickSource(clip);
      if (!src) continue;
      const rel = path.relative(root, src);
      console.log(`  # ${clip.label}: ${rel}`);
      console.log(`  ffmpeg -y -i "${rel}" -an \\`);
      console.log(`    -vf "scale='min(${MAX_WIDTH},iw)':-2,fps=${TARGET_FPS}" \\`);
      console.log(`    -c:v libaom-av1 -crf ${AV1_CRF} -b:v 0 -row-mt 1 -tile-columns 2 \\`);
      console.log(`    -cpu-used 5 -pix_fmt yuv420p "${rel.replace(/\.mp4$/i, '.av1.webm')}"`);
      console.log(`  ffmpeg -y -i "${rel}" -an \\`);
      console.log(`    -vf "scale='min(${MAX_WIDTH},iw)':-2,fps=${TARGET_FPS}" \\`);
      console.log(`    -c:v libx264 -preset slower -crf ${H264_CRF} -pix_fmt yuv420p \\`);
      console.log(`    -movflags +faststart "${rel.replace(/\.mp4$/i, '.opt.mp4')}"`);
      console.log(`  mv "${rel.replace(/\.mp4$/i, '.opt.mp4')}" "${rel}"`);
      console.log('');
    }
    return;
  }

  for (const clip of CLIPS) {
    const src = await pickSource(clip);
    if (!src) {
      console.log(`[${clip.label}] no source on disk; skipping.`);
      continue;
    }
    await encodeClip(src);
  }
}

await main();
