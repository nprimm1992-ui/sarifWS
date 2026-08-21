/**
 * Headline-stat typography: separating a magnitude suffix from its digits.
 *
 * ── The defect this fixes ───────────────────────────────────────────────────
 *
 * eng-004's stat reads `$868B` and the trailing `B` looked broken — as though
 * the glyph were misaligned with the `8` beside it. It is not misaligned. It
 * was measured:
 *
 *   Orbitron 700, per-glyph ink geometry relative to the alphabetic baseline
 *     '8'  topFromBaseline 33  inkHeight 33  inkWidth 33  advance 37
 *     '6'  topFromBaseline 33  inkHeight 33  inkWidth 33  advance 37
 *     'B'  topFromBaseline 33  inkHeight 33  inkWidth 33  advance 37
 *
 * The `B` is metrically IDENTICAL to a digit — same cap height, same ink
 * width, same advance, same baseline. There is no kerning error to correct
 * and nothing to nudge. That identity is the whole problem: Orbitron is a
 * geometric display face whose `B` is essentially an `8` with the left bowls
 * opened, so `$868B` scans as a four-digit run ending in a malformed `8`
 * rather than as "868, billions". The eye tries to read the unit as a digit
 * and fails, which is exactly what "the 8 and the B do not align well"
 * describes from the outside.
 *
 * A nudge (letter-spacing, a translate) would therefore fix nothing — it
 * would space a digit-shaped glyph further from its neighbours while leaving
 * it digit-shaped. The only real fix is to stop the suffix from reading as
 * part of the number, which means giving it its own visual channel.
 *
 * This is systemic, not one dossier's problem. Every money stat in the hall
 * carries a magnitude suffix (`$106M`, `$179.3M`, `$243K–$473K`, `$868B`),
 * so all of them share the ambiguity to some degree. `B` is simply the worst
 * case because `B ≈ 8`. Fixing it per-file would leave the same defect in
 * four other places and no rule for the next author.
 *
 * ── Why a render-time split, and not a content change ───────────────────────
 *
 * `statValue` is a plain string in the content schema and it is READ BY
 * MACHINES as well as people:
 *
 *   - check-self-claims.mjs parses it with /(\d+)\s*routes/i and
 *     /([\d.]+)\s*KB/i, asserting the headline agrees with the built artefact.
 *   - check-praxis-claims.mjs folds it into dossierText() and harvests
 *     /\$\d[\d.,]*\s*(?:billion|million|thousand|[BMK])\b/ from it, making the
 *     dossiers the authority for every money figure Praxis is allowed to cite.
 *
 * So the two things that must NOT happen are: putting markup in the JSON
 * (`$868<span>B</span>` would corrupt both parsers and, per
 * check-engagement-hero's asymmetry rule, markup does not belong in content
 * strings that render as plain text), and splitting the schema into
 * value+suffix fields (which would break MONEY_RE's contiguous match and
 * silently un-attest `$868B` for the Praxis gate — every article citing it
 * would start failing for a reason that looks unrelated).
 *
 * Splitting at RENDER time keeps `statValue` byte-identical on disk. Both
 * gates keep parsing exactly what they parse today; only the pixels change.
 *
 * ── Why the segments are typed, not just sliced ─────────────────────────────
 *
 * Callers need to style digits and units differently, and `$243K–$473K` shows
 * why a naive "last character" rule is wrong: the suffix is interior, appears
 * twice, and there is a separator between the two figures. Returning a token
 * stream lets the template style by KIND and stay correct for every shape in
 * the hall, including ones nobody has authored yet.
 */

/** A run of characters sharing one typographic role. */
export interface StatSegment {
  text: string;
  /**
   * `unit` — a magnitude suffix (B/M/K) or a trailing word unit; the part that
   * is not a number and must not be read as one.
   * `value` — digits, currency marks, separators, everything else.
   */
  kind: 'value' | 'unit';
}

/**
 * Magnitude suffixes, matched only where they are genuinely a unit: directly
 * after a digit, and not followed by another letter.
 *
 * The trailing `(?![A-Za-z])` is load-bearing. Without it this would split the
 * `B` out of a hypothetical `$5Bn` or the `M` out of `12Mbps`, producing
 * confident nonsense. Requiring a digit immediately before is the other half:
 * it keeps the rule from firing inside ordinary words.
 */
const MAGNITUDE_RE = /(?<=\d)(B|M|K)(?![A-Za-z])/g;

/**
 * A trailing word unit, e.g. the `hours` in `48 hours` or `rules` in
 * `4 bar rules`.
 *
 * The mandatory `\s+` is the entire distinction between a WORD UNIT and a
 * GLUED MAGNITUDE SUFFIX, and getting it wrong is not a subtle bug. The first
 * version of this pattern used `\s*`, which made the separator optional — so
 * the rule matched almost anything ending in letters and, being tried first,
 * hijacked the cases meant for MAGNITUDE_RE:
 *
 *   '$243K–$473K'  ->  value '$243K–$473'  unit 'K'   (first K left unstyled)
 *   '$5Bn'         ->  value '$5'          unit 'Bn'  (should not split at all)
 *   '12Mbps'       ->  value '12'          unit 'Mbps'
 *
 * Both were caught by the unit tests below rather than by reading, which is
 * the reason the false-positive cases are asserted explicitly: the greedy
 * failure mode still round-trips perfectly, so the fidelity property alone
 * would have reported success on all three.
 *
 * `.*` is greedy on purpose: it anchors to the LAST digit, so `9.0 KB` splits
 * after the `0` rather than after the `9`.
 */
const TRAILING_WORD_UNIT_RE = /^(.*\d\s+)([A-Za-z][A-Za-z\s-]*)$/;

/**
 * Split a headline stat into typographic segments.
 *
 * Total-fidelity guarantee: the concatenation of every segment's `text` is
 * ALWAYS exactly the input. Nothing is dropped, reordered or normalised —
 * this function only decides where the boundaries are. The unit test asserts
 * that round-trip for every stat in the collection, because a splitter that
 * silently ate a character would corrupt the most prominent number on the
 * page while looking like a styling change.
 *
 * Returns a single `value` segment when there is no unit to separate, so
 * callers never need to special-case the plain path.
 */
export function splitStatValue(raw: string): StatSegment[] {
  if (typeof raw !== 'string' || raw === '') return [];

  const segments: StatSegment[] = [];
  /*
   * No same-kind merging here, deliberately — and this is worth a note
   * because the first draft HAD a merge branch.
   *
   * A canary that disabled that branch left the suite at 16/16 green, so I
   * searched for any input that could reach it: 22,620 strings up to length 4
   * over `$15.– BMKnx-` produced ZERO adjacent same-kind segments. The branch
   * was unreachable by construction — both rules below alternate value/unit
   * inherently, and the empty-string guard drops the only case that could
   * have produced a run. It was dead code that read as a safeguard.
   *
   * Deleted rather than kept "just in case": a branch no test can kill is a
   * trap for the next author, who will assume it is load-bearing. The
   * alternation invariant is instead asserted directly in the unit tests, so
   * a future rule that breaks it fails loudly rather than being quietly
   * absorbed.
   */
  const push = (text: string, kind: StatSegment['kind']) => {
    if (text === '') return;
    segments.push({ text, kind });
  };

  /* Case 1 — trailing word unit ("48 hours", "4 bar rules").
     Checked first because a word unit is unambiguous once anchored, and a
     value of this shape cannot also contain a magnitude suffix. */
  const worded = raw.match(TRAILING_WORD_UNIT_RE);
  if (worded) {
    push(worded[1], 'value');
    push(worded[2], 'unit');
    return segments;
  }

  /* Case 2 — magnitude suffixes, possibly several ("$243K–$473K"). */
  let cursor = 0;
  MAGNITUDE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MAGNITUDE_RE.exec(raw)) !== null) {
    push(raw.slice(cursor, m.index), 'value');
    push(m[0], 'unit');
    cursor = m.index + m[0].length;
  }
  push(raw.slice(cursor), 'value');

  return segments;
}

/**
 * True when the stat has a unit worth styling separately. Lets a template
 * skip the multi-span path entirely for values that do not need it, keeping
 * the emitted HTML no larger than it was for the plain cases.
 */
export function hasStatUnit(raw: string): boolean {
  return splitStatValue(raw).some((s) => s.kind === 'unit');
}
