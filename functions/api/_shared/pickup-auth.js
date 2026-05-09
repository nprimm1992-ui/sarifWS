/**
 * Shared gate for all /api/pickup/* routes.
 *
 * Scopes:
 *   'read'   → GET /api/pickup              — list unclaimed transmissions
 *   'write'  → POST /api/pickup/:id/claim   — claim a transmission
 *              POST /api/pickup/:id/draft   — write a draft back
 *
 * Tokens:
 *   env.JENSEN_PICKUP_READ_TOKEN   → grants 'read' (and 'write' if no write token is set)
 *   env.JENSEN_PICKUP_WRITE_TOKEN  → grants 'write'
 *   env.JENSEN_PICKUP_TOKEN        → legacy: grants both scopes. Retained for backward
 *                                   compatibility during rollout; remove once operators
 *                                   have rotated to split tokens.
 *
 * At least one matching token for the requested scope MUST be configured
 * in production. Constant-time comparison guards against timing oracles.
 * Returns null on success, otherwise a ready-to-return 401/500 Response.
 */

import { verifyBearer, jsonResponse } from './validate.js';

/**
 * Collect every configured token that is valid for the requested scope.
 * Returns an array (may be empty).
 */
function expectedTokens(env, scope) {
  const tokens = [];
  const legacy = env?.JENSEN_PICKUP_TOKEN;
  if (typeof legacy === 'string' && legacy) tokens.push(legacy);

  if (scope === 'read') {
    const read = env?.JENSEN_PICKUP_READ_TOKEN;
    if (typeof read === 'string' && read) tokens.push(read);
  }

  if (scope === 'write') {
    const write = env?.JENSEN_PICKUP_WRITE_TOKEN;
    if (typeof write === 'string' && write) tokens.push(write);

    // A configured read token alone must NOT grant write. Intentionally skip.
  }

  return tokens;
}

export function requireJensenAuth(request, env, scope = 'write') {
  if (scope !== 'read' && scope !== 'write') {
    console.error('pickup_auth_invalid_scope', { scope });
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const tokens = expectedTokens(env, scope);
  if (tokens.length === 0) {
    console.error('pickup_token_not_configured', { scope });
    return jsonResponse({ error: 'Pickup endpoint not configured' }, 500);
  }

  const header = request.headers.get('Authorization') || '';
  // Walk all candidates in constant time: each comparison itself is constant-
  // time; aggregating via OR keeps timing independent of which slot matched.
  let ok = false;
  for (const expected of tokens) {
    if (verifyBearer(header, expected)) ok = true;
  }

  if (!ok) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  return null;
}
