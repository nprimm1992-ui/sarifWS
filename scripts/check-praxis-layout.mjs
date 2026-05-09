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

const pages = collectIndexHtml(praxisDir);
const failures = [];
let checked = 0;

for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const result = checkArticle(html);
  if (result === null) continue;
  checked += 1;
  if (!result.ok) {
    failures.push({ file: relative(repoRoot, file), reason: result.reason });
  }
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
  process.exit(1);
}

console.log(
  `[check-praxis-layout] OK — ${checked} Praxis article${checked === 1 ? '' : 's'} match the dossier layout contract.`,
);
