import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  answerNodeTypes,
  createStreamingView,
  parseAnswer,
  walkAnswer,
} from '../../src/scripts/jensen/markdown.js';

function texts(ast) {
  const out = [];
  walkAnswer(ast, (node) => {
    if (node.type === 'text') out.push(node.text);
  });
  return out.join('');
}

test('script markup stays text and an unclosed marker stays literal', () => {
  const ast = parseAnswer('Hello <script>alert(1)</script>\n\n**bold');
  assert.equal(answerNodeTypes(ast).has('strong'), false);
  assert.equal(texts(ast).includes('<script>alert(1)</script>'), true);
  assert.equal(texts(ast).includes('**bold'), true);
  for (const type of answerNodeTypes(ast)) {
    assert.ok(['paragraph', 'list', 'text', 'strong', 'em', 'cite'].includes(type));
  }
});

test('closed bold, emphasis, lists, and citations parse', () => {
  const ast = parseAnswer('A **diagnostic** is *first*.\n\n- Starts here [1]\n- Then this\n\n1. Ordered');
  assert.equal(answerNodeTypes(ast).has('strong'), true);
  assert.equal(answerNodeTypes(ast).has('em'), true);
  assert.equal(answerNodeTypes(ast).has('cite'), true);
  const lists = ast.filter((block) => block.type === 'list');
  assert.equal(lists.length, 2);
  assert.equal(lists[0].ordered, false);
  assert.equal(lists[1].ordered, true);
});

test('nested brackets are not citations', () => {
  const ast = parseAnswer('See [[2]] and [1].');
  const cites = [];
  walkAnswer(ast, (node) => {
    if (node.type === 'cite') cites.push(node.n);
  });
  assert.deepEqual(cites, [1]);
  assert.equal(texts(ast).includes('[[2]]'), true);
});

test('streaming view paints once per frame with the latest text', () => {
  const paints = [];
  let queued = null;
  const view = createStreamingView(
    (text) => paints.push(text),
    (fn) => {
      queued = fn;
      return 1;
    },
    () => {
      queued = null;
    },
  );
  view.update('a');
  view.update('ab');
  assert.deepEqual(paints, []);
  queued();
  assert.deepEqual(paints, ['ab']);
});
