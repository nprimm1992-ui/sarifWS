/**
 * Signs requests from the Sarif edge to the Jensen public API.
 * Sig = hex(HMAC_SHA256(secret, ts + "\n" + method + "\n" + path + "\n" + sha256(body)))
 */

export async function signJensenRequest(env, method, path, body) {
  const secret = env.JENSEN_PUBLIC_EDGE_SECRET;
  const origin = env.JENSEN_PUBLIC_ORIGIN;
  if (!secret || !origin) return { error: 'jensen_unconfigured' };
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  const payload = `${timestamp}\n${method.toUpperCase()}\n${path}\n${hash}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const signature = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return {
    url: `${origin.replace(/\/$/, '')}${path}`,
    headers: {
      'content-type': 'application/json',
      'x-sarif-edge-ts': timestamp,
      'x-sarif-edge-nonce': nonce,
      'x-sarif-edge-sig': signature,
    },
  };
}
