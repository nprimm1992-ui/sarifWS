import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Content collections for Sarif (Astro v6 loader-based).
 *
 * - lexicon: operational vocabulary (11 seed entries, migrated from src/pages/lexicon.astro).
 * - engagements: case dossiers (6 seed entries, migrated from src/pages/engagements.astro).
 * - praxis: long-form articles authored in MDX (seeded in Foundation F3).
 *
 * The `glob` loader uses filename (minus extension, slugified) as each entry's id.
 */

/**
 * Category taxonomy for lexicon entries.
 *
 * Rationale for the four bins (see docs/architecture/lexicon-taxonomy.md
 * if present; otherwise this comment is the spec):
 *   - doctrine   — what Sarif believes. Principles, problems, reframings.
 *   - substrate  — what Sarif runs on. Proprietary infrastructure.
 *   - discipline — how Sarif works. Standards applied on every deliverable.
 *   - engagement — how clients and audience meet Sarif. Public surfaces.
 *
 * Kept as a closed enum so the page renderer and palette don't have to
 * guess at display strings or validate free-form input at runtime.
 */
const LEXICON_CATEGORIES = ['doctrine', 'substrate', 'discipline', 'engagement'] as const;

const lexicon = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/lexicon' }),
  schema: z.object({
    num: z.string().regex(/^\d{2}$/),
    term: z.string().min(1),
    termDisplay: z.string().optional(),
    definition: z.string().min(1),
    matters: z.string().min(1),
    appears: z.string().min(1),
    related: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
        }),
      )
      .default([]),
    /**
     * Term strings the rehype-lexicon-link plugin (P9b) should auto-link
     * inside Praxis articles. Falls back to `term` + `termDisplay` when omitted.
     */
    relatedTerms: z.array(z.string().min(1)).optional(),
    /**
     * Closed-enum category controlling page grouping, palette badges and
     * filter chips. Optional on write (fails soft to "uncategorized" at
     * the graph layer) but every seeded entry must declare one.
     */
    category: z.enum(LEXICON_CATEGORIES).optional(),
    sort: z.number().int().optional(),
    tags: z.array(z.string().min(1)).optional(),
    /**
     * When the entry was last semantically reviewed. Rendered as a
     * "Revised <month> <year>" line on the expanded panel and feeds the
     * page-level max(lastReviewed) "updated" headline. ISO date string.
     */
    lastReviewed: z.coerce.date().optional(),
    /**
     * Lifecycle state:
     *   active     — canonical, auto-linked by rehype, default.
     *   deprecated — retained at its permalink for citation stability
     *                but excluded from auto-linking and from default
     *                palette results. Pair with `supersededBy` when a
     *                replacement exists.
     */
    status: z.enum(['active', 'deprecated']).default('active'),
    /**
     * Additional alias strings the rehype-lexicon-link plugin should
     * treat as matches for THIS entry (distinct from `relatedTerms`,
     * which point at other entries). Useful for acronym expansions
     * ("Universal Contextual Intelligence Matrix" → UCIM) and common
     * prose variants.
     */
    aka: z.array(z.string().min(1)).optional(),
    /**
     * When `status === 'deprecated'`, the id of the replacement entry.
     * Rendered as a redirect chip on the expanded panel.
     */
    supersededBy: z.string().optional(),
  }),
});

export type LexiconCategory = (typeof LEXICON_CATEGORIES)[number];
export { LEXICON_CATEGORIES };

const ENGAGEMENT_ACCENTS = [
  'policy',
  'civic',
  'venture',
  'founder',
  'education',
  'digital',
] as const;

const engagements = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/engagements' }),
  schema: ({ image }) =>
    z.object({
      num: z.string().regex(/^\d{3}$/),
      classification: z.string().min(1),
      sector: z.string().min(1),
      accent: z.enum(ENGAGEMENT_ACCENTS),
      statValue: z.string().min(1),
      statLabel: z.string().min(1),
      leads: z.array(z.string().min(1)).min(1),
      highlights: z.array(z.string().min(1)).min(1),
      heroImage: image().optional(),
      heroAlt: z.string().optional(),
      sort: z.number().int().optional(),
    }),
});

/**
 * Closed enum of call-to-action intents for the PraxisOutro surface.
 *   - read:  primary CTA = next related article (onward reading).
 *   - reach: primary CTA = /contact (inbound signal).
 *
 * The historical `retain` intent targeted an article-level email capture
 * form that has been removed from the site; authors should use `reach`
 * for any "reach out to the firm" framing and `read` for pure onward
 * navigation.
 */
const PRAXIS_INTENTS = ['read', 'reach'] as const;

const praxis = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/praxis' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1),
      /* Round-4 §3.7 — summary length guardrail.
         130–180 chars is the sweet spot for the /praxis grid cards
         (two lines at our base font size / line-height) and matches
         the twitter-card / linkedin summary length crawlers expect.
         Enforcing at schema time keeps authoring errors out of
         production instead of deferring to a postbuild warning. */
      summary: z
        .string()
        .min(130, {
          message:
            'Praxis summary should be at least 130 characters (two-line card fits best at 130-180).',
        })
        .max(180, {
          message:
            'Praxis summary should be at most 180 characters (twitter/linkedin truncate beyond this).',
        }),
      publishDate: z.coerce.date(),
      lens: z.string().min(1),
      horizon: z.string().min(1),
      phase: z.string().min(1),
      tags: z.array(z.string().min(1)).default([]),
      heroImage: image(),
      heroAlt: z.string().min(1),
      classification: z.string().optional(),
      relatedTerms: z.array(z.string().min(1)).optional(),
      relatedArticles: z.array(z.string().min(1)).optional(),
      outroIntent: z.enum(PRAXIS_INTENTS).default('reach'),
      draft: z.boolean().default(false),
    }),
});

export const collections = { lexicon, engagements, praxis };
