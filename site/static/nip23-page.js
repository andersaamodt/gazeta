(function () {
  'use strict';

  var root = document.getElementById('nip23-page-root');
  if (!root) {
    return;
  }

  window.__wizardryRemoveLegacyTitleBlock(root);

  var query = new URLSearchParams(window.location.search || '');

  function slugFromPathname(pathname) {
    var path = String(pathname || '').trim();
    if (!path || path === '/' || path === '/pages/index' || path === '/pages/index.html') {
      return '';
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
      return '';
    }
    return path;
  }

  var slug = String(
    root.getAttribute('data-page-slug') ||
    slugFromPathname(window.location.pathname) ||
    query.get('page_slug') ||
    query.get('slug') ||
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
  var BOOTSTRAP_CACHE_MAX_AGE_MS = 15000;
  var markedUpgradeState = { timer: 0, attempts: 0 };

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function markdownBlock(md) {
    var value = window.__wizardryStripLegacyNostrSyncPills(md);
    if (!value) {
      return '';
    }
    if (window.marked && typeof window.marked.parse === 'function') {
      return window.marked.parse(value);
    }
    window.__wizardryScheduleMarkedUpgrade(markedUpgradeState, function () {
      renderAll();
    });
    return '<p>' + escapeHtml(value).replace(/\n/g, '<br>') + '</p>';
  }

  function normalizeExtraFormat(value) {
    var next = String(value || '').trim().toLowerCase();
    return next === 'html' ? 'html' : 'markdown';
  }

  function normalizeProductType(value) {
    var next = String(value || '').trim().toLowerCase();
    if (next === 'service' || next === 'membership' || next === 'merch') {
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

  function normalizeVariant(raw) {
    var src = raw || {};
    var id = String(src.id || src.variant_id || src.printful_sync_variant_id || src.printful_external_variant_id || '').trim();
    if (!id) {
      return null;
    }
    return {
      id: id,
      name: String(src.name || src.title || src.variant_name || '').trim(),
      price: normalizePrice(src.price || src.retail_price || ''),
      currency: normalizeCurrency(src.currency || 'USD'),
      image_url: String(src.image_url || src.thumbnail_url || '').trim(),
      fulfillment_provider: String(src.fulfillment_provider || '').trim().toLowerCase(),
      printful_sync_variant_id: String(src.printful_sync_variant_id || src.sync_variant_id || '').trim(),
      printful_external_variant_id: String(src.printful_external_variant_id || src.external_variant_id || '').trim(),
      printful_variant_id: String(src.printful_variant_id || src.variant_id || '').trim(),
      printful_product_template_id: String(src.printful_product_template_id || src.product_template_id || '').trim()
    };
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
      image_url: String(src.image_url || src.thumbnail_url || ''),
      fulfillment_provider: String(src.fulfillment_provider || ''),
      printful_product_id: String(src.printful_product_id || ''),
      printful_product_template_id: String(src.printful_product_template_id || src.product_template_id || ''),
      printful_sync_variant_id: String(src.printful_sync_variant_id || ''),
      printful_external_variant_id: String(src.printful_external_variant_id || ''),
      variants: (Array.isArray(src.variants) ? src.variants : []).map(normalizeVariant).filter(Boolean),
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

  function hasProductPrice(s) {
    return !!normalizePrice((s && s.price) || '');
  }

  function productPriceDisplayText(s) {
    var priceText = normalizePrice((s && s.price) || '');
    if (!priceText) {
      return '';
    }
    var priceValue = parseMoney(priceText);
    if (priceValue === 0) {
      return 'Free';
    }
    var currency = normalizeCurrency((s && s.currency) || 'USD');
    if (currency === 'USD') {
      return '$' + moneyText(priceValue);
    }
    return moneyText(priceValue) + ' ' + currency;
  }

  function productCheckoutPriceText(s) {
    return productPriceDisplayText(s) || '$0.00';
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

  function applyBootstrapState(optimisticPayload, payload) {
    state.payload = optimisticPayload;
    state.draft = normalizeDraftState((payload && payload.state) || { title: '', content: '' });
    state.navTitle = String((payload && payload.nav_title) || '').trim();
    state.navTitleEditing = false;
    state.navTitleInput = '';
    state.navTitleBusy = false;
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
  }

  function renderBootstrapPayload(payload) {
    return window.__wizardryRenderManagedNostrPageBootstrapPayload(payload, {
      rootNode: root,
      contentNode: els.content,
      isExpectedPayload: isExpectedPayload,
      applyState: applyBootstrapState,
      renderHead: renderHead,
      renderAdmin: renderAdmin,
      renderValidation: renderValidation,
      renderAll: renderAll,
      markInitialContentPainted: function () {
        window.__wizardryNotifyInitialContentPainted(slug, {
          state: state,
          markPageReady: true
        });
      }
    });
  }

  function isAdmin() {
    return !!(state.payload && state.payload.is_admin && state.draft);
  }

  var apiPost = window.__wizardryPostFormJson;

  function getRenderState() {
    if (isAdmin()) {
      state.draft = normalizeDraftState(state.draft);
      return state.draft;
    }
    return normalizeDraftState((state.payload && state.payload.state) || { title: '', content: '' });
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

  function renderNavbarTitleRow(renderState) {
    var current = currentNavbarTitle(renderState);
    window.__wizardryRenderManagedNavbarTitleRow({
      isAdmin: isAdmin(),
      editMode: state.editMode,
      titleNode: els.title || null,
      currentText: current,
      editing: !!state.navTitleEditing,
      inputValue: state.navTitleInput || current,
      saveDisabled: state.navTitleBusy
    });
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
    window.__wizardryRenderManagedPageHead({
      isAdmin: false,
      pageTitle: s && s.title ? String(s.title) : null,
      titleNode: els.title,
      titleText: String(s.title || 'Untitled'),
      titleSyncOptions: {
        messageVariant: 'local_source'
      },
      syncStatus: state.payload && state.payload.sync_status
    });
    renderNavbarTitleRow(s);
  }

	  window.__wizardryRemoveLegacyTitleBlock(root);

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
    html += window.__wizardrySyncStatusPillHtml(state.payload && state.payload.sync_status, {
      messageVariant: 'local_source'
    });
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
    var hasPrice = hasProductPrice(s);
    var productType = normalizeProductType(s.product_type || 'software');
    var enabled = !!s.product_enabled || hasPrice;
    if (!enabled) {
      return '';
    }
    var displayPrice = productPriceDisplayText(s);
    var cryptoPrice = priceValue === 0 ? 'Free' : '$' + moneyText(cryptoValue);
    var variants = Array.isArray(s.variants) ? s.variants : [];
    var variantsHtml = '';
    if (variants.length > 1) {
      variantsHtml += '<label class="nip23-product-variant-row"><span>Variant</span><select data-nip23-product-variant="true">';
      variants.forEach(function (variant) {
        var label = variant.name || variant.id;
        var price = normalizePrice(variant.price || '');
        if (price) {
          label += ' - $' + moneyText(price);
        }
        variantsHtml += '<option value="' + escapeHtml(variant.id) + '">' + escapeHtml(label) + '</option>';
      });
      variantsHtml += '</select></label>';
    }
    var imageUrl = String(s.image_url || '').trim();
    if (!imageUrl && variants.length) {
      variants.some(function (variant) {
        var candidate = String(variant && variant.image_url || '').trim();
        if (!candidate) {
          return false;
        }
        imageUrl = candidate;
        return true;
      });
    }
    var imageHtml = imageUrl
      ? '<div class="nip23-product-card-media"><img class="nip23-product-card-image" src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(s.title || 'Product image') + '" loading="lazy" decoding="async"></div>'
      : '';
    var html = '';
    html += '<section class="nip23-product-card' + (imageHtml ? ' has-image' : '') + (productType === 'merch' ? ' merch-product-page' : '') + '" aria-label="Product checkout">';
    html += imageHtml;
    html += '<div class="nip23-product-card-main">';
    html += '<div class="nip23-product-card-head">';
    html += '<strong>Checkout</strong>';
    html += '<span class="nip23-product-type-pill">' + escapeHtml(productType) + '</span>';
    html += '</div>';
    if (displayPrice) {
      html += '<div class="nip23-product-page-price"><span>Price</span><strong>' + escapeHtml(displayPrice) + '</strong></div>';
    }
    html += '<div class="nip23-product-prices">';
    html += '<div><span>Card price</span><strong>' + escapeHtml(productCheckoutPriceText(s)) + '</strong></div>';
    html += '<div><span>Crypto price</span><strong>' + escapeHtml(cryptoPrice) + '</strong></div>';
    if (discountValue > 0) {
      html += '<div><span>Crypto discount</span><strong>' + escapeHtml(String(discountValue.toFixed(2)).replace(/\.00$/, '')) + '%</strong></div>';
    }
    html += '</div>';
    html += variantsHtml;
    html += '<div class="nip23-product-actions">';
    html += '<button type="button" class="nip23-product-btn nip23-product-btn-primary" data-nip23-action="add-to-cart">Add to Cart</button>';
    html += '</div>';
    html += '</div>';
    html += '</section>';
    return html;
  }

  function renderLocalPreviewHtml(s) {
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
    return renderProductCard(s) + readOnlyMain + outroHtml;
  }

  function currentPayloadPreviewHtml(renderState) {
    if (!state.payload || !window.__wizardryResolveManagedPagePreviewHtml) {
      return '';
    }
    var currentState = normalizeDraftState(renderState || getRenderState());
    return window.__wizardryResolveManagedPagePreviewHtml({
      payload: state.payload,
      matchesPayload: function (payload) {
        var payloadState = normalizeDraftState((payload && payload.state) || { title: '', content: '' });
        return JSON.stringify(payloadState) === JSON.stringify(currentState);
      }
    });
  }

  function renderContent() {
    if (!els.content) {
      return;
    }
    var s = getRenderState();
    if (isAdmin() && state.editMode) {
      var previewHtml = currentPayloadPreviewHtml(s) || renderLocalPreviewHtml(s);
      var html = '';
      html += '<section class="nostr-page-extras-editor" aria-label="Page editor">';
      html += '<h3 class="nostr-page-extras-heading">Edit page</h3>';
      html += '<label class="nostr-page-extra-edit"><span>Title <span class="nostr-page-scope-pill is-nostr">Nostr</span></span><input type="text" id="nip23-title-input" value="' + escapeHtml(s.title || '') + '"></label>';
      html += '<label class="nostr-page-extra-edit"><span>Content (Markdown) <span class="nostr-page-scope-pill is-nostr">Nostr</span></span><textarea id="nip23-content-input" rows="12" placeholder="Write markdown content">' + escapeHtml(s.content || '') + '</textarea></label>';
      html += '<section class="nip23-product-editor" aria-label="Product settings">';
      html += '<h4>Product settings</h4>';
      html += '<label class="nip23-product-enable-row"><span>Enable product checkout</span><input type="checkbox" id="nip23-product-enabled"' + (s.product_enabled ? ' checked' : '') + '></label>';
      html += '<div class="nip23-product-grid">';
      html += '<label><span>Type</span><select id="nip23-product-type"><option value="software"' + (normalizeProductType(s.product_type || '') === 'software' ? ' selected' : '') + '>Software</option><option value="service"' + (normalizeProductType(s.product_type || '') === 'service' ? ' selected' : '') + '>Service</option><option value="membership"' + (normalizeProductType(s.product_type || '') === 'membership' ? ' selected' : '') + '>Membership</option><option value="merch"' + (normalizeProductType(s.product_type || '') === 'merch' ? ' selected' : '') + '>Merch</option></select></label>';
      html += '<label><span>Price (USD)</span><input type="text" id="nip23-price-input" inputmode="decimal" placeholder="19.00" value="' + escapeHtml(normalizePrice(s.price || '')) + '"></label>';
      html += '<label><span>Crypto discount %</span><input type="number" id="nip23-discount-input" min="0" max="95" step="1" value="' + escapeHtml(String(normalizeDiscount(s.crypto_discount_percent || 0))) + '"></label>';
      html += '<label><span>Purchase endpoint</span><input type="text" id="nip23-purchase-endpoint" value="' + escapeHtml(String(s.purchase_endpoint || defaultPurchaseEndpoint())) + '"></label>';
      html += '<label><span>GitHub repo</span><input type="text" id="nip23-repo-input" placeholder="owner/private-repo" value="' + escapeHtml(String(s.repo || '')) + '"></label>';
      html += '<label><span>Release tag</span><input type="text" id="nip23-tag-input" placeholder="latest" value="' + escapeHtml(String(s.tag || 'latest')) + '"></label>';
      html += '</div>';
      html += '</section>';
      html += '<label class="nostr-page-extra-edit"><span>After content <span class="nostr-page-scope-pill is-local">Local</span></span><textarea id="nip23-outro-input" rows="5" placeholder="Optional local content shown after the main content section">' + escapeHtml(s.extras_after || '') + '</textarea></label>';
      html += '</section>';
      html += previewHtml;
      els.content.innerHTML = html;
      return;
    }

    window.__wizardryRenderResolvedReadOnlyContent({
      targetNode: els.content,
      payload: state.payload,
      renderFallback: function () {
        return '';
      }
    });
  }

  function renderAll() {
    renderHead();
    renderAdmin();
    renderContent();
    renderValidation();
  }

  function selectedVariantId() {
    var select = root.querySelector('[data-nip23-product-variant="true"]');
    if (select instanceof HTMLSelectElement) {
      return String(select.value || '').trim();
    }
    var s = getRenderState();
    var variants = Array.isArray(s && s.variants) ? s.variants : [];
    return variants.length ? String(variants[0].id || '').trim() : '';
  }

  function addCurrentProductToCart(opts) {
    if (!window.blogShopCart || typeof window.blogShopCart.addProductBySlug !== 'function') {
      window.alert('Cart is still loading. Try again in a moment.');
      return;
    }
    var options = Object.assign({}, opts || {});
    var variantId = selectedVariantId();
    if (variantId) {
      options.variant_id = variantId;
    }
    window.blogShopCart.addProductBySlug(slug, options).then(function () {
      if (options.checkout) {
        window.location.href = '/checkout';
      }
    }).catch(function (err) {
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
      session_token: window.__wizardryAuthPayload().session_token,
      csrf_token: window.__wizardryAuthPayload().csrf_token
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
    var payload = window.__wizardryAuthPayload();
    return apiPost('/cgi/blog-save-nostr-page-draft', {
      page_slug: slug,
      state_json: JSON.stringify(state.draft || {}),
      session_token: payload.session_token,
      csrf_token: payload.csrf_token
    }).then(function (data) {
      var localChangedDuringSave = JSON.stringify(state.draft || {}) !== serializedBeforeSave;
      var nextState = !localChangedDuringSave
        ? (data.state || state.payload.state)
        : normalizeDraftState(state.draft || {});
      window.__wizardryCommitManagedPagePayload(state.payload, data, {
        validationFallback: { errors: [], warnings: [], can_publish: true },
        statePayload: nextState,
        draftExists: true,
        draftDiffers: localChangedDuringSave,
        slug: slug,
        authSignature: window.__wizardrySessionAuthSignature,
        persistMode: 'authenticated_admin'
      });
      if (!localChangedDuringSave) {
        state.draft = normalizeDraftState(data.state || state.draft);
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
    var hasDialog = await window.__wizardryEnsureNostrPublishDialog();
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
    var payload = window.__wizardryAuthPayload();
    state.busy = true;
    setSaveStatus('saving');
    apiPost('/cgi/blog-revert-nostr-page-draft', {
      page_slug: slug,
      session_token: payload.session_token,
      csrf_token: payload.csrf_token
    }).then(function (data) {
      window.__wizardryCommitManagedPagePayload(state.payload, data, {
        validationFallback: { errors: [], warnings: [], can_publish: true },
        statePayload: data.state,
        draftExists: true,
        draftDiffers: false,
        slug: slug,
        authSignature: window.__wizardrySessionAuthSignature,
        persistMode: 'authenticated_admin'
      });
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

  function authEventIsAdmin(event) {
    if (event && event.detail && event.detail.is_admin === true) {
      return true;
    }
    return typeof window.__wizardryHasLikelyAdminSession === 'function' && window.__wizardryHasLikelyAdminSession();
  }

  function applyOptimisticAdminFromAuthEvent(event) {
    if (!authEventIsAdmin(event) || !state.payload || !state.draft || state.payload.is_admin) {
      return;
    }
    state.payload = Object.assign({}, state.payload, { is_admin: true });
    state.draft = normalizeDraftState((state.payload && state.payload.state) || state.draft || { title: '', content: '' });
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
    renderAll();
  }

  function maybeReloadForAuthChange(event) {
    var nextSig = window.__wizardrySessionAuthSignature();
    if (nextSig !== state.authSignature) {
      applyOptimisticAdminFromAuthEvent(event);
      load();
    }
  }

  function load() {
    state.authSignature = window.__wizardrySessionAuthSignature();
    return window.__wizardryRefreshManagedNostrPage({
      slug: slug,
      authSignature: window.__wizardrySessionAuthSignature,
      isExpectedPayload: isExpectedPayload,
      unexpectedPayloadMessage: 'Unexpected page payload for long-form page',
      renderPayload: renderBootstrapPayload,
      handleFailurePayload: function (payload) {
        if (payload && payload.success === false && slug === 'index' && String(payload.code || '') === 'unknown_page') {
          window.location.replace('/posts');
          return true;
        }
        return false;
      },
      handleError: function (err) {
        window.__wizardryRenderLoadFallback(err, {
          consoleLabel: 'Nostr page',
          state: state,
          contentNode: els.content,
          fallbackText: 'Page content is still loading. The latest page data was not available yet.',
          slug: slug
        });
      },
      onFinally: function () {
        window.__wizardryNotifyInitialContentPainted(slug, {
          state: state,
          markPageReady: true
        });
      }
    });
  }

  bindEvents();
  window.__wizardryBindSessionAuthRefresh({
    onChange: maybeReloadForAuthChange
  });
  window.__wizardryRenderManagedNostrBootstrapSources({
    slug: slug,
    maxAgeMs: BOOTSTRAP_CACHE_MAX_AGE_MS,
    authSignature: window.__wizardrySessionAuthSignature,
    isExpectedPayload: isExpectedPayload,
    renderPayload: renderBootstrapPayload
  });
  load();
})();
