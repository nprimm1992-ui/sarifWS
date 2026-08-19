# Engagement specimen plates

Hero imagery for engagement dossiers lives here. Astro ignores directories
prefixed with `_`, so nothing in this folder is parsed as a content entry.

## Conventions

- **Name the file after the entry**: `eng-004.webp` for `eng-004.json`.
- **Reference it relatively** from the JSON, so Astro's `image()` helper can
  resolve and optimise it:

  ```json
  "heroImage": "./_images/eng-004.webp",
  "heroAlt": "Founder strategy blueprint spread across eight cross-referenced documents."
  ```

- **`heroImage` and `heroAlt` are required together.** Either both or neither.
  A lone `heroImage` renders nothing; a lone `heroAlt` is orphaned text.
  `scripts/check-engagement-hero.mjs` fails the build on both.
- **Aspect ratio**: the plate crops to 16:9 (`object-fit: cover`). Compose for
  that ratio or accept a centre crop.
- **Source width**: ship at least 1600px wide. Astro emits 600/960/1280/1600
  AVIF + WebP variants; it will not upscale.
- **Formats**: `.webp`, `.png`, `.jpg`, `.avif`, or `.svg`. Prefer WebP for
  photographic plates, SVG for diagrams.

See `handoff/ENGAGEMENTS-AUTHORING-PRIMER.md` for the full authoring contract.
