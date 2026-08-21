/**
 * Unit tests for the headline-stat splitter.
 *
 * The splitter exists to fix a typographic defect (Orbitron's `B` is
 * metrically identical to an `8`, so `$868B` scans as a four-digit run), and
 * it sits directly under the most prominent number on every dossier page.
 * Two properties matter more than any individual case:
 *
 *   1. TOTAL FIDELITY. Reassembling the segments must reproduce the input
 *      exactly. A splitter that dropped a character would silently change a
 *      published figure while looking like a CSS tweak.
 *   2. AGREEMENT WITH THE GATES. `statValue` is parsed by check-self-claims
 *      and check-praxis-claims. Those parsers read the raw string, so the
 *      splitter must never be the reason they disagree with the page.
 *
 * Property 1 is asserted against the REAL collection rather than a fixture
 * list, so a newly authored stat shape is covered the moment it lands.
 *
 * Node's built-in runner; `.ts` is imported directly (Node 22 strips types),
 * matching the pattern in service-catalogue.test.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { splitStatValue, hasStatUnit } from '../../src/lib/stat-value.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENG_DIR = join(HERE, '..', '..', 'src', 'content', 'engagements');

const reassemble = (raw) => splitStatValue(raw).map((s) => s.text).join('');
const unitsOf = (raw) =>
  splitStatValue(raw).filter((s) => s.kind === 'unit').map((s) => s.text);

/* ── 1. Total fidelity, the property that must never break ───────────── */

test('reassembling segments reproduces the input exactly', () => {
  const cases = [
    '$868B', '$106M', '$179.3M', '$243K–$473K', '26 routes', '5 nodes',
    '48 hours', '4 bar rules', '9.0 KB', '$1.2B', '100%', 'Fixed fee',
    '', ' ', '—', '$0', '12', 'B', 'M', '$5', '$5B–$6B–$7B',
  ];
  for (const c of cases) {
    assert.equal(reassemble(c), c, `round-trip failed for ${JSON.stringify(c)}`);
  }
});

test('every statValue in the live collection round-trips exactly', () => {
  const files = readdirSync(ENG_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 6, `expected >=6 dossiers, found ${files.length}`);

  let checked = 0;
  for (const f of files) {
    const d = JSON.parse(readFileSync(join(ENG_DIR, f), 'utf8'));
    if (typeof d.statValue !== 'string') continue;
    checked += 1;
    assert.equal(
      reassemble(d.statValue),
      d.statValue,
      `${f} statValue ${JSON.stringify(d.statValue)} did not round-trip`,
    );
    /* Every live stat should have SOMETHING to distinguish — that is the
       premise of the change. If a future stat legitimately has no unit this
       assertion is the right place to make that decision consciously. */
    assert.ok(
      hasStatUnit(d.statValue),
      `${f} statValue ${JSON.stringify(d.statValue)} yielded no unit segment; ` +
        `it will render as undifferentiated digits`,
    );
  }
  /* Coverage floor, not a formality: if statValue were renamed, the loop
     above would check nothing and still pass. */
  assert.ok(checked >= 6, `only ${checked} statValue(s) checked; expected >=6`);
});

/* ── 2. Magnitude suffixes ───────────────────────────────────────────── */

test('a single trailing magnitude suffix is separated', () => {
  assert.deepEqual(splitStatValue('$868B'), [
    { text: '$868', kind: 'value' },
    { text: 'B', kind: 'unit' },
  ]);
  assert.deepEqual(splitStatValue('$106M'), [
    { text: '$106', kind: 'value' },
    { text: 'M', kind: 'unit' },
  ]);
});

test('a decimal figure keeps its point in the value segment', () => {
  assert.deepEqual(splitStatValue('$179.3M'), [
    { text: '$179.3', kind: 'value' },
    { text: 'M', kind: 'unit' },
  ]);
});

test('a range separates both suffixes and preserves the separator', () => {
  /* The case that rules out a naive "style the last character" fix: the
     suffix is interior, occurs twice, and an en-dash sits between. */
  assert.deepEqual(splitStatValue('$243K–$473K'), [
    { text: '$243', kind: 'value' },
    { text: 'K', kind: 'unit' },
    { text: '–$473', kind: 'value' },
    { text: 'K', kind: 'unit' },
  ]);
  assert.deepEqual(unitsOf('$243K–$473K'), ['K', 'K']);
});

/* ── 3. Trailing word units ──────────────────────────────────────────── */

test('a trailing word unit is separated from its number', () => {
  assert.deepEqual(splitStatValue('26 routes'), [
    { text: '26 ', kind: 'value' },
    { text: 'routes', kind: 'unit' },
  ]);
});

test('a multi-word trailing unit is captured whole', () => {
  assert.deepEqual(splitStatValue('4 bar rules'), [
    { text: '4 ', kind: 'value' },
    { text: 'bar rules', kind: 'unit' },
  ]);
});

test('a hyphenated trailing unit stays in one segment', () => {
  assert.deepEqual(unitsOf('3 case-studies'), ['case-studies']);
});

/* ── 4. The false positives the regexes are built to avoid ───────────── */

test('a magnitude letter followed by more letters is NOT a unit', () => {
  /* `$5Bn` and `12Mbps`: splitting these would produce confident nonsense.
     The negative lookahead in MAGNITUDE_RE is what prevents it. */
  assert.equal(unitsOf('$5Bn').length, 0, '$5Bn must not split at B');
  assert.equal(reassemble('$5Bn'), '$5Bn');
  assert.equal(unitsOf('12Mbps').length, 0, '12Mbps must not split at M');
});

test('a magnitude letter not preceded by a digit is NOT a unit', () => {
  assert.equal(unitsOf('B').length, 0);
  assert.equal(unitsOf('$M').length, 0);
});

test('a value with no unit yields exactly one value segment', () => {
  assert.deepEqual(splitStatValue('12'), [{ text: '12', kind: 'value' }]);
  assert.deepEqual(splitStatValue('$0'), [{ text: '$0', kind: 'value' }]);
  assert.equal(hasStatUnit('12'), false);
});

test('prose with no digit is left entirely alone', () => {
  /* TRAILING_WORD_UNIT_RE requires a digit before the word, so a text-only
     stat is not carved into a bogus "unit". */
  assert.deepEqual(splitStatValue('Fixed fee'), [
    { text: 'Fixed fee', kind: 'value' },
  ]);
  assert.equal(hasStatUnit('Fixed fee'), false);
});

/* ── 5. Degenerate input ─────────────────────────────────────────────── */

test('empty and non-string input yield an empty segment list', () => {
  assert.deepEqual(splitStatValue(''), []);
  assert.deepEqual(splitStatValue(null), []);
  assert.deepEqual(splitStatValue(undefined), []);
  assert.deepEqual(splitStatValue(42), []);
  assert.equal(hasStatUnit(''), false);
});

test('segments are never empty strings', () => {
  /* An empty span would emit a pointless DOM node and could make a
     round-trip test pass while the output was subtly malformed. */
  for (const c of ['$868B', '$243K–$473K', '26 routes', 'B', '$5B']) {
    for (const s of splitStatValue(c)) {
      assert.notEqual(s.text, '', `empty segment produced for ${c}`);
    }
  }
});

test('adjacent same-kind runs are merged into one segment', () => {
  /* Canonical output: no two consecutive segments share a kind. */
  for (const c of ['$868B', '$243K–$473K', '26 routes', '$5Bn', 'Fixed fee']) {
    const segs = splitStatValue(c);
    for (let i = 1; i < segs.length; i += 1) {
      assert.notEqual(
        segs[i].kind,
        segs[i - 1].kind,
        `unmerged adjacent ${segs[i].kind} segments in ${c}`,
      );
    }
  }
});

/* ── 6. Agreement with the build gates that parse statValue ──────────── */

test('splitting does not disturb the regexes the gates use', () => {
  /* These are the exact patterns from check-self-claims.mjs and
     check-praxis-claims.mjs. They read the RAW string, so this test asserts
     the contract the splitter promises: it is render-only. If someone later
     "simplifies" this by changing the JSON instead, this test says why not. */
  const MONEY_RE = /\$\d[\d.,]*\s*(?:billion|million|thousand|[BMK])\b/i;
  const ROUTES_RE = /(\d+)\s*routes/i;

  for (const raw of ['$868B', '$106M', '$179.3M']) {
    assert.ok(MONEY_RE.test(raw), `${raw} must match MONEY_RE before splitting`);
    assert.ok(
      MONEY_RE.test(reassemble(raw)),
      `${raw} must still match MONEY_RE after a round-trip`,
    );
  }
  assert.equal(ROUTES_RE.exec('26 routes')?.[1], '26');
  assert.equal(ROUTES_RE.exec(reassemble('26 routes'))?.[1], '26');
});
