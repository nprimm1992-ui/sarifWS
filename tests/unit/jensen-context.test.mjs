import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageContext, pageTitle, scopeSkusFrom, starterPrompts } from '../../src/scripts/jensen/context.js';

test('page titles drop the firm name from either side', () => {
  assert.equal(pageTitle('Sarif Consulting — Augment Your Intelligence'), 'Augment Your Intelligence');
  assert.equal(pageTitle('Services — Sarif Consulting'), 'Services');
  assert.equal(pageTitle(''), 'Sarif');
});

test('every section offers three starters', () => {
  for (const path of ['/', '/services/', '/praxis/essay/', '/lexicon/', '/contact/', '/about/']) {
    assert.equal(starterPrompts(path).length, 3);
  }
  assert.equal(pageContext('/services/', 'Services — Sarif Consulting').section, 'services');
});

test('scope skus accept both wire shapes and drop junk', () => {
  assert.deepEqual(scopeSkusFrom('?scope=alpha|beta', 'beta|ghost sku|gamma'), ['alpha', 'beta', 'gamma']);
});
