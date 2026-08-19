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

const findings = [];

if (!existsSync(DIR)) {
  console.log(`${TAG} SKIP — no engagements collection at src/content/engagements`);
  process.exit(0);
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

if (files.length === 0) {
  console.log(`${TAG} SKIP — engagements collection is empty`);
  process.exit(0);
}

const seenNums = new Map();
const seenSorts = new Map();
let heroCount = 0;

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

  /* --- 5. registry collisions ---------------------------------------- */
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
}

if (findings.length > 0) {
  console.error(`${TAG} FAIL — ${findings.length} finding(s):`);
  for (const f of findings) console.error(`  • ${f}`);
  process.exit(1);
}

console.log(
  `${TAG} OK — ${files.length} engagement(s); ${heroCount} with specimen plate; ` +
    `leads/highlights markup consistent; registry unique`,
);
