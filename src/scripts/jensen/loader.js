/**
 * Boots the public Jensen panel. The heavy chunk loads on intent or idle.
 * Document listeners are bound once; the launcher is bound to the current root.
 */

const MARK = 'sarif:jensen-loader';

let appPromise = null;
let documentBound = false;

function load() {
  const root = document.getElementById('jensen-root');
  if (!root) return Promise.resolve(null);
  if (!appPromise) {
    appPromise = import('./jensen-app.js').then((mod) => mod.mount(root));
  }
  return appPromise.then((app) => {
    if (app?.root !== root) {
      appPromise = import('./jensen-app.js').then((mod) => mod.mount(root));
      return appPromise;
    }
    return app;
  });
}

function bindDocument() {
  if (documentBound) return;
  documentBound = true;
  document.documentElement.dataset.jensenLoader = MARK;
  document.addEventListener('jensen:ask', (event) => {
    const detail = event.detail || {};
    load().then((app) => app?.ask(detail.question || '', detail.autoSend === true));
  });
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-jensen-ask]') : null;
    if (!target) return;
    event.preventDefault();
    const question = target.getAttribute('data-jensen-ask') || '';
    const autoSend = target.getAttribute('data-jensen-autosend') === 'true';
    load().then((app) => app?.ask(question, autoSend));
  });
  document.addEventListener('astro:page-load', () => {
    load().then((app) => app?.onPageLoad());
  });
}

export function bootJensen() {
  const root = document.getElementById('jensen-root');
  const launcher = document.getElementById('jensen-launcher');
  if (!root || !launcher || root.dataset.jensenBound === '1') return;
  root.dataset.jensenBound = '1';
  bindDocument();
  const arm = () => { load().then((app) => app?.warm()); };
  launcher.addEventListener('pointerenter', arm, { once: true });
  launcher.addEventListener('focus', arm, { once: true });
  launcher.addEventListener('click', (event) => {
    event.preventDefault();
    load().then((app) => app?.open());
  });
  const idle = window.requestIdleCallback
    ? (fn) => window.requestIdleCallback(fn, { timeout: 1500 })
    : (fn) => window.setTimeout(fn, 1200);
  idle(() => { load(); });
}
