import { readFileSync } from 'node:fs';
const js = readFileSync('dist/_astro/LexiconTermLink.astro_astro_type_script_index_0_lang.C158UrEv.js', 'utf8');

const checks = {
  'IIFE wrapper present': /\(function|\(\(\)\s*=>|\(\(\)/.test(js),
  'showPopover call': /\.showPopover\s*\(/.test(js),
  'hidePopover call': /\.hidePopover\s*\(/.test(js),
  'sets popover attribute to manual': /setAttribute\(["']popover["'],\s*["']manual["']\)/.test(js) || /"popover","manual"/.test(js),
  'data-lex-popover selector': js.includes('data-lex-popover'),
  'data-lex-anchor selector': js.includes('data-lex-anchor'),
  'data-lex-close selector': js.includes('data-lex-close'),
  'pointerenter listener': js.includes('pointerenter'),
  'pointerleave listener': js.includes('pointerleave'),
  'focusin listener': js.includes('focusin'),
  'focusout listener': js.includes('focusout'),
  'click listener': /addEventListener\(["']click["']/.test(js),
  'keydown listener': /addEventListener\(["']keydown["']/.test(js),
  'Escape key handling': /Escape/.test(js),
  'Tab focus-trap handling': /["']Tab["']/.test(js),
  'astro:page-load rebind': js.includes('astro:page-load'),
  'astro:before-preparation cleanup': js.includes('astro:before-preparation'),
  'viewport flip (data-lex-flip)': js.includes('data-lex-flip'),
  'resize reposition': /addEventListener\(["']resize["']/.test(js),
  'inert attribute managed': js.includes('inert'),
  'aria-describedby managed': js.includes('aria-describedby'),
  'aria-expanded managed': js.includes('aria-expanded'),
};

const maxLen = Math.max(...Object.keys(checks).map((k) => k.length));
let allOk = true;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`  ${name.padEnd(maxLen)}  ${ok ? 'OK' : 'MISSING'}`);
  if (!ok) allOk = false;
}
console.log('');
console.log(allOk ? 'All runtime capabilities present.' : 'Some capabilities are missing from the bundle.');
