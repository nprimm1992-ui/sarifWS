/**
 * /api/contact — Praxis subscription intake.
 *
 * As of the Contact Transmission Rebuild (Phase A, scope B), the public
 * /contact page posts to /api/transmit instead; this endpoint is retained
 * ONLY for the Praxis subscription form (src/pages/praxis.astro).
 *
 * Posture, mirrored from /api/transmit:
 *   - CORS locked to our origin (jsonHeaders / corsPreflight from _shared/validate.js).
 *   - Sanitize + validate via shared helpers.
 *   - Rate-limit by daily-rotated ip_hash (10 per rolling day) against the
 *     `subscriptions` table.
 *   - Persist to D1 best-effort; email-relay still runs if D1 is unavailable.
 *   - Honeypot silently succeeds.
 *
 * Do not expand this handler's responsibilities; if the Praxis subscribe
 * flow is replaced, remove this file as part of that change.
 */

import {
  LIMITS,
  sanitize,
  normalizeEmail,
  validateName,
  validateEmail,
  validateOrganization,
  newId,
  nowIso,
  hashIp,
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

const RATE_LIMIT_MAX_PER_DAY = 10;
const MAIL_RELAY_TIMEOUT_MS = 12_000;
const BRIEF_MAX = 10_000;
const SERVICE_MAX = 100;
const IDEMPOTENCY_WINDOW_MINUTES = 10;
const IDEMPOTENCY_KEY_MAX = 128;

export async function onRequestOptions() {
  return corsPreflight();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const originCheck = assertOriginAllowed(request, { requireOrigin: true });
  if (!originCheck.ok) return originCheck.response;

  const ctCheck = assertJsonRequest(request, { maxBytes: BODY_LIMITS.SUBSCRIBE });
  if (!ctCheck.ok) return ctCheck.response;

  const parsed = await readJsonBody(request, { maxBytes: BODY_LIMITS.SUBSCRIBE });
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (body.website) {
    return jsonResponse({ success: true }, 200);
  }

  const idempotencyKey = sanitize(
    request.headers.get('X-Idempotency-Key') || '',
    IDEMPOTENCY_KEY_MAX,
  );
  if (idempotencyKey && env?.DB) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id FROM subscriptions
          WHERE idempotency_key = ?
            AND datetime(received_at) > datetime('now', ?)
          LIMIT 1`,
      )
        .bind(idempotencyKey, `-${IDEMPOTENCY_WINDOW_MINUTES} minutes`)
        .all();
      if (results && results.length > 0) {
        return jsonResponse({ success: true, idempotent: true }, 200);
      }
    } catch (err) {
      console.error('subscribe_idempotency_check_failed', {
        message: err?.message ?? String(err),
      });
    }
  }

  const name = sanitize(body.name, LIMITS.NAME_MAX);
  const email = normalizeEmail(body.email);
  const organization = sanitize(body.organization, LIMITS.ORG_MAX);
  const service = sanitize(body.service, SERVICE_MAX);
  const brief = sanitize(body.brief, BRIEF_MAX);

  const nameError = validateName(name);
  if (nameError) return jsonResponse({ error: nameError }, 400);

  const emailError = validateEmail(email);
  if (emailError) return jsonResponse({ error: emailError }, 400);

  const orgError = validateOrganization(organization);
  if (orgError) return jsonResponse({ error: orgError }, 400);

  if (!brief) {
    return jsonResponse({ error: 'Brief is required.' }, 400);
  }

  // ── Rate limit (best-effort) ──────────────────────────────────────────────
  const clientIp = extractClientIp(request);
  const ipHash = await hashIp(clientIp, env);

  if (env.DB && ipHash) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM subscriptions
          WHERE ip_hash = ?
            AND datetime(received_at) > datetime('now','-1 day')`,
      )
        .bind(ipHash)
        .all();
      const count = results?.[0]?.c ?? 0;
      if (count >= RATE_LIMIT_MAX_PER_DAY) {
        return jsonResponse(
          {
            error:
              'Rate limit exceeded. Reach Sarif directly at info@sarifconsulting.ai.',
          },
          429,
        );
      }
    } catch (err) {
      console.error('subscribe_rate_limit_check_failed', {
        message: err?.message ?? String(err),
      });
    }
  }

  // ── D1 persistence (best-effort) ────────────────────────────────────────
  const id = newId();
  const receivedAt = nowIso();
  const consentVersion =
    (typeof env.CONSENT_VERSION === 'string' && env.CONSENT_VERSION) ||
    '2026-04-v1';
  const userAgent = sanitize(
    request.headers.get('User-Agent') || '',
    LIMITS.UA_MAX,
  );

  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO subscriptions (
           id, received_at,
           prospect_name, prospect_email, prospect_organization,
           service, brief,
           ip_hash, user_agent_fp, consent_version,
           idempotency_key
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          receivedAt,
          name,
          email,
          organization || null,
          service || null,
          brief,
          ipHash,
          userAgent || null,
          consentVersion,
          idempotencyKey || null,
        )
        .run();
    } catch (err) {
      console.error('subscribe_d1_insert_failed', {
        message: err?.message ?? String(err),
      });
    }
  }

  const subject = organization
    ? `New inquiry from ${name} (${organization})`
    : `New inquiry from ${name}`;

  const textBody = [
    `Name: ${name}`,
    `Email: ${email}`,
    organization ? `Organization: ${organization}` : null,
    service ? `Service Interest: ${service}` : null,
    '',
    'Project Brief:',
    brief,
    '',
    '---',
    'Submitted via sarifconsulting.ai contact form',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const scriptUrl = env.GOOGLE_SCRIPT_URL;
  const scriptSecret = env.GOOGLE_SCRIPT_SECRET;

  if (!scriptUrl || !scriptSecret) {
    console.error('subscribe_mail_relay_not_configured');
    return jsonResponse({ error: 'Mail service not configured' }, 500);
  }

  try {
    assertOutboundUrlAllowed(scriptUrl);
  } catch (err) {
    console.error('subscribe_mail_relay_url_rejected', {
      message: err?.message ?? String(err),
    });
    return jsonResponse({ error: 'Mail service not configured' }, 500);
  }

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
        body: textBody,
        replyTo: email,
      }),
      signal: controller.signal,
    });

    if (res.ok) {
      try {
        const result = await res.json();
        if (result?.success === true) {
          return jsonResponse({ success: true }, 200);
        }
        console.error('subscribe_mail_relay_rejected', { result });
      } catch {
        // Google Apps Script occasionally returns HTML wrapper on 200.
        return jsonResponse({ success: true }, 200);
      }
    }

    const errText = await res.text().catch(() => 'unknown');
    console.error('subscribe_mail_relay_http_error', {
      status: res.status,
      body: errText.slice(0, 500),
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error(
      aborted ? 'subscribe_mail_relay_timeout' : 'subscribe_mail_relay_fetch_failed',
      { message: err?.message ?? String(err) },
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  return jsonResponse(
    {
      success: false,
      error: 'Delivery failed. Use Copy email or Open email app on the page.',
    },
    502,
  );
}
