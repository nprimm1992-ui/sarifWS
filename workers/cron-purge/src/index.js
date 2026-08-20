/**
 * Sarif Consulting — scheduled retention purge Worker.
 *
 * Pages Functions cannot register cron triggers, so this separate Worker
 * owns the schedule. It POSTs to the site's /api/admin/purge endpoint with
 * the operator bearer token. All deletion logic remains inside the Pages
 * function; this Worker is a thin trigger with no DB access of its own.
 *
 * Failure posture:
 *   - Network or 5xx → log + do nothing. The next day's run retries.
 *   - 401/403        → log LOUDLY (token probably rotated without updating
 *                      this Worker's secret). Still does not throw.
 *   - 2xx            → log the count summary returned by the endpoint.
 *
 * The docs/operations/retention-purge.md runbook covers manual curl fallback
 * when the Worker is unhealthy.
 */

const REQUEST_TIMEOUT_MS = 30_000;

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPurge(event, env));
  },

  // HEAD /healthz lets the runbook confirm the Worker is up without invoking
  // the purge endpoint.
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') {
      return new Response('ok', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  },
};

async function runPurge(event, env) {
  const origin = String(env?.PURGE_ORIGIN || '').replace(/\/+$/, '');
  const path = String(env?.PURGE_PATH || '/api/admin/purge');
  const token = env?.ADMIN_PURGE_TOKEN;

  /* Cloudflare Access service-token credentials.
   *
   * /api/admin/* sits behind TWO gates, and the bearer only satisfies the
   * second one:
   *
   *   1. functions/api/admin/_middleware.js requires a valid Cloudflare
   *      Access JWT (Cf-Access-Jwt-Assertion) BEFORE any handler runs.
   *   2. functions/api/admin/purge.js then requires the ADMIN_PURGE_TOKEN
   *      bearer.
   *
   * Access is human SSO by default, which a cron Worker cannot perform. The
   * machine-to-machine equivalent is a **service token**: sending
   * CF-Access-Client-Id / CF-Access-Client-Secret makes Access mint the JWT
   * at the edge and forward the request. No change to the middleware is
   * needed — verifyCfAccessJwt validates signature, issuer, audience and
   * expiry, and does not require an `email` claim, so a service-token JWT
   * passes exactly like a human one.
   *
   * The service token must be added to the Access application's policy
   * (Include → Service Auth → the token) or Access rejects it before the
   * Pages Function is ever reached.
   */
  const accessClientId = env?.CF_ACCESS_CLIENT_ID;
  const accessClientSecret = env?.CF_ACCESS_CLIENT_SECRET;

  if (!origin) {
    console.error('cron_purge_origin_missing');
    return;
  }
  if (!token) {
    console.error('cron_purge_token_missing');
    return;
  }

  /* Fail LOUDLY and before the request when Access credentials are absent.
   *
   * Without them the middleware answers 401 forever. The old code would send
   * the request anyway, take the `cron_purge_unauthorized` branch, log once a
   * day and return — indistinguishable from a rotated token, and easy to read
   * as "auth problem, someday" rather than "retention has never run". Naming
   * the actual cause is the difference between a silent multi-month gap and a
   * fixable alert.
   */
  if (!accessClientId || !accessClientSecret) {
    console.error('cron_purge_access_service_token_missing', {
      detail:
        'CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET are not set on this Worker. ' +
        '/api/admin/* is gated by Cloudflare Access BEFORE the bearer check, so ' +
        'a bearer-only request is rejected 401 and the retention purge never runs.',
      remediation:
        'Create an Access service token, add it to the Access application policy ' +
        '(Include → Service Auth), then: wrangler secret put CF_ACCESS_CLIENT_ID ' +
        '&& wrangler secret put CF_ACCESS_CLIENT_SECRET. See ' +
        'docs/operations/retention-purge.md.',
    });
    return;
  }

  let endpoint;
  try {
    endpoint = new URL(path, origin).toString();
  } catch (err) {
    console.error('cron_purge_endpoint_invalid', {
      message: err?.message ?? String(err),
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        /* Gate 1: Access exchanges these for a JWT at the edge. */
        'CF-Access-Client-Id': accessClientId,
        'CF-Access-Client-Secret': accessClientSecret,
        /* Gate 2: the handler's own bearer check inside purge.js. */
        Authorization: `Bearer ${token}`,
        'User-Agent': 'sarif-cron-purge/1',
      },
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      /* Two gates can produce this, and the remedies differ. Access rejects
         with its own `WWW-Authenticate: CfAccess` / redirect-ish shape before
         the function runs; the handler's bearer check returns a JSON body.
         Surface both candidates rather than a bare status, so the operator
         does not rotate the wrong secret. */
      console.error('cron_purge_unauthorized', {
        status: res.status,
        cron: event?.cron,
        wwwAuthenticate: res.headers.get('WWW-Authenticate') ?? null,
        detail:
          'Either the Access service token is not on the Access application ' +
          'policy (gate 1), or ADMIN_PURGE_TOKEN drifted from the Pages ' +
          'environment (gate 2).',
        remediation:
          'Check Access → Applications → policy includes this service token, ' +
          'then confirm this Worker\'s ADMIN_PURGE_TOKEN matches the Pages value.',
      });
      return;
    }

    /* Access serves an interactive login page (HTML, 200/302) when it does not
       recognize the caller as a service token. A 2xx that is not JSON therefore
       means we were silently bounced to SSO and NO PURGE RAN — the most
       dangerous outcome, because a naive `res.ok` check reads it as success. */
    const contentType = res.headers.get('Content-Type') ?? '';
    if (res.ok && !contentType.includes('json')) {
      console.error('cron_purge_access_login_interstitial', {
        status: res.status,
        contentType,
        cron: event?.cron,
        detail:
          'Endpoint returned a non-JSON 2xx — almost certainly the Cloudflare ' +
          'Access login page rather than the purge endpoint. The purge did NOT run.',
        remediation:
          'Add this Worker\'s service token to the Access application policy ' +
          '(Include → Service Auth).',
      });
      return;
    }

    if (!res.ok) {
      console.error('cron_purge_http_error', {
        status: res.status,
        cron: event?.cron,
      });
      return;
    }

    let summary = null;
    try {
      summary = await res.json();
    } catch {
      // Endpoint may return 204 or non-JSON; we still succeeded.
    }

    console.log('cron_purge_ok', {
      cron: event?.cron,
      summary,
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error(aborted ? 'cron_purge_timeout' : 'cron_purge_failed', {
      message: err?.message ?? String(err),
    });
  } finally {
    clearTimeout(timer);
  }
}
