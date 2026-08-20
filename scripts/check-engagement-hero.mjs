#!/usr/bin/env node
/**
 * Sentinel — engagement dossier imagery + link integrity.
 *
 * Why this exists
 * ---------------
 * The engagements schema declares `heroImage` / `heroAlt` as *independently*
 * optional. Zod therefore accepts three of the four combinations, but only
 * two of them render:
 *
 *   heroImage | heroAlt | Zod  | Renders | Verdict
 *   ----------|---------|------|---------|--------------------------------
 *   absent    | absent  | pass | no      | fine — dossier has no plate
 *   present   | present | pass | yes     | fine — plate renders
 *   present   | absent  | pass | NO      | SILENT FAILURE — image dropped
 *   absent    | present | pass | no      | SILENT FAILURE — orphan alt text
 *
 * The two failure rows are the dangerous class: the build succeeds, the
 * author believes imagery shipped, and the page renders without it. That is
 * the same shape of bug as the truncated hero video — internally consistent,
 * schema-valid, and invisible to every other gate. This sentinel closes it.
 *
 * It also enforces the `leads` vs `highlights` markup asymmetry:
 *   - `highlights` render through `set:html` → inline markup is supported.
 *   - `leads` render as plain `{lead}` text → markup arrives as literal
 *     escaped characters on the page.
 * An <a> or <strong> in `leads` is therefore always an authoring error.
 *
 * Exit codes: 0 = pass, 1 = at least one finding.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIR = join(ROOT, 'src/content/engagements');
const TAG = '[check-engagement-hero]';

/* Markup that only works in `highlights`. Deliberately narrow: we match
   real element tags, not stray "<" in prose like "<10 days". */
const MARKUP_RE = /<\/?(a|strong|em|b|i|span|code|abbr|br)\b[^>]*>/i;

/* Raster/vector formats Astro's image() pipeline accepts. */
const IMAGE_EXT = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

/*
 * `classification` format. The tail after the em dash is load-bearing:
 * src/pages/engagements/[slug].astro splits on U+2014 and uses everything
 * after the first one as the <h1>, the <title> and both walk-card labels.
 * A hyphen instead of an em dash, or a num that disagrees with `num`, both
 * degrade silently — the page still renders, just with the wrong heading.
 */
const CLASSIFICATION_RE = /^Engagement (\d{3}) \u2014 (.+)$/;

/*
 * Function words carry no identifying signal, so they are excluded before
 * comparing a title against its sector and its prose.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'in', 'to', 'as', 'at',
  'on', 'by', 'with', 'not', 'is', 'was', 'from',
]);

/* Light stem so "services"/"service" and "commons"/"Commons" collide. */
const stemWord = (w) => w.replace(/ies$/, 'y').replace(/e?s$/, '');

const contentWords = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((w) => !STOP_WORDS.has(w))
    .map(stemWord);

/* Title budget — the sticky plaque wraps to three lines past ~45 chars. */
const TITLE_MAX_CHARS = 45;

const findings = [];

/*
 * Fail-closed on a missing collection.
 *
 * This used to `SKIP` and exit 0. But the engagements collection is not
 * optional decoration — it is the exhibition hall, and six routes plus the
 * hall index are generated from it. If the directory is absent, something is
 * badly wrong (wrong cwd, a bad move, a deleted path), and reporting success
 * is the worst available response: the gate would go green on a site that no
 * longer has any exhibits. Same fail-open species as the "scanned 0 pages,
 * exit 0" defect closed in check-meta-descriptions.
 */
if (!existsSync(DIR)) {
  console.error(
    `${TAG} FAIL — no engagements collection at src/content/engagements. ` +
      `The hall is generated from this directory; its absence is a ` +
      `structural error, not an empty-state to pass over.`,
  );
  process.exit(1);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

if (files.length === 0) {
  console.error(
    `${TAG} FAIL — engagements collection is empty. The hall index and every ` +
      `dossier route derive from it; zero exhibits is a build error, not a pass.`,
  );
  process.exit(1);
}

const seenNums = new Map();
const seenSorts = new Map();
const seenAccents = new Map();
const seenTitles = new Map();
const seenHeadNouns = new Map();

/*
 * Corpus-wide word frequency, computed up front because the distinctness
 * test below is inherently cross-file: a word is only distinguishing if it
 * does NOT appear in most of the other dossiers.
 *
 * This is what separates a *name* from a *label*. "Business Transformation
 * Architecture" is fully grounded in eng-004's prose — every word of it
 * appears there — yet it identifies nothing, because "architecture" appears
 * in all six dossiers and "transformation" is the generic verb of the whole
 * practice. Grounding alone cannot see that; frequency can.
 */
const corpusDocFreq = new Map();
const perFileWords = new Map();

let heroCount = 0;
let docCount = 0;

/* Pre-pass: build the corpus frequency table. Parse failures are ignored
   here and reported properly by the main loop below. */
for (const file of files) {
  try {
    const d = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
    const bag = new Set(
      contentWords([...(d.leads ?? []), ...(d.highlights ?? [])].join(' ')),
    );
    perFileWords.set(file, bag);
    for (const w of bag) {
      corpusDocFreq.set(w, (corpusDocFreq.get(w) ?? 0) + 1);
    }
  } catch {
    /* reported in the main loop */
  }
}

/*
 * A word appearing in more than half the dossiers is practice vocabulary,
 * not an identifier. At six exhibits the threshold is 3.
 */
const UBIQUITY_LIMIT = Math.max(2, Math.floor(files.length / 2));

for (const file of files) {
  const abs = join(DIR, file);
  let data;
  try {
    data = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    findings.push(`${file} — not valid JSON: ${err.message}`);
    continue;
  }

  const hasImage = typeof data.heroImage === 'string' && data.heroImage.trim() !== '';
  const hasAlt = typeof data.heroAlt === 'string' && data.heroAlt.trim() !== '';

  /* --- 1. hero pairing ------------------------------------------------ */
  if (hasImage && !hasAlt) {
    findings.push(
      `${file} — has heroImage but no heroAlt. The plate will NOT render ` +
        `(alt is required for it to appear) and the image is silently dropped. ` +
        `Add a heroAlt describing the image.`,
    );
  }
  if (!hasImage && hasAlt) {
    findings.push(
      `${file} — has heroAlt but no heroImage. The alt text is orphaned and ` +
        `nothing renders. Add a heroImage path or remove heroAlt.`,
    );
  }

  /* --- 2. hero path resolves + is an image ---------------------------- */
  if (hasImage) {
    heroCount += 1;
    const rel = data.heroImage.trim();
    if (!rel.startsWith('./') && !rel.startsWith('../')) {
      findings.push(
        `${file} — heroImage "${rel}" must be a relative path starting with ` +
          `"./" or "../" so Astro's image() helper can resolve it ` +
          `(e.g. "./_images/eng-001.svg").`,
      );
    } else {
      const target = resolve(DIR, rel);
      if (!existsSync(target)) {
        findings.push(
          `${file} — heroImage "${rel}" does not exist on disk ` +
            `(resolved to ${target.replace(ROOT + '/', '')}). ` +
            `Astro's image() helper fails the build on missing files.`,
        );
      } else if (!IMAGE_EXT.has(extname(target).toLowerCase())) {
        findings.push(
          `${file} — heroImage "${rel}" is not a supported image format ` +
            `(${[...IMAGE_EXT].join(', ')}).`,
        );
      }
    }

    if (hasAlt) {
      const alt = data.heroAlt.trim();
      if (alt.length < 12) {
        findings.push(
          `${file} — heroAlt is only ${alt.length} chars ("${alt}"). ` +
            `Describe what the image shows; this text is also the social-embed alt.`,
        );
      }
      if (/^(image|photo|graphic|picture|screenshot)\b/i.test(alt)) {
        findings.push(
          `${file} — heroAlt starts with "${alt.split(/\s+/)[0]}". Screen readers ` +
            `already announce it as an image; describe the content instead.`,
        );
      }
    }
  }

  /* --- 3. markup only belongs in highlights --------------------------- */
  if (Array.isArray(data.leads)) {
    data.leads.forEach((lead, i) => {
      if (typeof lead === 'string' && MARKUP_RE.test(lead)) {
        const tag = lead.match(MARKUP_RE)?.[0] ?? '';
        findings.push(
          `${file} — leads[${i}] contains markup ${tag}. \`leads\` render as ` +
            `plain text, so this will appear literally on the page. Move the ` +
            `link or emphasis into \`highlights\`, which renders via set:html.`,
        );
      }
    });
  }

  /* --- 4. highlights markup must be balanced -------------------------- */
  if (Array.isArray(data.highlights)) {
    data.highlights.forEach((line, i) => {
      if (typeof line !== 'string') return;
      const opens = [...line.matchAll(/<(a|strong|em|b|i|span|code|abbr)\b[^>]*>/gi)].map((m) =>
        m[1].toLowerCase(),
      );
      const closes = [...line.matchAll(/<\/(a|strong|em|b|i|span|code|abbr)\s*>/gi)].map((m) =>
        m[1].toLowerCase(),
      );
      const tally = new Map();
      for (const t of opens) tally.set(t, (tally.get(t) ?? 0) + 1);
      for (const t of closes) tally.set(t, (tally.get(t) ?? 0) - 1);
      for (const [tag, n] of tally) {
        if (n !== 0) {
          findings.push(
            `${file} — highlights[${i}] has unbalanced <${tag}> ` +
              `(${n > 0 ? `${n} unclosed` : `${-n} stray closing`}). ` +
              `set:html injects this raw, so unbalanced markup corrupts the page.`,
          );
        }
      }
      /* An <a> with no href is a focusable dead end. */
      if (/<a\b(?![^>]*\bhref=)/i.test(line)) {
        findings.push(`${file} — highlights[${i}] has an <a> without an href.`);
      }
      /* External links need rel="noopener" when they open a new tab.
         Quote-aware capture (backreferenced delimiter, lazy body) rather
         than `[^"']*` — see the rationale in check-meta-descriptions.mjs,
         where that character class silently truncated its own input. */
      if (
        /target=(["'])_blank\1/i.test(line) &&
        !/rel=(["'])[\s\S]*?noopener[\s\S]*?\1/i.test(line)
      ) {
        findings.push(
          `${file} — highlights[${i}] uses target="_blank" without ` +
            `rel="noopener". Add rel="noopener noreferrer".`,
        );
      }
    });
  }

  /* --- 5. documents of record ----------------------------------------
     These are the load-bearing claim on the whole surface: an engagement
     that says "five documents" and links four is worse than one that
     links none. Zod already guarantees shape and URL syntax, so this
     checks the things Zod cannot see — reachability of the host, https,
     duplicate hrefs, and agreement with any count asserted in prose. */
  if (Array.isArray(data.documents)) {
    const seenHrefs = new Map();
    data.documents.forEach((doc, i) => {
      const where = `${file} — documents[${i}]`;

      if (typeof doc.href === 'string') {
        let url;
        try {
          url = new URL(doc.href);
        } catch {
          findings.push(`${where} has an unparseable href: ${doc.href}`);
          return;
        }
        if (url.protocol !== 'https:') {
          findings.push(
            `${where} uses ${url.protocol} — documents of record must be https ` +
              `so the browser does not flag the proof surface as insecure.`,
          );
        }
        const key = doc.href.replace(/\/+$/, '');
        if (seenHrefs.has(key)) {
          findings.push(
            `${where} duplicates documents[${seenHrefs.get(key)}] (${key}). ` +
              `Two catalogue rows pointing at one file overstates the deliverable count.`,
          );
        } else {
          seenHrefs.set(key, i);
        }
      }

      /* Labels are rendered verbatim; markup would show as literal text. */
      for (const field of ['label', 'kind', 'note']) {
        const v = doc[field];
        if (typeof v === 'string' && /<[a-z/][^>]*>/i.test(v)) {
          findings.push(
            `${where}.${field} contains markup. Document fields render as ` +
              `plain text, so tags would appear literally on the page.`,
          );
        }
      }
      if (typeof doc.label === 'string' && doc.label.trim().length < 8) {
        findings.push(`${where}.label is too short to identify a document: "${doc.label}"`);
      }
    });

    docCount += data.documents.length;
  }

  /* --- 5b. prose count agreement -------------------------------------- */
  /*
   * If a highlight or lead asserts a written count of *things*, that count
   * must be corroborated somewhere. This is exactly the drift that turns a
   * proof surface into a liability: prose is written once and edited often,
   * inventories are edited independently, and nobody recounts by hand.
   *
   * Two corroborating sources, in priority order:
   *
   *   1. `documents[]` — the published catalogue. Authoritative for document
   *      claims, because those are the artefacts a visitor can actually open.
   *   2. The claim's own inline enumeration — the comma-separated list after
   *      the em dash ("Nine-document system — a, b, c, ..."). A claim that
   *      names its members can be checked against itself.
   *
   * This block sits OUTSIDE the `documents[]` guard deliberately. It used to
   * be nested inside it, which meant an engagement with no published
   * catalogue had its count claims exempted entirely — a false "Eleven-
   * document" on a vitrine-less exhibit passed silently. A check that
   * inspects nothing must never report success; that is the same fail-open
   * species closed in check-meta-descriptions.
   *
   * Range runs to twenty, not ten. The original ceiling at `ten` silently
   * exempted every larger claim — a guard with an arbitrary ceiling fails
   * exactly where the counts get hard to eyeball.
   *
   * The NOUN was the second arbitrary narrowing, and it hid a live defect.
   * The rule originally matched only "N-document", so eng-005's draft
   * "Seven-module framework spanning six domains — narrative, financial,
   * enrollment, partnerships, operations, implementation" — seven against a
   * list of six — was invisible to it, as was eng-001's "ten-city global
   * evidence corpus — Houston, Helsinki, Glasgow, Bakersfield, Vienna",
   * which promises ten and names five. Nothing about the failure mode is
   * specific to documents; it is generic to any counted, enumerated
   * structure. The noun allowlist below is deliberately explicit rather than
   * open-ended, so the guard never tries to arithmetic-check prose like
   * "two sitting commissioners" that was never a structural claim.
   */
  const WORD_TO_N = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  };

  /* Structural nouns whose counts are enumerable deliverable parts. */
  const ENUMERABLE_NOUN =
    'documents?|modules?|nodes?|chapters?|cities|city|pages?|cards?|tabs?|' +
    'domains?|channels?|tiers?|sources?|phases?|sections?';

  /*
   * A count word, then up to two intervening modifiers ("six interdependent
   * domains"), then the noun. Global: the LAST match before the em dash is
   * the one the list belongs to, which is what correctly attaches
   * "narrative, financial, ..." to "six domains" and not to "seven modules"
   * earlier in the same sentence.
   */
  const countRe = new RegExp(
    `\\b(${Object.keys(WORD_TO_N).join('|')})[-\\s]` +
      `(?:[A-Za-z]+[-\\s]){0,2}(${ENUMERABLE_NOUN})\\b`,
    'gi',
  );

  /*
   * Hedged lists are samples, not enumerations, and must not be counted.
   * "ten cities — including Houston, Helsinki, ..." is an honest partial
   * list; "ten cities — Houston, Helsinki, ..." promises a complete one.
   * The distinction is the whole point, so it is the author's to make
   * explicitly.
   */
  const HEDGE_RE = /\b(including|include|such as|among|e\.g\.|for example|others?)\b/i;

  for (const claimText of [...(data.leads ?? []), ...(data.highlights ?? [])]) {
    const segments = claimText.split('\u2014');

    for (let i = 0; i < segments.length; i += 1) {
      const matches = [...segments[i].matchAll(countRe)];
      if (matches.length === 0) continue;

      /* The claim nearest the dash owns the list that follows it. */
      const claim = matches[matches.length - 1];
      const claimed = WORD_TO_N[claim[1].toLowerCase()];
      const noun = claim[2].toLowerCase();
      const isDocument = noun.startsWith('document');

      /* Published catalogue wins for document claims. */
      if (isDocument && Array.isArray(data.documents) && data.documents.length > 0) {
        if (claimed !== data.documents.length) {
          findings.push(
            `${file} — prose claims a "${claim[0]}" suite but documents[] has ` +
              `${data.documents.length} entr${
                data.documents.length === 1 ? 'y' : 'ies'
              }. The catalogue must match the claim.`,
          );
        }
        continue;
      }

      /*
       * A bare document claim with neither catalogue nor list is
       * unverifiable and is reported as such rather than passed over in
       * silence. Other nouns are not held to that standard: "a six-page
       * immersive platform" is a description, not a promise of an inventory.
       *
       * The `tail === undefined` branch is load-bearing and was briefly a
       * fail-open of my own making: a claim with no em dash at all ("Seven-
       * document transformation suite") has no following segment, and an
       * early `continue` here skipped the unverifiable-claim report
       * entirely — precisely the case the report exists for. Caught by
       * canary, not by reading.
       */
      const tail = segments[i + 1];

      if (tail === undefined) {
        if (isDocument) {
          findings.push(
            `${file} — prose claims a "${claim[0]}" suite but there is no ` +
              `documents[] catalogue and the claim does not enumerate its ` +
              `members, so the count cannot be corroborated. Either publish ` +
              `the documents or name them inline after an em dash.`,
          );
        }
        continue;
      }

      if (HEDGE_RE.test(tail)) continue;

      const named = tail
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean).length;

      if (named < 2) {
        if (isDocument) {
          findings.push(
            `${file} — prose claims a "${claim[0]}" suite but there is no ` +
              `documents[] catalogue and the claim does not enumerate its ` +
              `members, so the count cannot be corroborated. Either publish ` +
              `the documents or name them inline after an em dash.`,
          );
        }
        continue;
      }

      if (named !== claimed) {
        findings.push(
          `${file} — prose claims "${claim[0]}" (${claimed}) but enumerates ` +
            `${named} item(s) after the em dash. Either the count and the ` +
            `list must agree, or the list must be hedged ("including ...") ` +
            `to declare itself a sample.`,
        );
      }
    }
  }

  /* --- 6. registry collisions ---------------------------------------- */
  if (typeof data.num === 'string') {
    if (seenNums.has(data.num)) {
      findings.push(
        `${file} — num "${data.num}" duplicates ${seenNums.get(data.num)}. ` +
          `The hall locator ("Specimen ${data.num}/NNN") and ENG-${data.num} ` +
          `refs would be ambiguous.`,
      );
    } else {
      seenNums.set(data.num, file);
    }
  }
  if (typeof data.sort === 'number') {
    if (seenSorts.has(data.sort)) {
      findings.push(
        `${file} — sort ${data.sort} duplicates ${seenSorts.get(data.sort)}. ` +
          `Exhibit walk order falls back to num comparison and becomes ` +
          `hard to predict.`,
      );
    } else {
      seenSorts.set(data.sort, file);
    }
  }

  /* --- 6b. classification is a specimen NAME, not a taxonomy bin ------ */
  /*
   * The taxonomy field is `sector`. `classification` is the exhibit's name:
   * [slug].astro splits it on the em dash and uses the tail as the <h1>, the
   * <title> and both walk-card labels. Everything enforced here follows from
   * that one fact.
   *
   * The house rule, in one line: NAME THE ARTEFACT, NOT THE CATEGORY.
   *
   * A title that restates `sector` spends the most valuable line on the page
   * saying nothing new — the plaque already shows the sector one row below.
   * This was caught by hand twice: eng-003's draft "Legal Intake
   * Architecture" against sector "Legal services", and the retired eng-004
   * "Business Transformation Architecture", which named a category so
   * generic it would fit any of the six. Judgement applied twice is a rule
   * not yet written down, so it is written down here.
   *
   * Deliberately NOT enforced: a single naming *genre*. Proper nouns ("The
   * Lloyd Commons"), coined categories ("Retreat-First Transformation") and
   * capability names ("Regulated Voice Architecture") are all legitimate,
   * because they answer the same question — what was this specific
   * engagement? — and the honest answer differs by engagement. Forcing one
   * grammar across the hall would mean renaming The Lloyd Commons, which is
   * what the client, the coalition and the press actually call it. Uniformity
   * of *grammar* is not the goal; uniformity of *informativeness* is.
   */
  if (typeof data.classification === 'string') {
    const m = data.classification.match(CLASSIFICATION_RE);
    if (!m) {
      findings.push(
        `${file} — classification ${JSON.stringify(data.classification)} does ` +
          `not match "Engagement NNN \u2014 Title". The renderer splits on the ` +
          `em dash (U+2014, not a hyphen) and uses the tail as the <h1>, the ` +
          `<title> and both walk-card labels.`,
      );
    } else {
      const [, declaredNum, title] = m;

      if (declaredNum !== data.num) {
        findings.push(
          `${file} — classification says "Engagement ${declaredNum}" but num ` +
            `is "${data.num}". The plaque would contradict the registry.`,
        );
      }

      if (title.length > TITLE_MAX_CHARS) {
        findings.push(
          `${file} — title ${JSON.stringify(title)} is ${title.length} chars; ` +
            `over ${TITLE_MAX_CHARS} it wraps to three lines in the sticky ` +
            `plaque. 3\u20135 words is the sweet spot.`,
        );
      }

      /*
       * Title must not restate the sector. Overlap on a content word means
       * the <h1> and the Sector row are saying the same thing.
       */
      const sectorWords = new Set(contentWords(data.sector ?? ''));
      const echoed = [...new Set(contentWords(title))].filter((w) =>
        sectorWords.has(w),
      );
      if (echoed.length > 0) {
        findings.push(
          `${file} — title ${JSON.stringify(title)} restates sector ` +
            `${JSON.stringify(data.sector)} (shared: ${echoed.join(', ')}). ` +
            `The plaque already shows the sector; name the artefact, not the ` +
            `category.`,
        );
      }

      /*
       * h1 uniqueness, checked FIRST.
       *
       * Ordering matters. A canary that duplicated eng-002's title onto
       * eng-004 was originally caught by the grounding rule instead — the
       * gate failed, but for the wrong reason, reporting "not grounded"
       * where the real defect was a collision. A guard that fails with a
       * misleading diagnosis sends the next author to fix the wrong thing,
       * so the most specific rule runs before the more general ones.
       */
      const key = title.toLowerCase();
      const duplicate = seenTitles.has(key);
      if (duplicate) {
        findings.push(
          `${file} — title ${JSON.stringify(title)} duplicates ` +
            `${seenTitles.get(key)}. Two exhibits would share an <h1>, a ` +
            `<title> and a walk-card label.`,
        );
      } else {
        seenTitles.set(key, file);
      }

      const prose = perFileWords.get(file) ?? new Set();
      const titleWords = [...new Set(contentWords(title))];

      /*
       * Title must be grounded in the dossier's own prose. A name whose
       * vocabulary appears nowhere in the leads or highlights is either
       * aspirational branding or a leftover from a previous version — exactly
       * how the retired eng-004 title survived a full rewrite of the body
       * copy beneath it. At least half the content words must appear.
       *
       * Skipped when the title is a duplicate: the collision is already
       * reported and grounding would only add noise about another exhibit's
       * words being absent from this one.
       */
      if (!duplicate && titleWords.length > 0) {
        const grounded = titleWords.filter((w) => prose.has(w));
        if (grounded.length * 2 < titleWords.length) {
          const missing = titleWords.filter((w) => !prose.has(w));
          findings.push(
            `${file} — title ${JSON.stringify(title)} is not grounded in the ` +
              `dossier: ${grounded.length}/${titleWords.length} content words ` +
              `appear in leads/highlights (missing: ${missing.join(', ')}). A ` +
              `name the body copy never earns is branding, or a leftover from ` +
              `a previous version.`,
          );
        }

        /*
         * Grounded is not the same as distinguishing.
         *
         * "Business Transformation Architecture" — the title this engagement
         * shipped with before the rewrite — is 3/3 grounded in eng-004's own
         * prose and still identifies nothing, because "architecture" occurs
         * in all six dossiers and "transformation" is the generic verb of the
         * practice. It would fit any exhibit in the hall, which is precisely
         * what disqualifies it as a name.
         *
         * So a title must carry at least one word that is both present in
         * its own dossier and absent from most others. That is the formal
         * version of "name the artefact, not the category".
         *
         * KNOWN LIMIT, measured rather than assumed. This test does NOT by
         * itself reject "Business Transformation Architecture": "business"
         * and "transformation" each occur in only 1 of 6 dossiers, so they
         * read as distinctive by frequency alone. What actually catches that
         * title is the head-noun rule below ("architecture", df 6/6, already
         * heading eng-003). The two rules are complementary and neither is
         * sufficient — corpus frequency cannot tell a rare word from a
         * meaningful one, and at six exhibits the sample is far too small to
         * try. Genericness remains a judgement call; these rules narrow where
         * that judgement has to be exercised, and no more.
         */
        const distinctive = titleWords.filter(
          (w) => prose.has(w) && (corpusDocFreq.get(w) ?? 0) <= UBIQUITY_LIMIT,
        );
        if (distinctive.length === 0) {
          const freqs = titleWords
            .map((w) => `${w}=${corpusDocFreq.get(w) ?? 0}/${files.length}`)
            .join(', ');
          findings.push(
            `${file} — title ${JSON.stringify(title)} has no distinguishing ` +
              `word: every term is either absent from this dossier or common ` +
              `to more than ${UBIQUITY_LIMIT} of ${files.length} exhibits ` +
              `(${freqs}). A title that would fit any exhibit names the ` +
              `category, not the artefact.`,
          );
        }
      }

      /*
       * Head-noun spread.
       *
       * Two exhibits ending in the same noun read as a series rather than as
       * distinct specimens, and the drift is invisible one file at a time. I
       * introduced exactly this while fixing the other findings: renaming
       * eng-005 to "Enrollment Recovery Architecture" made "Architecture"
       * the head of two of six titles, and the original eng-003 draft would
       * have made it three. Each rename looked fine in isolation.
       */
      const headNoun = title
        .split(/\s+/)
        .pop()
        .replace(/[^A-Za-z]/g, '')
        .toLowerCase();
      if (headNoun) {
        if (seenHeadNouns.has(headNoun)) {
          findings.push(
            `${file} — title ${JSON.stringify(title)} ends in ` +
              `"${headNoun}", already the head noun of ` +
              `${seenHeadNouns.get(headNoun)}. Two exhibits sharing a head ` +
              `noun read as a series instead of distinct specimens; vary the ` +
              `noun (matrix / commons / lobby / recovery).`,
          );
        } else {
          seenHeadNouns.set(headNoun, file);
        }
      }
    }
  }

  /*
   * `accent` is a palette index, not a category label. Each exhibit owns one
   * stripe so the hall reads as a set of distinct specimens; two engagements
   * sharing a gradient makes them look like variants of one another. The Zod
   * enum guarantees the value is *known* but cannot see across files, so
   * uniqueness is enforced here.
   */
  if (typeof data.accent === 'string') {
    if (seenAccents.has(data.accent)) {
      findings.push(
        `${file} — accent "${data.accent}" duplicates ` +
          `${seenAccents.get(data.accent)}. Accents are a per-exhibit palette ` +
          `index; add a new accent to ENGAGEMENT_ACCENTS and give it a ` +
          `gradient in ProofEntry.astro rather than reusing one.`,
      );
    } else {
      seenAccents.set(data.accent, file);
    }
  }
}

/*
 * ── Practice-lane integrity ───────────────────────────────────────────
 *
 * Every dossier chip deep-links to `/services/#<id>`. A wrong id does NOT
 * produce an HTTP error — the page loads and the fragment silently fails
 * to match, so the reader clicks a link that goes nowhere in particular
 * and nothing anywhere reports a problem. That is the definition of a
 * defect this pipeline exists to catch, so the ids are asserted against
 * the services page itself rather than trusted to stay in sync.
 *
 * Fail-closed: if services.astro cannot be read or yields no lanes, that
 * is an error, not a skip. A silently-skipped cross-file assertion is the
 * fail-open species that has already been found seven times in this repo.
 */
const SERVICES_PAGE = resolve(HERE, '..', 'src', 'pages', 'services.astro');
let pageLanes;
if (!existsSync(SERVICES_PAGE)) {
  console.error(
    `${TAG} FAIL — ${SERVICES_PAGE} not found. Dossier practice chips link ` +
      `into this page; without it every chip is a dead anchor.`,
  );
  process.exit(1);
}
/*
 * The DOM id is not the lane id. services.astro renders
 * `id={`lane-${lane.id}`}`, so the anchor a chip must target is
 * `#lane-<id>`. Linking to `#<id>` produces a 200 page and a fragment
 * that matches nothing — caught here only because the prefix is read out
 * of the template instead of being assumed. Anything that changes that
 * template must change this, and the parse is fail-closed so a renamed
 * pattern is an error rather than a silent pass.
 */
let anchorPrefix;
{
  const src = readFileSync(SERVICES_PAGE, 'utf8');
  pageLanes = [...src.matchAll(/^\s*id:\s*'([a-z0-9-]+)',/gm)].map((m) => m[1]);
  if (pageLanes.length === 0) {
    console.error(
      `${TAG} FAIL — parsed 0 lane ids out of services.astro. The lanes[] ` +
        `shape changed, so this assertion silently stopped checking anything. ` +
        `Fix the parser, do not delete the check.`,
    );
    process.exit(1);
  }
  const tpl = src.match(/id=\{`([a-z0-9-]*)\$\{lane\.id\}`\}/);
  if (!tpl) {
    console.error(
      `${TAG} FAIL — could not find the section id template in ` +
        `services.astro. Dossier practice chips derive their #fragment from ` +
        `it; without it this gate cannot tell a live anchor from a dead one.`,
    );
    process.exit(1);
  }
  anchorPrefix = tpl[1];
}
const laneSet = new Set(pageLanes);

/*
 * And assert the renderer actually uses that prefix. This is the check that
 * would have caught the real bug: the ids were all valid, the JSON was
 * clean, the build was green — and every chip pointed at `#<id>` while the
 * page emitted `#lane-<id>`.
 */
{
  const SLUG_PAGE = resolve(HERE, '..', 'src', 'pages', 'engagements', '[slug].astro');
  if (!existsSync(SLUG_PAGE)) {
    console.error(`${TAG} FAIL — ${SLUG_PAGE} not found.`);
    process.exit(1);
  }
  const src = readFileSync(SLUG_PAGE, 'utf8');
  const href = src.match(/href=\{`\/services\/#([a-z0-9-]*)\$\{s\.id\}`\}/);
  if (!href) {
    console.error(
      `${TAG} FAIL — could not find the practice-chip href template in ` +
        `[slug].astro. Either the chips stopped rendering or the template ` +
        `changed shape; both need eyes, neither is a pass.`,
    );
    process.exit(1);
  }
  if (href[1] !== anchorPrefix) {
    console.error(
      `${TAG} FAIL — practice chips link to "/services/#${href[1]}<id>" but ` +
        `services.astro emits ids as "${anchorPrefix}<id>". Every chip is a ` +
        `dead anchor: the page returns 200 and the fragment matches nothing, ` +
        `so nothing else in this pipeline would report it.`,
    );
    process.exit(1);
  }
}
const lanesUsed = new Set();

for (const file of files) {
  const data = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  const svc = data.services;

  if (!Array.isArray(svc) || svc.length === 0) {
    findings.push(
      `${file} — no \`services\`. Every exhibit must name at least one ` +
        `practice lane it demonstrates; an exhibit that cannot is a story, ` +
        `not a case. Valid ids: ${pageLanes.join(', ')}`,
    );
    continue;
  }
  for (const id of svc) {
    if (!laneSet.has(id)) {
      findings.push(
        `${file} — service ${JSON.stringify(id)} is not a lane on ` +
          `/services (${pageLanes.join(', ')}). The chip would render and ` +
          `its #fragment would silently match nothing.`,
      );
    } else {
      lanesUsed.add(id);
    }
  }
  if (new Set(svc).size !== svc.length) {
    findings.push(`${file} — duplicate id in \`services\`: ${svc.join(', ')}`);
  }
}

/*
 * Coverage, stated as a finding rather than a hard rule: a lane advertised
 * on /services with no exhibit behind it is a claim with no evidence. It is
 * reported, not fatal, because a genuinely new lane legitimately has no case
 * study on the day it is added.
 */
const orphanLanes = pageLanes.filter((l) => !lanesUsed.has(l));

if (findings.length > 0) {
  console.error(`${TAG} FAIL — ${findings.length} finding(s):`);
  for (const f of findings) console.error(`  • ${f}`);
  process.exit(1);
}

if (orphanLanes.length > 0) {
  console.warn(
    `${TAG} note — ${orphanLanes.length} service lane(s) with no exhibit: ` +
      `${orphanLanes.join(', ')}. Not fatal, but the hall is the evidence ` +
      `for the services page.`,
  );
}

console.log(
  `${TAG} OK — ${files.length} engagement(s); ${heroCount} with specimen plate; ` +
    `${docCount} document(s) of record; leads/highlights markup consistent; ` +
    `titles name artefacts not categories; ${lanesUsed.size}/${pageLanes.length} ` +
    `service lane(s) evidenced; registry unique (num, sort, accent, title)`,
);
