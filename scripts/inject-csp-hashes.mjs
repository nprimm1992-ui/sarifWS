#!/usr/bin/env node
/**
 * Post-build: compute SHA-256 hashes for every inline <script> in the
 * generated HTML, then rewrite `dist/_headers` so the deployed CSP carries
 * `script-src 'sha256-...'` instead of `'unsafe-inline'`.
 *
 * Flow:
 *   1. Walk `dist/**` and extract every inline <script>...</script> body
 *      whose content is non-empty. External scripts (`src="..."`) are skipped.
 *   2. For each body, compute the browser's CSP hash: base64(sha256(body)).
 *      Browsers hash the literal script text as-authored (including all
 *      whitespace). Astro emits inline scripts in deterministic order so
 *      the hash list is stable per-build.
 *   3. Read the authored CSP from `public/_headers`, replace the
 *      `'unsafe-inline'` directive on script-src with the generated
 *      sha256 tokens, and write the result to `dist/_headers`.
 *
 * If any inline script is missed, the browser will surface a CSP violation
 * at runtime (caught by the /api/csp-report sink in Phase 5.4), and the
 * next build regenerates the hash — no operator action needed.
 *
 * Strategy decisions:
 *   - We keep 'unsafe-inline' on style-src because Astro emits scoped CSS
 *     as inline <style> blocks per-page; removing requires a different
 *     pipeline (documented in docs/audit-2026-04-phase-b.md).
 *   - JSON-LD blocks (<script type="application/ld+json">) are NOT hashed
 *     because modern browsers treat them as data, not executable script.
 *     We still include them for safety on older engines.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(repoRoot, 'dist');
const publicHeaders = join(repoRoot, 'public', '_headers');
const distHeaders = join(distDir, '_headers');

if (!existsSync(distDir)) {
  console.warn('[inject-csp-hashes] dist/ does not exist; skipping.');
  process.exit(0);
}

if (!existsSync(publicHeaders)) {
  console.error(
    '[inject-csp-hashes] public/_headers missing — build cannot proceed.',
  );
  process.exit(1);
}

// --- 1. Walk dist/ and extract inline script bodies ---
const htmlFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const s = statSync(abs);
    if (s.isDirectory()) {
      walk(abs);
    } else if (entry.endsWith('.html')) {
      htmlFiles.push(abs);
    }
  }
}
walk(distDir);

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_RE = /\bsrc\s*=\s*(['"])([^'"]*)\1/i;
const TYPE_RE = /\btype\s*=\s*(['"])([^'"]*)\1/i;

const uniqueHashes = new Set();
const perFileHashCount = new Map();

for (const htmlPath of htmlFiles) {
  const html = readFileSync(htmlPath, 'utf8');
  let match;
  let count = 0;
  SCRIPT_RE.lastIndex = 0;
  while ((match = SCRIPT_RE.exec(html)) !== null) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    if (!body || !body.trim()) continue;
    if (SRC_RE.test(attrs)) continue;
    const typeMatch = attrs.match(TYPE_RE);
    const type = typeMatch ? typeMatch[2].toLowerCase() : '';
    if (type && type.includes('ld+json')) continue;
    if (type && type.includes('speculationrules')) continue;
    const hash = createHash('sha256').update(body, 'utf8').digest('base64');
    uniqueHashes.add(`'sha256-${hash}'`);
    count += 1;
  }
  if (count > 0) {
    perFileHashCount.set(relative(distDir, htmlPath), count);
  }
}

// --- 2. Rewrite _headers ---
const sourceHeaders = readFileSync(publicHeaders, 'utf8');
const hashList = Array.from(uniqueHashes).sort();
const hashesInline = hashList.join(' ');

/* Directives we must rewrite: both `script-src` AND `script-src-elem`.
   CSP Level 3 gives `script-src-elem` precedence over `script-src` for
   <script> element execution, so leaving 'unsafe-inline' on the -elem
   variant makes the sha256 list on the umbrella directive a no-op —
   every inline script would execute under 'unsafe-inline' regardless.
   We treat both directives identically: strip 'unsafe-inline', append
   the generated hash list. `style-src`/`style-src-elem` are intentionally
   untouched (see header comment above — Astro emits scoped inline CSS). */
const SCRIPT_DIRECTIVES_TO_HASH = new Set(['script-src', 'script-src-elem']);

const CSP_LINE_RE = /^(\s*Content-Security-Policy:\s*)([^\r\n]+)$/gm;
const rewritten = sourceHeaders.replace(CSP_LINE_RE, (_full, prefix, policy) => {
  const parts = policy.split(';').map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const firstSpace = part.indexOf(' ');
    const name = firstSpace === -1 ? part : part.slice(0, firstSpace);
    if (SCRIPT_DIRECTIVES_TO_HASH.has(name)) {
      const tokens = part
        .split(/\s+/)
        .filter((t) => t !== "'unsafe-inline'");
      const rebuilt = [...tokens, hashesInline].filter(Boolean).join(' ');
      out.push(rebuilt);
    } else {
      out.push(part);
    }
  }
  return `${prefix}${out.join('; ')}`;
});

writeFileSync(distHeaders, rewritten, 'utf8');

/* Postbuild guard: fail the build if 'unsafe-inline' survives on either
   script directive. This makes it a hard-stop regression to, for example,
   add a new directive in public/_headers that bypasses the rewriter. */
const guardLines = rewritten.match(CSP_LINE_RE) || [];
for (const line of guardLines) {
  const match = line.match(/^(\s*Content-Security-Policy:\s*)([^\r\n]+)$/);
  if (!match) continue;
  const policy = match[2];
  const parts = policy.split(';').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const firstSpace = part.indexOf(' ');
    const name = firstSpace === -1 ? part : part.slice(0, firstSpace);
    if (!SCRIPT_DIRECTIVES_TO_HASH.has(name)) continue;
    if (part.split(/\s+/).includes("'unsafe-inline'")) {
      console.error(
        `[inject-csp-hashes] 'unsafe-inline' survived in ${name} — ` +
          "refusing to ship. Check public/_headers and the rewriter logic.",
      );
      process.exit(1);
    }
  }
}

console.log(
  `[inject-csp-hashes] wrote ${hashList.length} unique sha256 ` +
    `token(s) to dist/_headers on script-src + script-src-elem ` +
    `(scanned ${htmlFiles.length} HTML files).`,
);
if (hashList.length === 0) {
  console.warn(
    '[inject-csp-hashes] No inline scripts found — CSP now rejects ALL inline script. ' +
      'If this is unexpected, inline scripts may have been moved to external files.',
  );
}
