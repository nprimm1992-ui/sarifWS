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
      filter: (page) => !page.includes('/lexicon'),
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
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]three[\\/]/.test(id) || /[\\/]three-stdlib[\\/]/.test(id)) {
              return 'three';
            }
            if (/[\\/]gsap[\\/]/.test(id)) return 'gsap';
            if (/[\\/](mathjs|zod|fuse\.js|chart\.js)[\\/]/.test(id)) return 'libs';
            return 'vendor';
          },
        },
      },
    },
  },
});
