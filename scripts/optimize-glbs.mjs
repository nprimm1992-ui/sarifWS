/**
 * Apply EXT_meshopt_compression via gltf-transform (high-quality defaults).
 * Meshopt-compresses each public/*.glb in place.
 *
 * Run: npm run optimize:glbs
 * Requires: GLB sources present under public/
 *
 * Use URL-safe filenames (kebab-case; no spaces/parens) before committing — see docs/glb-pipeline.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const cli = path.join(root, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');

if (!fs.existsSync(cli)) {
  console.error('Missing @gltf-transform/cli. Run: npm install');
  process.exit(1);
}

if (!fs.existsSync(pub)) {
  console.error(`Missing public/: ${pub}`);
  process.exit(1);
}

const glbs = fs
  .readdirSync(pub)
  .filter((f) => f.endsWith('.glb'))
  .map((f) => path.join(pub, f));

if (glbs.length === 0) {
  console.log('No .glb files in public/ — nothing to optimize (add assets, then re-run).');
  process.exit(0);
}

for (const abs of glbs) {
  const before = fs.statSync(abs).size;
  const tmp = `${abs}.meshopt.tmp.glb`;
  console.log(`meshopt: ${path.basename(abs)} (${(before / 1024).toFixed(1)} KiB)…`);
  execFileSync(process.execPath, [cli, 'meshopt', abs, tmp], {
    cwd: root,
    stdio: 'inherit',
  });
  fs.renameSync(tmp, abs);
  const after = fs.statSync(abs).size;
  console.log(`  → ${(after / 1024).toFixed(1)} KiB (${((100 * after) / before).toFixed(1)}% of original)`);
}

console.log('Done. Commit updated .glb files; MeshoptDecoder is already wired in lobby-scene.js.');
