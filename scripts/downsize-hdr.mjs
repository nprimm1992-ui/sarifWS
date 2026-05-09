#!/usr/bin/env node
/**
 * Downsize a source HDR (RGBE / .hdr) to the two resolutions the lobby
 * consumes at runtime:
 *   - public/env/lobby-studio.hdr        → 256×128 (desktop IBL)
 *   - public/env/lobby-studio-mobile.hdr → 128×64  (mobile IBL)
 *
 * Input source (if present):
 *   - public/env/lobby-studio-source.hdr
 *
 * Behaviour:
 *   - If the source file is missing, exit 0 silently. The lobby's
 *     runtime path gracefully falls back to its synthetic hemisphere
 *     envScene when the downsized HDR is absent, so the build is not
 *     blocked by the absence of a source HDR.
 *   - If the source is present, parse the RGBE container (ASCII header
 *     + RLE-encoded body), nearest-neighbour downsample to the two
 *     target sizes, and write back out in RGBE format so Three.js's
 *     RGBELoader can read them natively.
 *
 * Why nearest-neighbour and not bilinear: the lobby passes the HDR
 * through PMREMGenerator at runtime, which applies its own multi-sample
 * prefilter. A higher-quality resize here wastes build cycles for no
 * visible gain; nearest preserves the peak-HDR-range pixels that drive
 * bright reflections on the gold wing emblem.
 *
 * RGBE spec reference: Ward 1991, "Real Pixels" (Graphics Gems II).
 * This parser handles the common Radiance header format and the
 * adaptive RLE body; images written by Poly Haven, HDRIHaven, and
 * Cycles-baked environments all fall into that class.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envDir = join(__dirname, '..', 'public', 'env');
const SOURCE = join(envDir, 'lobby-studio-source.hdr');

const TARGETS = [
  { name: 'lobby-studio.hdr',        w: 256, h: 128 },
  { name: 'lobby-studio-mobile.hdr', w: 128, h:  64 },
];

if (!existsSync(SOURCE)) {
  console.log('[downsize-hdr] no source HDR at public/env/lobby-studio-source.hdr — skipping.');
  console.log('               runtime falls back to the synthetic hemisphere env; drop a source HDR');
  console.log('               (e.g. a CC0 Poly Haven studio file) into that path to enable this pipeline.');
  process.exit(0);
}

function parseRgbe(buf) {
  /* Radiance header terminates at a double-newline; the format line and
     resolution line we care about are ASCII. */
  let headerEnd = -1;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0x0a && buf[i + 1] === 0x0a) { headerEnd = i + 2; break; }
  }
  if (headerEnd < 0) throw new Error('malformed HDR header (no double-newline)');
  const header = buf.subarray(0, headerEnd).toString('ascii');
  if (!/^#\?RADIANCE/i.test(header) && !/^#\?RGBE/i.test(header)) {
    throw new Error('not a Radiance/RGBE HDR');
  }
  /* Locate resolution line after the header; Radiance uses "-Y H +X W". */
  const rest = buf.subarray(headerEnd);
  let resEnd = -1;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === 0x0a) { resEnd = i; break; }
  }
  if (resEnd < 0) throw new Error('malformed HDR: missing resolution line');
  const resLine = rest.subarray(0, resEnd).toString('ascii');
  const m = resLine.match(/^([+-][XY])\s+(\d+)\s+([+-][XY])\s+(\d+)/);
  if (!m) throw new Error(`malformed HDR resolution line: ${resLine}`);
  let width = 0, height = 0;
  const axes = [[m[1], parseInt(m[2], 10)], [m[3], parseInt(m[4], 10)]];
  for (const [axis, val] of axes) {
    if (axis.endsWith('Y')) height = val;
    else width = val;
  }
  const body = rest.subarray(resEnd + 1);

  const rgbe = new Uint8Array(width * height * 4);
  let bodyOff = 0;
  for (let row = 0; row < height; row++) {
    if (bodyOff + 4 > body.length) throw new Error('HDR body truncated');
    const a = body[bodyOff], b = body[bodyOff + 1];
    const c = body[bodyOff + 2], d = body[bodyOff + 3];
    if (a === 2 && b === 2 && (c & 0x80) === 0) {
      const scanWidth = (c << 8) | d;
      if (scanWidth !== width) throw new Error('RLE scanline width mismatch');
      bodyOff += 4;
      const channels = [new Uint8Array(width), new Uint8Array(width), new Uint8Array(width), new Uint8Array(width)];
      for (let ch = 0; ch < 4; ch++) {
        let x = 0;
        while (x < width) {
          if (bodyOff >= body.length) throw new Error('HDR body truncated mid-scanline');
          let run = body[bodyOff++];
          if (run > 128) {
            run &= 127;
            if (bodyOff >= body.length) throw new Error('HDR body truncated mid-run');
            const val = body[bodyOff++];
            if (x + run > width) throw new Error('RLE run overflow');
            for (let k = 0; k < run; k++) channels[ch][x++] = val;
          } else {
            if (bodyOff + run > body.length) throw new Error('HDR body truncated mid-literal');
            for (let k = 0; k < run; k++) channels[ch][x++] = body[bodyOff++];
          }
        }
      }
      for (let x = 0; x < width; x++) {
        const dst = (row * width + x) * 4;
        rgbe[dst + 0] = channels[0][x];
        rgbe[dst + 1] = channels[1][x];
        rgbe[dst + 2] = channels[2][x];
        rgbe[dst + 3] = channels[3][x];
      }
    } else {
      /* Fallback: uncompressed or old-style RLE. Support the simple
         uncompressed case; abort on old-RLE which hand-optimised writers
         rarely emit and modern Radiance / Blender output never uses. */
      if (c === 1 && d === 1 && (a | b)) {
        throw new Error('old-style RLE HDR not supported; re-export as modern RLE');
      }
      for (let x = 0; x < width; x++) {
        const dst = (row * width + x) * 4;
        rgbe[dst + 0] = body[bodyOff++];
        rgbe[dst + 1] = body[bodyOff++];
        rgbe[dst + 2] = body[bodyOff++];
        rgbe[dst + 3] = body[bodyOff++];
      }
    }
  }
  return { width, height, rgbe };
}

function downsampleNearest(src, srcW, srcH, dstW, dstH) {
  const dst = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y + 0.5) * srcH / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x + 0.5) * srcW / dstW));
      const s = (sy * srcW + sx) * 4;
      const d = (y * dstW + x) * 4;
      dst[d + 0] = src[s + 0];
      dst[d + 1] = src[s + 1];
      dst[d + 2] = src[s + 2];
      dst[d + 3] = src[s + 3];
    }
  }
  return dst;
}

function encodeRgbe(rgbe, width, height) {
  /* Emit modern RLE (2,2,w>>8,w&0xff) per-channel. Runs are broken on
     any >=4-length equal sequence; literals on sequences that would run
     shorter than 4. This matches what Three's RGBELoader reads. */
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`;
  const chunks = [Buffer.from(header, 'ascii')];
  const chScan = [new Uint8Array(width), new Uint8Array(width), new Uint8Array(width), new Uint8Array(width)];

  for (let row = 0; row < height; row++) {
    for (let x = 0; x < width; x++) {
      const s = (row * width + x) * 4;
      chScan[0][x] = rgbe[s + 0];
      chScan[1][x] = rgbe[s + 1];
      chScan[2][x] = rgbe[s + 2];
      chScan[3][x] = rgbe[s + 3];
    }
    chunks.push(Buffer.from([2, 2, (width >> 8) & 0xff, width & 0xff]));
    for (let ch = 0; ch < 4; ch++) {
      const scan = chScan[ch];
      let x = 0;
      while (x < width) {
        /* Count a run starting at x. */
        let runEnd = x;
        while (runEnd < width && runEnd - x < 127 && scan[runEnd] === scan[x]) runEnd++;
        const runLen = runEnd - x;
        if (runLen >= 4) {
          chunks.push(Buffer.from([128 + runLen, scan[x]]));
          x = runEnd;
        } else {
          /* Emit a literal until a run of ≥4 starts. */
          let litEnd = x + 1;
          while (litEnd < width && litEnd - x < 128) {
            let peekEnd = litEnd;
            while (peekEnd < width && peekEnd - litEnd < 127 && scan[peekEnd] === scan[litEnd]) peekEnd++;
            if (peekEnd - litEnd >= 4) break;
            litEnd++;
          }
          const litLen = litEnd - x;
          const lit = Buffer.alloc(1 + litLen);
          lit[0] = litLen;
          for (let k = 0; k < litLen; k++) lit[1 + k] = scan[x + k];
          chunks.push(lit);
          x = litEnd;
        }
      }
    }
  }
  return Buffer.concat(chunks);
}

async function main() {
  if (!existsSync(envDir)) mkdirSync(envDir, { recursive: true });
  const srcBuf = readFileSync(SOURCE);
  const { width, height, rgbe } = parseRgbe(srcBuf);
  console.log(`[downsize-hdr] source: ${width}×${height} (${(srcBuf.length / 1024).toFixed(1)} KB)`);

  for (const tgt of TARGETS) {
    const down = downsampleNearest(rgbe, width, height, tgt.w, tgt.h);
    const out = encodeRgbe(down, tgt.w, tgt.h);
    const outPath = join(envDir, tgt.name);
    writeFileSync(outPath, out);
    console.log(`[downsize-hdr] wrote public/env/${tgt.name} — ${tgt.w}×${tgt.h} (${(out.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error('[downsize-hdr] failed:', err);
  process.exit(1);
});
