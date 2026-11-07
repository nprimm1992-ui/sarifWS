/**
 * Published corpus and priced catalogue for the public Jensen assistant.
 *
 * The site repo is the only lawful source. Jensen syncs the JSON these
 * builders produce. Drafts, admin pages, and external dossier links
 * (Gamma, Substack) are not documents.
 *
 * Paths resolve from process.cwd(), which is the site root for both
 * `astro build` and the corpus check. import.meta.url is not safe here:
 * Astro executes compiled chunks from dist/.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEXICON_VERSION } from './lexicon-version.ts';
import { DELIVERABLES, FEE_POSTURE, LANES, type Deliverable, type Lane } from './service-catalogue.ts';

export const PUBLIC_SITE_ORIGIN = 'https://sarifconsulting.ai';

const MIN_PROSE_CHARS = 40;

export interface CorpusDocument {
  url: string;
  title: string;
  section: string;
  body: string;
  content_hash: string;
}

export interface CorpusArtifact {
  source: 'Sarif Consulting';
  artifact: 'corpus';
  schemaVersion: 1;
  lexicon_version: string;
  version: string;
  count: number;
  documents: CorpusDocument[];
}

export interface CatalogueDeliverable {
  sku: string;
  lane: string;
  title: string;
  desc: string;
  kind: 'from' | 'tiered' | 'quote';
  from: number;
  tiers?: { label: string; price: number }[];
}

export interface CatalogueArtifact {
  source: 'Sarif Consulting';
  artifact: 'catalogue';
  schemaVersion: 1;
  lexicon_version: string;
  version: string;
  fee_posture: string;
  lanes: { id: string; title: string; summary: string; timeline: string }[];
  deliverables: CatalogueDeliverable[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function pageUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${PUBLIC_SITE_ORIGIN}${normalized}`;
}

function document(path: string, title: string, section: string, body: string): CorpusDocument {
  const text = body.replace(/\s+/g, ' ').trim();
  return {
    url: pageUrl(path),
    title: title.trim(),
    section,
    body: text,
    content_hash: sha256(text),
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function mdxToText(raw: string): string {
  const withoutFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, '');
  return stripHtml(withoutFrontmatter)
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function readFrontmatter(raw: string): string {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] ?? '';
}

function frontmatterValue(raw: string, key: string): string {
  const block = readFrontmatter(raw);
  const match = block.match(new RegExp(`^${key}:\\s*"([\\s\\S]*?)"\\s*$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

/** Visible copy plus long string literals. Drops class names, paths, and code. */
function extractPageProse(filePath: string): string {
  let raw = readFileSync(filePath, 'utf8');
  raw = raw.replace(/^---[\s\S]*?---\s*/, '');
  raw = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  raw = raw.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const pieces: string[] = [];
  const visible = raw.replace(/<[^>]+>/g, '\n').replace(/\{[^{}]*\}/g, '\n');
  for (const line of visible.split('\n')) {
    const text = stripHtml(line);
    if (text.length >= MIN_PROSE_CHARS) pieces.push(text);
  }
  const quoted = /(['"`])((?:\\.|(?!\1)[^\\]){40,}?)\1/g;
  for (const match of raw.matchAll(quoted)) {
    const text = stripHtml(match[2] ?? '').replace(/\\n/g, ' ').trim();
    if (text.length < MIN_PROSE_CHARS) continue;
    if (/^(https?:|\/|\.|src\/|#[0-9a-f]{3,})/i.test(text)) continue;
    if (/\b(function|const|import|return)\b/.test(text)) continue;
    pieces.push(text);
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const piece of pieces) {
    if (seen.has(piece)) continue;
    seen.add(piece);
    unique.push(piece);
  }
  return unique.join('\n\n');
}

function lexiconDocuments(): CorpusDocument[] {
  const dir = join(process.cwd(), 'src', 'content', 'lexicon');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const entry = JSON.parse(readFileSync(join(dir, name), 'utf8')) as {
        term?: string;
        termDisplay?: string;
        definition?: string;
        matters?: string;
        appears?: string;
        category?: string;
        status?: string;
      };
      if (entry.status === 'deprecated') return null;
      const id = name.replace(/\.json$/, '');
      const title = (entry.termDisplay || entry.term || id).trim();
      const body = [entry.definition, entry.matters, entry.appears].filter(Boolean).join('\n\n');
      return document(`/lexicon/#${id}`, title, entry.category || 'lexicon', body);
    })
    .filter((item): item is CorpusDocument => item !== null);
}

function praxisDocuments(): CorpusDocument[] {
  const dir = join(process.cwd(), 'src', 'content', 'praxis');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.mdx'))
    .sort()
    .map((name) => {
      const raw = readFileSync(join(dir, name), 'utf8');
      if (/^draft:\s*true\s*$/m.test(readFrontmatter(raw))) return null;
      const id = name.replace(/\.mdx$/, '');
      const title = frontmatterValue(raw, 'title') || id;
      const summary = frontmatterValue(raw, 'summary');
      const lens = frontmatterValue(raw, 'lens') || 'praxis';
      const body = [summary, mdxToText(raw)].filter(Boolean).join('\n\n');
      return document(`/praxis/${id}/`, title, lens, body);
    })
    .filter((item): item is CorpusDocument => item !== null);
}

function engagementDocuments(): CorpusDocument[] {
  const dir = join(process.cwd(), 'src', 'content', 'engagements');
  return readdirSync(dir)
    .filter((name) => /^eng-\d+\.json$/.test(name))
    .sort()
    .map((name) => {
      const entry = JSON.parse(readFileSync(join(dir, name), 'utf8')) as {
        classification?: string;
        sector?: string;
        leads?: string[];
        highlights?: string[];
      };
      const id = name.replace(/\.json$/, '');
      const body = [...(entry.leads ?? []), ...(entry.highlights ?? [])].map(stripHtml).join('\n\n');
      return document(`/engagements/${id}/`, entry.classification || id, entry.sector || 'engagement', body);
    });
}

function servicesDocument(): CorpusDocument {
  const lines = [
    'Four practice areas. One methodology. Every engagement is produced through the same AI meta-orchestration framework. The output type changes. The traceable depth does not.',
    FEE_POSTURE,
    'Published prices are floors for a defined scope, not invoices. A quote-kind deliverable has no published number.',
    ...LANES.map((lane) => `${lane.title}. ${lane.summary} Timeline: ${lane.timeline}.`),
    ...DELIVERABLES.map((item) => priceLine(item)),
  ];
  return document('/services/', 'Augmented Services', 'services', lines.join('\n\n'));
}

function priceLine(item: Deliverable): string {
  if (item.kind === 'quote' || item.from === 0) {
    return `${item.title} (${item.sku}): ${item.desc} Quoted. No published floor.`;
  }
  if (item.kind === 'tiered' && item.tiers?.length) {
    const ladder = item.tiers.map((tier) => `${tier.label} $${tier.price.toLocaleString('en-US')}`).join(', ');
    return `${item.title} (${item.sku}): ${item.desc} From $${item.from.toLocaleString('en-US')}. Tiers: ${ladder}.`;
  }
  return `${item.title} (${item.sku}): ${item.desc} From $${item.from.toLocaleString('en-US')}.`;
}

function staticDocuments(): CorpusDocument[] {
  const pages: Array<{ file: string; path: string; title: string; section: string }> = [
    { file: 'about.astro', path: '/about/', title: 'About Sarif', section: 'about' },
    { file: 'contact.astro', path: '/contact/', title: 'Establish Contact', section: 'contact' },
    { file: 'privacy.astro', path: '/privacy/', title: 'Privacy', section: 'privacy' },
    { file: 'terms.astro', path: '/terms/', title: 'Terms of Service', section: 'terms' },
    { file: 'accessibility.astro', path: '/accessibility/', title: 'Accessibility', section: 'accessibility' },
  ];
  return pages.map((page) => {
    const body = extractPageProse(join(process.cwd(), 'src', 'pages', page.file));
    return document(page.path, page.title, page.section, body);
  });
}

export function buildCorpus(): CorpusArtifact {
  const documents = [
    ...lexiconDocuments(),
    ...praxisDocuments(),
    ...engagementDocuments(),
    servicesDocument(),
    ...staticDocuments(),
  ].sort((a, b) => a.url.localeCompare(b.url));
  const version = sha256(documents.map((item) => `${item.url}\n${item.content_hash}`).join('\n'));
  return {
    source: 'Sarif Consulting',
    artifact: 'corpus',
    schemaVersion: 1,
    lexicon_version: LEXICON_VERSION,
    version,
    count: documents.length,
    documents,
  };
}

function serializeDeliverable(item: Deliverable): CatalogueDeliverable {
  return {
    sku: item.sku,
    lane: item.lane,
    title: item.title,
    desc: item.desc,
    kind: item.kind,
    from: item.from,
    ...(item.tiers ? { tiers: item.tiers.map((tier) => ({ label: tier.label, price: tier.price })) } : {}),
  };
}

function serializeLane(lane: Lane) {
  return { id: lane.id, title: lane.title, summary: lane.summary, timeline: lane.timeline };
}

export function buildCatalogue(): CatalogueArtifact {
  const lanes = LANES.map(serializeLane);
  const deliverables = DELIVERABLES.map(serializeDeliverable);
  const version = sha256(JSON.stringify({ lanes, deliverables, fee: FEE_POSTURE }));
  return {
    source: 'Sarif Consulting',
    artifact: 'catalogue',
    schemaVersion: 1,
    lexicon_version: LEXICON_VERSION,
    version,
    fee_posture: FEE_POSTURE,
    lanes,
    deliverables,
  };
}

export function assertPublicArtifacts(corpus: CorpusArtifact, catalogue: CatalogueArtifact): void {
  const problems: string[] = [];
  const urls = new Set<string>();
  if (corpus.documents.length === 0) problems.push('corpus has no documents');
  for (const item of corpus.documents) {
    let host = '';
    try {
      host = new URL(item.url).host;
    } catch {
      problems.push(`invalid url ${item.url}`);
      continue;
    }
    if (host !== 'sarifconsulting.ai') problems.push(`off-site url ${item.url}`);
    if (!item.body.trim()) problems.push(`empty body ${item.url}`);
    if (item.content_hash !== sha256(item.body)) problems.push(`hash mismatch ${item.url}`);
    if (urls.has(item.url)) problems.push(`duplicate url ${item.url}`);
    urls.add(item.url);
    if (/gamma\.app|substack\.com/i.test(item.url)) problems.push(`external dossier url ${item.url}`);
  }
  const skus = new Set<string>();
  if (catalogue.deliverables.length !== 28) {
    problems.push(`expected 28 deliverables, found ${catalogue.deliverables.length}`);
  }
  if (catalogue.lanes.length !== 4) problems.push(`expected 4 lanes, found ${catalogue.lanes.length}`);
  for (const item of catalogue.deliverables) {
    if (skus.has(item.sku)) problems.push(`duplicate sku ${item.sku}`);
    skus.add(item.sku);
    if (item.kind === 'quote' && item.from !== 0) problems.push(`quote sku ${item.sku} has a floor`);
    if (item.kind !== 'quote' && item.from <= 0) problems.push(`priced sku ${item.sku} has no floor`);
  }
  if (problems.length > 0) {
    throw new Error(`public corpus check failed:\n${problems.map((item) => `- ${item}`).join('\n')}`);
  }
}
