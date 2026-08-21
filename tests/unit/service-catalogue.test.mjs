/**
 * Unit tests for the priced service catalogue and its URL codec.
 *
 * WHY THIS EXISTS ALONGSIDE check-service-catalogue.mjs
 * The build gate (sentinel 16) and this file answer different questions and
 * neither substitutes for the other:
 *
 *   - The GATE asserts facts about the SHIPPED ARTEFACT. It needs `dist/`, so
 *     it can only run after a build, and its job is "does the catalogue data
 *     cohere, and did both pages actually render every sku". It is a
 *     data-integrity and render-coverage check.
 *
 *   - THIS FILE asserts the BEHAVIOUR OF THE FUNCTIONS under inputs the real
 *     catalogue does not happen to contain — hostile URLs, synthetic
 *     deliverables, ordering permutations, boundary lengths. It runs in
 *     milliseconds with no build, so it is the lane that catches a codec
 *     regression while the code is being written.
 *
 * The distinction matters because the gate's codec checks all feed REAL skus
 * through the codec. That proves the happy path and proves nothing about the
 * guarantees the receiving page actually leans on: that unknown input is
 * dropped rather than echoed, that click order cannot change the brief, and
 * that a 3 MB query string cannot become work. Those are the properties tested
 * here, each against the specific promise the docstring makes.
 *
 * Node v22 strips TypeScript types natively, so the `.ts` module is imported
 * directly with no build step or loader flag.
 *
 * Run: npm run test:unit   (node --test, no framework dependency)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DELIVERABLES,
  LANES,
  LANE_IDS,
  SCOPE_PARAM,
  SCOPE_SEP,
  SCOPE_BRIEF_HEADING,
  COST_LABEL,
  FEE_POSTURE,
  findDeliverable,
  decodeScope,
  decodeScopeFromParams,
  encodeScope,
  scopeFloor,
  usd,
  priceLabel,
  tierLabel,
  deliverablesForLane,
  formatScopeBrief,
  maxScopeBriefLength,
} from '../../src/lib/service-catalogue.ts';

/** Deterministic sample that always contains at least one quote-only item. */
const priced = DELIVERABLES.filter((d) => d.kind !== 'quote');
const quoted = DELIVERABLES.filter((d) => d.kind === 'quote');

const skusOf = (items) => items.map((d) => d.sku);
const qs = (value) => new URLSearchParams(`${SCOPE_PARAM}=${value}`);

describe('decodeScope — the guarantees the contact page depends on', () => {
  test('drops unknown skus instead of echoing untrusted input', () => {
    const real = DELIVERABLES[0].sku;
    const got = decodeScope(`${real}${SCOPE_SEP}not-a-real-sku`);
    assert.deepEqual(skusOf(got), [real]);
  });

  test('an entirely unknown scope decodes to empty, never to a partial guess', () => {
    assert.deepEqual(decodeScope('nope|also-nope|<script>'), []);
  });

  test('collapses duplicates', () => {
    const sku = DELIVERABLES[0].sku;
    const got = decodeScope([sku, sku, sku].join(SCOPE_SEP));
    assert.deepEqual(skusOf(got), [sku]);
  });

  test('THE ORDERING GUARANTEE: output follows the catalogue, not the URL', () => {
    // Two prospects picking the same set in opposite click order must get an
    // identical brief, or "confirmed scope" stops being a stable artefact.
    const sample = [DELIVERABLES[0], DELIVERABLES[3], DELIVERABLES[7]];
    const forward = decodeScope(skusOf(sample).join(SCOPE_SEP));
    const reversed = decodeScope(skusOf(sample).reverse().join(SCOPE_SEP));
    assert.deepEqual(skusOf(forward), skusOf(reversed));
    // ...and that order is the catalogue's own.
    const catalogueOrder = DELIVERABLES.filter((d) =>
      skusOf(sample).includes(d.sku),
    );
    assert.deepEqual(skusOf(forward), skusOf(catalogueOrder));
  });

  test('tolerates empty segments and stray separators', () => {
    const sku = DELIVERABLES[0].sku;
    const got = decodeScope(`${SCOPE_SEP}${SCOPE_SEP}${sku}${SCOPE_SEP}${SCOPE_SEP}`);
    assert.deepEqual(skusOf(got), [sku]);
  });

  for (const [label, input] of [
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['a number', 42],
    ['an object', { sku: 'x' }],
    ['an array', ['x']],
  ]) {
    test(`returns [] for ${label} rather than throwing`, () => {
      assert.deepEqual(decodeScope(input), []);
    });
  }

  test('THE LENGTH CAP: over-long input of REAL skus is refused, not parsed', () => {
    // Written deliberately with valid skus. An earlier version of this probe
    // used `'a'.repeat(5000)`, which decodes to [] whether the cap exists or
    // not — a vacuous assertion that could never fail. Only genuinely
    // decodable input past the boundary can detect the cap.
    const skus = skusOf(DELIVERABLES);
    let overLong = '';
    let i = 0;
    while (overLong.length <= 2048) {
      overLong += `${skus[i % skus.length]}${SCOPE_SEP}`;
      i += 1;
    }
    assert.ok(overLong.length > 2048, 'probe must exceed the cap to test it');
    assert.deepEqual(decodeScope(overLong), []);
  });

  test('a legitimate whole-catalogue selection sits comfortably under the cap', () => {
    // The cap must refuse abuse without ever refusing a real user. If this
    // fails, the cap is too tight and "select all" would silently decode to [].
    const whole = encodeScope(DELIVERABLES);
    assert.ok(
      whole.length < 2048,
      `whole catalogue encodes to ${whole.length} chars; the 2048 cap would reject a real selection`,
    );
    assert.equal(decodeScope(whole).length, DELIVERABLES.length);
  });
});

describe('encodeScope / decodeScope round-trip', () => {
  test('every single deliverable round-trips to itself', () => {
    for (const d of DELIVERABLES) {
      const back = decodeScope(encodeScope([d]));
      assert.deepEqual(skusOf(back), [d.sku], `sku ${d.sku} failed to round-trip`);
    }
  });

  test('the whole catalogue round-trips with nothing lost or added', () => {
    const back = decodeScope(encodeScope(DELIVERABLES));
    assert.deepEqual(skusOf(back), skusOf(DELIVERABLES));
  });

  test('accepts bare sku strings as well as deliverable objects', () => {
    const sample = DELIVERABLES.slice(0, 4);
    assert.equal(encodeScope(sample), encodeScope(skusOf(sample)));
  });

  test('encoding normalises order and duplicates', () => {
    const sample = [DELIVERABLES[5], DELIVERABLES[1], DELIVERABLES[5]];
    assert.equal(encodeScope(sample), encodeScope([DELIVERABLES[1], DELIVERABLES[5]]));
  });

  test('unknown skus are dropped at encode time too', () => {
    const sku = DELIVERABLES[0].sku;
    assert.equal(encodeScope([sku, 'ghost-sku']), sku);
  });
});

describe('decodeScopeFromParams — both wire shapes must converge', () => {
  // The no-JS path submits a real form (repeated params); the enhanced path
  // writes the pipe-separated house shape. If these ever disagree, turning
  // JavaScript off becomes a route that silently loses the user's selection.
  const sample = [DELIVERABLES[0], DELIVERABLES[2], DELIVERABLES[4]];
  const expected = skusOf(sample);

  test('native repeated-param shape (?scope=a&scope=b)', () => {
    const params = new URLSearchParams();
    for (const d of sample) params.append(SCOPE_PARAM, d.sku);
    assert.deepEqual(skusOf(decodeScopeFromParams(params)), expected);
  });

  test('house pipe-separated shape (?scope=a|b)', () => {
    assert.deepEqual(
      skusOf(decodeScopeFromParams(qs(expected.join(SCOPE_SEP)))),
      expected,
    );
  });

  test('a MIXTURE of both shapes converges on the same answer', () => {
    const params = new URLSearchParams();
    params.append(SCOPE_PARAM, `${expected[0]}${SCOPE_SEP}${expected[1]}`);
    params.append(SCOPE_PARAM, expected[2]);
    assert.deepEqual(skusOf(decodeScopeFromParams(params)), expected);
  });

  test('duplicated across shapes still collapses', () => {
    const params = new URLSearchParams();
    params.append(SCOPE_PARAM, expected.join(SCOPE_SEP));
    for (const s of expected) params.append(SCOPE_PARAM, s);
    assert.deepEqual(skusOf(decodeScopeFromParams(params)), expected);
  });

  test('many short params cannot bypass the single-param length cap', () => {
    // The cap applies to the JOINED length precisely so this cannot be used
    // to smuggle unbounded work past a per-param check.
    const params = new URLSearchParams();
    const skus = skusOf(DELIVERABLES);
    let total = 0;
    let i = 0;
    while (total <= 2048) {
      const s = skus[i % skus.length];
      params.append(SCOPE_PARAM, s);
      total += s.length + 1;
      i += 1;
    }
    assert.deepEqual(decodeScopeFromParams(params), []);
  });

  test('returns [] for null, undefined, and a params object with no scope', () => {
    assert.deepEqual(decodeScopeFromParams(null), []);
    assert.deepEqual(decodeScopeFromParams(undefined), []);
    assert.deepEqual(decodeScopeFromParams(new URLSearchParams('other=1')), []);
  });
});

describe('scopeFloor — arithmetic that must not lie by omission', () => {
  test('empty selection is a zeroed, well-formed result', () => {
    assert.deepEqual(scopeFloor([]), { floor: 0, quoteCount: 0, count: 0 });
  });

  test('sums the published floors of priced deliverables', () => {
    const sample = priced.slice(0, 3);
    const expected = sample.reduce((n, d) => n + d.from, 0);
    assert.equal(scopeFloor(sample).floor, expected);
  });

  test('quote-only deliverables are COUNTED, never silently summed as zero', () => {
    if (quoted.length === 0) return; // catalogue has no quote-only items
    const one = quoted[0];
    const result = scopeFloor([one]);
    assert.equal(result.floor, 0);
    assert.equal(result.quoteCount, 1);
    assert.equal(result.count, 1);
  });

  test('a mixed selection reports the floor and the quote count separately', () => {
    if (quoted.length === 0) return;
    const sample = [...priced.slice(0, 2), quoted[0]];
    const result = scopeFloor(sample);
    assert.equal(result.floor, priced[0].from + priced[1].from);
    assert.equal(result.quoteCount, 1);
    assert.equal(result.count, 3);
    /* THE OMISSION PROPERTY, stated as arithmetic rather than as vibes.
       Adding a quote-only deliverable must move `quoteCount` and leave `floor`
       untouched. An earlier draft of this assertion read
       `count > floor / Math.max(1, floor)`, which reduces to `count > 1` and
       is therefore true by construction for any multi-item sample — it could
       not have failed if the floor HAD absorbed the unpriced item. */
    const withoutQuoted = scopeFloor(priced.slice(0, 2));
    assert.equal(result.floor, withoutQuoted.floor);
    assert.equal(result.quoteCount, withoutQuoted.quoteCount + 1);
    assert.equal(result.count, withoutQuoted.count + 1);
  });

  test('count always equals the input length', () => {
    assert.equal(scopeFloor(DELIVERABLES).count, DELIVERABLES.length);
  });

  test('is order-independent', () => {
    const sample = DELIVERABLES.slice(0, 6);
    assert.deepEqual(scopeFloor(sample), scopeFloor([...sample].reverse()));
  });
});

describe('formatting helpers', () => {
  test('usd inserts thousands separators and a leading $', () => {
    assert.equal(usd(0), '$0');
    assert.equal(usd(950), '$950');
    assert.equal(usd(1500), '$1,500');
    assert.equal(usd(45650), '$45,650');
  });

  test('priceLabel reflects the price kind for every deliverable', () => {
    for (const d of DELIVERABLES) {
      const label = priceLabel(d);
      assert.ok(label.length > 0, `${d.sku} has an empty price label`);
      if (d.kind === 'quote') {
        assert.equal(label, 'Contact for pricing');
        assert.ok(!label.includes('$'), 'a quote-only item must not show a figure');
      } else if (d.kind === 'tiered') {
        assert.ok(label.includes('/'), `${d.sku} is tiered but shows one figure`);
      } else {
        assert.equal(label, `Starting at ${usd(d.from)}`);
      }
    }
  });

  test('tierLabel is a ladder for tiered items and null for everything else', () => {
    for (const d of DELIVERABLES) {
      const label = tierLabel(d);
      if (d.kind === 'tiered') {
        assert.ok(typeof label === 'string' && label.length > 0);
        assert.equal(label.split('/').length, d.tiers.length);
      } else {
        assert.equal(label, null);
      }
    }
  });

  test('findDeliverable resolves every sku and refuses anything else', () => {
    for (const d of DELIVERABLES) {
      assert.equal(findDeliverable(d.sku), d);
    }
    assert.equal(findDeliverable('ghost-sku'), undefined);
    assert.equal(findDeliverable(''), undefined);
  });

  test('deliverablesForLane partitions the catalogue exactly', () => {
    let seen = 0;
    for (const id of LANE_IDS) {
      const items = deliverablesForLane(id);
      assert.ok(items.length > 0, `lane ${id} renders no deliverables`);
      for (const d of items) assert.equal(d.lane, id);
      seen += items.length;
    }
    // Every deliverable belongs to exactly one lane: no orphans, no doubles.
    assert.equal(seen, DELIVERABLES.length);
  });

  test('LANES and LANE_IDS agree in both directions', () => {
    assert.deepEqual(
      [...LANES.map((l) => l.id)].sort(),
      [...LANE_IDS].sort(),
    );
  });
});

describe('formatScopeBrief — what actually reaches the practice', () => {
  test('an empty selection produces an empty string, not a stub heading', () => {
    // The contact page appends this to the signal; a heading with no items
    // would transmit a scope block claiming a scope that was never assembled.
    assert.equal(formatScopeBrief([]), '');
  });

  test('names every selected deliverable', () => {
    const sample = DELIVERABLES.slice(0, 5);
    const brief = formatScopeBrief(sample);
    for (const d of sample) {
      assert.ok(brief.includes(d.title), `brief omits "${d.title}"`);
    }
  });

  test('states the count in the heading and matches the line count', () => {
    const sample = DELIVERABLES.slice(0, 4);
    const brief = formatScopeBrief(sample);
    assert.ok(brief.startsWith(`${SCOPE_BRIEF_HEADING} (4):`));
    assert.equal(brief.split('\n').filter((l) => l.startsWith('- ')).length, 4);
  });

  test('READER WORDING: the cost line uses COST_LABEL and the real figure', () => {
    const sample = priced.slice(0, 2);
    const { floor } = scopeFloor(sample);
    const brief = formatScopeBrief(sample);
    assert.ok(brief.includes(`${COST_LABEL}: ${usd(floor)}`));
    // The superseded phrasing must not come back by copy-paste.
    assert.ok(!/indicative/i.test(brief), 'brief reintroduced "indicative"');
  });

  test('the brief never calls the figure a total', () => {
    const brief = formatScopeBrief(DELIVERABLES);
    for (const banned of [/\btotal\b/i, /\bsubtotal\b/i, /\binvoice\b/i, /\bcart\b/i]) {
      assert.ok(!banned.test(brief), `brief matched ${banned}`);
    }
  });

  test('quote-only items are named in the cost line with correct pluralisation', () => {
    if (quoted.length === 0) return;
    const one = formatScopeBrief([...priced.slice(0, 1), quoted[0]]);
    assert.ok(one.includes('plus 1 deliverable quoted on scope'), one);

    if (quoted.length >= 2) {
      const two = formatScopeBrief([...priced.slice(0, 1), ...quoted.slice(0, 2)]);
      assert.ok(two.includes('plus 2 deliverables quoted on scope'), two);
    }
  });

  test('an all-priced selection makes no quote claim at all', () => {
    const brief = formatScopeBrief(priced.slice(0, 3));
    assert.ok(!/quoted on scope/.test(brief));
  });

  test('maxScopeBriefLength is a true upper bound over every selection size', () => {
    // The contact page subtracts this from the textarea maxlength. If it
    // under-reports, a long message plus a scope block can exceed SIGNAL_MAX
    // and the honest path 400s.
    const bound = maxScopeBriefLength();
    assert.ok(bound > 0);
    assert.equal(bound, formatScopeBrief(DELIVERABLES).length);
    for (let n = 1; n <= DELIVERABLES.length; n += 1) {
      const len = formatScopeBrief(DELIVERABLES.slice(0, n)).length;
      assert.ok(len <= bound, `a ${n}-item brief (${len}) exceeded the bound (${bound})`);
    }
  });

  test('the worst-case brief fits well inside the server signal budget', () => {
    // SIGNAL_MAX is 10_000 in functions/api/_shared/validate.js. Asserted here
    // as a coarse sanity floor; the build gate reads the real constant and
    // checks the precise headroom.
    assert.ok(
      maxScopeBriefLength() < 10_000 / 2,
      `worst-case brief ${maxScopeBriefLength()} chars leaves too little room for a message`,
    );
  });
});

describe('posture constants', () => {
  test('FEE_POSTURE is present and substantive', () => {
    // This is the sentence that makes every published price a floor rather
    // than a quote. Publishing prices without it is a misrepresentation.
    assert.equal(typeof FEE_POSTURE, 'string');
    assert.ok(FEE_POSTURE.trim().length >= 20);
  });

  test('COST_LABEL is reader-friendly and free of the superseded wording', () => {
    assert.equal(typeof COST_LABEL, 'string');
    assert.ok(COST_LABEL.trim().length > 0);
    assert.ok(!/indicative/i.test(COST_LABEL));
    assert.ok(!/\btotal\b/i.test(COST_LABEL), 'the label must not imply an invoice');
  });
});
