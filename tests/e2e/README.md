# E2E smoke suite

Playwright-powered smoke tests that exercise the **production build**
of the Sarif Consulting marketing site. These are intentionally small,
fast, and resilient: the suite covers user-observable surface area that
changed across Round 3 (Pillars 7–9) and is meant to catch regressions
that unit tests cannot.

## Running locally

```bash
# one-time
npx playwright install chromium

# build + run
npm run build
npm run test:e2e
```

Set `PLAYWRIGHT_BASE_URL` to target an alternative preview URL (e.g.
a staging deploy). When the variable is set, Playwright does NOT start
its own `astro preview`.

## Scope (by test file)

| File                  | Covers                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| `nav-routes.spec.ts`  | Each top-level route renders, has an `h1`, and no console errors.      |
| `praxis.spec.ts`      | Praxis index → article navigation (P8b / P9c / P9d).                   |
| `palette.spec.ts`     | Cmd+K command palette opens and returns results (P9a).                 |
| `contact.spec.ts`     | Contact form renders and native validation catches blank submits (P7). |

## Design notes

- **No live form submissions**: the contact suite never POSTs — Turnstile
  and D1 are both hard to mock safely from a smoke test. We validate
  structure and client-side validation only.
- **No 3D asserts**: the lobby scene is verified to *mount* (canvas
  element present) but not rendered-pixel correctness. GL in CI
  environments is unreliable.
- **Retain traces on failure**: CI flake goes to Playwright's built-in
  HTML report (`playwright-report/`) for inspection.
