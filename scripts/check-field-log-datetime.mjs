#!/usr/bin/env node
/**
 * check-field-log-datetime — every rendered <time datetime> must be
 * machine-readable.
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * `FieldLog.astro` used to do `datetime={timestamp}`, where `timestamp` is
 * the *human* label the house voice authors ("Engagement 004 retro"). Two
 * shipped Praxis articles were therefore serving:
 *
 *     <time datetime="Engagement 004 retro">
 *     <time datetime="Engagement 005 retro">
 *
 * which does not parse as a date and makes the element's machine-readable
 * contract false. `astro build` exits 0 on this. `astro check` exits 0 on
 * this. No existing sentinel looked at `datetime` at all. It was invisible.
 *
 * This gate reads the BUILT HTML — not the source — because the source is
 * one component and the defect is a property of what ships. It validates
 * every `<time datetime="...">` on every page, from any component, so a
 * future component making the same mistake is caught too.
 *
 * FAIL-OPEN AVOIDANCE (the dominant defect species in this repo)
 * ---------------------------------------------------------------------------
 * Three separate ways this check could pass while measuring nothing, each
 * closed explicitly:
 *
 *   1. No HTML files found       -> FAILURE (not "0 files, all good")
 *   2. Zero <time> elements found -> FAILURE against a coverage floor, so
 *      a markup rename that stops matching cannot silently pass
 *   3. A page that fails to read  -> FAILURE, never a skipped `continue`
 *
 * The floor is graduated (MIN_TIME_ELEMENTS) rather than `> 0`, so it keeps
 * its meaning as content grows. Raise it deliberately when adding entries.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const TAG = '[check-field-log-datetime]';

/* Coverage floor — graduated, never `> 0`.
 *
 * Measured at the time of writing: 8 <time> elements.
 *   4 x praxis-case__header-date  (one per published article)
 *   3 x praxis index card dates   (one per published article, minus one
 *                                  that shares a date bucket)
 *   1 x mdx-field-log__time       (Praxis No. 04, the only dated FieldLog)
 *
 * Note that the two older FieldLog entries deliberately DO NOT appear here.
 * They carry human labels ("Engagement 004 retro"), so they now render as
 * <span> rather than a <time> making a false machine-readable promise. That
 * is the fix this gate protects, so the floor must not be set so high that
 * converting a dated entry back to a labelled one is impossible.
 *
 * 6 leaves room for that while still being far enough above zero that a
 * markup rename which stops the patterns matching will trip the guard
 * instead of reporting a vacuous pass. Raise deliberately as content grows. */
const MIN_TIME_ELEMENTS = 6;

if (!existsSync(DIST)) {
  console.error(`${TAG} FAIL — dist/ not found. Run \`astro build\` first.`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

const htmlFiles = walk(DIST);

/* Fail-open guard 1: an empty build must not read as a clean build. */
if (htmlFiles.length === 0) {
  console.error(
    `${TAG} FAIL — no HTML files in dist/. Nothing was verified, which is a\n` +
      `  failure, not a pass. Confirm the build produced output.`,
  );
  process.exit(1);
}

/* HTML datetime grammar, as it actually ships from this site.
 *
 * Broader than the FieldLog component's author-time guard on purpose: this
 * runs over EVERY <time> in the build, including ones Astro generates from
 * Date objects. Those serialize via toISOString() and therefore carry
 * fractional seconds — "2026-04-12T00:00:00.000Z".
 *
 * The first draft of this pattern omitted the `.sss` group and flagged all
 * eight of those as invalid. They were not; the gate was. Recorded here
 * because a false positive in a sentinel is as damaging as a false negative:
 * it trains authors to disable the check. */
const DATETIME_RE =
  /^\d{4}(-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?)?)?$/;

const TIME_ATTR_RE = /<time\b[^>]*\bdatetime="([^"]*)"[^>]*>/gi;
const TIME_OPEN_RE = /<time\b[^>]*>/gi;

const failures = [];
let timeCount = 0;
let datetimeCount = 0;

for (const file of htmlFiles) {
  const rel = relative(ROOT, file);

  /* Fail-open guard 3: a read error is a failure, never a skip. */
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch (err) {
    failures.push(`${rel} — could not be read (${err.message})`);
    continue;
  }

  /* Every <time> must carry a datetime at all. A bare <time> is a weaker
     form of the same defect: an element promising machine-readability and
     supplying none. */
  for (const m of html.matchAll(TIME_OPEN_RE)) {
    timeCount += 1;
    if (!/\bdatetime=/.test(m[0])) {
      failures.push(
        `${rel} — <time> element with no datetime attribute: ${m[0].slice(0, 90)}`,
      );
    }
  }

  for (const m of html.matchAll(TIME_ATTR_RE)) {
    datetimeCount += 1;
    const value = m[1];
    if (!DATETIME_RE.test(value.trim())) {
      failures.push(
        `${rel} — datetime="${value}" is not a machine-readable date.\n` +
          `      Put the human label in the element's text, and either supply a\n` +
          `      real date via the \`datetime\` prop or omit it so a <span> is\n` +
          `      rendered instead of a <time>.`,
      );
    }
  }
}

/* Fail-open guard 2: graduated coverage floor. If a markup change means the
   patterns stop matching, this fires instead of reporting a vacuous pass. */
if (timeCount < MIN_TIME_ELEMENTS) {
  console.error(
    `${TAG} FAIL — found only ${timeCount} <time> element(s) across ` +
      `${htmlFiles.length} page(s), below the floor of ${MIN_TIME_ELEMENTS}.\n` +
      `  Either content was removed, or the markup changed shape and this\n` +
      `  check silently stopped measuring anything. Both need a human.\n` +
      `  If the reduction is intentional, lower MIN_TIME_ELEMENTS\n` +
      `  deliberately so the floor keeps its meaning.`,
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.error(`${TAG} FAIL — ${failures.length} invalid <time> element(s):`);
  for (const f of failures) console.error(`    ${f}`);
  process.exit(1);
}

console.log(
  `${TAG} OK — ${datetimeCount} datetime attribute(s) across ${timeCount} ` +
    `<time> element(s) in ${htmlFiles.length} page(s) are machine-readable`,
);
