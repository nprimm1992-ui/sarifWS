#!/usr/bin/env node
/**
 * check-service-catalogue — keep the priced catalogue, its URL codec and its
 * two rendered surfaces in agreement.
 *
 * WHY THIS EXISTS
 * ---------------
 * /services now publishes 28 individually selectable, individually priced
 * deliverables, and a selection travels to /contact through a URL parameter
 * before being composed into the transmitted `signal`. That is a four-link
 * chain — catalogue module, services markup, URL codec, contact markup — and
 * every link is a place where a deliverable can become SELECTABLE BUT
 * UN-TRANSMITTABLE:
 *
 *   1. Someone adds a deliverable to DELIVERABLES. The services page renders a
 *      checkbox for it automatically. The contact page renders its confirmation
 *      rows from the same array, so that is safe by construction TODAY — but the
 *      day either surface is refactored to a hand-written list, a prospect can
 *      tick a box, see nothing confirmed, and send a brief that omits it.
 *
 *   2. Someone renames a `sku`. Every previously shared or bookmarked
 *      `?scope=…` URL silently drops that item. `decodeScope` deliberately
 *      DROPS unknown skus rather than echoing them (it must never print
 *      attacker-controlled text back to a human), which makes this failure
 *      completely silent by design. The drop is correct; the rename is what
 *      needs to be loud.
 *
 *   3. Someone gives a `quote`-kind deliverable a non-zero `from`, or a priced
 *      one a `from` of 0. The floor arithmetic then either invents money or
 *      loses it, and the page prints the result as a dollar figure. eng-005 and
 *      Praxis No. 05 are both about numbers that lie by omission; shipping one
 *      on the pricing page would be the worst possible place for it.
 *
 *   4. Someone adds a deliverable with a very long title. `formatScopeBrief`
 *      grows, the contact page reserves that many characters off the textarea's
 *      `maxlength`, and if the worst case ever exceeded the server's
 *      SIGNAL_MAX the honest path would start returning 400.
 *
 * None of those four is a syntax error, a type error, or a test failure. All
 * four produce a page that looks completely correct. So they are asserted here.
 *
 * WHY IT IMPORTS RATHER THAN REGEX-SCANS
 * --------------------------------------
 * The catalogue is TypeScript. Node 22 strips type annotations natively, so
 * this gate imports `src/lib/service-catalogue.ts` and exercises the REAL
 * functions the pages call. That matters: the predecessor of this pattern
 * (sentinel 11's lane parser) regex-scanned services.astro for `id:` and would
 * have read all 28 deliverables as practice lanes — passing green while
 * measuring the wrong thing. Parsing source to infer behaviour is how that
 * happens. Importing it cannot drift from what ships.
 *
 * Limits (SIGNAL_MAX, SIGNAL_MIN) are likewise READ from
 * functions/api/_shared/validate.js rather than duplicated here, because a
 * budget check against a stale copy of the budget is not a check.
 *
 * WHAT IS ASSERTED AGAINST THE BUILT ARTEFACT
 * -------------------------------------------
 * Group D runs on dist/. Rendering is where three of this feature's four real
 * defects lived, and two of them had a completely correct DOM:
 *
 *   - rows built with createElement carried no `data-astro-cid-*`, so every
 *     scoped rule silently failed to match them;
 *   - `hidden` is only a UA-stylesheet `display: none`, so an author
 *     `display: flex` on the same element defeated it and painted all 28 rows
 *     while the DOM correctly reported 26 hidden.
 *
 * The second is regression-armoured here (D5) by asserting the guard survives
 * into the EMITTED stylesheet, not the source. A source-only check would have
 * passed on the broken build.
 *
 * Exit codes: 0 = pass, 1 = at least one finding.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TAG = '[check-service-catalogue]';

const CATALOGUE_MODULE = join(ROOT, 'src/lib/service-catalogue.ts');
const CONTENT_CONFIG = join(ROOT, 'src/content.config.ts');
const VALIDATE_MODULE = join(ROOT, 'functions/api/_shared/validate.js');
const DIST = join(ROOT, 'dist');
const SERVICES_HTML = join(DIST, 'services/index.html');
const CONTACT_HTML = join(DIST, 'contact/index.html');

/** Every failure is collected so one run reports the whole picture. */
const findings = [];
const fail = (rule, msg) => findings.push(`${rule} — ${msg}`);

/* ------------------------------------------------------------------ *
 * Fail-closed preconditions.
 *
 * A checker that cannot reach its subject must exit non-zero, not print OK.
 * Reporting success while inspecting nothing is the defect species this
 * repository has now closed nine times, and it will not be reintroduced by
 * the gate that exists to prevent it.
 * ------------------------------------------------------------------ */
if (!existsSync(CATALOGUE_MODULE)) {
  console.error(
    `${TAG} FAIL — src/lib/service-catalogue.ts not found.\n` +
      `    This gate's entire subject is that module. If it moved, update the\n` +
      `    path here; do not delete the check.`,
  );
  process.exit(1);
}

if (!existsSync(DIST)) {
  console.error(
    `${TAG} FAIL — no dist/. Group D asserts against the BUILT services and\n` +
      `    contact pages, because two of this feature's render defects had a\n` +
      `    correct DOM and wrong pixels. Run this from \`npm run postbuild\`,\n` +
      `    not standalone.`,
  );
  process.exit(1);
}

let cat;
try {
  cat = await import(pathToFileURL(CATALOGUE_MODULE).href);
} catch (err) {
  console.error(
    `${TAG} FAIL — could not import the catalogue module:\n    ${err?.message ?? err}\n\n` +
      `    Node 22 strips TypeScript types natively, so this import is expected\n` +
      `    to work without a build step. If it stopped working, fix the import\n` +
      `    (or the module's syntax) — do NOT fall back to regex-scanning the\n` +
      `    source. Inferring behaviour from source text is exactly how sentinel\n` +
      `    11's lane parser came to read 28 deliverables as 4 practice lanes.`,
  );
  process.exit(1);
}

const {
  LANE_IDS,
  LANES,
  DELIVERABLES,
  FEE_POSTURE,
  SCOPE_PARAM,
  SCOPE_SEP,
  SCOPE_BRIEF_HEADING,
  COST_LABEL,
  findDeliverable,
  decodeScope,
  encodeScope,
  decodeScopeFromParams,
  scopeFloor,
  formatScopeBrief,
  maxScopeBriefLength,
  priceLabel,
  deliverablesForLane,
  usd,
} = cat;

/*
 * Surface contract. Destructuring a missing export yields `undefined`, and
 * `undefined` used later would throw a TypeError whose message names a symbol
 * rather than the problem. Checked up front so a removed export reports itself.
 */
const REQUIRED_EXPORTS = {
  LANE_IDS: 'object',
  LANES: 'object',
  DELIVERABLES: 'object',
  FEE_POSTURE: 'string',
  SCOPE_PARAM: 'string',
  SCOPE_SEP: 'string',
  SCOPE_BRIEF_HEADING: 'string',
  COST_LABEL: 'string',
  findDeliverable: 'function',
  decodeScope: 'function',
  encodeScope: 'function',
  decodeScopeFromParams: 'function',
  scopeFloor: 'function',
  formatScopeBrief: 'function',
  maxScopeBriefLength: 'function',
  priceLabel: 'function',
  deliverablesForLane: 'function',
  usd: 'function',
};
const missing = Object.entries(REQUIRED_EXPORTS)
  .filter(([name, kind]) => typeof cat[name] !== kind)
  .map(([name, kind]) => `${name} (expected ${kind})`);
if (missing.length > 0) {
  console.error(
    `${TAG} FAIL — the catalogue module is missing ${missing.length} export(s) ` +
      `this gate and both pages depend on:\n` +
      missing.map((m) => `      \u2022 ${m}`).join('\n') +
      `\n\n    Every one of these is called by services.astro, contact.astro or\n` +
      `    both. A removed export is a broken page, not a tidied module.`,
  );
  process.exit(1);
}

/*
 * Emptiness guards. Each of the three collections below is iterated by every
 * rule that follows, so an empty one would make this script pass with zero
 * assertions performed — a fail-open indistinguishable from a clean run.
 */
if (!Array.isArray(DELIVERABLES) || DELIVERABLES.length === 0) {
  console.error(
    `${TAG} FAIL — DELIVERABLES is empty. Every rule below iterates it, so an\n` +
      `    empty catalogue would make this gate report OK having verified\n` +
      `    nothing at all.`,
  );
  process.exit(1);
}
if (!Array.isArray(LANES) || LANES.length === 0 || !Array.isArray(LANE_IDS) || LANE_IDS.length === 0) {
  console.error(
    `${TAG} FAIL — LANES or LANE_IDS is empty. Lane membership, anchor and\n` +
      `    coverage rules all derive from these; empty means unverified.`,
  );
  process.exit(1);
}

/* ==================================================================== *
 * GROUP A — catalogue integrity
 * ==================================================================== */

/* A1. Every sku is unique.
 *
 * The sku is the primary key of the whole feature: it is the checkbox value,
 * the URL token, the `data-scope-row` selector on both pages, and the Map key
 * in BY_SKU. A duplicate does not throw — `new Map()` silently keeps the last
 * entry, so the FIRST of the pair becomes permanently unreachable through
 * findDeliverable() while still rendering its own checkbox. Ticking it would
 * confirm the other one's title and price.
 */
{
  const seen = new Map();
  for (const d of DELIVERABLES) {
    if (seen.has(d.sku)) {
      fail(
        'A1 duplicate sku',
        `"${d.sku}" is used by both "${seen.get(d.sku)}" and "${d.title}". ` +
          `BY_SKU is a Map, so the first one becomes unreachable through ` +
          `findDeliverable() while still rendering a checkbox — ticking it ` +
          `would confirm the other deliverable's title and price. Skus are a ` +
          `public contract (they travel in ?scope=), so change the NEW one.`,
      );
    }
    seen.set(d.sku, d.title);
  }
}

/* A2. Every sku is URL-safe in the shape the codec assumes.
 *
 * decodeScope splits on SCOPE_SEP and the value rides in a query string
 * unescaped by encodeScope. A sku containing the separator would split into
 * two unknown tokens and be silently dropped; one containing `&`, `=`, `%`,
 * `#` or whitespace would need escaping that neither encodeScope nor the
 * native form submit performs. Restricting to [a-z0-9-] makes the encode step
 * provably lossless instead of conditionally lossless.
 */
for (const d of DELIVERABLES) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.sku)) {
    fail(
      'A2 sku shape',
      `"${d.sku}" (${d.title}) is not lowercase-hyphen-alphanumeric. Skus ride ` +
        `in a query string unescaped and are split on "${SCOPE_SEP}", so any ` +
        `other character is either lost or requires escaping that encodeScope ` +
        `does not perform.`,
    );
  }
  if (d.sku.includes(SCOPE_SEP)) {
    fail(
      'A2 sku shape',
      `"${d.sku}" contains the scope separator "${SCOPE_SEP}" and would split ` +
        `into two unknown tokens, both silently dropped by decodeScope.`,
    );
  }
}

/* A3. Every deliverable belongs to a declared lane.
 *
 * services.astro renders lanes by mapping LANES and calling
 * deliverablesForLane(). A deliverable pointing at a lane that does not exist
 * is therefore rendered NOWHERE — no checkbox, no error, no way to notice
 * except by counting. It would remain in DELIVERABLES, so the contact page
 * would still render a confirmation row for it, and it would still be
 * reachable by hand-crafting a ?scope= URL. That asymmetry is worse than a
 * crash.
 */
{
  const laneSet = new Set(LANE_IDS);
  for (const d of DELIVERABLES) {
    if (!laneSet.has(d.lane)) {
      fail(
        'A3 lane membership',
        `"${d.sku}" claims lane "${d.lane}", which is not in LANE_IDS ` +
          `[${LANE_IDS.join(', ')}]. services.astro maps LANES, so this ` +
          `deliverable renders no checkbox at all — while the contact page ` +
          `still renders a row for it and a hand-crafted ?scope= still selects ` +
          `it.`,
      );
    }
  }
}

/* A4. Every declared lane actually sells something.
 *
 * An empty lane renders a heading, a summary, a timeline and an empty
 * fieldset. It also keeps its `#lane-<id>` anchor, so engagement dossier chips
 * continue to deep-link a prospect to a section with nothing in it — which
 * looks like a broken page rather than a lane in transition.
 */
for (const lane of LANES) {
  const n = deliverablesForLane(lane.id).length;
  if (n === 0) {
    fail(
      'A4 empty lane',
      `lane "${lane.id}" (${lane.title}) has no deliverables. It still renders ` +
        `a heading and keeps its #lane-${lane.id} anchor, so dossier practice ` +
        `chips would deep-link prospects to an empty section. Either give it a ` +
        `deliverable or remove the lane — and if you remove it, sentinel 11 ` +
        `will tell you which dossiers were pointing at it.`,
    );
  }
}

/* A5. LANES and LANE_IDS agree exactly, in both directions.
 *
 * LANE_IDS is the type-level contract mirrored in content.config.ts's Zod
 * enum; LANES is what renders. A lane in LANES but not LANE_IDS renders a
 * section that no dossier is permitted to reference. One in LANE_IDS but not
 * LANES passes Zod validation on a dossier, renders a chip, and deep-links to
 * an anchor that does not exist — and a fragment matching nothing is not an
 * HTTP error, so nothing anywhere reports it.
 */
{
  const idsFromLanes = LANES.map((l) => l.id);
  const setA = new Set(idsFromLanes);
  const setB = new Set(LANE_IDS);
  for (const id of setB) {
    if (!setA.has(id)) {
      fail(
        'A5 lane parity',
        `"${id}" is in LANE_IDS but has no entry in LANES. Dossiers may declare ` +
          `it (the Zod enum allows it) and their chips will deep-link to ` +
          `#lane-${id}, which will not exist. A fragment that matches nothing ` +
          `is not an HTTP error, so no other check will catch this.`,
      );
    }
  }
  for (const id of setA) {
    if (!setB.has(id)) {
      fail(
        'A5 lane parity',
        `"${id}" is in LANES but not LANE_IDS. It renders a section that no ` +
          `dossier is allowed to reference, because content.config.ts validates ` +
          `services[] against the same frozen set.`,
      );
    }
  }
  if (idsFromLanes.length !== setA.size) {
    fail(
      'A5 lane parity',
      `LANES contains a duplicate id. Two <details id="lane-…"> elements with ` +
        `the same id make the anchor ambiguous and the document invalid.`,
    );
  }
}

/* A6. The lane id set matches content.config.ts's Zod enum.
 *
 * These are two hand-maintained lists of the same frozen contract in two
 * files, which is exactly the shape that drifts. Parsed rather than imported
 * because content.config.ts imports `astro:content`, a virtual module that
 * only resolves inside Astro's build. The parse is narrow and fails closed.
 */
if (existsSync(CONTENT_CONFIG)) {
  const src = readFileSync(CONTENT_CONFIG, 'utf8');
  const block = src.match(/const SERVICE_LANES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) {
    fail(
      'A6 Zod enum parity',
      `could not locate \`const SERVICE_LANES = [...] as const\` in ` +
        `src/content.config.ts. That list is the Zod enum validating every ` +
        `dossier's services[]; if it was renamed or restructured, update this ` +
        `parser rather than dropping the comparison — an unparsed contract is ` +
        `an unverified one.`,
    );
  } else {
    const zodIds = [...block[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
    if (zodIds.length === 0) {
      fail(
        'A6 Zod enum parity',
        `parsed 0 lane ids out of SERVICE_LANES. Fix the parser; do not delete ` +
          `the check.`,
      );
    } else {
      const zodSet = new Set(zodIds);
      const ourSet = new Set(LANE_IDS);
      for (const id of ourSet) {
        if (!zodSet.has(id)) {
          fail(
            'A6 Zod enum parity',
            `"${id}" is in LANE_IDS but not in content.config.ts's ` +
              `SERVICE_LANES. A dossier that declares it will fail content ` +
              `validation at build time with an error that names Zod, not this ` +
              `mismatch.`,
          );
        }
      }
      for (const id of zodSet) {
        if (!ourSet.has(id)) {
          fail(
            'A6 Zod enum parity',
            `"${id}" is accepted by content.config.ts's SERVICE_LANES but is not ` +
              `in LANE_IDS, so /services renders no #lane-${id} anchor for the ` +
              `chips that will point at it.`,
          );
        }
      }
    }
  }
}

/* ==================================================================== *
 * GROUP B — pricing arithmetic and posture
 *
 * These are the rules that stop the page printing a dollar figure that is
 * wrong. Every one of them describes a state that renders perfectly.
 * ==================================================================== */

const PRICE_KINDS = new Set(['from', 'tiered', 'quote']);

for (const d of DELIVERABLES) {
  /* B1. `kind` is one of the three the formatters handle.
   *
   * priceLabel() falls through to `Starting at $X` for any unrecognised kind.
   * A typo'd kind on a quote-only deliverable would therefore print
   * "Starting at $0" — a published price of nothing, which is the single most
   * damaging string this page could emit. */
  if (!PRICE_KINDS.has(d.kind)) {
    fail(
      'B1 price kind',
      `"${d.sku}" has kind "${d.kind}", which none of the formatters handle. ` +
        `priceLabel() falls through to "Starting at $X", so an unpriced ` +
        `deliverable with a typo'd kind would publish "Starting at $0".`,
    );
    continue;
  }

  /* B2. `from === 0` if and only if `kind === 'quote'`.
   *
   * This is the load-bearing invariant of scopeFloor(): it adds `from` for
   * everything that is not a quote and counts quotes separately. Break it in
   * either direction and the floor is wrong in a way no test would notice:
   *   - priced item with from 0  -> floor silently under-reports (invents a
   *     discount, and prints "Starting at $0")
   *   - quote item with from > 0 -> the number is excluded from the floor by
   *     scopeFloor but still published by priceLabel, so the page shows a
   *     price it refuses to count. */
  if (d.kind === 'quote' && d.from !== 0) {
    fail(
      'B2 quote pricing',
      `"${d.sku}" is kind "quote" but has from=${d.from}. scopeFloor() excludes ` +
        `quote-kind deliverables from the floor, so this number is published by ` +
        `priceLabel() and simultaneously refused by the arithmetic. Set from=0, ` +
        `or change the kind to "from".`,
    );
  }
  if (d.kind !== 'quote' && !(d.from > 0)) {
    fail(
      'B2 floor pricing',
      `"${d.sku}" is kind "${d.kind}" but has from=${d.from}. priceLabel() will ` +
        `publish "Starting at $0" and scopeFloor() will add nothing — the page ` +
        `would advertise free work. Give it a floor or mark it kind:"quote".`,
    );
  }

  /* B3. Prices are whole dollars.
   *
   * usd() formats with toLocaleString('en-US'), which renders 1500.5 as
   * "1,500.5" — a floor with a stray decimal reads as a miscalculation. All
   * of the operator's collateral is in whole dollars, so this is a real
   * invariant, not a stylistic preference. */
  if (!Number.isInteger(d.from)) {
    fail(
      'B3 whole dollars',
      `"${d.sku}" has a non-integer from=${d.from}. usd() would render it with ` +
        `a stray decimal ("$1,500.5"), which reads as a miscalculation on a ` +
        `page whose entire posture is "no surprises".`,
    );
  }

  /* B4. `tiers` exists exactly when kind is 'tiered', and its floor is its
   * lowest tier.
   *
   * priceLabel() only reads `tiers` when kind is 'tiered'. A tiered
   * deliverable without tiers falls back to "Starting at $X" and silently
   * stops publishing its ladder; tiers on a non-tiered deliverable are dead
   * data that will eventually be believed by someone. And if `from` is not
   * the minimum tier, the card publishes a ladder starting at one number
   * while contributing a different one to the floor. */
  const hasTiers = Array.isArray(d.tiers) && d.tiers.length > 0;
  if (d.kind === 'tiered' && !hasTiers) {
    fail(
      'B4 tiers',
      `"${d.sku}" is kind "tiered" but publishes no tiers. priceLabel() will ` +
        `silently degrade to "Starting at ${usd(d.from)}" and tierLabel() will ` +
        `return null, so the ladder simply vanishes from the card.`,
    );
  }
  if (d.kind !== 'tiered' && hasTiers) {
    fail(
      'B4 tiers',
      `"${d.sku}" is kind "${d.kind}" but carries a tiers array. Nothing reads ` +
        `it — priceLabel() and tierLabel() both gate on kind — so it is dead ` +
        `data that a future reader will treat as published pricing.`,
    );
  }
  if (hasTiers) {
    for (const t of d.tiers) {
      if (typeof t?.label !== 'string' || t.label.length === 0) {
        fail('B4 tiers', `"${d.sku}" has a tier with no label; tierLabel() would render an empty rung.`);
      }
      if (!Number.isInteger(t?.price) || !(t.price > 0)) {
        fail('B4 tiers', `"${d.sku}" has a tier priced ${t?.price}; tiers are published verbatim by priceLabel().`);
      }
    }
    const lowest = Math.min(...d.tiers.map((t) => t.price));
    if (d.kind === 'tiered' && d.from !== lowest) {
      fail(
        'B4 tier floor',
        `"${d.sku}" has from=${d.from} but its lowest tier is ${lowest}. The ` +
          `card publishes the ladder while the floor arithmetic uses \`from\`, ` +
          `so the summary would quote a number the card never showed.`,
      );
    }
    const sorted = [...d.tiers].every(
      (t, i, a) => i === 0 || a[i - 1].price <= t.price,
    );
    if (!sorted) {
      fail(
        'B4 tier order',
        `"${d.sku}"'s tiers are not in ascending price order. priceLabel() joins ` +
          `them verbatim, so the card would read "$3,500 / $500 / $1,500".`,
      );
    }
  }

  /* B5. Copy fields are present and non-empty.
   *
   * Both surfaces print `title`; the services card prints `desc`. An empty
   * title renders a checkbox with no accessible label, which is a checkbox no
   * screen-reader user can identify. */
  for (const field of ['title', 'desc']) {
    if (typeof d[field] !== 'string' || d[field].trim().length === 0) {
      fail(
        'B5 copy',
        `"${d.sku}" has an empty ${field}. An empty title renders a checkbox ` +
          `with no accessible name — unidentifiable to a screen-reader user and ` +
          `unconfirmable on the contact page.`,
      );
    }
  }
}

/* B6. The floor of the whole catalogue is the sum of its priced floors.
 *
 * An end-to-end check on scopeFloor() itself rather than on its inputs. It
 * would catch a refactor that, say, started counting quote-kind items into the
 * floor — the exact "number that lies by omission" this feature is written to
 * avoid.
 */
{
  const all = scopeFloor(DELIVERABLES);
  const expectedFloor = DELIVERABLES
    .filter((d) => d.kind !== 'quote')
    .reduce((a, d) => a + d.from, 0);
  const expectedQuotes = DELIVERABLES.filter((d) => d.kind === 'quote').length;
  if (all.floor !== expectedFloor) {
    fail(
      'B6 floor arithmetic',
      `scopeFloor(DELIVERABLES).floor is ${all.floor}; summing priced floors ` +
        `gives ${expectedFloor}. The page prints this as a dollar figure.`,
    );
  }
  if (all.quoteCount !== expectedQuotes) {
    fail(
      'B6 quote accounting',
      `scopeFloor reports ${all.quoteCount} quote-only deliverable(s); the ` +
        `catalogue has ${expectedQuotes}. quoteCount is what stops the floor ` +
        `lying by omission, so an undercount is the failure this field exists ` +
        `to prevent.`,
    );
  }
  if (all.count !== DELIVERABLES.length) {
    fail('B6 count', `scopeFloor reports count ${all.count} for ${DELIVERABLES.length} deliverables.`);
  }
}

/* B7. The fee posture is still stated.
 *
 * FEE_POSTURE is the sentence that converts every published number from a
 * quote into a floor. Both pages render it. Publishing 28 prices WITHOUT it
 * turns an estimate into an implied invoice, which is a misrepresentation,
 * not a copy regression.
 *
 * NOTE ON VOCABULARY: this file says "floor" when it means the arithmetic
 * (the summed entry prices, which really is a lower bound) and defers to
 * COST_LABEL for anything a reader sees. Do not "correct" one into the
 * other; they are different audiences.
 */
if (typeof FEE_POSTURE !== 'string' || FEE_POSTURE.trim().length < 20) {
  fail(
    'B7 fee posture',
    `FEE_POSTURE is empty or too short to say anything. It is the sentence that ` +
      `makes every published price a FLOOR rather than a quote; without it the ` +
      `page reads as an invoice.`,
  );
}

/* ==================================================================== *
 * GROUP C — URL codec and transport
 * ==================================================================== */

/* C1. Round-trip parity for every single-item selection.
 *
 * Per-item rather than one bulk round-trip, because a bulk test passes if
 * exactly one sku is broken as long as the set still sorts the same way.
 */
for (const d of DELIVERABLES) {
  const back = decodeScope(encodeScope([d]));
  if (back.length !== 1 || back[0].sku !== d.sku) {
    fail(
      'C1 codec round-trip',
      `encode/decode of "${d.sku}" alone returned ` +
        `[${back.map((x) => x.sku).join(', ')}]. Every shared or bookmarked ` +
        `?scope= URL containing this sku is silently dropping it.`,
    );
  }
}

/* C2. Whole-catalogue round-trip is order-stable and lossless.
 *
 * decodeScope filters DELIVERABLES, so output order is the CATALOGUE's, not
 * the URL's. That is deliberate: two prospects who pick the same set get an
 * identical brief regardless of click order. Asserted so a refactor to
 * `wanted.map(findDeliverable)` — which would be the obvious "simplification"
 * — cannot land silently.
 */
{
  const encoded = encodeScope(DELIVERABLES);
  const back = decodeScope(encoded);
  if (back.length !== DELIVERABLES.length) {
    fail('C2 codec completeness', `round-tripping the whole catalogue returned ${back.length} of ${DELIVERABLES.length}.`);
  }
  const order = back.map((d) => d.sku).join(',');
  const canonical = DELIVERABLES.map((d) => d.sku).join(',');
  if (order !== canonical) {
    fail(
      'C2 codec order',
      `decodeScope did not return catalogue order. Order stability is what ` +
        `makes two prospects who pick the same set produce an identical brief; ` +
        `a URL-ordered result makes the confirmed scope depend on click order.`,
    );
  }
  /* Reverse the URL and confirm the answer is unchanged. */
  const reversed = decodeScope([...DELIVERABLES].reverse().map((d) => d.sku).join(SCOPE_SEP));
  if (reversed.map((d) => d.sku).join(',') !== canonical) {
    fail('C2 codec order', `a reversed ?scope= produced a different order; the decode is not order-normalising.`);
  }
}

/* C3. Hostile and malformed input is total, never echoed.
 *
 * decodeScope's output is printed back to a human as a "confirmed scope", so
 * an unknown token surviving the decode would be reflected input on a page
 * that also submits a form. Also covers the empty and over-length paths.
 */
{
  const cases = [
    ['unknown sku', 'not-a-real-sku'],
    ['injection attempt', '<script>alert(1)</script>'],
    ['separator soup', `${SCOPE_SEP}${SCOPE_SEP}${SCOPE_SEP}`],
    ['empty string', ''],
    ['over-length', 'a'.repeat(5000)],
    ['mixed known + unknown', `${DELIVERABLES[0].sku}${SCOPE_SEP}<img src=x>`],
  ];
  for (const [label, raw] of cases) {
    const out = decodeScope(raw);
    if (!Array.isArray(out)) {
      fail('C3 hostile input', `decodeScope(${label}) did not return an array.`);
      continue;
    }
    for (const item of out) {
      if (!findDeliverable(item.sku)) {
        fail(
          'C3 hostile input',
          `decodeScope(${label}) returned "${item.sku}", which is not in the ` +
            `catalogue. This value is printed back to a human as a confirmed ` +
            `scope, so surviving unknown input is reflected content.`,
        );
      }
    }
  }
  /*
   * The length cap, probed with an input the cap is the ONLY thing that
   * rejects.
   *
   * The first version of this assertion used `'a'.repeat(5000)` and was a
   * fail-open: that string decodes to zero items whether or not the cap
   * exists, because "aaa…" is not a sku and would be dropped anyway. It
   * passed identically against a build with the cap deleted — an assertion
   * that cannot fail is not an assertion.
   *
   * Found by canary, not by reading. So the probe is now built from REAL skus
   * repeated past 2048 characters: every token is valid, so the only reason
   * the result can be empty is the cap itself.
   */
  {
    const skus = DELIVERABLES.map((d) => d.sku);
    let overLong = '';
    let i = 0;
    while (overLong.length <= 2048) {
      overLong += `${skus[i % skus.length]}${SCOPE_SEP}`;
      i += 1;
    }
    if (decodeScope(overLong).length !== 0) {
      fail(
        'C3 hostile input',
        `decodeScope accepted a ${overLong.length}-char ?scope= built from valid ` +
          `skus. The 2048-char cap is what keeps a hostile query string from ` +
          `being split and set-membership-tested; without it the page does ` +
          `unbounded work on unbounded input.`,
      );
    }
  }
  for (const nullish of [null, undefined]) {
    if (decodeScope(nullish).length !== 0) {
      fail('C3 hostile input', `decodeScope(${String(nullish)}) is not total; both pages call it with a possibly-absent param.`);
    }
  }
}

/* C4. Both wire shapes converge — native GET and canonical pipe.
 *
 * The services page is a real <form method="get">, so a no-JS submit produces
 * `?scope=a&scope=b`. With JS the submit is intercepted and rewritten to the
 * house shape `?scope=a|b` (matching praxis.astro's `?lens=`). If those two
 * ever decode differently, the no-JS path becomes a route that silently loses
 * the prospect's selection — a fail-open reachable by turning off JavaScript.
 */
{
  const pick = DELIVERABLES.slice(0, 3);
  const skus = pick.map((d) => d.sku);
  const shapes = {
    native: new URLSearchParams(skus.map((s) => [SCOPE_PARAM, s])),
    pipe: new URLSearchParams([[SCOPE_PARAM, skus.join(SCOPE_SEP)]]),
    mixed: new URLSearchParams([
      [SCOPE_PARAM, skus.slice(0, 2).join(SCOPE_SEP)],
      [SCOPE_PARAM, skus[2]],
    ]),
    duplicated: new URLSearchParams([
      [SCOPE_PARAM, skus.join(SCOPE_SEP)],
      [SCOPE_PARAM, skus[0]],
    ]),
  };
  const expected = skus.join(',');
  for (const [label, params] of Object.entries(shapes)) {
    const got = decodeScopeFromParams(params).map((d) => d.sku).join(',');
    if (got !== expected) {
      fail(
        'C4 wire shape parity',
        `the "${label}" shape decoded to [${got}] but should give [${expected}]. ` +
          `The native form submit and the JS-rewritten URL must converge, or ` +
          `disabling JavaScript silently discards the selection.`,
      );
    }
  }
  if (decodeScopeFromParams(new URLSearchParams()).length !== 0) {
    fail('C4 wire shape parity', `an empty URLSearchParams did not decode to an empty scope.`);
  }
  if (decodeScopeFromParams(null).length !== 0) {
    fail('C4 wire shape parity', `decodeScopeFromParams(null) is not total; the contact page calls it before knowing a param exists.`);
  }
}

/* C5. The scope brief fits inside the server's signal budget.
 *
 * functions/api/transmit.js persists and emails exactly four fields, and the
 * scope has no column of its own, so it is composed into `signal`. The contact
 * page therefore reduces the textarea's maxlength by maxScopeBriefLength()+2.
 * If the worst-case brief plus the minimum message ever exceeded SIGNAL_MAX,
 * the honest path would start 400-ing. SIGNAL_MAX is read from the shared
 * validator, not copied, because a budget check against a stale copy of the
 * budget is not a check.
 */
{
  const worst = maxScopeBriefLength();
  const rendered = formatScopeBrief(DELIVERABLES);
  if (typeof worst !== 'number' || !Number.isFinite(worst) || worst <= 0) {
    fail('C5 signal budget', `maxScopeBriefLength() returned ${worst}; the contact page subtracts it from maxlength.`);
  }
  if (rendered.length !== worst) {
    fail(
      'C5 signal budget',
      `maxScopeBriefLength() says ${worst} but formatScopeBrief(DELIVERABLES) ` +
        `is ${rendered.length} chars. The budget must be derived from the same ` +
        `renderer that produces the text, or the reservation is a guess.`,
    );
  }

  let SIGNAL_MAX = null;
  let SIGNAL_MIN = null;
  if (existsSync(VALIDATE_MODULE)) {
    const v = readFileSync(VALIDATE_MODULE, 'utf8');
    const max = v.match(/SIGNAL_MAX:\s*([\d_]+)/);
    const min = v.match(/SIGNAL_MIN:\s*([\d_]+)/);
    if (max) SIGNAL_MAX = Number(max[1].replace(/_/g, ''));
    if (min) SIGNAL_MIN = Number(min[1].replace(/_/g, ''));
  }
  if (SIGNAL_MAX === null) {
    fail(
      'C5 signal budget',
      `could not read LIMITS.SIGNAL_MAX from functions/api/_shared/validate.js. ` +
        `That number is the whole point of this rule; fix the parser rather ` +
        `than hardcoding a copy of it here.`,
    );
  } else {
    /* Headroom, not just fit: the reserved budget must still leave room for a
       message longer than the server's own minimum, or the reservation would
       be technically satisfied and practically useless. */
    const headroom = SIGNAL_MAX - (worst + 2);
    const floorNeeded = Math.max(SIGNAL_MIN ?? 20, 200);
    if (headroom < floorNeeded) {
      fail(
        'C5 signal budget',
        `the worst-case scope brief is ${worst} chars; reserving it from ` +
          `SIGNAL_MAX (${SIGNAL_MAX}) leaves only ${headroom} chars for the ` +
          `prospect's actual message, below the ${floorNeeded} this feature ` +
          `guarantees. Shorten deliverable titles or raise SIGNAL_MAX — do not ` +
          `let the honest path 400.`,
      );
    }
  }
}

/* C6. The brief is faithful, and its heading is the one the pages agree on.
 *
 * The brief is what actually arrives. The confirmed scope shown on screen is
 * generated from the same items, so a brief that omits an item means the
 * prospect was shown a confirmation of something that was never sent.
 */
{
  if (formatScopeBrief([]) !== '') {
    fail('C6 brief', `formatScopeBrief([]) must return '' so an empty scope composes nothing into the signal.`);
  }
  const sample = [
    DELIVERABLES.find((d) => d.kind === 'from'),
    DELIVERABLES.find((d) => d.kind === 'quote'),
    DELIVERABLES.find((d) => d.kind === 'tiered'),
  ].filter(Boolean);
  if (sample.length === 0) {
    fail('C6 brief', `no deliverable of any known kind was found to exercise formatScopeBrief.`);
  } else {
    const brief = formatScopeBrief(sample);
    if (!brief.startsWith(`${SCOPE_BRIEF_HEADING} (${sample.length})`)) {
      fail(
        'C6 brief',
        `the brief does not open with "${SCOPE_BRIEF_HEADING} (${sample.length})". ` +
          `That heading is how the recipient recognises the block, and the ` +
          `contact page renders the same words on screen.`,
      );
    }
    for (const d of sample) {
      if (!brief.includes(d.title)) {
        fail(
          'C6 brief',
          `"${d.title}" was selected but does not appear in the composed brief. ` +
            `The prospect is shown it as a CONFIRMED scope, so an omission here ` +
            `means confirming something that was never sent.`,
        );
      }
      if (!brief.includes(priceLabel(d))) {
        fail(
          'C6 brief',
          `the brief omits the published price line for "${d.sku}" ` +
            `("${priceLabel(d)}"), so the recipient cannot see which scope the ` +
            `prospect was quoted.`,
        );
      }
    }
    /*
     * The floor line must state the floor AND the quote count, with the
     * correct NUMBER in each.
     *
     * The first version of this only tested for the phrase "quoted on scope",
     * which a canary showed to be too loose: a brief reporting the wrong count
     * still contained the phrase and still passed. The whole reason
     * `quoteCount` is a separate field is that the number is the disclosure —
     * "plus 0 deliverables quoted on scope" beside two unpriced items is
     * exactly the omission this rule exists to catch. So the digits are
     * asserted, not the wording around them.
     */
    const { floor, quoteCount } = scopeFloor(sample);
    if (!brief.includes(`${COST_LABEL}: ${usd(floor)}`)) {
      fail(
        'C6 brief',
        `the brief's cost line does not read "${COST_LABEL}: ${usd(floor)}". ` +
          `That figure is what the recipient reads as the entry price of the ` +
          `requested scope, and the contact page prints the same number on ` +
          `screen from the same function.`,
      );
    }
    if (quoteCount > 0) {
      const expected = `plus ${quoteCount} deliverable${quoteCount === 1 ? '' : 's'} quoted on scope`;
      if (!brief.includes(expected)) {
        fail(
          'C6 brief',
          `the selection contains ${quoteCount} unpriced deliverable(s) but the ` +
            `brief's floor line does not say "${expected}". A floor that omits ` +
            `unpriced work — or miscounts it — is a number that lies by ` +
            `omission, which is the failure this disclosure exists to prevent.`,
        );
      }
    } else if (/quoted on scope/.test(brief)) {
      fail(
        'C6 brief',
        `the brief mentions work "quoted on scope" for a selection that is ` +
          `entirely priced, which understates the certainty of the floor.`,
      );
    }
  }
}

/* ==================================================================== *
 * GROUP D — the rendered surfaces
 *
 * Asserted against dist/, not src/. Three of this feature's four real defects
 * were render defects, and two of them had a completely correct DOM:
 *
 *   - rows built in the browser with createElement carried no
 *     `data-astro-cid-*` attribute, so every scoped CSS rule silently failed
 *     to match them and the title ran into the price;
 *   - `hidden` is only a UA-stylesheet `display: none`, so an author
 *     `display: flex` on the same element defeated it — the page painted all
 *     28 rows while the DOM correctly reported 26 of them hidden.
 *
 * A source-only check would have passed on both broken builds.
 * ==================================================================== */

const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const servicesHtml = readIf(SERVICES_HTML);
const contactHtml = readIf(CONTACT_HTML);

if (servicesHtml === null || contactHtml === null) {
  console.error(
    `${TAG} FAIL — dist/services/index.html or dist/contact/index.html is ` +
      `missing.\n    Group D is the half of this gate that checks what actually ` +
      `renders. Skipping it\n    on a partial build would report OK for the ` +
      `checks most likely to catch a\n    real defect.`,
  );
  process.exit(1);
}

/* D1. Every catalogue sku renders a real checkbox on /services.
 *
 * This is the "selectable" half of the selectable-but-un-transmittable pair.
 * Asserted from the built HTML rather than from the .astro source so that a
 * template refactor — a hand-written list, a filtered map, a conditional that
 * hides a lane — cannot drop a deliverable silently.
 */
{
  const rendered = new Set(
    [...servicesHtml.matchAll(
      new RegExp(`name="${SCOPE_PARAM}"[^>]*value="([a-z0-9-]+)"`, 'g'),
    )].map((m) => m[1]),
  );
  for (const d of DELIVERABLES) {
    if (!rendered.has(d.sku)) {
      fail(
        'D1 services checkbox',
        `"${d.sku}" (${d.title}) is in the catalogue but renders no ` +
          `<input name="${SCOPE_PARAM}" value="${d.sku}"> on /services. It is ` +
          `priced, briefed and confirmable — and unbuyable.`,
      );
    }
  }
  for (const sku of rendered) {
    if (!findDeliverable(sku)) {
      fail(
        'D1 services checkbox',
        `/services renders a checkbox for "${sku}", which is not in the ` +
          `catalogue. decodeScope drops unknown skus by design, so a prospect ` +
          `can tick this box, submit, and have the selection vanish with no ` +
          `error anywhere.`,
      );
    }
  }
}

/* D2. Every catalogue sku renders a confirmation row on /contact.
 *
 * The "transmittable" half. Both pages currently render from DELIVERABLES, so
 * this holds by construction today — which is exactly why it is asserted: the
 * construction is the thing that might change, and if it does, the failure is
 * a prospect who ticks a box, sees nothing confirmed, and sends a brief that
 * omits it.
 */
{
  const rows = new Set(
    [...contactHtml.matchAll(/data-scope-row="([a-z0-9-]+)"/g)].map((m) => m[1]),
  );
  for (const d of DELIVERABLES) {
    if (!rows.has(d.sku)) {
      fail(
        'D2 contact confirmation row',
        `"${d.sku}" (${d.title}) is selectable on /services but /contact ` +
          `renders no [data-scope-row="${d.sku}"] to confirm it. The reveal ` +
          `script only unhides rows that already exist, so this deliverable ` +
          `would be selectable and un-confirmable.`,
      );
    }
  }
  for (const sku of rows) {
    if (!findDeliverable(sku)) {
      fail(
        'D2 contact confirmation row',
        `/contact renders a row for "${sku}", which is not in the catalogue. ` +
          `It can never be unhidden, so it is either dead markup or a sku that ` +
          `was renamed on one page only.`,
      );
    }
  }
  if (rows.size !== DELIVERABLES.length) {
    fail(
      'D2 contact confirmation row',
      `/contact renders ${rows.size} distinct confirmation row(s) for ` +
        `${DELIVERABLES.length} deliverables.`,
    );
  }
}

/* D3. Every lane still renders its `#lane-<id>` anchor.
 *
 * Sentinel 11 validates that dossier chips point at lanes declared in the
 * catalogue; this validates that the BUILT page actually contains the anchor
 * those chips resolve against. The two together close the loop — a chip
 * pointing at a declared lane whose section failed to render is still a dead
 * link, and a fragment that matches nothing is not an HTTP error.
 */
for (const lane of LANES) {
  if (!servicesHtml.includes(`id="lane-${lane.id}"`)) {
    fail(
      'D3 lane anchor',
      `the built /services page has no id="lane-${lane.id}". Engagement dossier ` +
        `practice chips deep-link to that fragment; a fragment that matches ` +
        `nothing scrolls nowhere and reports no error.`,
    );
  }
}

/* D4. The form is a real GET form pointed at /contact.
 *
 * Progressive enhancement is the reason `decodeScopeFromParams` accepts two
 * wire shapes at all. If the form loses its method or action — or becomes a
 * <div> driven entirely by script — the no-JS path stops existing and C4's
 * parity assertion becomes theatre: it would keep passing while nothing on
 * the site could ever produce the native shape.
 */
{
  const form = servicesHtml.match(/<form[^>]*class="scope-form"[^>]*>/);
  if (!form) {
    fail(
      'D4 progressive enhancement',
      `the built /services page has no <form class="scope-form">. The scope ` +
        `selector is meant to be a real form so checkbox semantics, keyboard ` +
        `operation and screen-reader announcement come from the platform. ` +
        `Without it the page needs JavaScript to sell anything.`,
    );
  } else {
    const tag = form[0];
    if (!/method="(get|GET)"/.test(tag)) {
      fail('D4 progressive enhancement', `<form class="scope-form"> has no method="get", so a no-JS submit would POST to a static host.`);
    }
    if (!/action="\/contact\/?"/.test(tag)) {
      fail(
        'D4 progressive enhancement',
        `<form class="scope-form"> does not action to /contact/. With scripting ` +
          `off, submitting the scope must still land on the page that confirms ` +
          `and transmits it.`,
      );
    }
  }
}

/* D5. The `hidden` guard survives into the EMITTED stylesheet.
 *
 * This rule exists because of a shipped defect, not a hypothetical one.
 * `hidden` is only `display: none` from the UA stylesheet, so the author rule
 * that laid out a confirmation row as a flex line silently overrode it: the
 * built page painted all 28 rows while the DOM correctly reported 26 hidden.
 *
 * The fix was twofold and BOTH halves are asserted, in the built CSS rather
 * than the source, because the broken build had correct-looking source:
 *   - layout rules are qualified with `:not([hidden])`
 *   - a `[hidden] { display: none !important }` backstop
 *
 * Checked in whichever emitted stylesheet each page actually links, so an
 * Astro change to bundling strategy cannot make this rule quietly unverifiable.
 */
{
  const cssFor = (html, label) => {
    const hrefs = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
    /* Inline <style> is also a legitimate emit target for small pages. */
    const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    let css = inline;
    let found = 0;
    for (const href of hrefs) {
      const p = join(DIST, href.replace(/^\//, ''));
      const s = readIf(p);
      if (s === null) {
        fail('D5 hidden guard', `${label} links ${href} but that file is not in dist/.`);
        continue;
      }
      found += 1;
      css += `\n${s}`;
    }
    if (found === 0 && inline.length === 0) {
      fail(
        'D5 hidden guard',
        `could not locate any emitted CSS for ${label}, so the hidden-attribute ` +
          `guard could not be verified. Fix this lookup rather than dropping ` +
          `the rule — it is armour around a defect that actually shipped.`,
      );
      return null;
    }
    return css;
  };

  const surfaces = [
    ['/services', servicesHtml, '.scope-summary__item'],
    ['/contact', contactHtml, '.scope-confirm__item'],
  ];
  /**
   * Find `display:` rules that target the row element WITHOUT qualifying
   * against `[hidden]`.
   *
   * WHY THIS TOKENIZES INSTEAD OF PATTERN-MATCHING
   * A single regex over the whole stylesheet was written first and canaried in
   * isolation before being trusted — which is the only reason the following is
   * not a false-positive machine. The regex flagged
   *
   *     .scope-confirm__item[hidden]{display:none!important}
   *
   * as a violation. That is the BACKSTOP. It only passed against the real
   * stylesheet by accident: the backstop happens to be authored as a
   * comma-grouped selector, and the `[^{,]*` in the pattern cannot cross a
   * comma, so the match never reached it. Split that group into single rules —
   * a completely reasonable edit, and one a CSS minifier is entitled to make —
   * and the gate would have fired on correct code.
   *
   * A gate that fails on correct code gets switched off, and then the real
   * defect ships unguarded. So the selector list is split properly and each
   * compound selector is judged on its own, with two exemptions that are
   * exemptions for a reason rather than for convenience:
   *
   *   - `:not([hidden])` — the qualification this rule exists to require.
   *   - `[hidden]` — a rule that targets the hidden state IS the backstop.
   *     Excluding it is not a loophole: such a rule cannot cause the defect,
   *     because the defect is a rule that applies WHILE the element is hidden
   *     and sets a display other than none. That is checked explicitly below.
   *
   * AND WHY IT STRIPS `[data-astro-cid-*]` FIRST
   * A second canary — mutating the real EMITTED stylesheet rather than a
   * hand-written sample — caught this rule being completely inert. Astro's
   * scoping stamps the cid attribute between the class and the rest of the
   * selector:
   *
   *     .scope-confirm__item[data-astro-cid-uw5kdbxl]:not([hidden]){display:flex}
   *
   * The class test was written against SOURCE css, where the class is followed
   * immediately by `:not(`. Against emitted css it is followed by `[`, and the
   * `(?![\w-])` guard that exists to reject BEM siblings let nothing through
   * at all — so the rule passed on the correct build AND on a build with the
   * qualification deleted. It verified nothing, which is worse than absent,
   * because it looked like coverage.
   *
   * Two lessons encoded here: assert against the artefact that ships, and
   * canary against the artefact too — a hand-written sample agreed with the
   * broken implementation because both were written from the same wrong
   * mental model.
   */
  const unqualifiedDisplayRules = (css, rowClass) => {
    const out = [];
    /* Strip comments so a commented-out example cannot be reported, and strip
       Astro's scoping attribute so selectors read the way they were authored.
       See the note above: not doing this made the whole rule inert. */
    const clean = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\[data-astro-cid-[\w-]+\]/g, '');
    /* Coarse rule split. Sufficient here because the declaration bodies in
       question contain no nested braces; at-rule preludes (@media …) have no
       `{` inside their selector text and are skipped by the class test. */
    for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectorList = m[1];
      const body = m[2];
      if (!/(^|[\s;])display\s*:/.test(`;${body}`)) continue;
      for (const sel of selectorList.split(',')) {
        const s = sel.trim();
        /* Must target this exact class, not a BEM sibling
           (`.scope-confirm__item-title` shares the prefix). */
        const targets = new RegExp(
          `\\${rowClass}(?![\\w-])`,
        ).test(s);
        if (!targets) continue;
        if (s.includes(':not([hidden])')) continue;
        if (/\[hidden\]/.test(s)) continue;
        out.push(`${s} { …${(body.match(/display\s*:\s*[^;]+/) ?? [''])[0]}… }`);
      }
    }
    return out;
  };

  for (const [label, html, rowClass] of surfaces) {
    const css = cssFor(html, label);
    if (css === null) continue;

    /* Half one: no unqualified layout rule on the row selector. A bare
       `.scope-confirm__item { display: flex }` is the exact defect. */
    const bareHits = unqualifiedDisplayRules(css, rowClass);
    if (bareHits.length > 0) {
      fail(
        'D5 hidden guard',
        `${label} emits an unqualified \`display:\` rule for ${rowClass} ` +
          `(${bareHits.length} occurrence(s)). \`hidden\` is only a UA-stylesheet ` +
          `\`display: none\`, so any author \`display\` on the same element ` +
          `defeats it — this exact mistake painted all ${DELIVERABLES.length} ` +
          `rows on a build whose DOM was completely correct. Qualify the rule ` +
          `with \`:not([hidden])\`. Offending selector(s): ` +
          bareHits.map((h) => `\`${h}\``).join('; '),
      );
    }

    /*
     * Half two: the !important backstop is present FOR THIS ROW CLASS.
     *
     * The first version tested the concatenated stylesheet for any
     * `[hidden]{display:none!important}` — and a canary showed it passing with
     * the backstop deleted, because Base.css carries an unrelated
     * `display:none!important` of its own and this page links Base.css. The
     * assertion was satisfied by a rule that has nothing to do with these
     * rows: a fail-open produced by checking a global for a local guarantee.
     *
     * So the selector must name the row class. Comment-stripped and
     * cid-stripped by the same normalisation as half one, so source-shaped and
     * emitted-shaped CSS both read the same way.
     */
    const normalised = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\[data-astro-cid-[\w-]+\]/g, '');
    const backstop = new RegExp(
      `\\${rowClass}(?![\\w-])\\[hidden\\][^{]*\\{[^}]*display\\s*:\\s*none\\s*!important`,
    );
    const backstopGrouped = new RegExp(
      `\\${rowClass}(?![\\w-])\\[hidden\\][^{]*,[^{]*\\{[^}]*display\\s*:\\s*none\\s*!important`,
    );
    if (!backstop.test(normalised) && !backstopGrouped.test(normalised)) {
      fail(
        'D5 hidden guard',
        `${label}'s emitted CSS has no \`${rowClass}[hidden] { display: none ` +
          `!important }\` backstop. The \`:not([hidden])\` qualification handles ` +
          `the selectors we know about; this backstop handles the next one ` +
          `someone adds. It must name ${rowClass} — a global ` +
          `\`display:none!important\` elsewhere in the bundle is not this ` +
          `guarantee.`,
      );
    }
  }
}

/* D6. The fee posture reaches both rendered pages.
 *
 * B7 checks the string exists in the module. This checks it survived into the
 * HTML a prospect reads. A page publishing 28 prices with the posture dropped
 * in a template edit is a misrepresentation that no type or lint error would
 * report.
 */
if (typeof FEE_POSTURE === 'string' && FEE_POSTURE.trim().length >= 20) {
  /* Compare on a distinctive fragment: the full sentence is HTML-escaped and
     may be line-wrapped by the compiler, so an exact match would be brittle
     for reasons unrelated to the claim. */
  const probe = FEE_POSTURE.replace(/\s+/g, ' ').trim().slice(0, 40);
  const normalise = (s) => s.replace(/\s+/g, ' ');
  for (const [label, html] of [['/services', servicesHtml], ['/contact', contactHtml]]) {
    if (!normalise(html).includes(probe)) {
      fail(
        'D6 fee posture rendered',
        `${label} does not contain the fee posture ("${probe}…"). Publishing ` +
          `prices without the sentence that makes them a FLOOR turns an ` +
          `estimate into an implied invoice.`,
      );
    }
  }
}

/* D7. No cart language anywhere on either surface.
 *
 * A deliberate posture constraint, gated because it is the thing most likely
 * to erode by well-intentioned copy edits. This is an "assemble a scope"
 * interaction that produces a BRIEFING REQUEST — not a checkout. A practice
 * selling traceable judgement cannot present a summed floor as a cart total;
 * "Total" in particular converts a floor into a promise, which is the one
 * thing every other rule in this file exists to prevent.
 */
{
  const BANNED = [
    ['add to cart', /\badd to cart\b/i],
    ['shopping cart', /\bshopping cart\b/i],
    ['checkout', /\bcheck\s?out\b/i],
    ['subtotal', /\bsub-?total\b/i],
    ['grand total', /\bgrand total\b/i],
    ['order total', /\border total\b/i],
    ['buy now', /\bbuy now\b/i],
  ];
  for (const [label, html] of [['/services', servicesHtml], ['/contact', contactHtml]]) {
    /*
     * Strip <script> and <style> so a minified bundle's identifiers cannot
     * produce a false positive on prose the reader never sees.
     *
     * But keep the ATTRIBUTES that are read TO a reader. A canary put
     * "Add to cart" in a `title=` and the first version of this rule missed
     * it, because stripping tags wholesale also strips the accessible name —
     * so the copy a screen-reader user hears, and the tooltip a mouse user
     * sees, were the one place cart language could survive the gate. Text
     * announced to a user is copy, whether or not it is rendered as a text
     * node.
     */
    const speakable = [...html.matchAll(
      /\b(?:title|aria-label|alt|placeholder|value)="([^"]*)"/gi,
    )].map((m) => m[1]).join(' ');
    const prose =
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ') + ` ${speakable}`;
    for (const [term, re] of BANNED) {
      if (re.test(prose)) {
        fail(
          'D7 posture',
          `${label} uses the word "${term}". This is an assemble-a-scope ` +
            `interaction producing a briefing request, not a checkout — and a ` +
            `summed floor labelled as a total converts an estimate into a ` +
            `promise. Say "${COST_LABEL}", "scope", "request".`,
        );
      }
    }
  }
}

/* ==================================================================== *
 * Coverage floor.
 *
 * The lesson from check-self-claims: a gate whose assertions all became
 * conditional reported 2/2 green having verified nothing the author wrote.
 * Here the equivalent risk is a shrinking catalogue — a DELIVERABLES trimmed
 * to one item would satisfy every rule above and prove almost nothing. The
 * floor is deliberately generous: it is a "did this collapse" tripwire, not a
 * product decision about how many things Sarif should sell.
 * ==================================================================== */
const MIN_DELIVERABLES = 12;
const MIN_LANES = 3;
if (DELIVERABLES.length < MIN_DELIVERABLES || LANES.length < MIN_LANES) {
  console.error(
    `${TAG} FAIL — the catalogue collapsed to ${DELIVERABLES.length} ` +
      `deliverable(s) across ${LANES.length} lane(s); the floor is ` +
      `${MIN_DELIVERABLES}/${MIN_LANES}.\n\n` +
      `    This is a tripwire, not a target. Every rule in this file iterates ` +
      `the catalogue,\n    so a catalogue reduced to a handful of items would ` +
      `pass with almost nothing\n    verified — the same fail-open that let a ` +
      `hollowed-out eng-006 pass 2/2 green.\n    If the offering genuinely ` +
      `shrank, lower the floor deliberately in this file and\n    say why.`,
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ */
if (findings.length > 0) {
  console.error(
    `${TAG} FAIL — ${findings.length} finding(s) in the service catalogue:`,
  );
  for (const f of findings) console.error(`  \u2022 ${f}`);
  console.error(
    `\n  Every one of these describes a page that renders correctly. A ` +
      `deliverable that is\n  selectable but un-transmittable, a floor that ` +
      `omits unpriced work, or a shared\n  ?scope= URL that silently drops an ` +
      `item all look exactly like success from the\n  outside — which is why ` +
      `they are asserted here rather than left to review.`,
  );
  process.exit(1);
}

const { floor: totalFloor, quoteCount: totalQuotes } = scopeFloor(DELIVERABLES);
console.log(
  `${TAG} OK — ${DELIVERABLES.length} deliverable(s) across ${LANES.length} ` +
    `lane(s); codec round-trips ${DELIVERABLES.length}/${DELIVERABLES.length}; ` +
    `4 wire shapes converge; catalogue floor ${usd(totalFloor)} + ` +
    `${totalQuotes} quoted on scope; worst-case brief ` +
    `${maxScopeBriefLength()} chars; both surfaces render every sku`,
);
