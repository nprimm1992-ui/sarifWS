/**
 * Thread and handoff state. No DOM. Persistence takes a Storage-like object.
 */

export const THREAD_KEY = 'sarif:jensen-thread:v1';
export const MAX_TURNS = 12;
export const THREAD_TTL_MS = 24 * 60 * 60 * 1000;

const IN_FLIGHT = new Set(['retrieving', 'composing', 'streaming']);

export function emptyThread() {
  return { sessionId: null, capabilities: null, turns: [], savedAt: 0 };
}

export function capabilitiesOf(value) {
  if (!value || typeof value !== 'object') return null;
  const record = value;
  return {
    streaming: record.streaming === true,
    sources: record.sources === true,
    scope: record.scope === true,
    prebrief: record.prebrief === true,
    memory_turns: Number.isFinite(record.memory_turns) ? record.memory_turns : 0,
  };
}

function last(thread) {
  return thread.turns[thread.turns.length - 1] || null;
}

function withLast(thread, update) {
  const turn = last(thread);
  if (!turn) return thread;
  const turns = thread.turns.slice(0, -1).concat(update(turn));
  return { ...thread, turns };
}

export function reduceThread(thread, action) {
  switch (action.type) {
    case 'session':
      return {
        ...thread,
        sessionId: action.sessionId,
        capabilities: capabilitiesOf(action.capabilities),
      };
    case 'forget-session':
      return { ...thread, sessionId: null };
    case 'begin':
      return {
        ...thread,
        turns: thread.turns.concat({
          id: action.id,
          question: action.question,
          answer: '',
          status: 'retrieving',
          sources: [],
          scope: null,
          cited: [],
          legacy: [],
        }).slice(-MAX_TURNS),
      };
    case 'phase':
      return withLast(thread, (turn) => (
        turn.status === 'streaming' ? turn : { ...turn, status: action.name }
      ));
    case 'sources':
      return withLast(thread, (turn) => ({ ...turn, sources: action.items }));
    case 'scope':
      return withLast(thread, (turn) => ({ ...turn, scope: action.scope }));
    case 'delta':
      return withLast(thread, (turn) => ({
        ...turn,
        status: 'streaming',
        answer: `${turn.answer}${action.text}`,
      }));
    case 'legacy':
      return withLast(thread, (turn) => ({
        ...turn,
        legacy: turn.legacy.concat({ url: action.url, title: action.title }),
      }));
    case 'complete':
      return withLast(thread, (turn) => ({
        ...turn,
        status: 'complete',
        cited: action.cited,
      }));
    case 'stop':
      return withLast(thread, (turn) => (
        IN_FLIGHT.has(turn.status) || turn.status === 'retrieving'
          ? { ...turn, status: 'stopped' }
          : turn
      ));
    case 'fail':
      return withLast(thread, (turn) => ({ ...turn, status: 'error' }));
    case 'reset':
      return { ...emptyThread(), savedAt: thread.savedAt };
    default:
      return thread;
  }
}

export function reduceHandoff(status, action) {
  if (action === 'review') return status === 'sending' ? status : 'review';
  if (action === 'contact') return 'contact';
  if (action === 'sending') return 'sending';
  if (action === 'sent') return 'sent';
  if (action === 'failed') return 'failed';
  if (action === 'close') return 'closed';
  return status;
}

function isTurn(value) {
  if (!value || typeof value !== 'object') return false;
  return typeof value.id === 'string' && typeof value.question === 'string' && typeof value.answer === 'string';
}

export function saveThread(storage, thread, now = Date.now()) {
  const turns = thread.turns.filter((turn) => !IN_FLIGHT.has(turn.status)).slice(-MAX_TURNS);
  storage.setItem(THREAD_KEY, JSON.stringify({
    sessionId: thread.sessionId,
    capabilities: thread.capabilities,
    turns,
    savedAt: now,
  }));
}

export function loadThread(storage, now = Date.now()) {
  const raw = storage.getItem(THREAD_KEY);
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.savedAt !== 'number') return null;
  if (now - parsed.savedAt > THREAD_TTL_MS) return null;
  if (!Array.isArray(parsed.turns)) return null;
  return {
    sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
    capabilities: capabilitiesOf(parsed.capabilities),
    turns: parsed.turns.filter(isTurn).slice(-MAX_TURNS),
    savedAt: parsed.savedAt,
  };
}
