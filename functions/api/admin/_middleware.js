/**
 * Cloudflare Pages Functions middleware guarding /api/admin/*.
 *
 * Defense-in-depth policy:
 *   1. Cloudflare Access must have issued a valid JWT (Cf-Access-Jwt-Assertion).
 *   2. Individual endpoints may *also* require a bearer (ADMIN_PURGE_TOKEN, etc.)
 *      — that secondary check lives inside each handler. This middleware is
 *      the first gate; handler-level bearer is the second.
 *
 * We never fall through on verification error. If Access is misconfigured
 * (team domain or AUD missing from env), we return 500 so operators notice
 * during bring-up rather than silently running a wide-open admin API.
 *
 * NB: this file also runs for OPTIONS preflights. We let Access-rejected
 * OPTIONS respond 401 — the browser's CORS preflight will then correctly
 * refuse the mutation. CORS for public endpoints is handled at a lower
 * layer (_shared/validate.js).
 */

import { verifyCfAccessJwt } from '../../_shared/cf-access.js';

function unauthorized() {
  return new Response(
    JSON.stringify({ ok: false, error: 'Unauthorized.' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'WWW-Authenticate': 'CfAccess',
        'Cache-Control': 'no-store',
      },
    },
  );
}

function misconfigured() {
  return new Response(
    JSON.stringify({ ok: false, error: 'Admin access not configured.' }),
    {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  // If CF Access env isn't set yet (pre-launch), still refuse — never serve
  // the admin surface open. Operators must provision CF_ACCESS_TEAM_DOMAIN
  // and CF_ACCESS_AUD before /api/admin/* can be reached.
  if (!env?.CF_ACCESS_TEAM_DOMAIN || !env?.CF_ACCESS_AUD) {
    return misconfigured();
  }

  const result = await verifyCfAccessJwt(request, env);
  if (!result.ok) {
    if (result.code === 'misconfigured') return misconfigured();
    return unauthorized();
  }

  const nextContext = Object.assign({}, context, { accessClaims: result });
  return context.next(nextContext);
}
