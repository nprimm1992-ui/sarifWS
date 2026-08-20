#!/usr/bin/env node
/**
 * Sentinel — eng-006 self-referential claim agreement.
 *
 * Why this exists
 * ---------------
 * eng-006 is the only dossier in the hall whose subject IS this repository.
 * That makes it the only one whose claims are mechanically checkable — and
 * therefore the only one with no excuse for drifting. It is also the one most
 * likely to drift, because every claim it makes is a fact about a codebase
 * that changes on every commit:
 *
 *   - "9.0 KB gzipped" moves the moment anyone edits the landing page
 *   - "19 Workers functions" moves when anyone adds an endpoint
 *   - "22 routes" moves when anyone adds a page
 *   - "eight build sentinels" moves when anyone adds a sentinel — including
 *     this one, which is the joke, and the reason the count is asserted from
 *     package.json rather than hardcoded
 *
 * Every other dossier's numbers come from client engagements and can only be
 * verified by a human reading a source document. These can be verified by
 * counting. A claim that *can* be checked and *isn't* is strictly worse than
 * one that can't, because the reader has no way to tell the two apart.
 *
 * Design note: this gate reads the numbers out of the prose rather than
 * requiring the prose to be generated. Generated copy would be immune to
 * drift but unreadable — the whole value of the dossier is that it is written.
 * So the prose stays hand-written and the gate holds it honest.
 *
 * Exit codes: 0 = pass, 1 = at least one finding.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TAG = '[check-self-claims]';
const DOSSIER = join(ROOT, 'src/content/engagements/eng-006.json');
const DIST = join(ROOT, 'dist');

const findings = [];

/* ------------------------------------------------------------------ *
 * Fail-closed preconditions.
 *
 * A checker that cannot find its subject must fail, not pass. Reporting
 * "OK" while inspecting nothing is the defect species this codebase has
 * now closed six times; it is not going to be reintroduced here.
 * ------------------------------------------------------------------ */
if (!existsSync(DOSSIER)) {
  console.error(
    `${TAG} FAIL — eng-006.json not found. This gate exists to keep that ` +
      `dossier's self-referential claims true; with the file missing it has ` +
      `nothing to verify and must not report success.`,
  );
  process.exit(1);
}

if (!existsSync(DIST)) {
  console.error(
    `${TAG} FAIL — no dist/. This gate measures the built artefact (gzipped ` +
      `landing HTML, route count, CSP tokens), so it must run after ` +
      `\`astro build\`. Run it from \`npm run postbuild\`, not standalone.`,
  );
  process.exit(1);
}

const data = JSON.parse(readFileSync(DOSSIER, 'utf8'));
const prose = [...(data.leads ?? []), ...(data.highlights ?? [])].join('\n');

/* Every assertion is (label, claimed, actual, tolerance, remedy). */
const checks = [];

/*
 * Checks derived from the BUILT ARTEFACT rather than from matched prose.
 * Tracked separately because they are pushed unconditionally, so they
 * cannot serve as evidence that the dossier still asserts anything — see
 * the coverage floor at the bottom of this file.
 */
let unconditionalChecks = 0;

const claim = (label, re, transform = Number) => {
  const m = prose.match(re);
  if (!m) return null;
  return transform(m[1].replace(/,/g, ''));
};

/* --- 1. landing document weight, gzipped ---------------------------- */
/*
 * The headline stat. This is the claim that justifies the whole
 * "environment that behaves like a text document" argument, so it gets a
 * real tolerance rather than an exact match: gzip output varies by a few
 * bytes across zlib versions, and holding the copy to 3 significant
 * figures would make the gate fail for reasons that have nothing to do
 * with the site getting heavier.
 */
const landing = join(DIST, 'index.html');
if (existsSync(landing)) {
  const actualKb = gzipSync(readFileSync(landing)).length / 1024;
  const claimedKb = claim('landing', /([\d.]+)\s*KB\s+gzipped/i);
  const statKb = data.statValue?.match(/([\d.]+)\s*KB/i)?.[1];

  for (const [where, c] of [
    ['prose', claimedKb],
    ['statValue', statKb ? Number(statKb) : null],
  ]) {
    if (c === null) continue;
    unconditionalChecks += 1;
    checks.push({
      label: `landing HTML gzipped (${where})`,
      claimed: `${c} KB`,
      actual: `${actualKb.toFixed(1)} KB`,
      ok: Math.abs(actualKb - c) <= 0.5,
      remedy:
        `The landing document got heavier or lighter. Either restore the ` +
        `budget or update the figure in BOTH statValue and the prose — the ` +
        `headline stat and the body copy must not disagree.`,
    });
  }
}

/* --- 2. three.js must stay off the landing critical path ------------ */
/*
 * Not a number — a structural invariant, and the one most likely to be
 * broken by accident. Someone converts the dynamic import to a static one,
 * everything still works locally, and the central claim of the dossier
 * silently becomes false. There is no number to notice changing.
 */
if (existsSync(landing)) {
  const html = readFileSync(landing, 'utf8');
  const eager = /<script[^>]+src="[^"]*three\.[^"]*\.js"/i.test(html);
  unconditionalChecks += 1;
  checks.push({
    label: 'three.js absent from landing critical path',
    claimed: 'absent',
    actual: eager ? 'PRESENT as a <script src>' : 'absent',
    ok: !eager,
    remedy:
      `eng-006 claims the renderer is "absent from the critical path" and ` +
      `"dynamically imported only after first paint". A static <script src> ` +
      `for three.js falsifies that. Restore the dynamic import in ` +
      `src/layouts/Base.astro.`,
  });
}

/* --- 3. Workers functions ------------------------------------------ */
const walk = (dir, pred) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, pred));
    else if (pred(p)) out.push(p);
  }
  return out;
};

const fnCount = walk(join(ROOT, 'functions'), (p) => p.endsWith('.js')).length;
/*
 * Matched from both the prose ("19 Workers functions") and the stat LABEL
 * ("Shipped with 19 edge functions"). statLabel is prose the reader sees
 * first, so it earns the same scrutiny as the body — and being a label
 * rather than a sentence is not an exemption from being true.
 */
const statFns = data.statLabel?.match(/(\d+)\s*edge functions/i)?.[1];
for (const [where, c] of [
  ['prose', claim('functions', /(\d+)\s+Workers functions/i)],
  ['statLabel', statFns ? Number(statFns) : null],
]) {
  if (c === null) continue;
  checks.push({
    label: `Workers functions (${where})`,
    claimed: c,
    actual: fnCount,
    ok: c === fnCount,
    remedy:
      `Update the count in BOTH eng-006's statLabel and its serverless ` +
      `highlight.`,
  });
}

/* --- 4. built routes ----------------------------------------------- */
/*
 * Checked in BOTH places the number appears. The route count is now the
 * headline stat as well as a body figure, and a headline that disagrees
 * with its own prose is the most visible way for this dossier to be wrong
 * — it is the first thing on the page and the last thing anyone re-reads.
 */
const routeCount = walk(DIST, (p) => p.endsWith('.html')).length;
const statRoutes = data.statValue?.match(/(\d+)\s*routes/i)?.[1];
for (const [where, c] of [
  ['prose', claim('routes', /(\d+)\s+routes/i)],
  ['statValue', statRoutes ? Number(statRoutes) : null],
]) {
  if (c === null) continue;
  checks.push({
    label: `built HTML routes (${where})`,
    claimed: c,
    actual: routeCount,
    ok: c === routeCount,
    remedy:
      `Update the route count in BOTH eng-006's statValue and its final ` +
      `highlight — the headline stat and the body copy must not disagree.`,
  });
}

/* --- 5. build sentinels, counted from the pipeline ------------------ */
/*
 * Asserted against package.json's postbuild script rather than a glob of
 * scripts/, because the claim is about gates that actually RUN. A checker
 * sitting in scripts/ that nothing invokes is not a gate, and counting it
 * would overstate the posture — which is the exact failure mode this file
 * exists to prevent.
 *
 * Counted by ROLE, not by filename prefix. The previous version matched
 * /check-[a-z-]+\.mjs/, which silently depended on a naming convention:
 * verify-sitemap.mjs is a real sentinel — it runs in this pipeline and
 * exits 1 on a malformed sitemap — but it was invisible to the count purely
 * because it is not spelled "check-". That is the same assume-don't-derive
 * mistake as hardcoding an anchor prefix. So the rule is now explicit: every
 * step in postbuild is a sentinel EXCEPT the ones that exist to transform
 * output rather than to reject it.
 */
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const postbuild = pkg.scripts?.postbuild ?? '';
/**
 * Postbuild steps that mutate the build instead of gating it. These are
 * pipeline *steps*, not sentinels: inject-csp-hashes rewrites _headers, it
 * does not refuse a bad build.
 */
const NON_GATE_STEPS = new Set(['inject-csp-hashes.mjs']);
const allSteps = new Set(postbuild.match(/[a-z][a-z-]*\.mjs/g) ?? []);
const gateSteps = [...allSteps].filter((s) => !NON_GATE_STEPS.has(s));
const gateCount = gateSteps.length;
/*
 * Fail closed if the parse collapses. A renamed script field or a switch to
 * a task runner would leave allSteps empty, gateCount at 0, and — since the
 * claim below only runs `if (gateWord)` — could quietly stop asserting
 * anything at all.
 */
if (allSteps.size === 0) {
  console.error(
    '[check-self-claims] FAIL — parsed 0 steps out of package.json\'s postbuild ' +
      'script.\n    The sentinel count is derived from that string, so a parse ' +
      'failure here would\n    silently stop verifying the claim rather than ' +
      'report a mismatch.',
  );
  process.exit(1);
}
const WORD_TO_N = {
  four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
};
const gateWord = prose.match(
  new RegExp(`\\b(${Object.keys(WORD_TO_N).join('|')})\\s+build sentinels`, 'i'),
);
if (gateWord) {
  const gateClaim = WORD_TO_N[gateWord[1].toLowerCase()];
  checks.push({
    label: 'build sentinels in the postbuild pipeline',
    claimed: `${gateWord[1]} (${gateClaim})`,
    actual: gateCount,
    ok: gateClaim === gateCount,
    remedy:
      `Adding a sentinel changes this number — including adding THIS one. ` +
      `Update the word in eng-006's sentinel highlight. Counted from ` +
      `package.json's postbuild script, so a checker that exists but is ` +
      `never invoked deliberately does not count.`,
  });
}

/* --- 6. GLB scenes -------------------------------------------------- */
const glbCount = walk(join(ROOT, 'public'), (p) => p.endsWith('.glb')).length;
const GLB_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const glbMatch = prose.match(
  new RegExp(
    `\\b(${Object.keys(GLB_WORDS).join('|')}|\\d+)\\s+Meshopt-compressed GLB`,
    'i',
  ),
);
if (glbMatch) {
  const token = glbMatch[1].toLowerCase();
  const glbClaim = GLB_WORDS[token] ?? Number(token);
  checks.push({
    label: 'Meshopt-compressed GLB scenes',
    claimed: `${glbMatch[1]} (${glbClaim})`,
    actual: glbCount,
    ok: glbClaim === glbCount,
    remedy: `Update the GLB count in eng-006's WebGL highlight.`,
  });
}

/* --- 7. CSP hash tokens, unique ------------------------------------- */
/*
 * Counted UNIQUE. The injector writes the same token set to both
 * script-src and script-src-elem, so a naive grep returns exactly double
 * and would have shipped "24" into the copy. Caught while drafting this
 * dossier; encoded here so nobody re-derives the wrong number later.
 */
const headers = join(DIST, '_headers');
if (existsSync(headers)) {
  const uniq = new Set(
    readFileSync(headers, 'utf8').match(/sha256-[A-Za-z0-9+/=]+/g) ?? [],
  ).size;
  const cspClaim = claim('csp', /(\d+)\s+sha256 tokens/i);
  if (cspClaim !== null) {
    checks.push({
      label: 'unique CSP sha256 tokens',
      claimed: cspClaim,
      actual: uniq,
      ok: cspClaim === uniq,
      remedy:
        `Count UNIQUE tokens: they are written to both script-src and ` +
        `script-src-elem, so a raw grep double-counts. Inline script changes ` +
        `move this number.`,
    });
  }
}

/* --- 8. reduced-motion coverage ------------------------------------- */
const srcFiles = walk(join(ROOT, 'src'), (p) =>
  /\.(astro|ts|js|css)$/.test(p),
);
let rmBlocks = 0;
let rmGuards = 0;
for (const f of srcFiles) {
  const s = readFileSync(f, 'utf8');
  rmBlocks += (s.match(/@media[^{]*prefers-reduced-motion/g) ?? []).length;
  rmGuards += (s.match(/matchMedia\(\s*'\(prefers-reduced-motion/g) ?? []).length;
}
const rmBlockClaim = claim('rm', /(\d+)\s+reduced-motion style blocks/i);
const rmGuardClaim = claim('rmg', /(\d+)\s+runtime motion guards/i);
if (rmBlockClaim !== null) {
  checks.push({
    label: 'reduced-motion style blocks',
    claimed: rmBlockClaim,
    actual: rmBlocks,
    ok: rmBlockClaim === rmBlocks,
    remedy: `Update the figure in eng-006's accessibility highlight.`,
  });
}
if (rmGuardClaim !== null) {
  checks.push({
    label: 'runtime motion guards',
    claimed: rmGuardClaim,
    actual: rmGuards,
    ok: rmGuardClaim === rmGuards,
    remedy: `Update the figure in eng-006's accessibility highlight.`,
  });
}

/* --- 9. lines of code ----------------------------------------------- */
/*
 * Tolerance ±1500 and stated as "~". An exact LOC claim would fail on
 * every commit, which trains authors to ignore the gate — a gate nobody
 * trusts is worse than no gate. The claim is about order of magnitude and
 * the check is scoped to match.
 */
const locFiles = ['src', 'scripts', 'functions', 'tests'].flatMap((d) =>
  walk(join(ROOT, d), (p) => /\.(astro|ts|js|mjs|css)$/.test(p)),
);
let loc = 0;
for (const f of locFiles) loc += readFileSync(f, 'utf8').split('\n').length;
const locClaim = claim('loc', /~?([\d,]+)\s+lines/i);
if (locClaim !== null) {
  checks.push({
    label: 'lines of code (±1500)',
    claimed: `~${locClaim.toLocaleString()}`,
    actual: loc.toLocaleString(),
    ok: Math.abs(loc - locClaim) <= 1500,
    remedy:
      `Round to the nearest thousand and keep the "~". This is an ` +
      `order-of-magnitude claim, not a measurement.`,
  });
}

/* --- 10. e2e test count --------------------------------------------- */
const specFiles = walk(join(ROOT, 'tests'), (p) => p.endsWith('.spec.ts'));
let testCount = 0;
for (const f of specFiles) {
  testCount += (readFileSync(f, 'utf8').match(/^\s*test\(/gm) ?? []).length;
}
const testClaim = claim('tests', /(\d+)\s+end-to-end tests/i);
if (testClaim !== null) {
  checks.push({
    label: 'end-to-end tests',
    claimed: testClaim,
    actual: testCount,
    ok: testClaim === testCount,
    remedy:
      `Counted as top-level test() calls across tests/**/*.spec.ts. If the ` +
      `runner reports a different total, prefer the runner and reword the ` +
      `claim to match what it measures.`,
  });
}

/* ------------------------------------------------------------------ */
/*
 * Coverage floor.
 *
 * `checks.length === 0` was the first version of this guard and it was a
 * fail-open: two of the checks above (landing weight, three.js placement)
 * are pushed unconditionally from the built artefact rather than from
 * matched prose, so the array is never empty and the emptiness test could
 * never fire. A dossier rewritten to say "We built a website. It has some
 * pages." passed with 2/2 green — the gate reported success having verified
 * nothing the author actually wrote.
 *
 * Caught by canary, not by reading. So the floor is expressed in terms of
 * claims EXTRACTED FROM PROSE, which is the thing at risk of going missing.
 */
const proseDerived = checks.length - unconditionalChecks;
const MIN_PROSE_CLAIMS = 6;

if (proseDerived < MIN_PROSE_CLAIMS) {
  console.error(
    `${TAG} FAIL — only ${proseDerived} checkable claim(s) extracted from ` +
      `eng-006's prose; expected at least ${MIN_PROSE_CLAIMS}.\n\n` +
      `  This is a coverage floor, not a style rule. eng-006's whole premise ` +
      `is that its claims are verifiable by counting, so prose that asserts ` +
      `nothing countable has abandoned the premise — and a gate that then ` +
      `reports OK is worse than no gate, because it certifies an empty ` +
      `check. Either restore the specific numbers, or delete this sentinel ` +
      `deliberately rather than hollowing it out by accident.`,
  );
  process.exit(1);
}

for (const c of checks) {
  if (!c.ok) {
    findings.push(
      `${c.label} — dossier claims ${c.claimed}, repository has ${c.actual}. ${c.remedy}`,
    );
  }
}

if (findings.length > 0) {
  console.error(`${TAG} FAIL — ${findings.length} stale claim(s) in eng-006:`);
  for (const f of findings) console.error(`  \u2022 ${f}`);
  console.error(
    `\n  eng-006's subject is this repository, so these are the only claims ` +
      `in the hall that can be checked by counting. Leaving one wrong is ` +
      `worse than not making it.`,
  );
  process.exit(1);
}

console.log(
  `${TAG} OK — ${checks.length} self-referential claim(s) in eng-006 agree ` +
    `with the repository (landing ${
      existsSync(landing)
        ? `${(gzipSync(readFileSync(landing)).length / 1024).toFixed(1)} KB gz`
        : 'n/a'
    }, ${routeCount} routes, ${fnCount} functions, ${gateCount} sentinels, ` +
    `${loc.toLocaleString()} lines)`,
);
