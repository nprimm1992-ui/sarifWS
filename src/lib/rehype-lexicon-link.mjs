/**
 * rehype-lexicon-link (P9b).
 *
 * Auto-wraps the first occurrence (per article) of each lexicon term in
 * Praxis MDX with a <LexiconTermLink term="..." />. The component renders a
 * dotted-underline link and, on hover/focus, a popover with the definition
 * plus up to 3 related terms.
 *
 * Rules:
 * - Case-insensitive word-boundary match.
 * - Skips <code>, <pre>, <a>, headings (h1..h6), <NoLex> guard, and any
 *   descendant of an already-linked term.
 * - Only the FIRST occurrence per article is wrapped to avoid visual noise.
 * - Term corpus is read synchronously at module load from
 *   src/content/lexicon/*.json — the same JSON that backs the collection.
 *
 * Stub-free: the plugin returns a transformer that runs per-document; the
 * term corpus lives at module scope so it's parsed once per build process.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const lexiconDir = join(__dirname, '..', 'content', 'lexicon');

/** @typedef {{ id: string; term: string; termDisplay?: string; extras: string[]; aka: string[]; status: 'active' | 'deprecated' }} TermRecord */

/** @returns {TermRecord[]} */
function loadLexiconCorpus() {
  let files;
  try {
    files = readdirSync(lexiconDir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out = /** @type {TermRecord[]} */ ([]);
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(lexiconDir, file), 'utf8'));
      const id = file.replace(/\.json$/i, '');
      const term = String(data.term ?? '').trim();
      if (!term) continue;
      const extras = Array.isArray(data.relatedTerms)
        ? data.relatedTerms.map((t) => String(t).trim()).filter(Boolean)
        : [];
      const aka = Array.isArray(data.aka)
        ? data.aka.map((t) => String(t).trim()).filter(Boolean)
        : [];
      const status = data.status === 'deprecated' ? 'deprecated' : 'active';
      out.push({ id, term, termDisplay: data.termDisplay, extras, aka, status });
    } catch {
      /* skip malformed entries; lint should catch them elsewhere */
    }
  }
  return out;
}

/* Deprecated entries are excluded from auto-linking so prose in
   Praxis articles doesn't grow new links to retired vocabulary. The
   entry page itself stays reachable by anchor for citation stability;
   we just stop planting new pointers at it. */
const TERM_CORPUS = loadLexiconCorpus()
  .filter((rec) => rec.status !== 'deprecated')
  .flatMap((rec) => {
    const aliases = [rec.term, ...(rec.extras ?? []), ...(rec.aka ?? [])];
    if (rec.termDisplay && !aliases.includes(rec.termDisplay)) {
      // Use only the lead-in portion of the display string (before " — ").
      const lead = rec.termDisplay.split(' — ')[0].trim();
      if (lead && !aliases.includes(lead)) aliases.push(lead);
    }
    /* Dedupe aliases that differ only by casing / extra whitespace to
       keep the regex list tight. Case-insensitive match is handled
       later by the /i flag; dropping dupes here reduces per-text-node
       regex work from O(aliases) to O(unique aliases). */
    const seen = new Set();
    const unique = [];
    for (const alias of aliases) {
      const key = alias.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(alias);
    }
    return unique.map((alias) => ({ id: rec.id, alias }));
  })
  // Sorted longest-first so multi-word terms win over their tokens.
  .sort((a, b) => b.alias.length - a.alias.length);

const SKIP_TAGS = new Set(['code', 'pre', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const SKIP_COMPONENTS = new Set(['LexiconTermLink', 'NoLex', 'Callout', 'Pullquote']);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A HAST node factory for the <LexiconTermLink term="..."> MDX JSX element.
 * MDX AST nodes use type 'mdxJsxTextElement' with name + attributes.
 */
function createLexiconJsx(termAlias, originalText) {
  return {
    type: 'mdxJsxTextElement',
    name: 'LexiconTermLink',
    attributes: [
      {
        type: 'mdxJsxAttribute',
        name: 'term',
        value: termAlias,
      },
    ],
    children: [{ type: 'text', value: originalText }],
  };
}

export default function rehypeLexiconLink() {
  return (tree) => {
    if (!TERM_CORPUS.length) return;
    const linkedPerArticle = new Set();

    /**
     * Visit every text node in the tree, skipping banned ancestors, and
     * replace the first match of each lexicon term with a JSX wrapper.
     */
    function visit(node, ancestorsSkip) {
      if (!node) return;
      const tag = node.tagName ?? node.name;
      const nextSkip =
        ancestorsSkip ||
        SKIP_TAGS.has(tag) ||
        SKIP_COMPONENTS.has(tag) ||
        (node.type === 'mdxJsxFlowElement' && SKIP_COMPONENTS.has(node.name)) ||
        (node.type === 'mdxJsxTextElement' && SKIP_COMPONENTS.has(node.name));

      if (!Array.isArray(node.children)) return;

      const newChildren = [];
      for (const child of node.children) {
        if (nextSkip || child.type !== 'text' || typeof child.value !== 'string') {
          visit(child, nextSkip);
          newChildren.push(child);
          continue;
        }

        // Try to match any not-yet-linked term inside this text node.
        let text = child.value;
        const segments = [];
        let matchedAny = false;

        for (const { id, alias } of TERM_CORPUS) {
          if (linkedPerArticle.has(id)) continue;
          const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
          const m = text.match(re);
          if (!m || m.index === undefined) continue;

          const before = text.slice(0, m.index);
          const matched = text.slice(m.index, m.index + m[0].length);
          const after = text.slice(m.index + m[0].length);

          if (before) segments.push({ type: 'text', value: before });
          segments.push(createLexiconJsx(alias, matched));

          text = after;
          linkedPerArticle.add(id);
          matchedAny = true;
          // continue looking in the trailing segment for other, distinct terms
        }

        if (matchedAny) {
          if (text) segments.push({ type: 'text', value: text });
          newChildren.push(...segments);
        } else {
          newChildren.push(child);
        }
      }
      node.children = newChildren;
    }

    visit(tree, false);
    linkedPerArticle.clear();
  };
}
