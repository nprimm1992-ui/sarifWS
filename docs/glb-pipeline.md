# glTF / GLB optimization (Meshopt)

Large lobby assets live under `public/*.glb`. The site loads them with `GLTFLoader` and `MeshoptDecoder` ([`src/scripts/lobby-scene.js`](../src/scripts/lobby-scene.js)).

**Naming:** Use URL-safe filenames only (kebab-case, no spaces or parentheses) so paths stay clean in CDNs, logs, and `PLANTER_CONFIG` — e.g. `terraced-garden-3d-model-low.glb`, not `model-(low).glb`.

## When to run

- After replacing or exporting new `.glb` files from Blender or other DCC tools.
- Before a production deploy if assets changed.

## Command

```bash
npm run optimize:glbs
```

This script runs `gltf-transform meshopt` on every `public/*.glb` **in place** (lossy only at floating-point quantization inside meshopt’s high-quality presets; visually inspect after a change).

The center lobby planter is referenced as `terraced-garden-3d-model-low.glb` in `PLANTER_CONFIG` — keep names URL-safe when adding files.

If `public/` has no `.glb` files (e.g. LFS-only checkout), the script exits successfully with a message.

## Optional next steps

- Inspect a file: `npx gltf-transform inspect public/your-model.glb`
- If models are **texture-heavy**, consider a separate pass with KTX2/Basis (`etc1s` / `uastc`) and add `KTX2Loader` in Three.js — only after measuring with `inspect`.

## Deploy

Cloudflare Pages serves `*.glb` with long cache headers ([`public/_headers`](../public/_headers)). After optimization, redeploy so clients fetch smaller payloads.
