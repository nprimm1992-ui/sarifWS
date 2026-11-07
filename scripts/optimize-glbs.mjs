/**
 * GLB optimization pipeline: weld → simplify → quantize → meshopt.
 *
 * Tripo side-planter exports are geometry-heavy; meshopt-only recompression
 * cannot shrink already-compressed assets. Per-file simplify ratios live in
 * scripts/glb-manifest.mjs.
 *
 * Run: npm run optimize:glbs
 * Requires: GLB sources present under public/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { profileForGlb, shouldSimplifyGlb } from './glb-manifest.mjs';

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
  .filter((f) => f.endsWith('.glb') && !f.includes('.tmp.'))
  .map((f) => path.join(pub, f));

if (glbs.length === 0) {
  console.log('No .glb files in public/ — nothing to optimize (add assets, then re-run).');
  process.exit(0);
}

/**
 * @param {string} input
 * @param {string} output
 * @param {string[]} args
 */
function runGltfTransform(input, output, args = []) {
  execFileSync(process.execPath, [cli, ...args, input, output], {
    cwd: root,
    stdio: 'inherit',
  });
}

/**
 * @param {string} abs
 * @returns {number | null}
 */
function inspectUploadVertices(abs) {
  try {
    const out = execFileSync(process.execPath, [cli, 'inspect', abs], {
      cwd: root,
      encoding: 'utf8',
    });
    /* gltf-transform prints a SCENES table; uploadVertexCount is the 7th column on row 0. */
    const rowMatch = out.match(/│\s*0\s*│[^│\n]*│[^│\n]*│[^│\n]*│[^│\n]*│\s*[\d,]+\s*│\s*([\d,]+)\s*│/);
    if (rowMatch) return Number(rowMatch[1].replace(/,/g, ''));
    /* Fallback for alternate inspect layouts. */
    const legacy = out.match(/uploadVertexCount[^│\n]*│\s*([\d,]+)/);
    if (legacy) return Number(legacy[1].replace(/,/g, ''));
    return null;
  } catch {
    return null;
  }
}

for (const abs of glbs) {
  const name = path.basename(abs);
  const before = fs.statSync(abs).size;
  const vertsBefore = inspectUploadVertices(abs);
  const { simplifyRatio, simplifyError } = profileForGlb(name);
  const runSimplify = shouldSimplifyGlb(name, vertsBefore);

  const weldPath = `${abs}.tmp.weld.glb`;
  const simpPath = `${abs}.tmp.simp.glb`;
  const quantPath = `${abs}.tmp.quant.glb`;
  const meshPath = `${abs}.tmp.meshopt.glb`;

  if (!runSimplify) {
    console.log(
      `optimize: ${name} (${(before / 1024).toFixed(1)} KiB` +
        (vertsBefore != null ? `, ${vertsBefore.toLocaleString()} upload verts` : '') +
        ') — skip (already within vertex budget; re-simplify would erode fidelity)',
    );
    continue;
  }

  console.log(
    `optimize: ${name} (${(before / 1024).toFixed(1)} KiB` +
      (vertsBefore != null ? `, ${vertsBefore.toLocaleString()} upload verts` : '') +
      `, simplify ratio ${simplifyRatio})…`,
  );

  try {
    runGltfTransform(abs, weldPath, ['weld']);
    runGltfTransform(weldPath, simpPath, [
      'simplify',
      '--ratio',
      String(simplifyRatio),
      '--error',
      String(simplifyError),
    ]);
    runGltfTransform(simpPath, quantPath, ['quantize']);
    runGltfTransform(quantPath, meshPath, ['meshopt']);
    fs.renameSync(meshPath, abs);
  } finally {
    for (const p of [weldPath, simpPath, quantPath, meshPath]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }

  const after = fs.statSync(abs).size;
  const vertsAfter = inspectUploadVertices(abs);
  console.log(
    `  → ${(after / 1024).toFixed(1)} KiB (${((100 * after) / before).toFixed(1)}% of original` +
      (vertsAfter != null ? `, ${vertsAfter.toLocaleString()} upload verts` : '') +
      ')',
  );
}

console.log('Done. Commit updated .glb files; MeshoptDecoder is wired in lobby-scene.js.');
