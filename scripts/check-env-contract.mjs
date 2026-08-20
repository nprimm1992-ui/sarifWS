#!/usr/bin/env node
/**
 * check-env-contract — static guard against "absent variable selects the
 * less-safe branch" bugs in functions/.
 *
 * ── Origin ──────────────────────────────────────────────────────────────────
 * Two production security controls silently disabled themselves because
 * `env.ENVIRONMENT` was never set on the Cloudflare Pages project:
 *
 *   functions/api/transmit.js        → Turnstile verification bypassed
 *   functions/api/_shared/validate.js → public hardcoded IP hash salt used
 *
 * Both read `env.ENVIRONMENT === 'production'`. Absent variable → `false` →
 * development branch → control off. Nothing failed loudly; the site served
 * 200s while unprotected.
 *
 * ── What this checks ────────────────────────────────────────────────────────
 * 1. No file under functions/ derives production posture by comparing
 *    `env.ENVIRONMENT` directly. That comparison is fail-open by construction:
 *    every typo, every unset var, every new preview environment resolves to
 *    "not production". runtime-env.js is the single sanctioned decider.
 *
 * 2. runtime-env.js itself still exports resolveDeploymentPosture, so rule 1
 *    cannot be satisfied by deleting the thing it points at.
 *
 * This is a *lint*, not a runtime check — it cannot see the Cloudflare
 * dashboard. Its job is to keep the fail-safe decision funnelled through one
 * reviewed module.
 *
 * Exit 0 = contract holds. Exit 1 = violation, with file:line and rationale.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const FUNCTIONS_DIR = join(ROOT, 'functions');
const SANCTIONED = join(FUNCTIONS_DIR, 'api', '_shared', 'runtime-env.js');

/** Files permitted to mention env.ENVIRONMENT at all. */
const ALLOWLIST = new Set([
  relative(ROOT, SANCTIONED),
  // validate.js reads ENVIRONMENT only to *downgrade* to the dev salt, never
  // to grant production trust. Reviewed 2026-08.
  join('functions', 'api', '_shared', 'validate.js'),
]);

/**
 * Patterns that indicate posture derived straight from the env var.
 * Deliberately narrow: we flag equality comparisons against 'production',
 * not every mention, so diagnostics and logging remain possible.
 */
const FORBIDDEN = [
  {
    re: /ENVIRONMENT\s*===?\s*['"`]production['"`]/,
    why: "derives production posture from env.ENVIRONMENT (fail-open when unset)",
  },
  {
    re: /['"`]production['"`]\s*===?\s*\w*\.?ENVIRONMENT/,
    why: "derives production posture from env.ENVIRONMENT (fail-open when unset)",
  },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

/** Strip line/block comments so prose about the bug isn't flagged as the bug. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/**
 * Coverage floor for the functions/ scan.
 *
 * `walk()` swallows a failed readdirSync and returns an empty array, so if
 * functions/ were moved or renamed this lint would scan nothing, collect zero
 * violations and report "OK — no fail-open posture checks" — itself a
 * fail-open, and a particularly ironic one in the script whose entire purpose
 * is catching that species.
 *
 * 19 .js files ship under functions/ today. Graduated rather than `> 0`
 * because the realistic regression is a subdirectory dropping out of the
 * walk, not the whole tree disappearing.
 */
const MIN_FUNCTION_FILES = 19;

const scanned = walk(FUNCTIONS_DIR);
if (scanned.length < MIN_FUNCTION_FILES) {
  console.error(
    `[check-env-contract] FAIL — scanned ${scanned.length} file(s) under functions/, ` +
      `expected at least ${MIN_FUNCTION_FILES}.\n` +
      '  walk() returns an empty array when the directory cannot be read, so a\n' +
      '  moved or renamed functions/ tree would make this lint pass by examining\n' +
      '  nothing. Verify the path, or lower MIN_FUNCTION_FILES deliberately if\n' +
      '  files were genuinely removed.',
  );
  process.exit(1);
}

const violations = [];

for (const file of scanned) {
  const rel = relative(ROOT, file);
  if (ALLOWLIST.has(rel)) continue;

  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    for (const { re, why } of FORBIDDEN) {
      if (re.test(line)) {
        violations.push({ rel, line: i + 1, why, text: line.trim() });
      }
    }
  });
}

// Rule 2 — the sanctioned decider must still exist and export the API.
let sanctionedOk;
try {
  sanctionedOk = /export\s+function\s+resolveDeploymentPosture/.test(
    readFileSync(SANCTIONED, 'utf8'),
  );
} catch {
  sanctionedOk = false;
}

if (!sanctionedOk) {
  console.error(
    '[check-env-contract] FAIL — functions/api/_shared/runtime-env.js must exist ' +
      'and export resolveDeploymentPosture(). It is the single sanctioned way to ' +
      'decide production posture.',
  );
  process.exit(1);
}

if (violations.length > 0) {
  console.error('[check-env-contract] FAIL — fail-open posture checks found:\n');
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    ↳ ${v.why}`);
    console.error(
      '    ↳ Use: import { resolveDeploymentPosture } from ".../_shared/runtime-env.js"\n',
    );
  }
  console.error(
    'An unset environment variable must never select the less-safe branch.\n' +
      'runtime-env.js derives posture from the request hostname, which cannot\n' +
      'be forgotten during configuration.',
  );
  process.exit(1);
}

console.log(
  `[check-env-contract] OK — no fail-open ENVIRONMENT posture checks in ` +
    `${scanned.length} file(s) under functions/`,
);
