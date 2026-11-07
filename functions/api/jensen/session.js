import { assertJsonRequest, assertOriginAllowed, readJsonBody } from '../_shared/request-guards.js';
import { hashIp, jsonResponse } from '../_shared/validate.js';
import { signJensenRequest } from './_edge.js';

async function verifyTurnstile(token, secret, ip) {
  if (!secret) return { ok: false, status: 503 };
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  if (!response.ok) return { ok: false, status: 503 };
  const payload = await response.json();
  return { ok: payload.success === true, status: 400 };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = assertOriginAllowed(request, { requireOrigin: true });
  if (!origin.ok) return origin.response;
  const typeError = assertJsonRequest(request, { maxBytes: 4096 });
  if (!typeError.ok) return typeError.response;
  const parsed = await readJsonBody(request, { maxBytes: 4096 });
  if (!parsed.ok) return parsed.response;
  const token = parsed.body['cf-turnstile-response'] || parsed.body.turnstileToken;
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const turnstile = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, ip);
  if (!turnstile.ok) {
    return jsonResponse({ error: 'challenge_failed' }, turnstile.status);
  }
  const ipHash = await hashIp(ip, env);
  if (!ipHash) return jsonResponse({ error: 'ip_unavailable' }, 400);
  const consentVersion = (typeof env.CONSENT_VERSION === 'string' && env.CONSENT_VERSION) || '2026-10-v2';
  const body = JSON.stringify({ ip_hash: ipHash, consent_version: consentVersion });
  const signed = await signJensenRequest(env, 'POST', '/api/public/v1/sessions', body);
  if (signed.error) return jsonResponse({ error: signed.error }, 503);
  const upstream = await fetch(signed.url, { method: 'POST', headers: signed.headers, body });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  });
}
