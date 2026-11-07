/** Fetch wrappers. Failures become a code the panel can map to copy. */

import { createSseParser } from './protocol.js';

export class JensenError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'JensenError';
    this.code = code;
    this.status = status;
  }
}

export function classifyFailure(status, body) {
  const code = body && typeof body === 'object'
    ? (typeof body.code === 'string' && body.code) || (typeof body.error === 'string' && body.error) || ''
    : '';
  if (code) return code;
  if (status === 404) return 'session';
  if (status === 402) return 'over_budget';
  if (status === 429) return 'session_limit';
  if (status === 401 || status === 403) return 'session';
  return 'network';
}

async function readBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function openSession(token) {
  const response = await fetch('/api/jensen/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ turnstileToken: token || '' }),
  });
  const body = await readBody(response);
  if (!response.ok || !body?.session_id) {
    throw new JensenError(classifyFailure(response.status, body), response.status);
  }
  return body;
}

export async function streamTurn({ sessionId, message, skus, signal, onEvent }) {
  let response;
  try {
    response = await fetch('/api/jensen/turns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message, skus }),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new JensenError('network', 0);
  }
  if (!response.ok || !response.body) {
    throw new JensenError(classifyFailure(response.status, await readBody(response)), response.status);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser((frame) => {
    if (frame.event === 'problem') {
      const data = frame.data || {};
      throw new JensenError(typeof data.code === 'string' ? data.code : 'model', Number(data.status) || 502);
    }
    onEvent(frame);
  });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.flush();
  } finally {
    reader.releaseLock();
  }
}

export async function describeUrl(sessionId, url) {
  const response = await fetch('/api/jensen/turns', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, organization_url: url }),
  });
  const body = await readBody(response);
  if (!response.ok) throw new JensenError(classifyFailure(response.status, body), response.status);
  return typeof body?.content === 'string' ? body.content : '';
}

export async function transmit(payload) {
  let response;
  try {
    response = await fetch('/api/transmit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new JensenError('network', 0);
  }
  if (!response.ok) {
    throw new JensenError(classifyFailure(response.status, await readBody(response)), response.status);
  }
}
