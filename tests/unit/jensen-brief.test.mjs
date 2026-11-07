import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIGNAL_MAX, SIGNAL_MIN, composeBrief, firstSentence } from '../../src/scripts/jensen/brief.js';

const page = { title: 'Services', path: '/services/' };

test('a brief names the page, the question, and the first sentence', () => {
  const text = composeBrief({
    page,
    scopeBrief: 'Requested scope\nEstimated floor: $1,500',
    turns: [{ question: 'What does a diagnostic include?', answer: 'It is the first engagement. The rest is private.' }],
  });
  assert.match(text, /Page: Services \(\/services\/\)/);
  assert.match(text, /Requested scope/);
  assert.match(text, /Q: What does a diagnostic include\?/);
  assert.match(text, /A: It is the first engagement\./);
  assert.equal(text.includes('The rest is private'), false);
  assert.ok(text.length >= SIGNAL_MIN);
});

test('a short brief is padded and a huge one is capped', () => {
  const tiny = composeBrief({ page: { title: 'Hi', path: '/' }, turns: [], scopeBrief: '' });
  assert.ok(tiny.length >= SIGNAL_MIN);
  assert.match(tiny, /sarifconsulting\.ai/);
  const huge = composeBrief({
    page,
    turns: [{ question: 'q'.repeat(12_000), answer: 'a'.repeat(12_000) }],
  });
  assert.equal(huge.length, SIGNAL_MAX);
});

test('first sentence stops at the first stop and drops markdown', () => {
  assert.equal(firstSentence('One. Two.'), 'One.');
  assert.equal(firstSentence(''), '');
  assert.equal(firstSentence('A **diagnostic** is first [1]. The rest is not.'), 'A diagnostic is first.');
});
