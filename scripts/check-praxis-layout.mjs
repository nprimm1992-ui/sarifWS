#!/usr/bin/env node
/**
 * Enforce the Praxis dossier layout invariant on every generated article.
 *
 * The Praxis article template (src/pages/praxis/[slug].astro) is the single
 * source of truth for article layout, so a regression would almost certainly
 * manifest as a DOM-order change visible in the generated HTML. This check
 * codifies the contract so a future template refactor cannot silently drift:
 *
 *   <div class="praxis-case">
 *     <header class="praxis-case__header">          (meta strip)
 *     <section class="praxis-case__title-plate">    (eyebrow + title + summary)
 *     <figure  class="praxis-case__hero">           (hero image)
 *     <section class="praxis-case__body …">         (MDX prose)
 *     <div     class="praxis-case__seal">           (floats — absolute)
 *     <section class="praxis-outro">                (Continue → Related → Subscribe)
 *     <footer  class="praxis-case__footer">         (End of file)
 *     <span    class="sr-only" …data-praxis-progress-sr>
 *   </div>
 *
 * The invariants we assert:
 *   1. `.praxis-outro` exists inside `.praxis-case` (never as a sibling).
 *   2. Body precedes outro precedes footer (the outro is the terminal
 *      content section but the footer is the dossier's formal closer).
 *   3. Reference-number coherence: the three surfaces that display the
 *      article's number — the ref plate, the eyebrow (`classification`) and
 *      the "End of file" footer — must all state the SAME number, and no two
 *      published articles may claim the same one.
 *
 *      Invariant 3 exists because it was violated in production. The template
 *      derived the plate/footer number positionally by sorting articles on
 *      `publishDate`, while the eyebrow printed the authored `classification`
 *      string. `publishDate` is not a total order (No. 01 and No. 02 share
 *      2026-04-12) and the sorted array was built as `[...others, entry]`,
 *      so the rendering article was always appended last and won every tie.
 *      `/praxis/one-operator-one-intelligence-layer/` therefore shipped a
 *      plate and footer reading "No. 02" above prose whose own eyebrow read
 *      "Praxis No. 01". Nothing failed; the page simply contradicted itself.
 *
 *      This is a numbering-collision detector as much as a display check: the
 *      uniqueness half catches the case where two articles both render the
 *      same number self-consistently, which no per-page assertion can see.
 *
 * Fails the build if any praxis page violates the contract. Skipped when
 * dist/ or dist/praxis/ is absent (mirrors check-meta-descriptions.mjs).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist');
const praxisDir = join(distDir, 'praxis');

if (!existsSync(praxisDir)) {
  console.warn('[check-praxis-layout] dist/praxis/ not found; skipping.');
  process.exit(0);
}

/**
 * Recursively collect every index.html under a given directory.
 * @param {string} dir
 * @returns {string[]}
 */
function collectIndexHtml(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...collectIndexHtml(full));
    } else if (s.isFile() && name === 'index.html') {
      out.push(full);
    }
  }
  return out;
}

/**
 * Inspect a single article's HTML for the Praxis layout invariant.
 *
 * Returns null when the page is not a Praxis article (no .praxis-case),
 * e.g. the /praxis/ index itself.
 *
 * @param {string} html
 * @returns {{ok: true} | {ok: false, reason: string} | null}
 */
function checkArticle(html) {
  const caseOpen = html.indexOf('class="praxis-case"');
  if (caseOpen === -1) return null;

  // Close index is a best-effort: .praxis-case has no same-class descendant
  // so the first </div> after the seal/footer closes it. Rather than parse
  // HTML, we assert indices within the whole document — the only other
  // `.praxis-outro` on a Praxis page would be another article's outro,
  // which does not exist (one article per page), so position math is safe.
  const bodyIdx = html.indexOf('class="praxis-case__body');
  const outroIdx = html.indexOf('class="praxis-outro"');
  const footerIdx = html.indexOf('class="praxis-case__footer');

  if (outroIdx === -1) {
    return { ok: false, reason: '.praxis-outro missing from page' };
  }
  if (outroIdx < caseOpen) {
    return {
      ok: false,
      reason: '.praxis-outro rendered before .praxis-case opens (must be nested inside)',
    };
  }
  if (bodyIdx === -1 || bodyIdx > outroIdx) {
    return {
      ok: false,
      reason: '.praxis-case__body must precede .praxis-outro',
    };
  }
  if (footerIdx === -1 || footerIdx < outroIdx) {
    return {
      ok: false,
      reason:
        '.praxis-outro must precede .praxis-case__footer (footer is the dossier closer)',
    };
  }

  return { ok: true };
}

/* Number-bearing surfaces, in the markup shapes the template emits.
 *
 * `data-astro-cid-*` hashes change whenever the component's styles change, so
 * these patterns deliberately match on the class name and then skip forward
 * to the text node rather than pinning the attribute order. A pattern that
 * stops matching would make this check fail-open, so each one is required to
 * hit at least once per article (see `missing` below) — a silent no-match is
 * reported as a failure, not treated as a pass. */
const NUMBER_SURFACES = [
  {
    label: 'ref plate',
    re: /class="praxis-case__ref-num"[^>]*>\s*(\d+)\s*</,
  },
  {
    label: 'eyebrow (classification)',
    re: /class="praxis-case__eyebrow[^"]*"[^>]*>[^<]*?\bNo\.\s*(\d+)/i,
  },
  {
    label: 'footer ("End of file")',
    re: /End of file[^<]*?\bNo\.\s*(\d+)/i,
  },
];

/**
 * Extract the number each surface claims for one article.
 * @param {string} html
 * @returns {{ numbers: Map<string, string>, missing: string[] }}
 */
function readNumbers(html) {
  const numbers = new Map();
  const missing = [];
  for (const surface of NUMBER_SURFACES) {
    const m = html.match(surface.re);
    if (m) numbers.set(surface.label, String(Number(m[1])).padStart(2, '0'));
    else missing.push(surface.label);
  }
  return { numbers, missing };
}

const pages = collectIndexHtml(praxisDir);
const failures = [];
/** @type {Map<string, string[]>} number → article paths claiming it */
const claimedNumbers = new Map();
let checked = 0;

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const result = checkArticle(html);
  if (result === null) continue;
  checked += 1;
  const rel = relative(repoRoot, file);
  if (!result.ok) {
    failures.push({ file: rel, reason: result.reason });
  }

  /* Invariant 3a — the surfaces must agree with each other. */
  const { numbers, missing } = readNumbers(html);
  if (missing.length > 0) {
    failures.push({
      file: rel,
      reason:
        `could not read the Praxis number from: ${missing.join(', ')}. ` +
        'Either the surface was removed or its markup changed — if the latter, ' +
        'update NUMBER_SURFACES in this script, because an unmatched pattern ' +
        'would otherwise let a numbering contradiction through unnoticed.',
    });
  }
  const distinct = new Set(numbers.values());
  if (distinct.size > 1) {
    const detail = [...numbers.entries()].map(([k, v]) => `${k} = No. ${v}`).join('; ');
    failures.push({
      file: rel,
      reason:
        `the page states more than one Praxis number (${detail}). ` +
        'All three surfaces read from `classification` in the frontmatter; a ' +
        'disagreement means the template has drifted back to deriving the ' +
        'number positionally.',
    });
  }
  /* Invariant 3b — no two published articles may claim the same number.
     Recorded from the eyebrow, which is the authored value. */
  const authored = numbers.get('eyebrow (classification)');
  if (authored) {
    if (!claimedNumbers.has(authored)) claimedNumbers.set(authored, []);
    claimedNumbers.get(authored).push(rel);
  }
}

for (const [num, holders] of claimedNumbers) {
  if (holders.length > 1) {
    failures.push({
      file: holders.join(' + '),
      reason:
        `${holders.length} published articles both claim Praxis No. ${num}. ` +
        'Praxis numbers are citation handles; two articles sharing one makes ' +
        'every reference to that number ambiguous. Renumber in the ' +
        '`classification` frontmatter of whichever article should move.',
    });
  }
}

/*
 * Coverage floor.
 *
 * `checkArticle()` returns null for any page without `.praxis-case`, and a
 * null is skipped without incrementing `checked`. That makes the whole gate
 * fail-open against exactly the regression it exists to catch: rename or
 * restructure `.praxis-case` in the template and EVERY article returns null,
 * `checked` lands on 0, no failure is recorded, and the script cheerfully
 * prints "OK — 0 Praxis articles match the dossier layout contract."
 *
 * Three of the twelve Praxis entries are published today (the other nine are
 * `draft: true` and correctly produce no route), so the floor is 3. It is a
 * real number rather than `> 0` so that losing one published article is also
 * caught, not just losing all of them. Raise it as articles are published.
 */
const MIN_PRAXIS_ARTICLES = 3;
if (checked < MIN_PRAXIS_ARTICLES) {
  console.error(
    `[check-praxis-layout] FAIL — inspected ${pages.length} page(s) under dist/praxis/ ` +
      `but only ${checked} contained a \`.praxis-case\` root; expected at least ` +
      `${MIN_PRAXIS_ARTICLES}.\n` +
      '  This is the fail-open case: pages without .praxis-case are skipped, so a\n' +
      '  renamed or restructured root would make every article invisible to this\n' +
      '  check and it would report success over an empty set.\n' +
      '  If an article was intentionally unpublished (draft: true), lower\n' +
      '  MIN_PRAXIS_ARTICLES deliberately so the floor keeps its meaning.',
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.error('[check-praxis-layout] FAIL — Praxis layout contract violated:');
  for (const f of failures) {
    console.error(`  ${f.file}`);
    console.error(`    ${f.reason}`);
  }
  console.error(
    '\nThe Praxis dossier layout is defined in src/pages/praxis/[slug].astro.',
  );
  console.error(
    'Expected order inside .praxis-case: header → title-plate → hero → body → outro → footer.',
  );
  console.error(
    'Praxis numbers come from the `classification` frontmatter ("Praxis No. 03 — Methodology").',
  );
  process.exit(1);
}

const numberList = [...claimedNumbers.keys()].sort().join(', ');
console.log(
  `[check-praxis-layout] OK — ${checked} Praxis article${checked === 1 ? '' : 's'} match the dossier layout contract; ` +
    `reference numbers coherent across 3 surfaces and unique (No. ${numberList}).`,
);
