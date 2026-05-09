/**
 * Post-build check: sitemap index and page sitemaps contain expected structure.
 * Run after `npm run build`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');

function read(name) {
  const p = path.join(dist, name);
  if (!fs.existsSync(p)) {
    console.error(`verify-sitemap: missing ${p}`);
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf8');
}

const indexXml = read('sitemap-index.xml');
if (!/<sitemapindex[\s>]/.test(indexXml) || !/<loc>/.test(indexXml)) {
  console.error('verify-sitemap: sitemap-index.xml missing sitemapindex or loc');
  process.exit(1);
}

const locs = [...indexXml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1].trim());
if (locs.length === 0) {
  console.error('verify-sitemap: no sitemap loc entries in index');
  process.exit(1);
}

for (const loc of locs) {
  const fileName = loc.split('/').pop();
  if (!fileName?.endsWith('.xml')) {
    console.error('verify-sitemap: unexpected loc', loc);
    process.exit(1);
  }
  const pageXml = read(fileName);
  if (!/<urlset[\s>]/.test(pageXml) || !/<loc>/.test(pageXml)) {
    console.error(`verify-sitemap: ${fileName} missing urlset or loc`);
    process.exit(1);
  }
}

console.log('verify-sitemap: OK (%d sitemap(s))', locs.length);
