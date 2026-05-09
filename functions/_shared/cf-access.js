/**
 * Cloudflare Access JWT verification (F4).
 *
 * Verifies the `Cf-Access-Jwt-Assertion` header signed by Cloudflare Access
 * in front of protected routes. We do not trust any unsigned client hint
 * (per OxFlow §3: "Metadata such as TargetAgent or client hints is not
 * authorization"). The JWT is signed RS256 with a key whose `kid` is
 * published at:
 *
 *   https://{TEAM_DOMAIN}/cdn-cgi/access/certs
 *
 * Cache: JWKS are fetched once per cold start and memoized for up to 10m.
 * If verification fails at any step we return a typed result; callers
 * translate that into the appropriate 401/403 response. We never leak the
 * underlying error to the client — that would fingerprint the trust chain.
 *
 * Defense-in-depth: Access also sets `CF-Access-Authenticated-User-Email`
 * on requests it has authenticated, but we do NOT trust that header alone.
 * We only trust it after we've verified the JWT signature ourselves, which
 * forecloses the `cf.scheme=http` / header-spoof class of bug.
 *
 * Env inputs:
 *   CF_ACCESS_TEAM_DOMAIN — e.g. "sarif.cloudflareaccess.com"
 *   CF_ACCESS_AUD         — Application Audience (AUD) tag for the /admin app
 *
 * Outputs (returned as a tagged union):
 *   { ok: true,  sub, email, aud, iss, exp }
 *   { ok: false, code: 'missing_token' | 'bad_format' | 'misconfigured' |
 *                      'unknown_kid'   | 'bad_signature' | 'expired' |
 *                      'wrong_issuer'  | 'wrong_audience' }
 */

const JWKS_CACHE_MS = 10 * 60 * 1000;
let jwksCache = null; // { teamDomain, fetchedAt, keys: Map<kid, CryptoKey> }

function b64urlToUint8(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const raw = atob(b64 + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function b64urlDecodeJson(b64url) {
  try {
    const bytes = b64urlToUint8(b64url);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function importJwk(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

async function loadJwks(teamDomain) {
  const now = Date.now();
  if (
    jwksCache &&
    jwksCache.teamDomain === teamDomain &&
    now - jwksCache.fetchedAt < JWKS_CACHE_MS
  ) {
    return jwksCache.keys;
  }

  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!res.ok) throw new Error(`jwks_fetch_failed_${res.status}`);
  const doc = await res.json();
  if (!doc || !Array.isArray(doc.keys)) throw new Error('jwks_malformed');

  const keys = new Map();
  for (const jwk of doc.keys) {
    if (!jwk.kid || jwk.kty !== 'RSA') continue;
    try {
      const key = await importJwk({
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
        alg: jwk.alg || 'RS256',
        use: jwk.use || 'sig',
        kid: jwk.kid,
        ext: true,
      });
      keys.set(jwk.kid, key);
    } catch {
      // Skip keys that fail to import; one corrupt entry shouldn't break
      // verification for the rest of the JWKS.
    }
  }

  jwksCache = { teamDomain, fetchedAt: now, keys };
  return keys;
}

export async function verifyCfAccessJwt(request, env) {
  const teamDomain = env?.CF_ACCESS_TEAM_DOMAIN;
  const expectedAud = env?.CF_ACCESS_AUD;
  if (!teamDomain || !expectedAud) {
    return { ok: false, code: 'misconfigured' };
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  if (!token) return { ok: false, code: 'missing_token' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, code: 'bad_format' };
  const [headerB64, payloadB64, sigB64] = parts;

  const header = b64urlDecodeJson(headerB64);
  const payload = b64urlDecodeJson(payloadB64);
  if (!header || !payload) return { ok: false, code: 'bad_format' };
  if (header.alg !== 'RS256') return { ok: false, code: 'bad_format' };

  let keys;
  try {
    keys = await loadJwks(teamDomain);
  } catch {
    return { ok: false, code: 'misconfigured' };
  }

  const key = keys.get(header.kid);
  if (!key) return { ok: false, code: 'unknown_kid' };

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = b64urlToUint8(sigB64);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    signingInput,
  );
  if (!valid) return { ok: false, code: 'bad_signature' };

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    return { ok: false, code: 'expired' };
  }
  if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 30) {
    return { ok: false, code: 'expired' };
  }

  const expectedIss = `https://${teamDomain}`;
  if (payload.iss !== expectedIss) {
    return { ok: false, code: 'wrong_issuer' };
  }

  const audMatches = Array.isArray(payload.aud)
    ? payload.aud.includes(expectedAud)
    : payload.aud === expectedAud;
  if (!audMatches) return { ok: false, code: 'wrong_audience' };

  return {
    ok: true,
    sub: typeof payload.sub === 'string' ? payload.sub : '',
    email: typeof payload.email === 'string' ? payload.email : '',
    aud: expectedAud,
    iss: expectedIss,
    exp: payload.exp,
  };
}

/**
 * Wrap a handler so it only runs after Access verification succeeds.
 *
 * Returns a 401 for missing/invalid tokens so browsers can reauth against
 * the Access flow, and 500 only for misconfiguration (never for user
 * failures — that would fingerprint the trust boundary).
 */
export async function requireCfAccess(context, handler) {
  const result = await verifyCfAccessJwt(context.request, context.env);
  if (result.ok) {
    const next = Object.assign({}, context, { accessClaims: result });
    return handler(next);
  }
  if (result.code === 'misconfigured') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Admin access not configured.' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }
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
