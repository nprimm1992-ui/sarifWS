/**
 * POST /api/transmit — Contact page signal intake.
 *
 * Flow (idempotent-safe on partial failure):
 *   1. Parse JSON body; reject malformed
 *   2. Honeypot check → silent 200
 *   3. Sanitize + validate (signal length, name, email, organization)
 *   4. Rate-limit by daily-salted ip_hash (10 per rolling day)
 *   5. Generate id + reference_id + received_at
 *   6. Persist to D1 — best-effort; failure does NOT block email.
 *      Uses `INSERT ... ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`
 *      against the partial unique index introduced in migration 0008 so a
 *      TOCTOU retry (two near-simultaneous submits of the same key) is
 *      collapsed at the storage layer, not only by the pre-flight check.
 *   7. Render enriched email via _shared/email-transmission
 *   8. Relay to Google Apps Script (existing mail pipeline)
 *   9. Return structured { ok, code?, field?, message? } — success is
 *      { ok: true }, errors carry a machine-readable `code` so the client
 *      can route retries (429, mail_failed) vs. validation corrections.
 *
 * Doctrine:
 *   - Jensen is invisible on the public response surface.
 *   - The raw signal is preserved verbatim for Nicholas regardless of what
 *     lands in D1. Email is the operational primary; D1 is durable substrate.
 *   - No reference_id is ever returned to the prospect.
 */

import {
  LIMITS,
  sanitize,
  normalizeEmail,
  validateSignal,
  validateName,
  validateEmail,
  validateOrganization,
  newId,
  newReferenceId,
  nowIso,
  hashIp,
  hashEmail,
  extractClientIp,
  jsonResponse,
  corsPreflight,
  assertOutboundUrlAllowed,
} from './_shared/validate.js';
import {
  BODY_LIMITS,
  assertJsonRequest,
  assertOriginAllowed,
  readJsonBody,
} from './_shared/request-guards.js';
import { renderTransmissionEmail } from './_shared/email-transmission.js';
import { LEXICON_VERSION } from './_shared/lexicon-version.js';

const RATE_LIMIT_MAX_PER_DAY = 10;
const RATE_LIMIT_NULL_MAX_PER_DAY = 20;
const EMAIL_RATE_LIMIT_MAX_PER_DAY = 15;
const IDEMPOTENCY_WINDOW_MINUTES = 10;
const IDEMPOTENCY_KEY_MAX = 128;
const TURNSTILE_TOKEN_MAX = 2048;
const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_VERIFY_TIMEOUT_MS = 4_000;

// Consistent shape for every non-2xx response. Codes are snake_case and
// stable; do not rename once shipped — clients may branch on them.
function errorResponse(status, code, message, { field, retryAfterSec } = {}) {
  const body = { ok: false, code, message };
  if (field) body.field = field;
  const headers = {};
  if (retryAfterSec && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    headers['Retry-After'] = String(Math.ceil(retryAfterSec));
  }
  return jsonResponse(body, status, headers);
}

function successResponse(extra = {}) {
  return jsonResponse({ ok: true, ...extra }, 200);
}

/**
 * Verify a Cloudflare Turnstile response token against the siteverify API.
 *
 * Production posture (fail-closed):
 *   - env.ENVIRONMENT === 'production' AND no TURNSTILE_SECRET_KEY
 *     → `{ ok: false, code: 'verification_unavailable' }`. The deploy is
 *     misconfigured — refuse the submission rather than silently accept
 *     bot traffic. An operator intervention is required to restore the
 *     challenge surface.
 *   - env.ENVIRONMENT === 'production' AND PUBLIC_TURNSTILE_SITE_KEY set
 *     AND no token on the request → `{ ok: false, code: 'verification_missing' }`.
 *     The client dropped the widget (ad-blocker, CSP, scripting disabled);
 *     surface actionable copy rather than generic retry.
 *
 * Non-production posture (graceful degrade):
 *   - Missing secret logs a warning and bypasses. This keeps Playwright,
 *     Astro preview, and first-run local dev usable without leaking bypass
 *     semantics into production.
 *
 * Network timeout and siteverify 5xx always fall through as
 * `{ ok: false, code: 'verification_unavailable' }` regardless of env.
 * A DoS against siteverify must not be a bypass vector.
 */
async function verifyTurnstile(token, clientIp, env) {
  const secret = env?.TURNSTILE_SECRET_KEY;
  const environment = typeof env?.ENVIRONMENT === 'string'
    ? env.ENVIRONMENT.toLowerCase()
    : '';
  const isProduction = environment === 'production';
  const publicSiteKey =
    typeof env?.PUBLIC_TURNSTILE_SITE_KEY === 'string'
      ? env.PUBLIC_TURNSTILE_SITE_KEY.trim()
      : '';
  const hasSecret = typeof secret === 'string' && secret.length > 0;

  if (!hasSecret) {
    if (isProduction) {
      console.error('turnstile_misconfigured_no_secret');
      return { ok: false, code: 'verification_unavailable' };
    }
    console.warn('turnstile_bypass_non_production', { environment });
    return { ok: true, bypass: 'not_configured' };
  }

  const tokenPresent = typeof token === 'string' && token.length > 0;
  if (!tokenPresent) {
    /* When the site key is deployed client-side, a missing token means
       the widget failed to render or the client stripped it. Emit the
       more specific code so contact.astro can guide the user. */
    if (isProduction && publicSiteKey) {
      return { ok: false, code: 'verification_missing' };
    }
    return { ok: false, code: 'challenge_required' };
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (clientIp) body.set('remoteip', clientIp);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    TURNSTILE_VERIFY_TIMEOUT_MS,
  );
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('turnstile_verify_http_error', { status: res.status });
      return { ok: false, code: 'verification_unavailable' };
    }
    const result = await res.json();
    if (result?.success === true) return { ok: true };
    console.warn('turnstile_verify_rejected', {
      error_codes: result?.['error-codes'],
    });
    return { ok: false, code: 'challenge_failed' };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error(
      aborted ? 'turnstile_verify_timeout' : 'turnstile_verify_failed',
      { message: err?.message ?? String(err) },
    );
    return { ok: false, code: 'verification_unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
// Mail relay timeout: Google Apps Script can stall under load. Bound the
// prospect's wait so a wedged relay surfaces the 502 fallback copy instead
// of an indefinite spinner. 12s is comfortably above typical GAS latency
// (~1–3s) and well inside Cloudflare Pages Functions' runtime budget.
const MAIL_RELAY_TIMEOUT_MS = 12_000;

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const originCheck = assertOriginAllowed(request, { requireOrigin: true });
  if (!originCheck.ok) return originCheck.response;

  const ctCheck = assertJsonRequest(request, { maxBytes: BODY_LIMITS.TRANSMIT });
  if (!ctCheck.ok) return ctCheck.response;

  const parsed = await readJsonBody(request, { maxBytes: BODY_LIMITS.TRANSMIT });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (body.website) {
    // Honeypot hit — respond with a plausible success so bots can't learn
    // they were filtered. Shape matches the real success response.
    return successResponse();
  }

  // Turnstile verification (P7b). Runs before validation so a bot cannot
  // exhaust the more expensive validators by spraying invalid payloads.
  // `clientIp` is resolved from CF-Connecting-IP via extractClientIp below,
  // but we haven't called it yet; do a minimal read here so verifyTurnstile
  // can include `remoteip` (improves siteverify accuracy for Enterprise).
  const tsToken = sanitize(
    body['cf-turnstile-response'] || body.turnstileToken || '',
    TURNSTILE_TOKEN_MAX,
  );
  const tsClientIp = request.headers.get('CF-Connecting-IP') || '';
  const tsResult = await verifyTurnstile(tsToken, tsClientIp, env);
  if (!tsResult.ok) {
    if (tsResult.code === 'challenge_required') {
      return errorResponse(
        400,
        'challenge_required',
        'A security check is required before we can deliver your transmission.',
      );
    }
    if (tsResult.code === 'verification_missing') {
      /* Client was provisioned with a site key but the token never arrived.
         Usually an ad-blocker or CSP-blocked widget. Ask the user to
         reload; if that fails they have an email fallback one paragraph
         below the form. */
      return errorResponse(
        400,
        'verification_missing',
        'Security verification did not load. Please reload the page, or email info@sarifconsulting.ai if the issue persists.',
      );
    }
    if (tsResult.code === 'challenge_failed') {
      return errorResponse(
        400,
        'challenge_failed',
        'The security check did not pass. Reload and try once more, or email us directly at info@sarifconsulting.ai.',
      );
    }
    // verification_unavailable — Turnstile itself is down, OR the deploy
    // is misconfigured (production without secret). Reject (never fall
    // open) but make the copy recoverable.
    return errorResponse(
      503,
      'verification_unavailable',
      'Security verification is temporarily unavailable. Try again shortly or email info@sarifconsulting.ai.',
      { retryAfterSec: 60 },
    );
  }

  const idempotencyKey = sanitize(
    request.headers.get('X-Idempotency-Key') || '',
    IDEMPOTENCY_KEY_MAX,
  );
  if (idempotencyKey && env?.DB) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id FROM transmissions
          WHERE idempotency_key = ?
            AND datetime(received_at) > datetime('now', ?)
          LIMIT 1`,
      )
        .bind(idempotencyKey, `-${IDEMPOTENCY_WINDOW_MINUTES} minutes`)
        .all();
      if (results && results.length > 0) {
        return successResponse({ idempotent: true });
      }
    } catch (err) {
      console.error('idempotency_check_failed', {
        message: err?.message ?? String(err),
      });
    }
  }

  // Sanitize — control chars only; signal is NOT reformulated.
  const rawSignal = sanitize(body.signal, LIMITS.SIGNAL_MAX);
  const name = sanitize(body.name, LIMITS.NAME_MAX);
  const email = normalizeEmail(body.email);
  const organization = sanitize(body.organization, LIMITS.ORG_MAX);

  const signalError = validateSignal(rawSignal);
  if (signalError) {
    return errorResponse(400, 'invalid_signal', signalError, { field: 'signal' });
  }

  const nameError = validateName(name);
  if (nameError) {
    return errorResponse(400, 'invalid_name', nameError, { field: 'name' });
  }

  const emailError = validateEmail(email);
  if (emailError) {
    return errorResponse(400, 'invalid_email', emailError, { field: 'email' });
  }

  const orgError = validateOrganization(organization);
  if (orgError) {
    return errorResponse(400, 'invalid_organization', orgError, {
      field: 'organization',
    });
  }

  // ── Rate limit (best-effort) ──────────────────────────────────────────────
  // Key off the daily-rotated ip_hash. If D1 is unavailable we skip the
  // rate-limit check rather than reject the submission — email must still
  // get through. CF-Connecting-IP is the authoritative source at the edge.
  //
  // Round-4 phase-5 polish: when the caller has no resolvable IP
  // (CF-Connecting-IP + X-Forwarded-For both absent) we no longer bypass
  // rate-limiting — we fall back to a shared null-bucket with a slightly
  // tighter daily cap (RATE_LIMIT_NULL_MAX_PER_DAY). This closes the
  // header-stripping bypass where a broken proxy could otherwise send
  // unbounded submissions past the per-IP counter.
  const clientIp = extractClientIp(request);
  const ipHash = await hashIp(clientIp, env);

  if (env.DB) {
    try {
      // NOTE: received_at is stored as ISO 8601 with 'T' separator and 'Z'
      // suffix; SQLite's datetime('now','-1 day') returns 'YYYY-MM-DD HH:MM:SS'
      // format. String comparison would spuriously include rows from the
      // previous calendar day because 'T' (0x54) > ' ' (0x20) at offset 10.
      // Coercing both sides via datetime() normalizes the format. This
      // prevents the rate-limit query from leaking boundary-day rows.
      //
      // D1 requires separate statements for the hash-match vs null-match
      // path — `= NULL` is always-false in sqlite, so `IS NULL` must be
      // spelled inline rather than via a bound parameter.
      const { results } = ipHash
        ? await env.DB.prepare(
            `SELECT COUNT(*) AS c FROM transmissions
              WHERE ip_hash = ?
                AND datetime(received_at) > datetime('now','-1 day')`,
          )
            .bind(ipHash)
            .all()
        : await env.DB.prepare(
            `SELECT COUNT(*) AS c FROM transmissions
              WHERE ip_hash IS NULL
                AND datetime(received_at) > datetime('now','-1 day')`,
          ).all();
      const count = results?.[0]?.c ?? 0;
      const limit = ipHash ? RATE_LIMIT_MAX_PER_DAY : RATE_LIMIT_NULL_MAX_PER_DAY;
      if (count >= limit) {
        // Retry-After surfaces at minimum the seconds until the oldest
        // qualifying row rolls off the 24h window. We don't have that
        // timestamp handy without another query, so we default to one
        // hour — tight enough to be useful, loose enough to not encourage
        // botnets. Browsers will surface this to the user if honored.
        return errorResponse(
          429,
          'rate_limited',
          'Too many submissions from this network today. Reach Sarif directly at info@sarifconsulting.ai.',
          { retryAfterSec: 3600 },
        );
      }
    } catch (err) {
      console.error('rate_limit_check_failed', {
        message: err?.message ?? String(err),
      });
    }
  }

  // Secondary counter keyed on the prospect email itself. Shuts down
  // distributed-IP abuse (botnets, rotating residential proxies) that would
  // otherwise slip past the per-IP limit above. Hashing the email here is
  // defensive — if the log pipeline leaks, the hash is not a raw PII column.
  if (env.DB) {
    try {
      const emailHashValue = await hashEmail(email, env);
      if (emailHashValue) {
        void emailHashValue; // reserved for future email-hash-indexed queries
      }
      const { results } = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM transmissions
          WHERE prospect_email = ?
            AND datetime(received_at) > datetime('now','-1 day')`,
      )
        .bind(email)
        .all();
      const count = results?.[0]?.c ?? 0;
      if (count >= EMAIL_RATE_LIMIT_MAX_PER_DAY) {
        return errorResponse(
          429,
          'rate_limited',
          'This email has reached today’s submission limit. Reach Sarif directly at info@sarifconsulting.ai.',
          { retryAfterSec: 3600 },
        );
      }
    } catch (err) {
      console.error('email_rate_limit_check_failed', {
        message: err?.message ?? String(err),
      });
    }
  }

  // ── Identity + timestamps ────────────────────────────────────────────────
  const id = newId();
  const referenceId = newReferenceId();
  const receivedAt = nowIso();
  const consentVersion =
    (typeof env.CONSENT_VERSION === 'string' && env.CONSENT_VERSION) ||
    '2026-04-v1';
  const userAgent = sanitize(
    request.headers.get('User-Agent') || '',
    LIMITS.UA_MAX,
  );

  // ── D1 persistence (best-effort; email must still ship) ─────────────────
  // Two competing requests with the same `idempotency_key` (e.g. bfcache
  // restore fires a second submit in the same session) would previously
  // have raced past the pre-flight lookup and both inserted. Migration
  // 0008 adds a partial UNIQUE index on idempotency_key; here we use
  // ON CONFLICT DO NOTHING RETURNING id to collapse the race at the
  // storage layer. RETURNING id is empty when the row already existed,
  // which we treat as a successful idempotent dedupe (not a failure).
  let persisted = false;
  let dedupedByUnique = false;
  if (env.DB) {
    try {
      const { results } = await env.DB.prepare(
        `INSERT INTO transmissions (
           id, reference_id, received_at, status,
           raw_signal, signal_length,
           prospect_name, prospect_email, prospect_organization,
           lexicon_version, ip_hash, user_agent_fp, consent_version,
           idempotency_key
         ) VALUES (?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(idempotency_key) WHERE idempotency_key IS NOT NULL
         DO NOTHING
         RETURNING id`,
      )
        .bind(
          id,
          referenceId,
          receivedAt,
          rawSignal,
          rawSignal.length,
          name,
          email,
          organization || null,
          LEXICON_VERSION,
          ipHash,
          userAgent || null,
          consentVersion,
          idempotencyKey || null,
        )
        .all();
      if (results && results.length > 0) {
        persisted = true;
      } else if (idempotencyKey) {
        // Row already existed for this key — the prior submission already
        // emailed Nicholas. We return the plausible success and skip the
        // mail relay to avoid a duplicate notification.
        dedupedByUnique = true;
        console.log('d1_insert_idempotent_dedupe', {
          idempotency_key_hash: idempotencyKey.slice(0, 8),
        });
      }
    } catch (err) {
      console.error('d1_insert_failed', {
        reference_id: referenceId,
        message: err?.message ?? String(err),
      });
    }
  } else {
    console.warn('d1_binding_missing', { reference_id: referenceId });
  }

  if (dedupedByUnique) {
    return successResponse({ idempotent: true });
  }

  // ── Email relay (operational primary) ───────────────────────────────────
  const { subject, body: emailBody } = renderTransmissionEmail({
    referenceId,
    receivedAt,
    prospectName: name,
    prospectEmail: email,
    prospectOrganization: organization,
    rawSignal,
    lexiconVersion: LEXICON_VERSION,
    persisted,
  });

  const scriptUrl = env.GOOGLE_SCRIPT_URL;
  const scriptSecret = env.GOOGLE_SCRIPT_SECRET;

  if (!scriptUrl || !scriptSecret) {
    console.error('mail_relay_not_configured', { reference_id: referenceId });
    return errorResponse(
      502,
      'mail_unavailable',
      'Delivery failed. Copy info@sarifconsulting.ai or open your email app to reach Sarif directly.',
    );
  }

  try {
    assertOutboundUrlAllowed(scriptUrl);
  } catch (err) {
    console.error('mail_relay_url_rejected', {
      reference_id: referenceId,
      message: err?.message ?? String(err),
    });
    return errorResponse(
      502,
      'mail_unavailable',
      'Delivery failed. Copy info@sarifconsulting.ai or open your email app to reach Sarif directly.',
    );
  }

  let mailOk = false;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    MAIL_RELAY_TIMEOUT_MS,
  );
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: scriptSecret,
        subject,
        body: emailBody,
        replyTo: email,
      }),
      signal: controller.signal,
    });

    if (res.ok) {
      try {
        const result = await res.json();
        mailOk = result?.success === true;
        if (!mailOk) {
          console.error('mail_relay_rejected', {
            reference_id: referenceId,
            result,
          });
        }
      } catch {
        // Google Apps Script occasionally returns HTML wrapper on 200.
        // Parent response was OK; treat as delivered.
        mailOk = true;
      }
    } else {
      const errText = await res.text().catch(() => 'unknown');
      console.error('mail_relay_http_error', {
        reference_id: referenceId,
        status: res.status,
        body: errText.slice(0, 500),
      });
    }
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error(aborted ? 'mail_relay_timeout' : 'mail_relay_fetch_failed', {
      reference_id: referenceId,
      timeout_ms: aborted ? MAIL_RELAY_TIMEOUT_MS : undefined,
      message: err?.message ?? String(err),
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (mailOk) {
    return successResponse();
  }

  return errorResponse(
    502,
    'mail_delayed',
    'Delivery is taking longer than expected. Copy info@sarifconsulting.ai or open your email app to reach Sarif directly.',
  );
}
