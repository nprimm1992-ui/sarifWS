// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import rehypeLexiconLink from './src/lib/rehype-lexicon-link.mjs';

/* Build identifier — stamped into pose-memory snapshots and the client
 * search index so cross-deploy state can be invalidated on mismatch.
 * Ordering: Cloudflare Pages exposes CF_PAGES_COMMIT_SHA, most CI
 * providers expose GITHUB_SHA, and local `astro build` falls back to a
 * timestamp so repeated local rebuilds still generate distinct ids. */
const BUILD_ID =
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.BUILD_ID ||
  `dev-${Date.now()}`;

// https://astro.build/config
export default defineConfig({
  site: 'https://sarifconsulting.ai',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [
    mdx({
      rehypePlugins: [rehypeLexiconLink],
      remarkPlugins: [],
      gfm: true,
      smartypants: true,
    }),
    sitemap({
      filter: (page) => !page.includes('/lexicon') && !page.includes('/admin'),
    }),
  ],
  vite: {
    define: {
      /* Exposed to client bundles as `import.meta.env.BUILD_ID`. Used by
       * lobby-scene pose memory and the search-index consumers to detect
       * stale state after a deploy. Keep short — goes over the wire on
       * every page. */
      'import.meta.env.BUILD_ID': JSON.stringify(BUILD_ID),
    },
    build: {
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          /* Manual chunk policy:
           *
           *   - `three`: the WebGL toolkit lives in its own chunk because
           *     it is large (~165 KB gz at writing) and only loaded on
           *     idle by the lobby module. Keeping it isolated means a
           *     future page that doesn't import three at all (e.g. an
           *     admin route) will not bring it along.
           *   - `vendor`: every other node_modules import lands here.
           *
           *   Round 2026 — pruned dead chunk targets (mathjs / zod /
           *   fuse.js / chart.js / gsap). None of those packages are
           *   in package.json, so the regex never matched — but it
           *   bloated the function and signalled an inconsistent
           *   dependency story. If any of them are reintroduced in
           *   the future, add a dedicated branch here AND a real
           *   dependency entry; do not leave dead matchers behind.
           */
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]three[\\/]/.test(id) || /[\\/]three-stdlib[\\/]/.test(id)) {
              return 'three';
            }
            return 'vendor';
          },
        },
      },
    },
  },
});
