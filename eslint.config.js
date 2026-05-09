import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import tsParser from '@typescript-eslint/parser';

/**
 * Flat ESLint config for Sarif Consulting.
 *
 * Goals:
 *   - Catch undeclared globals and accidental shadowing in site JS.
 *   - Surface unused variables/imports (warn, not error — the repo has legacy
 *     ambient globals wired via Astro inline scripts that ESLint cannot fully
 *     see; warnings stay loud without blocking CI).
 *   - Lint .astro files with eslint-plugin-astro's recommended preset.
 *
 * Non-goals:
 *   - Enforcing stylistic rules (Prettier-adjacent). Keep churn low.
 *   - TypeScript rules beyond JS — `astro check` handles TS / Astro types.
 */
export default [
  {
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
      '.astro/**',
      'vendor/**',
      'public/ucim-visualizer/**',
      'playwright-report/**',
      'test-results/**',
      'tests/e2e/**',
    ],
  },

  js.configs.recommended,

  ...astro.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        history: 'readonly',
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        DeviceOrientationEvent: 'readonly',
        DeviceMotionEvent: 'readonly',
        MessageChannel: 'readonly',
        MessagePort: 'readonly',
        Worker: 'readonly',
        OffscreenCanvas: 'readonly',
        Image: 'readonly',
        queueMicrotask: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        AbortController: 'readonly',
        MutationObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        requestIdleCallback: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        HTMLElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLSelectElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        Blob: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        structuredClone: 'readonly',
        performance: 'readonly',
        // Service-side globals (Cloudflare Pages Functions, Node scripts)
        globalThis: 'readonly',
        Buffer: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-inner-declarations': 'off',
    },
  },

  {
    files: ['**/*.astro'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // Astro plugin handles scope; narrow warnings that would otherwise
      // misfire on template-only references.
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },

  {
    files: ['**/*.astro/*.ts', '**/*.astro/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
