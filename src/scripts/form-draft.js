/**
 * SessionStorage-backed form draft persistence.
 *
 * Keeps non-sensitive form fields alive across reloads, bfcache restores,
 * and accidental tab closures. Email is deliberately excluded on the
 * contact form (the whole point is an identified inbound signal; we don't
 * want a stale email silently resubmitted).
 *
 * Data is scoped to sessionStorage (clears when the tab closes) and keyed
 * per-form so a user can have drafts on /contact and /praxis simultaneously.
 *
 * Usage:
 *   import { installFormDraft } from './form-draft.js';
 *   installFormDraft({
 *     formId: 'contact-form',
 *     storageKey: 'sarif:contact-draft',
 *     fields: ['name', 'organization', 'signal'],
 *     clearOnSubmitSuccess: () => submitWasSuccessful,
 *   });
 *
 * Returns a teardown function for Astro ClientRouter compat.
 */

const DEBOUNCE_MS = 350;
const FIELD_MAX = 10_500;

function safeGetItem(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exhausted / private browsing / etc — fail silently.
  }
}

function safeRemoveItem(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // No-op
  }
}

/**
 * @param {object} options
 * @param {string} options.formId
 * @param {string} options.storageKey
 * @param {string[]} options.fields                 — field names to persist
 * @param {string[]} [options.excludeOnRestore]     — fields saved but not auto-restored (e.g. email — saved to survive a crash but user must re-enter)
 * @returns {() => void}                            — teardown
 */
export function installFormDraft({ formId, storageKey, fields, excludeOnRestore = [] }) {
  if (typeof document === 'undefined') return () => {};

  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) return () => {};

  const abortController = new AbortController();
  const { signal } = abortController;

  // Restore on mount ─────────────────────────────────────────────────────
  const existing = safeGetItem(storageKey);
  if (existing) {
    for (const name of fields) {
      if (excludeOnRestore.includes(name)) continue;
      const value = existing[name];
      if (typeof value !== 'string') continue;
      const el = form.elements.namedItem(name);
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        if (!el.value) {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  }

  // Debounced persist on input ───────────────────────────────────────────
  let debounceHandle = 0;
  function persistNow() {
    const snapshot = {};
    for (const name of fields) {
      const el = form.elements.namedItem(name);
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        const v = typeof el.value === 'string' ? el.value : '';
        if (v) snapshot[name] = v.slice(0, FIELD_MAX);
      }
    }
    if (Object.keys(snapshot).length === 0) {
      safeRemoveItem(storageKey);
    } else {
      safeSetItem(storageKey, snapshot);
    }
  }

  function scheduleDebouncedPersist() {
    if (debounceHandle) {
      clearTimeout(debounceHandle);
    }
    debounceHandle = setTimeout(() => {
      debounceHandle = 0;
      persistNow();
    }, DEBOUNCE_MS);
  }

  form.addEventListener('input', scheduleDebouncedPersist, { signal });
  form.addEventListener('change', scheduleDebouncedPersist, { signal });

  // Cross-tab sync: if the user subscribes/transmits in another tab, clear
  // here too so we don't re-restore stale data on next open.
  window.addEventListener(
    'storage',
    (event) => {
      if (event.key === storageKey && event.newValue === null) {
        safeRemoveItem(storageKey);
      }
    },
    { signal },
  );

  // bfcache restore: if the tab was paused and is waking up, re-sync.
  window.addEventListener(
    'pageshow',
    (event) => {
      if (event.persisted) {
        persistNow();
      }
    },
    { signal },
  );

  // Teardown on Astro transitions.
  document.addEventListener(
    'astro:before-swap',
    () => {
      abortController.abort();
      if (debounceHandle) {
        clearTimeout(debounceHandle);
        persistNow();
      }
    },
    { once: true, signal },
  );

  return () => {
    abortController.abort();
    if (debounceHandle) {
      clearTimeout(debounceHandle);
      debounceHandle = 0;
    }
  };
}

/**
 * Clear a draft from storage. Call on a confirmed successful submission.
 * @param {string} storageKey
 */
export function clearFormDraft(storageKey) {
  safeRemoveItem(storageKey);
}

// ── Submission retry queue (P7a) ──────────────────────────────────────────
// If the API returned a transient error (502 mail_delayed / network abort),
// we queue the exact payload plus its idempotency key so a later `online`
// event — or the user's next visit — can flush it silently. The server's
// partial unique index (migration 0008) guarantees we never double-send,
// because the idempotency key still collapses retries at the storage layer.
//
// This is localStorage (not sessionStorage) because the whole point is a
// retry across tab closures. PII scope: the payload contains name, email,
// org, signal. Same sensitivity as the `signal` itself, which the browser
// has already stored in form state. We cap queued count and enforce a TTL
// so the queue does not accumulate indefinitely.

const QUEUE_KEY = 'sarif:submission-queue';
const QUEUE_MAX_ENTRIES = 4;
const QUEUE_TTL_MS = 6 * 60 * 60 * 1000;

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeQueue(entries) {
  try {
    if (entries.length === 0) {
      localStorage.removeItem(QUEUE_KEY);
    } else {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
    }
  } catch {
    // Quota / private — accept the loss; the user is still shown an error.
  }
}

function prune(entries) {
  const now = Date.now();
  return entries
    .filter((e) => e && typeof e === 'object' && typeof e.queuedAt === 'number')
    .filter((e) => now - e.queuedAt < QUEUE_TTL_MS)
    .slice(-QUEUE_MAX_ENTRIES);
}

/**
 * @param {object} entry
 * @param {string} entry.endpoint              — absolute path, e.g. /api/transmit
 * @param {string} entry.idempotencyKey         — propagated as X-Idempotency-Key
 * @param {unknown} entry.payload               — JSON-serializable body
 */
export function queueFailedSubmission(entry) {
  if (typeof localStorage === 'undefined') return;
  if (!entry || typeof entry.endpoint !== 'string' || !entry.idempotencyKey) return;
  const queue = prune(readQueue());
  queue.push({
    endpoint: entry.endpoint,
    idempotencyKey: entry.idempotencyKey,
    payload: entry.payload ?? {},
    queuedAt: Date.now(),
  });
  writeQueue(queue);
}

/**
 * Silently retry queued submissions. Returns the count that succeeded.
 * Called on `online` and `astro:page-load`. We never surface failures to
 * the UI — the user has already seen the error once; the queue is a best
 * effort net behind the primary flow.
 */
export async function flushSubmissionQueue() {
  if (typeof localStorage === 'undefined' || typeof fetch !== 'function') {
    return 0;
  }
  const queue = prune(readQueue());
  if (queue.length === 0) {
    writeQueue([]);
    return 0;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    writeQueue(queue);
    return 0;
  }
  const remaining = [];
  let succeeded = 0;
  for (const entry of queue) {
    try {
      const res = await fetch(entry.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': entry.idempotencyKey,
        },
        body: JSON.stringify(entry.payload ?? {}),
        keepalive: true,
      });
      const json = await res.json().catch(() => ({}));
      const ok = res.ok && (json?.ok !== false) && (json?.success !== false);
      if (ok) {
        succeeded += 1;
      } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        // 4xx (except 429) indicates a permanent validation failure —
        // drop the entry, no point in retrying.
      } else {
        remaining.push(entry);
      }
    } catch {
      remaining.push(entry);
    }
  }
  writeQueue(remaining);
  return succeeded;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushSubmissionQueue();
  });
  document.addEventListener('astro:page-load', () => {
    void flushSubmissionQueue();
  });
}
