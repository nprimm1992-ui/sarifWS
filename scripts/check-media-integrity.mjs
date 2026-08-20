#!/usr/bin/env node
/**
 * check-media-integrity — guards shipped video against silent corruption and
 * against `<source>` siblings that disagree about what they contain.
 *
 * ── Origin ──────────────────────────────────────────────────────────────────
 * `public/media/about/context-flow.mp4` was committed truncated at exactly
 * 1048576 bytes — 1 MiB, the signature of an upload/transfer cap rather than a
 * bad encode. The MP4 *container header* still advertised the full 5.04s
 * duration while only 20 of 121 video packets were present, so:
 *
 *   • `ffprobe -show_entries format=duration` reported 5.041667 — looked fine
 *   • the file opened without complaint in most tools
 *   • `existsSync()` in about.astro saw a file and shipped it
 *   • browsers played ~0.8s and stalled
 *
 * The paired `context-flow.av1.webm` had been re-encoded *from the truncated
 * MP4*, so it was a genuine 0.79s asset. Because AboutDossierCard.astro emits
 * the WebM `<source>` first, every AV1-capable browser — the majority — got the
 * 0.79s stub. The MP4 fallback nobody reached was the only one that looked
 * roughly correct. A duration check alone would have missed the MP4 (its header
 * lied); a size check alone would have missed the WebM (it was internally
 * consistent).
 *
 * ── What this checks ────────────────────────────────────────────────────────
 * For every video under public/:
 *
 * 1. DECODE INTEGRITY — the stream fully decodes. Catches truncation that a
 *    container header hides, which is the exact failure that shipped.
 *
 * 2. PACKET COUNT — counted packets are consistent with duration x fps.
 *    A lying header cannot satisfy this.
 *
 * 3. SIBLING AGREEMENT — when `<name>.mp4` and `<name>.av1.webm` both exist
 *    they are alternate encodes of one asset, so their durations must match
 *    within a frame. This is what makes source-order irrelevant to correctness.
 *
 * 4. SUSPICIOUS SIZE — flags files at an exact power-of-two byte boundary,
 *    the fingerprint of a transfer cap.
 *
 * Skipped gracefully (exit 0, with notice) when ffprobe is unavailable, so the
 * build still works on machines without ffmpeg. CI has it.
 *
 * Exit 0 = media sound. Exit 1 = a broken asset would have shipped.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, extname, basename, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, 'public');
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v']);

/** Duration tolerance between paired encodes: one frame at 24fps, plus slack
 *  for container timebase rounding (WebM uses ms, MP4 uses 1/timescale). */
const DURATION_TOLERANCE_S = 0.05;

/** Packet count may legitimately differ from duration x fps by a couple of
 *  frames (VFR sources, trailing partial GOP). Beyond that it signals loss. */
const PACKET_TOLERANCE_FRAMES = 3;

/**
 * Coverage floor for the asset scan.
 *
 * Deliberately graduated rather than a `> 0` check: nobody deletes every
 * video, they lose a subdirectory in a refactor. Six assets ship today, so a
 * floor of 6 catches the realistic regression (one directory of encodes
 * silently stops being walked) instead of only the theatrical one (all media
 * vanishes). Raise it when assets are added; lower it deliberately, in a
 * commit that says why.
 */
const MIN_VIDEO_ASSETS = 6;

function haveFfprobe() {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = join(dir, entry);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(abs));
    else if (VIDEO_EXT.has(extname(entry).toLowerCase())) out.push(abs);
  }
  return out;
}

function probe(file) {
  const raw = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-count_packets',
      '-show_entries', 'stream=nb_read_packets,r_frame_rate,width,height,codec_name',
      '-show_entries', 'format=duration',
      '-of', 'json',
      file,
    ],
    { encoding: 'utf8', maxBuffer: 1 << 24 },
  );
  const parsed = JSON.parse(raw);
  const stream = parsed.streams?.[0] ?? {};
  const [num, den] = String(stream.r_frame_rate ?? '0/1').split('/').map(Number);
  return {
    packets: Number(stream.nb_read_packets ?? 0),
    fps: den ? num / den : 0,
    width: Number(stream.width ?? 0),
    height: Number(stream.height ?? 0),
    codec: stream.codec_name ?? 'unknown',
    duration: Number(parsed.format?.duration ?? 0),
  };
}

/** Full decode. Any stderr output means the stream did not survive the pass. */
function decodeErrors(file) {
  try {
    const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
      maxBuffer: 1 << 24,
    });
    return String(out ?? '').trim();
  } catch (err) {
    /* ffmpeg exits non-zero on fatal decode failure; its stderr is the finding. */
    return String(err.stderr ?? err.message ?? 'decode failed').trim();
  }
}

function isExactPowerOfTwo(n) {
  return n >= 1024 && (n & (n - 1)) === 0;
}

/**
 * Is this a machine where a skipped media check is a genuine outcome?
 *
 * On a contributor's laptop without ffmpeg installed there is nothing useful
 * this script can do, and hard-failing would make the repo unclonable. In CI
 * — or anywhere the operator has asserted the toolchain should exist — a
 * missing ffprobe is itself the defect: it means the media gate silently
 * stopped running and truncated video could ship unnoticed.
 *
 * `CI` is set by GitHub Actions, Cloudflare Pages and essentially every other
 * runner. `REQUIRE_MEDIA_TOOLS=1` is the manual override for local release
 * rehearsals.
 */
function toolchainIsMandatory() {
  return Boolean(process.env.CI) || process.env.REQUIRE_MEDIA_TOOLS === '1';
}

function main() {
  /*
   * FAIL-OPEN FIX (was: `SKIP` + bare `return`, exit 0).
   *
   * The old form was the textbook instance of the species: on any machine
   * without ffprobe this check printed SKIP, returned, exited 0, and the
   * build went green having verified nothing. Every video asset could have
   * been truncated. Now the absence of the toolchain is only tolerated where
   * it is genuinely ambiguous — an interactive dev box — and is a hard
   * failure anywhere the build output is going to be published.
   */
  if (!haveFfprobe()) {
    if (toolchainIsMandatory()) {
      console.error(
        '[check-media-integrity] FAIL — ffprobe not found, but this is a CI or ' +
          'release build (CI / REQUIRE_MEDIA_TOOLS is set).\n' +
          '    Skipping here would ship unverified media: a truncated MP4 still\n' +
          '    passes existsSync() and still builds, and only a real browser\n' +
          '    reveals the stall. Install ffmpeg/ffprobe in the build image.',
      );
      process.exit(1);
    }
    console.warn(
      '[check-media-integrity] WARN — ffprobe not available on this machine, so ' +
        'media integrity was NOT verified.\n' +
        '    This is tolerated for local development only. Set REQUIRE_MEDIA_TOOLS=1 ' +
        'to make it fatal,\n    and note that CI treats a missing ffprobe as a failure.',
    );
    return;
  }

  const files = walk(PUBLIC_DIR).sort();
  /*
   * Zero-asset floor. `public/` currently holds 6 video assets. Finding none
   * means the directory moved, an extension was added to VIDEO_EXT's blind
   * spot, or walk() swallowed an error — not that the site became text-only.
   * A check that reports OK over an empty set is indistinguishable from a
   * check that works, which is exactly how this class of bug survives.
   */
  if (files.length === 0) {
    console.error(
      '[check-media-integrity] FAIL — scanned public/ and found zero video assets.\n' +
        `    Expected at least ${MIN_VIDEO_ASSETS}. Either the assets moved, the\n` +
        '    extension allowlist no longer matches them, or the directory walk\n' +
        '    failed silently. Reporting OK over an empty set would make this gate\n' +
        '    indistinguishable from a working one.',
    );
    process.exit(1);
  }
  if (files.length < MIN_VIDEO_ASSETS) {
    console.error(
      `[check-media-integrity] FAIL — only ${files.length} video asset(s) found, ` +
        `expected at least ${MIN_VIDEO_ASSETS}.\n` +
        '    Assets are not normally deleted wholesale; they are lost by a bad\n' +
        '    move or a rename. If this reduction is intentional, lower\n' +
        '    MIN_VIDEO_ASSETS in this file so the floor stays meaningful.',
    );
    process.exit(1);
  }

  const failures = [];
  /** @type {Map<string, Array<{file: string, info: ReturnType<typeof probe>}>>} */
  const siblings = new Map();

  for (const file of files) {
    const rel = relative(ROOT, file);
    const bytes = statSync(file).size;

    let info;
    try {
      info = probe(file);
    } catch (err) {
      failures.push(`${rel}\n    unreadable by ffprobe: ${String(err.message ?? err).split('\n')[0]}`);
      continue;
    }

    /* 1. Decode integrity — the check the truncated MP4 could not survive. */
    const errors = decodeErrors(file);
    if (errors) {
      failures.push(
        `${rel}\n    stream does not fully decode (${bytes} bytes):\n` +
          errors
            .split('\n')
            .slice(0, 3)
            .map((l) => `      ${l}`)
            .join('\n') +
          `\n    A truncated file can still report a correct duration — the container\n` +
          `    header is written up front. Re-encode from the pristine source.`,
      );
    }

    /* 2. Packet count vs duration x fps. */
    if (info.fps > 0 && info.duration > 0) {
      const expected = Math.round(info.duration * info.fps);
      if (Math.abs(info.packets - expected) > PACKET_TOLERANCE_FRAMES) {
        failures.push(
          `${rel}\n    packet count disagrees with header duration: ${info.packets} packets, ` +
            `but ${info.duration.toFixed(3)}s x ${info.fps}fps implies ~${expected}.\n` +
            `    This is what a lying container header looks like.`,
        );
      }
    }

    /* 4. Exact power-of-two size = transfer cap fingerprint. */
    if (isExactPowerOfTwo(bytes)) {
      failures.push(
        `${rel}\n    size is exactly ${bytes} bytes (2^${Math.log2(bytes)}). Video almost never\n` +
          `    lands on a power-of-two boundary naturally — this is the signature of an\n` +
          `    upload or transfer cap truncating the file.`,
      );
    }

    /* 3. Group by logical asset for sibling comparison. */
    const name = basename(file);
    const stem = name
      .replace(/\.av1\.webm$/i, '')
      .replace(/\.(mp4|webm|mov|m4v)$/i, '');
    const key = join(dirname(rel), stem);
    if (!siblings.has(key)) siblings.set(key, []);
    siblings.get(key).push({ file: rel, info });
  }

  /* 3. Sibling duration agreement. */
  for (const [key, group] of siblings) {
    if (group.length < 2) continue;
    const durations = group.map((g) => g.info.duration);
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    if (max - min > DURATION_TOLERANCE_S) {
      failures.push(
        `${key} — paired encodes disagree on duration:\n` +
          group
            .map((g) => `      ${g.info.duration.toFixed(3)}s  ${g.info.codec.padEnd(5)}  ${g.file}`)
            .join('\n') +
          `\n    These are alternate <source> encodes of one asset. Whichever the browser\n` +
          `    picks must show the same footage; the shortest one wins for whoever\n` +
          `    supports it. Re-encode every sibling from the same master.`,
      );
    }

    /* Dimensions should match too — a mismatch means a stale re-encode. */
    const dims = new Set(group.map((g) => `${g.info.width}x${g.info.height}`));
    if (dims.size > 1) {
      failures.push(
        `${key} — paired encodes disagree on dimensions: ${[...dims].join(' vs ')}.\n` +
          `    Alternate <source> encodes must be the same frame size or layout shifts\n` +
          `    depending on codec support.`,
      );
    }
  }

  if (failures.length > 0) {
    console.error('[check-media-integrity] FAILED\n');
    for (const f of failures) console.error(`  ✗ ${f}\n`);
    console.error(
      `${failures.length} media problem(s). These ship silently: the build succeeds,\n` +
        `existsSync() sees a file, and only real browsers reveal the stall.\n`,
    );
    process.exit(1);
  }

  const pairs = [...siblings.values()].filter((g) => g.length > 1).length;
  console.log(
    `[check-media-integrity] OK — ${files.length} video asset(s) decode cleanly; ` +
      `${pairs} sibling pair(s) agree on duration and dimensions.`,
  );
}

main();
