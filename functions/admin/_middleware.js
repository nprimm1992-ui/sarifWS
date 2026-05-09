/**
 * Middleware guarding HTML admin pages under /admin/*.
 *
 * The Astro build emits /admin/*.html as static assets on Pages. Pages
 * Functions middleware runs before the static asset dispatcher, so this
 * file is our opportunity to block unauthenticated requests to /admin
 * pages even though they are otherwise plain HTML.
 *
 * If Access has not signed the request with a valid JWT, we 302 the
 * visitor to the Access login flow (cdn-cgi/access/login) with the
 * original path preserved so they return here after authenticating.
 */

import { verifyCfAccessJwt } from '../_shared/cf-access.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (!env?.CF_ACCESS_TEAM_DOMAIN || !env?.CF_ACCESS_AUD) {
    return new Response(
      'Admin access not configured.',
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const result = await verifyCfAccessJwt(request, env);
  if (result.ok) return context.next();

  const url = new URL(request.url);
  const redirect = `https://${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/login?redirect_url=${encodeURIComponent(
    url.pathname + url.search,
  )}`;
  return Response.redirect(redirect, 302);
}
