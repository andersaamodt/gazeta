(function () {
  'use strict';

  var root = document.getElementById('list-page-root') || document.getElementById('icon-gallery-root');
  if (!root) {
    return;
  }
  root.classList.add('is-loading');

  function removeLegacyTitleBlock() {
    var prev = root.previousElementSibling;
    if (!prev || prev.tagName !== 'HEADER') {
      return;
    }
    if (!prev.querySelector || !prev.querySelector('.title')) {
      return;
    }
    if (prev.parentNode) {
      prev.parentNode.removeChild(prev);
    }
  }

  removeLegacyTitleBlock();

  var querySlug = '';
  try {
    var params = new URLSearchParams(window.location.search);
    querySlug = String(params.get('page_slug') || params.get('list_slug') || '').trim();
  } catch (_err) {
    querySlug = '';
  }

  var slug = String(root.getAttribute('data-list-slug') || querySlug || 'list').trim() || 'list';
  var els = {
    title: document.getElementById('list-page-title'),
    description: document.getElementById('list-page-description'),
    admin: document.getElementById('list-page-admin'),
    validation: document.getElementById('list-page-validation'),
    content: document.getElementById('list-page-content')
  };

  var state = {
    payload: null,
    draft: null,
    navTitle: '',
    navTitleEditing: false,
    navTitleInput: '',
    navTitleBusy: false,
    busy: false,
    authSignature: '',
    saveTimer: null,
    saveStatus: 'saved',
    saveError: '',
    autosaveQueued: false,
    pendingToggleEditOff: false,
    saveIndicatorVisible: false,
    editMode: false,
    rowMenuOpenUid: '',
    activeEntryUid: '',
    activeCellField: '',
    readInlineEditUid: '',
    readInlineEditField: '',
    activeHeadField: '',
    dragUid: '',
    dragMoved: false,
    dragDropped: false,
    dragLastTargetKey: '',
    dragStartElements: null,
    pointerDownEntryUid: '',
    pointerDownAt: 0,
    pendingNewEntry: null,
    markerFilterInclude: [],
    markerFilterExclude: [],
    markerFilterInitialized: false,
    markerColorByToken: {},
    readRowMenuOpenUid: '',
    viewModeOverride: '',
    createProductBusyUid: '',
    tabNavigationUntil: 0,
    undoStack: [],
    redoStack: [],
    historyCellEditKey: '',
    settingsPanelReveal: false,
    productPriceBySlug: {},
    productPriceBatchPending: {},
    uidCounter: 1,
    initialContentPainted: false,
    renderSignature: ''
  };
  var PAGE_BOOTSTRAP_CACHE_PREFIX = 'nostr_page_bootstrap_v1:';
  var BOOTSTRAP_CACHE_MAX_AGE_MS = 15000;
  var markedUpgradeTimer = 0;
  var markedUpgradeAttempts = 0;

  function isAdmin() {
    return !!(state.payload && state.payload.is_admin && state.draft);
  }

  function markHydrationPageReady() {
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markPageReady === 'function') {
      gate.markPageReady();
    }
  }

  function authSignature() {
    var auth = getAuthPayload();
    return String(auth.session_token || '') + '|' + String(auth.csrf_token || '');
  }

  function compact(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeMarkerListText(text) {
    var raw = String(text || '');
    if (!raw.trim()) {
      return '';
    }
    var seen = {};
    var markers = [];
    raw.split(',').forEach(function (part) {
      var token = compact(part);
      if (!token || seen[token]) {
        return;
      }
      seen[token] = true;
      markers.push(token);
    });
    return markers.join(', ');
  }

  function markerTokensFromText(text) {
    var normalized = normalizeMarkerListText(text);
    if (!normalized) {
      return [];
    }
    return normalized.split(',').map(function (part) {
      return compact(part);
    }).filter(function (token) {
      return !!token;
    });
  }

  function normalizeMarkerListForDisplay(text, shouldAlphabetize) {
    var tokens = markerTokensFromText(text);
    if (!tokens.length) {
      return '';
    }
    if (shouldAlphabetize && tokens.length > 1) {
      tokens = tokens.slice().sort(function (a, b) {
        return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
      });
    }
    return tokens.join(', ');
  }

  function alphabetizeAllEntryMarkersInDraft() {
    if (!state.draft || !Array.isArray(state.draft.elements)) {
      return false;
    }
    var changed = false;
    state.draft.elements.forEach(function (el) {
      if (!isEntryType(String(el && el.type || 'entry'))) {
        return;
      }
      var current = String(el && el.marker || '');
      var next = normalizeMarkerListForDisplay(current, true);
      if (next !== current) {
        el.marker = next;
        changed = true;
      }
    });
    return changed;
  }

  function markInitialContentPainted() {
    if (state.initialContentPainted) {
      return;
    }
    state.initialContentPainted = true;
    if (root && root.classList) {
      root.classList.remove('is-loading');
    }
    try {
      window.__wizardryPageInitialContentReady = true;
      window.dispatchEvent(new CustomEvent('blog-page-initial-content-ready', {
        detail: { slug: slug }
      }));
    } catch (_err) {
      // Ignore event dispatch issues.
    }
  }

  function renderLoadFallback(err, fallbackText) {
    if (err && window.console && typeof window.console.warn === 'function') {
      window.console.warn('List page refresh failed:', err);
    }
    if (state.initialContentPainted || !els.content) {
      return;
    }
    els.content.innerHTML = '<p class="placeholder">' + escapeHtml(fallbackText || 'Page content is still loading.') + '</p>';
    markInitialContentPainted();
  }

  function bootstrapCacheKey() {
    return PAGE_BOOTSTRAP_CACHE_PREFIX + slug;
  }

  function isExpectedPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    var payloadSlug = String(payload.slug || '').trim();
    var payloadType = String(payload.page_type || '').trim().toLowerCase();
    return payloadSlug === slug && (payloadType === 'list' || payloadType === 'icon-gallery');
  }

  function readBootstrapCache() {
    try {
      var raw = localStorage.getItem(bootstrapCacheKey());
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      var savedAt = Number(parsed.saved_at || 0);
      if (!isFinite(savedAt) || savedAt <= 0 || (Date.now() - savedAt) > BOOTSTRAP_CACHE_MAX_AGE_MS) {
        localStorage.removeItem(bootstrapCacheKey());
        return null;
      }
      if (String(parsed.auth_signature || '') !== authSignature()) {
        return null;
      }
      if (!parsed.payload || typeof parsed.payload !== 'object') {
        return null;
      }
      if (!isExpectedPayload(parsed.payload)) {
        localStorage.removeItem(bootstrapCacheKey());
        return null;
      }
      return parsed.payload;
    } catch (_err) {
      return null;
    }
  }

  function writeBootstrapCache(payload) {
    try {
      if (!payload || typeof payload !== 'object') {
        return;
      }
      localStorage.setItem(bootstrapCacheKey(), JSON.stringify({
        auth_signature: authSignature(),
        payload: payload,
        saved_at: Date.now()
      }));
    } catch (_err) {
      // Ignore cache write errors.
    }
  }

  function readPrerenderBootstrap() {
    try {
      var allPayloads = window.__wizardryNostrPageBootstrap;
      if (!allPayloads || typeof allPayloads !== 'object') {
        return null;
      }
      var payload = allPayloads[slug];
      if (!isExpectedPayload(payload)) {
        return null;
      }
      return payload;
    } catch (_err) {
      return null;
    }
  }

  function renderFromBootstrapPayload(payload) {
    if (!payload || typeof payload !== 'object' || !isExpectedPayload(payload)) {
      return false;
    }
    var cachedPayload = payload;
    try {
      cachedPayload = JSON.parse(JSON.stringify(payload));
    } catch (_cloneErr) {
      cachedPayload = payload;
    }
    // Bootstrap cache is an optimistic first-paint path; avoid showing stale
    // validation alarms from previous runs before fresh server validation lands.
    if (!cachedPayload.validation || typeof cachedPayload.validation !== 'object') {
      cachedPayload.validation = {};
    }
    cachedPayload.validation.errors = [];
    cachedPayload.validation.warnings = [];
    cachedPayload.validation.can_publish = true;
    if (!cachedPayload.is_admin && hasLikelyAuthenticatedSession()) {
      cachedPayload.is_admin = true;
    }
    state.payload = cachedPayload;
    state.draft = readEditableStateFromPayload();
    state.navTitle = String((cachedPayload && cachedPayload.nav_title) || '').trim();
    state.navTitleEditing = false;
    state.navTitleInput = '';
    state.navTitleBusy = false;
    state.pendingNewEntry = null;
    state.markerFilterInclude = [];
    state.markerFilterExclude = [];
    state.markerFilterInitialized = false;
    state.markerColorByToken = {};
    state.readRowMenuOpenUid = '';
    state.createProductBusyUid = '';
    state.viewModeOverride = '';
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
    state.renderSignature = JSON.stringify({
      slug: String(cachedPayload && cachedPayload.slug || ''),
      page_type: String(cachedPayload && cachedPayload.page_type || ''),
      nav_title: String(cachedPayload && cachedPayload.nav_title || ''),
      is_admin: !!(cachedPayload && cachedPayload.is_admin),
      canonical_exists: !!(cachedPayload && cachedPayload.canonical_exists),
      draft_differs: !!(cachedPayload && cachedPayload.draft_differs),
      state: (cachedPayload && cachedPayload.state) ? cachedPayload.state : null
    });
    renderList();
    renderAdmin();
    renderValidation();
    markInitialContentPainted();
    markHydrationPageReady();
    return true;
  }

  function renderFromBootstrapCache() {
    return renderFromBootstrapPayload(readBootstrapCache());
  }

  function renderFromPrerenderBootstrap() {
    var prerenderedPayload = readPrerenderBootstrap();
    if (!prerenderedPayload) {
      return false;
    }
    if (!renderFromBootstrapPayload(prerenderedPayload)) {
      return false;
    }
    writeBootstrapCache(prerenderedPayload);
    return true;
  }

  function maybeReloadForAuthChange() {
    var nextSig = authSignature();
    if (nextSig === state.authSignature) {
      return;
    }
    state.authSignature = nextSig;
    load();
  }

  function getAuthPayload() {
    try {
      return {
        session_token: localStorage.getItem('session_token') || '',
        csrf_token: localStorage.getItem('csrf_token') || ''
      };
    } catch (_err) {
      return { session_token: '', csrf_token: '' };
    }
  }

  function hasLikelyAuthenticatedSession() {
    var auth = getAuthPayload();
    return !!(auth && auth.session_token && auth.csrf_token);
  }

  function ensureNostrPublishDialog() {
    if (window.blogNostrPublishDialog && typeof window.blogNostrPublishDialog.open === 'function') {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = '/static/nostr-publish-dialog.js';
      script.async = true;
      script.onload = function () {
        resolve(!!(window.blogNostrPublishDialog && typeof window.blogNostrPublishDialog.open === 'function'));
      };
      script.onerror = function () {
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function markdownInline(md) {
    var value = String(md || '');
    if (!value) {
      return '';
    }
    if (window.marked && typeof window.marked.parseInline === 'function') {
      return window.marked.parseInline(value);
    }
    scheduleMarkedUpgrade();
    return escapeHtml(value);
  }

  function markdownInlineLinkLabel(md) {
    var value = String(md || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    return markdownInline(value);
  }

  function renderLinkedInlineText(md, postUrl, className, title) {
    var url = String(postUrl || '').trim();
    var text = String(md || '').trim();
    var label = url ? (markdownInlineLinkLabel(text) || escapeHtml(url)) : markdownInline(text);
    var cssClass = String(className || '').trim();
    if (!url) {
      return '<span class="' + escapeHtml(cssClass) + '">' + label + '</span>';
    }
    return '<a class="' + escapeHtml(cssClass + ' is-post-url-linked') + '" href="' + escapeHtml(url) + '" title="' + escapeHtml(title || 'Open linked post') + '">' + label + '</a>';
  }

  function markdownBlock(md) {
    var value = String(md || '');
    if (!value) {
      return '';
    }
    if (window.marked && typeof window.marked.parse === 'function') {
      return window.marked.parse(value);
    }
    scheduleMarkedUpgrade();
    return '<p>' + escapeHtml(value).replace(/\n/g, '<br>') + '</p>';
  }

  function scheduleMarkedUpgrade() {
    if (window.marked && typeof window.marked.parse === 'function' && typeof window.marked.parseInline === 'function') {
      return;
    }
    if (markedUpgradeTimer) {
      return;
    }
    markedUpgradeAttempts = 0;
    function pollForMarked() {
      if (window.marked && typeof window.marked.parse === 'function' && typeof window.marked.parseInline === 'function') {
        markedUpgradeTimer = 0;
        renderList();
        renderAdmin();
        renderValidation();
        return;
      }
      markedUpgradeAttempts += 1;
      if (markedUpgradeAttempts >= 50) {
        markedUpgradeTimer = 0;
        return;
      }
      markedUpgradeTimer = window.setTimeout(pollForMarked, 100);
    }
    markedUpgradeTimer = window.setTimeout(pollForMarked, 100);
  }

  function normalizeExtraFormat(value) {
    var next = String(value || '').trim().toLowerCase();
    return next === 'html' ? 'html' : 'markdown';
  }

  function normalizeViewMode(value) {
    var next = String(value || '').trim().toLowerCase();
    return next === 'tile' ? 'tile' : 'list';
  }

  function isProductGalleryPage() {
    if (root && root.id === 'icon-gallery-root') {
      return true;
    }
    var rootType = String(root.getAttribute('data-page-type') || '').trim().toLowerCase();
    return rootType === 'icon-gallery';
  }

  function normalizeViewModeForPage(value) {
    var normalized = normalizeViewMode(value);
    if (isProductGalleryPage() && !String(value || '').trim()) {
      return 'tile';
    }
    return normalized;
  }

  function galleryImageAttrs() {
    if (isProductGalleryPage()) {
      return ' loading="eager" decoding="async" fetchpriority="high"';
    }
    return ' loading="lazy" decoding="async"';
  }

  function productGalleryViewStorageKey() {
    return 'nostr_product_gallery_view_v1:' + slug;
  }

  function loadProductGalleryViewOverride(fallbackMode) {
    if (!isProductGalleryPage()) {
      return '';
    }
    try {
      var saved = String(localStorage.getItem(productGalleryViewStorageKey()) || '').trim().toLowerCase();
      if (saved === 'tile' || saved === 'list') {
        return saved;
      }
    } catch (_err) {
      // Ignore localStorage read failures.
    }
    return normalizeViewMode(String(fallbackMode || 'tile'));
  }

  function saveProductGalleryViewOverride(mode) {
    if (!isProductGalleryPage()) {
      return;
    }
    try {
      localStorage.setItem(productGalleryViewStorageKey(), normalizeViewMode(mode));
    } catch (_err) {
      // Ignore localStorage write failures.
    }
  }

  function currentReadViewMode(renderState) {
    var fallback = normalizeViewModeForPage(renderState && renderState.view_mode || '');
    if (!isProductGalleryPage()) {
      return fallback;
    }
    if (!state.viewModeOverride) {
      state.viewModeOverride = loadProductGalleryViewOverride(fallback);
    }
    return normalizeViewMode(state.viewModeOverride || fallback);
  }

  function slugFromUrlPath(raw) {
    var text = String(raw || '').trim();
    if (!text) {
      return '';
    }
    if (/^https?:\/\//i.test(text)) {
      try {
        text = new URL(text).pathname || '';
      } catch (_err) {
        text = '';
      }
    }
    text = text.split('?')[0].split('#')[0];
    text = text.replace(/^\/+/, '');
    if (text.indexOf('pages/') === 0) {
      text = text.slice('pages/'.length);
    }
    text = text.replace(/\.html?$/i, '');
    text = text.split('/')[0];
    text = String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
    return text;
  }

  function entryProductSlug(entry) {
    var postUrl = String(entry && entry.post_url || '').trim();
    var fromUrl = slugFromUrlPath(postUrl);
    if (fromUrl) {
      return fromUrl;
    }
    var text = String(entry && entry.markdown || '');
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function parsePositivePrice(raw) {
    var amount = Number(raw);
    if (!isFinite(amount) || amount <= 0) {
      return 0;
    }
    return amount;
  }

  function formatUsdPrice(amount) {
    return parsePositivePrice(amount).toFixed(2);
  }

  function normalizeProductPriceInfo(raw) {
    var product = raw && raw.product ? raw.product : raw;
    var amount = parsePositivePrice(product && product.price);
    return {
      loaded: true,
      hasPrice: amount > 0,
      amount: amount,
      label: amount > 0 ? ('$' + formatUsdPrice(amount)) : ''
    };
  }

  function emptyProductPriceInfo() {
    return {
      loaded: true,
      hasPrice: false,
      amount: 0,
      label: ''
    };
  }

  function fetchProductPriceInfoBatch(slugValues, options) {
    var opts = options || {};
    var slugMap = {};
    var slugs = [];
    (Array.isArray(slugValues) ? slugValues : []).forEach(function (rawSlug) {
      var slugText = String(rawSlug || '').trim();
      if (!slugText || slugMap[slugText]) {
        return;
      }
      slugMap[slugText] = true;
      slugs.push(slugText);
    });
    if (!slugs.length) {
      return Promise.resolve({});
    }

    var batchKey = slugs.slice().sort().join(',');
    if (!opts.forceRefresh && state.productPriceBatchPending[batchKey]) {
      return state.productPriceBatchPending[batchKey];
    }

    var request = new URLSearchParams();
    request.set('slugs_json', JSON.stringify(slugs));
    state.productPriceBatchPending[batchKey] = fetch('/cgi/blog-get-product', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: request.toString()
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try {
          data = JSON.parse(text);
        } catch (_err) {
          throw new Error('Invalid product payload');
        }
        if (!res.ok || !data || data.success === false) {
          throw new Error((data && data.error) ? data.error : ('Request failed (' + res.status + ')'));
        }
        return data;
      });
    }).then(function (data) {
      var infoBySlug = {};
      slugs.forEach(function (slugText) {
        infoBySlug[slugText] = emptyProductPriceInfo();
      });
      var products = Array.isArray(data && data.products) ? data.products : [];
      products.forEach(function (product) {
        var productSlug = String(product && product.slug || '').trim();
        if (!productSlug || !Object.prototype.hasOwnProperty.call(infoBySlug, productSlug)) {
          return;
        }
        infoBySlug[productSlug] = normalizeProductPriceInfo({ product: product });
      });
      slugs.forEach(function (slugText) {
        state.productPriceBySlug[slugText] = infoBySlug[slugText];
      });
      return infoBySlug;
    }).catch(function () {
      var infoBySlug = {};
      slugs.forEach(function (slugText) {
        var info = emptyProductPriceInfo();
        state.productPriceBySlug[slugText] = info;
        infoBySlug[slugText] = info;
      });
      return infoBySlug;
    }).finally(function () {
      delete state.productPriceBatchPending[batchKey];
    });
    return state.productPriceBatchPending[batchKey];
  }

  function renderProductCartButton(productSlug, extraClass) {
    var slugText = String(productSlug || '').trim();
    if (!isProductGalleryPage() || !slugText) {
      return '';
    }
    var cls = 'list-entry-cart-btn';
    if (extraClass) {
      cls += ' ' + String(extraClass || '').trim();
    }
    cls += ' is-price-pending';
    return '<button type="button" class="' + escapeHtml(cls) + '" data-add-product-slug="' + escapeHtml(slugText) + '"' +
      ' title="Add to cart" hidden>+ Cart</button>';
  }

  function applyProductCartButtonState(button, info) {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    if (info && info.hasPrice) {
      button.hidden = false;
      button.style.display = 'inline-flex';
      button.textContent = '+ Cart ' + info.label;
      button.title = 'Add to cart (' + info.label + ')';
      button.classList.add('is-price-active');
      button.classList.remove('is-price-pending');
      return;
    }
    button.hidden = true;
    button.style.display = 'none';
    button.textContent = '+ Cart';
    button.title = 'Add to cart';
    button.classList.remove('is-price-active');
    button.classList.add('is-price-pending');
  }

  function refreshProductCartButtons() {
    if (!isProductGalleryPage() || !els.content) {
      return;
    }
    var buttons = Array.from(els.content.querySelectorAll('button[data-add-product-slug]'));
    if (!buttons.length) {
      return;
    }
    var slugMap = {};
    buttons.forEach(function (button) {
      var slugText = String(button.getAttribute('data-add-product-slug') || '').trim();
      if (!slugText) {
        return;
      }
      slugMap[slugText] = true;
      var cachedInfo = state.productPriceBySlug[slugText];
      if (cachedInfo && cachedInfo.loaded) {
        applyProductCartButtonState(button, cachedInfo);
      } else {
        applyProductCartButtonState(button, null);
      }
    });

    var missingSlugs = [];
    Object.keys(slugMap).forEach(function (slugText) {
      if (!state.productPriceBySlug[slugText] || !state.productPriceBySlug[slugText].loaded) {
        missingSlugs.push(slugText);
      }
    });
    if (!missingSlugs.length) {
      return;
    }

    fetchProductPriceInfoBatch(missingSlugs).then(function (infoBySlug) {
      if (!els.content) {
        return;
      }
      missingSlugs.forEach(function (slugText) {
        var info = infoBySlug[slugText] || emptyProductPriceInfo();
        Array.from(els.content.querySelectorAll('button[data-add-product-slug="' + slugText.replace(/"/g, '\\"') + '"]'))
          .forEach(function (button) {
            applyProductCartButtonState(button, info);
          });
      });
    });
  }

  function entryHasProductBasics(entry) {
    return String(entry && entry.markdown || '').trim().length > 0;
  }

  async function apiPost(path, payload) {
    var params = new URLSearchParams();
    Object.keys(payload || {}).forEach(function (key) {
      var val = payload[key];
      if (val === undefined || val === null) {
        return;
      }
      params.set(key, String(val));
    });
    var response = await fetch(path, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: params.toString()
    });
    var data = {};
    try {
      data = await response.json();
    } catch (_err) {
      throw new Error('Invalid server response');
    }
    if (!response.ok || !data || data.success === false) {
      var err = new Error((data && data.error) ? data.error : ('Request failed (' + response.status + ')'));
      err.code = (data && data.code) ? String(data.code) : '';
      err.httpStatus = response.status;
      throw err;
    }
    return data;
  }

  async function apiPostJson(path, payload) {
    var response = await fetch(path, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: JSON.stringify(payload || {})
    });
    var data = {};
    try {
      data = await response.json();
    } catch (_err) {
      throw new Error('Invalid server response');
    }
    if (!response.ok || !data || data.success === false) {
      var err = new Error((data && data.error) ? data.error : ('Request failed (' + response.status + ')'));
      err.code = (data && data.code) ? String(data.code) : '';
      err.httpStatus = response.status;
      throw err;
    }
    return data;
  }

  function nextUid() {
    return 'el-' + String(state.uidCounter++);
  }

  function isEntryType(type) {
    return type === 'entry';
  }

  function normalizeElement(raw) {
    var type = 'entry';
    var depth = Number(raw && raw.depth);
    if (!Number.isFinite(depth) || depth < 0) {
      depth = 0;
    }
    if (String(raw && raw.type || '') === 'subentry' || String(raw && raw.type || '') === 'sub') {
      depth = 1;
    }
    return {
      _uid: String(raw && raw._uid || nextUid()),
      type: type,
      event_id: String(raw && raw.event_id || ''),
      relay_hint: String(raw && raw.relay_hint || ''),
      marker: normalizeMarkerListText(raw && raw.marker || ''),
      date: String(raw && raw.date || ''),
      depth: depth,
      markdown: String(raw && raw.markdown || ''),
      image_url: String(raw && raw.image_url || ''),
      description: String(raw && raw.description || ''),
      year: String(raw && raw.year || ''),
      post_url: String(raw && raw.post_url || '')
    };
  }

  function cloneEditableElements(elements) {
    return (Array.isArray(elements) ? elements : []).map(normalizeElement);
  }

  function elementsFromLegacyEntries(entries) {
    return (Array.isArray(entries) ? entries : []).map(function (entry) {
      return normalizeElement({
        type: 'entry',
        event_id: entry && entry.event_id,
        relay_hint: entry && entry.relay_hint,
        marker: entry && entry.marker,
        date: entry && entry.date,
        markdown: entry && entry.markdown,
        image_url: entry && entry.image_url,
        description: entry && entry.description,
        year: entry && entry.year,
        post_url: entry && entry.post_url
      });
    });
  }

  function toEntries(elements) {
    return (Array.isArray(elements) ? elements : []).filter(function (el) {
      return isEntryType(String(el && el.type || 'entry'));
    }).map(function (el) {
      return {
        event_id: String(el && el.event_id || ''),
        relay_hint: String(el && el.relay_hint || ''),
        marker: normalizeMarkerListText(el && el.marker || ''),
        date: String(el && el.date || ''),
        depth: Math.max(0, Number(el && el.depth || 0) || 0),
        markdown: String(el && el.markdown || ''),
        image_url: String(el && el.image_url || ''),
        description: String(el && el.description || ''),
        post_url: String(el && el.post_url || '')
      };
    });
  }

  function readEditableStateFromPayload() {
    var s = (state.payload && state.payload.state) ? state.payload.state : {};
    var elements = Array.isArray(s.elements) ? cloneEditableElements(s.elements) : elementsFromLegacyEntries(s.entries);
    return {
      title: String(s.title || root.getAttribute('data-list-title') || 'List'),
      description: String(s.description || ''),
      publish_intro_to_nostr: !!s.publish_intro_to_nostr,
      show_marker_filters: !!s.show_marker_filters,
      show_markers: !!s.show_markers,
      alphabetize_markers: !!s.alphabetize_markers,
      default_markers: normalizeMarkerListText(s.default_markers || ''),
      group_by: String(s.group_by || ''),
      view_mode: normalizeViewModeForPage(s.view_mode || ''),
      content: String(s.content || ''),
      extras_after: String(s.extras_after || ''),
      extras_after_format: normalizeExtraFormat(s.extras_after_format || 'markdown'),
      elements: elements
    };
  }

  function hasStructuralElements(elements) {
    return (Array.isArray(elements) ? elements : []).some(function (el) {
      return (Number(el && el.depth || 0) || 0) > 0;
    });
  }

  function yearFromDate(raw) {
    var text = String(raw || '');
    return text.length >= 4 ? text.slice(0, 4) : '';
  }

  function monthFromDate(raw) {
    var text = String(raw || '');
    return text.length >= 7 ? text.slice(0, 7) : 'Unknown';
  }

  function firstLetter(text) {
    var src = String(text || '').trim();
    if (!src) {
      return '#';
    }
    var match = src.match(/[A-Za-z0-9]/);
    if (!match) {
      return '#';
    }
    var ch = String(match[0] || '').toUpperCase();
    return ch;
  }

  function groupLabelForEntry(entry, groupBy) {
    var mode = String(groupBy || '');
    if (mode === 'year') {
      return yearFromDate(entry && entry.date || entry && entry.year || '') || 'Unknown';
    }
    if (mode === 'month') {
      return monthFromDate(entry && entry.date || '');
    }
    if (mode === 'first_letter') {
      return firstLetter(entry && entry.markdown || '');
    }
    if (mode === 'marker') {
      var marker = String(entry && entry.marker || '').trim();
      return marker || 'Unmarked';
    }
    return '';
  }

  function markerTokensFromEntry(entry) {
    var raw = String(entry && entry.marker || '');
    if (!raw.trim()) {
      return [];
    }
    var seen = {};
    var tokens = [];
    raw.split(',').forEach(function (part) {
      var token = compact(part);
      if (!token || seen[token]) {
        return;
      }
      seen[token] = true;
      tokens.push(token);
    });
    return tokens;
  }

  function markerTokensForDisplay(entry, shouldAlphabetize) {
    var tokens = markerTokensFromEntry(entry);
    if (!shouldAlphabetize || tokens.length < 2) {
      return tokens;
    }
    return tokens.slice().sort(function (a, b) {
      return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    });
  }

  function selectedDefaultMarkerSet() {
    var include = Array.isArray(state.markerFilterInclude) ? state.markerFilterInclude : [];
    if (!include.length) {
      return null;
    }
    var defaultMarkersRaw = '';
    if (state.draft && typeof state.draft === 'object') {
      defaultMarkersRaw = String(state.draft.default_markers || '');
    } else if (state.payload && state.payload.state && typeof state.payload.state === 'object') {
      defaultMarkersRaw = String(state.payload.state.default_markers || '');
    }
    var defaults = markerTokensFromText(defaultMarkersRaw);
    if (!defaults.length) {
      return null;
    }
    var defaultsSet = {};
    defaults.forEach(function (marker) {
      defaultsSet[String(marker)] = true;
    });
    var selectedDefaults = {};
    include.forEach(function (marker) {
      var token = compact(marker);
      if (token && defaultsSet[token]) {
        selectedDefaults[token] = true;
      }
    });
    return Object.keys(selectedDefaults).length ? selectedDefaults : null;
  }

  function markerHash32(text) {
    var src = String(text || '');
    var hash = 2166136261;
    for (var i = 0; i < src.length; i += 1) {
      hash ^= src.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    var normalized = (hash >>> 0);
    normalized ^= (normalized >>> 16);
    normalized = Math.imul(normalized, 2246822507);
    normalized ^= (normalized >>> 13);
    normalized = Math.imul(normalized, 3266489909);
    normalized ^= (normalized >>> 16);
    return (normalized >>> 0);
  }

  function markerPaletteSwatches() {
    return [
      { hue: 8, saturation: 56, lightness: 88 },
      { hue: 28, saturation: 58, lightness: 87 },
      { hue: 48, saturation: 56, lightness: 88 },
      { hue: 68, saturation: 52, lightness: 88 },
      { hue: 92, saturation: 50, lightness: 87 },
      { hue: 116, saturation: 52, lightness: 86 },
      { hue: 138, saturation: 48, lightness: 87 },
      { hue: 160, saturation: 46, lightness: 88 },
      { hue: 184, saturation: 52, lightness: 87 },
      { hue: 206, saturation: 56, lightness: 87 },
      { hue: 226, saturation: 54, lightness: 88 },
      { hue: 246, saturation: 50, lightness: 88 },
      { hue: 266, saturation: 52, lightness: 88 },
      { hue: 286, saturation: 52, lightness: 88 },
      { hue: 306, saturation: 54, lightness: 88 },
      { hue: 326, saturation: 52, lightness: 88 },
      { hue: 346, saturation: 54, lightness: 88 },
      { hue: 18, saturation: 50, lightness: 89 },
      { hue: 58, saturation: 48, lightness: 89 },
      { hue: 108, saturation: 46, lightness: 88 },
      { hue: 168, saturation: 44, lightness: 89 },
      { hue: 198, saturation: 48, lightness: 89 },
      { hue: 238, saturation: 46, lightness: 89 },
      { hue: 278, saturation: 46, lightness: 89 }
    ];
  }

  function circularHueDistance(a, b) {
    var x = Math.abs(Number(a) - Number(b)) % 360;
    return x > 180 ? (360 - x) : x;
  }

  function buildMarkerColorMap(entries) {
    var markers = uniqueMarkerValues(entries);
    var palette = markerPaletteSwatches();
    var used = {};
    var map = {};
    if (!markers.length || !palette.length) {
      state.markerColorByToken = map;
      return map;
    }
    markers.sort(function (a, b) {
      var ah = markerHash32(a);
      var bh = markerHash32(b);
      if (ah !== bh) {
        return ah - bh;
      }
      return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    });
    markers.forEach(function (marker) {
      var h = markerHash32(marker);
      var desiredHue = h % 360;
      var bestIdx = -1;
      var bestScore = -1e9;
      for (var i = 0; i < palette.length; i += 1) {
        if (used[i]) {
          continue;
        }
        var sw = palette[i];
        var minSep = 180;
        Object.keys(map).forEach(function (key) {
          var color = map[key];
          minSep = Math.min(minSep, circularHueDistance(sw.hue, color.hue));
        });
        var desiredScore = 180 - circularHueDistance(sw.hue, desiredHue);
        var score = (minSep * 4) + (desiredScore * 0.55);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) {
        bestIdx = h % palette.length;
      }
      used[bestIdx] = true;
      map[marker] = palette[bestIdx];
    });
    state.markerColorByToken = map;
    return map;
  }

  function markerColorFromText(text) {
    var marker = String(text || '');
    if (marker && state.markerColorByToken && state.markerColorByToken[marker]) {
      return state.markerColorByToken[marker];
    }
    var palette = markerPaletteSwatches();
    var fallback = palette[markerHash32(marker) % palette.length] || palette[0];
    var hue = fallback.hue;
    var saturation = fallback.saturation;
    var lightness = fallback.lightness;
    return {
      hue: hue,
      saturation: saturation,
      lightness: lightness
    };
  }

  function uniqueMarkerValues(entries) {
    var seen = {};
    var markers = [];
    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      markerTokensFromEntry(entry).forEach(function (marker) {
        if (seen[marker]) {
          return;
        }
        seen[marker] = true;
        markers.push(marker);
      });
    });
    return markers;
  }

  function pruneMarkerFilters(availableMarkers) {
    var allowed = {};
    (Array.isArray(availableMarkers) ? availableMarkers : []).forEach(function (marker) {
      allowed[String(marker)] = true;
    });
    state.markerFilterInclude = (Array.isArray(state.markerFilterInclude) ? state.markerFilterInclude : []).filter(function (marker) {
      return !!allowed[String(marker)];
    });
    state.markerFilterExclude = (Array.isArray(state.markerFilterExclude) ? state.markerFilterExclude : []).filter(function (marker) {
      return !!allowed[String(marker)];
    });
  }

  function ensureDefaultMarkerFilters(availableMarkers, rawDefaultMarkers) {
    if (state.markerFilterInitialized) {
      return;
    }
    state.markerFilterInitialized = true;
    var defaults = markerTokensFromText(rawDefaultMarkers || '');
    if (!defaults.length) {
      return;
    }
    var allowed = {};
    (Array.isArray(availableMarkers) ? availableMarkers : []).forEach(function (marker) {
      allowed[String(marker)] = true;
    });
    state.markerFilterInclude = defaults.filter(function (marker) {
      return !!allowed[String(marker)];
    });
    state.markerFilterExclude = [];
  }

  function applyMarkerFilters(entries) {
    var source = Array.isArray(entries) ? entries : [];
    var include = Array.isArray(state.markerFilterInclude) ? state.markerFilterInclude : [];
    var exclude = Array.isArray(state.markerFilterExclude) ? state.markerFilterExclude : [];
    if (!include.length && !exclude.length) {
      return source.slice();
    }
    var includeMap = {};
    var excludeMap = {};
    include.forEach(function (marker) {
      includeMap[String(marker)] = true;
    });
    exclude.forEach(function (marker) {
      excludeMap[String(marker)] = true;
    });
    var parentIndexByRow = new Array(source.length);
    var depthStack = [];
    var keepRows = {};
    source.forEach(function (entry, idx) {
      var depth = Math.max(0, Number(entry && entry.depth || 0) || 0);
      if (depth > depthStack.length) {
        depth = depthStack.length;
      }
      if (depth < depthStack.length) {
        depthStack.length = depth;
      }
      parentIndexByRow[idx] = depth > 0 ? Number(depthStack[depth - 1]) : -1;
      depthStack[depth] = idx;
      depthStack.length = depth + 1;

      var markers = markerTokensFromEntry(entry);
      if (include.length) {
        var includeHit = markers.some(function (marker) {
          return !!includeMap[marker];
        });
        if (!includeHit) {
          return;
        }
      }
      var excludeHit = markers.some(function (marker) {
        return !!excludeMap[marker];
      });
      if (excludeHit) {
        return;
      }
      keepRows[idx] = true;
      if (include.length) {
        var parentIdx = parentIndexByRow[idx];
        while (parentIdx >= 0) {
          keepRows[parentIdx] = true;
          parentIdx = parentIndexByRow[parentIdx];
        }
      }
    });
    return source.filter(function (_entry, idx) {
      return !!keepRows[idx];
    });
  }

  function markerFilterTooltipText() {
    var platform = '';
    try {
      platform = String((window.navigator && window.navigator.platform) || (window.navigator && window.navigator.userAgent) || '');
    } catch (_err) {
      platform = '';
    }
    var isApple = /Mac|iPhone|iPad|iPod/i.test(platform);
    var multiKey = isApple ? '⌘' : 'Ctrl';
    var excludeKey = isApple ? '⌥' : 'Alt';
    return 'Click to filter. ' + multiKey + '-click to multi-select. ' + excludeKey + '-click to filter out. Unselect all filters to show all.';
  }

  function renderMarkerFilters(entries, defaultMarkersRaw) {
    buildMarkerColorMap(entries);
    var markers = uniqueMarkerValues(entries).slice().sort(function (a, b) {
      return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    });
    ensureDefaultMarkerFilters(markers, defaultMarkersRaw);
    pruneMarkerFilters(markers);
    if (!markers.length) {
      return '';
    }
    var html = '<section class="list-marker-filters" aria-label="Marker filters">';
    html += '<div class="list-marker-filters-row">';
    var tooltip = markerFilterTooltipText();
    markers.forEach(function (marker) {
      var included = (state.markerFilterInclude || []).indexOf(marker) >= 0;
      var excluded = (state.markerFilterExclude || []).indexOf(marker) >= 0;
      var cls = 'list-marker-filter-pill';
      if (included) {
        cls += ' is-include';
      } else if (excluded) {
        cls += ' is-exclude';
      }
      var markerColor = markerColorFromText(marker);
      html += '<button type="button" class="' + cls + '" data-marker-filter-action="toggle" data-marker-filter-value="' + escapeHtml(marker) + '" title="' + escapeHtml(tooltip) + '" aria-label="' + escapeHtml(marker + '. ' + tooltip) + '" style="--marker-pill-h:' + String(markerColor.hue) + ';--marker-pill-s:' + String(markerColor.saturation) + '%;--marker-pill-l:' + String(markerColor.lightness) + '%;">' + escapeHtml(marker) + '</button>';
    });
    html += '</div>';
    html += '</section>';
    return html;
  }

  function renderProductGalleryViewModeControl(viewMode) {
    if (!isProductGalleryPage()) {
      return '';
    }
    function viewModeIconSvg(modeName) {
      if (modeName === 'list') {
        return '<svg class="list-view-mode-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
          '<path d="M8 7H20M8 12H20M8 17H20" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
          '<circle cx="4.8" cy="7" r="1.2" fill="currentColor"/>' +
          '<circle cx="4.8" cy="12" r="1.2" fill="currentColor"/>' +
          '<circle cx="4.8" cy="17" r="1.2" fill="currentColor"/>' +
        '</svg>';
      }
      return '<svg class="list-view-mode-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<rect x="4.2" y="4.2" width="6.6" height="6.6" rx="1.2" stroke="currentColor" stroke-width="1.8"/>' +
        '<rect x="13.2" y="4.2" width="6.6" height="6.6" rx="1.2" stroke="currentColor" stroke-width="1.8"/>' +
        '<rect x="4.2" y="13.2" width="6.6" height="6.6" rx="1.2" stroke="currentColor" stroke-width="1.8"/>' +
        '<rect x="13.2" y="13.2" width="6.6" height="6.6" rx="1.2" stroke="currentColor" stroke-width="1.8"/>' +
      '</svg>';
    }
    var mode = normalizeViewMode(viewMode || 'tile');
    var tileActive = mode === 'tile';
    var listActive = mode === 'list';
    var html = '<section class="list-view-mode-row" aria-label="Gallery view mode">';
    html += '<div class="list-view-mode-pill" role="group" aria-label="Choose gallery view">';
    html += '<button type="button" class="list-view-mode-btn' + (tileActive ? ' is-active' : '') + '" data-list-view-mode="tile" aria-pressed="' + (tileActive ? 'true' : 'false') + '" aria-label="Tile view" title="Tile view">' + viewModeIconSvg('tile') + '</button>';
    html += '<button type="button" class="list-view-mode-btn' + (listActive ? ' is-active' : '') + '" data-list-view-mode="list" aria-pressed="' + (listActive ? 'true' : 'false') + '" aria-label="List view" title="List view">' + viewModeIconSvg('list') + '</button>';
    html += '</div>';
    html += '</section>';
    return html;
  }

  function getRenderState() {
    if (isAdmin()) {
      return {
        title: state.draft.title,
        description: state.draft.description,
        publish_intro_to_nostr: !!state.draft.publish_intro_to_nostr,
        show_marker_filters: !!state.draft.show_marker_filters,
        show_markers: !!state.draft.show_markers,
        alphabetize_markers: !!state.draft.alphabetize_markers,
        default_markers: normalizeMarkerListText(state.draft.default_markers || ''),
        group_by: state.draft.group_by,
        view_mode: normalizeViewModeForPage(state.draft.view_mode || ''),
        extras_after: String(state.draft.extras_after || ''),
        extras_after_format: normalizeExtraFormat(state.draft.extras_after_format || 'markdown'),
        elements: cloneEditableElements(state.draft.elements)
      };
    }
    var src = (state.payload && state.payload.state) ? state.payload.state : {};
    return {
      title: String(src.title || ''),
      description: String(src.description || ''),
      publish_intro_to_nostr: !!src.publish_intro_to_nostr,
      show_marker_filters: !!src.show_marker_filters,
      show_markers: !!src.show_markers,
      alphabetize_markers: !!src.alphabetize_markers,
      default_markers: normalizeMarkerListText(src.default_markers || ''),
      group_by: String(src.group_by || ''),
      view_mode: normalizeViewModeForPage(src.view_mode || ''),
      extras_after: String(src.extras_after || ''),
      extras_after_format: normalizeExtraFormat(src.extras_after_format || 'markdown'),
      elements: Array.isArray(src.elements) ? cloneEditableElements(src.elements) : elementsFromLegacyEntries(src.entries)
    };
  }

  function defaultNavbarTitle(renderState) {
    var s = renderState || getRenderState();
    var fallback = String(root.getAttribute('data-list-title') || root.getAttribute('data-page-title') || '').trim();
    var title = String((s && s.title) || fallback || 'List').trim();
    return title || 'List';
  }

  function currentNavbarTitle(renderState) {
    var configured = String(state.navTitle || '').trim();
    if (configured) {
      return configured;
    }
    return defaultNavbarTitle(renderState);
  }

  function navbarTitleHost() {
    if (!els.title) {
      return null;
    }
    var host = els.title.querySelector('[data-page-nav-title-host="true"]');
    if (host instanceof HTMLElement) {
      return host;
    }
    host = document.createElement('span');
    host.setAttribute('data-page-nav-title-host', 'true');
    host.className = 'list-page-nav-title-row-wrap';
    var actionsHost = document.getElementById('list-page-title-actions');
    if (actionsHost instanceof HTMLElement && actionsHost.parentNode === els.title) {
      actionsHost.insertAdjacentElement('afterend', host);
    } else {
      els.title.appendChild(host);
    }
    return host;
  }

  function renderNavbarTitleRow(renderState) {
    var host = navbarTitleHost();
    if (!host) {
      return;
    }
    if (!isAdmin() || !state.editMode) {
      if (els.title) {
        els.title.classList.remove('has-nav-title-row');
      }
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    if (els.title) {
      els.title.classList.add('has-nav-title-row');
    }
    var current = currentNavbarTitle(renderState);
    var editing = !!state.navTitleEditing;
    var html = '<div class="list-page-nav-title-row">';
    html += '<span class="list-page-nav-title-label">Navbar title</span>';
    if (editing) {
      var value = state.navTitleInput || current;
      html += '<span class="list-page-nav-title-edit-wrap">';
      html += '<input type="text" class="list-page-nav-title-input" data-page-nav-title-input="true" value="' + escapeHtml(value) + '" aria-label="Navbar title">';
      html += '<button type="button" class="list-inline-edit-link" data-page-nav-title-action="save"' + (state.navTitleBusy ? ' disabled aria-disabled="true"' : '') + '>OK</button>';
      html += '</span>';
    } else {
      html += '<span class="list-page-nav-title-value">' + escapeHtml(current) + '</span>';
      html += '<button type="button" class="list-inline-edit-link" data-page-nav-title-action="edit">Edit...</button>';
    }
    html += '</div>';
    host.hidden = false;
    host.innerHTML = html;
    if (editing) {
      requestAnimationFrame(function () {
        var input = host.querySelector('[data-page-nav-title-input="true"]');
        if (input && typeof input.focus === 'function') {
          input.focus();
          if (typeof input.select === 'function') {
            input.select();
          }
        }
      });
    }
  }

  function findElementIndex(uid) {
    var elements = Array.isArray(state.draft && state.draft.elements) ? state.draft.elements : [];
    for (var i = 0; i < elements.length; i += 1) {
      if (String(elements[i]._uid || '') === String(uid || '')) {
        return i;
      }
    }
    return -1;
  }

  function captureEntryRects() {
    var map = {};
    if (!els.content) {
      return map;
    }
    var nodes = els.content.querySelectorAll('.list-entry-inline[data-element-uid]');
    nodes.forEach(function (node) {
      var uid = node.getAttribute('data-element-uid') || '';
      if (uid) {
        map[uid] = node.getBoundingClientRect();
      }
    });
    return map;
  }

  function applyFlip(beforeRects) {
    if (!els.content || !beforeRects) {
      return;
    }
    var nodes = els.content.querySelectorAll('.list-entry-inline[data-element-uid]');
    nodes.forEach(function (node) {
      var uid = node.getAttribute('data-element-uid') || '';
      var first = beforeRects[uid];
      if (!first) {
        return;
      }
      var last = node.getBoundingClientRect();
      var dx = first.left - last.left;
      var dy = first.top - last.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        return;
      }
      node.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px)' },
        { transform: 'translate(0,0)' }
      ], {
        duration: 230,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
      });
    });
  }

  function renderListWithFlip(beforeRects) {
    renderList();
    requestAnimationFrame(function () {
      applyFlip(beforeRects);
    });
  }

  function setSaveStatus(next, errorMessage) {
    state.saveStatus = next;
    state.saveError = String(errorMessage || '');
    var node = document.getElementById('list-admin-save-status');
    if (!node) {
      return;
    }
    node.classList.toggle('is-error', next === 'error');
    if (next === 'saving') {
      node.innerHTML = '<span class="save-spinner" aria-hidden="true"></span>Saving...';
      return;
    }
    if (next === 'error') {
      node.textContent = 'Save failed';
      return;
    }
    node.textContent = 'Saved';
  }

  function queueAutosave(delayMs) {
    if (!isAdmin()) {
      return;
    }
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
    }
    state.saveIndicatorVisible = true;
    state.saveStatus = 'saving';
    state.saveError = '';
    renderAdmin();
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      persistDraft({ alertOnError: false });
    }, Number(delayMs) > 0 ? Number(delayMs) : 500);
  }

  function syncMetaFromInputs() {
    if (!isAdmin()) {
      return;
    }
    var groupByInput = document.getElementById('list-admin-group-by');
    if (groupByInput) {
      state.draft.group_by = String(groupByInput.value || '').trim();
    }
    var showMarkerFiltersInput = els.content ? els.content.querySelector('[data-list-show-marker-filters]') : null;
    if (showMarkerFiltersInput instanceof HTMLInputElement) {
      state.draft.show_marker_filters = !!showMarkerFiltersInput.checked;
    }
    var showMarkersInput = els.content ? els.content.querySelector('[data-list-show-markers]') : null;
    if (showMarkersInput instanceof HTMLInputElement) {
      state.draft.show_markers = !!showMarkersInput.checked;
    }
    var alphabetizeMarkersInput = els.content ? els.content.querySelector('[data-list-alphabetize-markers]') : null;
    if (alphabetizeMarkersInput instanceof HTMLInputElement) {
      state.draft.alphabetize_markers = !!alphabetizeMarkersInput.checked;
    }
    var defaultMarkersInput = els.content ? els.content.querySelector('[data-list-default-markers]') : null;
    if (defaultMarkersInput instanceof HTMLInputElement) {
      state.draft.default_markers = normalizeMarkerListText(defaultMarkersInput.value || '');
    }
  }

  async function refreshValidation() {
    if (!isAdmin()) {
      return;
    }
    try {
      var auth = getAuthPayload();
      var latest = await apiPost('/cgi/blog-get-nostr-page', {
        page_slug: slug,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      if (!latest) {
        return;
      }
      state.payload.validation = latest.validation;
      state.payload.canonical_exists = latest.canonical_exists;
      state.payload.canonical_event = latest.canonical_event;
      state.payload.draft_exists = latest.draft_exists;
      state.payload.draft_differs = latest.draft_differs;
      renderValidation();
      renderAdmin();
    } catch (_err) {
      // Keep UI responsive if validation refresh fails.
    }
  }

  async function persistDraft(options) {
    if (state.busy || !isAdmin()) {
      state.autosaveQueued = true;
      return false;
    }
    var opts = options || {};
    var shouldRetryAuth = false;
    state.busy = true;
    pruneTransientEntries();
    syncMetaFromInputs();
    setSaveStatus('saving');
    try {
      var auth = getAuthPayload();
      var elements = cloneEditableElements(state.draft.elements || []);
      var savedPayload = await apiPostJson('/cgi/blog-save-nostr-page-draft', {
        page_slug: slug,
        state_json: {
          slug: slug,
          title: state.draft.title || '',
          description: state.draft.description || '',
          publish_intro_to_nostr: !!state.draft.publish_intro_to_nostr,
          show_marker_filters: !!state.draft.show_marker_filters,
          show_markers: !!state.draft.show_markers,
          alphabetize_markers: !!state.draft.alphabetize_markers,
          default_markers: normalizeMarkerListText(state.draft.default_markers || ''),
          group_by: state.draft.group_by || '',
          view_mode: normalizeViewModeForPage(state.draft.view_mode || ''),
          content: state.draft.content || '',
          extras_after: state.draft.extras_after || '',
          extras_after_format: normalizeExtraFormat(state.draft.extras_after_format || 'markdown'),
          elements: elements,
          entries: toEntries(elements)
        },
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      if (savedPayload && savedPayload.state) {
        state.payload.state = savedPayload.state;
      }
      if (savedPayload && savedPayload.validation) {
        state.payload.validation = savedPayload.validation;
      }
      state.payload.draft_exists = true;
      state.payload.draft_differs = false;
      writeBootstrapCache(state.payload);
      setSaveStatus('saved');
      refreshValidation();
    } catch (err) {
      var errCode = String(err && err.code || '');
      if ((errCode === 'csrf_invalid' || errCode === 'auth_required') && opts.retryAuth !== false) {
        try {
          await load();
          if (isAdmin()) {
            shouldRetryAuth = true;
          } else {
            setSaveStatus('error', err && err.message ? err.message : 'Authentication required');
          }
        } catch (_reloadErr) {
          setSaveStatus('error', err && err.message ? err.message : 'Could not save draft');
        }
      } else {
        setSaveStatus('error', err && err.message ? err.message : 'Could not save draft');
      }
      if (shouldRetryAuth) {
        // Retry once after auth/session refresh.
      } else {
        if (opts.alertOnError !== false) {
          window.alert(err.message || 'Could not save draft');
        }
        return false;
      }
    } finally {
      state.busy = false;
      if (state.autosaveQueued) {
        state.autosaveQueued = false;
        if (state.pendingToggleEditOff) {
          persistDraft({ alertOnError: false }).then(function (saved) {
            if (saved) {
              maybeFinalizeEditModeExit();
            } else {
              state.pendingToggleEditOff = false;
              renderAdmin();
            }
          });
        } else {
          queueAutosave(500);
        }
      }
    }
    if (shouldRetryAuth) {
      return persistDraft({
        alertOnError: opts.alertOnError,
        retryAuth: false
      });
    }
    return true;
  }

  function exitEditModeNow() {
    state.editMode = false;
    state.pendingToggleEditOff = false;
    state.activeEntryUid = '';
    state.activeCellField = '';
    state.readInlineEditUid = '';
    state.readInlineEditField = '';
    state.activeHeadField = '';
    state.rowMenuOpenUid = '';
    state.navTitleEditing = false;
    state.navTitleInput = '';
    state.settingsPanelReveal = false;
    resetInlineHistory();
    renderList();
    renderAdmin();
  }

  function maybeFinalizeEditModeExit() {
    if (!state.pendingToggleEditOff) {
      return;
    }
    if (state.busy || state.autosaveQueued || state.saveTimer) {
      return;
    }
    exitEditModeNow();
  }

  function requestExitEditModeWithSave() {
    if (!isAdmin() || !state.editMode) {
      return;
    }
    state.pendingToggleEditOff = true;
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    pruneTransientEntries();
    syncMetaFromInputs();
    state.saveIndicatorVisible = true;
    renderAdmin();
    if (state.busy) {
      state.autosaveQueued = true;
      return;
    }
    persistDraft({ alertOnError: true }).then(function (saved) {
      if (saved) {
        maybeFinalizeEditModeExit();
      } else {
        state.pendingToggleEditOff = false;
        renderAdmin();
      }
    });
  }

  async function publishDraft() {
    if (state.busy || !isAdmin()) {
      return;
    }
    var saved = await persistDraft({ alertOnError: true });
    if (!saved) {
      return;
    }
    var hasDialog = await ensureNostrPublishDialog();
    if (!hasDialog) {
      window.alert('Publish dialog unavailable');
      return;
    }
    var published = await window.blogNostrPublishDialog.open({
      pageSlug: slug,
      pageLabel: String((state.draft && state.draft.title) || slug || 'page').trim()
    });
    if (!published) {
      return;
    }
    await load();
    setSaveStatus('saved');
  }

  async function revertDraft() {
    if (state.busy || !isAdmin()) {
      return;
    }
    if (!state.payload.canonical_exists) {
      return;
    }
    if (!window.confirm('Discard local draft changes and restore canonical Nostr version?')) {
      return;
    }
    state.busy = true;
    setSaveStatus('saving');
    try {
      var auth = getAuthPayload();
      await apiPost('/cgi/blog-revert-nostr-page-draft', {
        page_slug: slug,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      await load();
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error', err && err.message ? err.message : 'Could not revert draft');
      window.alert(err.message || 'Could not revert draft');
    } finally {
      state.busy = false;
    }
  }

  function moveEntryByYear(uid) {
    if (!isAdmin() || state.draft.group_by !== 'year') {
      return;
    }
    if (hasStructuralElements(state.draft.elements)) {
      return;
    }
    var elements = state.draft.elements;
    var idx = findElementIndex(uid);
    if (idx < 0) {
      return;
    }
    var moving = elements[idx];
    if (!isEntryType(String(moving.type || 'entry'))) {
      return;
    }
    var year = yearFromDate(moving.date) || '';
    elements.splice(idx, 1);
    var inserted = false;
    for (var i = 0; i < elements.length; i += 1) {
      var y = yearFromDate(elements[i].date) || '';
      if (year && y && year > y) {
        elements.splice(i, 0, moving);
        inserted = true;
        break;
      }
      if (year === y) {
        var j = i + 1;
        while (j < elements.length && yearFromDate(elements[j].date) === year) {
          j += 1;
        }
        elements.splice(j, 0, moving);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      elements.push(moving);
    }
  }

  function addProductToCartBySlug(productSlug) {
    var slugValue = String(productSlug || '').trim();
    if (!slugValue) {
      return;
    }
    if (!window.blogShopCart || typeof window.blogShopCart.addProductBySlug !== 'function') {
      window.alert('Cart is still loading. Try again in a moment.');
      return;
    }
    window.blogShopCart.addProductBySlug(slugValue).catch(function (err) {
      window.alert(err && err.message ? err.message : 'Could not add product to cart');
    });
  }

  async function createProductFromEntry(uid) {
    if (!isAdmin() || !isProductGalleryPage() || state.createProductBusyUid) {
      return;
    }
    var idx = findElementIndex(uid);
    if (idx < 0) {
      return;
    }
    var entry = state.draft.elements[idx] || {};
    if (!entryHasProductBasics(entry)) {
      window.alert('Add product text first.');
      return;
    }
    var productTitle = String(entry.markdown || '').trim();
    var suggestedSlug = entryProductSlug(entry) || productTitle;
    var payload = {
      product_title: productTitle,
      product_slug: suggestedSlug,
      description: String(entry.description || ''),
      content: String(entry.description || '')
    };
    var auth = getAuthPayload();
    payload.session_token = auth.session_token;
    payload.csrf_token = auth.csrf_token;

    state.createProductBusyUid = uid;
    renderList();
    renderAdmin();
    try {
      var data = await apiPost('/cgi/blog-create-product-page', payload);
      var nextPath = String(data && data.path || '').trim();
      if (nextPath) {
        state.draft.elements[idx].post_url = nextPath;
        state.draft.elements[idx].event_id = '';
        queueAutosave(150);
      }
      renderList();
      window.alert(data && data.message ? data.message : 'Product page created.');
    } catch (err) {
      window.alert(err && err.message ? err.message : 'Could not create product page');
    } finally {
      state.createProductBusyUid = '';
      renderList();
      renderAdmin();
    }
  }

  function firstEntryInsertIndex() {
    if (!Array.isArray(state.draft && state.draft.elements)) {
      return 0;
    }
    for (var i = 0; i < state.draft.elements.length; i += 1) {
      if (isEntryType(String(state.draft.elements[i] && state.draft.elements[i].type || 'entry'))) {
        return i;
      }
    }
    return state.draft.elements.length;
  }

  function endEntryInsertIndex() {
    if (!Array.isArray(state.draft && state.draft.elements)) {
      return 0;
    }
    for (var i = state.draft.elements.length - 1; i >= 0; i -= 1) {
      if (isEntryType(String(state.draft.elements[i] && state.draft.elements[i].type || 'entry'))) {
        return i + 1;
      }
    }
    return state.draft.elements.length;
  }

  function endOfYearSectionInsertIndex(sectionLabel) {
    if (!Array.isArray(state.draft && state.draft.elements)) {
      return 0;
    }
    var target = String(sectionLabel || '').trim() || 'Unknown';
    var lastMatch = -1;
    for (var i = 0; i < state.draft.elements.length; i += 1) {
      var el = state.draft.elements[i];
      if (!isEntryType(String(el && el.type || 'entry'))) {
        continue;
      }
      var label = yearFromDate(el && el.date || el && el.year || '') || 'Unknown';
      if (label === target) {
        lastMatch = i;
      }
    }
    return lastMatch >= 0 ? (lastMatch + 1) : endEntryInsertIndex();
  }

  function addEntry(prefillYear, options) {
    if (!isAdmin()) {
      return '';
    }
    var opts = options || {};
    var defaultMarker = slug === 'list' ? 'list' : '';
    var defaultDate = prefillYear ? String(prefillYear) : '';
    var entry = {
      _uid: nextUid(),
      type: 'entry',
      event_id: '',
      relay_hint: '',
      marker: defaultMarker,
      date: defaultDate,
      depth: 0,
      markdown: '',
      post_url: ''
    };
    var insertIndex = Number(opts.insertIndex);
    if (!isFinite(insertIndex) || insertIndex < 0 || insertIndex > state.draft.elements.length) {
      insertIndex = state.draft.elements.length;
    }
    state.draft.elements.splice(insertIndex, 0, entry);
    state.activeEntryUid = entry._uid;
    state.activeCellField = 'markdown';
    state.pendingNewEntry = {
      uid: entry._uid,
      defaults: {
        event_id: '',
        relay_hint: '',
        marker: defaultMarker,
        date: defaultDate,
        depth: 0,
        markdown: '',
        post_url: ''
      }
    };
    return entry._uid;
  }

  function isPendingNewEntryUnedited() {
    if (!state.pendingNewEntry || !state.pendingNewEntry.uid) {
      return false;
    }
    var idx = findElementIndex(state.pendingNewEntry.uid);
    if (idx < 0) {
      state.pendingNewEntry = null;
      return false;
    }
    var entry = state.draft.elements[idx] || {};
    var d = state.pendingNewEntry.defaults || {};
    var hasRealContent = String(entry.markdown || '').trim() !== '' || String(entry.event_id || '').trim() !== '' || String(entry.post_url || '').trim() !== '';
    if (hasRealContent) {
      return false;
    }
    return (
      String(entry.relay_hint || '') === String(d.relay_hint || '') &&
      String(entry.marker || '') === String(d.marker || '') &&
      Math.max(0, Number(entry.depth || 0) || 0) === Math.max(0, Number(d.depth || 0) || 0)
    );
  }

  function updatePendingNewEntryState() {
    if (!state.pendingNewEntry || !state.pendingNewEntry.uid) {
      return;
    }
    if (!isPendingNewEntryUnedited()) {
      state.pendingNewEntry = null;
    }
  }

  function isPendingNewEntryEditedAnyField() {
    if (!state.pendingNewEntry || !state.pendingNewEntry.uid) {
      return false;
    }
    var idx = findElementIndex(state.pendingNewEntry.uid);
    if (idx < 0) {
      return false;
    }
    var entry = state.draft.elements[idx] || {};
    var d = state.pendingNewEntry.defaults || {};
    return (
      String(entry.event_id || '') !== String(d.event_id || '') ||
      String(entry.relay_hint || '') !== String(d.relay_hint || '') ||
      String(entry.marker || '') !== String(d.marker || '') ||
      String(entry.date || '') !== String(d.date || '') ||
      Math.max(0, Number(entry.depth || 0) || 0) !== Math.max(0, Number(d.depth || 0) || 0) ||
      String(entry.markdown || '') !== String(d.markdown || '') ||
      String(entry.post_url || '') !== String(d.post_url || '')
    );
  }

  function shouldAutosaveForUid(uid) {
    var targetUid = String(uid || '');
    if (!targetUid || !state.pendingNewEntry || !state.pendingNewEntry.uid) {
      return true;
    }
    if (String(state.pendingNewEntry.uid) !== targetUid) {
      return true;
    }
    return !isPendingNewEntryUnedited();
  }

  function isEntryRowVisibleInInlineEditor(uid) {
    var targetUid = String(uid || '').trim();
    if (!targetUid || !els.content) {
      return false;
    }
    var rows = els.content.querySelectorAll('.list-entry-inline[data-element-uid]');
    for (var i = 0; i < rows.length; i += 1) {
      var rowUid = String(rows[i].getAttribute('data-element-uid') || '');
      if (rowUid === targetUid) {
        return true;
      }
    }
    return false;
  }

  function ensureEntryVisibleAfterAdd(uid, beforeRects) {
    var targetUid = String(uid || '').trim();
    if (!targetUid) {
      return;
    }
    if (isEntryRowVisibleInInlineEditor(targetUid)) {
      focusInlineField(targetUid, 'markdown');
      return;
    }
    // If marker filters hide the just-created row, clear them so add never feels broken.
    state.markerFilterInclude = [];
    state.markerFilterExclude = [];
    renderListWithFlip(beforeRects);
    focusInlineField(targetUid, 'markdown');
  }

  function isSubstantiveEntry(entry) {
    if (!entry) {
      return false;
    }
    return String(entry.markdown || '').trim() !== '' || String(entry.event_id || '').trim() !== '' || String(entry.post_url || '').trim() !== '';
  }

  function pruneTransientEntries() {
    if (!isAdmin() || !Array.isArray(state.draft && state.draft.elements)) {
      return false;
    }
    var beforeLen = state.draft.elements.length;
    state.draft.elements = state.draft.elements.filter(function (entry) {
      if (isSubstantiveEntry(entry)) {
        return true;
      }
      var uid = String(entry && entry._uid || '');
      if (uid && state.pendingNewEntry && String(state.pendingNewEntry.uid || '') === uid) {
        // Keep a pending row visible while the admin is actively filling it out,
        // even if it is not yet publishable.
        return isPendingNewEntryEditedAnyField();
      }
      return false;
    });
    if (state.pendingNewEntry && state.pendingNewEntry.uid && findElementIndex(state.pendingNewEntry.uid) < 0) {
      state.pendingNewEntry = null;
    }
    if (state.activeEntryUid && findElementIndex(state.activeEntryUid) < 0) {
      state.activeEntryUid = '';
      state.activeCellField = '';
    }
    if (state.readInlineEditUid && findElementIndex(state.readInlineEditUid) < 0) {
      state.readInlineEditUid = '';
      state.readInlineEditField = '';
    }
    return state.draft.elements.length !== beforeLen;
  }

  function reorderByDrag(dragUid, targetUid, placeAfter) {
    if (!isAdmin() || !dragUid || !targetUid || dragUid === targetUid) {
      return;
    }
    var elements = state.draft.elements;
    var from = findElementIndex(dragUid);
    var to = findElementIndex(targetUid);
    if (from < 0 || to < 0) {
      return false;
    }
    var beforeOrder = elements.map(function (el) { return String(el && el._uid || ''); }).join('|');
    var item = elements[from];
    elements.splice(from, 1);
    var insertAt = to;
    if (from < to) {
      insertAt = to - 1;
    }
    if (placeAfter) {
      insertAt += 1;
    }
    if (insertAt < 0) {
      insertAt = 0;
    }
    if (insertAt > elements.length) {
      insertAt = elements.length;
    }
    elements.splice(insertAt, 0, item);
    var afterOrder = elements.map(function (el) { return String(el && el._uid || ''); }).join('|');
    return beforeOrder !== afterOrder;
  }

  function renderHead() {
    var s = getRenderState();
    if (s && s.title) {
      if (typeof window.__wizardryApplyPageTitle === 'function') {
        window.__wizardryApplyPageTitle(String(s.title));
      } else {
        document.title = String(s.title);
      }
    }
    if (els.title) {
      if (isAdmin()) {
        if (state.activeHeadField === 'title') {
          els.title.innerHTML = '<span class="list-page-title-edit-wrap"><input id="list-head-title-input" class="list-head-inline-input" type="text" value="' + escapeHtml(s.title || 'List') + '" data-head-input="title"></span><span id="list-page-title-actions" class="list-page-title-actions"></span>';
        } else if (state.editMode) {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'List') + '</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="title">Edit...</button><span id="list-page-title-actions" class="list-page-title-actions"></span>';
        } else {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'List') + '</span><span id="list-page-title-actions" class="list-page-title-actions"></span>';
        }
      } else {
        els.title.textContent = s.title || 'List';
      }
    }
    renderNavbarTitleRow(s);

    if (!els.description) {
      return;
    }
    var descText = String(s.description || '');
    var elements = Array.isArray(s.elements) ? s.elements : [];
    var hasMainContent = elements.length > 0 || String(s.extras_after || '').trim().length > 0;
    var suppressEmptyDescription = !descText.trim() && !hasMainContent && state.activeHeadField !== 'description';
    if (isAdmin()) {
      els.description.hidden = suppressEmptyDescription;
      if (suppressEmptyDescription) {
        els.description.innerHTML = '';
      } else
      if (state.activeHeadField === 'description') {
        els.description.innerHTML = '<span class="list-page-description-edit-wrap"><textarea id="list-head-description-input" class="list-head-description-input" rows="4" data-head-input="description">' + escapeHtml(descText) + '</textarea></span> <button type="button" class="list-inline-edit-link" data-list-head-save="description">Save</button>';
      } else if (state.editMode) {
        if (descText.trim()) {
          els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(descText) + '</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="description">Edit...</button>';
        } else {
          els.description.innerHTML = '<span class="list-page-description-empty">No description.</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="description">Edit...</button>';
        }
      } else {
        if (descText.trim()) {
          els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(descText) + '</span>';
        } else if (hasMainContent) {
          els.description.innerHTML = '';
          els.description.hidden = true;
        } else {
          els.description.innerHTML = '<span class="list-page-description-empty">No description.</span>';
        }
      }
    } else {
      els.description.textContent = descText;
      els.description.hidden = !descText && !hasMainContent;
    }

    if (isAdmin() && state.activeHeadField) {
      requestAnimationFrame(function () {
        var id = state.activeHeadField === 'title' ? 'list-head-title-input' : 'list-head-description-input';
        var input = document.getElementById(id);
        if (input && typeof input.focus === 'function') {
          input.focus();
          if (typeof input.select === 'function') {
            input.select();
          }
        }
      });
    }
  }

  function datePillForEntryInSection(entry, groupBy, sectionLabel) {
    var dateText = String(entry && entry.date || '').trim();
    var mode = String(groupBy || '').trim();
    var label = String(sectionLabel || '').trim();
    if (!dateText || !mode || !label) {
      return '';
    }
    if (mode === 'year') {
      if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(dateText)) {
        return '';
      }
      if (yearFromDate(dateText) !== label) {
        return '';
      }
      if (dateText.length <= 4) {
        return '';
      }
      return dateText;
    }
    if (mode === 'month') {
      if (!/^\d{4}-\d{2}(-\d{2})?$/.test(dateText)) {
        return '';
      }
      if (monthFromDate(dateText) !== label) {
        return '';
      }
      if (dateText.length <= 7) {
        return '';
      }
      return dateText;
    }
    return '';
  }

  function isReadInlineEditing() {
    return !state.editMode && !!(state.readInlineEditUid && state.readInlineEditField);
  }

  function renderReadModeInlineEntry(entry) {
    var uid = String(entry && entry._uid || '');
    var markdownText = String(entry && entry.markdown || '');
    var depth = Math.max(0, Number(entry && entry.depth || 0) || 0);
    var html = '';
    html += '<div class="list-entry-read-inline is-active" data-element-uid="' + escapeHtml(uid) + '" data-depth="' + String(depth) + '" style="--list-depth:' + String(depth) + ';">';
    html += '<input type="text" class="list-entry-read-inline-input" data-inline-field="markdown" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(markdownText) + '" aria-label="Edit row text">';
    html += '<button type="button" class="list-entry-read-inline-done" data-list-read-action="finish-row" data-element-uid="' + escapeHtml(uid) + '">Done</button>';
    html += '</div>';
    return html;
  }

  function renderEntryReadOnly(entry, groupBy, sectionLabel, showMarkers, alphabetizeMarkers) {
    var rowUid = String(entry && entry._uid || '');
    if (isAdmin() && !state.editMode && rowUid && state.readInlineEditUid === rowUid) {
      return renderReadModeInlineEntry(entry);
    }
    var line = String(entry && entry.markdown || '').trim();
    var description = String(entry && entry.description || '').trim();
    var postUrl = String(entry && entry.post_url || '');
    var imageUrl = String(entry && entry.image_url || '').trim();
    var productSlug = entryProductSlug(entry);
    var datePill = datePillForEntryInSection(entry, groupBy, sectionLabel);
    var markerPills = '';
    if (showMarkers) {
      var markerTokens = markerTokensForDisplay(entry, !!alphabetizeMarkers);
      var hiddenSelectedDefaults = selectedDefaultMarkerSet();
      if (hiddenSelectedDefaults) {
        markerTokens = markerTokens.filter(function (marker) {
          return !hiddenSelectedDefaults[String(marker)];
        });
      }
      if (markerTokens.length) {
        markerPills = '<span class="list-entry-marker-pills">' + markerTokens.map(function (marker) {
          var markerColor = markerColorFromText(marker);
          return '<span class="list-entry-marker-pill" style="--marker-pill-h:' + String(markerColor.hue) + ';--marker-pill-s:' + String(markerColor.saturation) + '%;--marker-pill-l:' + String(markerColor.lightness) + '%;">' + escapeHtml(marker) + '</span>';
        }).join('') + '</span>';
      }
    }
    var rightMeta = '';
    var readMenu = '';
    if (isAdmin() && !state.editMode && rowUid) {
      var rowMenuOpen = state.readRowMenuOpenUid === rowUid;
      readMenu = '' +
        '<span class="list-entry-read-menu list-inline-row-menu-wrap">' +
          '<button type="button" class="list-inline-row-menu-trigger" data-list-read-action="toggle-menu" data-element-uid="' + escapeHtml(rowUid) + '" aria-label="Row actions" aria-haspopup="menu" aria-expanded="' + (rowMenuOpen ? 'true' : 'false') + '">⋮</button>' +
          '<div class="list-inline-row-menu" role="menu"' + (rowMenuOpen ? '' : ' hidden') + '>' +
            '<button type="button" role="menuitem" data-list-read-action="edit-row" data-element-uid="' + escapeHtml(rowUid) + '">Edit</button>' +
            '<button type="button" role="menuitem" class="list-inline-row-menu-danger" data-list-read-action="remove-row" data-element-uid="' + escapeHtml(rowUid) + '" aria-label="Delete entry"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5h6l.9 1.5H20a1 1 0 1 1 0 2h-1l-.7 11a2 2 0 0 1-2 1.9H7.7a2 2 0 0 1-2-1.9L5 7H4a1 1 0 1 1 0-2h4.1L9 3.5Zm-2 3.5.7 11h8.6L17 7H7Zm2.5 2a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Zm5 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z" fill="currentColor"/></svg><span>Delete</span></button>' +
          '</div>' +
        '</span>';
    }
    if (markerPills || datePill || readMenu) {
      var metaPills = markerPills + (datePill ? '<span class="list-entry-date-pill">' + escapeHtml(datePill) + '</span>' : '');
      rightMeta = '<span class="list-entry-meta-right">' + (metaPills ? '<span class="list-entry-meta-pills">' + metaPills + '</span>' : '') + readMenu + '</span>';
    }
    var listIcon = '';
    if (isProductGalleryPage() && imageUrl) {
      listIcon = '<img class="list-entry-list-icon" src="' + escapeHtml(imageUrl) + '" alt=""' + galleryImageAttrs() + '>';
    }
    var descriptionInline = '';
    if (isProductGalleryPage() && description) {
      descriptionInline = '<span class="list-entry-description-inline">' + markdownInline(description) + '</span>';
    }
    var cartButton = renderProductCartButton(productSlug, '');
    var firstLineClass = 'list-entry-first-line' + (cartButton ? ' has-cart-button' : '');
    return '<li class="list-entry-line"><div class="' + firstLineClass + '"><span class="list-entry-main-inline">' + listIcon + renderLinkedInlineText(line, postUrl, 'list-entry-markdown', 'Open linked post') + descriptionInline + '</span>' + rightMeta + cartButton + '</div></li>';
  }

  function renderEntryInner(entry, groupBy, sectionLabel, showMarkers, alphabetizeMarkers) {
    return renderEntryReadOnly(entry, groupBy, sectionLabel, showMarkers, alphabetizeMarkers).replace(/^<li[^>]*>|<\/li>$/g, '');
  }

  function placeholderHtml(label) {
    return '<span class="list-inline-placeholder">' + escapeHtml(label) + '</span>';
  }

  function renderStructuredReadOnly(elements, listClass, groupBy, sectionLabel, showMarkers, alphabetizeMarkers) {
    var html = '<ul class="' + escapeHtml(listClass || 'list-entries') + '">';
    var openDepth = -1;
    var started = false;
    var stripeIndex = 0;

    function rowStripeClass() {
      stripeIndex += 1;
      return stripeIndex % 2 === 0 ? ' is-row-highlight' : '';
    }

    (Array.isArray(elements) ? elements : []).forEach(function (el, idx) {
      var depth = Math.max(0, Number(el && el.depth || 0) || 0);
      if (!started && depth > 0) {
        depth = 0;
      }
      if (started && depth > openDepth + 1) {
        depth = openDepth + 1;
      }

      if (!started) {
        html += '<li class="list-entry-line list-depth-' + String(depth) + rowStripeClass() + '">' + renderEntryInner(el, groupBy, sectionLabel, showMarkers, alphabetizeMarkers);
        openDepth = depth;
        started = true;
        return;
      }

      if (depth === openDepth) {
        html += '</li><li class="list-entry-line list-depth-' + String(depth) + rowStripeClass() + '">' + renderEntryInner(el, groupBy, sectionLabel, showMarkers, alphabetizeMarkers);
        return;
      }

      if (depth > openDepth) {
        while (openDepth < depth) {
          html += '<ul class="list-sub-entries">';
          openDepth += 1;
        }
        html += '<li class="list-entry-line list-depth-' + String(depth) + rowStripeClass() + '">' + renderEntryInner(el, groupBy, sectionLabel, showMarkers, alphabetizeMarkers);
        return;
      }

      html += '</li>';
      while (openDepth > depth) {
        html += '</ul></li>';
        openDepth -= 1;
      }
      html += '<li class="list-entry-line list-depth-' + String(depth) + rowStripeClass() + '">' + renderEntryInner(el, groupBy, sectionLabel, showMarkers, alphabetizeMarkers);
    });

    if (started) {
      html += '</li>';
      while (openDepth > 0) {
        html += '</ul></li>';
        openDepth -= 1;
      }
    }

    html += '</ul>';
    return html;
  }

  function renderTileTreeChildren(nodes) {
    var html = '<ul class="list-tile-children">';
    (Array.isArray(nodes) ? nodes : []).forEach(function (node) {
      var entry = node && node.entry ? node.entry : {};
      var line = String(entry.markdown || '').trim();
      var postUrl = String(entry.post_url || '');
      html += '<li>' + renderLinkedInlineText(line, postUrl, 'list-tile-child-text', 'Open linked post');
      if (node && Array.isArray(node.children) && node.children.length) {
        html += renderTileTreeChildren(node.children);
      }
      html += '</li>';
    });
    html += '</ul>';
    return html;
  }

  function renderTileReadOnly(entries) {
    var roots = [];
    var stack = [];
    (Array.isArray(entries) ? entries : []).forEach(function (entry) {
      var depth = Math.max(0, Number(entry && entry.depth || 0) || 0);
      if (depth > stack.length) {
        depth = stack.length;
      }
      var node = {
        entry: entry,
        children: []
      };
      if (depth > 0 && stack[depth - 1]) {
        stack[depth - 1].children.push(node);
      } else {
        roots.push(node);
        depth = 0;
      }
      stack[depth] = node;
      stack.length = depth + 1;
    });

    var html = '<ul class="list-tiles">';
    roots.forEach(function (node) {
      var entry = node && node.entry ? node.entry : {};
      var line = String(entry.markdown || '').trim();
      var dateText = String(entry.date || '').trim();
      var imageUrl = String(entry.image_url || '').trim();
      var tileDescription = String(entry.description || '').trim();
      var postUrl = String(entry.post_url || '');
      var productSlug = entryProductSlug(entry);
      var cartButton = renderProductCartButton(productSlug, 'list-entry-cart-btn-tile');
      html += '<li class="list-tile">';
      html += '<div class="list-tile-content">';
      if (imageUrl) {
        html += '<div class="list-tile-image-wrap"><img class="list-tile-image" src="' + escapeHtml(imageUrl) + '" alt=""' + galleryImageAttrs() + '></div>';
      }
      if (dateText) {
        html += '<div class="list-tile-date">' + escapeHtml(dateText) + '</div>';
      }
      if (Array.isArray(node.children) && node.children.length) {
        html += renderTileTreeChildren(node.children);
      }
      if (cartButton) {
        html += '<div class="list-tile-cart-row">' + cartButton + '</div>';
      }
      html += '</div>';
      html += '<div class="list-tile-main"><div class="list-tile-label">' + renderLinkedInlineText(line, postUrl, 'list-tile-text', 'Open linked post') + (tileDescription ? '<span class="list-tile-description">' + markdownInline(tileDescription) + '</span>' : '') + '</div></div>';
      html += '</li>';
    });
    html += '</ul>';
    return html;
  }

  function renderReadOnlyByView(entries, viewMode, groupBy, sectionLabel, showMarkers, alphabetizeMarkers) {
    if (normalizeViewMode(viewMode) === 'tile') {
      return renderTileReadOnly(entries);
    }
    return renderStructuredReadOnly(entries, 'list-entries', groupBy, sectionLabel, showMarkers, alphabetizeMarkers);
  }

  function renderGroupByReadOnly(entries, groupBy, viewMode, showMarkerFilters, showMarkers, alphabetizeMarkers, defaultMarkersRaw) {
    var html = '';
    var allEntries = Array.isArray(entries) ? entries : [];
    buildMarkerColorMap(allEntries);
    html += renderProductGalleryViewModeControl(viewMode);
    if (showMarkerFilters) {
      html += renderMarkerFilters(allEntries, defaultMarkersRaw);
    } else {
      state.markerFilterInclude = [];
      state.markerFilterExclude = [];
      state.markerFilterInitialized = false;
    }
    var filteredEntries = applyMarkerFilters(allEntries);
    if (!filteredEntries.length) {
      html += '<p class="list-page-empty-state">No entries match selected marker filters.</p>';
      return html;
    }
    var grouped = ['year', 'first_letter', 'month', 'marker'].indexOf(String(groupBy || '')) >= 0;
    if (grouped) {
      var currentLabel = '__none__';
      var bucket = [];
      function flushGroup() {
        if (!bucket.length) {
          return;
        }
        html += renderReadOnlyByView(bucket, viewMode, groupBy, currentLabel, showMarkers, alphabetizeMarkers);
        html += '</section>';
        bucket = [];
      }
      filteredEntries.forEach(function (entry) {
        var label = groupLabelForEntry(entry, groupBy);
        if (label !== currentLabel) {
          flushGroup();
          currentLabel = label;
          html += '<section class="list-year-group">';
          html += '<div class="list-year-head">';
          html += '<h3 class="list-year-heading">' + escapeHtml(label || 'Unknown') + '</h3>';
          html += '</div>';
        }
        bucket.push(entry);
      });
      flushGroup();
      return html;
    }

    return html + renderReadOnlyByView(filteredEntries, viewMode, '', '', showMarkers, alphabetizeMarkers);
  }

  function renderExtraContent(text, format, role) {
    var value = String(text || '');
    if (!value.trim()) {
      return '';
    }
    var html = markdownBlock(value);
    return '<section class="nostr-page-extra nostr-page-extra-' + escapeHtml(role || '') + '">' + html + '</section>';
  }

  function renderAfterContentEditor() {
    var draft = state.draft || {};
    var html = '';
    html += '<section class="nostr-page-extras-editor" aria-label="Page extras">';
    html += '<h3 class="nostr-page-extras-heading">After content</h3>';
    html += '<label class="nostr-page-extra-edit">';
    html += '<span>After content <span class="nostr-page-scope-pill is-local">Local</span></span>';
    html += '<textarea data-list-outro="after" rows="4" placeholder="Optional local content shown after the main content section">' + escapeHtml(draft.extras_after || '') + '</textarea>';
    html += '</label>';
    html += '</section>';
    return html;
  }

  function listHistoryIconSvg(direction) {
    if (String(direction || '') === 'redo') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M15 9l4-4m0 0-4-4m4 4H9a6 6 0 0 0 0 12h3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M9 9L5 5m0 0 4-4M5 5h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  }

  function renderElementInline(el) {
    var uid = String(el && el._uid || '');
    var rowSelected = uid && uid === state.activeEntryUid;
    var activeField = rowSelected ? String(state.activeCellField || '') : '';
    var active = !!activeField;
    var depth = Math.max(0, Number(el && el.depth || 0) || 0);
    var guiDepth = depth;
    var idx = findElementIndex(uid);
    var canToggle = !(idx === 0 && guiDepth === 0);
    var html = '';

    html += '<li class="list-entry-line list-entry-inline' + (active ? ' is-active' : '') + '" data-element-uid="' + escapeHtml(uid) + '" data-depth="' + String(guiDepth) + '" style="--list-depth:' + String(guiDepth) + ';" draggable="false">';
    html += '<div class="list-inline-cell list-inline-handle" title="Drag to reorder" aria-label="Drag to reorder" draggable="true" data-list-drag-handle="true">⋮⋮</div>';

    var markdownText = String(el && el.markdown || '').trim();
    var tileDescription = String(el && el.description || '').trim();
    var dateText = String(el && el.date || '');
    var markerText = String(el && el.marker || '');
    var imageUrl = String(el && el.image_url || '').trim();
    var postUrl = String(el && el.post_url || '').trim();
    var showImageField = isProductGalleryPage();
    var eventId = String(el && el.event_id || '');
    var productReady = entryHasProductBasics(el);
    var productBusy = state.createProductBusyUid === uid;
    var hasProductLink = String(el && el.post_url || '').trim().length > 0;

    html += '<div class="list-inline-cell list-inline-indent-controls">';
    html += '<button type="button" class="list-inline-indent-btn" data-list-inline-action="toggle-depth" data-element-uid="' + escapeHtml(uid) + '" title="' + (guiDepth > 0 ? 'Unindent entry' : 'Indent entry') + '"' + (canToggle ? '' : ' disabled aria-disabled="true"') + '>' + (guiDepth > 0 ? '←' : '→') + '</button>';
    html += '</div>';

    if (active && activeField === 'markdown') {
      html += '<div class="list-inline-cell list-inline-markdown"><input type="text" data-inline-field="markdown" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(markdownText) + '"></div>';
    } else {
      html += '<div role="button" tabindex="0" class="list-inline-cell list-inline-open list-inline-markdown" data-list-inline-action="edit" data-inline-field="markdown" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + (markdownText ? escapeHtml(markdownText) : placeholderHtml('Add text...')) + '</span></div>';
    }
    if (active && activeField === 'post_url') {
      html += '<div class="list-inline-cell list-inline-post-url"><input type="text" data-inline-field="post_url" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(postUrl) + '" placeholder="https://... or /posts/..."></div>';
    } else {
      html += '<div class="list-inline-cell list-inline-post-url"><button type="button" class="list-inline-open list-inline-post-url-button" data-list-inline-action="edit" data-inline-field="post_url" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + (postUrl ? escapeHtml(postUrl) : placeholderHtml('Add post URL...')) + '</span></button></div>';
    }
    if (active && activeField === 'description') {
      html += '<div class="list-inline-cell list-inline-description"><input type="text" data-inline-field="description" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(tileDescription) + '" placeholder="Tiny description..."></div>';
    } else {
      html += '<div class="list-inline-cell list-inline-description"><button type="button" class="list-inline-open list-inline-description-button" data-list-inline-action="edit" data-inline-field="description" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + (tileDescription ? markdownInline(tileDescription) : placeholderHtml('Add description...')) + '</span></button></div>';
    }
    if (active && activeField === 'date') {
      html += '<div class="list-inline-cell list-inline-date"><div class="list-inline-date-shell"><input type="text" data-inline-field="date" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(dateText) + '" placeholder="YYYY / YYYY-MM / YYYY-MM-DD"></div></div>';
    } else {
      html += '<div class="list-inline-cell list-inline-date"><div class="list-inline-date-shell"><button type="button" class="list-inline-open list-inline-date-button" data-list-inline-action="edit" data-inline-field="date" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + (dateText ? escapeHtml(dateText) : placeholderHtml('Add date...')) + '</span></button></div></div>';
    }
    html += '<div class="list-inline-cell list-inline-marker"><input type="text" data-inline-field="marker" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(markerText) + '" placeholder="Marker..."></div>';
    if (showImageField) {
      if (active && activeField === 'image_url') {
        html += '<div class="list-inline-cell list-inline-image-url"><input type="text" data-inline-field="image_url" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(imageUrl) + '" placeholder="/files/<id>/<name> or https://..."></div>';
      } else {
        html += '<div class="list-inline-cell list-inline-image-url"><button type="button" class="list-inline-open list-inline-image-button" data-list-inline-action="edit" data-inline-field="image_url" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + (imageUrl ? escapeHtml(imageUrl) : placeholderHtml('Add image URL...')) + '</span></button></div>';
      }
    }
    html += '<div class="list-inline-cell list-inline-actions">';
    var rowMenuOpen = state.rowMenuOpenUid === uid;
    var eventMenuLabel = eventId ? 'Edit Nostr event_id...' : 'Add Nostr event_id...';
    if (isProductGalleryPage()) {
      html += '<button type="button" data-list-inline-action="create-product" data-element-uid="' + escapeHtml(uid) + '" title="' + (productReady ? (hasProductLink ? 'Update product page from this row' : 'Create product page from this row') : 'Add text first to create a product') + '"' + (productReady && !productBusy ? '' : ' disabled aria-disabled="true"') + '>' + (productBusy ? 'Creating...' : (hasProductLink ? 'Update Product' : 'Create Product')) + '</button>';
      if (hasProductLink) {
        html += '<a class="list-inline-action-link" href="' + escapeHtml(String(el && el.post_url || '')) + '" target="_blank" rel="noopener noreferrer" title="Open product page">↗</a>';
      }
    }
    html += '<div class="list-inline-row-menu-wrap">';
    html += '<button type="button" class="list-inline-row-menu-trigger" data-list-inline-action="toggle-menu" data-element-uid="' + escapeHtml(uid) + '" aria-label="Row actions" aria-haspopup="menu" aria-expanded="' + (rowMenuOpen ? 'true' : 'false') + '">⋮</button>';
    html += '<div class="list-inline-row-menu" role="menu"' + (rowMenuOpen ? '' : ' hidden') + '>';
    html += '<button type="button" role="menuitem" data-list-inline-action="edit-event-id" data-element-uid="' + escapeHtml(uid) + '">' + eventMenuLabel + '</button>';
    html += '<button type="button" role="menuitem" class="list-inline-row-menu-danger" data-list-inline-action="remove" data-element-uid="' + escapeHtml(uid) + '" aria-label="Delete entry"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5h6l.9 1.5H20a1 1 0 1 1 0 2h-1l-.7 11a2 2 0 0 1-2 1.9H7.7a2 2 0 0 1-2-1.9L5 7H4a1 1 0 1 1 0-2h4.1L9 3.5Zm-2 3.5.7 11h8.6L17 7H7Zm2.5 2a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Zm5 0a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z" fill="currentColor"/></svg><span>Delete</span></button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';

    html += '</li>';
    return html;
  }

  function renderInlineEditor(elements) {
    var html = '';
    var groupedModes = ['year', 'first_letter', 'month', 'marker'];
    var isGrouped = groupedModes.indexOf(String(state.draft.group_by || '')) >= 0;
    var pendingUnedited = isPendingNewEntryUnedited();
    var revealSettings = !!state.settingsPanelReveal;
    state.settingsPanelReveal = false;
    var entryElements = (Array.isArray(elements) ? elements : []).filter(function (el) {
      return isEntryType(String(el && el.type || 'entry'));
    });
    var workingElements = entryElements.slice();
    var canUndo = state.undoStack.length > 0;
    var canRedo = state.redoStack.length > 0;
    var addTitle = pendingUnedited ? 'Edit the new entry before adding another' : 'Add entry';
    var groupByTip = 'Choose how entries are grouped in this list.';
    var showMarkersTip = 'Show marker pills on each list item.';
    var alphabetizeMarkersTip = 'Sort marker pills alphabetically on each list item.';
    var showMarkerFiltersTip = 'Show clickable marker pills for filtering.';
    var defaultMarkersTip = 'Comma-delimited markers preselected on page load for all users. Filter changes reset on refresh.';
    html += '<section class="nostr-page-settings-panel' + (revealSettings ? ' is-entering' : '') + '" aria-label="Page settings">';
    html += '<h3 class="nostr-page-settings-title">Page Settings</h3>';
    html += '<div class="list-inline-toolbar">';
    html += '<div class="list-inline-toolbar-left"><div class="list-inline-edit-controls">';
    html += '<label title="' + escapeHtml(groupByTip) + '"><span title="' + escapeHtml(groupByTip) + '">Group by</span><select id="list-admin-group-by" title="' + escapeHtml(groupByTip) + '" aria-label="Group by">';
    html += '<option value=""' + (state.draft.group_by ? '' : ' selected') + '>None</option>';
    html += '<option value="year"' + (state.draft.group_by === 'year' ? ' selected' : '') + '>Year</option>';
    html += '<option value="first_letter"' + (state.draft.group_by === 'first_letter' ? ' selected' : '') + '>First letter</option>';
    html += '<option value="month"' + (state.draft.group_by === 'month' ? ' selected' : '') + '>Month</option>';
    html += '<option value="marker"' + (state.draft.group_by === 'marker' ? ' selected' : '') + '>Marker</option>';
    html += '</select></label>';
    html += '<label class="list-show-markers-setting" title="' + escapeHtml(showMarkersTip) + '"><input type="checkbox" data-list-show-markers="true" title="' + escapeHtml(showMarkersTip) + '"' + (state.draft.show_markers ? ' checked' : '') + '><span title="' + escapeHtml(showMarkersTip) + '">Show markers</span></label>';
    html += '<label class="list-alphabetize-markers-setting' + (state.draft.show_markers ? '' : ' is-disabled') + '" title="' + escapeHtml(alphabetizeMarkersTip) + '"><input type="checkbox" data-list-alphabetize-markers="true" title="' + escapeHtml(alphabetizeMarkersTip) + '"' + (state.draft.alphabetize_markers ? ' checked' : '') + (state.draft.show_markers ? '' : ' disabled aria-disabled="true"') + '><span title="' + escapeHtml(alphabetizeMarkersTip) + '">Alphabetize markers</span></label>';
    html += '<label class="list-marker-filter-setting"><span>Show marker filters</span><input type="checkbox" data-list-show-marker-filters="true" title="' + escapeHtml(showMarkerFiltersTip) + '"' + (state.draft.show_marker_filters ? ' checked' : '') + '></label>';
    html += '<label class="list-default-markers-setting" title="' + escapeHtml(defaultMarkersTip) + '"><span title="' + escapeHtml(defaultMarkersTip) + '">Default markers</span><input type="text" data-list-default-markers="true" title="' + escapeHtml(defaultMarkersTip) + '" value="' + escapeHtml(state.draft.default_markers || '') + '" placeholder="marker one, marker two"></label>';
    html += '</div></div>';
    html += '</div>';
    html += '</section>';
    if (state.draft.show_marker_filters) {
      html += renderMarkerFilters(entryElements, state.draft.default_markers);
      workingElements = applyMarkerFilters(entryElements);
    }

    if (!entryElements.length) {
      html += '<div class="list-inline-empty">No entries yet.</div>';
      html += renderAfterContentEditor();
      return html;
    }
    if (state.draft.show_marker_filters && !workingElements.length) {
      html += '<div class="list-inline-empty">No entries match selected marker filters.</div>';
      html += renderAfterContentEditor();
      return html;
    }

    html += '<div class="list-inline-head">';
    html += '<span class="list-inline-head-history"><span class="list-inline-history-controls" role="group" aria-label="Edit history">' +
      '<button type="button" class="list-inline-history-icon-btn" data-list-action="undo" title="Undo" aria-label="Undo"' + (canUndo ? '' : ' disabled aria-disabled="true"') + '>' + listHistoryIconSvg('undo') + '</button>' +
      '<button type="button" class="list-inline-history-icon-btn" data-list-action="redo" title="Redo" aria-label="Redo"' + (canRedo ? '' : ' disabled aria-disabled="true"') + '>' + listHistoryIconSvg('redo') + '</button>' +
    '</span></span>';
    html += '<span class="list-inline-head-markdown">Text</span>';
    html += '<span class="list-inline-head-post-url">Post URL</span>';
    html += '<span class="list-inline-head-description">Description</span>';
    html += '<span class="list-inline-head-date">Date</span>';
    html += '<span class="list-inline-head-marker">Marker</span>';
    if (isProductGalleryPage()) {
      html += '<span class="list-inline-head-image">Image URL</span>';
    }
    html += '<span class="list-inline-head-actions"><button type="button" class="list-inline-head-add" data-list-action="add" title="' + escapeHtml(addTitle) + '">+</button></span>';
    html += '</div>';

    if (isGrouped) {
      var currentLabel = '__none__';
      var groupOpen = false;
      workingElements.forEach(function (el) {
        var label = groupLabelForEntry(el, state.draft.group_by);
        if (label !== currentLabel) {
          if (groupOpen) {
            html += '</ul></section>';
          }
          currentLabel = label;
          groupOpen = true;
          html += '<section class="list-year-group">';
          html += '<div class="list-year-head">';
          html += '<h3 class="list-year-heading">' + escapeHtml(label || 'Unknown') + '</h3>';
          if (state.draft.group_by === 'year') {
            var prefillYear = (/^\d{4}$/.test(String(label || '')) ? String(label || '') : '');
            html += '<button type="button" class="list-year-add" data-list-action="add-year" data-prefill-year="' + escapeHtml(prefillYear) + '" data-section-label="' + escapeHtml(String(label || 'Unknown')) + '" title="' + escapeHtml(pendingUnedited ? 'Edit the new entry before adding another' : ('Add entry for ' + (prefillYear || 'this year section'))) + '">+</button>';
          }
          html += '</div>';
          html += '<ul class="list-entries list-entries-inline">';
        }
        html += renderElementInline(el);
      });
      if (groupOpen) {
        html += '</ul></section>';
      }
    } else {
      html += '<ul class="list-entries list-entries-inline">';
      workingElements.forEach(function (el) {
        html += renderElementInline(el);
      });
      html += '</ul>';
    }
    html += '<div class="list-inline-add-end-row"><button type="button" class="list-inline-add-end" data-list-action="add-end" title="' + escapeHtml(addTitle) + '">Add entry...</button></div>';
    html += renderAfterContentEditor();
    return html;
  }

  function renderList() {
    renderHead();

    if (!els.content) {
      return;
    }

    var s = getRenderState();
    var elements = Array.isArray(s.elements) ? s.elements : [];
    var afterContent = renderExtraContent(s.extras_after, s.extras_after_format, 'after');
    var inlineMode = isAdmin() && state.editMode;
    if (root && root.classList) {
      root.classList.toggle('is-editing', inlineMode);
    }
    if (document.body && document.body.classList) {
      document.body.classList.add('list-page-width-anim');
      document.body.classList.toggle('list-page-wide', inlineMode);
    }

    if (!elements.length) {
      if (inlineMode) {
        els.content.innerHTML = renderInlineEditor([]) + afterContent;
      } else {
        els.content.innerHTML = '<p class="list-page-empty-state">No content yet.</p>' + afterContent;
      }
      renderAdmin();
      return;
    }

    if (inlineMode) {
      els.content.innerHTML = renderInlineEditor(elements) + afterContent;
      renderAdmin();
      return;
    }

    var readViewMode = currentReadViewMode(s);
    els.content.innerHTML = renderGroupByReadOnly(elements.filter(function (el) {
      return isEntryType(String(el && el.type || 'entry'));
    }), s.group_by, readViewMode, !!s.show_marker_filters, !!s.show_markers, !!s.alphabetize_markers, s.default_markers) + afterContent;
    refreshProductCartButtons();
    renderAdmin();
  }

  function renderValidation() {
    if (!els.validation) {
      return;
    }
    var v = (state.payload && state.payload.validation) ? state.payload.validation : {};
    var errors = (Array.isArray(v.errors) ? v.errors : []).filter(function (msg) {
      var text = String(msg || '').trim().toLowerCase();
      if (!text) {
        return false;
      }
      return !(/could not validate .*state/.test(text) || /validation .*temporarily unavailable/.test(text));
    });
    var warnings = (Array.isArray(v.warnings) ? v.warnings : []).filter(function (msg) {
      var text = String(msg || '').trim().toLowerCase();
      if (!text) {
        return false;
      }
      return !(/could not validate .*state/.test(text) || /validation .*temporarily unavailable/.test(text));
    });
    if (!errors.length && !warnings.length) {
      els.validation.hidden = true;
      els.validation.innerHTML = '';
      return;
    }
    var html = '';
    if (errors.length) {
      html += '<div class="list-validation-block is-error"><strong>Validation errors</strong><ul>';
      errors.forEach(function (msg) {
        html += '<li>' + escapeHtml(msg) + '</li>';
      });
      html += '</ul></div>';
    }
    if (warnings.length) {
      html += '<div class="list-validation-block is-warn"><strong>Validation warnings</strong><ul>';
      warnings.forEach(function (msg) {
        html += '<li>' + escapeHtml(msg) + '</li>';
      });
      html += '</ul></div>';
    }
    els.validation.hidden = false;
    els.validation.innerHTML = html;
  }

  function renderAdmin() {
    if (!els.admin) {
      return;
    }
    if (!isAdmin()) {
      if (state.saveTimer) {
        clearTimeout(state.saveTimer);
        state.saveTimer = null;
      }
      els.admin.hidden = true;
      els.admin.innerHTML = '';
      return;
    }

    var hasCanonical = !!state.payload.canonical_exists;
    var hasDraftChanges = !!state.payload.draft_differs;
    var showRevert = !!state.editMode;
    var showPublish = !!state.editMode || hasDraftChanges;
    var canRevert = hasCanonical && hasDraftChanges;
    var revertTitle = canRevert
      ? 'Revert draft to Nostr version'
      : (hasCanonical ? 'No local changes to revert' : 'No Nostr version found');

    var actionsHost = document.getElementById('list-page-title-actions');
    var html = '';
    html += '<span class="list-page-admin-bar">';
    if (state.saveIndicatorVisible) {
      html += '<span id="list-admin-save-status" class="list-admin-save-status" aria-live="polite">';
      if (state.saveStatus === 'saving') {
        html += '<span class="save-spinner" aria-hidden="true"></span>Saving...';
      } else if (state.saveStatus === 'error') {
        html += 'Save failed';
      } else {
        html += 'Saved';
      }
      html += '</span>';
    }
    if (showRevert) {
      html += '<button type="button" data-list-action="revert" title="' + escapeHtml(revertTitle) + '"' + (canRevert ? '' : ' disabled aria-disabled="true"') + '>Revert</button>';
    }
    if (showPublish) {
      html += '<button type="button" class="list-admin-primary-btn" data-list-action="publish">Publish to Nostr...</button>';
    }
    html += '<button type="button" class="list-admin-primary-btn" data-list-action="toggle-edit">' + (state.editMode ? 'Done' : 'Edit') + '</button>';
    html += '</span>';
    if (actionsHost) {
      actionsHost.innerHTML = html;
    }
    els.admin.hidden = true;
    els.admin.innerHTML = '';
  }

  function saveNavbarTitle() {
    if (!isAdmin() || state.navTitleBusy) {
      return Promise.resolve(false);
    }
    var input = root.querySelector('[data-page-nav-title-input="true"]');
    if (input instanceof HTMLInputElement) {
      state.navTitleInput = String(input.value || '');
    }
    var nextTitle = String(state.navTitleInput || '').trim();
    state.navTitleBusy = true;
    var auth = getAuthPayload();
    return apiPost('/cgi/blog-update-nostr-page-nav-title', {
      page_slug: slug,
      nav_title: nextTitle,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      var updated = String((data && data.nav_title) || nextTitle || defaultNavbarTitle()).trim();
      state.navTitle = updated;
      state.navTitleEditing = false;
      state.navTitleInput = '';
      if (state.payload && typeof state.payload === 'object') {
        state.payload.nav_title = updated;
      }
      try {
        window.dispatchEvent(new CustomEvent('wizardry-navbar-refresh-request'));
      } catch (_err) {
        // Ignore navbar refresh dispatch failures.
      }
      renderHead();
      return true;
    }).catch(function (err) {
      window.alert(err && err.message ? err.message : 'Could not save navbar title');
      return false;
    }).finally(function () {
      state.navTitleBusy = false;
      renderHead();
    });
  }

  function focusInlineField(uid, field) {
    var targetUid = String(uid || '');
    var targetField = String(field || '');
    if (!targetUid || !targetField || !els.content) {
      return;
    }
    requestAnimationFrame(function () {
      var selector = '[data-inline-field="' + targetField + '"][data-element-uid="' + targetUid + '"]';
      var nextInput = els.content.querySelector(selector);
      if (nextInput && typeof nextInput.focus === 'function') {
        nextInput.focus();
        if (nextInput instanceof HTMLInputElement && typeof nextInput.select === 'function') {
          nextInput.select();
        }
      }
    });
  }

  function closeActiveInlineEditor(options) {
    if ((!state.editMode && !isReadInlineEditing()) || !isAdmin()) {
      return false;
    }
    var opts = options || {};
    var readInline = isReadInlineEditing();
    var activeUid = readInline ? String(state.readInlineEditUid || '') : String(state.activeEntryUid || '');
    var activeField = readInline ? String(state.readInlineEditField || '') : String(state.activeCellField || '');
    if (!activeUid && !activeField) {
      return false;
    }
    updatePendingNewEntryState();
    var shouldSave = !!opts.forceAutosave;
    if (activeUid && shouldAutosaveForUid(activeUid)) {
      shouldSave = true;
    }
    var removedTransient = pruneTransientEntries();
    if (removedTransient) {
      shouldSave = true;
    }
    if (readInline) {
      state.readInlineEditUid = '';
      state.readInlineEditField = '';
    } else {
      state.activeEntryUid = '';
      state.activeCellField = '';
      state.historyCellEditKey = '';
    }
    renderList();
    renderAdmin();
    if (shouldSave && !opts.skipAutosave) {
      queueAutosave(Number(opts.delayMs) > 0 ? Number(opts.delayMs) : 120);
    }
    return true;
  }

  function historySignature(elements) {
    return JSON.stringify((Array.isArray(elements) ? elements : []).map(function (el) {
      return {
        _uid: String(el && el._uid || ''),
        type: String(el && el.type || 'entry'),
        event_id: String(el && el.event_id || ''),
        relay_hint: String(el && el.relay_hint || ''),
        marker: String(el && el.marker || ''),
        date: String(el && el.date || ''),
        depth: Math.max(0, Number(el && el.depth || 0) || 0),
        markdown: String(el && el.markdown || ''),
        image_url: String(el && el.image_url || ''),
        description: String(el && el.description || ''),
        post_url: String(el && el.post_url || '')
      };
    }));
  }

  function historyRecordFromElements(elements) {
    var snapshot = cloneEditableElements(elements || []);
    return {
      elements: snapshot,
      signature: historySignature(snapshot)
    };
  }

  function resetInlineHistory() {
    state.undoStack = [];
    state.redoStack = [];
    state.historyCellEditKey = '';
  }

  function pushUndoHistoryFromElements(elements) {
    if (!isAdmin() || !state.editMode || !state.draft) {
      return false;
    }
    var record = historyRecordFromElements(elements);
    var last = state.undoStack.length ? state.undoStack[state.undoStack.length - 1] : null;
    if (last && last.signature === record.signature) {
      return false;
    }
    state.undoStack.push(record);
    if (state.undoStack.length > 120) {
      state.undoStack.shift();
    }
    state.redoStack = [];
    return true;
  }

  function pushUndoHistorySnapshot() {
    return pushUndoHistoryFromElements(state.draft && state.draft.elements ? state.draft.elements : []);
  }

  function pushRedoHistorySnapshotFromCurrent() {
    var record = historyRecordFromElements(state.draft && state.draft.elements ? state.draft.elements : []);
    var last = state.redoStack.length ? state.redoStack[state.redoStack.length - 1] : null;
    if (last && last.signature === record.signature) {
      return;
    }
    state.redoStack.push(record);
    if (state.redoStack.length > 120) {
      state.redoStack.shift();
    }
  }

  function applyHistoryRecord(record) {
    if (!record || !Array.isArray(record.elements) || !state.draft) {
      return false;
    }
    state.draft.elements = cloneEditableElements(record.elements);
    state.activeEntryUid = '';
    state.activeCellField = '';
    state.readInlineEditUid = '';
    state.readInlineEditField = '';
    state.rowMenuOpenUid = '';
    state.pendingNewEntry = null;
    state.historyCellEditKey = '';
    updatePendingNewEntryState();
    renderList();
    renderAdmin();
    queueAutosave(120);
    return true;
  }

  function undoInlineEdit() {
    if (!state.editMode || !isAdmin() || !state.undoStack.length) {
      return false;
    }
    pushRedoHistorySnapshotFromCurrent();
    var previous = state.undoStack.pop();
    return applyHistoryRecord(previous);
  }

  function redoInlineEdit() {
    if (!state.editMode || !isAdmin() || !state.redoStack.length) {
      return false;
    }
    var current = historyRecordFromElements(state.draft && state.draft.elements ? state.draft.elements : []);
    var undoLast = state.undoStack.length ? state.undoStack[state.undoStack.length - 1] : null;
    if (!undoLast || undoLast.signature !== current.signature) {
      state.undoStack.push(current);
      if (state.undoStack.length > 120) {
        state.undoStack.shift();
      }
    }
    var next = state.redoStack.pop();
    return applyHistoryRecord(next);
  }

  function bindAdminEvents() {
    if (!els.admin || !els.content) {
      return;
    }

    root.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element) || !isAdmin()) {
        return;
      }
      var navTitleActionNode = target.closest('[data-page-nav-title-action]');
      if (navTitleActionNode instanceof HTMLElement && state.editMode) {
        event.preventDefault();
        var navTitleAction = String(navTitleActionNode.getAttribute('data-page-nav-title-action') || '');
        if (navTitleAction === 'edit') {
          state.navTitleEditing = true;
          state.navTitleInput = currentNavbarTitle();
          renderHead();
          return;
        }
        if (navTitleAction === 'save') {
          saveNavbarTitle();
          return;
        }
      }

      var topAction = target.closest('[data-list-action]');
      if (topAction instanceof HTMLElement) {
        var topActionName = topAction.getAttribute('data-list-action');
        if (topActionName === 'undo' && state.editMode) {
          undoInlineEdit();
          return;
        }
        if (topActionName === 'redo' && state.editMode) {
          redoInlineEdit();
          return;
        }
        if (topActionName === 'toggle-edit') {
          if (state.editMode) {
            requestExitEditModeWithSave();
            return;
          }
          state.editMode = true;
          state.settingsPanelReveal = true;
          state.pendingToggleEditOff = false;
          state.activeHeadField = '';
          state.readInlineEditUid = '';
          state.readInlineEditField = '';
          resetInlineHistory();
          renderList();
          renderAdmin();
          return;
        }
        if (topActionName === 'publish') {
          publishDraft();
          return;
        }
        if (topActionName === 'revert') {
          if (topAction.disabled) {
            return;
          }
          revertDraft();
          return;
        }
      }

      var headEdit = target.closest('[data-list-head-edit]');
      if (headEdit instanceof HTMLElement) {
        var field = headEdit.getAttribute('data-list-head-edit');
        if (field === 'title' || field === 'description') {
          state.activeHeadField = field;
          renderList();
          renderAdmin();
          return;
        }
      }

      var headSave = target.closest('[data-list-head-save]');
      if (headSave instanceof HTMLElement) {
        var saveField = String(headSave.getAttribute('data-list-head-save') || '');
        if (saveField === 'description') {
          persistDraft({ alertOnError: true }).then(function (ok) {
            if (ok !== false) {
              state.activeHeadField = '';
              renderList();
              renderAdmin();
            }
          });
          return;
        }
      }

      var headDone = target.closest('[data-list-head-done]');
      if (headDone instanceof HTMLElement) {
        state.activeHeadField = '';
        renderList();
        renderAdmin();
        return;
      }

      var listAction = target.closest('[data-list-action]');
      if (listAction instanceof HTMLElement && state.editMode) {
        var action = listAction.getAttribute('data-list-action');
        if (action === 'add') {
          if (isPendingNewEntryUnedited()) {
            var pendingUid = String(state.pendingNewEntry && state.pendingNewEntry.uid || '');
            if (pendingUid) {
              if (isEntryRowVisibleInInlineEditor(pendingUid)) {
                focusInlineField(pendingUid, 'markdown');
                return;
              }
              var pendingIdx = findElementIndex(pendingUid);
              if (pendingIdx >= 0) {
                state.draft.elements.splice(pendingIdx, 1);
              }
            }
            state.pendingNewEntry = null;
            renderList();
            renderAdmin();
          }
          if (isPendingNewEntryUnedited()) {
            return;
          }
          pushUndoHistorySnapshot();
          var before = captureEntryRects();
          var newUid = addEntry('', { insertIndex: firstEntryInsertIndex() });
          renderListWithFlip(before);
          ensureEntryVisibleAfterAdd(newUid, before);
          return;
        }
        if (action === 'add-year') {
          if (isPendingNewEntryUnedited()) {
            var yearPendingUid = String(state.pendingNewEntry && state.pendingNewEntry.uid || '');
            if (yearPendingUid) {
              if (isEntryRowVisibleInInlineEditor(yearPendingUid)) {
                focusInlineField(yearPendingUid, 'markdown');
                return;
              }
              var yearPendingIdx = findElementIndex(yearPendingUid);
              if (yearPendingIdx >= 0) {
                state.draft.elements.splice(yearPendingIdx, 1);
              }
            }
            state.pendingNewEntry = null;
            renderList();
            renderAdmin();
          }
          if (isPendingNewEntryUnedited()) {
            return;
          }
          pushUndoHistorySnapshot();
          var prefill = String(listAction.getAttribute('data-prefill-year') || '').trim();
          var sectionLabel = String(listAction.getAttribute('data-section-label') || '').trim();
          var beforeYear = captureEntryRects();
          var yearUid = addEntry(prefill, { insertIndex: endOfYearSectionInsertIndex(sectionLabel || prefill || 'Unknown') });
          renderListWithFlip(beforeYear);
          ensureEntryVisibleAfterAdd(yearUid, beforeYear);
          return;
        }
        if (action === 'add-end') {
          if (isPendingNewEntryUnedited()) {
            var endPendingUid = String(state.pendingNewEntry && state.pendingNewEntry.uid || '');
            if (endPendingUid) {
              if (isEntryRowVisibleInInlineEditor(endPendingUid)) {
                focusInlineField(endPendingUid, 'markdown');
                return;
              }
              var endPendingIdx = findElementIndex(endPendingUid);
              if (endPendingIdx >= 0) {
                state.draft.elements.splice(endPendingIdx, 1);
              }
            }
            state.pendingNewEntry = null;
            renderList();
            renderAdmin();
          }
          if (isPendingNewEntryUnedited()) {
            return;
          }
          pushUndoHistorySnapshot();
          var beforeEnd = captureEntryRects();
          var endUid = addEntry('', { insertIndex: endEntryInsertIndex() });
          renderListWithFlip(beforeEnd);
          ensureEntryVisibleAfterAdd(endUid, beforeEnd);
          return;
        }
      }

      if (!state.editMode) {
        var readMenuAction = target.closest('[data-list-read-action]');
        if (readMenuAction instanceof HTMLElement) {
          event.preventDefault();
          var readActionType = String(readMenuAction.getAttribute('data-list-read-action') || '');
          var readUid = String(readMenuAction.getAttribute('data-element-uid') || '');
          if (!readUid) {
            return;
          }
          if (readActionType === 'toggle-menu') {
            state.readRowMenuOpenUid = state.readRowMenuOpenUid === readUid ? '' : readUid;
            renderList();
            return;
          }
          if (readActionType === 'edit-row') {
            state.readRowMenuOpenUid = '';
            state.readInlineEditUid = readUid;
            state.readInlineEditField = 'markdown';
            state.activeEntryUid = '';
            state.activeCellField = '';
            state.historyCellEditKey = '';
            renderList();
            renderAdmin();
            focusInlineField(readUid, 'markdown');
            return;
          }
          if (readActionType === 'finish-row') {
            closeActiveInlineEditor({ forceAutosave: true, skipAutosave: true });
            persistDraft({ alertOnError: true });
            return;
          }
          if (readActionType === 'remove-row') {
            var removeIdx = findElementIndex(readUid);
            if (removeIdx < 0) {
              return;
            }
            state.readRowMenuOpenUid = '';
            var beforeRemoveRead = captureEntryRects();
            state.draft.elements.splice(removeIdx, 1);
            if (state.activeEntryUid === readUid) {
              state.activeEntryUid = '';
              state.activeCellField = '';
            }
            if (state.readInlineEditUid === readUid) {
              state.readInlineEditUid = '';
              state.readInlineEditField = '';
            }
            if (state.pendingNewEntry && state.pendingNewEntry.uid === readUid) {
              state.pendingNewEntry = null;
            }
            renderListWithFlip(beforeRemoveRead);
            queueAutosave(120);
            return;
          }
        }
        if (state.readRowMenuOpenUid && (!target.closest || !target.closest('.list-entry-read-menu'))) {
          state.readRowMenuOpenUid = '';
          renderList();
          return;
        }
        return;
      }

      var inlineAction = target.closest('[data-list-inline-action]');
      if (inlineAction instanceof HTMLElement) {
        var actionType = inlineAction.getAttribute('data-list-inline-action');
        var uid = String(inlineAction.getAttribute('data-element-uid') || '');
        if (!uid) {
          return;
        }
        if (actionType === 'edit') {
          event.preventDefault();
          state.rowMenuOpenUid = '';
          state.activeEntryUid = uid;
          state.activeCellField = String(inlineAction.getAttribute('data-inline-field') || '');
          state.historyCellEditKey = '';
          renderList();
          focusInlineField(uid, state.activeCellField);
          return;
        }
        if (actionType === 'toggle-menu') {
          event.preventDefault();
          state.rowMenuOpenUid = state.rowMenuOpenUid === uid ? '' : uid;
          renderList();
          return;
        }
        if (actionType === 'edit-event-id') {
          event.preventDefault();
          var eventIdx = findElementIndex(uid);
          if (eventIdx < 0) {
            return;
          }
          var currentEventId = String(state.draft.elements[eventIdx].event_id || '');
          var nextEventId = window.prompt('Nostr event_id', currentEventId);
          state.rowMenuOpenUid = '';
          if (nextEventId === null) {
            renderList();
            return;
          }
          pushUndoHistorySnapshot();
          state.draft.elements[eventIdx].event_id = String(nextEventId || '').trim();
          if (state.draft.elements[eventIdx].event_id) {
            state.draft.elements[eventIdx].post_url = '';
          }
          updatePendingNewEntryState();
          renderList();
          if (shouldAutosaveForUid(uid)) {
            queueAutosave(180);
          }
          return;
        }
        if (actionType === 'create-product') {
          event.preventDefault();
          if (inlineAction.hasAttribute('disabled')) {
            return;
          }
          createProductFromEntry(uid);
          return;
        }
        if (actionType === 'remove') {
          var idx = findElementIndex(uid);
          if (idx < 0) {
            return;
          }
          pushUndoHistorySnapshot();
          var beforeRemove = captureEntryRects();
          state.draft.elements.splice(idx, 1);
          if (state.rowMenuOpenUid === uid) {
            state.rowMenuOpenUid = '';
          }
          if (state.activeEntryUid === uid) {
            state.activeEntryUid = '';
            state.activeCellField = '';
          }
          if (state.readInlineEditUid === uid) {
            state.readInlineEditUid = '';
            state.readInlineEditField = '';
          }
          if (state.pendingNewEntry && state.pendingNewEntry.uid === uid) {
            state.pendingNewEntry = null;
          }
          renderListWithFlip(beforeRemove);
          queueAutosave(120);
          return;
        }
        if (actionType === 'toggle-depth') {
          if (inlineAction.hasAttribute('disabled')) {
            return;
          }
          var depthIdx = findElementIndex(uid);
          if (depthIdx < 0) {
            return;
          }
          pushUndoHistorySnapshot();
          var beforeDepth = captureEntryRects();
          var currentDepth = Math.max(0, Number(state.draft.elements[depthIdx].depth || 0) || 0);
          if (currentDepth > 0) {
            state.draft.elements[depthIdx].depth = currentDepth - 1;
          } else if (depthIdx > 0) {
            var prevDepth = Math.max(0, Number(state.draft.elements[depthIdx - 1].depth || 0) || 0);
            state.draft.elements[depthIdx].depth = Math.min(currentDepth + 1, prevDepth + 1);
          }
          renderListWithFlip(beforeDepth);
          updatePendingNewEntryState();
          if (shouldAutosaveForUid(uid)) {
            queueAutosave(120);
          }
          return;
        }
      }
    });

    els.content.addEventListener('mousedown', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (state.rowMenuOpenUid && !target.closest('.list-inline-row-menu-wrap')) {
        state.rowMenuOpenUid = '';
        renderList();
        return;
      }
      var row = target.closest('.list-entry-inline[data-element-uid]');
      state.pointerDownEntryUid = row ? String(row.getAttribute('data-element-uid') || '') : '';
      state.pointerDownAt = Date.now();
    });

    root.addEventListener('input', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || !isAdmin()) {
        return;
      }
      if (target.hasAttribute('data-page-nav-title-input') && state.editMode) {
        state.navTitleInput = String(target.value || '');
        return;
      }
      var headField = String(target.getAttribute('data-head-input') || '');
      if (!headField) {
        return;
      }
      if (headField === 'title') {
        state.draft.title = String(target.value || '');
        queueAutosave(500);
      } else if (headField === 'description') {
        state.draft.description = String(target.value || '');
      }
    });

    root.addEventListener('keydown', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || !isAdmin()) {
        return;
      }
      if (target.hasAttribute('data-page-nav-title-input')) {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveNavbarTitle();
        }
        return;
      }
      var headField = String(target.getAttribute('data-head-input') || '');
      if (!headField) {
        return;
      }
      if (event.key === 'Enter') {
        if (headField === 'description' && target instanceof HTMLTextAreaElement) {
          return;
        }
        event.preventDefault();
        if (headField === 'description') {
          persistDraft({ alertOnError: true }).then(function (ok) {
            if (ok !== false) {
              state.activeHeadField = '';
              renderList();
              renderAdmin();
            }
          });
        } else {
          state.activeHeadField = '';
          renderList();
          renderAdmin();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        state.activeHeadField = '';
        renderList();
        renderAdmin();
      }
    });

    root.addEventListener('focusout', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement) || !isAdmin()) {
        return;
      }
      var headField = String(target.getAttribute('data-head-input') || '');
      if (!headField) {
        return;
      }
      if (headField === 'description') {
        return;
      }
      setTimeout(function () {
        if (!document.activeElement || !document.activeElement.hasAttribute || !document.activeElement.hasAttribute('data-head-input')) {
          state.activeHeadField = '';
          renderList();
          renderAdmin();
        }
      }, 0);
    });

    els.content.addEventListener('input', function (event) {
      var readInline = isReadInlineEditing();
      if ((!state.editMode && !readInline) || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (target instanceof HTMLTextAreaElement) {
        if (readInline) {
          return;
        }
        if (target.hasAttribute('data-list-intro')) {
          state.draft.description = String(target.value || '');
          renderHead();
          queueAutosave(500);
          return;
        }
        var outroField = String(target.getAttribute('data-list-outro') || '');
        if (outroField === 'after') {
          state.draft.extras_after = String(target.value || '');
          queueAutosave(500);
        }
        return;
      }
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }
      if (readInline && !(target instanceof HTMLInputElement)) {
        return;
      }
      if (readInline && target.getAttribute('data-element-uid') !== state.readInlineEditUid) {
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-list-default-markers')) {
        if (readInline) {
          return;
        }
        state.draft.default_markers = String(target.value || '');
        queueAutosave(500);
        return;
      }
      var uid = String(target.getAttribute('data-element-uid') || '');
      var field = String(target.getAttribute('data-inline-field') || '');
      if (!uid || !field) {
        return;
      }
      var idx = findElementIndex(uid);
      if (idx < 0) {
        return;
      }
      state.activeEntryUid = uid;
      if (readInline) {
        state.readInlineEditField = field;
      }
      var editKey = uid + ':' + field;
      if (state.editMode && state.historyCellEditKey !== editKey) {
        pushUndoHistorySnapshot();
        state.historyCellEditKey = editKey;
      }
      state.draft.elements[idx][field] = String(target.value || '');
      if (field === 'post_url' && String(state.draft.elements[idx].post_url || '').trim()) {
        state.draft.elements[idx].event_id = '';
      }
      updatePendingNewEntryState();
      if (shouldAutosaveForUid(uid)) {
        queueAutosave(500);
      }
    });

    els.content.addEventListener('change', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.id === 'list-admin-group-by' && target instanceof HTMLSelectElement) {
        var beforeGroupBy = captureEntryRects();
        state.draft.group_by = String(target.value || '').trim();
        renderListWithFlip(beforeGroupBy);
        queueAutosave(280);
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-list-show-marker-filters')) {
        state.draft.show_marker_filters = !!target.checked;
        if (!state.draft.show_marker_filters) {
          state.markerFilterInclude = [];
          state.markerFilterExclude = [];
          state.markerFilterInitialized = false;
        } else {
          state.markerFilterInitialized = false;
        }
        renderList();
        queueAutosave(280);
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-list-show-markers')) {
        state.draft.show_markers = !!target.checked;
        renderList();
        queueAutosave(280);
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-list-alphabetize-markers')) {
        var enablingAlphabetize = !!target.checked && !state.draft.alphabetize_markers;
        state.draft.alphabetize_markers = !!target.checked;
        if (enablingAlphabetize) {
          var shouldAlphabetizeExisting = window.confirm('Alphabetize existing marker values in all rows now?');
          if (shouldAlphabetizeExisting) {
            alphabetizeAllEntryMarkersInDraft();
          }
        }
        renderList();
        queueAutosave(280);
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-list-default-markers')) {
        state.draft.default_markers = normalizeMarkerListText(target.value || '');
        target.value = state.draft.default_markers;
        state.markerFilterInclude = [];
        state.markerFilterExclude = [];
        state.markerFilterInitialized = false;
        renderList();
        queueAutosave(280);
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-list-intro-publish')) {
        state.draft.publish_intro_to_nostr = !!target.checked;
        queueAutosave(500);
        return;
      }

      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }
      var uid = String(target.getAttribute('data-element-uid') || '');
      var field = String(target.getAttribute('data-inline-field') || '');
      if (!uid || !field) {
        return;
      }
      var idx = findElementIndex(uid);
      if (idx < 0) {
        return;
      }
      state.draft.elements[idx][field] = String(target.value || '');
      if (field === 'marker') {
        state.draft.elements[idx][field] = normalizeMarkerListForDisplay(state.draft.elements[idx][field], !!state.draft.alphabetize_markers);
        if (target.value !== state.draft.elements[idx][field]) {
          target.value = state.draft.elements[idx][field];
        }
      }
      updatePendingNewEntryState();
      if (field === 'date') {
        var beforeDate = captureEntryRects();
        moveEntryByYear(uid);
        renderListWithFlip(beforeDate);
      }
      if (shouldAutosaveForUid(uid)) {
        queueAutosave(500);
      }
    });

    els.content.addEventListener('contextmenu', function (event) {
      if (state.editMode || !event.target) {
        return;
      }
      var target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('[data-marker-filter-action="toggle"]')) {
        event.preventDefault();
      }
    });

    els.content.addEventListener('click', function (event) {
      if (!event.target) {
        return;
      }
      var target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      var filterButton = target.closest('[data-marker-filter-action="toggle"]');
      if (filterButton instanceof HTMLElement) {
        event.preventDefault();
        var marker = String(filterButton.getAttribute('data-marker-filter-value') || '').trim();
        if (!marker) {
          return;
        }
        var include = Array.isArray(state.markerFilterInclude) ? state.markerFilterInclude.slice() : [];
        var exclude = Array.isArray(state.markerFilterExclude) ? state.markerFilterExclude.slice() : [];
        var isCtrlToggle = !!event.ctrlKey;
        var isIncludeMulti = !!(event.metaKey || event.shiftKey);

        if (isCtrlToggle) {
          include = include.filter(function (item) { return item !== marker; });
          if (exclude.indexOf(marker) >= 0) {
            exclude = exclude.filter(function (item) { return item !== marker; });
          } else {
            exclude.push(marker);
          }
        } else if (isIncludeMulti) {
          exclude = exclude.filter(function (item) { return item !== marker; });
          if (include.indexOf(marker) >= 0) {
            include = include.filter(function (item) { return item !== marker; });
          } else {
            include.push(marker);
          }
        } else {
          exclude = exclude.filter(function (item) { return item !== marker; });
          if (include.length === 1 && include[0] === marker) {
            include = [];
          } else {
            include = [marker];
          }
        }

        state.markerFilterInclude = include;
        state.markerFilterExclude = exclude;
        state.markerFilterInitialized = true;
        renderList();
        return;
      }
      if (state.editMode) {
        return;
      }
      var cartButton = target.closest('[data-add-product-slug]');
      if (cartButton instanceof HTMLElement) {
        event.preventDefault();
        var cartSlug = String(cartButton.getAttribute('data-add-product-slug') || '').trim();
        if (cartSlug) {
          addProductToCartBySlug(cartSlug);
        }
        return;
      }
      var viewButton = target.closest('[data-list-view-mode]');
      if (viewButton instanceof HTMLElement) {
        event.preventDefault();
        var nextMode = normalizeViewMode(viewButton.getAttribute('data-list-view-mode') || '');
        state.viewModeOverride = nextMode;
        saveProductGalleryViewOverride(nextMode);
        renderList();
        return;
      }
    });

    els.content.addEventListener('focusout', function (event) {
      var readInline = isReadInlineEditing();
      if ((!state.editMode && !readInline) || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (!target.matches('[data-inline-field]')) {
        return;
      }
      var uid = String(target.getAttribute('data-element-uid') || '');
      var activeUid = readInline ? String(state.readInlineEditUid || '') : String(state.activeEntryUid || '');
      if (!uid || uid !== activeUid) {
        return;
      }
      setTimeout(function () {
        if (Date.now() < Number(state.tabNavigationUntil || 0)) {
          return;
        }
        var activeEl = document.activeElement;
        if (!(activeEl instanceof HTMLElement)) {
          closeActiveInlineEditor({ forceAutosave: true, delayMs: 120 });
          return;
        }
        var pointerIsSameRow = state.pointerDownEntryUid === uid && (Date.now() - Number(state.pointerDownAt || 0)) < 600;
        if (pointerIsSameRow) {
          return;
        }
        var sameRow = activeEl.closest('.list-entry-inline[data-element-uid], .list-entry-read-inline[data-element-uid]');
        var sameUid = sameRow ? String(sameRow.getAttribute('data-element-uid') || '') : '';
        if (sameUid === uid) {
          return;
        }
        var nextInlineField = activeEl.closest('[data-inline-field][data-element-uid]');
        if (!nextInlineField) {
          closeActiveInlineEditor({ forceAutosave: true, delayMs: 120 });
        }
      }, 0);
    });

    els.content.addEventListener('keydown', function (event) {
      if ((!state.editMode && !isReadInlineEditing()) || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return;
      }
      var uid = String(target.getAttribute('data-element-uid') || '');
      var field = String(target.getAttribute('data-inline-field') || '');
      if (!uid || !field) {
        return;
      }
      if (event.key === 'Enter') {
        if (target instanceof HTMLTextAreaElement) {
          return;
        }
        event.preventDefault();
        closeActiveInlineEditor({ forceAutosave: true, delayMs: 120 });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActiveInlineEditor({ forceAutosave: false, delayMs: 120 });
      }
    });

    els.content.addEventListener('keydown', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var inlineAction = target.closest('[data-list-inline-action="edit"]');
      if (!(inlineAction instanceof HTMLElement)) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        inlineAction.click();
      }
    });

    els.content.addEventListener('keydown', function (event) {
      if (!state.editMode || !isAdmin() || event.key !== 'Tab') {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      var uid = String(target.getAttribute('data-element-uid') || '');
      var field = String(target.getAttribute('data-inline-field') || '');
      if (!uid || !field) {
        return;
      }
      var rowNodes = Array.prototype.slice.call(els.content.querySelectorAll('.list-entry-inline[data-element-uid]'));
      if (!rowNodes.length) {
        return;
      }
      var rowUids = rowNodes.map(function (row) {
        return String(row.getAttribute('data-element-uid') || '');
      });
      var rowIdx = rowUids.indexOf(uid);
      if (rowIdx < 0) {
        return;
      }

      var nextUid = uid;
      var nextField = field;
      var backward = !!event.shiftKey;

      var hasImageField = isProductGalleryPage();
      if (field === 'markdown') {
        if (backward) {
          nextUid = rowUids[(rowIdx - 1 + rowUids.length) % rowUids.length] || uid;
          nextField = hasImageField ? 'image_url' : 'marker';
        } else {
          nextField = 'description';
        }
      } else if (field === 'description') {
        if (backward) {
          nextField = 'markdown';
        } else {
          nextField = 'date';
        }
      } else if (field === 'date') {
        if (backward) {
          nextField = 'description';
        } else {
          nextField = 'marker';
        }
      } else if (field === 'marker') {
        if (backward) {
          nextField = 'date';
        } else {
          if (hasImageField) {
            nextField = 'image_url';
          } else {
            nextUid = rowUids[(rowIdx + 1) % rowUids.length] || uid;
            nextField = 'markdown';
          }
        }
      } else if (field === 'image_url') {
        if (backward) {
          nextField = 'marker';
        } else {
          nextUid = rowUids[(rowIdx + 1) % rowUids.length] || uid;
          nextField = 'markdown';
        }
      } else {
        return;
      }

      event.preventDefault();
      state.tabNavigationUntil = Date.now() + 320;
      state.activeEntryUid = nextUid;
      state.activeCellField = nextField;
      renderList();
      renderAdmin();
      focusInlineField(nextUid, nextField);
    });

    els.content.addEventListener('keydown', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      var uid = String(target.getAttribute('data-element-uid') || '');
      var field = String(target.getAttribute('data-inline-field') || '');
      if (!uid || !field) {
        return;
      }
      var rowNodes = Array.prototype.slice.call(els.content.querySelectorAll('.list-entry-inline[data-element-uid]'));
      if (!rowNodes.length) {
        return;
      }
      var rowUids = rowNodes.map(function (row) {
        return String(row.getAttribute('data-element-uid') || '');
      });
      var rowIdx = rowUids.indexOf(uid);
      if (rowIdx < 0) {
        return;
      }
      var direction = event.key === 'ArrowUp' ? -1 : 1;
      var nextUid = rowUids[(rowIdx + direction + rowUids.length) % rowUids.length] || '';
      if (!nextUid) {
        return;
      }
      event.preventDefault();
      state.activeEntryUid = nextUid;
      state.activeCellField = field;
      renderList();
      renderAdmin();
      focusInlineField(nextUid, field);
    });

    els.content.addEventListener('dragstart', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (target && target.closest && target.closest('[data-inline-field], input, textarea, select, [contenteditable=""], [contenteditable="true"]')) {
        event.preventDefault();
        return;
      }
      var row = target && target.closest ? target.closest('.list-entry-inline[data-element-uid]') : null;
      if (!(row instanceof HTMLElement)) {
        return;
      }
      state.dragUid = String(row.getAttribute('data-element-uid') || '');
      state.dragStartElements = cloneEditableElements(state.draft.elements || []);
      state.dragMoved = false;
      state.dragDropped = false;
      state.dragLastTargetKey = '';
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', state.dragUid);
      } catch (_err) {
        // Ignore.
      }
      row.classList.add('is-dragging');
    });

    els.content.addEventListener('dragend', function (event) {
      var row = event.target && event.target.closest ? event.target.closest('.list-entry-inline[data-element-uid]') : null;
      if (row) {
        row.classList.remove('is-dragging');
      }
      if (state.dragUid && state.dragMoved && !state.dragDropped && Array.isArray(state.dragStartElements)) {
        var beforeSnap = captureEntryRects();
        state.draft.elements = cloneEditableElements(state.dragStartElements);
        renderListWithFlip(beforeSnap);
      }
      state.dragUid = '';
      state.dragMoved = false;
      state.dragDropped = false;
      state.dragLastTargetKey = '';
      state.dragStartElements = null;
    });

    els.content.addEventListener('dragover', function (event) {
      if (!state.editMode || !isAdmin() || !state.dragUid) {
        return;
      }
      var target = event.target;
      var row = target && target.closest ? target.closest('.list-entry-inline[data-element-uid]') : null;
      if (!(row instanceof HTMLElement)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      var targetUid = String(row.getAttribute('data-element-uid') || '');
      if (!targetUid || targetUid === state.dragUid) {
        return;
      }
      var rect = row.getBoundingClientRect();
      var placeAfter = event.clientY > (rect.top + rect.height / 2);
      var targetKey = targetUid + ':' + (placeAfter ? 'after' : 'before');
      if (targetKey === state.dragLastTargetKey) {
        return;
      }
      var beforeLiveMove = captureEntryRects();
      var changed = reorderByDrag(state.dragUid, targetUid, placeAfter);
      if (!changed) {
        return;
      }
      state.dragLastTargetKey = targetKey;
      state.dragMoved = true;
      renderListWithFlip(beforeLiveMove);
    });

    els.content.addEventListener('drop', function (event) {
      if (!state.editMode || !isAdmin() || !state.dragUid) {
        return;
      }
      var target = event.target;
      var row = target && target.closest ? target.closest('.list-entry-inline[data-element-uid]') : null;
      if (!(row instanceof HTMLElement)) {
        return;
      }
      event.preventDefault();
      state.dragDropped = true;
      var targetUid = String(row.getAttribute('data-element-uid') || '');
      if (targetUid && targetUid !== state.dragUid) {
        var rect = row.getBoundingClientRect();
        var placeAfter = event.clientY > (rect.top + rect.height / 2);
        var targetKey = targetUid + ':' + (placeAfter ? 'after' : 'before');
        if (targetKey !== state.dragLastTargetKey) {
          var beforeDrop = captureEntryRects();
          var changed = reorderByDrag(state.dragUid, targetUid, placeAfter);
          if (changed) {
            state.dragMoved = true;
            renderListWithFlip(beforeDrop);
          }
        }
      }
      if (state.dragMoved) {
        pushUndoHistoryFromElements(state.dragStartElements || []);
        queueAutosave(120);
      }
    });
  }

  async function load() {
    var maxAttempts = 3;
    var lastErr = null;
    try {
      state.authSignature = authSignature();
      for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          var auth = getAuthPayload();
          var payload = await apiPost('/cgi/blog-get-nostr-page', {
            page_slug: slug,
            session_token: auth.session_token,
            csrf_token: auth.csrf_token
          });
          if (!isExpectedPayload(payload)) {
            throw new Error('Unexpected page payload for list page');
          }
          var nextRenderSignature = JSON.stringify({
            slug: String(payload && payload.slug || ''),
            page_type: String(payload && payload.page_type || ''),
            nav_title: String(payload && payload.nav_title || ''),
            is_admin: !!(payload && payload.is_admin),
            canonical_exists: !!(payload && payload.canonical_exists),
            draft_differs: !!(payload && payload.draft_differs),
            state: (payload && payload.state) ? payload.state : null
          });
          var shouldRepaint = !state.initialContentPainted || state.renderSignature !== nextRenderSignature;
          state.payload = payload;
          state.draft = readEditableStateFromPayload();
          state.navTitle = String(payload.nav_title || '').trim();
          state.navTitleEditing = false;
          state.navTitleInput = '';
          state.navTitleBusy = false;
          state.pendingNewEntry = null;
          state.markerFilterInclude = [];
          state.markerFilterExclude = [];
          state.markerFilterInitialized = false;
          state.markerColorByToken = {};
          state.createProductBusyUid = '';
          state.viewModeOverride = '';
          state.saveIndicatorVisible = false;
          resetInlineHistory();
          if (!state.activeEntryUid && state.draft.elements.length) {
            state.activeEntryUid = state.draft.elements[0]._uid;
          }
          setSaveStatus('saved');
          state.renderSignature = nextRenderSignature;
          writeBootstrapCache(state.payload);
          if (shouldRepaint) {
            renderList();
            renderAdmin();
            renderValidation();
            markInitialContentPainted();
          } else {
            renderHead();
            renderAdmin();
            renderValidation();
          }
          return;
        } catch (err) {
          lastErr = err;
          if (attempt >= maxAttempts) {
            break;
          }
          await new Promise(function (resolve) {
            window.setTimeout(resolve, attempt * 220);
          });
        }
      }
      renderLoadFallback(lastErr, 'Page content is still loading. The latest list data was not available yet.');
      if (root && root.classList) {
        root.classList.remove('is-loading');
      }
    } finally {
      markHydrationPageReady();
    }
  }

  bindAdminEvents();
  document.addEventListener('mousedown', function (event) {
    if ((!state.editMode && !isReadInlineEditing()) || !isAdmin()) {
      return;
    }
    var activeUid = isReadInlineEditing() ? String(state.readInlineEditUid || '') : String(state.activeEntryUid || '');
    if (!activeUid) {
      return;
    }
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!root.contains(target)) {
      closeActiveInlineEditor({ forceAutosave: true, delayMs: 120 });
    }
  });
  document.addEventListener('click', function (event) {
    var readInline = isReadInlineEditing();
    if ((!state.editMode && !readInline) || !isAdmin()) {
      return;
    }
    var activeUid = readInline ? String(state.readInlineEditUid || '') : String(state.activeEntryUid || '');
    var activeField = readInline ? String(state.readInlineEditField || '') : String(state.activeCellField || '');
    if (!activeUid || !activeField) {
      return;
    }
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!root.contains(target)) {
      return;
    }
    if (target.closest('[data-list-inline-action="edit"]')) {
      return;
    }
    if (target.closest('[data-inline-field], input, textarea, select, [contenteditable=""], [contenteditable="true"]')) {
      return;
    }
    var activeRow = target.closest('.list-entry-inline[data-element-uid], .list-entry-read-inline[data-element-uid]');
    if (activeRow && String(activeRow.getAttribute('data-element-uid') || '') === activeUid) {
      return;
    }
    var activeFieldSelector = '[data-inline-field="' + activeField + '"][data-element-uid="' + activeUid + '"]';
    var onActiveField = !!target.closest(activeFieldSelector);
    if (onActiveField) {
      return;
    }
    closeActiveInlineEditor({ forceAutosave: true, delayMs: 120 });
  });
  window.addEventListener('blog-auth-changed', maybeReloadForAuthChange);
  window.addEventListener('storage', function (event) {
    if (!event || !event.key) {
      return;
    }
    if (event.key === 'session_token' || event.key === 'csrf_token') {
      maybeReloadForAuthChange();
    }
  });
  window.addEventListener('focus', maybeReloadForAuthChange);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      maybeReloadForAuthChange();
    }
  });
  if (!renderFromBootstrapCache()) {
    renderFromPrerenderBootstrap();
  }
  load();
})();
