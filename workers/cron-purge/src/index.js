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

  if (!origin) {
    console.error('cron_purge_origin_missing');
    return;
  }
  if (!token) {
    console.error('cron_purge_token_missing');
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
        Authorization: `Bearer ${token}`,
        'User-Agent': 'sarif-cron-purge/1',
      },
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      console.error('cron_purge_unauthorized', {
        status: res.status,
        cron: event?.cron,
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
