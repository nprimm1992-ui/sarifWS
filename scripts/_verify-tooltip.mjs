import { readFileSync } from 'node:fs';

const pages = [
  'dist/praxis/one-operator-one-intelligence-layer/index.html',
  'dist/praxis/what-the-matrix-metabolizes/index.html',
];

const re = (pattern, flags = 'g') => new RegExp(pattern, flags);

function count(html, pat) {
  const m = html.match(re(pat));
  return m ? m.length : 0;
}

for (const p of pages) {
  const html = readFileSync(p, 'utf8');
  const popoverIds = Array.from(html.matchAll(/id="(lex-pop-[a-z0-9-]+)"/gi)).map((m) => m[1]);
  const anchorTargets = Array.from(html.matchAll(/data-lex-target="(lex-pop-[a-z0-9-]+)"/gi)).map((m) => m[1]);
  const allTargetsResolveToIds = anchorTargets.every((t) => popoverIds.includes(t));
  console.log(`${p.split('/').slice(-2)[0]}`);
  console.log(`  .lex-term wraps                : ${count(html, 'class="lex-term"')}`);
  console.log(`  data-lex-anchor anchors        : ${count(html, 'data-lex-anchor')}`);
  console.log(`  data-lex-popover surfaces      : ${count(html, 'data-lex-popover')}`);
  console.log(`  unique popover ids             : ${popoverIds.length}`);
  console.log(`  unique anchor targets          : ${anchorTargets.length}`);
  console.log(`  every anchor->popover resolves : ${allTargetsResolveToIds}`);
  console.log(`  role="tooltip" popovers        : ${count(html, 'role="tooltip"')}`);
  console.log(`  data-state="closed" defaults   : ${count(html, 'data-state="closed"')}`);
  console.log(`  lexicon script referenced      : ${/LexiconTermLink\.[A-Za-z0-9_]+\.js/.test(html) || html.includes('initLexiconPopovers') || count(html, 'data-lex-anchor') === 0}`);
  console.log('');
}
