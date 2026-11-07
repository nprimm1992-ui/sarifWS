import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutTrace, locateExcerpt } from '../../src/scripts/jensen/trace.js';

const sources = [
  { n: 2, section: 'praxis' },
  { n: 1, section: 'services' },
];

test('trace layout is deterministic and ordered by source number', () => {
  const first = layoutTrace(sources);
  const second = layoutTrace(sources);
  assert.deepEqual(first, second);
  assert.deepEqual(first.nodes.map((node) => node.n), [1, 2]);
  assert.equal(first.center.id, 'jensen');
  assert.equal(first.edges.length, 2);
  assert.notEqual(first.nodes[0].y, first.nodes[1].y);
});

test('the same section shares a row', () => {
  const layout = layoutTrace([
    { n: 1, section: 'services' },
    { n: 2, section: 'services' },
  ]);
  assert.equal(layout.nodes[0].y, layout.nodes[1].y);
  assert.notEqual(layout.nodes[0].x, layout.nodes[1].x);
});

test('locateExcerpt finds a passage across whitespace and is case-insensitive as a fallback', () => {
  const page = 'The diagnostic\n\nis the first engagement for a defined question.';
  const found = locateExcerpt(page, 'The diagnostic is the first engagement…');
  assert.ok(found);
  assert.equal(page.slice(found.start, found.end).replace(/\s+/g, ' '), 'The diagnostic is the first engagement');
  const folded = locateExcerpt(page, 'the diagnostic is the first');
  assert.ok(folded);
  assert.equal(locateExcerpt(page, 'no'), null);
});
