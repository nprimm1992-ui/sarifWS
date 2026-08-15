/**
 * Runtime deployment posture — single source of truth.
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 * Two independent security controls (Turnstile verification in
 * functions/api/transmit.js, and the IP/email hash salt in
 * functions/api/_shared/validate.js) each derived "am I in production?" from
 * `env.ENVIRONMENT === 'production'`.
 *
 * `ENVIRONMENT` was never set on the Cloudflare Pages project. Both controls
 * therefore evaluated `isProduction === false` in production and silently took
 * their development branch:
 *
 *   - verifyTurnstile() returned `{ ok: true, bypass: 'not_configured' }`,
 *     so /api/transmit accepted tokenless POSTs.
 *   - resolveSalt() returned the hardcoded public DEV_FALLBACK_SALT, so
 *     "IPs are hashed with a rotating secret salt" was not true in production.
 *
 * The defect class is the important part: **an absent variable selected the
 * less-safe branch.** Adding the variable fixes today's symptom but leaves the
 * landmine armed for the next deploy, the next preview environment, and the
 * next person who forgets it.
 *
 * ── The fix ─────────────────────────────────────────────────────────────────
 * Posture is derived primarily from something intrinsic to the request that
 * cannot be forgotten during configuration: the hostname the request actually
 * arrived on. `env.ENVIRONMENT` is retained only as an explicit *downgrade*
 * override for local/preview work, and it must say so affirmatively.
 *
 * Unknown / unrecognized / absent inputs resolve to PRODUCTION. Misconfiguration
 * now fails toward the safer branch.
 *
 * ── Non-goal ────────────────────────────────────────────────────────────────
 * This module decides *posture*, never *enforcement*. Callers own the question
 * "given production posture and this missing credential, do I reject, degrade,
 * or proceed?" Centralizing enforcement here would couple unrelated controls.
 */

/** Hosts that are unambiguously the live public site. */
export const PRODUCTION_HOSTS = Object.freeze([
  'sarifconsulting.ai',
  'www.sarifconsulting.ai',
]);

/**
 * Hosts that are unambiguously NOT the live site.
 * `*.pages.dev` covers Cloudflare Pages preview + branch deploys.
 */
const LOCAL_HOSTS = Object.freeze([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  '::1',
]);

/**
 * Values of `env.ENVIRONMENT` accepted as an explicit downgrade.
 * Anything else — including '', undefined, 'prod', 'Production', typos — is
 * NOT a downgrade and leaves the hostname verdict standing.
 */
const NON_PRODUCTION_ENVIRONMENTS = Object.freeze([
  'development',
  'dev',
  'local',
  'preview',
  'staging',
  'test',
]);

function hostnameOf(request) {
  try {
    if (!request || typeof request.url !== 'string') return '';
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isLocalHost(hostname) {
  if (!hostname) return false;
  if (LOCAL_HOSTS.includes(hostname)) return true;
  // Cloudflare Pages preview + branch deployments.
  if (hostname.endsWith('.pages.dev')) return true;
  // Common local TLDs used by dev proxies / container hostnames.
  if (hostname.endsWith('.local') || hostname.endsWith('.localhost')) return true;
  return false;
}

/**
 * Resolve deployment posture for a request.
 *
 * Precedence (first match wins):
 *   1. Hostname is a known production host        → production
 *   2. env.ENVIRONMENT explicitly names a         → non-production
 *      non-production environment
 *   3. Hostname is a known local/preview host     → non-production
 *   4. Anything else (unknown host, no request)   → production  [fail-safe]
 *
 * Note that (1) outranks (2): if a request genuinely arrived on
 * sarifconsulting.ai, a stray `ENVIRONMENT=development` must not be able to
 * disarm production controls.
 *
 * @param {Request|undefined} request
 * @param {Record<string, unknown>|undefined} env
 * @returns {{ isProduction: boolean, hostname: string, reason: string }}
 */
export function resolveDeploymentPosture(request, env) {
  const hostname = hostnameOf(request);
  const declared =
    typeof env?.ENVIRONMENT === 'string' ? env.ENVIRONMENT.trim().toLowerCase() : '';

  if (hostname && PRODUCTION_HOSTS.includes(hostname)) {
    return { isProduction: true, hostname, reason: 'production_hostname' };
  }

  if (declared && NON_PRODUCTION_ENVIRONMENTS.includes(declared)) {
    return { isProduction: false, hostname, reason: `declared_${declared}` };
  }

  if (isLocalHost(hostname)) {
    return { isProduction: false, hostname, reason: 'local_or_preview_hostname' };
  }

  // Unknown hostname (custom domain not yet in PRODUCTION_HOSTS, an internal
  // health probe, a Worker-to-Worker call with no Host, …). Treat as
  // production: over-enforcing on an unknown host degrades gracefully, while
  // under-enforcing is the exact failure this module was written to end.
  return { isProduction: true, hostname, reason: 'unknown_hostname_failsafe' };
}

/**
 * Convenience predicate for call sites that only need the boolean.
 * @returns {boolean}
 */
export function isProductionRequest(request, env) {
  return resolveDeploymentPosture(request, env).isProduction;
}
