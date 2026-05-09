import { readFileSync } from 'node:fs';
const f = 'dist/_astro/ClientRouter.astro_astro_type_script_index_0_lang.D9IACsu4.js';
const s = readFileSync(f, 'utf8');

// Find the document-level click listener (not lenis's wrapper listener).
const re = /document\.addEventListener\("click"/g;
let m;
while ((m = re.exec(s)) !== null) {
  console.log(`\n=== document.addEventListener("click") @ ${m.index} ===`);
  console.log(s.substring(m.index, m.index + 2000));
}
