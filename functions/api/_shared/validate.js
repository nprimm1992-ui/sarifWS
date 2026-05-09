/**
 * Shared validation + identity primitives for Cloudflare Pages Functions.
 *
 * Design principles:
 *  - Zero external deps (runs inside the Workers runtime).
 *  - Pure functions — no side effects, no globals.
 *  - API-layer defense-in-depth alongside D1 CHECK constraints.
 *  - Raw prospect input is sanitized (control chars stripped, trimmed, capped)
 *    but NEVER reformulated. The signal must reach Nicholas verbatim.
 */

// ── Tunables ────────────────────────────────────────────────────────────────

export const LIMITS = Object.freeze({
  SIGNAL_MIN: 20,
  SIGNAL_MAX: 10_000,
  NAME_MAX: 200,
  EMAIL_MAX: 254,
  ORG_MAX: 200,
  UA_MAX: 200,
});

// Matches the current conservative regex used by functions/api/contact.js.
// Not RFC 5322 perfect; good enough for form validation with a positive
// server-side response flow for edge cases.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Sanitization ────────────────────────────────────────────────────────────

/**
 * Strip C0/C1 control chars, trim, and enforce max length.
 * Preserves tabs, newlines (for multi-line signals) and all printable unicode.
 */
export function sanitize(input, maxLen) {
  if (typeof input !== 'string') return '';
  // Keep \t (0x09), \n (0x0a), \r (0x0d); strip the rest of C0 + DEL + C1.
  const cleaned = input
    // eslint-disable-next-line no-control-regex -- intentional: this regex exists to strip control characters.
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '')
    .trim();
  return cleaned.slice(0, maxLen);
}

/**
 * Lowercase + trim + control-strip; separate from sanitize() so callers can
 * reason about email normalization explicitly.
 */
export function normalizeEmail(input) {
  return sanitize(input, LIMITS.EMAIL_MAX).toLowerCase();
}

// ── Validators (return null on success, string error on failure) ────────────

export function validateSignal(s) {
  if (typeof s !== 'string') return 'Signal is required.';
  const len = s.length;
  if (len < LIMITS.SIGNAL_MIN) {
    return `Signal must be at least ${LIMITS.SIGNAL_MIN} characters.`;
  }
  if (len > LIMITS.SIGNAL_MAX) {
    return `Signal exceeds maximum of ${LIMITS.SIGNAL_MAX} characters.`;
  }
  return null;
}

export function validateName(s) {
  if (!s) return 'Name is required.';
  if (s.length > LIMITS.NAME_MAX) return 'Name is too long.';
  return null;
}

export function validateEmail(s) {
  if (!s) return 'Email is required.';
  if (!EMAIL_RE.test(s)) return 'Invalid email address.';
  if (s.length > LIMITS.EMAIL_MAX) return 'Email is too long.';
  return null;
}

export function validateOrganization(s) {
  if (typeof s !== 'string') return null;
  if (s.length > LIMITS.ORG_MAX) return 'Organization is too long.';
  return null;
}

// ── Identity generators ─────────────────────────────────────────────────────

/**
 * UUID v4 using crypto.randomUUID() (available in Workers runtime).
 */
export function newId() {
  return crypto.randomUUID();
}

/**
 * Human-readable reference — TX-YYYY-MM-XXXX where XXXX is 4 hex chars.
 * Uniqueness is belt-and-suspenders (UNIQUE constraint on reference_id in D1);
 * if the rare collision happens, the INSERT throws and the API-layer caller
 * should retry with a fresh reference.
 */
export function newReferenceId(now = new Date()) {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `TX-${yyyy}-${mm}-${hex}`;
}

export function nowIso() {
  return new Date().toISOString();
}

// ── IP hashing (daily-rotated salt) ─────────────────────────────────────────

const DEV_FALLBACK_SALT = 'sarif-consulting-ip-hash-v1';

function resolveSalt(env, purpose) {
  const configured =
    env && typeof env.IP_HASH_BASE_SALT === 'string' && env.IP_HASH_BASE_SALT;
  const isProd =
    env && typeof env.ENVIRONMENT === 'string' && env.ENVIRONMENT === 'production';
  if (!configured) {
    if (isProd) {
      throw new Error(
        `IP_HASH_BASE_SALT is required in production (needed for ${purpose}).`,
      );
    }
    return DEV_FALLBACK_SALT;
  }
  return configured;
}

/**
 * SHA-256(ip + daily_salt). The salt rotates daily (UTC) which means:
 *  1. Rate-limit buckets are naturally capped to a one-day window.
 *  2. Raw IPs are never stored. The Privacy page can honestly say so.
 *  3. Cross-day correlation is impossible without the previous day's salt.
 *
 * Daily salt is derived from a static base (env.IP_HASH_BASE_SALT) plus the
 * UTC date. In production the base salt is REQUIRED; in dev / preview the
 * handler falls back to a deterministic constant so local testing works.
 */
export async function hashIp(ip, env, now = new Date()) {
  if (!ip) return null;
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const baseSalt = resolveSalt(env, 'ip_hash');
  const material = `${ip}::${dateStr}::${baseSalt}`;
  const enc = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA-256(normalized_email + daily_salt + 'email'). Mirrors the ip_hash
 * design: rotating daily, never stored in raw form. Used for the secondary
 * per-email rate-limit counter that shuts down distributed IP abuse.
 */
export async function hashEmail(email, env, now = new Date()) {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const dateStr = now.toISOString().slice(0, 10);
  const baseSalt = resolveSalt(env, 'email_hash');
  const material = `${normalized}::${dateStr}::${baseSalt}::email`;
  const enc = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Outbound URL host allowlist. Any `fetch()` to an operator-configured URL
 * should go through this so a compromised env var cannot redirect traffic
 * to an attacker-controlled domain. Returns a URL object on success or
 * throws on rejection.
 */
const OUTBOUND_ALLOWED_HOSTS = Object.freeze([
  'script.google.com',
  'script.googleusercontent.com',
]);

export function assertOutboundUrlAllowed(urlString, allowlist = OUTBOUND_ALLOWED_HOSTS) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('outbound_url_invalid');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('outbound_url_non_https');
  }
  const host = parsed.hostname.toLowerCase();
  const ok = allowlist.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
  if (!ok) {
    throw new Error('outbound_url_host_not_allowed');
  }
  return parsed;
}

/**
 * Extract the best available client IP from a Workers request.
 * Prefers CF-Connecting-IP (set by Cloudflare edge); falls back to
 * X-Forwarded-For first hop; returns null if neither is present.
 */
export function extractClientIp(request) {
  const cf = request.headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();
  const xff = request.headers.get('X-Forwarded-For');
  if (xff) return xff.split(',')[0].trim();
  return null;
}

// ── Constant-time bearer compare ────────────────────────────────────────────

/**
 * Bearer extraction + constant-time equality. Returns true only when both
 * strings are present, lengths match, and every byte matches. Mismatched
 * lengths still walk the full loop to avoid timing leaks on length.
 */
export function verifyBearer(authHeader, expected) {
  if (typeof authHeader !== 'string' || typeof expected !== 'string') return false;
  const prefix = 'Bearer ';
  if (!authHeader.startsWith(prefix)) return false;
  const provided = authHeader.slice(prefix.length);
  if (!provided || !expected) return false;

  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  const len = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

// ── Response helpers ────────────────────────────────────────────────────────

const CORS_ALLOW_ORIGIN = 'https://sarifconsulting.ai';

export function jsonHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': CORS_ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extra,
  };
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders(extraHeaders),
  });
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: jsonHeaders() });
}
