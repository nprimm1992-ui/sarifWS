import { assertJsonRequest, assertOriginAllowed, readJsonBody } from '../_shared/request-guards.js';
import { jsonResponse } from '../_shared/validate.js';
import { signJensenRequest } from './_edge.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = assertOriginAllowed(request, { requireOrigin: true });
  if (!origin.ok) return origin.response;
  const typeError = assertJsonRequest(request, { maxBytes: 8192 });
  if (!typeError.ok) return typeError.response;
  const parsed = await readJsonBody(request, { maxBytes: 8192 });
  if (!parsed.ok) return parsed.response;
  const sessionId = typeof parsed.body.session_id === 'string' ? parsed.body.session_id : '';
  const message = typeof parsed.body.message === 'string' ? parsed.body.message.trim() : '';
  const organizationUrl = typeof parsed.body.organization_url === 'string' ? parsed.body.organization_url.trim() : '';
  const skus = Array.isArray(parsed.body.skus)
    ? parsed.body.skus.filter((item) => typeof item === 'string' && /^[a-z0-9-]{1,64}$/.test(item)).slice(0, 28)
    : [];
  if (!sessionId) return jsonResponse({ error: 'invalid_turn' }, 400);
  if (organizationUrl) {
    if (!organizationUrl.startsWith('https://') || organizationUrl.length > 500) {
      return jsonResponse({ error: 'invalid_turn' }, 400);
    }
    const prebriefBody = JSON.stringify({ organization_url: organizationUrl });
    const prebriefPath = `/api/public/v1/sessions/${encodeURIComponent(sessionId)}/prebrief`;
    const signedPrebrief = await signJensenRequest(env, 'POST', prebriefPath, prebriefBody);
    if (signedPrebrief.error) return jsonResponse({ error: signedPrebrief.error }, 503);
    const prebrief = await fetch(signedPrebrief.url, { method: 'POST', headers: signedPrebrief.headers, body: prebriefBody });
    const prebriefText = await prebrief.text();
    return new Response(prebriefText, {
      status: prebrief.status,
      headers: { 'content-type': prebrief.headers.get('content-type') || 'application/json' },
    });
  }
  if (message.length < 1 || message.length > 2000) {
    return jsonResponse({ error: 'invalid_turn' }, 400);
  }
  const body = JSON.stringify({ session_id: sessionId, message, skus });
  const path = `/api/public/v1/sessions/${encodeURIComponent(sessionId)}/turns`;
  const signed = await signJensenRequest(env, 'POST', path, body);
  if (signed.error) return jsonResponse({ error: signed.error }, 503);
  const upstream = await fetch(signed.url, { method: 'POST', headers: signed.headers, body });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'text/event-stream' },
  });
}
