// audio.js — Procedural ambient audio for Sarif Consulting
// Web Audio API: facility hum + interaction tones. Zero file assets.

const STORAGE_KEY = 'sarif-audio-enabled';
const BASE_FREQ = 110; // A2 — brighter lobby ambience
const HUM_GAIN = 0.010;
const NOISE_GAIN = 0.003;

let audioCtx = null;
let masterGain = null;
let baseOsc = null;
let noiseSource = null;
let isPlaying = false;

function getStoredPreference() {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}

function setStoredPreference(val) {
  try { localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false'); } catch { /* noop */ }
}

function createNoiseBuffer(ctx) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/* Linear fade-in duration from 0 → 1 on masterGain. 2s is the default
   cinematic ramp; users who prefer reduced motion get a 0s snap so the
   "ambience fade" never registers as motion. */
const AMBIENT_FADE_IN_SECONDS_DEFAULT = 2;

function startAmbient() {
  if (isPlaying) return;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();

  /* Pillar 4d: decouple audio from prefers-reduced-motion. Honouring the
     user's explicit audio preference is the correct behaviour; reduced
     motion only suppresses the fade-in ramp (which is a motion-adjacent
     visual-equivalent cue), not the audio itself. */
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fadeSeconds = reducedMotion ? 0 : AMBIENT_FADE_IN_SECONDS_DEFAULT;

  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
  if (fadeSeconds > 0) {
    masterGain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + fadeSeconds);
  } else {
    masterGain.gain.setValueAtTime(1, audioCtx.currentTime);
  }
  masterGain.connect(audioCtx.destination);

  // Base oscillator — deep sine hum
  baseOsc = audioCtx.createOscillator();
  baseOsc.type = 'sine';
  baseOsc.frequency.setValueAtTime(BASE_FREQ, audioCtx.currentTime);
  const baseGain = audioCtx.createGain();
  baseGain.gain.setValueAtTime(HUM_GAIN, audioCtx.currentTime);
  baseOsc.connect(baseGain);
  baseGain.connect(masterGain);
  baseOsc.start();

  // Second harmonic — slightly detuned for richness
  const harmOsc = audioCtx.createOscillator();
  harmOsc.type = 'sine';
  harmOsc.frequency.setValueAtTime(BASE_FREQ * 2.01, audioCtx.currentTime);
  const harmGain = audioCtx.createGain();
  harmGain.gain.setValueAtTime(HUM_GAIN * 0.3, audioCtx.currentTime);
  harmOsc.connect(harmGain);
  harmGain.connect(masterGain);
  harmOsc.start();

  // Filtered noise — facility air handling
  const noiseBuffer = createNoiseBuffer(audioCtx);
  noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(200, audioCtx.currentTime);
  noiseFilter.Q.setValueAtTime(0.5, audioCtx.currentTime);
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(NOISE_GAIN, audioCtx.currentTime);
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSource.start();

  // Slow tonal drift — LFO modulating base frequency
  const lfo = audioCtx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.05, audioCtx.currentTime);
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.setValueAtTime(2, audioCtx.currentTime);
  lfo.connect(lfoGain);
  lfoGain.connect(baseOsc.frequency);
  lfo.start();

  isPlaying = true;
}

/* Fade-out envelope length. Matches the 1200ms setTimeout below so the
   osc.stop() / ctx.close() happen ~200ms AFTER the gain reaches zero,
   which prevents an audible click on engines that don't apply the
   final ramp sample before teardown. */
const AMBIENT_FADE_OUT_SECONDS = 1;
const AMBIENT_TEARDOWN_DELAY_MS = 1200;

function stopAmbient() {
  if (!isPlaying) return;

  /* Release module state IMMEDIATELY — before the fade-out settles. A
     user who rapidly toggles OFF then ON during the fade would otherwise
     see startAmbient() early-return on `isPlaying` (stale) or re-use a
     closing audioCtx. Detach the dying chain into a local handle, null
     out the module-level refs, and let the detached handle finish its
     ramp + teardown independently. A subsequent startAmbient() will
     build a fresh AudioContext and graph with zero cross-talk. */
  const dying = { ctx: audioCtx, gain: masterGain, base: baseOsc, noise: noiseSource };
  audioCtx = null;
  masterGain = null;
  baseOsc = null;
  noiseSource = null;
  isPlaying = false;

  if (!dying.ctx || !dying.gain) return;
  try {
    const now = dying.ctx.currentTime;
    dying.gain.gain.cancelScheduledValues(now);
    dying.gain.gain.setValueAtTime(dying.gain.gain.value, now);
    dying.gain.gain.linearRampToValueAtTime(0, now + AMBIENT_FADE_OUT_SECONDS);
  } catch { /* noop */ }

  setTimeout(() => {
    try { if (dying.base) dying.base.stop(); } catch { /* noop */ }
    try { if (dying.noise) dying.noise.stop(); } catch { /* noop */ }
    try { dying.ctx.close(); } catch { /* noop */ }
  }, AMBIENT_TEARDOWN_DELAY_MS);
}

let _lastInteractionTone = 0;
const INTERACTION_COOLDOWN_MS = 120;

export function playInteractionTone() {
  if (!isPlaying || !audioCtx) return;
  const now = performance.now();
  if (now - _lastInteractionTone < INTERACTION_COOLDOWN_MS) return;
  _lastInteractionTone = now;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, audioCtx.currentTime);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.018, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

export function playClickTone() {
  if (!isPlaying || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(720, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(480, audioCtx.currentTime + 0.05);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.025, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.12);
}

let _audioAbortController = null;
let _audioSwapTeardownAttached = false;

/* Pillar 6b — ambient ducking for assertive aria-live announcements.
   When an error summary, toast, or role="alert" node mutates, we dip the
   master bed so the announcement lands cleanly. DOM-only detection means
   we duck for any viewer reading the message, not only users with an
   assistive tech stack active. Tuning: ATTACK short (snap out of the way),
   HOLD cover a typical announcement read, RELEASE long (no pop back).
   Floor of 0.15 keeps a presence tail — full silence reads as a glitch. */
const DUCK_FLOOR_GAIN = 0.15;
const DUCK_HOLD_MS = 1800;
const DUCK_ATTACK_SECONDS = 0.15;
const DUCK_RELEASE_SECONDS = 0.8;
const DUCK_REGION_SELECTOR = '[aria-live="assertive"], [role="alert"]';

let _duckObserver = null;
let _duckReleaseTimer = null;

function duckAmbient() {
  if (!isPlaying || !audioCtx || !masterGain) return;
  try {
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(DUCK_FLOOR_GAIN, now + DUCK_ATTACK_SECONDS);
  } catch { /* noop */ }

  if (_duckReleaseTimer) clearTimeout(_duckReleaseTimer);
  _duckReleaseTimer = setTimeout(() => {
    _duckReleaseTimer = null;
    if (!audioCtx || !masterGain) return;
    try {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(1, now + DUCK_RELEASE_SECONDS);
    } catch { /* noop */ }
  }, DUCK_HOLD_MS);
}

/* Target the observer at the known aria-live="assertive" / role="alert"
   regions on the current page rather than the entire document.body.
   Benefits:
     1. Callback only fires for mutations that could possibly matter —
        eliminates work on pages with heavy animated DOM (reveal.js
        staggered grids, the lobby ticker's dust/emblem DOM writes, etc.).
     2. The target-set is re-scanned on every startDuckObserver() call,
        which pairs with astro:before-swap / astro:page-load: the old
        regions are disconnected on teardown, new regions picked up on
        the next init. No stale-node leaks, no cross-page silence. */
function startDuckObserver() {
  if (_duckObserver || typeof MutationObserver === 'undefined') return;
  const regions = document.querySelectorAll(DUCK_REGION_SELECTOR);
  if (regions.length === 0) {
    /* No assertive regions on this page — keep _duckObserver null so a
       later start call (after ClientRouter swap into a page that DOES
       have one) re-scans fresh. This is a perf win; the observer
       itself is never allocated when it has nothing to watch. */
    return;
  }
  _duckObserver = new MutationObserver((mutations) => {
    /* At least one mutation must be inside an assertive region; because
       every observed root IS an assertive region (or its subtree is),
       any mutation reaching us qualifies, so we duck on the first
       mutation record rather than looping. */
    if (mutations.length > 0) duckAmbient();
  });
  for (const region of regions) {
    _duckObserver.observe(region, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
}

function stopDuckObserver() {
  if (_duckObserver) {
    _duckObserver.disconnect();
    _duckObserver = null;
  }
  if (_duckReleaseTimer) {
    clearTimeout(_duckReleaseTimer);
    _duckReleaseTimer = null;
  }
}

/* Pillar 6b — hidden-tab suspend. AudioContext keeps its rAF-cadence
   scheduler alive even in background tabs on some engines; suspending
   eliminates the wakeups, keeps laptop fans quiet, and satisfies the
   "don't play audio the user can't hear" heuristic browsers watch for. */
function handleVisibilityChange() {
  if (!audioCtx) return;
  if (document.visibilityState === 'hidden') {
    audioCtx.suspend().catch(() => { /* noop */ });
  } else if (document.visibilityState === 'visible' && isPlaying) {
    audioCtx.resume().catch(() => { /* noop */ });
  }
}

/* Pillar 6b — route-transition lift tone. ClientRouter swaps the main
   view without a full page load; the one-note rising chirp gives the
   navigation the same "you moved" confirmation a pushState would lose.
   Fires on `astro:before-swap` so it sits under the outgoing DOM, not
   on top of the fresh one. Gated by isPlaying — silent users stay silent. */
function playRouteLiftTone() {
  if (!isPlaying || !audioCtx || !masterGain) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.18);
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.012, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.24);
  } catch { /* noop */ }
}

function teardownAudioListeners() {
  if (_audioAbortController) {
    _audioAbortController.abort();
    _audioAbortController = null;
  }
  stopDuckObserver();
}

function handleAudioBeforeSwap() {
  playRouteLiftTone();
  teardownAudioListeners();
}

function ensureAudioSwapTeardown() {
  if (_audioSwapTeardownAttached) return;
  _audioSwapTeardownAttached = true;
  document.addEventListener('astro:before-swap', handleAudioBeforeSwap);
}

/* Sync every [data-audio-toggle] button (desktop pill + mobile drawer
   entry) to the authoritative `isPlaying` state. Safe to call any time
   after DOM ready; iterates a live query so late-mounted toggles still
   pick up the correct state on the next invocation. */
function syncAudioToggleUI(enabled) {
  const toggles = document.querySelectorAll('[data-audio-toggle]');
  const pressed = enabled ? 'true' : 'false';
  const label = enabled ? 'ON' : 'OFF';
  for (const el of toggles) {
    el.setAttribute('aria-pressed', pressed);
    const stateEl = el.querySelector('.audio-toggle__state');
    if (stateEl) stateEl.textContent = label;
  }
}

export function initAudio() {
  const toggles = document.querySelectorAll('[data-audio-toggle]');
  if (toggles.length === 0) return;

  teardownAudioListeners();
  ensureAudioSwapTeardown();
  _audioAbortController = new AbortController();
  const { signal } = _audioAbortController;

  const stored = getStoredPreference();
  syncAudioToggleUI(stored);
  if (stored) startAmbient();

  /* Duck observer only attaches when ambient is actually playing AND
     the current page has at least one assertive aria-live / alert
     region. Called here (not inside startAmbient) because startAmbient
     short-circuits when isPlaying is already true across a ClientRouter
     swap — but the DOM targets are fresh on each page, so the observer
     must re-scan per init even if the audio context persists. */
  if (isPlaying) startDuckObserver();

  document.addEventListener('visibilitychange', handleVisibilityChange, { signal });

  /* One click handler per toggle. Each click flips `isPlaying` and
     sweeps every toggle in the DOM to the new state, so the desktop
     pill and mobile drawer entry always read the same status even if
     only one was clicked. */
  const handleToggleClick = () => {
    const next = !isPlaying;
    if (next) {
      startAmbient();
      startDuckObserver();
    } else {
      stopAmbient();
      stopDuckObserver();
    }
    setStoredPreference(next);
    syncAudioToggleUI(next);
  };

  for (const el of toggles) {
    el.addEventListener('click', handleToggleClick, { signal });
  }

  document.addEventListener(
    'mouseenter',
    (e) => {
      if (e.target.closest && e.target.closest('.service-card-wrapper, .proof-entry, .proof-strip, .lane, .btn-primary, .btn-gold, .glass-panel')) {
        playInteractionTone();
      }
    },
    { capture: true, signal },
  );

  /* Pillar 6a: scope click tones to an intentional allowlist. The earlier
     `a, button, [role="button"]` selector fired on every navigable chrome
     element (breadcrumbs, utility icons, scrollers), turning incidental
     taps into auditory noise. The allowlist below matches primary CTAs
     and deliberate navigation surfaces, plus an opt-in `[data-audio-click]`
     escape hatch for components that want explicit participation without
     re-introducing the generic rule. */
  const CLICK_TONE_SELECTOR =
    '.btn-primary, .btn-gold, .nav-link, .nav-mobile-link, [data-audio-click]';
  document.addEventListener(
    'click',
    (e) => {
      if (e.target.closest && e.target.closest(CLICK_TONE_SELECTOR)) {
        playClickTone();
      }
    },
    { capture: true, signal },
  );
}
