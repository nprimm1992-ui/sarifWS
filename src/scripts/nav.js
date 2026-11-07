// nav.js — scroll detection & mobile menu
// Fully re-initializable for Astro View Transitions

let _observer = null;
let _escHandler = null;
let _linkHandlers = [];
let _focusTrapHandler = null;
let _toggleHandler = null;
let _closeHandler = null;
let _scrollHandler = null;
let _resizeHandler = null;
let _toggleEl = null;
let _closeEl = null;
let _mobileMenu = null;
let _navEl = null;

function syncNavScrolled(nav, sentinel) {
  if (!nav) return;
  if (document.documentElement.classList.contains('nav-menu-open')) return;
  if (sentinel) {
    nav.classList.toggle('scrolled', sentinel.getBoundingClientRect().bottom < 0);
  } else {
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }
}

function portalMobileMenu(mobileMenu, nav) {
  if (!mobileMenu || mobileMenu.parentElement === document.body) return;
  document.body.appendChild(mobileMenu);
  mobileMenu.dataset.navHome = 'site-nav';
}

function restoreMobileMenu(mobileMenu, nav) {
  if (!mobileMenu || !nav) return;
  if (mobileMenu.parentElement === nav) return;
  nav.appendChild(mobileMenu);
  delete mobileMenu.dataset.navHome;
}

function setMenuOpenState(open, { nav, mobileMenu, toggle, closeBtn, mainContent }) {
  document.documentElement.classList.toggle('nav-menu-open', open);

  if (open) {
    portalMobileMenu(mobileMenu, nav);
    mobileMenu?.removeAttribute('hidden');
    toggle?.setAttribute('aria-expanded', 'true');
    toggle?.setAttribute('aria-label', 'Close navigation menu');
    document.body.style.overflow = 'hidden';
    mainContent?.setAttribute('inert', '');
    if (closeBtn) {
      requestAnimationFrame(() => closeBtn.focus());
    } else {
      const firstLink = mobileMenu?.querySelector('a');
      if (firstLink) requestAnimationFrame(() => firstLink.focus());
    }
    return;
  }

  mobileMenu?.setAttribute('hidden', '');
  toggle?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-label', 'Open navigation menu');
  document.body.style.overflow = '';
  mainContent?.removeAttribute('inert');
  restoreMobileMenu(mobileMenu, nav);
  toggle?.focus();
}

function initNav() {
  cleanup();

  const nav = document.getElementById('site-nav');
  const sentinel = document.getElementById('nav-sentinel');
  const toggle = document.getElementById('nav-toggle');
  const closeBtn = document.getElementById('nav-close');
  const mobileMenu = document.getElementById('nav-mobile');
  const mainContent = document.getElementById('perspective-root');

  _navEl = nav;
  _toggleEl = toggle;
  _closeEl = closeBtn;
  _mobileMenu = mobileMenu;

  if (!nav) return;

  if (mobileMenu && mobileMenu.parentElement === document.body && mobileMenu.hasAttribute('hidden')) {
    restoreMobileMenu(mobileMenu, nav);
  }

  nav.classList.remove('scrolled');

  if (sentinel) {
    _observer = new IntersectionObserver(
      ([entry]) => {
        if (document.documentElement.classList.contains('nav-menu-open')) return;
        nav.classList.toggle('scrolled', !entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '0px' }
    );
    _observer.observe(sentinel);
    requestAnimationFrame(() => syncNavScrolled(nav, sentinel));
  } else {
    syncNavScrolled(nav, sentinel);
  }

  _scrollHandler = () => syncNavScrolled(nav, sentinel);
  window.addEventListener('scroll', _scrollHandler, { passive: true });
  _resizeHandler = _scrollHandler;
  window.addEventListener('resize', _resizeHandler, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('scroll', _scrollHandler);
    window.visualViewport.addEventListener('resize', _resizeHandler);
  }

  function openMenu() {
    if (!mobileMenu || !toggle) return;
    setMenuOpenState(true, { nav, mobileMenu, toggle, closeBtn, mainContent });
  }

  function closeMenu() {
    if (!mobileMenu || !toggle) return;
    setMenuOpenState(false, { nav, mobileMenu, toggle, closeBtn, mainContent });
    requestAnimationFrame(() => syncNavScrolled(nav, sentinel));
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
  if (_scrollHandler) {
    window.removeEventListener('scroll', _scrollHandler);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('scroll', _scrollHandler);
    }
    _scrollHandler = null;
  }
  if (_resizeHandler) {
    window.removeEventListener('resize', _resizeHandler);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', _resizeHandler);
    }
    _resizeHandler = null;
  }
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
  }

  const nav = _navEl ?? document.getElementById('site-nav');
  const mobileMenu = _mobileMenu ?? document.getElementById('nav-mobile');
  if (mobileMenu && nav) {
    restoreMobileMenu(mobileMenu, nav);
    mobileMenu.setAttribute('hidden', '');
  }

  _mobileMenu = null;
  _navEl = null;

  const mainContent = document.getElementById('perspective-root');
  if (mainContent) mainContent.removeAttribute('inert');
  document.body.style.overflow = '';
  document.documentElement.classList.remove('nav-menu-open');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNav, { once: true });
} else {
  initNav();
}

document.addEventListener('astro:page-load', initNav);
document.addEventListener('astro:before-swap', cleanup, { once: false });
