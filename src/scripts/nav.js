// nav.js — scroll detection & mobile menu
// Fully re-initializable for Astro View Transitions

let _observer = null;
let _escHandler = null;
let _linkHandlers = [];
let _focusTrapHandler = null;
let _toggleHandler = null;
let _closeHandler = null;
let _toggleEl = null;
let _closeEl = null;
let _mobileMenu = null;

function initNav() {
  cleanup();

  const nav = document.getElementById('site-nav');
  const sentinel = document.getElementById('nav-sentinel');
  const toggle = document.getElementById('nav-toggle');
  const closeBtn = document.getElementById('nav-close');
  const mobileMenu = document.getElementById('nav-mobile');
  const mainContent = document.getElementById('perspective-root');

  _toggleEl = toggle;
  _closeEl = closeBtn;
  _mobileMenu = mobileMenu;

  if (!nav) return;

  if (sentinel) {
    _observer = new IntersectionObserver(
      ([entry]) => {
        nav.classList.toggle('scrolled', !entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '0px' }
    );
    _observer.observe(sentinel);
  } else {
    if (window.scrollY > 10) nav.classList.add('scrolled');
  }

  function openMenu() {
    if (!mobileMenu || !toggle) return;
    mobileMenu.removeAttribute('hidden');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation menu');
    document.body.style.overflow = 'hidden';
    if (mainContent) mainContent.setAttribute('inert', '');
    if (closeBtn) {
      requestAnimationFrame(() => closeBtn.focus());
    } else {
      const firstLink = mobileMenu.querySelector('a');
      if (firstLink) requestAnimationFrame(() => firstLink.focus());
    }
  }

  function closeMenu() {
    if (!mobileMenu || !toggle) return;
    mobileMenu.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation menu');
    document.body.style.overflow = '';
    if (mainContent) mainContent.removeAttribute('inert');
    toggle.focus();
  }

  if (toggle) {
    _toggleHandler = () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      isOpen ? closeMenu() : openMenu();
    };
    toggle.addEventListener('click', _toggleHandler);
  }

  if (closeBtn) {
    _closeHandler = () => closeMenu();
    closeBtn.addEventListener('click', _closeHandler);
  }

  _escHandler = (e) => {
    if (e.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') {
      closeMenu();
    }
  };
  document.addEventListener('keydown', _escHandler);

  if (mobileMenu) {
    _linkHandlers = [];
    mobileMenu.querySelectorAll('a').forEach((link) => {
      const handler = () => closeMenu();
      link.addEventListener('click', handler);
      _linkHandlers.push({ el: link, handler });
    });

    _focusTrapHandler = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = mobileMenu.querySelectorAll('a, button');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    mobileMenu.addEventListener('keydown', _focusTrapHandler);
  }
}

function cleanup() {
  if (_observer) { _observer.disconnect(); _observer = null; }
  if (_escHandler) { document.removeEventListener('keydown', _escHandler); _escHandler = null; }

  _linkHandlers.forEach(({ el, handler }) => el.removeEventListener('click', handler));
  _linkHandlers = [];

  if (_toggleEl && _toggleHandler) {
    _toggleEl.removeEventListener('click', _toggleHandler);
    _toggleHandler = null;
    _toggleEl = null;
  }

  if (_closeEl && _closeHandler) {
    _closeEl.removeEventListener('click', _closeHandler);
    _closeHandler = null;
    _closeEl = null;
  }

  if (_mobileMenu && _focusTrapHandler) {
    _mobileMenu.removeEventListener('keydown', _focusTrapHandler);
    _focusTrapHandler = null;
    _mobileMenu = null;
  }

  const mainContent = document.getElementById('perspective-root');
  if (mainContent) mainContent.removeAttribute('inert');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNav, { once: true });
} else {
  initNav();
}

document.addEventListener('astro:page-load', initNav);
document.addEventListener('astro:before-swap', cleanup, { once: false });
