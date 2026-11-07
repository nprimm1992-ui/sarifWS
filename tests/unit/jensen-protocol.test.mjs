import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSseParser, PROTOCOL } from '../../src/scripts/jensen/protocol.js';
import { classifyFailure } from '../../src/scripts/jensen/transport.js';

test('protocol name is the public v1 contract', () => {
  assert.equal(PROTOCOL, 'jensen.public.v1');
});

test('parser reassembles split chunks, CRLF, comments, and multi-line data', () => {
  const events = [];
  const parser = createSseParser((frame) => events.push(frame));
  parser.push('event: phase\r\n');
  parser.push('data: {"name":\r\n');
  parser.push('data: "retrieving"}\r\n\r\n');
  parser.push(': keep-alive\n\n');
  parser.push('event: future\ndata: {"ok":true}\n\n');
  parser.flush();
  assert.equal(events[0].event, 'phase');
  assert.deepEqual(events[0].data, { name: 'retrieving' });
  assert.equal(events[1].event, 'future');
  assert.equal(events[1].malformed, false);
});

test('a callback throw is not reported as malformed JSON', () => {
  const parser = createSseParser((frame) => {
    if (frame.event === 'problem' && frame.data) {
      const error = new Error('problem');
      error.code = frame.data.code;
      throw error;
    }
  });
  assert.throws(
    () => parser.push('event: problem\ndata: {"code":"session_limit","status":429}\n\n'),
    (error) => error.code === 'session_limit',
  );
});
test('malformed JSON is reported and does not throw', () => {
  const events = [];
  const parser = createSseParser((frame) => events.push(frame));
  parser.push('event: delta\ndata: {not json}\n\n');
  assert.equal(events[0].malformed, true);
  assert.equal(events[0].data, null);
});

test('classifyFailure prefers a problem code, then the status', () => {
  assert.equal(classifyFailure(503, { code: 'public_disabled' }), 'public_disabled');
  assert.equal(classifyFailure(400, { error: 'challenge_failed' }), 'challenge_failed');
  assert.equal(classifyFailure(404, null), 'session');
  assert.equal(classifyFailure(402, {}), 'over_budget');
  assert.equal(classifyFailure(500, null), 'network');
});
