/**
 * LEXICON_VERSION — corpus pointer stamped onto every /api/transmit row.
 *
 * Purpose: when Jensen later drafts a reply for a stored
 * transmission, this string tells us *which* lexicon state was active at the
 * moment of intake. That lets us reproduce, in git, exactly which concept set
 * was canonical when the signal was filed.
 *
 * Bumping policy (enforced by reviewer discipline, not tooling):
 *   BUMP when any of the following changes:
 *     1. The set of 11 lexicon entry IDs (adding, removing, or renaming).
 *     2. An entry's definition or status (e.g. "active" → "deprecated").
 *     3. Cross-references between entries in ways that change semantics.
 *
 *   DO NOT bump for:
 *     - Pure copy edits (typo fixes, voice tightening) that do not change the
 *       meaning of an entry.
 *     - Styling, layout, or rendering-order changes on /lexicon.
 *     - Adding non-semantic metadata (anchor IDs, reveal triggers).
 *
 * Format: YYYY-MM-v<N>. Month is the month of the bump; N resets per month.
 *
 * DUPLICATED in functions/api/_shared/lexicon-version.js for runtime use by
 * Cloudflare Pages Functions (which cannot cleanly import from src/). Keep
 * the two values in lockstep. See docs/api/pickup-contract.md §Lexicon for
 * downstream consumer expectations.
 */
export const LEXICON_VERSION = '2026-04-v2';
