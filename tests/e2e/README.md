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
- **`astro preview` runs NO Pages Functions.** It is a static file server.
  Every `POST /api/*` therefore 404s locally while working correctly in
  production (verified 204 under `npx wrangler pages dev dist`). This is why
  the suite runs a single lane against `astro preview` rather than a second
  Functions lane: no spec asserts on an API response, so a second lane would
  add CI time and a Wrangler dependency without covering anything new. If a
  spec ever *does* need a real API response, it must run under
  `wrangler pages dev dist` — `astro preview` would give it a false 404.
- **Resource failures are asserted on the network layer, not the console.**
  Chromium's console text for a failed request is
  `"Failed to load resource: the server responded with a status of 404 (Not Found)"`
  — with **no URL in it**. A text filter therefore cannot distinguish the two
  expected telemetry-beacon 404s from a genuinely missing CSS bundle, and the
  suite previously suppressed *all* 404s to tolerate the two it knew about.
  `nav-routes.spec.ts` now listens on `page.on('response')`, where URL, method
  and `resourceType` are available, and suppresses only
  `POST /api/*` beacons (`ping`/`fetch`/`xhr`). Every other `>=400` fails the
  test and names the offending URL. Verified by canary: deleting one
  `dist/_astro/*.css` fails 8 routes with
  `404 GET /_astro/Base.<hash>.css`, where the old filter passed silently.
- **No 3D asserts**: the lobby scene is verified to *mount* (canvas
  element present) but not rendered-pixel correctness. GL in CI
  environments is unreliable.
- **Retain traces on failure**: CI flake goes to Playwright's built-in
  HTML report (`playwright-report/`) for inspection.
