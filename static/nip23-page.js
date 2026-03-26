(function () {
  'use strict';

  var root = document.getElementById('nip23-page-root');
  if (!root) {
    return;
  }

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

  var query = new URLSearchParams(window.location.search || '');

  function slugFromPathname(pathname) {
    var path = String(pathname || '').trim();
    if (!path || path === '/' || path === '/pages/index' || path === '/pages/index.html') {
      return 'index';
    }
    path = path.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!path) {
      return '';
    }
    if (path.indexOf('pages/') === 0) {
      path = path.slice('pages/'.length);
      path = path.replace(/\.html?$/i, '');
    }
    path = path.replace(/[^a-z0-9-]+/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    if (!path || path === 'index') {
      return 'index';
    }
    return path;
  }

  var slug = String(
    query.get('page_slug') ||
    query.get('slug') ||
    slugFromPathname(window.location.pathname) ||
    root.getAttribute('data-page-slug') ||
    'index'
  ).trim() || 'index';

  var els = {
    title: document.getElementById('nip23-page-title'),
    admin: document.getElementById('nip23-page-admin'),
    validation: document.getElementById('nip23-page-validation'),
    content: document.getElementById('nip23-page-content')
  };

  var state = {
    payload: null,
    draft: null,
    editMode: false,
    navTitle: '',
    navTitleEditing: false,
    navTitleInput: '',
    navTitleBusy: false,
    busy: false,
    autosaveQueued: false,
    saveTimer: null,
    saveStatus: 'saved',
    saveIndicatorVisible: false,
    authSignature: '',
    initialContentPainted: false
  };
  var PAGE_BOOTSTRAP_CACHE_PREFIX = 'nostr_page_bootstrap_v1:';
  var BOOTSTRAP_CACHE_MAX_AGE_MS = 15000;
  var markedUpgradeTimer = 0;
  var markedUpgradeAttempts = 0;

  function templateRefreshRequested() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get('__template_refresh') === '1';
    } catch (_err) {
      return false;
    }
  }

  function reloadForTemplateRefresh() {
    try {
      var next = new URL(window.location.href);
      next.searchParams.set('__template_refresh', '1');
      window.location.replace(next.toString());
      return true;
    } catch (_err) {
      return false;
    }
  }

  function clearTemplateRefreshParam() {
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.get('__template_refresh') !== '1') {
        return;
      }
      url.searchParams.delete('__template_refresh');
      var next = url.pathname;
      var queryString = url.searchParams.toString();
      if (queryString) {
        next += '?' + queryString;
      }
      if (url.hash) {
        next += url.hash;
      }
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', next);
      }
    } catch (_err) {
      // Ignore URL cleanup failures.
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

  function normalizeExtraFormat(value) {
    var next = String(value || '').trim().toLowerCase();
    return next === 'html' ? 'html' : 'markdown';
  }

  function normalizeProductType(value) {
    var next = String(value || '').trim().toLowerCase();
    if (next === 'service' || next === 'membership') {
      return next;
    }
    return 'software';
  }

  function normalizeCurrency(value) {
    var next = String(value || 'USD').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (next.length === 3) {
      return next;
    }
    return 'USD';
  }

  function normalizePrice(value) {
    var text = String(value || '').trim();
    if (!text) {
      return '';
    }
    if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(text)) {
      return '';
    }
    return text;
  }

  function normalizeDiscount(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) {
      return 0;
    }
    if (n > 95) {
      return 95;
    }
    return n;
  }

  function defaultPurchaseEndpoint() {
    return '/purchase/' + slug;
  }

  function normalizeDraftState(raw) {
    var src = raw || {};
    var parsedPrice = normalizePrice(src.price || src.price_usd || '');
    var parsedPurchaseEndpoint = String(src.purchase_endpoint || src.r || '').trim();
    if (!parsedPurchaseEndpoint) {
      parsedPurchaseEndpoint = defaultPurchaseEndpoint();
    }
    var productFlag = src.product_enabled;
    if (productFlag === undefined || productFlag === null) {
      productFlag = !!parsedPrice;
    }
    var productEnabled = (productFlag === true || String(productFlag || '').toLowerCase() === 'true' || String(productFlag || '') === '1');
    return {
      slug: String(src.slug || slug),
      type: String(src.type || 'nip23'),
      title: String(src.title || ''),
      content: String(src.content || ''),
      product_enabled: productEnabled,
      product_type: normalizeProductType(src.product_type || 'software'),
      price: parsedPrice,
      currency: normalizeCurrency(src.currency || 'USD'),
      crypto_discount_percent: normalizeDiscount(src.crypto_discount_percent || 0),
      purchase_endpoint: parsedPurchaseEndpoint,
      repo: String(src.repo || ''),
      tag: String(src.tag || 'latest'),
      extras_after: String(src.extras_after || ''),
      extras_after_format: normalizeExtraFormat(src.extras_after_format || 'markdown')
    };
  }

  function parseMoney(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) {
      return 0;
    }
    return n;
  }

  function moneyText(value) {
    return parseMoney(value).toFixed(2);
  }

  function authPayload() {
    return {
      session_token: String(localStorage.getItem('session_token') || '').trim(),
      csrf_token: String(localStorage.getItem('csrf_token') || '').trim()
    };
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

  function authSignature() {
    var auth = authPayload();
    return String(auth.session_token || '') + '|' + String(auth.csrf_token || '');
  }

  function markInitialContentPainted() {
    if (state.initialContentPainted) {
      return;
    }
    state.initialContentPainted = true;
    try {
      window.__wizardryPageInitialContentReady = true;
      window.dispatchEvent(new CustomEvent('blog-page-initial-content-ready', {
        detail: { slug: slug }
      }));
    } catch (_err) {
      // Ignore event dispatch failures.
    }
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
    if (payloadSlug === slug && (payloadType === 'nip23' || payloadType === 'blog')) {
      return true;
    }
    if (slug === 'index' && payloadSlug === 'blog' && (payloadType === 'nip23' || payloadType === 'blog')) {
      return true;
    }
    return false;
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
      // Ignore cache write failures.
    }
  }

  function renderFromBootstrapCache() {
    var cachedPayload = readBootstrapCache();
    if (!cachedPayload) {
      return false;
    }
    state.payload = cachedPayload;
    state.draft = normalizeDraftState((cachedPayload && cachedPayload.state) || { title: '', content: '' });
    state.navTitle = String((cachedPayload && cachedPayload.nav_title) || '').trim();
    state.navTitleEditing = false;
    state.navTitleInput = '';
    state.navTitleBusy = false;
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
    renderAll();
    markInitialContentPainted();
    return true;
  }

  function scheduleMarkedUpgrade() {
    if (window.marked && typeof window.marked.parse === 'function') {
      return;
    }
    if (markedUpgradeTimer) {
      return;
    }
    markedUpgradeAttempts = 0;
    function pollForMarked() {
      if (window.marked && typeof window.marked.parse === 'function') {
        markedUpgradeTimer = 0;
        renderAll();
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

  function isAdmin() {
    return !!(state.payload && state.payload.is_admin && state.draft);
  }

  function markHydrationPageReady() {
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markPageReady === 'function') {
      gate.markPageReady();
    }
  }

  function apiPost(url, payload) {
    var body = new URLSearchParams(payload || {});
    return fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).then(function (res) { return res.text(); }).then(function (text) {
      var data;
      try {
        data = JSON.parse(text);
      } catch (_err) {
        throw new Error('Invalid JSON response');
      }
      if (!data || data.success === false) {
        throw new Error((data && data.error) || 'Request failed');
      }
      return data;
    });
  }

  function getRenderState() {
    if (isAdmin()) {
      state.draft = normalizeDraftState(state.draft);
      return state.draft;
    }
    return normalizeDraftState((state.payload && state.payload.state) || { title: 'Home', content: '' });
  }

  function defaultNavbarTitle(renderState) {
    var s = renderState || getRenderState();
    var fallback = String(root.getAttribute('data-page-title') || '').trim();
    var title = String((s && s.title) || fallback || 'Untitled').trim();
    return title || 'Untitled';
  }

  function currentNavbarTitle(renderState) {
    var configured = String(state.navTitle || '').trim();
    if (configured) {
      return configured;
    }
    return defaultNavbarTitle(renderState);
  }

  function navbarTitleHost() {
    var head = root.querySelector('.list-page-head');
    if (!head || !els.title) {
      return null;
    }
    var host = head.querySelector('[data-page-nav-title-host="true"]');
    if (host instanceof HTMLElement) {
      return host;
    }
    host = document.createElement('div');
    host.setAttribute('data-page-nav-title-host', 'true');
    host.className = 'list-page-nav-title-row-wrap';
    if (els.title.nextSibling) {
      head.insertBefore(host, els.title.nextSibling);
    } else {
      head.appendChild(host);
    }
    return host;
  }

  function renderNavbarTitleRow(renderState) {
    var host = navbarTitleHost();
    if (!host) {
      return;
    }
    if (!isAdmin() || !state.editMode) {
      host.hidden = true;
      host.innerHTML = '';
      return;
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

  function renderValidation() {
    if (!els.validation) {
      return;
    }
    var v = (state.payload && state.payload.validation) ? state.payload.validation : {};
    var errors = Array.isArray(v.errors) ? v.errors : [];
    var warnings = Array.isArray(v.warnings) ? v.warnings : [];
    if (!isAdmin() || (!errors.length && !warnings.length)) {
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

  function setSaveStatus(next) {
    state.saveStatus = next;
    var node = document.getElementById('nip23-admin-save-status');
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
    renderAdmin();
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      persistDraft({ alertOnError: false });
    }, Number(delayMs) > 0 ? Number(delayMs) : 500);
  }

  function renderHead() {
    var s = getRenderState();
    if (s && s.title) {
      document.title = String(s.title);
    }
    if (els.title) {
      if (isAdmin() && state.editMode) {
        els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'Untitled') + '</span><span id="nip23-page-title-actions" class="list-page-title-actions"></span>';
      } else {
        els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'Untitled') + '</span><span id="nip23-page-title-actions" class="list-page-title-actions"></span>';
      }
    }
    renderNavbarTitleRow(s);
  }

  removeLegacyTitleBlock();

  function renderAdmin() {
    if (!els.admin) {
      return;
    }
    if (!isAdmin()) {
      els.admin.hidden = true;
      els.admin.innerHTML = '';
      return;
    }

    var hasCanonical = !!state.payload.canonical_exists;
    var hasDraftChanges = !!state.payload.draft_differs;
    var showRevert = !!state.editMode;
    var showPublish = !!state.editMode || hasDraftChanges;
    var canRevert = hasCanonical && hasDraftChanges;
    var revertTitle = canRevert ? 'Revert draft to Nostr version' : (hasCanonical ? 'No local changes to revert' : 'No Nostr version found');

    var actionsHost = document.getElementById('nip23-page-title-actions');
    var html = '<span class="list-page-admin-bar">';
    if (state.saveIndicatorVisible) {
      html += '<span id="nip23-admin-save-status" class="list-admin-save-status" aria-live="polite">';
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
      html += '<button type="button" data-nip23-action="revert" title="' + escapeHtml(revertTitle) + '"' + (canRevert ? '' : ' disabled aria-disabled="true"') + '>Revert</button>';
    }
    if (showPublish) {
      html += '<button type="button" class="list-admin-primary-btn" data-nip23-action="publish">Publish to Nostr...</button>';
    }
    html += '<button type="button" class="list-admin-primary-btn" data-nip23-action="toggle-edit">' + (state.editMode ? 'Done' : 'Edit') + '</button>';
    html += '</span>';

    if (actionsHost) {
      actionsHost.innerHTML = html;
    }
    els.admin.hidden = true;
    els.admin.innerHTML = '';
  }

  function renderProductCard(s) {
    var priceText = normalizePrice(s.price || '');
    var priceValue = parseMoney(priceText);
    var discountValue = normalizeDiscount(s.crypto_discount_percent || 0);
    var cryptoValue = priceValue * ((100 - discountValue) / 100);
    var hasPrice = priceValue > 0;
    var productType = normalizeProductType(s.product_type || 'software');
    var enabled = !!s.product_enabled || hasPrice;
    if (!enabled) {
      return '';
    }
    var html = '';
    html += '<section class="nip23-product-card" aria-label="Product checkout">';
    html += '<div class="nip23-product-card-head">';
    html += '<strong>Checkout</strong>';
    html += '<span class="nip23-product-type-pill">' + escapeHtml(productType) + '</span>';
    html += '</div>';
    html += '<div class="nip23-product-prices">';
    html += '<div><span>Card price</span><strong>$' + moneyText(priceValue) + ' ' + escapeHtml(normalizeCurrency(s.currency || 'USD')) + '</strong></div>';
    html += '<div><span>Crypto price</span><strong>$' + moneyText(cryptoValue) + '</strong></div>';
    if (discountValue > 0) {
      html += '<div><span>Crypto discount</span><strong>' + escapeHtml(String(discountValue.toFixed(2)).replace(/\.00$/, '')) + '%</strong></div>';
    }
    html += '</div>';
    html += '<div class="nip23-product-actions">';
    html += '<button type="button" class="nip23-product-btn" data-nip23-action="add-to-cart">Add to Cart</button>';
    html += '<a class="nip23-product-btn nip23-product-btn-primary" href="/pages/checkout.html?product=' + encodeURIComponent(slug) + '">Checkout Now</a>';
    html += '</div>';
    html += '</section>';
    return html;
  }

  function renderContent() {
    if (!els.content) {
      return;
    }
    var s = getRenderState();
    var outroHtml = '';
    if (String(s.extras_after || '').trim()) {
      outroHtml = '<section class="nostr-page-extra nostr-page-extra-after">' +
        markdownBlock(s.extras_after || '') +
        '</section>';
    }

    var hasMainContent = String(s.content || '').trim().length > 0;
    var readOnlyMain = hasMainContent
      ? '<article class="list-entry-markdown">' + markdownBlock(s.content || '') + '</article>'
      : '<p class="list-page-empty-state">No content yet.</p>';
    var productCardHtml = renderProductCard(s);

    if (isAdmin() && state.editMode) {
      var html = '';
      html += '<section class="nostr-page-extras-editor" aria-label="Page editor">';
      html += '<h3 class="nostr-page-extras-heading">Edit page</h3>';
      html += '<label class="nostr-page-extra-edit"><span>Title <span class="nostr-page-scope-pill is-nostr">Nostr</span></span><input type="text" id="nip23-title-input" value="' + escapeHtml(s.title || '') + '"></label>';
      html += '<label class="nostr-page-extra-edit"><span>Content (Markdown) <span class="nostr-page-scope-pill is-nostr">Nostr</span></span><textarea id="nip23-content-input" rows="12" placeholder="Write markdown content">' + escapeHtml(s.content || '') + '</textarea></label>';
      html += '<section class="nip23-product-editor" aria-label="Product settings">';
      html += '<h4>Product settings</h4>';
      html += '<label class="nip23-product-enable-row"><span>Enable product checkout</span><input type="checkbox" id="nip23-product-enabled"' + (s.product_enabled ? ' checked' : '') + '></label>';
      html += '<div class="nip23-product-grid">';
      html += '<label><span>Type</span><select id="nip23-product-type"><option value="software"' + (normalizeProductType(s.product_type || '') === 'software' ? ' selected' : '') + '>Software</option><option value="service"' + (normalizeProductType(s.product_type || '') === 'service' ? ' selected' : '') + '>Service</option><option value="membership"' + (normalizeProductType(s.product_type || '') === 'membership' ? ' selected' : '') + '>Membership</option></select></label>';
      html += '<label><span>Price (USD)</span><input type="text" id="nip23-price-input" inputmode="decimal" placeholder="19.00" value="' + escapeHtml(normalizePrice(s.price || '')) + '"></label>';
      html += '<label><span>Crypto discount %</span><input type="number" id="nip23-discount-input" min="0" max="95" step="1" value="' + escapeHtml(String(normalizeDiscount(s.crypto_discount_percent || 0))) + '"></label>';
      html += '<label><span>Purchase endpoint</span><input type="text" id="nip23-purchase-endpoint" value="' + escapeHtml(String(s.purchase_endpoint || defaultPurchaseEndpoint())) + '"></label>';
      html += '<label><span>GitHub repo</span><input type="text" id="nip23-repo-input" placeholder="owner/private-repo" value="' + escapeHtml(String(s.repo || '')) + '"></label>';
      html += '<label><span>Release tag</span><input type="text" id="nip23-tag-input" placeholder="latest" value="' + escapeHtml(String(s.tag || 'latest')) + '"></label>';
      html += '</div>';
      html += '</section>';
      html += '<label class="nostr-page-extra-edit"><span>After content <span class="nostr-page-scope-pill is-local">Local</span></span><textarea id="nip23-outro-input" rows="5" placeholder="Optional local content shown after the main content section">' + escapeHtml(s.extras_after || '') + '</textarea></label>';
      html += '</section>';
      html += productCardHtml;
      html += readOnlyMain;
      html += outroHtml;
      els.content.innerHTML = html;
      return;
    }

    els.content.innerHTML = productCardHtml + readOnlyMain + outroHtml;
  }

  function renderAll() {
    renderHead();
    renderAdmin();
    renderContent();
    renderValidation();
  }

  function addCurrentProductToCart() {
    if (!window.blogShopCart || typeof window.blogShopCart.addProductBySlug !== 'function') {
      window.alert('Cart is still loading. Try again in a moment.');
      return;
    }
    window.blogShopCart.addProductBySlug(slug).catch(function (err) {
      window.alert(err && err.message ? err.message : 'Could not add product to cart');
    });
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
    return apiPost('/cgi/blog-update-nostr-page-nav-title', {
      page_slug: slug,
      nav_title: nextTitle,
      session_token: authPayload().session_token,
      csrf_token: authPayload().csrf_token
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

  function persistDraft(opts) {
    if (state.busy || !isAdmin()) {
      if (isAdmin()) {
        state.autosaveQueued = true;
      }
      return Promise.resolve(false);
    }
    var options = opts || {};
    var serializedBeforeSave = JSON.stringify(state.draft || {});
    state.busy = true;
    setSaveStatus('saving');
    var payload = authPayload();
    return apiPost('/cgi/blog-save-nostr-page-draft', {
      page_slug: slug,
      state_json: JSON.stringify(state.draft || {}),
      session_token: payload.session_token,
      csrf_token: payload.csrf_token
    }).then(function (data) {
      state.payload.validation = data.validation || { errors: [], warnings: [], can_publish: true };
      state.payload.draft_exists = true;
      var localChangedDuringSave = JSON.stringify(state.draft || {}) !== serializedBeforeSave;
      state.payload.draft_differs = localChangedDuringSave;
      if (!localChangedDuringSave) {
        state.payload.state = data.state || state.payload.state;
        state.draft = normalizeDraftState(data.state || state.draft);
      } else {
        state.payload.state = normalizeDraftState(state.draft || {});
      }
      setSaveStatus('saved');
      renderAll();
      return true;
    }).catch(function (err) {
      setSaveStatus('error');
      if (options.alertOnError !== false) {
        window.alert(err.message || 'Could not save draft');
      }
      return false;
    }).finally(function () {
      state.busy = false;
      if (state.autosaveQueued) {
        state.autosaveQueued = false;
        queueAutosave(500);
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

  function revertDraft() {
    if (state.busy || !isAdmin()) {
      return;
    }
    if (!window.confirm('Discard local draft changes and restore canonical Nostr version?')) {
      return;
    }
    var payload = authPayload();
    state.busy = true;
    setSaveStatus('saving');
    apiPost('/cgi/blog-revert-nostr-page-draft', {
      page_slug: slug,
      session_token: payload.session_token,
      csrf_token: payload.csrf_token
    }).then(function (data) {
      state.payload.state = data.state;
      state.payload.validation = data.validation || { errors: [], warnings: [], can_publish: true };
      state.payload.draft_exists = true;
      state.payload.draft_differs = false;
      state.draft = normalizeDraftState(data.state);
      setSaveStatus('saved');
      renderAll();
    }).catch(function (err) {
      setSaveStatus('error');
      window.alert(err.message || 'Could not revert draft');
    }).finally(function () {
      state.busy = false;
    });
  }

  function bindEvents() {
    root.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var actionNode = target.closest('[data-nip23-action]');
      if (actionNode instanceof HTMLElement) {
        var action = String(actionNode.getAttribute('data-nip23-action') || '');
        if (action === 'add-to-cart') {
          event.preventDefault();
          addCurrentProductToCart();
          return;
        }
      }
      if (!isAdmin()) {
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
      if (!(actionNode instanceof HTMLElement)) {
        return;
      }
      var action = String(actionNode.getAttribute('data-nip23-action') || '');
      if (action === 'toggle-edit') {
        state.editMode = !state.editMode;
        if (!state.editMode) {
          state.navTitleEditing = false;
          state.navTitleInput = '';
        }
        renderAll();
        return;
      }
      if (action === 'publish') {
        publishDraft();
        return;
      }
      if (action === 'revert') {
        if (actionNode.hasAttribute('disabled')) {
          return;
        }
        revertDraft();
      }
    });

    root.addEventListener('input', function (event) {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-page-nav-title-input')) {
        state.navTitleInput = String(target.value || '');
        return;
      }
      state.draft = normalizeDraftState(state.draft);
      if (target.id === 'nip23-title-input') {
        state.draft.title = String(target.value || '');
        renderHead();
        renderAdmin();
        queueAutosave(500);
        return;
      }
      if (target.id === 'nip23-content-input') {
        state.draft.content = String(target.value || '');
        queueAutosave(500);
        return;
      }
      if (target.id === 'nip23-product-enabled' && target instanceof HTMLInputElement) {
        state.draft.product_enabled = !!target.checked;
        queueAutosave(450);
        return;
      }
      if (target.id === 'nip23-product-type' && target instanceof HTMLSelectElement) {
        state.draft.product_type = normalizeProductType(target.value || 'software');
        queueAutosave(450);
        return;
      }
      if (target.id === 'nip23-price-input') {
        state.draft.price = String(target.value || '').trim();
        if (state.draft.price) {
          state.draft.product_enabled = true;
        }
        queueAutosave(450);
        return;
      }
      if (target.id === 'nip23-discount-input') {
        state.draft.crypto_discount_percent = normalizeDiscount(target.value || 0);
        queueAutosave(450);
        return;
      }
      if (target.id === 'nip23-purchase-endpoint') {
        state.draft.purchase_endpoint = String(target.value || '').trim();
        queueAutosave(450);
        return;
      }
      if (target.id === 'nip23-repo-input') {
        state.draft.repo = String(target.value || '').trim();
        queueAutosave(450);
        return;
      }
      if (target.id === 'nip23-tag-input') {
        state.draft.tag = String(target.value || '').trim();
        queueAutosave(450);
        return;
      }
      if (target.id === 'nip23-outro-input') {
        state.draft.extras_after = String(target.value || '');
        queueAutosave(500);
        return;
      }
    });

    root.addEventListener('keydown', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.hasAttribute('data-page-nav-title-input')) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        saveNavbarTitle();
      }
    });
  }

  function maybeReloadForAuthChange() {
    var nextSig = authSignature();
    if (nextSig !== state.authSignature) {
      load();
    }
  }

  function load() {
    var auth = authPayload();
    state.authSignature = auth.session_token + '|' + auth.csrf_token;
    return apiPost('/cgi/blog-get-nostr-page', {
      page_slug: slug,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (payload) {
      if (payload && payload.success === false && slug === 'index' && String(payload.code || '') === 'unknown_page') {
        window.location.replace('/pages/blog.html');
        return;
      }
      var payloadType = String((payload && payload.page_type) || '').trim().toLowerCase();
      if (payloadType && payloadType !== 'nip23' && payloadType !== 'blog') {
        if (!templateRefreshRequested() && reloadForTemplateRefresh()) {
          return;
        }
        throw new Error('This page shell does not match its configured type. Reload failed.');
      }
      if (!isExpectedPayload(payload)) {
        if (!templateRefreshRequested() && reloadForTemplateRefresh()) {
          return;
        }
        throw new Error('Unexpected page payload for long-form page');
      }
      clearTemplateRefreshParam();
      state.payload = payload;
      state.draft = normalizeDraftState(payload.state || { title: '', content: '' });
      state.navTitle = String(payload.nav_title || '').trim();
      state.navTitleEditing = false;
      state.navTitleInput = '';
      state.navTitleBusy = false;
      state.saveIndicatorVisible = false;
      setSaveStatus('saved');
      writeBootstrapCache(payload);
      renderAll();
      markInitialContentPainted();
    }).catch(function (err) {
      if (els.content) {
        els.content.innerHTML = '<div class="list-runtime-error" role="status"><strong>Could not load this page.</strong><span>' + escapeHtml(err.message || 'Please refresh and try again.') + '</span></div>';
      }
    }).finally(function () {
      markHydrationPageReady();
    });
  }

  bindEvents();
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
  renderFromBootstrapCache();
  load();
})();
