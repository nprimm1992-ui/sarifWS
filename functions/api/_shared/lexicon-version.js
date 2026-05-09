/**
 * Runtime mirror of src/lib/lexicon-version.ts.
 *
 * Why duplicated: Cloudflare Pages Functions do not share the Astro/TS
 * module graph; they compile as a separate Worker bundle. The cleanest
 * way to expose a single string constant without bespoke tsconfig paths
 * is to mirror it here with a loud reminder to keep values in lockstep.
 *
 * RULE: if you edit LEXICON_VERSION in src/lib/lexicon-version.ts, edit
 * it here too. The build does not enforce this — code review does.
 *
 * See src/lib/lexicon-version.ts for the full bumping policy.
 */
export const LEXICON_VERSION = '2026-04-v2';
