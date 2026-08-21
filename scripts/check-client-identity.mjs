#!/usr/bin/env node
/**
 * check-client-identity — keep un-named clients un-named.
 *
 * WHY THIS EXISTS
 * ---------------
 * The engagement corpus runs two deliberately different disclosure postures,
 * and nothing in the repository enforced the difference:
 *
 *   NAMED — the subject is public record and the work was self-initiated or
 *   concerns a public asset. eng-001 (Portland housing funds; "No commission
 *   preceded the work") and eng-002 (Lloyd Center, an approved-for-demolition
 *   mall on three light-rail lines) name their subject because the subject is
 *   already a matter of public civic record.
 *
 *   DESCRIBED — the client is a private party under an engagement. These are
 *   written as a category plus distinguishing detail and NEVER as a name:
 *
 *     eng-003  "A B Corp personal injury firm..."
 *     eng-004  "A solo practitioner had the rarer half of the problem solved."
 *     eng-005  "A K-8 public charter school — small, place-based..."
 *
 * The second posture is a promise, and it is a promise that decays exactly the
 * way Praxis No. 06 describes: the dossier is written carefully, and then months
 * later a Praxis article reaches for a concrete detail to make a sentence land
 * and reintroduces the identity the dossier spent a paragraph avoiding. Nobody
 * decides to break it. It leaks.
 *
 * A leak here is not a typo. It is a confidentiality breach published to a
 * static site, cached, and indexed.
 *
 * WHAT IT CHECKS
 * --------------
 * For every DESCRIBED engagement (declared below, not inferred — see WHY THE
 * ROSTER IS EXPLICIT), no proper-noun organisation name may appear in any
 * published surface. The rule is not "no capitalised words" — that would be
 * useless. It is:
 *
 *   1. A curated list of ORGANISATION-SUFFIX shapes (`LLP`, `LLC`, `Inc`,
 *      `P.C.`, `& Associates`, `Law Group`, `Academy`, `Charter School`...)
 *      preceded by a capitalised token. This catches the realistic leak —
 *      "Smith & Associates", "Marshall Academy" — because a private client's
 *      identity almost always arrives wearing one of these suffixes.
 *
 *   2. A DENYLIST of specific strings the operator marks as never-publishable,
 *      read from `handoff/client-identity-denylist.txt`. This is the escape
 *      hatch for identities that carry no suffix at all (a person's name, a
 *      product, a town small enough to identify the school). The file is
 *      newline-delimited, `#` comments allowed, and matching is
 *      case-insensitive and whole-word.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not ban place names or capitalised words generally. Three real false
 * positives in the current corpus prove why that approach would be worse than
 * no gate at all:
 *
 *   - "Glasgow Coma Scale" (Praxis No. 06) is a medical instrument from a
 *     cited trauma study, not the client city in eng-001's ten-city corpus.
 *   - "Portland" appears in about.astro, index.astro and privacy.astro as
 *     SARIF'S OWN base of operations and in its meta descriptions.
 *   - eng-001's comparable-city corpus (Houston, Helsinki, Glasgow,
 *     Bakersfield, Vienna) is published research input, not client identity.
 *
 * A gate that fired on those would be switched off within a week, and then the
 * real leak would ship unguarded. Precision is the whole design constraint.
 *
 * FAIL-OPEN PATHS CLOSED EXPLICITLY
 * ---------------------------------
 * Every collection here could be empty, and an empty one would make the script
 * pass while measuring nothing:
 *
 *   - zero surfaces scanned            -> FAILURE
 *   - a declared described-engagement
 *     dossier that does not exist      -> FAILURE (the roster has gone stale)
 *   - a described engagement whose own
 *     dossier stops matching its
 *     "described" shape                -> FAILURE (posture changed silently)
 *   - denylist file present but empty   -> not a failure; an empty denylist is
 *     a legitimate state, but rule 1 must still have patterns or we FAIL.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENG_DIR = join(ROOT, 'src/content/engagements');
const PRAXIS_DIR = join(ROOT, 'src/content/praxis');
const PAGES_DIR = join(ROOT, 'src/pages');
const DENYLIST = join(ROOT, 'handoff/client-identity-denylist.txt');

/* WHY THE ROSTER IS EXPLICIT rather than inferred from the dossier text:
   inferring "is this client named?" from prose is precisely the judgement a
   regex cannot make. Declaring it means a NEW engagement is unguarded until
   someone adds it — so the roster is itself checked below against the dossier
   count, and adding a dossier without classifying it fails the build. */
const DESCRIBED = ['eng-003', 'eng-004', 'eng-005'];
const NAMED = ['eng-001', 'eng-002', 'eng-006'];

/* The shape a described client's identity would wear if it leaked. Anchored on
   a capitalised token so "the academy" (generic prose) does not match while
   "Marshall Academy" does. */
const ORG_SUFFIXES = [
  'LLP', 'LLC', 'PLLC', 'Inc', 'Incorporated', 'Corp', 'Corporation',
  'P\\.C\\.', 'PC', 'Co\\.', 'Ltd',
  '& Associates', 'and Associates', 'Law Group', 'Law Firm', 'Law Office',
  'Law Offices', 'Legal Group', 'Injury Law',
  'Charter School', 'Academy', 'Preparatory', 'Montessori',
  'Institute', 'Foundation', 'Retreats', 'Wellness Group',
];

const ORG_RE = new RegExp(
  `\\b([A-Z][A-Za-z'’-]{1,24}(?:\\s+[A-Z][A-Za-z'’-]{1,24}){0,3})\\s+(${ORG_SUFFIXES.join('|')})\\b`,
  'g',
);

const errors = [];
const notes = [];

/* ---------- 1. the roster must cover the corpus ---------- */
let dossiers;
try {
  dossiers = readdirSync(ENG_DIR).filter((f) => f.endsWith('.json')).sort();
} catch (err) {
  console.error(`[check-client-identity] FAIL — cannot read ${relative(ROOT, ENG_DIR)}: ${err.message}`);
  process.exit(1);
}
if (dossiers.length === 0) {
  console.error('[check-client-identity] FAIL — zero engagement dossiers found; the roster would be vacuous.');
  process.exit(1);
}

const classified = new Set([...DESCRIBED, ...NAMED]);
for (const file of dossiers) {
  const slug = file.replace(/\.json$/, '');
  if (!classified.has(slug)) {
    errors.push(
      `${slug} is not classified. Add it to DESCRIBED (client is a private party ` +
        `written as a category, never named) or NAMED (subject is public record) ` +
        `in scripts/check-client-identity.mjs. A new engagement must not be ` +
        `unguarded by default.`,
    );
  }
}
for (const slug of DESCRIBED) {
  if (!existsSync(join(ENG_DIR, `${slug}.json`))) {
    errors.push(`DESCRIBED lists ${slug} but ${slug}.json does not exist — the roster is stale.`);
  }
}

/* ---------- 2. described dossiers must still read as described ---------- */
/* If eng-004's lead stops opening with an indefinite category ("A solo
   practitioner...") the posture may have been changed deliberately — but it
   must be changed HERE too, not silently in content. */
/* `[a-z]` was wrong on the first run: it flagged eng-003 ("A B Corp personal
   injury firm") and eng-005 ("A K-8 public charter school") as no longer
   described, when both are textbook examples of the posture — the token after
   the article is a legitimate uppercase qualifier (a certification, a grade
   band), not a name. The real signal is that the sentence opens with an
   indefinite article and does NOT immediately present a multi-word proper
   noun. Two capitalised words in a row after "A" is the leak shape
   ("A Marshall Academy..."); one uppercase qualifier is not. */
const DESCRIBED_OPENING = /^(A|An|The)\s+(?![A-Z][a-z]+\s+[A-Z])/;
for (const slug of DESCRIBED) {
  const path = join(ENG_DIR, `${slug}.json`);
  if (!existsSync(path)) continue;
  let dossier;
  try {
    dossier = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    errors.push(`${slug}.json could not be parsed: ${err.message}`);
    continue;
  }
  const lead = (dossier.leads || [])[0] || '';
  if (!DESCRIBED_OPENING.test(lead)) {
    errors.push(
      `${slug} is classified DESCRIBED but its first lead no longer opens with an ` +
        `indefinite category ("A K-8 public charter school...", "A solo ` +
        `practitioner..."). It now opens: "${lead.slice(0, 70)}...". If the client ` +
        `agreed to be named, move ${slug} to NAMED deliberately.`,
    );
  }
}

/* Organisations that legitimately appear as CITED SOURCES or public entities.
   These are not client identities and must not be flagged. Kept in the script
   rather than the denylist file because the denylist is a ban list and this is
   its inverse; conflating the two would make both harder to reason about.

   `Global Wellness Institute` was found by this gate's own first run, inside
   eng-004 — it is the source of that dossier's $868B wellness-tourism figure,
   i.e. research provenance. Removing it would make the claim less traceable
   rather than more confidential. Exactly the false positive the design notes
   above warn about, caught before the gate was trusted. */
const CITED_ORGS = [
  'Global Wellness Institute',
];

/* ---------- 3. denylist ---------- */
let deny = [];
if (existsSync(DENYLIST)) {
  deny = readFileSync(DENYLIST, 'utf8')
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

if (ORG_SUFFIXES.length === 0) {
  console.error('[check-client-identity] FAIL — ORG_SUFFIXES is empty; rule 1 would be inert.');
  process.exit(1);
}

/* ---------- 4. scan the published surfaces ---------- */
const surfaces = [];
const collect = (dir, ext) => {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (f.endsWith(ext)) surfaces.push(join(dir, f));
  }
};
collect(PRAXIS_DIR, '.mdx');
collect(PAGES_DIR, '.astro');
for (const f of dossiers) surfaces.push(join(ENG_DIR, f));

if (surfaces.length === 0) {
  console.error('[check-client-identity] FAIL — zero surfaces scanned; the gate would pass while measuring nothing.');
  process.exit(1);
}

let allowed = 0;

for (const path of surfaces) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    console.error(`[check-client-identity] FAIL — cannot read ${relative(ROOT, path)}: ${err.message}`);
    process.exit(1);
  }
  const rel = relative(ROOT, path);
  const lineOf = (index) => text.slice(0, index).split('\n').length;

  ORG_RE.lastIndex = 0;
  let m;
  while ((m = ORG_RE.exec(text)) !== null) {
    if (CITED_ORGS.some((o) => m[0].includes(o))) {
      allowed += 1;
      continue;
    }
    errors.push(
      `${rel}:${lineOf(m.index)} — "${m[0]}" reads as a named organisation. ` +
        `Engagements ${DESCRIBED.join(', ')} describe their clients without naming ` +
        `them; a proper-noun organisation here may be a confidentiality leak. If ` +
        `this is a public entity, a cited source or Sarif itself, add it to ` +
        `handoff/client-identity-denylist.txt's allow section or rephrase.`,
    );
  }

  for (const term of deny) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let d;
    while ((d = re.exec(text)) !== null) {
      errors.push(
        `${rel}:${lineOf(d.index)} — "${d[0]}" is on the client-identity denylist ` +
          `(handoff/client-identity-denylist.txt) and must not appear in a ` +
          `published surface.`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`[check-client-identity] FAIL — ${errors.length} finding(s):`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error(
    '\n  Engagements 003, 004 and 005 name a category, never a client. That is a\n' +
      '  promise, and it decays exactly the way Praxis No. 06 describes: a later\n' +
      '  article reaches for a concrete detail and reintroduces what the dossier\n' +
      '  spent a paragraph avoiding. Rephrase, or reclassify deliberately.',
  );
  process.exit(1);
}

console.log(
  `[check-client-identity] OK — ${surfaces.length} surface(s) carry no named ` +
    `organisation for the ${DESCRIBED.length} described engagement(s) ` +
    `(${DESCRIBED.join(', ')}); ${NAMED.length} named engagement(s) exempt ` +
    `(${NAMED.join(', ')}); ${ORG_SUFFIXES.length} suffix pattern(s), ` +
    `${deny.length} denylist term(s), ${allowed} cited-source allowance(s)` +
    `${notes.length ? `; ${notes.join('; ')}` : ''}.`,
);
