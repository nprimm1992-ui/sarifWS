#!/usr/bin/env node
/**
 * check-praxis-claims — gate Praxis prose against the engagement dossiers.
 *
 * WHY THIS EXISTS
 * ---------------
 * `check-self-claims.mjs` audits countable claims, but it reads exactly one
 * content file: `src/content/engagements/eng-006.json` (its own line 41). That
 * makes it blind to an entire class of defect — a Praxis article asserting a
 * figure about engagements 001-005.
 *
 * Three such claims shipped to production and survived every gate:
 *
 *   | Published claim                    | Dossier truth                     |
 *   |------------------------------------|-----------------------------------|
 *   | "nine-chapter policy playbook"     | eng-001: **Ten**-chapter          |
 *   | "eight-document architecture"      | eng-004: **Nine**-document        |
 *   | "$73.7B market entry"              | eng-004: $206B and $868B          |
 *   | "87-page forensic teardown"        | no dossier contains it at all     |
 *
 * The last two are worse than wrong numbers: they are artifacts and figures
 * that do not exist anywhere in the corpus, published under the sentence
 * "These are not hypotheticals. They are the first six engagements listed on
 * the site." Both were also being TAUGHT as model figures by two authoring
 * primers, so the defect reproduced itself.
 *
 * WHAT IT CHECKS
 * --------------
 * Two independent rules, both derived from the dossiers at runtime so they
 * cannot drift:
 *
 *   1. MONEY. Every `$<number><B|M|K>` token in Praxis prose must appear in
 *      some dossier. Money figures are the highest-risk claim shape: they read
 *      as authoritative, they are trivially invented to make a sentence land,
 *      and a wrong one is materially misleading.
 *
 *   2. COMPOUND ARTIFACT COUNTS. Phrases of the form `<count>-<unit>` where
 *      `unit` is a shape the dossiers actually use (chapter, document, card,
 *      tab, node, module, assumption, slide...). If the dossiers describe a
 *      `Ten-chapter` playbook, prose may not say `nine-chapter`. The unit
 *      vocabulary is harvested from the dossiers, so a unit no dossier uses is
 *      not policed — this is what keeps generic prose ("three-register
 *      system", "four re-narration layers") out of scope.
 *
 *      LIMIT, stated plainly: a unit is checked against the UNION of counts
 *      attested anywhere in the corpus, not per-engagement. `document` is
 *      attested at 5 (eng-001) and 9 (eng-004), so prose saying
 *      "nine-document" passes even in a sentence about eng-001. This still
 *      catches every defect that shipped (`eight-document` and `nine-chapter`
 *      match no engagement at all), and the union is deliberate: attributing a
 *      count to the wrong engagement is a reading-comprehension question a
 *      regex cannot adjudicate, whereas a count that exists NOWHERE is
 *      unambiguously fabricated. Prefer a false negative here over a false
 *      positive that trains authors to switch the gate off.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK
 * -----------------------------------
 * Percentages, day counts and bare integers. `41%`, `ten days` and "three
 * rounds" are legitimately used both as engagement facts AND as ordinary
 * analytical prose, so policing them would generate false positives. A false
 * positive in a sentinel is as damaging as a false negative: it trains authors
 * to disable the gate. Money and compound-artifact counts were chosen because
 * they are almost never incidental.
 *
 * FAIL-OPEN PATHS CLOSED EXPLICITLY
 * ---------------------------------
 * Every collection this script iterates could be empty, and an empty
 * collection would make it pass while measuring nothing:
 *
 *   - zero dossiers found            -> FAILURE (not "nothing to compare")
 *   - zero praxis articles found     -> FAILURE
 *   - a file that cannot be read     -> FAILURE (never a silent skip)
 *   - zero claims extracted          -> FAILURE via PER-RULE claim floors
 *   - empty unit vocabulary          -> FAILURE (the rule would be inert)
 *
 * The floors are graduated, never `> 0`, so a refactor that quietly stops
 * matching cannot pass by measuring one thing.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENG_DIR = join(ROOT, 'src/content/engagements');
const PRAXIS_DIR = join(ROOT, 'src/content/praxis');

/* Graduated coverage floors. Raise these as the corpus grows; a floor of `> 0`
   would let a broken extractor pass on a single lucky match. */
const MIN_DOSSIERS = 6;
const MIN_ARTICLES = 5;
const MIN_UNITS = 5;

/* PER-RULE floors, not one aggregate.
 *
 * The first version of this script carried a single MIN_CLAIMS = 8 covering
 * both rules combined. A canary that neutered the money regex dropped the
 * count 16 -> 9 and the gate still PASSED: the compound-count rule alone
 * cleared the shared floor, so one of the two rules could die silently while
 * the other vouched for it.
 *
 * That is the zero-floor fail-open wearing a disguise — the floor was
 * non-zero, but it was not per-rule, so it could be satisfied by a rule that
 * was never at risk. Any gate with independent rules needs independent floors. */
const MIN_MONEY_CLAIMS = 5;
const MIN_COMPOUND_CLAIMS = 5;

const failures = [];
const notes = [];

/* ---------- 1. Harvest ground truth from the dossiers ---------- */

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    /* A dossier we cannot read is a failure, never a skip: an unreadable
       ground-truth file would otherwise silently shrink the allow-list and
       turn every real claim into a false positive. */
    failures.push(`${file} — could not be read or parsed (${err.message})`);
    return null;
  }
}

let dossierFiles = [];
try {
  dossierFiles = readdirSync(ENG_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(ENG_DIR, f));
} catch (err) {
  failures.push(`could not read ${ENG_DIR} (${err.message})`);
}

if (dossierFiles.length < MIN_DOSSIERS) {
  failures.push(
    `found ${dossierFiles.length} engagement dossier(s) in src/content/engagements, ` +
      `expected at least ${MIN_DOSSIERS}. Ground truth cannot be established from ` +
      `nothing — if engagements were intentionally removed, lower MIN_DOSSIERS ` +
      `deliberately so the floor keeps its meaning.`,
  );
}

/** Every string in a dossier that could carry a factual claim. */
function dossierText(d) {
  const parts = [
    d.classification,
    d.sector,
    d.statValue,
    d.statLabel,
    d.heroAlt,
    ...(d.leads ?? []),
    ...(d.highlights ?? []),
    ...(d.documents ?? []).flatMap((doc) => [doc.label, doc.kind, doc.note]),
  ];
  return parts.filter((s) => typeof s === 'string').join('\n');
}

const MONEY_RE = /\$\d[\d.,]*\s*(?:billion|million|thousand|[BMK])\b/gi;
const COMPOUND_RE = /\b([A-Za-z]+|\d+)-([a-z]{3,})\b/g;

/* Hyphenated compound NUMBERS are not counts of anything: "thirty-five"
 * harvests a bogus unit `five` attesting the count 30, which would then reject
 * any legitimate "five-<something>" phrase. Found by inspecting the harvested
 * vocabulary rather than trusting a green first run — the gate passed while
 * carrying a rule that could only ever fire as a false positive. */
const NUMBER_WORD_TAIL =
  /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/;

/** Canonical money form: "$206B", "$206 billion" and "$206b" all agree. */
function normMoney(raw) {
  const m = raw.match(/\$([\d.,]+)\s*(billion|million|thousand|[BMK])/i);
  if (!m) return raw.toLowerCase().replace(/[\s,]/g, '');
  const scale = m[2].toLowerCase();
  const suffix = scale.startsWith('b') ? 'B' : scale.startsWith('m') ? 'M' : 'K';
  return `$${m[1].replace(/,/g, '')}${suffix}`;
}

/** Number words the corpus actually uses, so "nine-chapter" and "9-chapter"
 *  are compared on the same axis. */
const WORD_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, seventy: 70,
};

function normCount(token) {
  const t = token.toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  return WORD_NUM[t] ?? null;
}

const dossierMoney = new Set();
/** unit -> Set of counts the dossiers attest for that unit. */
const dossierUnits = new Map();

for (const file of dossierFiles) {
  const d = readJson(file);
  if (!d) continue;
  const text = dossierText(d);
  for (const m of text.matchAll(MONEY_RE)) dossierMoney.add(normMoney(m[0]));
  for (const m of text.matchAll(COMPOUND_RE)) {
    const count = normCount(m[1]);
    if (count === null) continue;
    const unit = m[2].toLowerCase().replace(/s$/, '');
    if (NUMBER_WORD_TAIL.test(unit)) continue;
    if (!dossierUnits.has(unit)) dossierUnits.set(unit, new Set());
    dossierUnits.get(unit).add(count);
  }
}

if (dossierUnits.size < MIN_UNITS) {
  failures.push(
    `harvested only ${dossierUnits.size} artifact unit(s) from the dossiers, ` +
      `expected at least ${MIN_UNITS}. The compound-count rule would be inert.`,
  );
}

/* ---------- 2. Check the published Praxis prose ---------- */

let articleFiles = [];
try {
  articleFiles = readdirSync(PRAXIS_DIR)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))
    .map((f) => join(PRAXIS_DIR, f));
} catch (err) {
  failures.push(`could not read ${PRAXIS_DIR} (${err.message})`);
}

if (articleFiles.length < MIN_ARTICLES) {
  failures.push(
    `found ${articleFiles.length} Praxis article(s), expected at least ` +
      `${MIN_ARTICLES}. If articles were intentionally removed, lower ` +
      `MIN_ARTICLES deliberately so the floor keeps its meaning.`,
  );
}

let moneyChecked = 0;
let compoundChecked = 0;

for (const file of articleFiles) {
  const rel = file.slice(ROOT.length + 1);
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    failures.push(`${rel} — could not be read (${err.message})`);
    continue;
  }

  /* Only published articles make claims to the public. A draft may legitimately
     hold a figure that is still being sourced. */
  if (/^draft:\s*true\s*$/m.test(raw)) {
    notes.push(`${rel} (draft — skipped)`);
    continue;
  }

  /* Strip frontmatter: summary/heroAlt prose is metadata, and `publishDate`
     digits would otherwise be scanned as claims.
     
     Offsets into `body` are NOT file line numbers. The first canary run of the
     repaired script reported line 37 for a defect on line 56 — off by exactly
     the frontmatter height. A sentinel that names the wrong line sends the
     author to correct prose, so `bodyOffset` is carried and re-added below. */
  const fm = raw.match(/^---\n[\s\S]*?\n---\n/);
  const body = fm ? raw.slice(fm[0].length) : raw;
  const bodyOffset = fm ? fm[0].split('\n').length - 1 : 0;
  const lineOf = (index) => body.slice(0, index).split('\n').length + bodyOffset;

  /* Rule 1 — money must exist in a dossier. */
  for (const m of body.matchAll(MONEY_RE)) {
    moneyChecked += 1;
    const norm = normMoney(m[0]);
    if (!dossierMoney.has(norm)) {
      const line = lineOf(m.index);
      failures.push(
        `${rel}:${line} — "${m[0]}" appears in no engagement dossier.\n` +
          `    Money figures in Praxis prose must be attested by ` +
          `src/content/engagements/*.json.\n` +
          `    Dossier figures available: ${[...dossierMoney].sort().join(', ')}`,
      );
    }
  }

  /* Rule 2 — compound artifact counts must match the dossiers. Only units the
     dossiers actually use are policed, which is what keeps ordinary prose
     ("three-register system") out of scope. */
  for (const m of body.matchAll(COMPOUND_RE)) {
    const unit = m[2].toLowerCase().replace(/s$/, '');
    if (NUMBER_WORD_TAIL.test(unit)) continue;
    if (!dossierUnits.has(unit)) continue;
    const count = normCount(m[1]);
    if (count === null) continue;
    compoundChecked += 1;
    const attested = dossierUnits.get(unit);
    if (!attested.has(count)) {
      const line = lineOf(m.index);
      const expected = [...attested].sort((a, b) => a - b).join(', ');
      failures.push(
        `${rel}:${line} — "${m[0]}" contradicts the dossiers.\n` +
          `    The engagement record attests ${expected} for "${unit}", not ${count}.\n` +
          `    Either the prose is wrong or the dossier is; they cannot both stand.`,
      );
    }
  }
}

if (moneyChecked < MIN_MONEY_CLAIMS) {
  failures.push(
    `only ${moneyChecked} money claim(s) were extracted from Praxis prose, ` +
      `expected at least ${MIN_MONEY_CLAIMS}. A rule that measures nothing ` +
      `passes everything — this usually means MONEY_RE stopped matching, not ` +
      `that the articles stopped citing figures.`,
  );
}

if (compoundChecked < MIN_COMPOUND_CLAIMS) {
  failures.push(
    `only ${compoundChecked} compound-count claim(s) were extracted from Praxis ` +
      `prose, expected at least ${MIN_COMPOUND_CLAIMS}. Either COMPOUND_RE ` +
      `stopped matching or the harvested unit vocabulary collapsed.`,
  );
}

/* ---------- 3. Report ---------- */

if (failures.length > 0) {
  console.error(
    `[check-praxis-claims] FAIL — ${failures.length} unsupported claim(s) in Praxis prose:`,
  );
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    '\n  Praxis articles cite engagements as evidence. A figure that exists in\n' +
      '  no dossier is not evidence, and `check-self-claims` cannot catch it:\n' +
      '  that script reads only eng-006.json.\n' +
      '\n  Fix the prose, or add the figure to the dossier if it is real.',
  );
  process.exit(1);
}

const unitSummary = [...dossierUnits.keys()].sort().join(', ');
console.log(
  `[check-praxis-claims] OK — ${moneyChecked} money + ${compoundChecked} ` +
    `compound-count claim(s) across ${articleFiles.length - notes.length} ` +
    `published article(s) are attested by ${dossierFiles.length} dossier(s) ` +
    `(${dossierMoney.size} dossier figure(s); units: ${unitSummary})`,
);
