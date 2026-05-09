Optional lobby IBL (HDRI).

1. Add a Radiance .hdr at:  lobby-studio-source.hdr
2. Run:  npm run downsize:hdr
   (also runs automatically as part of npm run build via build:assets)

Outputs if source exists:
  lobby-studio.hdr         — desktop IBL
  lobby-studio-mobile.hdr  — mobile IBL

Without source HDR, the site uses a synthetic hemisphere environment; no extra network requests.
