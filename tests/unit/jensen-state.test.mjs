import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_TURNS,
  THREAD_TTL_MS,
  emptyThread,
  loadThread,
  reduceHandoff,
  reduceThread,
  saveThread,
} from '../../src/scripts/jensen/state.js';

function memory() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test('a thread keeps at most 12 turns', () => {
  let thread = emptyThread();
  for (let index = 0; index < MAX_TURNS + 1; index += 1) {
    thread = reduceThread(thread, { type: 'begin', id: `t${index}`, question: `q${index}` });
    thread = reduceThread(thread, { type: 'complete', cited: [] });
  }
  assert.equal(thread.turns.length, MAX_TURNS);
  assert.equal(thread.turns[0].question, 'q1');
  const store = memory();
  saveThread(store, thread, 1_000);
  const loaded = loadThread(store, 1_000);
  assert.equal(loaded.turns.length, MAX_TURNS);
});

test('a thread older than 24 hours is discarded', () => {
  const store = memory();
  saveThread(store, reduceThread(emptyThread(), { type: 'begin', id: 't', question: 'hello there friend' }), 0);
  assert.equal(loadThread(store, THREAD_TTL_MS + 1), null);
});

test('corrupt storage does not throw', () => {
  const store = memory();
  store.setItem('sarif:jensen-thread:v1', '{');
  assert.equal(loadThread(store, 10), null);
});

test('deltas append and an in-flight turn is not persisted', () => {
  let thread = reduceThread(emptyThread(), { type: 'begin', id: 't', question: 'What is Jensen?' });
  thread = reduceThread(thread, { type: 'delta', text: 'A ' });
  thread = reduceThread(thread, { type: 'delta', text: 'layer.' });
  assert.equal(thread.turns[0].answer, 'A layer.');
  assert.equal(thread.turns[0].status, 'streaming');
  const store = memory();
  saveThread(store, thread, 50);
  const loaded = loadThread(store, 50);
  assert.equal(loaded.turns.length, 0);
});

test('handoff moves review to contact to sent, and ignores review while sending', () => {
  assert.equal(reduceHandoff('closed', 'review'), 'review');
  assert.equal(reduceHandoff('review', 'contact'), 'contact');
  assert.equal(reduceHandoff('sending', 'review'), 'sending');
  assert.equal(reduceHandoff('contact', 'sent'), 'sent');
  assert.equal(reduceHandoff('sent', 'close'), 'closed');
});
