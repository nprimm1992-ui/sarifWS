/**
 * The browser posts the handoff straight to /api/transmit so Turnstile,
 * origin checks, idempotency, and the email relay stay on the path that
 * already exists. This route exists so a mis-addressed client gets a
 * precise error instead of a 404.
 */
import { jsonResponse } from '../_shared/validate.js';

export async function onRequestPost() {
  return jsonResponse(
    { error: 'use_transmit', message: 'Post the handoff to /api/transmit.' },
    400,
  );
}
