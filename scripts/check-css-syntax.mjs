#!/usr/bin/env node
/**
 * Build sentinel: every authored stylesheet and every `<style>` block in an
 * .astro component must parse cleanly.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * esbuild's CSS minifier already reports syntax faults, but it reports them
 * against the concatenated stream it was piped, so the diagnostic reads:
 *
 *     ▲ [WARNING] Unexpected "}" [css-syntax-error]
 *         <stdin>:680:2
 *
 * `<stdin>` names no file and line 680 maps to nothing a developer can open.
 * It is also a WARNING, so the build stays green and the message scrolls past
 * in ~400 lines of asset logging. One such fault survived in
 * CommandPalette.astro across many builds for exactly that reason.
 *
 * It was not cosmetic. A deleted rule had taken an enclosing
 * `@media (prefers-reduced-motion: reduce) {` line with it, so
 * `transition: none` / `transform: none` escaped the query and disabled the
 * command palette's animations for EVERY user. A dangling brace is a
 * scope-leak signal, not a whitespace nit: the rules that were meant to be
 * conditional silently became unconditional.
 *
 * This sentinel attributes each fault to a real file and line and FAILS the
 * build, converting an ignorable warning into a hard stop.
 *
 * ── Fail-loud posture ───────────────────────────────────────────────────────
 *
 * Per repo doctrine this check must not be able to pass by measuring nothing.
 * A graduated coverage floor (not `> 0`) rejects the run if the walk finds
 * implausibly few blocks — the shape a broken glob, a moved directory or a
 * regex that stops matching would take. Missing tooling is likewise a FAIL,
 * never a silent skip.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'src');

/* Graduated floors. Current tree: 42 files, 41 checkable blocks (1 JSX-expression
 * block legitimately skipped). Set below today's counts so ordinary authoring
 * never trips them, but high enough that a structural break in discovery — bad
 * path, renamed dir, dead regex, or an over-broad skip predicate — cannot
 * masquerade as success. Deliberately NOT `> 0`: a zero-floor check passes by
 * measuring nothing, which is the failure mode this repo keeps rediscovering.
 * An earlier revision of this very script skipped 17 of 42 blocks and landed
 * exactly on a floor of 25, which is why the floor now tracks real coverage. */
const MIN_FILES = 35;
const MIN_BLOCKS = 35;

if (!existsSync(SRC)) {
  console.error(`[check-css-syntax] FAILED — src/ not found at ${SRC}.`);
  process.exit(1);
}

/** Recursively collect .astro and .css files under src/. */
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...collect(abs));
    else if (/\.(astro|css)$/.test(entry)) out.push(abs);
  }
  return out;
}

/**
 * Extract checkable CSS blocks from one file.
 *
 * `.css` files are checked whole. For `.astro`, each `<style>` block is
 * checked separately, and `lineOffset` records how many source lines precede
 * the block so a parser complaint at block-line N can be reported at the real
 * file line. Blocks containing `${...}` interpolation are skipped: the
 * authored text is a template literal, not CSS, and would produce false
 * positives.
 */
function blocksFor(file) {
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.css')) {
    return [{ css: text, lineOffset: 0, interpolated: false }];
  }
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const css = m[1];
    const lineOffset = text.slice(0, m.index).split('\n').length;
    // Only a body that IS a JSX expression is exempt — i.e. it opens with `{`
    // and closes with `}` wrapping a template literal. A backtick appearing
    // anywhere (a comment, a content: value) must NOT exempt the whole
    // stylesheet: an earlier revision of this check used `includes('`')` and
    // silently dropped 17 of 42 blocks from coverage, landing exactly on the
    // floor. Broad skip predicates are how a check quietly measures nothing.
    const body = css.trim();
    const isExpression = /^\{\s*`[\s\S]*`\s*\}$/.test(body);
    out.push({ css, lineOffset, interpolated: isExpression });
  }
  return out;
}

const files = collect(SRC);
const failures = [];
let checked = 0;
let skipped = 0;

for (const file of files) {
  for (const [i, b] of blocksFor(file).entries()) {
    if (b.interpolated) {
      skipped++;
      continue;
    }
    if (b.css.trim() === '') continue;
    checked++;

    // Pipe via stdin so esbuild's own CSS parser is the authority — the same
    // parser the real build uses, so no second grammar can drift from it.
    //
    // CRITICAL: esbuild classifies `Unexpected "}"` as a WARNING and STILL
    // EXITS 0. Trusting the exit code (or a bare try/catch) therefore reports
    // success on genuinely broken CSS — verified directly:
    //
    //     $ printf '.a{color:red}\n}\n' | npx esbuild --minify --loader=css
    //     ▲ [WARNING] Unexpected "}" [css-syntax-error]   ... exit code 0
    //
    // That is exactly how the CommandPalette fault survived so many builds, so
    // we inspect stderr and treat any css-syntax-error as fatal regardless of
    // exit status. An exec failure is also fatal — never a silent skip.
    // `execFileSync` returns stdout, so warnings on stderr would be lost. Run
    // through a shell that merges stderr into stdout (2>&1) and read it back.
    let diagnostics;
    try {
      diagnostics = execFileSync(
        'sh',
        ['-c', 'npx esbuild --minify --loader=css 2>&1 >/dev/null'],
        { input: b.css, encoding: 'utf8' },
      );
    } catch (err) {
      diagnostics = String(err.stdout || err.stderr || err.message || 'esbuild invocation failed');
    }

    if (/css-syntax-error|\[ERROR\]/.test(diagnostics)) {
      // Translate `<stdin>:LINE:COL` into a real file:line the dev can open.
      const located = diagnostics.replace(
        /<stdin>:(\d+):(\d+)/g,
        (_all, ln, col) => `${relative(ROOT, file)}:${Number(ln) + b.lineOffset}:${col}`,
      );
      failures.push({ file: relative(ROOT, file), block: i, detail: located.trim() });
    }
  }
}

if (files.length < MIN_FILES || checked < MIN_BLOCKS) {
  console.error(
    `[check-css-syntax] FAILED — coverage floor not met: ${files.length} file(s) ` +
      `(min ${MIN_FILES}), ${checked} block(s) checked (min ${MIN_BLOCKS}).\n` +
      '  This check cannot pass by measuring nothing. Either the src/ walk or the\n' +
      '  <style> extraction is broken — fix discovery before trusting a green run.',
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.error(
    `[check-css-syntax] FAILED — ${failures.length} CSS syntax fault(s):\n`,
  );
  for (const f of failures) {
    console.error(`  ${f.file} (style block ${f.block})`);
    for (const line of f.detail.split('\n')) console.error(`    ${line}`);
    console.error('');
  }
  console.error(
    '  A stray brace is a scope-leak signal, not a formatting nit: rules meant to\n' +
      '  sit inside a @media/@supports query become unconditional when its opening\n' +
      '  line is lost, changing behaviour for every user.',
  );
  process.exit(1);
}

console.log(
  `[check-css-syntax] OK — ${checked} CSS block(s) across ${files.length} file(s) parse cleanly` +
    (skipped > 0 ? ` (${skipped} interpolated block(s) skipped).` : '.'),
);
