/**
 * Request guards for Cloudflare Pages Functions.
 *
 * Composable, early-return helpers that enforce invariants BEFORE any
 * parsing / DB / outbound I/O:
 *   - assertJsonRequest:   Content-Type must be application/json; body under cap.
 *   - assertOriginAllowed: Origin (if present) must match the allowlist.
 *
 * Each helper returns either `{ ok: true }` or `{ ok: false, response }`
 * where `response` is a fully-formed Response the caller should return.
 *
 * These are defense-in-depth on top of the existing validators; they stop
 * oversized / wrong-shape / cross-origin submissions from even reaching the
 * JSON parser, which is where resource amplification attacks bite hardest.
 */

import { jsonResponse } from './validate.js';

const JSON_CT_PATTERN = /^application\/json\b/i;

export const BODY_LIMITS = Object.freeze({
  TRANSMIT: 32_768,
  SUBSCRIBE: 8_192,
  ADMIN: 4_096,
  PICKUP_WRITE: 16_384,
});

export const ALLOWED_ORIGINS = Object.freeze([
  'https://sarifconsulting.ai',
  'https://www.sarifconsulting.ai',
  'http://localhost:8788',
  'http://127.0.0.1:8788',
  'http://localhost:3456',
  'http://127.0.0.1:3456',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
]);

const ALLOWED_ORIGINS_SET = new Set(ALLOWED_ORIGINS);

/**
 * Test whether an origin string is a member of the canonical allowlist.
 * Accepts null / undefined / empty and returns false. Callers that want
 * to permit a missing Origin header should handle that case themselves.
 */
export function isAllowedOrigin(origin) {
  if (typeof origin !== 'string' || origin.length === 0) return false;
  return ALLOWED_ORIGINS_SET.has(origin);
}

/**
 * Build CORS response headers for a given request Origin. If the origin
 * is on the allowlist we echo it back (so the browser accepts credentials
 * when we later need them) and emit Vary: Origin to keep shared caches
 * from collapsing across origins. Otherwise we fall back to the canonical
 * apex so crawlers/curl users still get a deterministic answer without
 * us leaking that their origin failed the check.
 */
export function buildCorsHeaders(origin, { methods = 'POST, OPTIONS' } = {}) {
  const allowOrigin = isAllowedOrigin(origin) ? origin : 'https://sarifconsulting.ai';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Enforce `Content-Type: application/json` and a maximum declared body size.
 *
 * Note: we check Content-Length when present as an early rejection; the
 * subsequent JSON parse enforces the actual byte budget via a second-gate
 * read-and-size pass. Callers MUST still validate parsed fields.
 */
export function assertJsonRequest(request, { maxBytes }) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!JSON_CT_PATTERN.test(contentType)) {
    return {
      ok: false,
      response: jsonResponse(
        { error: 'Unsupported Media Type. Send application/json.' },
        415,
      ),
    };
  }

  const lengthHeader = request.headers.get('Content-Length');
  if (lengthHeader != null && lengthHeader !== '') {
    const declared = Number(lengthHeader);
    if (!Number.isFinite(declared) || declared < 0) {
      return {
        ok: false,
        response: jsonResponse({ error: 'Invalid Content-Length.' }, 400),
      };
    }
    if (declared > maxBytes) {
      return {
        ok: false,
        response: jsonResponse(
          { error: 'Payload too large.' },
          413,
        ),
      };
    }
  }

  return { ok: true };
}

/**
 * Read the request body as text and enforce the byte cap independently of
 * Content-Length (which can be absent, chunked, or spoofed). Parses JSON
 * once and returns the parsed object or an error response.
 */
export async function readJsonBody(request, { maxBytes }) {
  let raw;
  try {
    raw = await request.text();
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: 'Could not read request body.' }, 400),
    };
  }

  // Byte-count in UTF-8 — cheap for our sizes and authoritative for chunked.
  const byteLength = new TextEncoder().encode(raw).length;
  if (byteLength > maxBytes) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Payload too large.' }, 413),
    };
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: 'Invalid JSON body' }, 400),
    };
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Invalid JSON body' }, 400),
    };
  }

  return { ok: true, body };
}

/**
 * Enforce that the Origin header (when present) matches an allowed value.
 * We do NOT reject missing Origin for admin/bearer endpoints — those gate
 * via token. For browser form endpoints, pass `{ requireOrigin: true }` to
 * hard-reject submissions that lack an Origin entirely (CSRF-adjacent).
 */
export function assertOriginAllowed(request, { requireOrigin = false } = {}) {
  const origin = request.headers.get('Origin');
  if (!origin) {
    if (requireOrigin) {
      return {
        ok: false,
        response: jsonResponse(
          { error: 'Origin header required.' },
          403,
        ),
      };
    }
    return { ok: true };
  }

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Origin not allowed.' }, 403),
    };
  }

  return { ok: true };
}
