(function () {
  'use strict';

  var AUTH_KIND = 22242;
  var NIP46_KIND = 24133;
  var NIP46_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net'
  ];

  var IDB_DB_NAME = 'wizardry-blog-auth';
  var IDB_STORE_NAME = 'kv';
  var KEY_DEVICE_SESSION = 'nostr_device_session_v1';
  var KEY_NIP46_PAIR = 'nostr_nip46_pair_v1';
  var NAV_TOAST_KEY = 'wizardry_blog_nav_toast_v1';
  var NOSTR_PAGE_BOOTSTRAP_CACHE_PREFIX = 'nostr_page_bootstrap_v1:';
  var ARCHIVE_CACHE_KEY = 'wizardry_archive_html_v1';
  var TAGS_CACHE_KEY = 'wizardry_tags_html_v1';
  var SITE_TITLE_CACHE_KEY = 'wizardry_blog_site_title_v1';
  var APPEND_SITE_TITLE_CACHE_KEY = 'wizardry_blog_append_site_title_to_page_title_v1';
  var PLUGINS_CACHE_KEY = 'wizardry_plugins_v1';
  var NOSTR_PAGE_PREFETCH_EXCLUDE = {
    about: true,
    blog: true,
    admin: true,
    compose: true,
    account: true,
    users: true
  };

  var state = {
    currentTheme: 'archmage',
    isAuthenticated: false,
    plugins: {
      nostr_support: true,
      nostr_login: true,
      nostr_bridge: true,
      nostr_posts: true,
      zaps: true,
      btcpay: true,
      video_chat: false
    },
    manualChallenge: null,
    idbPromise: null,
    nip46: {
      active: false,
      appSecretHex: '',
      appPubkey: '',
      pairSecret: '',
      signerPubkey: '',
      relays: NIP46_RELAYS.slice(),
      pool: null,
      subscription: null,
      pending: {},
      pendingTimers: {},
      seenEvents: {}
    },
    prefetchedNostrPageSlugs: {},
    navOverflowRaf: 0
  };

  var els = {
    loginBtn: document.getElementById('login-btn'),
    loginSplit: document.getElementById('nav-login-split'),
    loginMoreBtn: document.getElementById('login-more-btn'),
    loginMenu: document.getElementById('nav-login-menu'),
    loginMenuRegister: document.getElementById('login-menu-register'),
    loginMenuPhone: document.getElementById('login-menu-phone'),
    loginMenuManual: document.getElementById('login-menu-manual'),
    loginMenuLearn: document.getElementById('login-menu-learn'),
    navToastHost: document.getElementById('nav-top-toast-host'),
    composeTools: document.getElementById('nav-compose-tools'),
    composeLink: document.querySelector('.nav-compose'),
    userMenu: document.getElementById('nav-user-menu'),
    menuBtn: document.getElementById('nav-menu-btn'),
    menuPanel: document.getElementById('nav-menu-panel'),
    navOverflowMenu: document.getElementById('nav-overflow-menu'),
    navOverflowBtn: document.getElementById('nav-overflow-btn'),
    navOverflowCount: document.getElementById('nav-overflow-count'),
    navOverflowPanel: document.getElementById('nav-overflow-panel'),
    menuPrimaryLink: document.getElementById('nav-menu-primary-link'),
    menuLogoutBtn: document.getElementById('nav-menu-logout'),
    menuLogoutEverywhereBtn: document.getElementById('nav-menu-logout-everywhere'),
    userName: document.getElementById('nav-user-name'),

    authModal: document.getElementById('auth-modal'),
    authInfoModal: document.getElementById('nostr-info-modal'),
    authModalTitle: document.getElementById('auth-modal-title'),
    authMessage: document.getElementById('auth-modal-message'),
    authRegisterBtn: document.getElementById('auth-register-btn'),
    authRegisterUsername: document.getElementById('auth-register-username'),
    authPhoneConnectBtn: document.getElementById('auth-phone-connect-btn'),
    authPhoneBtn: document.getElementById('auth-phone-btn'),
    authTabRegister: document.getElementById('auth-tab-register'),
    authTabPhone: document.getElementById('auth-tab-phone'),
    authTabManual: document.getElementById('auth-tab-manual'),

    authRegisterPanel: document.getElementById('auth-register-panel'),
    authPhonePanel: document.getElementById('auth-phone-panel'),
    authNip46Qr: document.getElementById('auth-nip46-qr'),
    authNip46Uri: document.getElementById('auth-nip46-uri'),
    authNip46Open: document.getElementById('auth-nip46-open'),

    authManualPanel: document.getElementById('auth-manual-panel'),
    authManualStart: document.getElementById('auth-manual-start'),
    authManualRequestId: document.getElementById('auth-manual-request-id'),
    authManualChallenge: document.getElementById('auth-manual-challenge'),
    authManualExpires: document.getElementById('auth-manual-expires'),
    authManualTemplate: document.getElementById('auth-manual-template'),
    authManualEvent: document.getElementById('auth-manual-event'),
    authManualSubmit: document.getElementById('auth-manual-submit')
  };

  var authModalHideTimer = null;
  var themeSwitchVisualTimer = null;
  var themeSwapToken = 0;

  function nowEpoch() {
    return Math.floor(Date.now() / 1000);
  }

  function randomHex(bytesLen) {
    var size = Number(bytesLen || 16);
    var bytes = new Uint8Array(size);
    window.crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  function bytesToHex(bytes) {
    return Array.from(bytes || []).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function hexToBytes(hex) {
    var raw = String(hex || '').trim();
    if (!/^[0-9a-fA-F]+$/.test(raw) || raw.length % 2 !== 0) {
      throw new Error('Invalid hex input');
    }
    var out = new Uint8Array(raw.length / 2);
    for (var i = 0; i < raw.length; i += 2) {
      out[i / 2] = parseInt(raw.slice(i, i + 2), 16);
    }
    return out;
  }

  function compact(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function normalizePlugins(raw) {
    var src = raw && typeof raw === 'object' ? raw : {};
    var normalized = {
      nostr_support: src.nostr_support !== false,
      nostr_login: src.nostr_login !== false,
      nostr_bridge: src.nostr_bridge !== false,
      nostr_posts: src.nostr_posts !== false,
      zaps: src.zaps !== false,
      btcpay: src.btcpay !== false,
      video_chat: src.video_chat === true
    };
    if (!normalized.nostr_support) {
      normalized.nostr_login = false;
      normalized.nostr_bridge = false;
      normalized.nostr_posts = false;
      normalized.zaps = false;
    }
    return normalized;
  }

  function cachePlugins(plugins) {
    try {
      localStorage.setItem(PLUGINS_CACHE_KEY, JSON.stringify(plugins || {}));
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function readCachedPlugins() {
    try {
      var raw = localStorage.getItem(PLUGINS_CACHE_KEY);
      if (!raw) {
        return null;
      }
      return normalizePlugins(JSON.parse(raw));
    } catch (_err) {
      return null;
    }
  }

  function publishPlugins(plugins) {
    state.plugins = normalizePlugins(plugins);
    cachePlugins(state.plugins);
    window.__wizardryPlugins = state.plugins;
    window.__wizardryVideoChatEnabled = !!state.plugins.video_chat;
    try {
      window.dispatchEvent(new CustomEvent('wizardry-plugins-ready', {
        detail: { plugins: state.plugins }
      }));
    } catch (_err) {
      // Ignore event dispatch failures.
    }
  }

  function syncPluginAuthUi() {
    if (state.isAuthenticated) {
      return;
    }
    var loginEnabled = !(state.plugins && state.plugins.nostr_login === false);
    if (!loginEnabled) {
      if (els.loginSplit) {
        els.loginSplit.style.display = 'none';
      } else if (els.loginBtn) {
        els.loginBtn.style.display = 'none';
      }
      return;
    }
    if (els.loginSplit) {
      els.loginSplit.style.display = '';
    }
    if (els.loginBtn) {
      els.loginBtn.style.display = '';
    }
  }

  function normalizeSiteTitle(value) {
    var text = compact(value);
    return text || 'Site';
  }

  function updateNavSiteSignature(title) {
    var node = document.getElementById('nav-site-signature');
    if (!node) {
      return;
    }
    var next = normalizeSiteTitle(title);
    if (node.textContent !== next) {
      node.textContent = next;
    }
    node.setAttribute('title', next);
  }

  function cacheSiteTitle(title) {
    try {
      localStorage.setItem(SITE_TITLE_CACHE_KEY, normalizeSiteTitle(title));
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function normalizeAppendSiteTitleEnabled(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function cacheAppendSiteTitleEnabled(enabled) {
    try {
      localStorage.setItem(APPEND_SITE_TITLE_CACHE_KEY, normalizeAppendSiteTitleEnabled(enabled) ? '1' : '0');
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function composeIconSvgPaths() {
    return [
      {
        id: "custom:quill-icon-32",
        name: "quill-icon-32",
        viewBox: "0 0 256 256",
        body: '<path fill="currentColor" d="m229.66 58.34l-32-32a8 8 0 0 0-11.32 0l-96 96A8 8 0 0 0 88 128v32a8 8 0 0 0 8 8h32a8 8 0 0 0 5.66-2.34l96-96a8 8 0 0 0 0-11.32M124.69 152H104v-20.69l64-64L188.69 88ZM200 76.69L179.31 56L192 43.31L212.69 64ZM224 128v80a16 16 0 0 1-16 16H48a16 16 0 0 1-16-16V48a16 16 0 0 1 16-16h80a8 8 0 0 1 0 16H48v160h160v-80a8 8 0 0 1 16 0"/>'
      }
    ];
  }

  function readComposeIconIndex() {
    return 0;
  }

  function renderComposeIcon(index) {
    if (!els.composeLink) {
      return;
    }
    var icons = composeIconSvgPaths();
    var count = icons.length;
    var idx = Number(index || 0);
    if (!isFinite(idx) || idx < 0) {
      idx = 0;
    }
    idx = idx % count;
    var icon = icons[idx];
    var body = typeof icon === 'string' ? icon : (icon && icon.body ? icon.body : '');
    var src = (icon && icon.src) ? String(icon.src) : '';
    var viewBox = (icon && icon.viewBox) ? icon.viewBox : '0 0 24 24';
    if (src) {
      els.composeLink.innerHTML = '<img src="' + src + '" width="21" height="21" alt="" aria-hidden="true">';
    } else {
      els.composeLink.innerHTML = '<svg width="21" height="21" viewBox="' + viewBox + '" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
    }
  }

  function waitMs(ms) {
    var delay = Number(ms || 0);
    if (!isFinite(delay) || delay < 0) {
      delay = 0;
    }
    return new Promise(function (resolve) {
      setTimeout(resolve, delay);
    });
  }

  function currentHost() {
    return window.location.host;
  }

  function currentOrigin() {
    return window.location.origin;
  }

  function currentAuthSignatureForCache() {
    try {
      var sessionToken = String(localStorage.getItem('session_token') || '').trim();
      var csrfToken = String(localStorage.getItem('csrf_token') || '').trim();
      return sessionToken + '|' + csrfToken;
    } catch (_err) {
      return '|';
    }
  }

  function writeNostrPageBootstrapCache(slug, payload) {
    var safeSlug = String(slug || '').trim();
    if (!safeSlug || !payload || typeof payload !== 'object') {
      return;
    }
    try {
      localStorage.setItem(NOSTR_PAGE_BOOTSTRAP_CACHE_PREFIX + safeSlug, JSON.stringify({
        auth_signature: currentAuthSignatureForCache(),
        payload: payload,
        saved_at: Date.now()
      }));
    } catch (_err) {
      // Ignore cache write failures.
    }
  }

  function slugFromHref(href) {
    var raw = String(href || '').trim();
    if (!raw || raw.indexOf('javascript:') === 0) {
      return '';
    }
    try {
      var url = new URL(raw, window.location.href);
      if (url.origin !== window.location.origin) {
        return '';
      }
      var path = String(url.pathname || '').replace(/\/+$/, '');
      if (!path || path === '/') {
        return 'index';
      }
      var slug = path;
      if (slug.indexOf('/pages/') === 0) {
        slug = slug.slice('/pages/'.length);
      } else if (slug.indexOf('/') === 0) {
        slug = slug.slice(1);
      }
      slug = slug.replace(/\.html?$/i, '');
      if (!slug) {
        slug = 'index';
      }
      return slug;
    } catch (_err) {
      return '';
    }
  }

  function prefetchNostrPageBootstrap(slug) {
    var safeSlug = String(slug || '').trim();
    if (!safeSlug || NOSTR_PAGE_PREFETCH_EXCLUDE[safeSlug] || state.prefetchedNostrPageSlugs[safeSlug]) {
      return;
    }
    state.prefetchedNostrPageSlugs[safeSlug] = true;
    var body = new URLSearchParams({
      page_slug: safeSlug
    });
    fetch('/cgi/blog-get-nostr-page', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (_parseErr) {
          return;
        }
        if (!data || data.success === false) {
          return;
        }
        writeNostrPageBootstrapCache(safeSlug, data);
      })
      .catch(function () {
        // Ignore prefetch errors.
      });
  }

  function prefetchStaticPageHtmlForSlug(slug) {
    var safeSlug = String(slug || '').trim();
    var endpoint = '';
    var cacheKey = '';
    if (safeSlug === 'archive') {
      endpoint = '/cgi/blog-archive';
      cacheKey = ARCHIVE_CACHE_KEY;
    } else if (safeSlug === 'tags') {
      endpoint = '/cgi/blog-tags';
      cacheKey = TAGS_CACHE_KEY;
    } else {
      return;
    }
    if (state.prefetchedNostrPageSlugs['static:' + safeSlug]) {
      return;
    }
    state.prefetchedNostrPageSlugs['static:' + safeSlug] = true;
    fetch(endpoint, { credentials: 'same-origin' })
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var text = String(html || '');
        if (!text) {
          return;
        }
        try {
          localStorage.setItem(cacheKey, text);
        } catch (_err) {
          // Ignore cache write failures.
        }
      })
      .catch(function () {
        // Ignore prefetch failures.
      });
  }

  function bindNavbarNostrPagePrefetch() {
    var navCenter = document.querySelector('.nav-center');
    if (!navCenter) {
      return;
    }

    function triggerFromTarget(target) {
      if (!target || !target.closest) {
        return;
      }
      var link = target.closest('a[href]');
      if (!link) {
        return;
      }
      var slug = slugFromHref(link.getAttribute('href') || '');
      if (!slug) {
        return;
      }
      prefetchStaticPageHtmlForSlug(slug);
      prefetchNostrPageBootstrap(slug);
    }

    navCenter.addEventListener('mouseover', function (event) {
      triggerFromTarget(event.target);
    });
    navCenter.addEventListener('focusin', function (event) {
      triggerFromTarget(event.target);
    });
    navCenter.addEventListener('touchstart', function (event) {
      triggerFromTarget(event.target);
    }, { passive: true });
  }

  function warmNavbarNostrPagePrefetch() {
    // Intentionally disabled: this eager fanout added avoidable concurrent
    // bootstrap CGI calls during first paint. Keep prefetch on direct user
    // intent (hover/focus/touch) via bindNavbarNostrPagePrefetch().
    return;
  }

  function hasNostrTools() {
    return !!(window.NostrTools &&
      typeof window.NostrTools.generateSecretKey === 'function' &&
      typeof window.NostrTools.getPublicKey === 'function' &&
      typeof window.NostrTools.finalizeEvent === 'function' &&
      window.NostrTools.nip04 &&
      typeof window.NostrTools.nip04.encrypt === 'function' &&
      typeof window.NostrTools.nip04.decrypt === 'function' &&
      typeof window.NostrTools.SimplePool === 'function');
  }

  function getBrowserSigner() {
    var signer = window.nostr || null;
    if (!signer) {
      throw new Error('No browser signer detected. Install nos2x-fox or use phone/manual login.');
    }
    if (typeof signer.signEvent !== 'function') {
      throw new Error('Browser signer is missing signEvent.');
    }
    return signer;
  }

  function ensureAuthMessageEl() {
    if (els.authMessage) {
      return els.authMessage;
    }
    if (!els.authModal || !els.authModal.querySelector) {
      return null;
    }
    var panel = els.authModal.querySelector('.auth-modal-panel');
    if (!panel) {
      return null;
    }
    var existing = panel.querySelector('#auth-modal-message');
    if (existing) {
      els.authMessage = existing;
      return els.authMessage;
    }
    var node = document.createElement('div');
    node.id = 'auth-modal-message';
    node.className = 'auth-modal-message';
    node.setAttribute('aria-live', 'polite');
    panel.appendChild(node);
    els.authMessage = node;
    return els.authMessage;
  }

  function setAuthMessage(message, kind) {
    var target = ensureAuthMessageEl();
    if (!target) {
      return;
    }
    var text = String(message || '');
    target.textContent = text;
    target.className = 'auth-modal-message';
    if (text && kind) {
      target.classList.add('is-' + kind);
    }
  }

  function rememberNavToast(message, tone, durationMs) {
    try {
      sessionStorage.setItem(NAV_TOAST_KEY, JSON.stringify({
        message: String(message || ''),
        tone: String(tone || 'info'),
        durationMs: Number(durationMs || 3600),
        at: Date.now()
      }));
    } catch (_err) {
      // Ignore storage write failures; in-place toasts still work.
    }
  }

  function showNavToast(message, tone, durationMs) {
    var text = String(message || '').trim();
    if (!text) {
      return;
    }
    var host = els.navToastHost;
    if (!host) {
      host = document.createElement('div');
      host.id = 'nav-top-toast-host';
      host.className = 'nav-top-toast-host';
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-atomic', 'true');
      document.body.appendChild(host);
      els.navToastHost = host;
    }
    host.innerHTML = '';
    var toast = document.createElement('div');
    toast.className = 'nav-top-toast';
    if (tone) {
      toast.classList.add('is-' + String(tone));
    }
    toast.textContent = text;
    host.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add('is-visible');
    });
    var stay = Number(durationMs || 3600);
    if (!isFinite(stay) || stay < 1200) {
      stay = 3600;
    }
    setTimeout(function () {
      toast.classList.add('is-closing');
      setTimeout(function () {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 230);
    }, stay);
  }

  function flushRememberedNavToast() {
    var raw = '';
    try {
      raw = sessionStorage.getItem(NAV_TOAST_KEY) || '';
      if (raw) {
        sessionStorage.removeItem(NAV_TOAST_KEY);
      }
    } catch (_err) {
      raw = '';
    }
    if (!raw) {
      return;
    }
    try {
      var payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object') {
        return;
      }
      showNavToast(payload.message || '', payload.tone || 'info', payload.durationMs || 3600);
    } catch (_err2) {
      // Ignore malformed persisted toasts.
    }
  }

  function requestSignerApproval(signEventFn, template, waitingMessage, timeoutMs) {
    var waitText = String(waitingMessage || 'Waiting for signer approval...');
    var timeout = Number(timeoutMs || 70000);
    if (!isFinite(timeout) || timeout < 1000) {
      timeout = 70000;
    }
    var settled = false;
    var hintTimer = setTimeout(function () {
      if (settled) {
        return;
      }
      setAuthMessage(waitText + ' If the signer window is already open, switch to it and approve.', 'warn');
      try {
        if (typeof window.focus === 'function') {
          window.focus();
        }
      } catch (_focusErr) {
        // noop
      }
    }, 1200);
    var timeoutTimer = setTimeout(function () {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(hintTimer);
    }, timeout);
    return Promise.resolve(signEventFn(template)).then(function (result) {
      if (settled) {
        throw new Error('Signer approval timed out.');
      }
      settled = true;
      clearTimeout(hintTimer);
      clearTimeout(timeoutTimer);
      return result;
    }).catch(function (err) {
      clearTimeout(hintTimer);
      clearTimeout(timeoutTimer);
      if (settled && (!err || !err.message)) {
        throw new Error('Signer approval timed out.');
      }
      throw err;
    });
  }

  function setAuthControlsDisabled(disabled) {
    var isDisabled = !!disabled;
    [
      els.authRegisterBtn,
      els.authPhoneConnectBtn,
      els.authPhoneBtn,
      els.authManualStart,
      els.authManualSubmit,
      els.authTabRegister,
      els.authTabPhone,
      els.authTabManual
    ].forEach(function (node) {
      if (node) {
        node.disabled = isDisabled;
      }
    });
    if (!isDisabled) {
      updatePhoneContinueState();
    }
  }

  function updatePhoneContinueState() {
    if (!els.authPhoneBtn) {
      return;
    }
    var paired = !!state.nip46.signerPubkey;
    els.authPhoneBtn.disabled = !paired;
    els.authPhoneBtn.setAttribute('aria-disabled', paired ? 'false' : 'true');
  }

  function resetAuthPanels() {
    showPanel(els.authRegisterPanel, false);
    showPanel(els.authPhonePanel, false);
    showPanel(els.authManualPanel, false);
    state.manualChallenge = null;
    if (els.authManualRequestId) { els.authManualRequestId.value = ''; }
    if (els.authManualChallenge) { els.authManualChallenge.value = ''; }
    if (els.authManualExpires) { els.authManualExpires.value = ''; }
    if (els.authManualTemplate) { els.authManualTemplate.value = ''; }
    if (els.authManualEvent) { els.authManualEvent.value = ''; }
  }

  function setActiveAuthTab(tabName) {
    var tab = String(tabName || 'register');
    if (tab !== 'register' && tab !== 'phone' && tab !== 'manual') {
      tab = 'register';
    }
    if (els.authModalTitle) {
      els.authModalTitle.textContent = (tab === 'register') ? 'Register' : 'Sign in';
    }

    if (els.authTabRegister) {
      var activeRegister = tab === 'register';
      els.authTabRegister.classList.toggle('is-active', activeRegister);
      els.authTabRegister.setAttribute('aria-selected', activeRegister ? 'true' : 'false');
    }
    if (els.authTabPhone) {
      var activePhone = tab === 'phone';
      els.authTabPhone.classList.toggle('is-active', activePhone);
      els.authTabPhone.setAttribute('aria-selected', activePhone ? 'true' : 'false');
    }
    if (els.authTabManual) {
      var activeManual = tab === 'manual';
      els.authTabManual.classList.toggle('is-active', activeManual);
      els.authTabManual.setAttribute('aria-selected', activeManual ? 'true' : 'false');
    }

    showPanel(els.authRegisterPanel, tab === 'register');
    showPanel(els.authPhonePanel, tab === 'phone');
    showPanel(els.authManualPanel, tab === 'manual');

    if (tab === 'phone') {
      updatePhoneContinueState();
      initNip46Pairing().then(function () {
        setAuthMessage('Scan QR in your signer app. Continue unlocks after pairing.', 'warn');
      }).catch(function (err) {
        setAuthMessage(err.message || 'Unable to prepare phone signer QR.', 'error');
      });
      return;
    }
    if (tab === 'manual') {
      setAuthMessage('Create a challenge, then paste the signed event JSON.', 'warn');
      return;
    }
    setAuthMessage('Register uses your Nostr signer and creates your account on first successful sign-in.', 'warn');
  }

  function showAuthModal(initialTab) {
    if (!els.authModal) {
      return;
    }
    if (authModalHideTimer) {
      clearTimeout(authModalHideTimer);
      authModalHideTimer = null;
    }
    els.authModal.hidden = false;
    requestAnimationFrame(function () {
      els.authModal.classList.add('is-open');
    });
    document.body.classList.add('auth-modal-open');
    resetAuthPanels();
    setAuthControlsDisabled(false);
    setActiveAuthTab(initialTab || 'register');
  }

  function hideAuthModal() {
    if (!els.authModal) {
      return;
    }
    els.authModal.classList.remove('is-open');
    if (!els.authInfoModal || !els.authInfoModal.classList.contains('is-open')) {
      document.body.classList.remove('auth-modal-open');
    }
    setAuthMessage('', '');
    setAuthControlsDisabled(false);
    if (authModalHideTimer) {
      clearTimeout(authModalHideTimer);
    }
    authModalHideTimer = setTimeout(function () {
      if (!els.authModal.classList.contains('is-open')) {
        els.authModal.hidden = true;
      }
      authModalHideTimer = null;
    }, 210);
  }

  function showInfoModal() {
    if (!els.authInfoModal) {
      return;
    }
    els.authInfoModal.hidden = false;
    requestAnimationFrame(function () {
      els.authInfoModal.classList.add('is-open');
    });
    document.body.classList.add('auth-modal-open');
  }

  function hideInfoModal() {
    if (!els.authInfoModal) {
      return;
    }
    els.authInfoModal.classList.remove('is-open');
    if (!els.authModal || !els.authModal.classList.contains('is-open')) {
      document.body.classList.remove('auth-modal-open');
    }
    setTimeout(function () {
      if (!els.authInfoModal.classList.contains('is-open')) {
        els.authInfoModal.hidden = true;
      }
    }, 210);
  }

  function showPanel(panel, show) {
    if (!panel) {
      return;
    }
    panel.hidden = !show;
  }

  function parseJsonResponse(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      var c = compact(text || '');
      if (!c) {
        throw new Error('Invalid JSON response');
      }
      throw new Error('Unexpected server response: ' + c.slice(0, 180));
    }
  }

  function fetchJson(url, options) {
    var request = Object.assign({ cache: 'no-store' }, options || {});
    return fetch(url, request)
      .then(function (res) {
        return res.text().then(function (text) {
          return parseJsonResponse(text);
        });
      });
  }

  function postForm(url, payload) {
    var body = new URLSearchParams(payload || {});
    return fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
  }

  function encodeBase64Utf8(text) {
    var raw = String(text || '');
    try {
      return btoa(unescape(encodeURIComponent(raw)));
    } catch (_err) {
      return btoa(raw);
    }
  }

  function getSessionToken() {
    return localStorage.getItem('session_token') || '';
  }

  function getCsrfToken() {
    return localStorage.getItem('csrf_token') || '';
  }

  function hasStoredSessionToken() {
    var token = String(getSessionToken() || '').trim();
    return !!token && token !== 'null' && token !== 'undefined';
  }

  function emitAuthChanged() {
    try {
      window.dispatchEvent(new CustomEvent('blog-auth-changed', {
        detail: { session_token: getSessionToken(), csrf_token: getCsrfToken() }
      }));
    } catch (_err) {
      // Ignore event dispatch failures.
    }
  }

  function rememberAuth(data) {
    localStorage.setItem('session_token', data.session_token || '');
    localStorage.setItem('csrf_token', data.csrf_token || '');
    if (data.player_name) {
      localStorage.setItem('last_auth_player_name', data.player_name);
    }
    if (data.username) {
      localStorage.setItem('last_auth_username', data.username);
    }
    if (data.pubkey) {
      localStorage.setItem('last_auth_pubkey', data.pubkey);
    }
    emitAuthChanged();
  }

  function clearLocalStorageAuth() {
    localStorage.removeItem('session_token');
    localStorage.removeItem('csrf_token');
    emitAuthChanged();
  }

  function openAuthDb() {
    if (!window.indexedDB) {
      return Promise.resolve(null);
    }
    if (state.idbPromise) {
      return state.idbPromise;
    }
    state.idbPromise = new Promise(function (resolve, reject) {
      var req = window.indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error('IndexedDB unavailable'));
      };
    }).catch(function () {
      return null;
    });
    return state.idbPromise;
  }

  function fallbackKey(key) {
    return 'wizardry_blog_auth_fallback_' + key;
  }

  function idbSet(key, value) {
    return openAuthDb().then(function (db) {
      if (!db) {
        localStorage.setItem(fallbackKey(key), JSON.stringify(value));
        return;
      }
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        tx.objectStore(IDB_STORE_NAME).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB write failed')); };
      });
    });
  }

  function idbGet(key) {
    return openAuthDb().then(function (db) {
      if (!db) {
        var raw = localStorage.getItem(fallbackKey(key));
        if (!raw) {
          return null;
        }
        try {
          return JSON.parse(raw);
        } catch (_) {
          return null;
        }
      }
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE_NAME, 'readonly');
        var req = tx.objectStore(IDB_STORE_NAME).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error || new Error('IndexedDB read failed')); };
      });
    });
  }

  function idbDelete(key) {
    return openAuthDb().then(function (db) {
      if (!db) {
        localStorage.removeItem(fallbackKey(key));
        return;
      }
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        tx.objectStore(IDB_STORE_NAME).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB delete failed')); };
      });
    });
  }

  function clearLocalKeyMaterial() {
    return Promise.all([
      idbDelete(KEY_DEVICE_SESSION),
      idbDelete(KEY_NIP46_PAIR)
    ]).then(function () {
      state.nip46.active = false;
      state.nip46.signerPubkey = '';
      state.nip46.appSecretHex = '';
      state.nip46.appPubkey = '';
      state.nip46.pairSecret = '';
      state.nip46.pending = {};
      state.nip46.pendingTimers = {};
      state.nip46.seenEvents = {};
      if (state.nip46.subscription && typeof state.nip46.subscription.close === 'function') {
        state.nip46.subscription.close();
      }
      state.nip46.subscription = null;
      if (state.nip46.pool && typeof state.nip46.pool.destroy === 'function') {
        state.nip46.pool.destroy();
      }
      state.nip46.pool = null;
    });
  }

  function authEventTemplate(challenge, action, pubkey) {
    var eventAction = action || 'login';
    var signerPubkey = String(pubkey || '').trim();
    var tags = [
      ['challenge', String(challenge || '')],
      ['origin', currentOrigin()],
      ['domain', currentHost()]
    ];
    if (eventAction && eventAction !== 'login') {
      tags.push(['action', eventAction]);
    }
    return {
      kind: AUTH_KIND,
      created_at: nowEpoch(),
      tags: tags,
      content: '',
      pubkey: signerPubkey || undefined
    };
  }

  function normalizeSignedEvent(result) {
    if (typeof result === 'string') {
      return parseJsonResponse(result);
    }
    if (result && typeof result === 'object') {
      return result;
    }
    throw new Error('Signer did not return a valid signed event.');
  }

  function normalizeSignedEventKind(value) {
    var num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return 0;
    }
    return Math.floor(num);
  }

  function normalizeSignedEventForSubmit(result, pubkey, expectedKind) {
    var normalized = normalizeSignedEvent(result);
    var fallbackPubkey = normalizePubkeyHex(pubkey);
    var rawExistingPubkey = String((normalized && normalized.pubkey) || '').trim();
    var existingPubkey = normalizePubkeyHex(rawExistingPubkey);
    var desiredKind = normalizeSignedEventKind(expectedKind);
    var existingKind = normalizeSignedEventKind(normalized && normalized.kind);
    var patched = normalized;
    if (normalized && fallbackPubkey && (!existingPubkey || rawExistingPubkey.toLowerCase() !== existingPubkey)) {
      patched = Object.assign({}, patched, { pubkey: fallbackPubkey });
    }
    if (patched && desiredKind > 0 && existingKind !== desiredKind) {
      patched = Object.assign({}, patched, { kind: desiredKind });
    }
    return patched;
  }

  function signedEventPubkey(result) {
    var normalized = normalizeSignedEvent(result);
    return String((normalized && normalized.pubkey) || '').trim();
  }

  function normalizePubkeyHex(value) {
    var raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    var lower = raw.toLowerCase();
    if (/^[0-9a-f]{64}$/.test(lower)) {
      return lower;
    }
    if (lower.indexOf('npub1') === 0 && window.NostrTools && window.NostrTools.nip19 && typeof window.NostrTools.nip19.decode === 'function') {
      try {
        var decoded = window.NostrTools.nip19.decode(lower);
        if (decoded && decoded.type === 'npub' && typeof decoded.data === 'string' && /^[0-9a-f]{64}$/i.test(decoded.data)) {
          return String(decoded.data).toLowerCase();
        }
      } catch (_err) {
        return '';
      }
    }
    return '';
  }

  function beginChallenge(pubkeyHint) {
    var payload = {};
    if (pubkeyHint) {
      payload.pubkey_hint = pubkeyHint;
    }
    return postForm('/cgi/nostr-auth-login-begin', payload)
      .then(function (data) {
        if (!data || !data.success) {
          throw new Error((data && data.error) || 'Unable to create login challenge.');
        }
        return data;
      });
  }

  function finishLogin(requestId, signedEvent, delegationEvent, forceInteractive, usernameHint, signerPubkeyHint) {
    var payload = {
      request_id: requestId,
      event_json_b64: encodeBase64Utf8(JSON.stringify(normalizeSignedEventForSubmit(signedEvent, signerPubkeyHint, AUTH_KIND))),
      force_interactive: forceInteractive ? 'true' : 'false'
    };
    var normalizedSignerPubkeyHint = normalizePubkeyHex(signerPubkeyHint);
    var desiredUsername = String(usernameHint || '').trim();
    if (desiredUsername) {
      payload.username_hint = desiredUsername;
    }
    if (normalizedSignerPubkeyHint) {
      payload.signer_pubkey_hint = normalizedSignerPubkeyHint;
    }
    if (delegationEvent) {
      payload.delegation_json_b64 = encodeBase64Utf8(JSON.stringify(normalizeSignedEvent(delegationEvent)));
    }
    return postForm('/cgi/nostr-auth-login-finish', payload)
      .then(function (data) {
        if (!data || !data.success) {
          throw new Error((data && data.error) || 'Nostr login failed.');
        }
        return data;
      });
  }

  function applyLoggedInUi(isLoggedIn, isAdmin, username) {
    var displayName = String(username || '');
    state.isAuthenticated = !!isLoggedIn;

    // Always reset both auth presentations first so they remain mutually exclusive.
    if (els.loginSplit) {
      els.loginSplit.style.display = 'none';
      closeLoginMenu();
    } else if (els.loginBtn) {
      els.loginBtn.style.display = 'none';
    }
    if (els.userMenu) {
      els.userMenu.style.display = 'none';
      closeUserMenu();
    }
    if (els.userName) {
      els.userName.style.display = 'none';
      els.userName.textContent = '';
      els.userName.removeAttribute('aria-label');
      els.userName.setAttribute('href', '/admin#account');
      els.userName.classList.remove('active');
      els.userName.removeAttribute('aria-current');
    }

    if (isLoggedIn) {
      // Default to hidden until server session-check confirms there are
      // additional active sessions beyond the current one.
      updateLogoutOtherSessionsUi(0);
      if (els.composeTools) {
        els.composeTools.style.display = isAdmin ? 'inline-flex' : 'none';
      } else if (els.composeLink) {
        els.composeLink.style.display = isAdmin ? 'inline-flex' : 'none';
      }
      if (els.userMenu) {
        if (els.menuPrimaryLink) {
          if (isAdmin) {
            els.menuPrimaryLink.textContent = 'Admin';
            els.menuPrimaryLink.href = '/admin';
          } else {
            els.menuPrimaryLink.textContent = 'Account';
            els.menuPrimaryLink.href = '/admin#account';
          }
        }
        els.userMenu.style.display = 'inline-flex';
      }
      if (els.userName) {
        els.userName.style.display = 'inline-block';
        els.userName.textContent = displayName || 'signed-in';
        els.userName.setAttribute('aria-label', 'Open account settings');
        els.userName.setAttribute('href', '/admin#account');
        updateUserNameActiveState();
      }
      scheduleNavOverflowMenuSync();
      return;
    }

    if (els.loginSplit) {
      els.loginSplit.style.display = 'inline-flex';
    } else if (els.loginBtn) {
      els.loginBtn.style.display = 'inline-block';
    }
    if (els.composeTools) {
      els.composeTools.style.display = 'none';
    } else if (els.composeLink) {
      els.composeLink.style.display = 'none';
    }
    updateLogoutOtherSessionsUi(0);
    syncPluginAuthUi();
    scheduleNavOverflowMenuSync();
  }

  function updateLogoutOtherSessionsUi(countRaw) {
    if (!els.menuLogoutEverywhereBtn) {
      return;
    }
    var count = Number(countRaw || 0);
    if (!isFinite(count) || count < 0) {
      count = 0;
    }
    if (count < 1) {
      els.menuLogoutEverywhereBtn.style.display = 'none';
      els.menuLogoutEverywhereBtn.textContent = 'Log out other sessions';
      return;
    }
    els.menuLogoutEverywhereBtn.style.display = 'block';
    els.menuLogoutEverywhereBtn.textContent = 'Log out other sessions (' + String(count) + ')';
  }

  function checkAuth() {
    var token = String(getSessionToken() || '').trim();
    if (!hasStoredSessionToken()) {
      clearLocalStorageAuth();
      applyLoggedInUi(false, false, '');
      return Promise.resolve(false);
    }

    return fetch('/cgi/ssh-auth-check-session?session_token=' + encodeURIComponent(token), { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.authenticated) {
          clearLocalStorageAuth();
          applyLoggedInUi(false, false, '');
          return false;
        }
        if (data.csrf_token) {
          localStorage.setItem('csrf_token', data.csrf_token);
          emitAuthChanged();
        }
        if (data.nostr_pubkey) {
          localStorage.setItem('last_auth_pubkey', data.nostr_pubkey);
        }
        if (data.player_name) {
          localStorage.setItem('last_auth_player_name', data.player_name);
        }
        if (typeof data.is_admin !== 'undefined') {
          localStorage.setItem('last_auth_is_admin', data.is_admin ? '1' : '0');
        }
        applyLoggedInUi(
          true,
          !!data.is_admin,
          data.player_name || localStorage.getItem('last_auth_player_name') || data.username || ''
        );
        updateLogoutOtherSessionsUi(data.other_sessions_count || 0);
        return true;
      })
      .catch(function (err) {
        if (err && String(err.name || '') === 'AbortError') {
          return !!state.isAuthenticated;
        }
        if (!state.isAuthenticated && !hasStoredSessionToken()) {
          applyLoggedInUi(false, false, '');
        }
        updateLogoutOtherSessionsUi(0);
        return !!state.isAuthenticated;
      });
  }

  function verifySessionWithRetry(remainingAttempts, delayMs) {
    var attempts = Number(remainingAttempts || 0);
    if (!isFinite(attempts) || attempts < 1) {
      attempts = 1;
    }
    return checkAuth().then(function (ok) {
      if (ok) {
        return true;
      }
      if (attempts <= 1) {
        return false;
      }
      return waitMs(delayMs).then(function () {
        return verifySessionWithRetry(attempts - 1, delayMs);
      });
    });
  }

  function finalizeLoginUiAfterSuccess(finishData) {
    var data = finishData && typeof finishData === 'object' ? finishData : {};
    var optimisticName = data.player_name || localStorage.getItem('last_auth_player_name') || data.username || localStorage.getItem('last_auth_username') || 'signed-in';
    applyLoggedInUi(true, !!data.is_admin, optimisticName);
    return verifySessionWithRetry(6, 180).then(function (ok) {
      if (!ok) {
        clearLocalStorageAuth();
        applyLoggedInUi(false, false, '');
        throw new Error('Login was signed, but session validation failed. Please try again.');
      }
      hideAuthModal();
      return true;
    });
  }

  function openUserMenu() {
    if (!els.menuPanel || !els.menuBtn) {
      return;
    }
    closeNavOverflowMenu();
    els.menuPanel.hidden = false;
    els.menuBtn.setAttribute('aria-expanded', 'true');
  }

  function closeUserMenu() {
    if (!els.menuPanel || !els.menuBtn) {
      return;
    }
    els.menuPanel.hidden = true;
    els.menuBtn.setAttribute('aria-expanded', 'false');
  }

  function openLoginMenu() {
    if (!els.loginMenu || !els.loginMoreBtn) {
      return;
    }
    closeNavOverflowMenu();
    els.loginMenu.hidden = false;
    els.loginMoreBtn.setAttribute('aria-expanded', 'true');
  }

  function closeLoginMenu() {
    if (!els.loginMenu || !els.loginMoreBtn) {
      return;
    }
    els.loginMenu.hidden = true;
    els.loginMoreBtn.setAttribute('aria-expanded', 'false');
  }

  function hasDesktopSigner() {
    return !!(window.nostr && typeof window.nostr.signEvent === 'function');
  }

  function pageRequiresAuthorization() {
    var path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
    if (path === '/pages/admin.html' || path === '/pages/admin' || path === '/admin.html' || path === '/admin') {
      return true;
    }
    if (document.body && document.body.getAttribute('data-requires-auth') === 'true') {
      return true;
    }
    return false;
  }

  function handlePostLogoutNavigation(toastMessage) {
    var message = String(toastMessage || 'Logged out.');
    if (pageRequiresAuthorization()) {
      rememberNavToast(message, 'info', 3800);
      window.location.assign('/');
      return;
    }
    if (els.authModal && !els.authModal.hidden) {
      hideAuthModal();
    }
    showNavToast(message, 'info', 3800);
  }

  function logout() {
    var token = getSessionToken();
    if (!token) {
      clearLocalStorageAuth();
      return clearLocalKeyMaterial().finally(function () {
        applyLoggedInUi(false, false, '');
        handlePostLogoutNavigation('Logged out.');
      });
    }

    var body = new URLSearchParams({
      session_token: token,
      csrf_token: getCsrfToken()
    });

    return fetch('/cgi/ssh-auth-logout', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).catch(function () {
      return null;
    }).finally(function () {
      clearLocalStorageAuth();
      return clearLocalKeyMaterial().finally(function () {
        applyLoggedInUi(false, false, '');
        handlePostLogoutNavigation('Logged out.');
      });
    });
  }

  function buildNostrConnectUri(appPubkey, pairSecret, relays) {
    var params = new URLSearchParams();
    relays.forEach(function (relay) {
      params.append('relay', relay);
    });
    params.set('secret', pairSecret);
    params.set('name', 'Nostr Blog');
    return 'nostrconnect://' + appPubkey + '?' + params.toString();
  }

  function renderQrCode(value) {
    if (!els.authNip46Qr) {
      return;
    }
    els.authNip46Qr.innerHTML = '';
    if (typeof window.QRCode === 'function') {
      new window.QRCode(els.authNip46Qr, {
        text: value,
        width: 196,
        height: 196,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M
      });
      return;
    }
    var pre = document.createElement('pre');
    pre.textContent = value;
    els.authNip46Qr.appendChild(pre);
  }

  function initNip46Pairing() {
    if (!hasNostrTools()) {
      throw new Error('NIP-46 requires nostr-tools support in this browser.');
    }

    if (state.nip46.active) {
      return Promise.resolve();
    }

    return idbGet(KEY_NIP46_PAIR).then(function (saved) {
      var appSecretHex = '';
      var pairSecret = '';
      var relays = NIP46_RELAYS.slice();

      if (saved && typeof saved === 'object' && saved.domain === currentHost()) {
        appSecretHex = String(saved.appSecretHex || '');
        pairSecret = String(saved.pairSecret || '');
        if (Array.isArray(saved.relays) && saved.relays.length) {
          relays = saved.relays.map(function (item) { return String(item || '').trim(); }).filter(Boolean).slice(0, 3);
        }
      }

      if (!appSecretHex) {
        appSecretHex = bytesToHex(window.NostrTools.generateSecretKey());
      }
      if (!pairSecret) {
        pairSecret = randomHex(16);
      }

      var appPubkey = window.NostrTools.getPublicKey(hexToBytes(appSecretHex));

      state.nip46.active = true;
      state.nip46.appSecretHex = appSecretHex;
      state.nip46.appPubkey = appPubkey;
      state.nip46.pairSecret = pairSecret;
      state.nip46.relays = relays;
      state.nip46.signerPubkey = '';
      state.nip46.pool = new window.NostrTools.SimplePool();
      state.nip46.pending = {};
      state.nip46.pendingTimers = {};
      state.nip46.seenEvents = {};

      state.nip46.subscription = state.nip46.pool.subscribeMany(
        state.nip46.relays,
        [{ kinds: [NIP46_KIND], '#p': [state.nip46.appPubkey], since: nowEpoch() - 30 }],
        {
          onevent: function (event) {
            handleNip46RelayEvent(event);
          }
        }
      );

      return idbSet(KEY_NIP46_PAIR, {
        version: 1,
        domain: currentHost(),
        appSecretHex: appSecretHex,
        appPubkey: appPubkey,
        pairSecret: pairSecret,
        relays: state.nip46.relays,
        createdAt: nowEpoch()
      });
    }).then(function () {
      var uri = buildNostrConnectUri(state.nip46.appPubkey, state.nip46.pairSecret, state.nip46.relays);
      if (els.authNip46Uri) {
        els.authNip46Uri.textContent = uri;
      }
      if (els.authNip46Open) {
        els.authNip46Open.href = uri;
      }
      renderQrCode(uri);
    });
  }

  function resolveNip46Pending(id, payload, isError) {
    var entry = state.nip46.pending[id];
    if (!entry) {
      return;
    }
    delete state.nip46.pending[id];
    if (state.nip46.pendingTimers[id]) {
      clearTimeout(state.nip46.pendingTimers[id]);
      delete state.nip46.pendingTimers[id];
    }
    if (isError) {
      entry.reject(new Error(payload || 'NIP-46 request failed'));
    } else {
      entry.resolve(payload);
    }
  }

  function extractConnectSecret(msg) {
    if (!msg) {
      return '';
    }
    if (typeof msg.secret === 'string') {
      return msg.secret;
    }
    if (Array.isArray(msg.params)) {
      if (typeof msg.params[1] === 'string') {
        return msg.params[1];
      }
      if (typeof msg.params[0] === 'string' && msg.params.length === 1) {
        return msg.params[0];
      }
      if (msg.params[0] && typeof msg.params[0] === 'object' && typeof msg.params[0].secret === 'string') {
        return msg.params[0].secret;
      }
    }
    return '';
  }

  function handleNip46RelayEvent(event) {
    if (!event || !event.id || state.nip46.seenEvents[event.id]) {
      return;
    }
    state.nip46.seenEvents[event.id] = true;

    window.NostrTools.nip04.decrypt(hexToBytes(state.nip46.appSecretHex), event.pubkey, event.content)
      .then(function (plain) {
        var msg = parseJsonResponse(plain);

        if (msg && msg.method === 'connect') {
          var secret = extractConnectSecret(msg);
          if (secret && secret !== state.nip46.pairSecret) {
            return;
          }
          state.nip46.signerPubkey = String(event.pubkey || '');
          updatePhoneContinueState();
          setAuthMessage('Phone signer paired. You can continue login now.', 'ok');
          return;
        }

        if (msg && msg.id && state.nip46.pending[msg.id]) {
          if (msg.error) {
            resolveNip46Pending(msg.id, typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error), true);
            return;
          }
          resolveNip46Pending(msg.id, msg.result, false);
        }
      })
      .catch(function () {
        // Ignore malformed or unrelated relay events.
      });
  }

  function sendNip46Rpc(method, params, timeoutMs) {
    if (!state.nip46.signerPubkey) {
      return Promise.reject(new Error('Phone signer is not paired yet. Scan QR first.'));
    }

    var requestId = randomHex(12);
    var timeout = Number(timeoutMs || 60000);
    var rpc = {
      id: requestId,
      method: method,
      params: params || []
    };

    return window.NostrTools.nip04.encrypt(
      hexToBytes(state.nip46.appSecretHex),
      state.nip46.signerPubkey,
      JSON.stringify(rpc)
    ).then(function (ciphertext) {
      var eventTemplate = {
        kind: NIP46_KIND,
        created_at: nowEpoch(),
        tags: [['p', state.nip46.signerPubkey]],
        content: ciphertext
      };
      var signed = window.NostrTools.finalizeEvent(eventTemplate, hexToBytes(state.nip46.appSecretHex));

      return new Promise(function (resolve, reject) {
        state.nip46.pending[requestId] = { resolve: resolve, reject: reject };
        state.nip46.pendingTimers[requestId] = setTimeout(function () {
          resolveNip46Pending(requestId, 'Phone signer timed out. Try again.', true);
        }, timeout);

        state.nip46.pool.publish(state.nip46.relays, signed);
      });
    });
  }

  function nip46SignEvent(template) {
    return sendNip46Rpc('sign_event', [template], 70000)
      .then(function (result) {
        if (typeof result === 'string') {
          return parseJsonResponse(result);
        }
        return normalizeSignedEvent(result);
      });
  }

  function waitForPhonePairing(timeoutMs) {
    var timeout = Number(timeoutMs || 90000);
    if (state.nip46.signerPubkey) {
      return Promise.resolve(state.nip46.signerPubkey);
    }

    return new Promise(function (resolve, reject) {
      var started = Date.now();
      var timer = setInterval(function () {
        if (state.nip46.signerPubkey) {
          clearInterval(timer);
          resolve(state.nip46.signerPubkey);
          return;
        }
        if (Date.now() - started > timeout) {
          clearInterval(timer);
          reject(new Error('Phone pairing timed out. Scan the QR and try again.'));
        }
      }, 350);
    });
  }

  function signInWithSigner(signEventFn, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var getPubkeyFn = typeof opts.getPubkeyFn === 'function' ? opts.getPubkeyFn : null;
    var pubkeyHint = normalizePubkeyHex(opts.pubkeyHint || '') || normalizePubkeyHex(localStorage.getItem('last_auth_pubkey') || '');
    var registerAttempt = !!opts.registerAttempt;
    var usernameHint = String(opts.usernameHint || '').trim();
    setAuthMessage('Creating a single-use login challenge...', 'warn');
    var pubkeyReady = pubkeyHint
      ? Promise.resolve(pubkeyHint)
      : (getPubkeyFn
        ? Promise.resolve(getPubkeyFn()).then(function (value) {
          return normalizePubkeyHex(value);
        }).catch(function () {
          return '';
        })
        : Promise.resolve(''));
    return pubkeyReady
      .then(function (resolvedPubkeyHint) {
        pubkeyHint = resolvedPubkeyHint || pubkeyHint;
        return beginChallenge(pubkeyHint || '');
      })
      .then(function (begin) {
        var authTemplate = authEventTemplate(begin.challenge, 'login', pubkeyHint);
        setAuthMessage('Sign the login challenge event...', 'warn');
        return requestSignerApproval(
          signEventFn,
          authTemplate,
          'Approve login in your signer',
          70000
        ).then(function (signedAuth) {
          var normalizedAuth = normalizeSignedEvent(signedAuth);
          var userPubkey = normalizePubkeyHex(signedEventPubkey(normalizedAuth));
          if (!userPubkey && pubkeyHint) {
            userPubkey = normalizePubkeyHex(pubkeyHint);
          }
          if (!userPubkey && getPubkeyFn) {
            return Promise.resolve(getPubkeyFn()).then(function (fallbackPubkey) {
              var fallback = normalizePubkeyHex(fallbackPubkey);
              return {
                begin: begin,
                userPubkey: fallback,
                signedAuth: normalizeSignedEventForSubmit(normalizedAuth, fallback, AUTH_KIND)
              };
            });
          }
          normalizedAuth = normalizeSignedEventForSubmit(normalizedAuth, userPubkey, AUTH_KIND);
          return {
            begin: begin,
            userPubkey: userPubkey,
            signedAuth: normalizedAuth
          };
        });
      })
      .then(function (payload) {
        if (!payload.userPubkey) {
          throw new Error('Signed auth event is missing pubkey.');
        }
        localStorage.setItem('last_auth_pubkey', payload.userPubkey);
        return finishLogin(
          payload.begin.request_id,
          payload.signedAuth,
          null,
          false,
          usernameHint,
          payload.userPubkey
        );
      })
      .then(function (finish) {
        rememberAuth(finish);
        return idbDelete(KEY_DEVICE_SESSION).then(function () {
          var created = !!(finish && (finish.account_created === true || finish.account_created === 'true'));
          if (registerAttempt && !created) {
            showNavToast('You were logged in because this account already exists.', 'ok', 4200);
          }
          return finalizeLoginUiAfterSuccess(finish);
        });
      });
  }

  function loginWithNip07(options) {
    var signer = getBrowserSigner();
    var opts = options && typeof options === 'object' ? options : {};
    try {
      if (typeof window.focus === 'function') {
        window.focus();
      }
    } catch (_focusErr) {
      // noop
    }
    return signInWithSigner(
      function (template) {
        return Promise.resolve(signer.signEvent(template));
      },
      {
        getPubkeyFn: typeof signer.getPublicKey === 'function'
          ? function () { return Promise.resolve(signer.getPublicKey()); }
          : null,
        pubkeyHint: '',
        registerAttempt: !!opts.registerAttempt,
        usernameHint: String(opts.usernameHint || '').trim()
      }
    );
  }

  function startPhonePairingFlow() {
    setAuthMessage('Preparing phone signer pairing QR...', 'warn');
    setAuthControlsDisabled(true);
    return initNip46Pairing().then(function () {
      showPanel(els.authPhonePanel, true);
      showPanel(els.authManualPanel, false);
      setAuthMessage('Scan QR in your signer app. Continue unlocks after pairing.', 'warn');
      return waitForPhonePairing(90000);
    }).then(function () {
      updatePhoneContinueState();
      setAuthMessage('Phone signer paired. Continue is ready.', 'ok');
    }).finally(function () {
      setAuthControlsDisabled(false);
    });
  }

  function startDesktopSignerLogin(registerAttempt, usernameHint) {
    var asRegister = !!registerAttempt;
    if (!hasDesktopSigner()) {
      return Promise.reject(new Error('No desktop signer detected. Use the login menu for phone QR or signed challenge login.'));
    }
    setAuthControlsDisabled(true);
    return loginWithNip07({
      registerAttempt: asRegister,
      usernameHint: String(usernameHint || '').trim()
    }).finally(function () {
      setAuthControlsDisabled(false);
    });
  }

  function loginWithPhoneSigner() {
    if (!hasNostrTools()) {
      return Promise.reject(new Error('Phone signer pairing requires nostr-tools support.'));
    }

    showPanel(els.authPhonePanel, true);
    showPanel(els.authManualPanel, false);

    return initNip46Pairing()
      .then(function () {
        if (!state.nip46.signerPubkey) {
          throw new Error('Phone signer is not paired yet. Connect it first via QR.');
        }
        return signInWithSigner(
          function (template) {
            return nip46SignEvent(template);
          },
          {
            pubkeyHint: state.nip46.signerPubkey
          }
        );
      });
  }

  function prepareManualLogin() {
    setAuthMessage('Creating a single-use login challenge...', 'warn');
    showPanel(els.authManualPanel, true);
    showPanel(els.authPhonePanel, false);

    return beginChallenge(localStorage.getItem('last_auth_pubkey') || '')
      .then(function (begin) {
        state.manualChallenge = begin;

        if (els.authManualRequestId) {
          els.authManualRequestId.value = begin.request_id || '';
        }
        if (els.authManualChallenge) {
          els.authManualChallenge.value = begin.challenge || '';
        }
        if (els.authManualExpires) {
          els.authManualExpires.value = String(begin.expires_at || '');
        }

        var authTemplate = authEventTemplate(begin.challenge, 'login', localStorage.getItem('last_auth_pubkey') || '');
        if (els.authManualTemplate) {
          els.authManualTemplate.value = JSON.stringify(authTemplate, null, 2);
        }

        setAuthMessage('Challenge created. Sign the auth event and paste JSON below.', 'ok');
      });
  }

  function submitManualLogin() {
    if (!state.manualChallenge || !state.manualChallenge.request_id) {
      return Promise.reject(new Error('Create a challenge first.'));
    }

    var signedAuthRaw = els.authManualEvent ? String(els.authManualEvent.value || '').trim() : '';
    if (!signedAuthRaw) {
      return Promise.reject(new Error('Signed auth event JSON is required.'));
    }

    var signedAuth;
    try {
      signedAuth = parseJsonResponse(signedAuthRaw);
    } catch (_) {
      throw new Error('Signed auth event JSON is invalid.');
    }

    return finishLogin(
      state.manualChallenge.request_id,
      signedAuth,
      null,
      false
    ).then(function (finish) {
      rememberAuth(finish);
      return idbDelete(KEY_DEVICE_SESSION).then(function () {
        return finalizeLoginUiAfterSuccess(finish);
      });
    });
  }

  function revokeEverywhereWithSigner(signEventFn) {
    var token = getSessionToken();
    var csrf = getCsrfToken();
    if (!token || !csrf) {
      return Promise.reject(new Error('You are not currently signed in.'));
    }

    return postForm('/cgi/nostr-auth-revoke-all-begin', {
      session_token: token,
      csrf_token: csrf
    }).then(function (begin) {
      if (!begin || !begin.success) {
        throw new Error((begin && begin.error) || 'Unable to start revocation challenge.');
      }

      var revokeTemplate = authEventTemplate(begin.challenge, 'revoke_all', begin.pubkey || '');
      return Promise.resolve(signEventFn(revokeTemplate))
        .then(function (signed) {
          return postForm('/cgi/nostr-auth-revoke-all-finish', {
            session_token: token,
            csrf_token: csrf,
            request_id: begin.request_id,
            event_json_b64: encodeBase64Utf8(JSON.stringify(normalizeSignedEvent(signed)))
          });
        });
    }).then(function (finish) {
      if (!finish || !finish.success) {
        throw new Error((finish && finish.error) || 'Revocation failed.');
      }
      setAuthMessage('All active delegated sessions were revoked.', 'ok');
      clearLocalStorageAuth();
      return clearLocalKeyMaterial().finally(function () {
        applyLoggedInUi(false, false, '');
        handlePostLogoutNavigation('Logged out other sessions.');
      });
    });
  }

  function logoutEverywhere() {
    if (typeof window.nostr !== 'undefined' && window.nostr && typeof window.nostr.signEvent === 'function') {
      return revokeEverywhereWithSigner(function (template) {
        return Promise.resolve(window.nostr.signEvent(template));
      });
    }

    if (state.nip46.signerPubkey) {
      return revokeEverywhereWithSigner(function (template) {
        return nip46SignEvent(template);
      });
    }

    return Promise.reject(new Error('Fresh signer approval is required. Use Login or the phone signer flow first.'));
  }

  function isAccountAreaPath() {
    var path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
    return path === '/pages/admin.html' ||
      path === '/pages/admin' ||
      path === '/admin.html' ||
      path === '/admin';
  }

  function updateUserNameActiveState() {
    if (!els.userName) {
      return;
    }
    var active = isAccountAreaPath();
    els.userName.classList.toggle('active', active);
    if (active) {
      els.userName.setAttribute('aria-current', 'page');
    } else {
      els.userName.removeAttribute('aria-current');
    }
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function closeNavOverflowMenu() {
    if (els.navOverflowPanel) {
      els.navOverflowPanel.hidden = true;
    }
    if (els.navOverflowBtn) {
      els.navOverflowBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function openNavOverflowMenu() {
    if (!els.navOverflowPanel || !els.navOverflowBtn || !els.navOverflowMenu || els.navOverflowMenu.hidden) {
      return;
    }
    els.navOverflowPanel.hidden = false;
    els.navOverflowBtn.setAttribute('aria-expanded', 'true');
  }

  function setNavOverflowButtonCount(hiddenCount) {
    if (!els.navOverflowBtn) {
      return;
    }
    var count = Number(hiddenCount || 0);
    if (!isFinite(count) || count < 0) {
      count = 0;
    }
    if (els.navOverflowCount) {
      if (count > 0) {
        els.navOverflowCount.textContent = String(count);
        els.navOverflowCount.hidden = false;
      } else {
        els.navOverflowCount.textContent = '0';
        els.navOverflowCount.hidden = true;
      }
    }
    if (count > 0) {
      els.navOverflowBtn.setAttribute('aria-label', 'More pages (' + String(count) + ' hidden)');
    } else {
      els.navOverflowBtn.setAttribute('aria-label', 'More pages');
    }
  }

  function syncNavOverflowMenuNow() {
    var navCenter = document.querySelector('.nav-center');
    if (!navCenter || !els.navOverflowMenu || !els.navOverflowBtn || !els.navOverflowPanel) {
      return;
    }

    var links = Array.prototype.slice.call(navCenter.querySelectorAll('a[data-page]'));
    links.forEach(function (link) {
      link.classList.remove('is-nav-overflow-hidden');
    });
    closeNavOverflowMenu();
    els.navOverflowPanel.innerHTML = '';
    els.navOverflowMenu.hidden = true;
    setNavOverflowButtonCount(0);

    if (links.length < 2) {
      return;
    }

    var initialOverflowPx = navCenter.scrollWidth - navCenter.clientWidth;
    if (initialOverflowPx <= 22) {
      return;
    }

    var reservePx = 44;
    if (els.navOverflowBtn && els.navOverflowBtn.offsetWidth) {
      reservePx = Math.ceil(els.navOverflowBtn.offsetWidth + 12);
    }
    var hiddenLinks = [];
    var safety = 0;
    var activeLink = links.find(function (link) { return link.classList.contains('active'); }) || null;
    while (navCenter.scrollWidth > ((navCenter.clientWidth - reservePx) + 2) && safety < links.length) {
      var candidate = null;
      for (var i = links.length - 1; i >= 0; i -= 1) {
        var link = links[i];
        if (link.classList.contains('is-nav-overflow-hidden')) {
          continue;
        }
        if (activeLink && link === activeLink) {
          continue;
        }
        candidate = link;
        break;
      }
      if (!candidate) {
        break;
      }
      candidate.classList.add('is-nav-overflow-hidden');
      hiddenLinks.unshift(candidate);
      safety += 1;
    }

    if (!hiddenLinks.length) {
      return;
    }

    hiddenLinks.forEach(function (link) {
      var item = document.createElement('a');
      item.className = 'nav-menu-item';
      item.setAttribute('role', 'menuitem');
      item.href = link.getAttribute('href') || '/';
      item.textContent = compact(link.textContent || '') || 'Page';
      item.addEventListener('click', function () {
        closeNavOverflowMenu();
      });
      els.navOverflowPanel.appendChild(item);
    });

    setNavOverflowButtonCount(hiddenLinks.length);
    els.navOverflowMenu.hidden = false;
  }

  function scheduleNavOverflowMenuSync() {
    if (state.navOverflowRaf && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(state.navOverflowRaf);
      state.navOverflowRaf = 0;
    }
    if (typeof window.requestAnimationFrame === 'function') {
      state.navOverflowRaf = window.requestAnimationFrame(function () {
        state.navOverflowRaf = 0;
        syncNavOverflowMenuNow();
      });
      return;
    }
    syncNavOverflowMenuNow();
  }

  function markHydrationNavReady() {
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markNavReady === 'function') {
      gate.markNavReady();
    }
  }

  function isDynamicPageRootPresent() {
    return !!(
      document.getElementById('blog-page-root') ||
      document.getElementById('nip23-page-root') ||
      document.getElementById('list-page-root') ||
      document.getElementById('public-ranking-root') ||
      document.getElementById('contact-page-root') ||
      document.getElementById('search-page-root') ||
      document.getElementById('admin-panel')
    );
  }

  function applyInitialHighlightInSyncWithContent() {
    var applied = false;
    function applyOnce() {
      if (applied) {
        return;
      }
      applied = true;
      highlightCurrentPage();
      markHydrationNavReady();
    }

    if (!isDynamicPageRootPresent()) {
      applyOnce();
      return;
    }

    if (window.__wizardryPageInitialContentReady) {
      applyOnce();
      return;
    }

    window.addEventListener('blog-page-initial-content-ready', function () {
      applyOnce();
    }, { once: true });

    setTimeout(function () {
      applyOnce();
    }, 1600);
  }

  function renderNavbarNostrPages(pageRows) {
    var navCenter = document.querySelector('.nav-center');
    if (!navCenter) {
      return;
    }
    var normalizedCurrent = normalizeNavPath(window.location.pathname);
    var html = '';
    var seen = {};
    (Array.isArray(pageRows) ? pageRows : []).forEach(function (page) {
      var slug = String(page && page.slug || '').trim();
      var title = String(page && page.title || '').trim();
      var path = String(page && page.path || '').trim();
      if (!slug || !path || seen[slug]) {
        return;
      }
      seen[slug] = true;
      var isActive = normalizeNavPath(path) === normalizedCurrent;
      html += '<a href="' + escapeHtml(path) + '" data-page="' + escapeHtml(slug) + '"' + (isActive ? ' class="active" aria-current="page"' : '') + '>' + escapeHtml(title || slug) + '</a>';
    });
    if (html && navCenter.innerHTML !== html) {
      navCenter.innerHTML = html;
    }
    highlightCurrentPage();
    scheduleNavOverflowMenuSync();
  }

  function loadNavbarNostrPages() {
    var navCenter = document.querySelector('.nav-center');
    if (!navCenter) {
      return Promise.resolve();
    }

    try {
      var cachedRaw = localStorage.getItem('cached_navbar_pages_v1') || '';
      if (cachedRaw) {
        var cachedPages = JSON.parse(cachedRaw);
        if (Array.isArray(cachedPages) && cachedPages.length) {
          renderNavbarNostrPages(cachedPages);
          if (!hasStoredSessionToken()) {
            warmNavbarNostrPagePrefetch();
          }
        }
      }
    } catch (_cacheReadErr) {
      // Ignore invalid cache.
    }

    return fetch('/cgi/blog-list-navbar-pages', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success || !Array.isArray(data.pages)) {
          return;
        }
        try {
          localStorage.setItem('cached_navbar_pages_v1', JSON.stringify(data.pages));
        } catch (_cacheErr) {
          // Ignore storage failures.
        }
        renderNavbarNostrPages(data.pages);
        if (!hasStoredSessionToken()) {
          warmNavbarNostrPagePrefetch();
        }
      })
      .catch(function () {
        // Keep static nav links on fetch failure.
      });
  }

  window.addEventListener('wizardry-navbar-refresh-request', function (event) {
    var detail = event && event.detail ? event.detail : null;
    if (detail && Array.isArray(detail.pages)) {
      try {
        localStorage.setItem('cached_navbar_pages_v1', JSON.stringify(detail.pages));
      } catch (_cacheErr) {
        // Ignore storage failures.
      }
      renderNavbarNostrPages(detail.pages);
      if (detail.skipFetch === true) {
        return;
      }
    }
    loadNavbarNostrPages().catch(function () {
      // Keep current navbar when refresh fails.
    });
  });

  function normalizeNavPath(path) {
    var p = String(path || '').trim();
    var search = '';
    if (!p) {
      return '/';
    }
    if (p.indexOf('http://') === 0 || p.indexOf('https://') === 0) {
      try {
        var parsed = new URL(p, window.location.href);
        p = parsed.pathname || '/';
        search = parsed.search || '';
      } catch (_err) {
        p = '/';
        search = '';
      }
    }
    if (!search && p.indexOf('?') >= 0) {
      var split = p.split('?', 2);
      p = split[0] || '/';
      search = split[1] ? ('?' + split[1]) : '';
    }
    p = p.replace(/\/+$/, '');
    if (!p) {
      p = '/';
    }
    if (p === '/pages/index' || p === '/pages/index.html') {
      try {
        var params = new URLSearchParams(search || '');
        var slug = String(params.get('page_slug') || params.get('slug') || '').trim().toLowerCase();
        slug = slug.replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
        if (slug && slug !== 'index') {
          return '/' + slug;
        }
      } catch (_err2) {
        // Ignore malformed page query strings.
      }
    }
    if (p === '/pages/index' || p === '/pages/index.html') {
      return '/';
    }
    if (p.indexOf('/pages/') === 0) {
      p = '/' + p.slice('/pages/'.length);
      p = p.replace(/\.html?$/i, '');
    }
    if (!p) {
      p = '/';
    }
    return p;
  }

  function highlightCurrentPage() {
    var currentPath = window.location.href;
    var currentHash = window.location.hash || '';
    var navLinks = document.querySelectorAll('.nav-center a[data-page]');
    var normalizedCurrent = normalizeNavPath(currentPath);
    var navTargetPath = normalizedCurrent;
    var isBlogPostRoute = normalizedCurrent.indexOf('/posts/') === 0 ||
      normalizedCurrent === '/cgi/blog-open-post' ||
      normalizedCurrent.indexOf('/cgi/blog-open-post/') === 0;
    if (isBlogPostRoute) {
      navTargetPath = '/';
    }
    var matches = [];
    var navCenter = document.querySelector('.nav-center');

    function titleizePathLabel(path) {
      var raw = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '');
      if (!raw) {
        return 'Home';
      }
      raw = raw.replace(/\.html?$/i, '');
      raw = raw.replace(/-/g, ' ');
      return raw.split(' ').filter(Boolean).map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }).join(' ');
    }

    navLinks.forEach(function (link) {
      var href = link.getAttribute('href') || '';
      if (normalizeNavPath(href) === navTargetPath) {
        matches.push(link);
      }
    });

    if (matches.length === 0 && navCenter && navTargetPath !== '/' && !isAccountAreaPath()) {
      var existingTemp = navCenter.querySelector('a[data-temp-nav-current="true"]');
      if (existingTemp && normalizeNavPath(existingTemp.getAttribute('href') || '') !== navTargetPath) {
        existingTemp.parentNode.removeChild(existingTemp);
        existingTemp = null;
      }
      if (!existingTemp) {
        existingTemp = document.createElement('a');
        existingTemp.setAttribute('data-page', 'temp-current');
        existingTemp.setAttribute('data-temp-nav-current', 'true');
        existingTemp.setAttribute('href', currentPath || navTargetPath);
        existingTemp.textContent = titleizePathLabel(navTargetPath);
        navCenter.appendChild(existingTemp);
      } else {
        existingTemp.setAttribute('href', currentPath || navTargetPath);
        existingTemp.textContent = titleizePathLabel(navTargetPath);
      }
      matches.push(existingTemp);
      navLinks = document.querySelectorAll('.nav-center a[data-page]');
    }

    if (matches.length > 0) {
      navLinks.forEach(function (link) {
        var active = matches.indexOf(link) !== -1;
        var isBlogLink = normalizeNavPath(link.getAttribute('href') || '') === '/';
        var keepClickable = active && isBlogLink && isBlogPostRoute;
        link.classList.toggle('active', active);
        link.classList.toggle('allow-active-click', !!keepClickable);
        if (active) {
          link.setAttribute('aria-current', 'page');
          if (!keepClickable) {
            link.setAttribute('aria-disabled', 'true');
            link.setAttribute('tabindex', '-1');
          } else {
            link.removeAttribute('aria-disabled');
            link.removeAttribute('tabindex');
          }
        } else {
          link.removeAttribute('aria-current');
          link.removeAttribute('aria-disabled');
          link.removeAttribute('tabindex');
        }
      });
    }

    if (els.composeLink) {
      var normalizedComposePath = normalizeNavPath(currentPath);
      var onCompose = (normalizedComposePath === '/admin') && currentHash === '#compose';
      els.composeLink.classList.toggle('active', onCompose);
      els.composeLink.setAttribute('aria-disabled', onCompose ? 'true' : 'false');
      if (onCompose) {
        els.composeLink.setAttribute('tabindex', '-1');
      } else {
        els.composeLink.removeAttribute('tabindex');
      }
    }
    updateUserNameActiveState();
    scheduleNavOverflowMenuSync();
  }

  function updateThemeSelect() {
    var themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.value = state.currentTheme;
    }
  }

  function pulseThemeSwitchVisualState() {
    var root = document.documentElement;
    var body = document.body;
    if (root) {
      root.classList.add('theme-switching');
    }
    if (body) {
      body.classList.add('theme-switching');
    }
    if (themeSwitchVisualTimer) {
      clearTimeout(themeSwitchVisualTimer);
    }
    themeSwitchVisualTimer = setTimeout(function () {
      if (root) {
        root.classList.remove('theme-switching');
      }
      if (body) {
        body.classList.remove('theme-switching');
      }
      themeSwitchVisualTimer = null;
    }, 90);
  }

  function swapThemeStylesheet(href) {
    var themeLink = document.getElementById('theme-stylesheet');
    if (!themeLink || !href) {
      return Promise.resolve();
    }
    var absoluteHref = href;
    try {
      absoluteHref = new URL(href, window.location.href).href;
    } catch (_err) {
      absoluteHref = href;
    }
    var currentHref = String(themeLink.href || '');
    var currentRequested = String(themeLink.getAttribute('data-theme-href') || '');
    if (currentHref === absoluteHref || currentRequested === href || currentRequested === absoluteHref) {
      return Promise.resolve();
    }

    var token = ++themeSwapToken;
    return new Promise(function (resolve) {
      var preloader = document.createElement('link');
      preloader.rel = 'stylesheet';
      preloader.href = href;
      preloader.media = 'not all';
      preloader.setAttribute('data-theme-preload', 'true');

      function cleanup() {
        if (preloader.parentNode) {
          preloader.parentNode.removeChild(preloader);
        }
      }

      function commit() {
        if (token !== themeSwapToken) {
          cleanup();
          resolve();
          return;
        }
        themeLink.href = href;
        themeLink.setAttribute('data-theme-href', href);
        cleanup();
        resolve();
      }

      preloader.addEventListener('load', commit, { once: true });
      preloader.addEventListener('error', commit, { once: true });
      (themeLink.parentNode || document.head || document.documentElement).appendChild(preloader);
      setTimeout(commit, 1500);
    });
  }

  function isThemeHrefAlreadyActive(themeLink, href) {
    if (!themeLink || !href) {
      return true;
    }
    var absoluteHref = href;
    try {
      absoluteHref = new URL(href, window.location.href).href;
    } catch (_err) {
      absoluteHref = href;
    }
    var currentHref = String(themeLink.href || '');
    var currentRequested = String(themeLink.getAttribute('data-theme-href') || '');
    return currentHref === absoluteHref || currentRequested === href || currentRequested === absoluteHref;
  }

  function isServerThemeHrefActive(themeLink) {
    if (!themeLink) {
      return false;
    }
    var attrHref = String(themeLink.getAttribute('href') || '');
    var resolvedHref = String(themeLink.href || '');
    return attrHref.indexOf('/cgi/blog-theme.css') === 0 || resolvedHref.indexOf('/cgi/blog-theme.css') !== -1;
  }

  function updateThemeStylesheet(theme) {
    var nextTheme = String(theme || '').trim() || 'adept';
    var href = '/static/themes/' + encodeURIComponent(nextTheme) + '.css';
    var themeLink = document.getElementById('theme-stylesheet');
    if (isThemeHrefAlreadyActive(themeLink, href)) {
      return Promise.resolve();
    }
    pulseThemeSwitchVisualState();
    return swapThemeStylesheet(href);
  }

  function loadTheme() {
    return fetch('/cgi/blog-get-config', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var appendSiteTitle = normalizeAppendSiteTitleEnabled(data && data.append_site_title_to_page_title);
        if (data && data.site_title) {
          updateNavSiteSignature(data.site_title);
          cacheSiteTitle(data.site_title);
        }
        cacheAppendSiteTitleEnabled(appendSiteTitle);
        if (typeof window.__wizardrySetPageTitleConfig === 'function') {
          window.__wizardrySetPageTitleConfig((data && data.site_title) || '', appendSiteTitle);
        } else if (typeof window.__wizardryApplyPageTitle === 'function') {
          window.__wizardryApplyPageTitle();
        }
        if (data && data.theme) {
          state.currentTheme = data.theme;
          var themeLink = document.getElementById('theme-stylesheet');
          if (!isServerThemeHrefActive(themeLink)) {
            publishPlugins(data.plugins || {});
            syncPluginAuthUi();
            return updateThemeStylesheet(state.currentTheme);
          }
        }
        publishPlugins((data && data.plugins) || {});
        syncPluginAuthUi();
      })
      .then(function () {
        updateThemeSelect();
      })
      .catch(function () {
        var cached = readCachedPlugins();
        if (cached) {
          publishPlugins(cached);
          syncPluginAuthUi();
        }
        updateThemeSelect();
      });
  }

  function saveTheme(theme) {
    var params = new URLSearchParams({ theme: theme });
    fetch('/cgi/blog-set-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }).catch(function () {
      // Keep local style even if persistence fails.
    });
  }

  function bindThemeSelect() {
    var themeSelect = document.getElementById('theme-select');
    if (!themeSelect) {
      return;
    }

    function preserveFocus() {
      if (document.activeElement === themeSelect) {
        return;
      }
      setTimeout(function () {
        try {
          themeSelect.focus({ preventScroll: true });
        } catch (_) {
          themeSelect.focus();
        }
      }, 0);
    }

    function applySelectedTheme(nextTheme) {
      state.currentTheme = nextTheme;
      updateThemeStylesheet(nextTheme);
      saveTheme(nextTheme);
      preserveFocus();
    }

    themeSelect.addEventListener('keydown', function (event) {
      if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      var enabledValues = Array.prototype.slice.call(themeSelect.options || []).filter(function (opt) {
        return !opt.disabled;
      }).map(function (opt) {
        return String(opt.value || '');
      });
      if (!enabledValues.length) {
        return;
      }
      var current = String(themeSelect.value || '');
      var currentIndex = enabledValues.indexOf(current);
      if (currentIndex < 0) {
        currentIndex = 0;
      }
      var nextIndex = event.key === 'ArrowDown'
        ? (currentIndex + 1) % enabledValues.length
        : (currentIndex - 1 + enabledValues.length) % enabledValues.length;
      var nextTheme = enabledValues[nextIndex];
      if (!nextTheme || nextTheme === current) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      themeSelect.value = nextTheme;
      applySelectedTheme(nextTheme);
    });

    themeSelect.addEventListener('change', function (event) {
      var nextTheme = event.target.value;
      applySelectedTheme(nextTheme);
    });
  }

  function bindUiEvents() {
    if (els.loginBtn) {
      els.loginBtn.addEventListener('click', function () {
        closeLoginMenu();
        startDesktopSignerLogin(false, '').catch(function (err) {
          showNavToast(err.message || 'Desktop signer login failed.', 'info', 4200);
          openLoginMenu();
        });
      });
    }

    if (els.loginMoreBtn && els.loginMenu) {
      els.loginMoreBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (els.loginMenu.hidden) {
          openLoginMenu();
        } else {
          closeLoginMenu();
        }
      });
    }

    if (els.loginMenuRegister) {
      els.loginMenuRegister.addEventListener('click', function () {
        closeLoginMenu();
        showAuthModal('register');
      });
    }

    if (els.loginMenuPhone) {
      els.loginMenuPhone.addEventListener('click', function () {
        closeLoginMenu();
        showAuthModal('phone');
      });
    }

    if (els.loginMenuManual) {
      els.loginMenuManual.addEventListener('click', function () {
        closeLoginMenu();
        showAuthModal('manual');
        setAuthControlsDisabled(true);
        prepareManualLogin().catch(function (err) {
          setAuthMessage(err.message || 'Failed to prepare manual login.', 'error');
        }).finally(function () {
          setAuthControlsDisabled(false);
        });
      });
    }

    if (els.loginMenuLearn) {
      els.loginMenuLearn.addEventListener('click', function () {
        closeLoginMenu();
        showInfoModal();
      });
    }

    if (els.authModal) {
      els.authModal.addEventListener('click', function (event) {
        if (event.target && event.target.hasAttribute('data-close-auth-modal')) {
          hideAuthModal();
        }
      });
    }
    if (els.authInfoModal) {
      els.authInfoModal.addEventListener('click', function (event) {
        if (event.target && event.target.hasAttribute('data-close-auth-info')) {
          hideInfoModal();
        }
      });
    }

    if (els.menuBtn && els.menuPanel) {
      els.menuBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeNavOverflowMenu();
        closeLoginMenu();
        if (els.menuPanel.hidden) {
          openUserMenu();
        } else {
          closeUserMenu();
        }
      });
    }

    if (els.navOverflowBtn && els.navOverflowPanel) {
      els.navOverflowBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeLoginMenu();
        closeUserMenu();
        if (els.navOverflowPanel.hidden) {
          openNavOverflowMenu();
        } else {
          closeNavOverflowMenu();
        }
      });
    }

    if (els.menuLogoutBtn) {
      els.menuLogoutBtn.addEventListener('click', function () {
        closeUserMenu();
        logout();
      });
    }

    if (els.menuLogoutEverywhereBtn) {
      els.menuLogoutEverywhereBtn.addEventListener('click', function () {
        closeUserMenu();
        setAuthMessage('Preparing log out other sessions challenge...', 'warn');
        logoutEverywhere().catch(function (err) {
          setAuthMessage(err.message || 'Log out other sessions failed.', 'error');
          showAuthModal('register');
        });
      });
    }

    document.addEventListener('click', function (event) {
      if (!els.userMenu || els.userMenu.style.display === 'none') {
        if (els.loginSplit && els.loginMenu && !els.loginMenu.hidden && !els.loginSplit.contains(event.target)) {
          closeLoginMenu();
        }
        if (els.navOverflowMenu && els.navOverflowPanel && !els.navOverflowPanel.hidden && !els.navOverflowMenu.contains(event.target)) {
          closeNavOverflowMenu();
        }
        return;
      }
      if (!els.userMenu.contains(event.target)) {
        closeUserMenu();
      }
      if (els.loginSplit && els.loginMenu && !els.loginMenu.hidden && !els.loginSplit.contains(event.target)) {
        closeLoginMenu();
      }
      if (els.navOverflowMenu && els.navOverflowPanel && !els.navOverflowPanel.hidden && !els.navOverflowMenu.contains(event.target)) {
        closeNavOverflowMenu();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && els.authModal && !els.authModal.hidden) {
        hideAuthModal();
        return;
      }
      if (event.key === 'Escape' && els.authInfoModal && !els.authInfoModal.hidden) {
        hideInfoModal();
        return;
      }
      if (event.key === 'Escape' && els.loginMenu && !els.loginMenu.hidden) {
        closeLoginMenu();
      }
      if (event.key === 'Escape' && els.navOverflowPanel && !els.navOverflowPanel.hidden) {
        closeNavOverflowMenu();
      }
    });

    if (els.authRegisterBtn) {
      els.authRegisterBtn.addEventListener('click', function () {
        var usernameHint = els.authRegisterUsername ? String(els.authRegisterUsername.value || '').trim() : '';
        startDesktopSignerLogin(true, usernameHint).catch(function (err) {
          setAuthMessage(err.message || 'Desktop signer login failed.', 'error');
        });
      });
    }

    if (els.authTabRegister) {
      els.authTabRegister.addEventListener('click', function () {
        setActiveAuthTab('register');
      });
    }
    if (els.authTabPhone) {
      els.authTabPhone.addEventListener('click', function () {
        setActiveAuthTab('phone');
      });
    }
    if (els.authTabManual) {
      els.authTabManual.addEventListener('click', function () {
        setActiveAuthTab('manual');
      });
    }

    if (els.authPhoneConnectBtn) {
      els.authPhoneConnectBtn.addEventListener('click', function () {
        startPhonePairingFlow().catch(function (err) {
          setAuthMessage(err.message || 'Phone pairing setup failed.', 'error');
        });
      });
    }

    if (els.authPhoneBtn) {
      els.authPhoneBtn.addEventListener('click', function () {
        setAuthMessage('Starting phone signer login...', 'warn');
        setAuthControlsDisabled(true);
        loginWithPhoneSigner().catch(function (err) {
          setAuthMessage(err.message || 'Phone signer login failed.', 'error');
        }).finally(function () {
          setAuthControlsDisabled(false);
        });
      });
    }

    if (els.authManualStart) {
      els.authManualStart.addEventListener('click', function () {
        setAuthControlsDisabled(true);
        prepareManualLogin().catch(function (err) {
          setAuthMessage(err.message || 'Failed to create manual challenge.', 'error');
        }).finally(function () {
          setAuthControlsDisabled(false);
        });
      });
    }

    if (els.authManualSubmit) {
      els.authManualSubmit.addEventListener('click', function () {
        setAuthMessage('Verifying pasted signed login...', 'warn');
        setAuthControlsDisabled(true);
        Promise.resolve()
          .then(function () {
            return submitManualLogin();
          })
          .catch(function (err) {
            setAuthMessage(err.message || 'Manual login failed.', 'error');
          })
          .finally(function () {
            setAuthControlsDisabled(false);
          });
      });
    }
  }

  function bootstrap() {
    var optimisticIsLoggedIn = false;
    var optimisticIsAdmin = false;
    var optimisticName = '';
    var optimisticSiteTitle = '';
    try {
      optimisticIsLoggedIn = hasStoredSessionToken();
      optimisticIsAdmin = String(localStorage.getItem('last_auth_is_admin') || '') === '1';
      optimisticName = String(localStorage.getItem('last_auth_player_name') || localStorage.getItem('last_auth_username') || '').trim();
      optimisticSiteTitle = String(localStorage.getItem(SITE_TITLE_CACHE_KEY) || '').trim();
    } catch (_err) {
      optimisticIsLoggedIn = false;
      optimisticIsAdmin = false;
      optimisticName = '';
      optimisticSiteTitle = '';
    }
    updateNavSiteSignature(optimisticSiteTitle);
    var cachedPlugins = readCachedPlugins();
    if (cachedPlugins) {
      publishPlugins(cachedPlugins);
    } else {
      window.__wizardryPlugins = state.plugins;
      window.__wizardryVideoChatEnabled = !!state.plugins.video_chat;
    }
    state.isAuthenticated = optimisticIsLoggedIn;
    applyLoggedInUi(optimisticIsLoggedIn, optimisticIsAdmin, optimisticName);

    renderComposeIcon(readComposeIconIndex());
    prefetchStaticPageHtmlForSlug('archive');
    prefetchStaticPageHtmlForSlug('tags');
    highlightCurrentPage();
    applyInitialHighlightInSyncWithContent();
    if (!optimisticIsLoggedIn) {
      warmNavbarNostrPagePrefetch();
    }
    loadNavbarNostrPages()
      .then(function () {
        highlightCurrentPage();
      })
      .catch(function () {
        // Keep startup resilient; cached nav remains usable.
      })
      .finally(function () {
        markHydrationNavReady();
    });
    checkAuth();
    loadTheme();
    window.addEventListener('hashchange', highlightCurrentPage);
    window.addEventListener('resize', scheduleNavOverflowMenuSync);
    bindThemeSelect();
    bindUiEvents();
    bindNavbarNostrPagePrefetch();
    scheduleNavOverflowMenuSync();
    setTimeout(scheduleNavOverflowMenuSync, 180);
    window.blogAuth = window.blogAuth || {};
    window.blogAuth.openLoginModal = showAuthModal;
    window.blogAuth.showToast = showNavToast;
    flushRememberedNavToast();
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
