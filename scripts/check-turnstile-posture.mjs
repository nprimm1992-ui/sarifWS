#!/usr/bin/env node
/**
 * Sentinel: Turnstile build/runtime posture coherence.
 *
 * ── The defect this exists to prevent ────────────────────────────────────────
 *
 * The Turnstile site key is read from TWO DIFFERENT PLACES at two different
 * times, and nothing previously checked that they agreed:
 *
 *   src/pages/contact.astro   `import.meta.env.PUBLIC_TURNSTILE_SITE_KEY`
 *                             → read at BUILD time, from the shell that ran
 *                               `astro build`. Gates whether the widget markup
 *                               is emitted into dist/contact/index.html at all.
 *
 *   functions/api/transmit.js `env.PUBLIC_TURNSTILE_SITE_KEY`
 *                             → read at RUNTIME, from the Cloudflare Pages
 *                               dashboard bindings. Decides whether a token is
 *                               MANDATORY for a submission to be accepted.
 *
 * `npm run deploy` builds LOCALLY (`npm run build && wrangler pages deploy`),
 * so the build never sees the Pages dashboard. That makes this sequence not
 * merely possible but the DEFAULT outcome of following the deploy docs:
 *
 *   1. Operator sets PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY in the
 *      Cloudflare Pages dashboard, exactly as docs/deploy-contact.md says.
 *   2. Operator runs `npm run deploy` from a shell where neither is exported.
 *   3. contact.astro sees an empty site key → emits NO widget.
 *   4. transmit.js sees the site key present at runtime → a token is REQUIRED.
 *   5. No widget can ever produce a token, so EVERY submission is rejected
 *      `verification_missing` / HTTP 400.
 *
 * That is a silent, total contact-form outage: the only inbound channel on the
 * site, dead, with a green deploy and no error anywhere in the build log.
 *
 * transmit.js reasons carefully about the MIRROR case (secret absent, site key
 * present → `verification_unavailable`) but cannot detect this one, because a
 * Pages Function has no way to know what markup the frontend build emitted.
 * Only the build can catch it. Hence this gate.
 *
 * ── What is checked ─────────────────────────────────────────────────────────
 *
 *   A. Artifact coherence (ALWAYS fatal — this is a code defect, not config):
 *      the presence of widget markup in the built HTML must match whether the
 *      build environment supplied a site key. A mismatch means the gating
 *      expression in contact.astro broke.
 *
 *   B. Release safety (fatal only for release builds): a keyless build must
 *      not be deployed unless the operator explicitly declares that Turnstile
 *      is meant to be off, via TURNSTILE_POSTURE=disabled. Silence is not
 *      consent — "I forgot to export the key" and "I intend to ship without
 *      bot protection" must not look identical to the toolchain.
 *
 *   C. Half-configured build: a secret with no site key in the same build
 *      environment is always an operator error worth surfacing.
 *
 * A release build is one that is about to be published: `npm run deploy` sets
 * SARIF_RELEASE=1. CI builds are not published and stay advisory, so ordinary
 * contributors and `npm ci` runs are never blocked by a missing secret they
 * have no business holding.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CONTACT_HTML = join(ROOT, 'dist', 'contact', 'index.html');

/** Markers emitted by the `{turnstileSiteKey && (...)}` branch in contact.astro. */
const WIDGET_MARKER = 'turnstile-mount';
const SITEKEY_ATTR = 'data-sitekey';

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A release build is one whose output is about to be served to the public.
 * `npm run deploy` sets SARIF_RELEASE=1 so this gate can fail closed at the
 * exact boundary where the outage becomes real, without blocking dev builds.
 */
function isReleaseBuild() {
  return process.env.SARIF_RELEASE === '1';
}

function main() {
  const siteKey = trimmed(process.env.PUBLIC_TURNSTILE_SITE_KEY);
  const secret = trimmed(process.env.TURNSTILE_SECRET_KEY);
  const declaredPosture = trimmed(process.env.TURNSTILE_POSTURE).toLowerCase();

  /* Coverage floor. A sentinel that cannot find its subject must fail, not
     report success — measuring nothing and printing OK is the failure mode
     this whole family of gates exists to prevent. */
  if (!existsSync(CONTACT_HTML)) {
    console.error(
      '[check-turnstile-posture] FAIL — dist/contact/index.html not found.\n' +
        '  Either the contact route was removed/renamed, outDir moved, or this\n' +
        '  ran before `astro build`. This gate cannot verify the Turnstile\n' +
        '  posture without the built artifact, and passing without checking is\n' +
        '  exactly the fail-open it exists to prevent.',
    );
    process.exit(1);
  }

  const html = readFileSync(CONTACT_HTML, 'utf8');
  const hasWidget = html.includes(WIDGET_MARKER) && html.includes(SITEKEY_ATTR);

  /* ── A. Artifact coherence ─────────────────────────────────────────────── */
  if (siteKey && !hasWidget) {
    console.error(
      '[check-turnstile-posture] FAIL — PUBLIC_TURNSTILE_SITE_KEY was set for this\n' +
        `  build, but dist/contact/index.html contains no \`${WIDGET_MARKER}\` node.\n` +
        '  The widget-gating expression in src/pages/contact.astro is broken, so the\n' +
        '  challenge would never render while the server still demands a token —\n' +
        '  every contact submission would fail with `verification_missing`.',
    );
    process.exit(1);
  }

  if (!siteKey && hasWidget) {
    console.error(
      '[check-turnstile-posture] FAIL — no PUBLIC_TURNSTILE_SITE_KEY in the build\n' +
        `  environment, yet dist/contact/index.html emitted a \`${WIDGET_MARKER}\` node.\n` +
        '  A widget with an empty sitekey cannot issue a token. Either the gating\n' +
        '  expression regressed or the markup was hardcoded outside the guard.',
    );
    process.exit(1);
  }

  /* ── C. Half-configured build environment ─────────────────────────────── */
  if (secret && !siteKey) {
    console.error(
      '[check-turnstile-posture] FAIL — TURNSTILE_SECRET_KEY is present in this\n' +
        '  build environment but PUBLIC_TURNSTILE_SITE_KEY is not.\n' +
        '  The two keys are provisioned together and must be exported together.\n' +
        '  With only the secret, the frontend renders no widget while the server\n' +
        '  enforces verification — a guaranteed 400 on every submission.',
    );
    process.exit(1);
  }

  /* ── B. Release safety for keyless builds ─────────────────────────────── */
  if (!siteKey) {
    if (declaredPosture === 'disabled') {
      console.warn(
        '[check-turnstile-posture] WARN — building with Turnstile deliberately\n' +
          '  disabled (TURNSTILE_POSTURE=disabled). The contact form falls back to\n' +
          '  honeypot + origin allowlist + per-IP/per-email rate limits.\n' +
          '  IMPORTANT: PUBLIC_TURNSTILE_SITE_KEY must also be UNSET in the\n' +
          '  Cloudflare Pages dashboard, or the runtime will demand a token that\n' +
          '  this build emits no widget to produce.',
      );
      console.log(
        '[check-turnstile-posture] OK — keyless build, posture explicitly declared disabled.',
      );
      return;
    }

    if (isReleaseBuild()) {
      console.error(
        '[check-turnstile-posture] FAIL — this is a RELEASE build (SARIF_RELEASE=1)\n' +
          '  with no PUBLIC_TURNSTILE_SITE_KEY in the build environment, so\n' +
          '  dist/contact/index.html ships WITHOUT a Turnstile widget.\n' +
          '\n' +
          '  Why this is fatal rather than a warning: the site key is read at BUILD\n' +
          '  time by contact.astro but at RUNTIME by functions/api/transmit.js. If\n' +
          '  the Cloudflare Pages dashboard has PUBLIC_TURNSTILE_SITE_KEY set — as\n' +
          '  docs/deploy-contact.md instructs — the deployed server will REQUIRE a\n' +
          '  token that the deployed page can never produce. Result: a silent,\n' +
          '  total contact-form outage behind a green deploy.\n' +
          '\n' +
          '  Resolve by choosing one, explicitly:\n' +
          '    • Turnstile ON  — export both keys into the deploying shell so the\n' +
          '                      widget is baked in and matches the dashboard:\n' +
          '                        export PUBLIC_TURNSTILE_SITE_KEY=0x...\n' +
          '                        export TURNSTILE_SECRET_KEY=0x...\n' +
          '                        npm run deploy\n' +
          '    • Turnstile OFF — declare it, and clear the key in the dashboard too:\n' +
          '                        TURNSTILE_POSTURE=disabled npm run deploy',
      );
      process.exit(1);
    }

    console.warn(
      '[check-turnstile-posture] WARN — no PUBLIC_TURNSTILE_SITE_KEY in this build,\n' +
        '  so the contact page carries no Turnstile widget. Fine for local builds.\n' +
        '  A release build (`npm run deploy`) will FAIL on this unless the keys are\n' +
        '  exported or TURNSTILE_POSTURE=disabled is declared, because the runtime\n' +
        '  reads the same variable from the Pages dashboard and would demand a\n' +
        '  token no widget exists to produce.',
    );
    return;
  }

  /* Site key present and widget emitted. Warn if the secret is absent: the
     runtime treats "site key present, secret missing" as a half-configured
     deploy and returns `verification_unavailable`. The dashboard may still
     supply the secret, so this cannot be fatal — but it should be visible. */
  if (!secret) {
    console.warn(
      '[check-turnstile-posture] WARN — site key present, TURNSTILE_SECRET_KEY absent\n' +
        '  from the build environment. Harmless if the Cloudflare Pages dashboard\n' +
        '  supplies the secret at runtime (it is server-only and never needed at\n' +
        '  build time); a genuine outage if it is missing there too, since\n' +
        '  transmit.js then answers `verification_unavailable`.',
    );
  }

  console.log(
    '[check-turnstile-posture] OK — site key present in build env and the ' +
      'contact page emits a matching Turnstile widget.',
  );
}

main();
