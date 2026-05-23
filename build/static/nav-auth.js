(function () {
  'use strict';

  var AUTH_KIND = 22242;
  var NIP46_KIND = 24133;
  var NIP46_RELAYS = [
    'wss://andersaamodt.com'
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
  var THEME_CACHE_KEY = 'wizardry_blog_theme_v1';
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
      accountPubkey: '',
      relays: NIP46_RELAYS.slice(),
      pool: null,
      subscription: null,
      pending: {},
      pendingTimers: {},
      seenEvents: {},
      toolsWaitPromise: null,
      returnRefreshTimer: 0,
      deepLinkFallbackTimer: 0,
      autoLoginInFlight: false,
      diagnostics: {
        eventsSeen: 0,
        decryptErrors: 0,
        ignoredSecrets: 0,
        lastEventPubkey: '',
        lastMessage: ''
      }
    },
    prefetchedNostrPageSlugs: {},
    navOverflowRaf: 0,
    navOverflowTimer: 0,
    videoCallPresenceTimer: 0,
    videoCallNotification: null,
    videoCallCurrentCallId: '',
    videoCallAllowAdminCalls: false,
    activeAuthTab: 'register',
    activeAuthFlavor: 'desktop'
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
    authModalTitle: document.getElementById('auth-modal-title'),
    authMessage: document.getElementById('auth-modal-message'),
    authRegisterBtn: document.getElementById('auth-register-btn'),
    authPhoneBtn: document.getElementById('auth-phone-btn'),
    authTabRegister: document.getElementById('auth-tab-register'),
    authTabPhone: document.getElementById('auth-tab-phone'),
    authTabManual: document.getElementById('auth-tab-manual'),
    authLoginSummary: document.getElementById('auth-login-summary'),
    authLoginApps: document.getElementById('auth-login-apps'),
    authLoginNote: document.getElementById('auth-login-note'),
    authZapSummary: document.getElementById('auth-zap-summary'),
    authZapApps: document.getElementById('auth-zap-apps'),
    authZapNote: document.getElementById('auth-zap-note'),

    authRegisterPanel: document.getElementById('auth-register-panel'),
    authPhonePanel: document.getElementById('auth-phone-panel'),
    authNip46Qr: document.getElementById('auth-nip46-qr'),
    authNip46Uri: document.getElementById('auth-nip46-uri'),
    authNip46Open: document.getElementById('auth-nip46-open'),
    authNip46UriCopy: document.getElementById('auth-nip46-uri-copy'),
    authNip46Reset: document.getElementById('auth-nip46-reset'),
    authNip46Diagnostics: document.getElementById('auth-nip46-diagnostics'),

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
  var authMessageClearTimer = null;
  var themeSwitchVisualTimer = null;
  var themeSwapToken = 0;
  var sessionCheckRetryTimer = 0;
  var sessionCheckGraceToken = '';
  var sessionCheckGraceCount = 0;

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

  function shortPubkey(value) {
    var raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    return raw.slice(0, 8);
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
    syncVideoCallPresencePolling();
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

  function normalizeThemeName(value) {
    var text = compact(value);
    return text || 'archmage';
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

  function cacheTheme(theme) {
    try {
      localStorage.setItem(THEME_CACHE_KEY, normalizeThemeName(theme));
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function readSiteBootstrap() {
    var bootstrap = window.__wizardrySiteBootstrap;
    if (!bootstrap || typeof bootstrap !== 'object') {
      return null;
    }
    return bootstrap;
  }

  function readBootstrapConfig() {
    var bootstrap = readSiteBootstrap();
    if (!bootstrap || !bootstrap.config || typeof bootstrap.config !== 'object') {
      return null;
    }
    return bootstrap.config;
  }

  function readBootstrapNavbarPages() {
    var bootstrap = readSiteBootstrap();
    if (!bootstrap || !Array.isArray(bootstrap.navbar_pages) || !bootstrap.navbar_pages.length) {
      return null;
    }
    return bootstrap.navbar_pages;
  }

  function applySiteConfig(data) {
    var next = data && typeof data === 'object' ? data : {};
    var appendSiteTitle = normalizeAppendSiteTitleEnabled(next.append_site_title_to_page_title);
    updateNavSiteSignature(next.site_title || '');
    cacheSiteTitle(next.site_title || '');
    cacheAppendSiteTitleEnabled(appendSiteTitle);
    if (typeof window.__wizardrySetPageTitleConfig === 'function') {
      window.__wizardrySetPageTitleConfig(next.site_title || '', appendSiteTitle);
    } else if (typeof window.__wizardryApplyPageTitle === 'function') {
      window.__wizardryApplyPageTitle();
    }
    if (Object.prototype.hasOwnProperty.call(next, 'theme')) {
      state.currentTheme = normalizeThemeName(next.theme);
      cacheTheme(state.currentTheme);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'plugins')) {
      publishPlugins(next.plugins || {});
    }
    syncPluginAuthUi();
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

  function waitForNostrTools(timeoutMs) {
    if (hasNostrTools()) {
      state.nip46.toolsWaitPromise = null;
      return Promise.resolve();
    }
    if (state.nip46.toolsWaitPromise) {
      return state.nip46.toolsWaitPromise;
    }
    var startedAt = Date.now();
    var timeout = Number(timeoutMs || 8000);
    if (!isFinite(timeout) || timeout < 1000) {
      timeout = 8000;
    }
    state.nip46.toolsWaitPromise = new Promise(function (resolve, reject) {
      function check() {
        if (hasNostrTools()) {
          state.nip46.toolsWaitPromise = null;
          resolve();
          return;
        }
        if (Date.now() - startedAt >= timeout) {
          state.nip46.toolsWaitPromise = null;
          reject(new Error('Phone signer setup is still loading. The browser may have blocked the Nostr tools script. Advanced signed JSON remains available.'));
          return;
        }
        window.setTimeout(check, 80);
      }
      check();
    });
    return state.nip46.toolsWaitPromise;
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
    if (!els.authModal || !els.authModal.querySelector) {
      return null;
    }
    var panel = els.authModal.querySelector('.auth-modal-panel');
    if (!panel) {
      return null;
    }
    var node = (els.authMessage && els.authMessage.isConnected) ? els.authMessage : panel.querySelector('#auth-modal-message');
    var isNew = !node;
    if (isNew) {
      node = document.createElement('div');
    }
    node.id = 'auth-modal-message';
    if (isNew) {
      node.className = 'auth-modal-message';
      node.setAttribute('aria-live', 'polite');
    }
    var platformGrid = panel.querySelector('.auth-platform-grid');
    if (platformGrid && platformGrid.parentNode) {
      platformGrid.parentNode.insertBefore(node, platformGrid);
    } else {
      panel.appendChild(node);
    }
    els.authMessage = node;
    return els.authMessage;
  }

  function setAuthMessage(message, kind) {
    var target = ensureAuthMessageEl();
    if (!target) {
      return;
    }
    var text = String(message || '');
    if (authMessageClearTimer) {
      clearTimeout(authMessageClearTimer);
      authMessageClearTimer = null;
    }
    if (!text) {
      target.classList.remove('is-visible');
      authMessageClearTimer = setTimeout(function () {
        if (!target.classList.contains('is-visible')) {
          target.textContent = '';
          target.className = 'auth-modal-message';
        }
        authMessageClearTimer = null;
      }, 220);
      return;
    }
    target.textContent = text;
    target.className = 'auth-modal-message';
    if (kind) {
      target.classList.add('is-' + kind);
    }
    requestAnimationFrame(function () {
      target.classList.add('is-visible');
    });
    setTimeout(function () {
      target.classList.add('is-visible');
    }, 20);
  }

  function setNip46Diagnostics(message, kind) {
    if (!els.authNip46Diagnostics) {
      return;
    }
    var text = String(message || '');
    els.authNip46Diagnostics.textContent = text;
    els.authNip46Diagnostics.className = 'auth-nip46-diagnostics';
    if (text && kind) {
      els.authNip46Diagnostics.classList.add('is-' + kind);
    }
    state.nip46.diagnostics.lastMessage = text;
  }

  function isPhonePairingPanelActive() {
    return state.activeAuthTab === 'phone' && !!els.authPhonePanel && !els.authPhonePanel.hidden;
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
    if (els.authModal && typeof els.authModal.querySelectorAll === 'function') {
      els.authModal.querySelectorAll('[data-auth-route]').forEach(function (node) {
        node.disabled = isDisabled;
      });
    }
    if (!isDisabled) {
      updatePhoneContinueState();
    }
  }

  function updatePhoneContinueState() {
    var paired = !!state.nip46.signerPubkey;
    var controls = els.authPhonePanel && els.authPhonePanel.querySelector
      ? els.authPhonePanel.querySelector('.auth-nip46-controls')
      : null;
    var linkActions = els.authPhonePanel && els.authPhonePanel.querySelector
      ? els.authPhonePanel.querySelector('.auth-nip46-link-actions')
      : null;
    if (controls) {
      controls.classList.toggle('is-paired', paired);
    }
    if (linkActions) {
      linkActions.hidden = paired;
    }
    if (els.authNip46Qr) {
      els.authNip46Qr.hidden = paired;
    }
    if (paired && !hasPendingNip46Requests()) {
      setNip46Diagnostics('Signer connected. Continue sign-in.', 'ok');
      setAuthMessage('Phone signer is already paired. Continue sign-in and approve the login request in Amber.', 'plain');
    }
    if (!els.authPhoneBtn) {
      return;
    }
    els.authPhoneBtn.disabled = !paired;
    els.authPhoneBtn.setAttribute('aria-disabled', paired ? 'false' : 'true');
    els.authPhoneBtn.hidden = !paired;
    els.authPhoneBtn.textContent = 'Continue sign-in';
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

  function signInHelperMessage(tabName) {
    var base = 'Choose a sign-in method. Your Nostr public key is your account, and the site never asks for a private key. First successful sign-in creates your account automatically. You can change your username after you log in.';
    var tab = String(tabName || 'register');
    if (tab === 'phone') {
      return base + ' Connect Nostr with the link or QR. Sign-in continues after pairing.';
    }
    if (tab === 'manual') {
      return base + ' Create a challenge, then paste the signed event JSON.';
    }
    return base;
  }

  function recommendationPlatformLabel(tabName, flavor) {
    var tab = String(tabName || 'register');
    var key = String(flavor || '').trim();
    if (tab === 'phone' && key === 'android') {
      return 'Android';
    }
    if (tab === 'phone' && key === 'ios') {
      return 'iPhone / iPad';
    }
    if (tab === 'phone' && key === 'remote') {
      return 'Remote signer';
    }
    if (tab === 'manual') {
      return 'Manual login';
    }
    return 'Desktop';
  }

  function loginOnboardingRecommendation(tabName, flavor) {
    var tab = String(tabName || 'register');
    var key = String(flavor || '').trim();
    var platformLabel = recommendationPlatformLabel(tab, key);
    var amberFDroid = { source: 'F-Droid', label: 'Download Amber', url: 'https://f-droid.org/packages/com.greenart7c3.nostrsigner/' };
    if (tab === 'phone' && key === 'ios') {
      return {
        summary: platformLabel + ' login',
        note: 'Recommended for iPhone and iPad Nostr Connect login.',
        apps: [
          {
            iconKey: 'nostr-connect',
            name: 'Nostr Connect-compatible signer',
            platformLabel: platformLabel,
            purpose: 'Login via Nostr',
            url: 'https://github.com/nostr-protocol/nips/blob/master/46.md',
            stores: [{ source: 'NIP-46', label: 'Protocol details', url: 'https://github.com/nostr-protocol/nips/blob/master/46.md' }]
          }
        ]
      };
    }
    if (tab === 'phone' && key === 'remote') {
      return {
        summary: platformLabel + ' login',
        note: 'Recommended for remote Nostr Connect signers.',
        apps: [
          {
            iconKey: 'nostr-connect',
            name: 'Nostr Connect remote signer',
            platformLabel: platformLabel,
            purpose: 'Login via Nostr',
            url: 'https://github.com/nostr-protocol/nips/blob/master/46.md',
            stores: [{ source: 'NIP-46', label: 'Protocol details', url: 'https://github.com/nostr-protocol/nips/blob/master/46.md' }]
          }
        ]
      };
    }
    if (tab === 'phone') {
      return {
        summary: platformLabel + ' login',
        note: 'Recommended for Android Nostr Connect login.',
        apps: [
          {
            iconKey: 'amber',
            name: 'Amber',
            platformLabel: platformLabel,
            purpose: 'Login via Nostr',
            url: 'https://github.com/greenart7c3/Amber',
            stores: [amberFDroid]
          }
        ]
      };
    }
    if (tab === 'manual') {
      return {
        summary: platformLabel,
        note: 'Fallback for signing the login challenge outside this page.',
        apps: [
          {
            iconKey: 'signed-challenge',
            name: 'Signed challenge',
            platformLabel: 'Any platform',
            purpose: 'Login via Nostr',
            url: 'https://github.com/nostr-protocol/nips/blob/master/98.md',
            stores: [{ source: 'NIP-98', label: 'Protocol details', url: 'https://github.com/nostr-protocol/nips/blob/master/98.md' }]
          }
        ]
      };
    }
    return {
      summary: platformLabel + ' login',
      note: 'Recommended for desktop browser sign-in.',
      apps: [
        {
          iconKey: 'nos2x',
          name: 'nos2x-fox',
          platformLabel: 'Desktop Firefox',
          purpose: 'Login via Nostr',
          url: 'https://addons.mozilla.org/en-US/firefox/addon/nos2x-fox/',
          stores: [{ source: 'Firefox Add-ons', label: 'Download nos2x-fox', url: 'https://addons.mozilla.org/en-US/firefox/addon/nos2x-fox/' }]
        }
      ]
    };
  }

  function zapOnboardingRecommendation(tabName, flavor) {
    var tab = String(tabName || 'register');
    var key = String(flavor || '').trim();
    var platformLabel = recommendationPlatformLabel(tab, key);
    var amethystDownload = { source: 'GitHub', label: 'Download Amethyst', url: 'https://github.com/vitorpamplona/amethyst#installation' };
    var zeusDownload = { source: 'ZEUS', label: 'Download ZEUS', url: 'https://github.com/ZeusLN/zeus#app-store-links' };
    var auroraStore = { source: 'Aurora', label: 'Download Aurora Store', url: 'https://auroraoss.com/downloads/AuroraStore/' };
    if (tab === 'phone' && key === 'ios') {
      return {
        summary: platformLabel + ' zaps',
        note: 'Recommended for sending zaps from iPhone and iPad.',
        apps: [
          {
            iconKey: 'damus',
            name: 'Damus',
            platformLabel: platformLabel,
            purpose: 'Zaps: Nostr client',
            url: 'https://damus.io/',
            stores: [{ source: 'App Store', label: 'Download Damus', url: 'https://apps.apple.com/us/app/damus/id1628663131' }]
          },
          {
            iconKey: 'nostur',
            name: 'Nostur',
            platformLabel: platformLabel,
            purpose: 'Zaps: Nostr client',
            url: 'https://nostur.com/',
            stores: [{ source: 'App Store', label: 'Download Nostur', url: 'https://nostur.com/appstore' }]
          },
          {
            iconKey: 'zeus',
            name: 'ZEUS',
            platformLabel: platformLabel,
            purpose: 'Zaps: Lightning wallet',
            url: 'https://github.com/ZeusLN/zeus#app-store-links',
            stores: [{ source: 'App Store', label: 'Download ZEUS', url: 'https://apps.apple.com/us/app/zeus-ln/id1456038895' }]
          }
        ]
      };
    }
    if (tab === 'phone' && key === 'remote') {
      return {
        summary: platformLabel + ' zaps',
        note: 'Recommended when the signer is remote or the current platform is unknown.',
        apps: [
          {
            iconKey: 'zeus',
            name: 'ZEUS',
            platformLabel: 'Remote signer',
            purpose: 'Zaps: Lightning wallet',
            url: 'https://github.com/ZeusLN/zeus#app-store-links',
            stores: [zeusDownload, auroraStore]
          }
        ]
      };
    }
    if (tab === 'phone') {
      return {
        summary: platformLabel + ' zaps',
        note: 'Recommended for sending zaps from Android.',
        apps: [
          {
            iconKey: 'amethyst',
            name: 'Amethyst',
            platformLabel: platformLabel,
            purpose: 'Zaps: Nostr client',
            url: 'https://github.com/vitorpamplona/amethyst#installation',
            stores: [amethystDownload, auroraStore]
          },
          {
            iconKey: 'zeus',
            name: 'ZEUS',
            platformLabel: platformLabel,
            purpose: 'Zaps: Lightning wallet',
            url: 'https://github.com/ZeusLN/zeus#app-store-links',
            stores: [zeusDownload, auroraStore]
          }
        ]
      };
    }
    if (tab === 'manual') {
      return {
        summary: 'Manual login zaps',
        note: 'Zap recommendations are separate from manual login and can use any compatible wallet.',
        apps: [
          {
            iconKey: 'zeus',
            name: 'ZEUS',
            platformLabel: 'Any platform',
            purpose: 'Zaps: Lightning wallet',
            url: 'https://github.com/ZeusLN/zeus#app-store-links',
            stores: [zeusDownload, auroraStore]
          }
        ]
      };
    }
    return {
      summary: platformLabel + ' zaps',
      note: 'Recommended for desktop or browser-based zap flows.',
      apps: [
        {
          iconKey: 'zeus',
          name: 'ZEUS',
          platformLabel: 'Desktop / web',
          purpose: 'Zaps: Lightning wallet',
          url: 'https://github.com/ZeusLN/zeus#app-store-links',
          stores: [zeusDownload, auroraStore]
        }
      ]
    };
  }

  function recommendationIconSvg(iconKey) {
    var key = String(iconKey || '').trim();
    var icons = {
      'nostr-connect': '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7.5h10"></path><path d="M7 16.5h10"></path><circle cx="7" cy="7.5" r="2.3"></circle><circle cx="17" cy="16.5" r="2.3"></circle></svg>',
      'signed-challenge': '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 8.5 5 12l3.5 3.5"></path><path d="M15.5 8.5 19 12l-3.5 3.5"></path><path d="m13.5 7-3 10"></path></svg>',
      'fallback': '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 20 10l-8 11-8-11z"></path><path d="M4 10h16"></path><path d="M8 10l4 11 4-11"></path><path d="M8 10l4-7 4 7"></path></svg>'
    };
    return icons[key] || icons.fallback;
  }

  function recommendationIconAsset(iconKey) {
    var key = String(iconKey || '').trim();
    var assets = {
      amber: '/static/icons/apps/amber.svg',
      amethyst: '/static/icons/apps/amethyst.png',
      damus: '/static/icons/apps/damus.png',
      nostur: '/static/icons/apps/nostur.png',
      nos2x: '/static/icons/apps/nos2x-fox.svg',
      zeus: '/static/icons/apps/zeus.png'
    };
    return assets[key] || '';
  }

  function renderRecommendationIcon(icon, app) {
    var asset = recommendationIconAsset(app.iconKey);
    icon.textContent = '';
    if (asset) {
      var img = document.createElement('img');
      img.className = 'auth-reco-app-img';
      img.src = asset;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      icon.appendChild(img);
      return;
    }
    icon.innerHTML = recommendationIconSvg(app.iconKey);
  }

  function renderRecommendationList(summaryEl, appsEl, noteEl, recommendation) {
    if (!summaryEl || !appsEl) {
      return;
    }
    summaryEl.textContent = recommendation.summary || 'Install:';
    if (noteEl) {
      noteEl.textContent = recommendation.note || '';
    }
    appsEl.innerHTML = '';
    recommendation.apps.forEach(function (app) {
      var item = document.createElement('li');
      var appLink = document.createElement('a');
      var icon = document.createElement('span');
      var label = document.createElement('span');
      var name = document.createElement('strong');
      var purpose = document.createElement('span');
      var platform = document.createElement('span');
      var stores = document.createElement('span');
      appLink.className = 'auth-reco-app-link';
      appLink.href = app.url;
      appLink.target = '_blank';
      appLink.rel = 'noopener noreferrer';
      icon.className = 'auth-reco-app-icon';
      renderRecommendationIcon(icon, app);
      label.className = 'auth-reco-app-label';
      name.textContent = app.name;
      purpose.className = 'auth-reco-app-purpose';
      purpose.textContent = app.purpose || recommendation.purpose || '';
      platform.className = 'auth-reco-platform';
      platform.textContent = app.platformLabel || recommendation.platformLabel || '';
      label.appendChild(name);
      if (purpose.textContent) {
        label.appendChild(purpose);
      }
      if (platform.textContent) {
        label.appendChild(platform);
      }
      appLink.appendChild(icon);
      appLink.appendChild(label);
      stores.className = 'auth-reco-store-links';
      (app.stores || []).forEach(function (store, idx) {
        var link = document.createElement('a');
        var source = String(store.source || '').trim();
        link.href = store.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = store.label;
        if (source) {
          stores.appendChild(document.createTextNode(source + ': '));
        }
        stores.appendChild(link);
        if (idx < app.stores.length - 1) {
          stores.appendChild(document.createTextNode(' / '));
        }
      });
      item.appendChild(appLink);
      item.appendChild(stores);
      appsEl.appendChild(item);
    });
  }

  function renderLoginOnboarding(tabName, flavor) {
    renderRecommendationList(
      els.authLoginSummary,
      els.authLoginApps,
      els.authLoginNote,
      loginOnboardingRecommendation(tabName, flavor)
    );
  }

  function renderZapOnboarding(tabName, flavor) {
    renderRecommendationList(
      els.authZapSummary,
      els.authZapApps,
      els.authZapNote,
      zapOnboardingRecommendation(tabName, flavor)
    );
  }

  function updateAuthPlatformCards(tab, flavor) {
    if (!els.authModal || typeof els.authModal.querySelectorAll !== 'function') {
      return;
    }
    var activeTab = String(tab || 'register');
    var activeFlavor = String(flavor || '');
    els.authModal.querySelectorAll('[data-auth-route]').forEach(function (button) {
      var route = String(button.getAttribute('data-auth-route') || '');
      var cardFlavor = String(button.getAttribute('data-auth-flavor') || '');
      var active = route === activeTab && (!activeFlavor || cardFlavor === activeFlavor || (activeTab !== 'phone' && !activeFlavor));
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setActiveAuthTab(tabName, phoneFlavor) {
    var tab = String(tabName || 'register');
    if (tab !== 'register' && tab !== 'phone' && tab !== 'manual') {
      tab = 'register';
    }
    var flavor = String(phoneFlavor || (tab === 'phone' ? 'android' : tab)).trim() || tab;
    state.activeAuthTab = tab;
    state.activeAuthFlavor = flavor;
    if (els.authModalTitle) {
      els.authModalTitle.textContent = 'Sign in';
    }
    updateAuthPlatformCards(tab, flavor);
    renderLoginOnboarding(tab, flavor);
    renderZapOnboarding(tab, flavor);

    if (els.authTabRegister) {
      var activeRegister = tab === 'register';
      els.authTabRegister.classList.toggle('is-active', activeRegister);
      els.authTabRegister.setAttribute('aria-pressed', activeRegister ? 'true' : 'false');
    }
    if (els.authTabPhone) {
      var activePhone = tab === 'phone' && flavor === 'android';
      els.authTabPhone.classList.toggle('is-active', activePhone);
      els.authTabPhone.setAttribute('aria-pressed', activePhone ? 'true' : 'false');
    }
    if (els.authTabManual) {
      var activeManual = tab === 'manual';
      els.authTabManual.classList.toggle('is-active', activeManual);
      els.authTabManual.setAttribute('aria-pressed', activeManual ? 'true' : 'false');
    }

    showPanel(els.authRegisterPanel, tab === 'register');
    showPanel(els.authPhonePanel, tab === 'phone');
    showPanel(els.authManualPanel, tab === 'manual');

    if (tab === 'phone') {
      updatePhoneContinueState();
      setAuthMessage(signInHelperMessage(tab), 'plain');
      initNip46Pairing().then(function () {
        updatePhoneContinueState();
      }).catch(function (err) {
        setAuthMessage(err.message || 'Unable to prepare phone signer QR.', 'error');
      });
      return;
    }
    if (tab === 'manual') {
      setAuthMessage(signInHelperMessage(tab), 'plain');
      return;
    }
    setAuthMessage(signInHelperMessage(tab), 'plain');
  }

  function showAuthModal(initialTab) {
    if (!els.authModal) {
      return;
    }
    var initialSelection = normalizeAuthInitialSelection(initialTab);
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
    setActiveAuthTab(initialSelection.tab, initialSelection.flavor);
  }

  function hideAuthModal() {
    if (!els.authModal) {
      return;
    }
    els.authModal.classList.remove('is-open');
    document.body.classList.remove('auth-modal-open');
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

  function videoCallAuthPayload(payload) {
    var next = payload && typeof payload === 'object' ? Object.assign({}, payload) : {};
    next.session_token = getSessionToken();
    next.csrf_token = getCsrfToken();
    return next;
  }

  function ensureVideoCallNotificationStyles() {
    if (document.getElementById('video-call-notification-styles')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'video-call-notification-styles';
    style.textContent = ''
      + '.video-call-notification{position:fixed;right:16px;bottom:18px;z-index:2147482600;max-width:min(22rem,calc(100vw - 32px));background:#fffaf1;color:#241b12;border:1px solid rgba(98,75,42,.28);box-shadow:0 16px 40px rgba(36,27,18,.2);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:9px;font-family:Georgia,Times New Roman,serif;}'
      + '.video-call-notification strong{font-size:1rem;line-height:1.2;}'
      + '.video-call-notification p{margin:0;color:#5c4b36;font-size:.92rem;line-height:1.35;}'
      + '.video-call-notification-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}'
      + '.video-call-notification button{appearance:none;border:1px solid rgba(98,75,42,.36);background:#f5ead7;color:#241b12;border-radius:999px;padding:7px 12px;font:inherit;font-size:.92rem;line-height:1;cursor:pointer;}'
      + '.video-call-notification button.primary{background:#2f63be;border-color:#2b56a4;color:white;}'
      + '.video-call-notification button:hover{filter:brightness(.98);}';
    document.head.appendChild(style);
  }

  function hideVideoCallNotification(callId) {
    if (callId && state.videoCallCurrentCallId && callId !== state.videoCallCurrentCallId) {
      return;
    }
    state.videoCallCurrentCallId = '';
    if (state.videoCallNotification && state.videoCallNotification.parentNode) {
      state.videoCallNotification.parentNode.removeChild(state.videoCallNotification);
    }
    state.videoCallNotification = null;
  }

  function answerVideoCall(callId) {
    return postForm('/cgi/blog-video-chat-control', videoCallAuthPayload({
      action: 'answer_call',
      call_id: callId
    })).then(function (data) {
      if (!data || !data.success) {
        throw new Error((data && data.error) || 'Could not answer call.');
      }
      hideVideoCallNotification(callId);
      var roomId = String(data.room_id || (data.call && data.call.room_id) || '').trim();
      var roomPassword = String(data.room_password || (data.call && data.call.room_password) || '').trim();
      if (roomId) {
        var url = '/contact?room=' + encodeURIComponent(roomId) + '&auto_start=1&mode=video';
        if (callId) {
          url += '&call_id=' + encodeURIComponent(callId);
        }
        if (roomPassword) {
          url += '&room_password=' + encodeURIComponent(roomPassword);
        }
        window.location.href = url;
      }
    }).catch(function () {
      hideVideoCallNotification(callId);
    });
  }

  function declineVideoCall(callId) {
    return postForm('/cgi/blog-video-chat-control', videoCallAuthPayload({
      action: 'decline_call',
      call_id: callId
    })).catch(function () {
      return false;
    }).then(function () {
      hideVideoCallNotification(callId);
    });
  }

  function showVideoCallNotification(call) {
    if (!call || !call.call_id) {
      return;
    }
    var callId = String(call.call_id);
    if (state.videoCallCurrentCallId === callId && state.videoCallNotification) {
      return;
    }
    hideVideoCallNotification();
    ensureVideoCallNotificationStyles();
    var node = document.createElement('section');
    node.className = 'video-call-notification';
    node.setAttribute('role', 'alertdialog');
    node.setAttribute('aria-live', 'assertive');
    var isSelfTest = !!call.self_test;
    var isOwnerCall = !!call.owner_call;
    node.innerHTML = ''
      + '<strong>' + (isOwnerCall ? 'Private call for Anders' : (isSelfTest ? 'Self-test video call' : 'Incoming video call')) + '</strong>'
      + '<p>' + (isOwnerCall ? escapeHtml(call.from_admin_name || 'Website visitor') + ' is waiting in a private 1:1 room.' : (isSelfTest ? 'You started a test call to this signed-in account.' : escapeHtml(call.from_admin_name || call.from_admin || 'Site admin') + ' is calling you on this site.')) + '</p>'
      + '<div class="video-call-notification-actions">'
      + '<button type="button" class="primary" data-video-call-action="answer">Answer</button>'
      + '<button type="button" data-video-call-action="decline">Decline</button>'
      + '</div>';
    node.addEventListener('click', function (event) {
      var button = event.target instanceof Element ? event.target.closest('[data-video-call-action]') : null;
      if (!button) {
        return;
      }
      var action = button.getAttribute('data-video-call-action');
      if (action === 'answer') {
        answerVideoCall(callId);
      } else if (action === 'decline') {
        declineVideoCall(callId);
      }
    });
    document.body.appendChild(node);
    state.videoCallNotification = node;
    state.videoCallCurrentCallId = callId;
  }

  function pollVideoCallPresence() {
    if (!state.isAuthenticated || !(state.plugins && state.plugins.video_chat) || !hasStoredSessionToken() || !getCsrfToken()) {
      hideVideoCallNotification();
      return Promise.resolve(false);
    }
    var roomId = '';
    try {
      roomId = String(window.__wizardryVideoChatRoomId || '').trim();
    } catch (_err) {
      roomId = '';
    }
    return postForm('/cgi/blog-video-chat-control', videoCallAuthPayload({
      action: 'heartbeat',
      current_room: roomId,
      status: roomId ? 'in-room' : 'online',
      page_url: window.location.pathname + window.location.search
    })).then(function (data) {
      if (!data || !data.success) {
        return false;
      }
      state.videoCallAllowAdminCalls = !!data.allow_admin_calls;
      var calls = Array.isArray(data.incoming_calls) ? data.incoming_calls : [];
      if (calls.length) {
        showVideoCallNotification(calls[0]);
      } else {
        hideVideoCallNotification();
      }
      return true;
    }).catch(function () {
      return false;
    });
  }

  function syncVideoCallPresencePolling() {
    if (state.videoCallPresenceTimer) {
      window.clearInterval(state.videoCallPresenceTimer);
      state.videoCallPresenceTimer = 0;
    }
    if (!state.isAuthenticated || !(state.plugins && state.plugins.video_chat) || !hasStoredSessionToken()) {
      hideVideoCallNotification();
      return;
    }
    pollVideoCallPresence();
    state.videoCallPresenceTimer = window.setInterval(function () {
      if (document.visibilityState !== 'hidden') {
        pollVideoCallPresence();
      }
    }, 12000);
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

  function emitAuthChanged(detail) {
    var extra = detail && typeof detail === 'object' ? detail : {};
    try {
      window.dispatchEvent(new CustomEvent('blog-auth-changed', {
        detail: Object.assign({
          session_token: getSessionToken(),
          csrf_token: getCsrfToken()
        }, extra)
      }));
    } catch (_err) {
      // Ignore event dispatch failures.
    }
  }

  function rememberAuth(data) {
    localStorage.setItem('session_token', data.session_token || '');
    localStorage.setItem('csrf_token', data.csrf_token || '');
    localStorage.setItem('last_auth_method', 'nostr');
    if (data.player_name) {
      localStorage.setItem('last_auth_player_name', data.player_name);
    }
    if (data.username) {
      localStorage.setItem('last_auth_username', data.username);
    }
    if (data.pubkey) {
      localStorage.setItem('last_auth_pubkey', data.pubkey);
    }
  }

  function clearLocalStorageAuth() {
    localStorage.removeItem('session_token');
    localStorage.removeItem('csrf_token');
    localStorage.removeItem('last_auth_method');
    emitAuthChanged();
  }

  function resetSessionCheckGrace() {
    sessionCheckGraceToken = '';
    sessionCheckGraceCount = 0;
    if (sessionCheckRetryTimer) {
      window.clearTimeout(sessionCheckRetryTimer);
      sessionCheckRetryTimer = 0;
    }
  }

  function hasStoredNostrAuthHint() {
    var method = String(localStorage.getItem('last_auth_method') || '').trim().toLowerCase();
    var pubkey = String(localStorage.getItem('last_auth_pubkey') || '').trim().toLowerCase();
    return method === 'nostr' || !!pubkey;
  }

  function scheduleSessionCheckRetry(token) {
    var retryToken = String(token || '').trim();
    if (!retryToken) {
      return;
    }
    if (sessionCheckRetryTimer) {
      window.clearTimeout(sessionCheckRetryTimer);
    }
    sessionCheckRetryTimer = window.setTimeout(function () {
      sessionCheckRetryTimer = 0;
      var currentToken = String(getSessionToken() || '').trim();
      if (!currentToken || currentToken !== retryToken) {
        return;
      }
      checkAuth();
    }, 1200);
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
      state.nip46.accountPubkey = '';
      state.nip46.appSecretHex = '';
      state.nip46.appPubkey = '';
      state.nip46.pairSecret = '';
      state.nip46.pending = {};
      state.nip46.pendingTimers = {};
      state.nip46.seenEvents = {};
      state.nip46.toolsWaitPromise = null;
      if (state.nip46.returnRefreshTimer) {
        clearTimeout(state.nip46.returnRefreshTimer);
        state.nip46.returnRefreshTimer = 0;
      }
      if (state.nip46.deepLinkFallbackTimer) {
        clearTimeout(state.nip46.deepLinkFallbackTimer);
        state.nip46.deepLinkFallbackTimer = 0;
      }
      state.nip46.autoLoginInFlight = false;
      state.nip46.diagnostics = {
        eventsSeen: 0,
        decryptErrors: 0,
        ignoredSecrets: 0,
        lastEventPubkey: '',
        lastMessage: ''
      };
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
      syncVideoCallPresencePolling();
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
    syncVideoCallPresencePolling();
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
      resetSessionCheckGrace();
      clearLocalStorageAuth();
      applyLoggedInUi(false, false, '');
      return Promise.resolve(false);
    }

    return fetch('/cgi/ssh-auth-check-session?session_token=' + encodeURIComponent(token), { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.authenticated) {
          if ((state.isAuthenticated || hasStoredNostrAuthHint()) && token) {
            if (sessionCheckGraceToken === token) {
              sessionCheckGraceCount += 1;
            } else {
              sessionCheckGraceToken = token;
              sessionCheckGraceCount = 1;
            }
            if (sessionCheckGraceCount < 2) {
              scheduleSessionCheckRetry(token);
              return !!state.isAuthenticated || hasStoredNostrAuthHint();
            }
          }
          resetSessionCheckGrace();
          clearLocalStorageAuth();
          applyLoggedInUi(false, false, '');
          return false;
        }
        resetSessionCheckGrace();
        if (data.csrf_token) {
          localStorage.setItem('csrf_token', data.csrf_token);
        }
        if (data.nostr_pubkey) {
          localStorage.setItem('last_auth_pubkey', data.nostr_pubkey);
        }
        if (data.session_auth_method) {
          localStorage.setItem('last_auth_method', data.session_auth_method);
        } else if (data.nostr_pubkey) {
          localStorage.setItem('last_auth_method', 'nostr');
        } else if (hasStoredNostrAuthHint()) {
          localStorage.setItem('last_auth_method', 'nostr');
        } else {
          localStorage.removeItem('last_auth_method');
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
        emitAuthChanged({
          authenticated: true,
          is_admin: !!data.is_admin,
          username: data.username || '',
          player_name: data.player_name || localStorage.getItem('last_auth_player_name') || data.username || '',
          other_sessions_count: data.other_sessions_count || 0
        });
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

  function isMobileLikeRuntime() {
    var nav = typeof navigator === 'object' ? navigator : null;
    var ua = String((nav && nav.userAgent) || '');
    var uaData = nav && nav.userAgentData ? nav.userAgentData : null;
    if (uaData && uaData.mobile === true) {
      return true;
    }
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
      return true;
    }
    var hasTouch = !!(nav && nav.maxTouchPoints && nav.maxTouchPoints > 0);
    var coarsePointer = false;
    var narrowViewport = false;
    if (typeof window.matchMedia === 'function') {
      coarsePointer = window.matchMedia('(pointer: coarse), (hover: none)').matches;
      narrowViewport = window.matchMedia('(max-width: 780px)').matches;
    }
    return hasTouch && (coarsePointer || narrowViewport);
  }

  function detectedAuthPlatformFlavor() {
    var nav = typeof navigator === 'object' ? navigator : null;
    var ua = String((nav && nav.userAgent) || '');
    var platform = String((nav && nav.platform) || '');
    var uaData = nav && nav.userAgentData ? nav.userAgentData : null;
    var uaPlatform = String((uaData && uaData.platform) || '');
    var combined = [ua, platform, uaPlatform].join(' ');
    var touchPoints = Number((nav && nav.maxTouchPoints) || 0);
    if (/Android/i.test(combined)) {
      return 'android';
    }
    if (/iPhone|iPad|iPod/i.test(combined)) {
      return 'ios';
    }
    // iPadOS can present itself as desktop Safari on MacIntel.
    if (/Mac/i.test(platform) && touchPoints > 1) {
      return 'ios';
    }
    if (isMobileLikeRuntime()) {
      return 'remote';
    }
    return 'desktop';
  }

  function preferredAuthInitialSelection() {
    var flavor = detectedAuthPlatformFlavor();
    if (flavor === 'android' || flavor === 'ios' || flavor === 'remote') {
      return { tab: 'phone', flavor: flavor };
    }
    return { tab: 'register', flavor: 'desktop' };
  }

  function normalizeAuthInitialSelection(initialTab, initialFlavor) {
    var fallback = preferredAuthInitialSelection();
    if (initialTab && typeof initialTab === 'object') {
      return normalizeAuthInitialSelection(initialTab.tab || initialTab.route, initialTab.flavor);
    }
    var tab = String(initialTab || '').trim();
    var flavor = String(initialFlavor || '').trim();
    if (!tab || tab === 'auto') {
      return fallback;
    }
    if (tab === 'phone') {
      if (!flavor) {
        var detected = detectedAuthPlatformFlavor();
        flavor = (detected === 'android' || detected === 'ios') ? detected : 'remote';
      }
      return { tab: 'phone', flavor: flavor };
    }
    if (tab === 'manual') {
      return { tab: 'manual', flavor: 'manual' };
    }
    return { tab: 'register', flavor: 'desktop' };
  }

  function preferredUnsignedLoginTab() {
    return preferredAuthInitialSelection();
  }

  function startPrimaryLogin() {
    closeLoginMenu();
    if (!hasDesktopSigner()) {
      showAuthModal(preferredUnsignedLoginTab());
      return Promise.resolve(false);
    }
    return startDesktopSignerLogin(false, '');
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
    var metadata = {
      name: 'Nostr Blog',
      url: window.location.origin,
      description: 'Sign in and sign zaps for this blog.'
    };
    relays.forEach(function (relay) {
      params.append('relay', relay);
    });
    params.set('secret', pairSecret);
    params.set('name', 'Nostr Blog');
    params.set('metadata', JSON.stringify(metadata));
    params.set('perms', 'get_public_key,sign_event:22242,sign_event:9734');
    return 'nostrconnect://' + appPubkey + '?' + params.toString();
  }

  function saveNip46PairState() {
    if (!state.nip46.appSecretHex || !state.nip46.appPubkey) {
      return Promise.resolve();
    }
    return idbSet(KEY_NIP46_PAIR, {
      version: 2,
      domain: currentHost(),
      appSecretHex: state.nip46.appSecretHex,
      appPubkey: state.nip46.appPubkey,
      pairSecret: state.nip46.pairSecret,
      relays: state.nip46.relays,
      signerPubkey: normalizePubkeyHex(state.nip46.signerPubkey || ''),
      accountPubkey: normalizePubkeyHex(state.nip46.accountPubkey || ''),
      createdAt: nowEpoch()
    });
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

  function updateNip46PairingLink() {
    if (!state.nip46.appPubkey || !state.nip46.pairSecret) {
      return;
    }
    var uri = buildNostrConnectUri(state.nip46.appPubkey, state.nip46.pairSecret, state.nip46.relays);
    if (els.authNip46Uri) {
      els.authNip46Uri.textContent = uri;
    }
    if (els.authNip46Open) {
      els.authNip46Open.href = uri;
      els.authNip46Open.setAttribute('data-nip46-uri', uri);
      els.authNip46Open.textContent = 'Connect Nostr';
      els.authNip46Open.setAttribute('aria-label', 'Connect Nostr with a signer app');
      els.authNip46Open.setAttribute('title', 'Connect Nostr with a signer app');
    }
    renderQrCode(uri);
    updatePhoneContinueState();
  }

  function currentNip46Uri() {
    if (!state.nip46.appPubkey || !state.nip46.pairSecret) {
      return '';
    }
    return buildNostrConnectUri(state.nip46.appPubkey, state.nip46.pairSecret, state.nip46.relays);
  }

  function hasPendingNip46Requests() {
    return Object.keys(state.nip46.pending || {}).length > 0;
  }

  function scheduleDeepLinkFallbackHint() {
    if (state.nip46.deepLinkFallbackTimer) {
      clearTimeout(state.nip46.deepLinkFallbackTimer);
      state.nip46.deepLinkFallbackTimer = 0;
    }
    state.nip46.deepLinkFallbackTimer = window.setTimeout(function () {
      state.nip46.deepLinkFallbackTimer = 0;
      if (!isPhonePairingPanelActive() || document.hidden || state.nip46.signerPubkey) {
        return;
      }
      setNip46Diagnostics('No signer app response yet. The copy button gives the same Nostr Connect link.', 'warn');
      setAuthMessage('No signer app response yet. Recommended Apps lists signer options, and the copy button gives a manual Nostr Connect link.', 'warn');
    }, 1800);
  }

  function refreshPhoneSignerListenerAfterReturn(reason) {
    if (!state.nip46.active || !state.nip46.appPubkey || !isPhonePairingPanelActive()) {
      return;
    }
    if (state.nip46.returnRefreshTimer) {
      clearTimeout(state.nip46.returnRefreshTimer);
    }
    state.nip46.returnRefreshTimer = window.setTimeout(function () {
      state.nip46.returnRefreshTimer = 0;
      waitForNostrTools(4000).then(function () {
        var status = 'Listening again for the signer response.';
        if (hasPendingNip46Requests()) {
          status = 'Checking signer approval after return.';
        } else if (state.nip46.signerPubkey) {
          status = 'Signer connected. Waiting for login approval.';
        }
        ensureNip46Subscription(180, status);
        updateNip46PairingLink();
      }).catch(function (err) {
        setNip46Diagnostics((err && err.message) || 'Phone signer setup is still loading.', 'error');
      });
    }, reason === 'focus' ? 120 : 0);
  }

  function openNativeDeepLink(uri, notReadyMessage) {
    var href = String(uri || '').trim();
    if (!href || href === '#') {
      setAuthMessage(notReadyMessage || 'Phone signer link is not ready yet.', 'error');
      return false;
    }
    try {
      setNip46Diagnostics('Opening signer app. Return here after approval.', 'info');
      setAuthMessage('Android may switch to the signer app. After approving pairing, return here for the login approval.', 'plain');
      scheduleDeepLinkFallbackHint();
      window.location.href = href;
      return true;
    } catch (_err) {
      setAuthMessage('This browser did not open the phone signer link. Copy link is available as a fallback.', 'error');
      return false;
    }
  }

  function initNip46Pairing() {
    return waitForNostrTools(8500).then(function () {
      return initNip46PairingWithTools();
    });
  }

  function initNip46PairingWithTools() {
    if (state.nip46.active) {
      updateNip46PairingLink();
      ensureNip46Subscription(180, state.nip46.signerPubkey ? '' : 'Waiting for signer');
      return Promise.resolve();
    }

    return idbGet(KEY_NIP46_PAIR).then(function (saved) {
      var appSecretHex = '';
      var pairSecret = '';
      var relays = NIP46_RELAYS.slice();
      var savedRelays = [];
      var savedRelaysMatchDefaults = false;

      if (saved && typeof saved === 'object' && saved.domain === currentHost()) {
        appSecretHex = String(saved.appSecretHex || '');
        pairSecret = String(saved.pairSecret || '');
        state.nip46.signerPubkey = normalizePubkeyHex(saved.signerPubkey || '');
        state.nip46.accountPubkey = normalizePubkeyHex(saved.accountPubkey || '');
        if (Array.isArray(saved.relays) && saved.relays.length) {
          savedRelays = saved.relays.map(function (item) { return String(item || '').trim(); }).filter(Boolean);
          savedRelaysMatchDefaults = savedRelays.length === NIP46_RELAYS.length && savedRelays.every(function (relay, idx) {
            return relay === NIP46_RELAYS[idx];
          });
          if (!savedRelaysMatchDefaults) {
            pairSecret = '';
          }
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
      state.nip46.signerPubkey = normalizePubkeyHex(state.nip46.signerPubkey || '');
      state.nip46.accountPubkey = normalizePubkeyHex(state.nip46.accountPubkey || '');
      state.nip46.pool = new window.NostrTools.SimplePool();
      state.nip46.pending = {};
      state.nip46.pendingTimers = {};
      state.nip46.seenEvents = {};
      state.nip46.autoLoginInFlight = false;
      state.nip46.diagnostics = {
        eventsSeen: 0,
        decryptErrors: 0,
        ignoredSecrets: 0,
        lastEventPubkey: '',
        lastMessage: ''
      };

      ensureNip46Subscription(30, 'Waiting for signer');

      return saveNip46PairState();
    }).then(function () {
      updateNip46PairingLink();
    });
  }

  function closeNip46Subscription() {
    if (state.nip46.subscription && typeof state.nip46.subscription.close === 'function') {
      state.nip46.subscription.close();
    }
    state.nip46.subscription = null;
  }

  function ensureNip46Pool() {
    if (!state.nip46.pool) {
      state.nip46.pool = new window.NostrTools.SimplePool();
    }
  }

  function ensureNip46Subscription(sinceSeconds, statusMessage) {
    if (!hasNostrTools() || !state.nip46.appPubkey) {
      return;
    }
    ensureNip46Pool();
    closeNip46Subscription();
    var lookback = Number(sinceSeconds || 30);
    if (!isFinite(lookback) || lookback < 30) {
      lookback = 30;
    }
    state.nip46.subscription = state.nip46.pool.subscribeMany(
      state.nip46.relays,
      [{ kinds: [NIP46_KIND], '#p': [state.nip46.appPubkey], since: nowEpoch() - lookback }],
      {
        onevent: function (event) {
          handleNip46RelayEvent(event);
        },
        oneose: function () {
          if (!state.nip46.signerPubkey) {
            setNip46Diagnostics(statusMessage || 'Waiting for signer', 'waiting');
          }
        },
        onclose: function () {
          if (isPhonePairingPanelActive() && !state.nip46.signerPubkey && state.nip46.diagnostics.eventsSeen > 0) {
            setNip46Diagnostics('Signer listener paused after relay activity. Returning to this panel refreshes it automatically.', 'warn');
          }
        }
      }
    );
    if (statusMessage) {
      setNip46Diagnostics(statusMessage, statusMessage === 'Waiting for signer' ? 'waiting' : 'info');
    }
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
    if (typeof msg.result === 'string') {
      return msg.result;
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

  function decryptNip46Content(event) {
    if (window.NostrTools.nip44 && typeof window.NostrTools.nip44.getConversationKey === 'function') {
      try {
        var conversationKey = window.NostrTools.nip44.getConversationKey(hexToBytes(state.nip46.appSecretHex), event.pubkey);
        return Promise.resolve(window.NostrTools.nip44.decrypt(event.content, conversationKey));
      } catch (_nip44Err) {
        // Older signers may still use the pre-NIP-44 Nostr Connect encryption path.
      }
    }
    return window.NostrTools.nip04.decrypt(hexToBytes(state.nip46.appSecretHex), event.pubkey, event.content);
  }

  function encryptNip46Content(pubkey, plaintext) {
    if (window.NostrTools.nip44 && typeof window.NostrTools.nip44.getConversationKey === 'function') {
      var conversationKey = window.NostrTools.nip44.getConversationKey(hexToBytes(state.nip46.appSecretHex), pubkey);
      return Promise.resolve(window.NostrTools.nip44.encrypt(plaintext, conversationKey));
    }
    return window.NostrTools.nip04.encrypt(hexToBytes(state.nip46.appSecretHex), pubkey, plaintext);
  }

  function continuePhoneSignerLogin(autoStarted) {
    if (state.nip46.autoLoginInFlight) {
      return Promise.resolve(false);
    }
    state.nip46.autoLoginInFlight = true;
    if (autoStarted) {
      setAuthMessage('Phone signer paired. Approve the sign-in request in the signer.', 'ok');
    } else {
      setAuthMessage('Starting phone signer login...', 'warn');
    }
    setAuthControlsDisabled(true);
    var loginPromise = loginWithPhoneSigner();
    if (!autoStarted && state.nip46.signerPubkey) {
      window.setTimeout(function () {
        openNativeDeepLink(currentNip46Uri(), 'Phone signer link is not ready yet.');
      }, 80);
    }
    return loginPromise.catch(function (err) {
      if (els.authPhoneBtn) {
        els.authPhoneBtn.hidden = false;
      }
      setAuthMessage(err.message || 'Phone signer login failed.', 'error');
      return false;
    }).finally(function () {
      state.nip46.autoLoginInFlight = false;
      setAuthControlsDisabled(false);
      updatePhoneContinueState();
    });
  }

  function handleNip46RelayEvent(event) {
    if (!event || !event.id || state.nip46.seenEvents[event.id]) {
      return;
    }
    state.nip46.seenEvents[event.id] = true;
    state.nip46.diagnostics.eventsSeen += 1;
    state.nip46.diagnostics.lastEventPubkey = String(event.pubkey || '');
    setNip46Diagnostics('Signer responded. Checking...', 'info');

    decryptNip46Content(event)
      .then(function (plain) {
        var msg = parseJsonResponse(plain);

        if (msg && msg.method === 'connect') {
          var secret = extractConnectSecret(msg);
          if (secret && secret !== state.nip46.pairSecret) {
            state.nip46.diagnostics.ignoredSecrets += 1;
            setNip46Diagnostics('Saw an old signer response, but it belongs to a previous QR. Open the newest phone signer link.', 'warn');
            return;
          }
          state.nip46.signerPubkey = normalizePubkeyHex(event.pubkey || '');
          saveNip46PairState();
          updatePhoneContinueState();
          setNip46Diagnostics('Connected. Requesting approval.', 'ok');
          continuePhoneSignerLogin(true);
          return;
        }

        if (extractConnectSecret(msg) === state.nip46.pairSecret) {
          state.nip46.signerPubkey = normalizePubkeyHex(event.pubkey || '');
          saveNip46PairState();
          updatePhoneContinueState();
          setNip46Diagnostics('Connected. Requesting approval.', 'ok');
          continuePhoneSignerLogin(true);
          return;
        }

        if (msg && msg.id && state.nip46.pending[msg.id]) {
          if (msg.error) {
            resolveNip46Pending(msg.id, typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error), true);
            return;
          }
          resolveNip46Pending(msg.id, msg.result, false);
          return;
        }
        setNip46Diagnostics('Saw a Nostr Connect event, but it was not the pairing response for this page.', 'warn');
      })
      .catch(function () {
        state.nip46.diagnostics.decryptErrors += 1;
        setNip46Diagnostics('Saw a signer response, but the page could not decrypt it. Open the newest phone signer link from this panel.', 'error');
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

    return encryptNip46Content(state.nip46.signerPubkey, JSON.stringify(rpc)).then(function (ciphertext) {
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
    return sendNip46Rpc('sign_event', [JSON.stringify(template)], 70000)
      .then(function (result) {
        if (typeof result === 'string') {
          return parseJsonResponse(result);
        }
        return normalizeSignedEvent(result);
      });
  }

  function getNip46AccountPubkey() {
    var cached = normalizePubkeyHex(state.nip46.accountPubkey || '');
    if (cached) {
      return Promise.resolve(cached);
    }
    return sendNip46Rpc('get_public_key', [], 30000).then(function (pubkey) {
      var normalized = normalizePubkeyHex(pubkey || '');
      if (!normalized) {
        throw new Error('Phone signer did not return a valid account pubkey.');
      }
      state.nip46.accountPubkey = normalized;
      return saveNip46PairState().then(function () {
        return normalized;
      });
    });
  }

  function signInWithSigner(signEventFn, options) {
    var opts = options && typeof options === 'object' ? options : {};
    var getPubkeyFn = typeof opts.getPubkeyFn === 'function' ? opts.getPubkeyFn : null;
    var allowStoredPubkeyHint = opts.allowStoredPubkeyHint !== false;
    var pubkeyHint = normalizePubkeyHex(opts.pubkeyHint || '') || (allowStoredPubkeyHint ? normalizePubkeyHex(localStorage.getItem('last_auth_pubkey') || '') : '');
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

  function resetPhonePairingLink(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var rotateAppKey = opts.rotateAppKey !== false;
    return waitForNostrTools(8500).then(function () {
      return idbGet(KEY_NIP46_PAIR);
    }).then(function (saved) {
      var nextSecret = '';
      if (!rotateAppKey) {
        nextSecret = saved && typeof saved === 'object' ? String(saved.appSecretHex || '') : '';
        if (!nextSecret) {
          nextSecret = state.nip46.appSecretHex || '';
        }
      }
      if (!nextSecret) {
        nextSecret = bytesToHex(window.NostrTools.generateSecretKey());
      }
      return idbSet(KEY_NIP46_PAIR, {
        version: 2,
        domain: currentHost(),
        appSecretHex: nextSecret,
        appPubkey: window.NostrTools.getPublicKey(hexToBytes(nextSecret)),
        pairSecret: randomHex(16),
        relays: NIP46_RELAYS.slice(),
        signerPubkey: '',
        accountPubkey: '',
        createdAt: nowEpoch()
      });
    }).then(function () {
      if (state.nip46.subscription && typeof state.nip46.subscription.close === 'function') {
        state.nip46.subscription.close();
      }
      state.nip46.subscription = null;
      if (state.nip46.pool && typeof state.nip46.pool.destroy === 'function') {
        state.nip46.pool.destroy();
      }
      state.nip46.pool = null;
      state.nip46.active = false;
      state.nip46.signerPubkey = '';
      state.nip46.accountPubkey = '';
      state.nip46.autoLoginInFlight = false;
      return initNip46Pairing();
    });
  }

  function rotateUnpairedNip46StateNow() {
    if (!hasNostrTools() || state.nip46.signerPubkey) {
      return false;
    }
    closeNip46Subscription();
    if (state.nip46.pool && typeof state.nip46.pool.destroy === 'function') {
      state.nip46.pool.destroy();
    }
    var appSecretHex = bytesToHex(window.NostrTools.generateSecretKey());
    state.nip46.active = true;
    state.nip46.appSecretHex = appSecretHex;
    state.nip46.appPubkey = window.NostrTools.getPublicKey(hexToBytes(appSecretHex));
    state.nip46.pairSecret = randomHex(16);
    state.nip46.relays = NIP46_RELAYS.slice();
    state.nip46.signerPubkey = '';
    state.nip46.accountPubkey = '';
    state.nip46.pool = new window.NostrTools.SimplePool();
    state.nip46.pending = {};
    state.nip46.pendingTimers = {};
    state.nip46.seenEvents = {};
    state.nip46.autoLoginInFlight = false;
    state.nip46.diagnostics = {
      eventsSeen: 0,
      decryptErrors: 0,
      ignoredSecrets: 0,
      lastEventPubkey: '',
      lastMessage: ''
    };
    ensureNip46Subscription(30, 'Waiting for signer');
    updateNip46PairingLink();
    saveNip46PairState().catch(function () {
      // The in-memory fresh link remains valid even if persistence is unavailable.
    });
    return true;
  }

  function refreshUnpairedNip46Link() {
    if (state.nip46.signerPubkey) {
      updateNip46PairingLink();
      return Promise.resolve();
    }
    setNip46Diagnostics('Making a fresh signer link.', 'info');
    return resetPhonePairingLink({ rotateAppKey: true });
  }

  function startDesktopSignerLogin(registerAttempt, usernameHint) {
    var asRegister = !!registerAttempt;
    if (!hasDesktopSigner()) {
      return Promise.reject(new Error('No browser signer detected. Use phone signer QR or signed challenge login.'));
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
    return waitForNostrTools(8500)
      .then(function () {
        showPanel(els.authPhonePanel, true);
        showPanel(els.authManualPanel, false);

        return initNip46Pairing()
          .then(function () {
            if (!state.nip46.signerPubkey) {
              throw new Error('Phone signer is not paired yet. Open the signer link or scan the QR first.');
            }
            return signInWithSigner(
              function (template) {
                return nip46SignEvent(template);
              },
              {
                getPubkeyFn: function () {
                  return getNip46AccountPubkey();
                },
                pubkeyHint: '',
                allowStoredPubkeyHint: false
              }
            );
          });
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

  function sharedSignerUnavailableMessage() {
    return 'No Nostr signer detected. Use a browser signer or pair a phone signer from Sign In.';
  }

  function resolveSharedNostrSigner(opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var silent = !!options.silent;

    if (typeof window.nostr !== 'undefined' && window.nostr && typeof window.nostr.signEvent === 'function') {
      var browserSigner = getBrowserSigner();
      return Promise.resolve({
        method: 'browser',
        signEvent: function (template) {
          return Promise.resolve(browserSigner.signEvent(template));
        },
        getPublicKey: function () {
          if (typeof browserSigner.getPublicKey === 'function') {
            return Promise.resolve(browserSigner.getPublicKey()).then(function (value) {
              return normalizePubkeyHex(value);
            });
          }
          return Promise.resolve(normalizePubkeyHex(localStorage.getItem('last_auth_pubkey') || ''));
        }
      });
    }

    if (!hasNostrTools()) {
      if (silent) {
        return Promise.resolve(null);
      }
      return Promise.reject(new Error(sharedSignerUnavailableMessage()));
    }

    return initNip46Pairing().catch(function (err) {
      if (silent) {
        return null;
      }
      throw err;
    }).then(function () {
      var pairedPubkey = normalizePubkeyHex(state.nip46.signerPubkey || '');
      if (!pairedPubkey) {
        if (silent) {
          return null;
        }
        throw new Error(sharedSignerUnavailableMessage());
      }
      return {
        method: 'nip46',
        signEvent: function (template) {
          return nip46SignEvent(template);
        },
        getPublicKey: function () {
          return getNip46AccountPubkey();
        }
      };
    });
  }

  function exposeSharedNostrSigner() {
    if (window.blogNostrSigner && window.blogNostrSigner.__wizardryShared === true) {
      return;
    }
    window.blogNostrSigner = {
      __wizardryShared: true,
      signEvent: function (template) {
        return resolveSharedNostrSigner().then(function (signer) {
          return signer.signEvent(template);
        });
      },
      getPublicKey: function () {
        return resolveSharedNostrSigner().then(function (signer) {
          return signer.getPublicKey();
        });
      },
      getStatus: function () {
        return resolveSharedNostrSigner({ silent: true }).then(function (signer) {
          if (!signer) {
            return { available: false, method: '', pubkey: '' };
          }
          if (signer.method === 'nip46') {
            return {
              available: true,
              method: 'nip46',
              pubkey: normalizePubkeyHex(state.nip46.accountPubkey || localStorage.getItem('last_auth_pubkey') || '')
            };
          }
          return Promise.resolve(signer.getPublicKey()).then(function (pubkey) {
            return {
              available: true,
              method: String(signer.method || ''),
              pubkey: normalizePubkeyHex(pubkey || '')
            };
          });
        });
      }
    };
  }

  exposeSharedNostrSigner();

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
      els.navOverflowPanel.classList.remove('is-viewport-positioned');
      els.navOverflowPanel.style.left = '';
      els.navOverflowPanel.style.top = '';
      els.navOverflowPanel.style.maxWidth = '';
    }
    if (els.navOverflowBtn) {
      els.navOverflowBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function clampNavOverflowPanelToViewport() {
    if (!els.navOverflowPanel || !els.navOverflowBtn) {
      return;
    }
    var gap = 8;
    var triggerRect = els.navOverflowBtn.getBoundingClientRect();
    var panelRect = els.navOverflowPanel.getBoundingClientRect();
    var viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    var panelWidth = Math.min(panelRect.width || 176, Math.max(160, viewportWidth - (gap * 2)));
    var left = triggerRect.left;
    var maxLeft = viewportWidth - panelWidth - gap;
    if (left > maxLeft) {
      left = maxLeft;
    }
    if (left < gap) {
      left = gap;
    }
    els.navOverflowPanel.classList.add('is-viewport-positioned');
    els.navOverflowPanel.style.maxWidth = String(panelWidth) + 'px';
    els.navOverflowPanel.style.left = String(Math.round(left)) + 'px';
    els.navOverflowPanel.style.top = String(Math.round(triggerRect.bottom + 6)) + 'px';
  }

  function openNavOverflowMenu() {
    if (!els.navOverflowPanel || !els.navOverflowBtn || !els.navOverflowMenu || els.navOverflowMenu.hidden) {
      return;
    }
    els.navOverflowPanel.hidden = false;
    clampNavOverflowPanelToViewport();
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
    var navRight = document.querySelector('.nav-right');
    if (!navCenter || !navRight || !els.navOverflowMenu || !els.navOverflowBtn || !els.navOverflowPanel) {
      return;
    }

    var links = Array.prototype.slice.call(navCenter.querySelectorAll('a[data-page]'));
    closeNavOverflowMenu();
    els.navOverflowPanel.innerHTML = '';
    if (links.length < 2) {
      links.forEach(function (link) {
        link.classList.remove('is-nav-overflow-hidden');
      });
      els.navOverflowMenu.hidden = true;
      setNavOverflowButtonCount(0);
      return;
    }

    function rectVisible(rect) {
      return !!rect && rect.width > 0 && rect.height > 0;
    }

    function rectsVerticallyOverlap(a, b) {
      return !!(a && b && a.bottom > b.top && b.bottom > a.top);
    }

    function rightmostVisibleLinkRect() {
      for (var idx = links.length - 1; idx >= 0; idx -= 1) {
        var link = links[idx];
        if (link.classList.contains('is-nav-overflow-hidden')) {
          continue;
        }
        var rect = link.getBoundingClientRect();
        if (rectVisible(rect)) {
          return rect;
        }
      }
      return null;
    }

    function navCollisionLeft() {
      var search = navRight.querySelector('.nav-search');
      var target = search && !search.hidden ? search : navRight;
      var rect = target.getBoundingClientRect();
      if (!rectVisible(rect)) {
        return null;
      }
      return rect.left;
    }

    function hasRightSideCollision() {
      var linkRect = rightmostVisibleLinkRect();
      var collisionLeft = navCollisionLeft();
      if (!linkRect || collisionLeft === null) {
        return false;
      }
      var centerRect = navCenter.getBoundingClientRect();
      var rightRect = navRight.getBoundingClientRect();
      if (!rectsVerticallyOverlap(centerRect, rightRect)) {
        return false;
      }
      var gutter = 8;
      return linkRect.right > (collisionLeft - gutter);
    }

    function hasNavPressure() {
      var widthPressure = navCenter.scrollWidth > (navCenter.clientWidth + 1);
      var overlapPressure = hasRightSideCollision();
      return widthPressure || overlapPressure;
    }

    var activeLink = links.find(function (link) { return link.classList.contains('active'); }) || null;
    var changed = false;

    if (hasNavPressure()) {
      var hideCandidate = null;
      for (var i = links.length - 1; i >= 0; i -= 1) {
        var visibleLink = links[i];
        if (visibleLink.classList.contains('is-nav-overflow-hidden')) {
          continue;
        }
        if (activeLink && visibleLink === activeLink) {
          continue;
        }
        hideCandidate = visibleLink;
        break;
      }
      if (!hideCandidate && activeLink && !activeLink.classList.contains('is-nav-overflow-hidden')) {
        hideCandidate = activeLink;
      }
      if (hideCandidate && !hideCandidate.classList.contains('is-nav-overflow-hidden')) {
        hideCandidate.classList.add('is-nav-overflow-hidden');
        changed = true;
      }
    } else {
      var hiddenInOrder = links.filter(function (link) {
        return link.classList.contains('is-nav-overflow-hidden');
      });
      if (hiddenInOrder.length) {
        var revealCandidate = hiddenInOrder[0];
        revealCandidate.classList.remove('is-nav-overflow-hidden');
        if (hasNavPressure()) {
          revealCandidate.classList.add('is-nav-overflow-hidden');
        } else {
          changed = true;
        }
      }
    }

    var hiddenLinks = links.filter(function (link) {
      return link.classList.contains('is-nav-overflow-hidden');
    });
    if (!hiddenLinks.length) {
      els.navOverflowMenu.hidden = true;
      setNavOverflowButtonCount(0);
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
    if (changed) {
      scheduleNavOverflowMenuSync();
    }
  }

  function placeNavOverflowMenuBeforeSearch() {
    if (!els.navOverflowMenu) {
      return;
    }
    var nav = document.querySelector('nav.site-nav');
    if (!nav) {
      return;
    }
    var navRight = nav.querySelector('.nav-right');
    if (!navRight) {
      if (nav.lastElementChild === els.navOverflowMenu) {
        return;
      }
      nav.appendChild(els.navOverflowMenu);
      return;
    }
    var search = navRight.querySelector('.nav-search');
    if (search && els.navOverflowMenu.parentNode === navRight && els.navOverflowMenu.nextElementSibling === search) {
      return;
    }
    if (!search && els.navOverflowMenu.parentNode === navRight) {
      return;
    }
    navRight.insertBefore(els.navOverflowMenu, search || navRight.firstElementChild);
  }

  function scheduleNavOverflowMenuSync() {
    if (state.navOverflowTimer) {
      window.clearTimeout(state.navOverflowTimer);
      state.navOverflowTimer = 0;
    }
    if (state.navOverflowRaf && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(state.navOverflowRaf);
      state.navOverflowRaf = 0;
    }
    state.navOverflowTimer = window.setTimeout(function () {
      state.navOverflowTimer = 0;
      if (typeof window.requestAnimationFrame === 'function') {
        state.navOverflowRaf = window.requestAnimationFrame(function () {
          state.navOverflowRaf = 0;
          syncNavOverflowMenuNow();
        });
        return;
      }
      syncNavOverflowMenuNow();
    }, 60);
  }

  function markHydrationNavReady() {
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markNavReady === 'function') {
      gate.markNavReady();
    }
  }

  function applyInitialHighlightInSyncWithContent() {
    highlightCurrentPage();
    markHydrationNavReady();
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

  function loadNavbarNostrPages(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var navCenter = document.querySelector('.nav-center');
    if (!navCenter) {
      return Promise.resolve();
    }

    var bootstrapPages = opts.useBootstrap === false ? null : readBootstrapNavbarPages();
    if (bootstrapPages) {
      try {
        localStorage.setItem('cached_navbar_pages_v1', JSON.stringify(bootstrapPages));
      } catch (_bootstrapCacheErr) {
        // Ignore storage failures.
      }
      renderNavbarNostrPages(bootstrapPages);
      if (!hasStoredSessionToken()) {
        warmNavbarNostrPagePrefetch();
      }
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
    loadNavbarNostrPages({ useBootstrap: false }).catch(function () {
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

    navLinks.forEach(function (link) {
      var href = link.getAttribute('href') || '';
      if (normalizeNavPath(href) === navTargetPath) {
        matches.push(link);
      }
    });

    if (navCenter) {
      var existingTemp = navCenter.querySelector('a[data-temp-nav-current="true"]');
      if (existingTemp) {
        existingTemp.parentNode.removeChild(existingTemp);
      }
      navLinks = document.querySelectorAll('.nav-center a[data-page]');
    }

    var selectedMatch = matches.length ? matches[0] : null;
    navLinks.forEach(function (link) {
      var active = link === selectedMatch;
      link.classList.toggle('active', active);
      link.classList.remove('allow-active-click');
      if (active) {
        link.setAttribute('aria-current', 'page');
        link.setAttribute('aria-disabled', 'true');
        link.setAttribute('tabindex', '-1');
      } else {
        link.removeAttribute('aria-current');
        link.removeAttribute('aria-disabled');
        link.removeAttribute('tabindex');
      }
    });

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

  function updateThemeStylesheet(theme) {
    var nextTheme = normalizeThemeName(theme);
    var href = '/static/themes/' + encodeURIComponent(nextTheme) + '.css?v=20260523-contact-nav2';
    var themeLink = document.getElementById('theme-stylesheet');
    if (isThemeHrefAlreadyActive(themeLink, href)) {
      return Promise.resolve();
    }
    pulseThemeSwitchVisualState();
    return swapThemeStylesheet(href);
  }

  function loadTheme() {
    var bootstrapConfig = readBootstrapConfig();
    if (bootstrapConfig) {
      applySiteConfig(bootstrapConfig);
      return updateThemeStylesheet(state.currentTheme)
        .then(function () {
          updateThemeSelect();
        })
        .catch(function () {
          updateThemeSelect();
        });
    }

    return fetch('/cgi/blog-get-config', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        applySiteConfig(data);
        if (data && data.theme) {
          return updateThemeStylesheet(state.currentTheme);
        }
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
      state.currentTheme = normalizeThemeName(nextTheme);
      cacheTheme(state.currentTheme);
      updateThemeStylesheet(state.currentTheme);
      saveTheme(state.currentTheme);
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
        startPrimaryLogin().catch(function (err) {
          showNavToast(err.message || 'Nostr signer login failed.', 'info', 4200);
          showAuthModal(preferredUnsignedLoginTab());
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
        showAuthModal('register');
      });
    }

    if (els.authModal) {
      els.authModal.addEventListener('click', function (event) {
        if (event.target && event.target.hasAttribute('data-close-auth-modal')) {
          hideAuthModal();
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
      if (event.key === 'Escape' && els.loginMenu && !els.loginMenu.hidden) {
        closeLoginMenu();
      }
      if (event.key === 'Escape' && els.menuPanel && !els.menuPanel.hidden) {
        closeUserMenu();
      }
      if (event.key === 'Escape' && els.navOverflowPanel && !els.navOverflowPanel.hidden) {
        closeNavOverflowMenu();
      }
    });

    if (els.authRegisterBtn) {
      els.authRegisterBtn.addEventListener('click', function () {
        startDesktopSignerLogin(true, '').catch(function (err) {
          setAuthMessage(err.message || 'Nostr signer login failed.', 'error');
        });
      });
    }

    if (els.authModal) {
      els.authModal.addEventListener('click', function (event) {
        var trigger = event.target && event.target.closest ? event.target.closest('[data-auth-route]') : null;
        if (!trigger || !els.authModal.contains(trigger)) {
          return;
        }
        event.preventDefault();
        setActiveAuthTab(trigger.getAttribute('data-auth-route'), trigger.getAttribute('data-auth-flavor'));
      });
    }

    function copyNip46Uri() {
      return initNip46Pairing().then(function () {
        return refreshUnpairedNip46Link();
      }).then(function () {
        var uri = currentNip46Uri();
        if (!uri) {
          throw new Error('Nostr Connect link is not ready yet.');
        }
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          return navigator.clipboard.writeText(uri);
        }
        throw new Error('Clipboard access is unavailable. Select and copy the link text below.');
      }).then(function () {
        setAuthMessage('Nostr Connect link copied.', 'ok');
      }).catch(function (err) {
        setAuthMessage(err.message || 'Could not copy Nostr Connect link.', 'error');
      });
    }

    if (els.authNip46UriCopy) {
      els.authNip46UriCopy.addEventListener('click', copyNip46Uri);
    }

    if (els.authNip46Open) {
      els.authNip46Open.addEventListener('click', function (event) {
        event.preventDefault();
        if (!state.nip46.signerPubkey && !hasNostrTools()) {
          setAuthMessage('Phone signer setup is still loading. Tap Connect Nostr again in a moment.', 'warn');
          initNip46Pairing().catch(function (err) {
            setAuthMessage(err.message || 'Could not prepare a fresh Nostr Connect link.', 'error');
          });
          return;
        }
        rotateUnpairedNip46StateNow();
        var uri = String(els.authNip46Open.getAttribute('data-nip46-uri') || els.authNip46Open.getAttribute('href') || '');
        if (uri.indexOf('nostrconnect://') !== 0) {
          uri = currentNip46Uri();
        }
        openNativeDeepLink(uri, 'Nostr Connect link is not ready yet. The QR setup is still loading.');
      });
    }

    if (els.authNip46Reset) {
      els.authNip46Reset.addEventListener('click', function () {
        setAuthMessage('Making a fresh phone signer link...', 'warn');
        resetPhonePairingLink().then(function () {
          updatePhoneContinueState();
          setAuthMessage('Fresh phone signer link is ready. Open the app link or scan the QR.', 'ok');
        }).catch(function (err) {
          setAuthMessage(err.message || 'Could not make a fresh phone signer link.', 'error');
        });
      });
    }

    if (els.authPhoneBtn) {
      els.authPhoneBtn.addEventListener('click', function () {
        continuePhoneSignerLogin(false);
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

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        refreshPhoneSignerListenerAfterReturn('visibility');
      }
    });

    window.addEventListener('focus', function () {
      refreshPhoneSignerListenerAfterReturn('focus');
    });
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
    placeNavOverflowMenuBeforeSearch();

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
    if (document.fonts && typeof document.fonts.ready === 'object' && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(function () {
        scheduleNavOverflowMenuSync();
      }).catch(function () {
        // Ignore font readiness errors.
      });
    }
    bindThemeSelect();
    bindUiEvents();
    bindNavbarNostrPagePrefetch();
    scheduleNavOverflowMenuSync();
    setTimeout(scheduleNavOverflowMenuSync, 180);
    window.blogAuth = window.blogAuth || {};
    window.blogAuth.openLoginModal = showAuthModal;
    window.blogAuth.startLogin = function () {
      return startPrimaryLogin().catch(function (err) {
        showNavToast(err && err.message ? err.message : 'Nostr signer login failed.', 'info', 4200);
        showAuthModal(preferredUnsignedLoginTab());
        throw err;
      });
    };
    window.blogAuth.showToast = showNavToast;
    flushRememberedNavToast();
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
