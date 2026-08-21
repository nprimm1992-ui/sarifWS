/**
 * service-catalogue — the single source of truth for what Sarif sells.
 *
 * WHY THIS IS A MODULE AND NOT PART OF services.astro
 * ---------------------------------------------------
 * `check-engagement-hero.mjs` (sentinel 11) validates that every engagement
 * dossier's practice chip deep-links to a real `#lane-<id>` anchor. It does
 * that by regex-scanning services.astro for `/^\s*id:\s*'([a-z0-9-]+)',/gm`
 * and treating every hit as a practice lane.
 *
 * That parser is correct for four lanes. It is catastrophically wrong the
 * moment a 28-entry priced catalogue lands in the same file: every deliverable
 * `id:` would be read as a practice lane, the lane set would balloon from 4 to
 * 32, and the chip-integrity assertion would start passing for ids that are
 * not lanes at all. The gate would stay green while measuring the wrong thing —
 * the exact fail-open species this repo has now found eight times.
 *
 * This was verified empirically before the file was written, not assumed:
 * running that regex over a mixed `lanes[] + catalogue[]` source returns
 * `['strategic-intelligence', 'strategic-diagnostic']`. So the catalogue lives
 * here, physically outside the file the sentinel scans, and the deliverable key
 * is deliberately named `sku` rather than `id` so that even if these two files
 * were ever merged by a future refactor, the lane parser still could not
 * mistake a deliverable for a lane.
 *
 * WHY `sku` AND NOT `id`
 * ---------------------
 * Belt and braces, as above. It also reads correctly: a lane is a practice
 * area with an anchor, a deliverable is a purchasable unit of scope.
 *
 * PRICING POSTURE
 * ---------------
 * Every price here is a FLOOR, not a quote. The operator's own sales collateral
 * states: "All engagements are fixed-fee with defined scope. No hourly billing.
 * No surprise costs." Two consequences the UI must honour:
 *
 *   1. `from` is the entry price for that deliverable at its simplest defined
 *      scope. Presenting a summed total as if it were an invoice would convert
 *      a floor into a promise, so the assembly UI reports a FLOOR ("from $X"),
 *      never a total.
 *   2. `kind: 'quote'` deliverables have no published number. They are counted
 *      in a selection but contribute 0 to the floor, and the UI must say so
 *      rather than silently under-reporting.
 *
 * A `kind: 'tiered'` deliverable publishes several defined scopes at once
 * (Strategic Deck Design: Refresh / Build / Full Suite). Its `from` is the
 * lowest tier, and `tiers` carries the full ladder for display.
 */

/** The four practice lanes. These ids are a CONTRACT — see LANE_IDS below. */
export type LaneId =
  | 'strategic-intelligence'
  | 'digital-production'
  | 'brand-positioning'
  | 'content-media';

/**
 * Lane ids are frozen. They appear in:
 *   - src/content.config.ts SERVICE_LANES (Zod enum for dossier `services[]`)
 *   - all six engagement dossiers' `services` arrays
 *   - src/pages/engagements/[slug].astro chip label map
 *   - the `#lane-<id>` anchors that dossier chips deep-link to
 *
 * Renaming one silently breaks every chip that points at it (a fragment that
 * matches nothing is not an HTTP error). `digital-production` in particular is
 * NOT renamed to match its new display title — see LANES below.
 */
export const LANE_IDS: readonly LaneId[] = [
  'strategic-intelligence',
  'digital-production',
  'brand-positioning',
  'content-media',
] as const;

export type PriceKind = 'from' | 'tiered' | 'quote';

export interface Deliverable {
  /** Stable, URL-safe. Travels in `?scope=` so it is part of a public contract. */
  readonly sku: string;
  readonly lane: LaneId;
  readonly title: string;
  readonly desc: string;
  readonly kind: PriceKind;
  /** Floor in whole USD. `0` if and only if `kind === 'quote'`. */
  readonly from: number;
  /** Populated only when `kind === 'tiered'`. */
  readonly tiers?: readonly { readonly label: string; readonly price: number }[];
}

export interface Lane {
  readonly id: LaneId;
  readonly title: string;
  readonly summary: string;
  readonly timeline: string;
}

/**
 * NOTE ON THE `digital-production` TITLE
 * The operator's current sales collateral names this lane "Digital Platforms",
 * which is the better name: the lane sells engineered environments and
 * intelligence systems, not production services. The DISPLAY TITLE is therefore
 * "Digital Platforms" while the ID stays `digital-production`, because the id is
 * load-bearing across the dossier collection, the Zod enum and every practice
 * chip anchor. Title and id disagreeing is intentional and must stay commented,
 * or a future reader will "fix" the id and break six dossiers at once.
 */
export const LANES: readonly Lane[] = [
  {
    id: 'strategic-intelligence',
    title: 'Strategic Intelligence',
    summary: 'Complete strategic architectures for organizations at every level.',
    timeline: '7–21 days depending on scope',
  },
  {
    id: 'digital-production',
    title: 'Digital Platforms',
    summary: 'Engineered digital environments and intelligence systems.',
    timeline: '7–28 days depending on scope',
  },
  {
    id: 'brand-positioning',
    title: 'Brand & Positioning',
    summary: 'Materials that reframe perception for the people who decide.',
    timeline: '3–10 days',
  },
  {
    id: 'content-media',
    title: 'Content & Media',
    summary: 'Production-grade content built to compound.',
    timeline: '3–14 days per deliverable',
  },
] as const;

/**
 * The 28 deliverables, transcribed from the operator's rate card.
 *
 * Prices are the operator's own published figures. They are NOT to be adjusted,
 * rounded or "tidied" — a rate card that disagrees with the collateral it was
 * taken from is worse than no rate card, and `check-service-catalogue.mjs`
 * asserts the corpus-wide totals so a silent edit fails the build.
 */
export const DELIVERABLES: readonly Deliverable[] = [
  // ── Strategic Intelligence ───────────────────────────────────────────
  {
    sku: 'strategic-diagnostic',
    lane: 'strategic-intelligence',
    title: 'Strategic Diagnostic',
    desc: 'Focused strategic audit with prioritized action plan.',
    kind: 'from',
    from: 1500,
  },
  {
    sku: 'ai-implementation-audit',
    lane: 'strategic-intelligence',
    title: 'AI Implementation Audit',
    desc: 'Assessment of existing AI investments — what to keep, what to cut, and how to capture actual ROI.',
    kind: 'from',
    from: 2500,
  },
  {
    sku: 'market-research',
    lane: 'strategic-intelligence',
    title: 'Market Research & Competitive Landscape',
    desc: 'Deep environmental scan with strategic positioning recommendations.',
    kind: 'from',
    from: 1500,
  },
  {
    sku: 'financial-modeling',
    lane: 'strategic-intelligence',
    title: 'Financial Modeling & Scenario Analysis',
    desc: 'Custom financial models with multi-scenario projections.',
    kind: 'from',
    from: 2000,
  },
  {
    sku: 'implementation-roadmap',
    lane: 'strategic-intelligence',
    title: 'Implementation Roadmap',
    desc: 'Week-by-week execution sequencing for strategic initiatives.',
    kind: 'from',
    from: 1500,
  },
  {
    sku: 'policy-playbook',
    lane: 'strategic-intelligence',
    title: 'Policy Playbook or Strategic Memo',
    desc: 'Multi-jurisdiction policy frameworks and strategic memos for boards or stakeholders.',
    kind: 'from',
    from: 1500,
  },
  {
    sku: 'forensic-analysis',
    lane: 'strategic-intelligence',
    title: 'Forensic Document or Regulatory Analysis',
    desc: 'Deep document analysis identifying gaps, risks, and strategic opportunities.',
    kind: 'from',
    from: 2500,
  },
  {
    sku: 'grant-strategy',
    lane: 'strategic-intelligence',
    title: 'Grant Strategy & Institutional Development',
    desc: 'Grant landscape analysis, application strategy, and institutional fundraising architecture.',
    kind: 'from',
    from: 1500,
  },
  {
    sku: 'due-diligence',
    lane: 'strategic-intelligence',
    title: 'Due Diligence Research Package',
    desc: 'Comprehensive research packages for investment, partnership, or strategic decisions.',
    kind: 'from',
    from: 2500,
  },

  // ── Digital Platforms (id: digital-production) ───────────────────────
  {
    sku: 'ai-operations-layer',
    lane: 'digital-production',
    title: 'AI-Augmented Operations Layer',
    desc: 'Custom workflow systems connecting your existing tools, built on portable protocols.',
    kind: 'quote',
    from: 0,
  },
  {
    sku: 'web-platform',
    lane: 'digital-production',
    title: 'Website & Interactive Platform',
    desc: 'Performance-optimized web platforms with custom functionality.',
    kind: 'from',
    from: 5000,
  },
  {
    sku: 'interactive-dashboard',
    lane: 'digital-production',
    title: 'Interactive Dashboard or Data Visualization',
    desc: 'Custom dashboards turning data into decisions.',
    kind: 'from',
    from: 3500,
  },
  {
    sku: 'digital-twin',
    lane: 'digital-production',
    title: 'Digital Twin or 3D Modeling',
    desc: 'Personal, organizational, or spatial digital twins for strategic and operational use.',
    kind: 'quote',
    from: 0,
  },
  {
    sku: 'spatial-experience',
    lane: 'digital-production',
    title: 'Interactive Presentation or Spatial Experience',
    desc: 'Immersive presentations and experiential design using WebGL and modern frameworks.',
    kind: 'from',
    from: 3500,
  },

  // ── Brand & Positioning ─────────────────────────────────────────────
  {
    sku: 'brand-positioning-system',
    lane: 'brand-positioning',
    title: 'Brand Positioning System',
    desc: 'Voice architecture, strategic narrative, messaging hierarchy, content system, and implementation specs.',
    kind: 'from',
    from: 5000,
  },
  {
    sku: 'strategic-deck',
    lane: 'brand-positioning',
    title: 'Strategic Deck Design',
    desc: 'Investor, board, and sales decks built to decide things.',
    kind: 'tiered',
    from: 500,
    tiers: [
      { label: 'Refresh', price: 500 },
      { label: 'Build', price: 1500 },
      { label: 'Full Suite', price: 3500 },
    ],
  },
  {
    sku: 'executive-brief',
    lane: 'brand-positioning',
    title: 'One-Pager or Executive Brief',
    desc: 'Decision-ready strategic briefs combining writing and design.',
    kind: 'from',
    from: 300,
  },
  {
    sku: 'voice-narrative-architecture',
    lane: 'brand-positioning',
    title: 'Voice & Narrative Architecture',
    desc: 'Tone, register, vocabulary, and storytelling frameworks for the organization.',
    kind: 'from',
    from: 2500,
  },
  {
    sku: 'brand-identity-brief',
    lane: 'brand-positioning',
    title: 'Brand Identity Brief',
    desc: 'Comprehensive brand identity documents serving as single source of truth for all creative work.',
    kind: 'from',
    from: 1500,
  },
  {
    sku: 'campaign-strategy',
    lane: 'brand-positioning',
    title: 'Campaign Strategy',
    desc: 'Strategic architecture for marketing, advocacy, or product launch campaigns.',
    kind: 'from',
    from: 2000,
  },
  {
    sku: 'brand-promo-video',
    lane: 'brand-positioning',
    title: 'Brand Promo Video',
    desc: 'Cinematic 30–90 second production with concept, script, and full delivery.',
    kind: 'from',
    from: 500,
  },
  {
    sku: 'ad-creative-set',
    lane: 'brand-positioning',
    title: 'Ad Creative Set',
    desc: 'Multi-platform campaign assets in multiple aspect ratios.',
    kind: 'from',
    from: 300,
  },
  {
    sku: 'long-form-article',
    lane: 'brand-positioning',
    title: 'Long-form Article or Essay',
    desc: 'Strategic writing, thought leadership, and ghostwritten executive content.',
    kind: 'from',
    from: 500,
  },

  // ── Content & Media ─────────────────────────────────────────────────
  {
    sku: 'voice-production',
    lane: 'content-media',
    title: 'Voice Production',
    desc: 'Brand-calibrated voice over, narration, and voice generation.',
    kind: 'from',
    from: 300,
  },
  {
    sku: 'podcast-production',
    lane: 'content-media',
    title: 'Podcast Production',
    desc: 'Concept through distribution-ready episode or series.',
    kind: 'from',
    from: 500,
  },
  {
    sku: 'social-content-campaign',
    lane: 'content-media',
    title: 'Social Content Campaign',
    desc: 'Coordinated multi-platform social content with strategic messaging.',
    kind: 'from',
    from: 500,
  },
  {
    sku: 'executive-content',
    lane: 'content-media',
    title: 'Executive Content (Ghostwritten)',
    desc: 'Long-form thought leadership written under client byline.',
    kind: 'from',
    from: 750,
  },
  {
    sku: 'technical-documentation',
    lane: 'content-media',
    title: 'Technical Documentation or White Paper',
    desc: 'Production-grade technical writing for product launches, fundraising, and B2B sales.',
    kind: 'from',
    from: 1500,
  },
] as const;

/** The commercial posture, stated once so every surface quotes it identically. */
export const FEE_POSTURE =
  'All engagements are fixed-fee with defined scope. No hourly billing. No surprise costs.';

/* ────────────────────────────────────────────────────────────────────────
   SCOPE ENCODING

   A selection is carried between /services/ and /contact/ in the URL as
   `?scope=sku-a|sku-b`. The pipe is the same separator praxis.astro already
   uses for its facet state (`?lens=a|b`), so the site has ONE convention for
   list-valued query params rather than two.

   Why the URL and not only sessionStorage: a URL-encoded selection is
   shareable. A prospect can send their assembled scope to a colleague, or
   return to it later. sessionStorage is used as a fallback carrier for the
   same-tab hop, but the URL is authoritative.

   Both functions are TOTAL — they never throw and never return unknown skus.
   An unrecognised sku in a hand-edited URL is dropped, not rendered, because
   the receiving page prints this list back to a human as a confirmed scope and
   must never echo attacker-controlled text.
   ──────────────────────────────────────────────────────────────────────── */

export const SCOPE_PARAM = 'scope';
export const SCOPE_SEP = '|';

const BY_SKU: ReadonlyMap<string, Deliverable> = new Map(
  DELIVERABLES.map((d) => [d.sku, d]),
);

/** Look up a deliverable, or `undefined`. Never throws. */
export function findDeliverable(sku: string): Deliverable | undefined {
  return BY_SKU.get(sku);
}

/**
 * Decode a `?scope=` value into real deliverables.
 *
 * Guarantees, all of which the receiving page depends on:
 *   - unknown skus are DROPPED (no echo of untrusted input)
 *   - duplicates are collapsed
 *   - output is ordered by the catalogue, not by the URL, so two prospects who
 *     pick the same set get an identical brief regardless of click order
 *   - a hostile or absurd input length cannot blow up the page
 */
export function decodeScope(raw: string | null | undefined): Deliverable[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  /* Hard cap before any splitting: the whole catalogue is 28 items, so a
     longer input is malformed or hostile and there is nothing to gain by
     parsing it. 2048 comfortably exceeds every legitimate selection. */
  if (raw.length > 2048) return [];
  const wanted = new Set(raw.split(SCOPE_SEP).filter(Boolean));
  return DELIVERABLES.filter((d) => wanted.has(d.sku));
}

/** Encode deliverables (or skus) into a `?scope=` value, catalogue-ordered. */
export function encodeScope(items: readonly (Deliverable | string)[]): string {
  const wanted = new Set(
    items.map((i) => (typeof i === 'string' ? i : i.sku)),
  );
  return DELIVERABLES.filter((d) => wanted.has(d.sku))
    .map((d) => d.sku)
    .join(SCOPE_SEP);
}

export interface ScopeFloor {
  /** Sum of published floors, in whole USD. */
  readonly floor: number;
  /** How many selected deliverables publish no price. */
  readonly quoteCount: number;
  readonly count: number;
}

/**
 * Compute the FLOOR of a selection — deliberately not called a "total".
 *
 * `quoteCount` is returned separately and must be surfaced in the UI. A floor
 * that silently omits two quote-only deliverables is a number that lies by
 * omission, which is precisely the failure mode Praxis No. 05 is about.
 */
export function scopeFloor(items: readonly Deliverable[]): ScopeFloor {
  let floor = 0;
  let quoteCount = 0;
  for (const d of items) {
    if (d.kind === 'quote') quoteCount += 1;
    else floor += d.from;
  }
  return { floor, quoteCount, count: items.length };
}

/** `1500` -> `"$1,500"`. Single formatter so no surface invents its own. */
export function usd(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

/** The price line for a card, derived rather than stored twice. */
export function priceLabel(d: Deliverable): string {
  if (d.kind === 'quote') return 'Contact for pricing';
  if (d.kind === 'tiered' && d.tiers) {
    return d.tiers.map((t) => usd(t.price)).join(' / ');
  }
  return `Starting at ${usd(d.from)}`;
}

/** Tier ladder label, e.g. `Refresh / Build / Full Suite`. */
export function tierLabel(d: Deliverable): string | null {
  if (d.kind !== 'tiered' || !d.tiers) return null;
  return d.tiers.map((t) => t.label).join(' / ');
}

export function deliverablesForLane(lane: LaneId): Deliverable[] {
  return DELIVERABLES.filter((d) => d.lane === lane);
}

/**
 * Decode a scope from a `URLSearchParams`, accepting BOTH wire shapes.
 *
 * WHY TWO SHAPES
 * The services page is a real `<form method="GET" action="/contact/">` with
 * real `<input type="checkbox" name="scope">` controls. That is deliberate:
 * checkbox semantics, keyboard operation and screen-reader announcement come
 * from the platform rather than from JavaScript that has to re-implement them,
 * and the page keeps working with scripting off.
 *
 * A native browser submit of repeated checkboxes produces:
 *     ?scope=web-platform&scope=strategic-diagnostic
 *
 * When JS is available it intercepts the submit and writes the canonical house
 * shape instead — the same pipe-separated convention praxis.astro already uses
 * for `?lens=a|b`, so list-valued params look the same everywhere on the site:
 *     ?scope=web-platform|strategic-diagnostic
 *
 * Both must decode, or the no-JS path becomes a route that silently loses the
 * user's selection. So this reads every `scope` param AND splits each on the
 * separator, which makes the two shapes — and any mixture of them — converge
 * on the same answer. Inherits every guarantee of `decodeScope`: total,
 * catalogue-ordered, deduplicated, unknown skus dropped.
 */
export function decodeScopeFromParams(
  params: URLSearchParams | null | undefined,
): Deliverable[] {
  if (!params) return [];
  const all = params.getAll(SCOPE_PARAM);
  if (all.length === 0) return [];
  /* Same hard cap as decodeScope, applied to the joined length so that many
     short params cannot bypass the single-param limit. */
  const joined = all.join(SCOPE_SEP);
  return decodeScope(joined);
}

/**
 * The scope block that rides inside the transmitted `signal`.
 *
 * WHY THIS IS PART OF THE SIGNAL AND NOT A FIELD OF ITS OWN
 * `functions/api/transmit.js` reads exactly four fields off the body —
 * `signal`, `name`, `email`, `organization` — and the `transmissions` table has
 * no column for anything else. An extra `scope` key in the POST body would be
 * accepted by the request, ignored by the handler, and never stored or emailed.
 * The prospect would see their scope confirmed on screen and it would arrive
 * nowhere. That is a fail-open, so the scope is composed into the one field
 * that is actually persisted and actually emailed.
 *
 * Kept here rather than in the page so that the services page, the contact
 * page, the mailto fallback and `check-service-catalogue.mjs` all agree on one
 * rendering. Two surfaces formatting the same brief differently is how a
 * "confirmed scope" stops matching what was sent.
 */
export const SCOPE_BRIEF_HEADING = 'Requested scope';

/**
 * The reader-facing label for the summed entry price.
 *
 * Exported so the services page, the contact page, the transmitted brief and
 * check-service-catalogue.mjs all say the SAME words. It was previously spelled
 * out in four places; changing the wording once meant finding all four, and the
 * gate caught the fourth — which is the argument for hoisting it here rather
 * than the argument for a looser assertion.
 */
export const COST_LABEL = 'Estimated cost';

export function formatScopeBrief(items: readonly Deliverable[]): string {
  if (items.length === 0) return '';
  const { floor, quoteCount } = scopeFloor(items);
  const lines = items.map((d) => `- ${d.title} (${priceLabel(d)})`);
  /* The estimate line names the quote-only count explicitly. An estimate that
     silently omits unpriced deliverables is a number that lies by omission.

     READER-FACING WORDING: "Estimated cost", not "Indicative floor". The
     earlier phrasing was accurate and unreadable — "indicative" is a word a
     prospect has to stop and parse, and copy that makes someone stop is copy
     that loses them. The MEANING is unchanged and still stated plainly right
     next to the number: this is a starting figure, the final fee is fixed in
     writing once scope is defined. Internal identifiers (`floor`,
     `scopeFloor`, `#scope-floor`) deliberately keep the precise engineering
     term — the arithmetic really is a floor, and renaming those would churn a
     load-bearing API to restate a copy decision. */
  let floorLine = `${COST_LABEL}: ${usd(floor)}`;
  if (quoteCount > 0) {
    floorLine +=
      ` plus ${quoteCount} deliverable${quoteCount === 1 ? '' : 's'} quoted on scope`;
  }
  return [`${SCOPE_BRIEF_HEADING} (${items.length}):`, ...lines, floorLine].join(
    '\n',
  );
}

/**
 * Upper bound on `formatScopeBrief` output, for budgeting the signal field.
 *
 * The contact page reduces the textarea's `maxlength` by this much so a long
 * message plus a scope block can never exceed the server's SIGNAL_MAX and 400
 * on the honest path. Computed from the real catalogue rather than guessed, so
 * adding a deliverable with a long title updates the budget automatically.
 */
export function maxScopeBriefLength(): number {
  return formatScopeBrief(DELIVERABLES).length;
}
