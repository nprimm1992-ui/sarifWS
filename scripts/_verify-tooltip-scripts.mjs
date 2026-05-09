import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const htmlPath = 'dist/praxis/one-operator-one-intelligence-layer/index.html';
const html = readFileSync(htmlPath, 'utf8');

const externalScripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)).map((m) => m[1]);
const inlineScripts = html.match(/<script\b[^>]*>[^<]*<\/script>/g) || [];

console.log('External scripts in article HTML:');
for (const src of externalScripts) console.log('  ' + src);
console.log('');
console.log('Inline <script> count:', inlineScripts.length);
console.log('');

// Find the lexicon-popover bundle on disk.
const astroDir = 'dist/_astro';
const astroFiles = readdirSync(astroDir).filter((f) => f.endsWith('.js'));
const lexFiles = astroFiles.filter((f) => /LexiconTermLink/i.test(f));
console.log('Files in dist/_astro matching LexiconTermLink:');
for (const f of lexFiles) console.log('  _astro/' + f);

// Look for the lexicon IIFE code fingerprint in any bundle referenced by page.
const fingerprint = 'initLexiconPopovers';
const hits = [];
for (const src of externalScripts) {
  const clean = src.replace(/^\//, '');
  try {
    const js = readFileSync(join('dist', clean), 'utf8');
    if (js.includes(fingerprint) || js.includes('data-lex-anchor')) {
      hits.push(src + '  (contains lexicon popover fingerprint)');
    }
  } catch {
    /* skip */
  }
}
console.log('');
console.log('Article JS bundles containing lexicon popover runtime:');
for (const h of hits) console.log('  ' + h);
if (hits.length === 0) console.log('  (none found — runtime is NOT loaded on this page)');
