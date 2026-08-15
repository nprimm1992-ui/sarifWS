/**
 * Unit tests for deployment-posture resolution and salt fallback.
 *
 * These two functions decide whether production security controls are armed.
 * The original defect (an unset `ENVIRONMENT` disabling Turnstile and the IP
 * salt) was invisible to the E2E suite, which exercises the static site and
 * never evaluates Pages Functions. A fast, dependency-free unit lane closes
 * that blind spot.
 *
 * Run: npm run test:unit   (node --test, no framework dependency)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDeploymentPosture,
  isProductionRequest,
} from '../../functions/api/_shared/runtime-env.js';

const req = (url) => new Request(url);

describe('resolveDeploymentPosture', () => {
  test('apex production hostname is production', () => {
    const p = resolveDeploymentPosture(req('https://sarifconsulting.ai/api/transmit'), {});
    assert.equal(p.isProduction, true);
    assert.equal(p.reason, 'production_hostname');
  });

  test('www production hostname is production', () => {
    assert.equal(
      isProductionRequest(req('https://www.sarifconsulting.ai/api/transmit'), {}),
      true,
    );
  });

  test('THE REGRESSION: production host with ENVIRONMENT unset stays production', () => {
    // This is the exact condition that disabled Turnstile in the live deploy.
    const p = resolveDeploymentPosture(req('https://sarifconsulting.ai/api/transmit'), {
      /* ENVIRONMENT deliberately absent */
    });
    assert.equal(p.isProduction, true);
  });

  test('production hostname outranks a stray ENVIRONMENT=development', () => {
    // A misconfigured var must not be able to disarm the live site.
    const p = resolveDeploymentPosture(req('https://sarifconsulting.ai/api/transmit'), {
      ENVIRONMENT: 'development',
    });
    assert.equal(p.isProduction, true);
    assert.equal(p.reason, 'production_hostname');
  });

  test('localhost is non-production', () => {
    assert.equal(isProductionRequest(req('http://localhost:3456/api/transmit'), {}), false);
  });

  test('127.0.0.1 is non-production', () => {
    assert.equal(isProductionRequest(req('http://127.0.0.1:8788/api/transmit'), {}), false);
  });

  test('pages.dev preview deploys are non-production', () => {
    const p = resolveDeploymentPosture(
      req('https://abc123.sarif-consulting.pages.dev/api/transmit'),
      {},
    );
    assert.equal(p.isProduction, false);
    assert.equal(p.reason, 'local_or_preview_hostname');
  });

  test('unknown hostname fails SAFE (production)', () => {
    const p = resolveDeploymentPosture(req('https://some-new-domain.example/api/x'), {});
    assert.equal(p.isProduction, true);
    assert.equal(p.reason, 'unknown_hostname_failsafe');
  });

  test('missing request object fails SAFE (production)', () => {
    assert.equal(resolveDeploymentPosture(undefined, {}).isProduction, true);
  });

  test('malformed request url fails SAFE (production)', () => {
    assert.equal(resolveDeploymentPosture({ url: 'not-a-url' }, {}).isProduction, true);
  });

  test('ENVIRONMENT typos do NOT grant non-production downgrade', () => {
    // 'developement' / 'Prod' / '' must not accidentally disarm anything.
    for (const value of ['developement', 'Prod', 'production', '', '  ']) {
      const p = resolveDeploymentPosture(req('https://unknown.example/api/x'), {
        ENVIRONMENT: value,
      });
      assert.equal(p.isProduction, true, `ENVIRONMENT=${JSON.stringify(value)}`);
    }
  });

  test('declared non-production downgrades an unknown host', () => {
    const p = resolveDeploymentPosture(req('https://unknown.example/api/x'), {
      ENVIRONMENT: 'preview',
    });
    assert.equal(p.isProduction, false);
    assert.equal(p.reason, 'declared_preview');
  });

  test('case and whitespace tolerated on declared downgrade', () => {
    const p = resolveDeploymentPosture(req('https://unknown.example/api/x'), {
      ENVIRONMENT: '  Development  ',
    });
    assert.equal(p.isProduction, false);
  });
});

describe('hashIp / hashEmail salt resolution', () => {
  // Imported lazily so a failure in validate.js surfaces distinctly.
  const load = () => import('../../functions/api/_shared/validate.js');

  test('explicit IP_HASH_BASE_SALT produces a stable 64-char hash', async () => {
    const { hashIp } = await load();
    const env = { IP_HASH_BASE_SALT: 'unit-test-salt' };
    const a = await hashIp('203.0.113.7', env, new Date('2026-08-15T00:00:00Z'));
    const b = await hashIp('203.0.113.7', env, new Date('2026-08-15T23:59:59Z'));
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a, b, 'same UTC day must yield the same hash');
  });

  test('salt rotates across UTC days', async () => {
    const { hashIp } = await load();
    const env = { IP_HASH_BASE_SALT: 'unit-test-salt' };
    const d1 = await hashIp('203.0.113.7', env, new Date('2026-08-15T12:00:00Z'));
    const d2 = await hashIp('203.0.113.7', env, new Date('2026-08-16T12:00:00Z'));
    assert.notEqual(d1, d2);
  });

  test('derives a salt from a server secret when IP_HASH_BASE_SALT is absent', async () => {
    const { hashIp } = await load();
    const env = { GOOGLE_SCRIPT_SECRET: 'server-only-secret-value' };
    const h = await hashIp('203.0.113.7', env, new Date('2026-08-15T12:00:00Z'));
    assert.match(h, /^[0-9a-f]{64}$/, 'must still hash, not throw');
  });

  test('derived salt differs from the public dev-fallback salt', async () => {
    const { hashIp } = await load();
    const when = new Date('2026-08-15T12:00:00Z');
    const derived = await hashIp('203.0.113.7', { GOOGLE_SCRIPT_SECRET: 's3cr3t' }, when);
    const devFallback = await hashIp('203.0.113.7', { ENVIRONMENT: 'development' }, when);
    assert.notEqual(
      derived,
      devFallback,
      'a derived salt must not collapse to the public constant',
    );
  });

  test('bare env degrades to null rather than throwing', async () => {
    const { hashIp, hashEmail } = await load();
    // transmit.js calls hashIp outside a try/catch; a throw here would 500 the
    // contact form. null routes into the tighter shared null rate-limit bucket.
    assert.equal(await hashIp('203.0.113.7', {}), null);
    assert.equal(await hashEmail('a@b.com', {}), null);
  });

  test('no IP yields null without consulting the salt', async () => {
    const { hashIp } = await load();
    assert.equal(await hashIp('', {}), null);
    assert.equal(await hashIp(null, {}), null);
  });
});
