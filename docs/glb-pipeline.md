# glTF / GLB optimization (simplify + meshopt)

Large lobby assets live under `public/*.glb`. The site loads them with `GLTFLoader` and `MeshoptDecoder` ([`src/scripts/lobby-scene.js`](../src/scripts/lobby-scene.js)).

**Naming:** Use URL-safe filenames only (kebab-case, no spaces or parentheses) so paths stay clean in CDNs, logs, and `PLANTER_CONFIG` — e.g. `terraced-garden-3d-model-low.glb`, not `model-(low).glb`.

## When to run

- After replacing or exporting new `.glb` files from Blender or other DCC tools.
- Before a production deploy if assets changed.

## Command

```bash
npm run optimize:glbs
```

This runs a **full pipeline** on every `public/*.glb` **in place**:

1. **weld** — merge split vertices (required before simplify).
2. **simplify** — per-file ratio from [`scripts/glb-manifest.mjs`](../scripts/glb-manifest.mjs). Side Tripo planters use ~0.2; center garden and emblem use ~0.6.
3. **quantize** — 16-bit vertex attributes.
4. **meshopt** — `EXT_meshopt_compression` for wire delivery.

**Meshopt alone is not enough** for Tripo exports that already carry meshopt + WebP textures — geometry must be decimated first.

Per-file simplify ratios are defined in `scripts/glb-manifest.mjs`. Adjust ratios there if visual QA shows loss; re-run `npm run optimize:glbs`.

**Re-run safety:** `build:assets` invokes this script on every build. Assets already within per-file upload-vertex budgets are **skipped** so simplify is not applied twice (each pass would erode mesh fidelity). Replace a GLB from DCC or bump ratios in the manifest to force a fresh pass.

The script prints file sizes and upload-vertex counts when `gltf-transform inspect` is available.

The center lobby planter is referenced as `terraced-garden-3d-model-low.glb` in `PLANTER_CONFIG`.

If `public/` has no `.glb` files (e.g. LFS-only checkout), the script exits successfully with a message.

## Size budgets (postbuild gate)

[`scripts/check-glb-budget.mjs`](../scripts/check-glb-budget.mjs) enforces:

| Asset class | Budget |
|-------------|--------|
| Side planters (`concrete-planters`, `terraced-concrete-planter`) | ≤ 1.7 MB each |
| Center garden (`terraced-garden-3d-model-low`) | ≤ 1.0 MB |
| Emblem / other | ≤ 0.5 MB |

## Optional next steps

- Inspect a file: `npx gltf-transform inspect public/your-model.glb`
- If models are **texture-heavy**, consider KTX2/Basis and `KTX2Loader` — only after measuring with `inspect`.

## Visual QA

After optimization, verify on `/` (landing):

- All three planters visible at correct scale and orientation.
- Gold floor reflections read correctly.
- Wing emblem on landing (lazy load) unchanged.

## Deploy

Cloudflare Pages serves `*.glb` with long cache headers ([`public/_headers`](../public/_headers)). After optimization, redeploy so clients fetch smaller payloads.
