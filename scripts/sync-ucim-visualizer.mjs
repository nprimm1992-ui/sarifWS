/**
 * Copies CRA build output from vendor/sarif-ucim-visualizer/frontend/build
 * into Astro public/ucim-visualizer (served at /ucim-visualizer/*).
 */
import { cpSync, existsSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'vendor', 'sarif-ucim-visualizer', 'frontend', 'build');
const dest = join(root, 'public', 'ucim-visualizer');

if (!existsSync(src)) {
  console.error(
    'sync-ucim-visualizer: missing build folder.\n' +
      '  Run: npm run build:ucim\n' +
      `  Expected: ${src}`,
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });

function stripSourceMaps(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) stripSourceMaps(p);
    else if (name.endsWith('.map')) unlinkSync(p);
  }
}
stripSourceMaps(dest);

console.log(`sync-ucim-visualizer: copied → ${dest} (source maps stripped)`);
