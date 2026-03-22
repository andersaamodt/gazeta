(function () {
  var root = document.getElementById('contact-page-root');
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
  var slug = String(root.getAttribute('data-page-slug') || query.get('page_slug') || query.get('slug') || 'contact').trim() || 'contact';

  var els = {
    title: document.getElementById('contact-page-title'),
    description: document.getElementById('contact-page-description'),
    admin: document.getElementById('contact-page-admin'),
    validation: document.getElementById('contact-page-validation'),
    content: document.getElementById('contact-page-content')
  };

  var state = {
    payload: null,
    draft: null,
    editMode: false,
    activeHeadField: '',
    activeRowIndex: -1,
    activeRowField: '',
    draggingRowUid: '',
    dragOverRowUid: '',
    dragMoved: false,
    dragDropped: false,
    dragStartRows: null,
    pendingFlipPositions: null,
    rowUidSeq: 0,
    navTitle: '',
    navTitleEditing: false,
    navTitleInput: '',
    navTitleBusy: false,
    busy: false,
    autosaveQueued: false,
    saveTimer: null,
    saveStatus: 'saved',
    saveIndicatorVisible: false,
    initialContentPainted: false
  };
  var PAGE_BOOTSTRAP_CACHE_PREFIX = 'nostr_page_bootstrap_v1:';

  function nextRowUid() {
    state.rowUidSeq = Number(state.rowUidSeq || 0) + 1;
    return 'contact-row-' + String(state.rowUidSeq);
  }

  function normalizeRowUid(value) {
    var raw = String(value || '').trim();
    if (raw) {
      return raw;
    }
    return nextRowUid();
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function markdownBlock(md) {
    var value = String(md || '');
    if (!value) {
      return '';
    }
    if (window.marked && typeof window.marked.parse === 'function') {
      return window.marked.parse(value);
    }
    return '<p>' + escapeHtml(value).replace(/\n/g, '<br>') + '</p>';
  }

  function markdownInline(md) {
    var value = String(md || '');
    if (!value) {
      return '';
    }
    if (window.marked && typeof window.marked.parseInline === 'function') {
      return window.marked.parseInline(value);
    }
    return escapeHtml(value);
  }

  function normalizeExtraFormat(value) {
    var next = String(value || '').trim().toLowerCase();
    return next === 'html' ? 'html' : 'markdown';
  }

  function normalizeDraftState(raw) {
    var src = raw || {};
    return {
      slug: String(src.slug || slug),
      type: String(src.type || 'contact'),
      title: String(src.title || ''),
      description: String(src.description || ''),
      publish_intro_to_nostr: !!src.publish_intro_to_nostr,
      extras_after: String(src.extras_after || ''),
      extras_after_format: normalizeExtraFormat(src.extras_after_format || 'markdown'),
      rows: normalizeRows(src.rows || [])
    };
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
    return payloadSlug === slug && payloadType === 'contact';
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
    state.draft = normalizeDraftState((cachedPayload && cachedPayload.state) || { title: '', description: '', rows: [] });
    state.navTitle = String((cachedPayload && cachedPayload.nav_title) || '').trim();
    state.navTitleEditing = false;
    state.navTitleInput = '';
    state.navTitleBusy = false;
    state.activeHeadField = '';
    state.activeRowIndex = -1;
    state.activeRowField = '';
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
    renderAll();
    markInitialContentPainted();
    return true;
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

  function normalizeRows(rows) {
    var list = Array.isArray(rows) ? rows : [];
    return list.map(function (row) {
      var transport = String(row && row.transport || '').trim().toLowerCase();
      var uid = normalizeRowUid(row && row._uid);
      if (row && typeof row === 'object' && !row._uid) {
        row._uid = uid;
      }
      return {
        _uid: uid,
        transport: transport,
        value: normalizeContactRowValue(transport, String(row && row.value || '')),
        qualifier: String(row && row.qualifier || '').trim().toLowerCase()
      };
    });
  }

  function getRenderState() {
    if (isAdmin()) {
      state.draft = normalizeDraftState(state.draft);
      return state.draft;
    }
    return normalizeDraftState((state.payload && state.payload.state) || { title: 'Profile', description: '', rows: [] });
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
    var actionsHost = document.getElementById('contact-page-title-actions');
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
    html += '<span class="list-page-nav-title-label">Link:</span>';
    if (editing) {
      var value = state.navTitleInput || current;
      html += '<span class="list-page-nav-title-edit-wrap">';
      html += '<input type="text" class="list-page-nav-title-input" data-page-nav-title-input="true" value="' + escapeHtml(value) + '" aria-label="Link title">';
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

  function qualifierLabel(qualifier) {
    var q = String(qualifier || '').trim().toLowerCase();
    if (!q) {
      return '';
    }
    var labels = {
      preferred: 'Preferred',
      unpreferred: 'Not preferred',
      public: 'Public',
      primary: 'Primary',
      secondary: 'Secondary',
      emergency: 'Emergencies only',
      archive: 'Archived'
    };
    return labels[q] || q;
  }

  function renderQualifierSelectOptions(selected) {
    var current = String(selected || '').trim().toLowerCase();
    var html = '';
    html += '<option value=""' + (!current ? ' selected' : '') + '>(none)</option>';
    html += '<option value="preferred"' + (current === 'preferred' ? ' selected' : '') + '>preferred</option>';
    html += '<option value="unpreferred"' + (current === 'unpreferred' ? ' selected' : '') + '>unpreferred</option>';
    html += '<option value="public"' + (current === 'public' ? ' selected' : '') + '>public</option>';
    html += '<option value="primary"' + (current === 'primary' ? ' selected' : '') + '>primary</option>';
    html += '<option value="secondary"' + (current === 'secondary' ? ' selected' : '') + '>secondary</option>';
    html += '<option value="emergency"' + (current === 'emergency' ? ' selected' : '') + '>emergency</option>';
    html += '<option value="archive"' + (current === 'archive' ? ' selected' : '') + '>archive</option>';
    return html;
  }

  function hasVisibleMainContent(rows, extrasAfter) {
    if (String(extrasAfter || '').trim()) {
      return true;
    }
    return normalizeRows(rows || []).some(function (row) {
      return String(row.transport || '').trim() && String(row.value || '').trim();
    });
  }

  function setActiveRowField(idx, field) {
    if (!Number.isInteger(idx) || idx < 0 || !field) {
      state.activeRowIndex = -1;
      state.activeRowField = '';
      return;
    }
    state.activeRowIndex = idx;
    state.activeRowField = String(field || '').trim().toLowerCase();
  }

  function clearActiveRowField() {
    state.activeRowIndex = -1;
    state.activeRowField = '';
  }

  function isActiveRowField(idx, field) {
    return Number(state.activeRowIndex) === Number(idx) && String(state.activeRowField || '') === String(field || '');
  }

  function syncDraftRowField(idx, field, value) {
    if (!Number.isInteger(idx) || idx < 0) {
      return false;
    }
    var key = String(field || '').trim();
    if (key !== 'transport' && key !== 'value' && key !== 'qualifier') {
      return false;
    }
    state.draft = normalizeDraftState(state.draft);
    state.draft.rows = normalizeRows(state.draft.rows || []);
    if (!state.draft.rows[idx]) {
      return false;
    }
    state.draft.rows[idx][key] = String(value || '');
    return true;
  }

  function captureRowFlipPositions() {
    var map = {};
    if (!els.content) {
      return map;
    }
    var nodes = els.content.querySelectorAll('.contact-profile-row[data-row-uid]');
    Array.prototype.forEach.call(nodes, function (node) {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      var uid = String(node.getAttribute('data-row-uid') || '').trim();
      if (!uid) {
        return;
      }
      map[uid] = node.getBoundingClientRect().top;
    });
    return map;
  }

  function playRowFlipAnimation(previous) {
    if (!els.content || !previous || typeof previous !== 'object') {
      return;
    }
    var nodes = els.content.querySelectorAll('.contact-profile-row[data-row-uid]');
    Array.prototype.forEach.call(nodes, function (node) {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      var uid = String(node.getAttribute('data-row-uid') || '').trim();
      if (!uid || !Object.prototype.hasOwnProperty.call(previous, uid)) {
        return;
      }
      var nextTop = node.getBoundingClientRect().top;
      var delta = Number(previous[uid]) - nextTop;
      if (!isFinite(delta) || Math.abs(delta) < 0.5) {
        return;
      }
      node.style.transition = 'none';
      node.style.transform = 'translateY(' + String(delta) + 'px)';
      node.getBoundingClientRect();
      node.style.transition = 'transform 240ms cubic-bezier(0.2, 0, 0, 1)';
      node.style.transform = '';
      var clear = function () {
        node.style.transition = '';
        node.style.transform = '';
      };
      node.addEventListener('transitionend', clear, { once: true });
      window.setTimeout(clear, 280);
    });
  }

  function dragGripIconSvg() {
    return '' +
      '<svg class="contact-drag-handle-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
      '<circle cx="5" cy="3" r="1.1" fill="currentColor"/>' +
      '<circle cx="11" cy="3" r="1.1" fill="currentColor"/>' +
      '<circle cx="5" cy="8" r="1.1" fill="currentColor"/>' +
      '<circle cx="11" cy="8" r="1.1" fill="currentColor"/>' +
      '<circle cx="5" cy="13" r="1.1" fill="currentColor"/>' +
      '<circle cx="11" cy="13" r="1.1" fill="currentColor"/>' +
      '</svg>';
  }

  function deleteIconSvg() {
    return '' +
      '<svg class="contact-delete-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.2" d="M6 6l12 12M18 6L6 18"/>' +
      '</svg>';
  }

  function reorderDraftRowsByUid(fromUid, toUid) {
    var sourceUid = String(fromUid || '').trim();
    var targetUid = String(toUid || '').trim();
    if (!sourceUid || !targetUid || sourceUid === targetUid) {
      return false;
    }
    state.draft = normalizeDraftState(state.draft);
    var rows = normalizeRows(state.draft.rows || []);
    var fromIdx = -1;
    var toIdx = -1;
    for (var i = 0; i < rows.length; i += 1) {
      var uid = String(rows[i] && rows[i]._uid || '').trim();
      if (uid === sourceUid) {
        fromIdx = i;
      }
      if (uid === targetUid) {
        toIdx = i;
      }
    }
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) {
      return false;
    }
    var moving = rows.splice(fromIdx, 1)[0];
    if (fromIdx < toIdx) {
      toIdx -= 1;
    }
    rows.splice(toIdx, 0, moving);
    state.draft.rows = rows;
    state.payload.state = normalizeDraftState(state.draft);
    return true;
  }

  function focusActiveInlineFieldSoon() {
    if (!isAdmin() || !state.editMode || !Number.isInteger(state.activeRowIndex) || state.activeRowIndex < 0 || !state.activeRowField) {
      return;
    }
    requestAnimationFrame(function () {
      var selector = '[data-contact-inline-field="' + String(state.activeRowField) + '"][data-row-index="' + String(state.activeRowIndex) + '"]';
      var node = root.querySelector(selector);
      if (!(node instanceof HTMLElement) || typeof node.focus !== 'function') {
        return;
      }
      node.focus();
      if (node instanceof HTMLInputElement && typeof node.select === 'function') {
        node.select();
      }
    });
  }

  function normalizeTransportKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function isSafeContactHref(href) {
    var value = String(href || '').trim();
    return /^(https?:\/\/|mailto:)/i.test(value);
  }

  function splitTrailingPunctuation(urlText) {
    var value = String(urlText || '');
    var trailing = '';
    while (value && /[.,;!?]$/.test(value)) {
      trailing = value.slice(-1) + trailing;
      value = value.slice(0, -1);
    }
    while (value && /\)$/.test(value)) {
      var opens = (value.match(/\(/g) || []).length;
      var closes = (value.match(/\)/g) || []).length;
      if (closes <= opens) {
        break;
      }
      trailing = ')' + trailing;
      value = value.slice(0, -1);
    }
    return {
      url: value,
      trailing: trailing
    };
  }

  function renderContactHref(href, label) {
    var safeHref = String(href || '').trim();
    var text = String(label || safeHref || '');
    if (!isSafeContactHref(safeHref)) {
      return escapeHtml(text);
    }
    var lower = safeHref.toLowerCase();
    if (lower.indexOf('mailto:') === 0) {
      if (!text || text === safeHref || /^mailto:/i.test(text)) {
        text = safeHref.slice(7);
      }
      return '<a class="contact-value-link" href="' + escapeAttr(safeHref) + '">' + escapeHtml(text || safeHref) + '</a>';
    }
    return '<a class="contact-value-link" href="' + escapeAttr(safeHref) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(text) + '</a>';
  }

  function linkifyBareEmailText(text) {
    var raw = String(text || '');
    if (!raw) {
      return '';
    }
    var html = '';
    var pattern = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/ig;
    var lastIndex = 0;
    var match;
    while ((match = pattern.exec(raw)) !== null) {
      html += escapeHtml(raw.slice(lastIndex, match.index)).replace(/\n/g, '<br>');
      html += renderContactHref('mailto:' + match[1], match[1]);
      lastIndex = match.index + match[0].length;
    }
    html += escapeHtml(raw.slice(lastIndex)).replace(/\n/g, '<br>');
    return html;
  }

  function renderPlainContactChunk(text, transport) {
    var raw = String(text || '');
    if (!raw) {
      return '';
    }
    var transportKey = normalizeTransportKey(transport);
    if (transportKey === 'email' || transportKey === 'mail') {
      return linkifyBareEmailText(raw);
    }
    if (transportKey === 'phone' || transportKey === 'tel' || transportKey === 'telephone') {
      var trimmed = raw.trim();
      if (trimmed && /^(\+?[0-9][0-9\s().-]{6,}[0-9])$/.test(trimmed)) {
        var telTarget = 'tel:' + trimmed.replace(/[^\d+]/g, '');
        return renderContactHref(telTarget, trimmed);
      }
    }
    return escapeHtml(raw).replace(/\n/g, '<br>');
  }

  function normalizeContactHrefForComparison(href) {
    var raw = String(href || '').trim();
    if (!raw) {
      return '';
    }
    if (/^mailto:/i.test(raw)) {
      return 'mailto:' + raw.slice(7).trim().toLowerCase();
    }
    try {
      var parsed = new URL(raw);
      var path = String(parsed.pathname || '/').replace(/\/+$/, '');
      if (!path) {
        path = '/';
      }
      return parsed.protocol.toLowerCase() + '//' + parsed.host.toLowerCase() + path + String(parsed.search || '');
    } catch (_err) {
      return raw.toLowerCase().replace(/\/+$/, '');
    }
  }

  function normalizeLegacyContactUrl(rawUrl) {
    var value = String(rawUrl || '').trim();
    if (!value) {
      return '';
    }
    if (/^http:\/\//i.test(value)) {
      return 'https://' + value.slice(7);
    }
    return value;
  }

  function inferContactHrefFromTransport(value, transport) {
    var raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    var transportKey = normalizeTransportKey(transport);
    var match;
    if (transportKey === 'email' || transportKey === 'mail') {
      match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (match && match[0]) {
        return 'mailto:' + match[0];
      }
    }
    if (transportKey === 'telegram') {
      if (/^@?[a-z0-9_]{3,}$/i.test(raw)) {
        return 'https://t.me/' + raw.replace(/^@/, '');
      }
    }
    if (transportKey === 'twitter' || transportKey === 'x') {
      if (/^@?[a-z0-9_]{1,15}$/i.test(raw)) {
        return 'https://x.com/' + raw.replace(/^@/, '');
      }
    }
    if (transportKey === 'reddit') {
      if (/^\/?u\/[a-z0-9_-]+$/i.test(raw)) {
        return 'https://reddit.com/' + raw.replace(/^\//, '');
      }
      if (/^[a-z0-9_-]+$/i.test(raw)) {
        return 'https://reddit.com/u/' + raw;
      }
    }
    if (transportKey === 'facebook' && /^[a-z0-9.]{3,}$/i.test(raw)) {
      return 'https://facebook.com/' + raw;
    }
    if (transportKey === 'tumblr') {
      if (/^[a-z0-9-]+\.tumblr\.com$/i.test(raw)) {
        return 'https://' + raw;
      }
      if (/^[a-z0-9-]+$/i.test(raw)) {
        return 'https://' + raw + '.tumblr.com';
      }
    }
    return '';
  }

  function inferContactLinkFromTransport(value, transport) {
    var href = inferContactHrefFromTransport(value, transport);
    if (!href) {
      return '';
    }
    return renderContactHref(href, String(value || '').trim());
  }

  function normalizeContactValue(transport, value) {
    var raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    var normalized = raw;

    normalized = normalized.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/ig, function (_m, labelRaw, hrefRaw) {
      var label = String(labelRaw || '').trim();
      var href = normalizeLegacyContactUrl(hrefRaw);
      if (!label) {
        return href;
      }
      if (/^mailto:/i.test(href)) {
        var addr = href.slice(7).trim();
        if (/^mailto:/i.test(label) || label.toLowerCase() === addr.toLowerCase()) {
          return addr;
        }
      }
      var inferred = inferContactHrefFromTransport(label, transport);
      if (inferred && normalizeContactHrefForComparison(inferred) === normalizeContactHrefForComparison(href)) {
        return label;
      }
      return label + ' (' + href + ')';
    });

    normalized = normalized.replace(/(.+?)\s*\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/ig, function (_m, labelRaw, hrefRaw) {
      var label = String(labelRaw || '').trim();
      var href = normalizeLegacyContactUrl(hrefRaw);
      if (!label) {
        return href;
      }
      if (/^mailto:/i.test(href)) {
        var email = href.slice(7).trim();
        if (/^mailto:/i.test(label) || label.toLowerCase() === email.toLowerCase()) {
          return email;
        }
      }
      var inferred = inferContactHrefFromTransport(label, transport);
      if (inferred && normalizeContactHrefForComparison(inferred) === normalizeContactHrefForComparison(href)) {
        return label;
      }
      return label + ' (' + href + ')';
    });

    if (normalizeTransportKey(transport) === 'email') {
      normalized = normalized.replace(/^mailto:\s*/i, '');
    }

    normalized = normalized.replace(/\s*;\s*/g, '; ');
    normalized = normalized.replace(/\s{2,}/g, ' ').trim();
    return normalized;
  }

  function normalizeContactRowValue(transport, value) {
    return normalizeContactValue(transport, value);
  }

  function linkifyPlainContactText(text, transport) {
    var raw = String(text || '');
    if (!raw) {
      return '';
    }
    var html = '';
    var pattern = /(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+)/ig;
    var lastIndex = 0;
    var match;
    while ((match = pattern.exec(raw)) !== null) {
      html += renderPlainContactChunk(raw.slice(lastIndex, match.index), transport);
      var candidate = splitTrailingPunctuation(match[0]);
      if (candidate.url && isSafeContactHref(candidate.url)) {
        html += renderContactHref(candidate.url, candidate.url);
      } else {
        html += escapeHtml(match[0]);
      }
      if (candidate.trailing) {
        html += escapeHtml(candidate.trailing);
      }
      lastIndex = match.index + match[0].length;
    }
    html += renderPlainContactChunk(raw.slice(lastIndex), transport);
    return html;
  }

  function linkifyContactValue(value, transport) {
    var raw = String(value || '');
    if (!raw) {
      return '';
    }
    var html = '';
    var pattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
    var lastIndex = 0;
    var match;
    while ((match = pattern.exec(raw)) !== null) {
      html += linkifyPlainContactText(raw.slice(lastIndex, match.index), transport);
      var label = String(match[1] || '').trim();
      var href = String(match[2] || '').trim();
      if (isSafeContactHref(href)) {
        html += renderContactHref(href, label || href);
      } else {
        html += escapeHtml(match[0]);
      }
      lastIndex = match.index + match[0].length;
    }
    html += linkifyPlainContactText(raw.slice(lastIndex), transport);
    if (html.indexOf('<a ') !== -1) {
      return html;
    }
    return inferContactLinkFromTransport(raw, transport) || html;
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
    var node = document.getElementById('contact-admin-save-status');
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
      if (isAdmin()) {
        if (state.activeHeadField === 'title') {
          els.title.innerHTML = '<span class="list-page-title-edit-wrap"><input id="contact-head-title-input" class="list-head-inline-input" type="text" value="' + escapeHtml(s.title || 'Profile') + '" data-contact-head-input="title"></span> <button type="button" class="list-inline-edit-link" data-contact-head-save="title">Save</button><span id="contact-page-title-actions" class="list-page-title-actions"></span>';
        } else if (state.editMode) {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'Profile') + '</span> <button type="button" class="list-inline-edit-link" data-contact-head-edit="title">Edit...</button><span id="contact-page-title-actions" class="list-page-title-actions"></span>';
        } else {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'Profile') + '</span><span id="contact-page-title-actions" class="list-page-title-actions"></span>';
        }
      } else {
        els.title.textContent = s.title || 'Profile';
      }
    }
    renderNavbarTitleRow(s);
    if (els.description) {
      var text = String(s.description || '').trim();
      var hasMainContent = hasVisibleMainContent(s.rows || [], s.extras_after || '');
      if (isAdmin()) {
        var suppressEmptyDescription = !text && !hasMainContent && state.activeHeadField !== 'description';
        els.description.hidden = suppressEmptyDescription;
        if (suppressEmptyDescription) {
          els.description.innerHTML = '';
        } else if (state.activeHeadField === 'description') {
          els.description.innerHTML = '<span class="list-page-description-edit-wrap"><input id="contact-head-description-input" class="list-head-inline-input list-head-description-input" type="text" value="' + escapeHtml(text) + '" data-contact-head-input="description"></span> <button type="button" class="list-inline-edit-link" data-contact-head-save="description">Save</button> <label class="checkbox-control contact-description-publish-toggle"><input type="checkbox" data-contact-intro-publish="true"' + (s.publish_intro_to_nostr ? ' checked' : '') + '> <span>Nostr</span></label>';
        } else if (state.editMode) {
          if (text) {
            els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(text) + '</span> <button type="button" class="list-inline-edit-link" data-contact-head-edit="description">Edit...</button>';
          } else {
            els.description.innerHTML = '<span class="list-page-description-empty">No description.</span> <button type="button" class="list-inline-edit-link" data-contact-head-edit="description">Edit...</button>';
          }
        } else if (text) {
          els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(text) + '</span>';
          els.description.hidden = false;
        } else if (!hasMainContent) {
          els.description.hidden = true;
          els.description.innerHTML = '';
        } else {
          els.description.hidden = false;
          els.description.innerHTML = '<span class="list-page-description-empty">No description.</span>';
        }
      } else if (text) {
        els.description.hidden = false;
        els.description.innerHTML = markdownInline(text);
      } else if (!hasMainContent) {
        els.description.hidden = true;
        els.description.innerHTML = '';
      } else {
        els.description.hidden = false;
        els.description.innerHTML = '<span class="list-page-description-empty">No description.</span>';
      }
    }
    if (isAdmin() && state.activeHeadField) {
      requestAnimationFrame(function () {
        var id = state.activeHeadField === 'title' ? 'contact-head-title-input' : 'contact-head-description-input';
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

    var actionsHost = document.getElementById('contact-page-title-actions');
    var html = '<span class="list-page-admin-bar">';
    if (state.saveIndicatorVisible) {
      html += '<span id="contact-admin-save-status" class="list-admin-save-status" aria-live="polite">';
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
      html += '<button type="button" data-contact-action="revert" title="' + escapeHtml(revertTitle) + '"' + (canRevert ? '' : ' disabled aria-disabled="true"') + '>Revert</button>';
    }
    if (showPublish) {
      html += '<button type="button" class="list-admin-primary-btn" data-contact-action="publish">Publish to Nostr...</button>';
    }
    html += '<button type="button" class="list-admin-primary-btn" data-contact-action="toggle-edit">' + (state.editMode ? 'Done' : 'Edit') + '</button>';
    html += '</span>';

    if (actionsHost) {
      actionsHost.innerHTML = html;
    }
    els.admin.hidden = true;
    els.admin.innerHTML = '';
  }

  function renderReadOnly(rows, editable) {
    var normalized = normalizeRows(rows || []);
    var list = editable ? normalized : normalized.filter(function (row) {
      return String(row.transport || '').trim() && String(row.value || '').trim();
    });
    var html = '';
    if (editable) {
      html += '<div class="contact-inline-toolbar">';
      html += '<div class="contact-inline-toolbar-spacer"></div>';
      html += '<div class="contact-inline-toolbar-right"><button type="button" data-contact-action="add-row" title="Add profile row">+</button></div>';
      html += '</div>';
    }
    if (!list.length) {
      return html + '<p class="list-page-empty-state">No content yet.</p>';
    }
    html += '<div class="contact-profile-table-wrap"><table class="contact-profile-table' + (editable ? ' is-editing' : '') + '"><tbody>';
    list.forEach(function (row, idx) {
      var transport = String(row.transport || '').trim();
      var value = String(row.value || '');
      var qValue = String(row.qualifier || '').trim().toLowerCase();
      var qLabel = qualifierLabel(qValue);
      var uid = String(row._uid || '').trim();

      var rowClasses = 'contact-profile-row';
      if (editable && state.dragOverRowUid && state.dragOverRowUid === uid) {
        rowClasses += ' is-drag-over';
      }
      if (editable && state.draggingRowUid && state.draggingRowUid === uid) {
        rowClasses += ' is-dragging';
      }
      html += '<tr class="' + rowClasses + '" data-row-index="' + String(idx) + '" data-row-uid="' + escapeAttr(uid) + '">';
      if (editable) {
        html += '<td class="contact-handle-cell"><button type="button" class="unobtrusive-icon-button contact-drag-handle" data-contact-drag-handle="true" data-row-uid="' + escapeAttr(uid) + '" title="Drag to reorder" aria-label="Drag to reorder" draggable="true">' + dragGripIconSvg() + '</button></td>';
      }
      html += '<th scope="row" class="contact-platform-cell">';
      if (editable && isActiveRowField(idx, 'transport')) {
        html += '<input type="text" class="contact-inline-input" data-contact-inline-field="transport" data-row-index="' + String(idx) + '" value="' + escapeHtml(transport) + '" placeholder="transport">';
      } else if (editable) {
        html += '<button type="button" class="contact-inline-open contact-platform-open" data-contact-inline-action="edit-cell" data-contact-inline-field="transport" data-row-index="' + String(idx) + '"><span class="contact-inline-open-value">' + (transport ? escapeHtml(transport) : '<span class="list-inline-placeholder">Add transport...</span>') + '</span></button>';
      } else {
        html += escapeHtml(transport);
      }
      html += '</th>';

      html += '<td class="contact-value-cell">';
      if (editable && isActiveRowField(idx, 'value')) {
        html += '<input type="text" class="contact-inline-input contact-value-inline-input" data-contact-inline-field="value" data-row-index="' + String(idx) + '" value="' + escapeHtml(value) + '" placeholder="value">';
      } else if (editable) {
        html += '<button type="button" class="contact-inline-open contact-value-open" data-contact-inline-action="edit-cell" data-contact-inline-field="value" data-row-index="' + String(idx) + '"><span class="contact-inline-open-value">' + (String(value || '').trim() ? escapeHtml(value).replace(/\n/g, '<br>') : '<span class="list-inline-placeholder">Add value...</span>') + '</span></button>';
      } else {
        html += '<div class="contact-value-main">' + linkifyContactValue(value, transport) + '</div>';
      }

      html += '<span class="contact-qualifier-wrap">';
      if (editable && isActiveRowField(idx, 'qualifier')) {
        html += '<select class="contact-inline-select" data-contact-inline-field="qualifier" data-row-index="' + String(idx) + '">';
        html += renderQualifierSelectOptions(qValue);
        html += '</select>';
      } else if (editable) {
        html += '<button type="button" class="contact-inline-open contact-qualifier-open" data-contact-inline-action="edit-cell" data-contact-inline-field="qualifier" data-row-index="' + String(idx) + '">';
        if (qLabel) {
          html += '<span class="contact-qualifier-pill" data-qualifier="' + escapeAttr(qValue) + '">' + escapeHtml(qLabel) + '</span>';
        } else {
          html += '<span class="list-inline-placeholder">Set qualifier...</span>';
        }
        html += '</button>';
        html += '<button type="button" class="icon-danger unobtrusive-icon-button contact-row-delete" data-contact-action="remove-row" data-row-index="' + String(idx) + '" title="Delete this entry" aria-label="Delete this entry">' + deleteIconSvg() + '</button>';
      } else if (qLabel) {
        html += '<span class="contact-qualifier-pill" data-qualifier="' + escapeAttr(qValue) + '">' + escapeHtml(qLabel) + '</span>';
      }
      html += '</span>';
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderContent() {
    if (!els.content) {
      return;
    }
    var s = getRenderState();
    var rows = normalizeRows(s.rows || []);
    var afterContent = '';
    if (String(s.extras_after || '').trim()) {
      afterContent = '<section class="nostr-page-extra nostr-page-extra-after">' +
        (s.extras_after_format === 'html' ? String(s.extras_after || '') : markdownBlock(s.extras_after || '')) +
        '</section>';
    }
    var inlineMode = isAdmin() && state.editMode;
    els.content.innerHTML = renderReadOnly(rows, inlineMode) + afterContent;
    if (state.pendingFlipPositions) {
      playRowFlipAnimation(state.pendingFlipPositions);
      state.pendingFlipPositions = null;
    }
    if (inlineMode) {
      focusActiveInlineFieldSoon();
    }
  }

  function renderAll() {
    renderHead();
    renderAdmin();
    renderContent();
    renderValidation();
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
    var auth = authPayload();
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
    load();
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
      if (isAdmin() && state.editMode) {
        var navTitleActionNode = target.closest('[data-page-nav-title-action]');
        if (navTitleActionNode instanceof HTMLElement) {
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
        var headEditNode = target.closest('[data-contact-head-edit]');
        if (headEditNode instanceof HTMLElement) {
          event.preventDefault();
          state.activeHeadField = String(headEditNode.getAttribute('data-contact-head-edit') || '').trim().toLowerCase();
          renderHead();
          return;
        }
        var headSaveNode = target.closest('[data-contact-head-save]');
        if (headSaveNode instanceof HTMLElement) {
          event.preventDefault();
          state.activeHeadField = '';
          renderHead();
          renderAdmin();
          queueAutosave(250);
          return;
        }
        var inlineActionNode = target.closest('[data-contact-inline-action]');
        if (inlineActionNode instanceof HTMLElement) {
          event.preventDefault();
          var inlineAction = String(inlineActionNode.getAttribute('data-contact-inline-action') || '');
          if (inlineAction === 'edit-cell') {
            var inlineIdx = Number(inlineActionNode.getAttribute('data-row-index'));
            var inlineField = String(inlineActionNode.getAttribute('data-contact-inline-field') || '').trim().toLowerCase();
            if (Number.isInteger(inlineIdx) && inlineIdx >= 0 && (inlineField === 'transport' || inlineField === 'value' || inlineField === 'qualifier')) {
              setActiveRowField(inlineIdx, inlineField);
              renderContent();
            }
            return;
          }
        }
      }
      var actionNode = target.closest('[data-contact-action]');
      if (!(actionNode instanceof HTMLElement) || !isAdmin()) {
        return;
      }
      var action = String(actionNode.getAttribute('data-contact-action') || '');
      if (action === 'toggle-edit') {
        state.editMode = !state.editMode;
        if (!state.editMode) {
          state.navTitleEditing = false;
          state.navTitleInput = '';
          state.activeHeadField = '';
          clearActiveRowField();
          state.draggingRowUid = '';
          state.dragOverRowUid = '';
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
        return;
      }
      if (action === 'add-row') {
        state.draft = normalizeDraftState(state.draft);
        state.draft.rows.push({ _uid: nextRowUid(), transport: '', value: '', qualifier: '' });
        setActiveRowField(state.draft.rows.length - 1, 'transport');
        renderAll();
        queueAutosave(500);
        return;
      }
      if (action === 'remove-row') {
        var idx = Number(actionNode.getAttribute('data-row-index'));
        if (!Number.isInteger(idx) || idx < 0) {
          return;
        }
        state.draft.rows = normalizeRows(state.draft.rows || []).filter(function (_row, i) {
          return i !== idx;
        });
        if (state.activeRowIndex === idx) {
          clearActiveRowField();
        } else if (state.activeRowIndex > idx) {
          state.activeRowIndex -= 1;
        }
        renderAll();
        queueAutosave(500);
      }
    });

    root.addEventListener('dragstart', function (event) {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var handle = target.closest('[data-contact-drag-handle]');
      if (!(handle instanceof HTMLElement)) {
        return;
      }
      var uid = String(handle.getAttribute('data-row-uid') || '').trim();
      if (!uid) {
        return;
      }
      state.draggingRowUid = uid;
      state.dragOverRowUid = uid;
      state.dragMoved = false;
      state.dragDropped = false;
      state.dragStartRows = normalizeRows((state.draft && state.draft.rows) || []);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        try {
          event.dataTransfer.setData('text/plain', uid);
        } catch (_err) {
          // Ignore dataTransfer restrictions.
        }
      }
      var row = handle.closest('.contact-profile-row[data-row-uid]');
      if (row instanceof HTMLElement) {
        row.classList.add('is-dragging');
      }
    });

    root.addEventListener('dragover', function (event) {
      if (!isAdmin() || !state.editMode || !state.draggingRowUid) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var row = target.closest('.contact-profile-row[data-row-uid]');
      if (!(row instanceof HTMLElement)) {
        return;
      }
      var uid = String(row.getAttribute('data-row-uid') || '').trim();
      if (!uid) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      if (state.dragOverRowUid !== uid) {
        state.dragOverRowUid = uid;
        var sourceUid = String(state.draggingRowUid || '').trim();
        if (sourceUid && uid !== sourceUid) {
          var before = captureRowFlipPositions();
          var changed = reorderDraftRowsByUid(sourceUid, uid);
          if (changed) {
            state.pendingFlipPositions = before;
            state.dragMoved = true;
          }
        }
        renderContent();
      }
    });

    root.addEventListener('drop', function (event) {
      if (!isAdmin() || !state.editMode || !state.draggingRowUid) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var row = target.closest('.contact-profile-row[data-row-uid]');
      if (!(row instanceof HTMLElement)) {
        return;
      }
      event.preventDefault();
      var targetUid = String(row.getAttribute('data-row-uid') || '').trim();
      var sourceUid = String(state.draggingRowUid || '').trim();
      state.dragDropped = true;
      if (!sourceUid || !targetUid || sourceUid === targetUid) {
        state.draggingRowUid = '';
        state.dragOverRowUid = '';
        state.dragMoved = false;
        state.dragDropped = false;
        state.dragStartRows = null;
        renderContent();
        return;
      }
      var moved = false;
      if (state.dragMoved) {
        moved = true;
      } else {
        state.pendingFlipPositions = captureRowFlipPositions();
        moved = reorderDraftRowsByUid(sourceUid, targetUid);
      }
      state.draggingRowUid = '';
      state.dragOverRowUid = '';
      state.dragMoved = false;
      state.dragDropped = false;
      state.dragStartRows = null;
      if (moved) {
        clearActiveRowField();
        renderContent();
        queueAutosave(300);
      } else {
        state.pendingFlipPositions = null;
        renderContent();
      }
    });

    root.addEventListener('dragend', function () {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      if (!state.dragDropped && state.dragMoved && Array.isArray(state.dragStartRows)) {
        state.draft = normalizeDraftState(state.draft);
        state.draft.rows = normalizeRows(state.dragStartRows);
      }
      state.draggingRowUid = '';
      state.dragOverRowUid = '';
      state.dragMoved = false;
      state.dragDropped = false;
      state.dragStartRows = null;
      renderContent();
    });

    root.addEventListener('input', function (event) {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-page-nav-title-input')) {
        state.navTitleInput = String(target.value || '');
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-intro-publish')) {
        state.draft = normalizeDraftState(state.draft);
        state.draft.publish_intro_to_nostr = !!target.checked;
        queueAutosave(500);
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-head-input')) {
        var headField = String(target.getAttribute('data-contact-head-input') || '').trim().toLowerCase();
        state.draft = normalizeDraftState(state.draft);
        if (headField === 'title') {
          state.draft.title = String(target.value || '');
        } else if (headField === 'description') {
          state.draft.description = String(target.value || '');
        } else {
          return;
        }
        queueAutosave(500);
        return;
      }

      var field = String(target.getAttribute('data-contact-inline-field') || '').trim().toLowerCase();
      var idx = Number(target.getAttribute('data-row-index'));
      if (!Number.isInteger(idx) || idx < 0 || (field !== 'transport' && field !== 'value' && field !== 'qualifier')) {
        return;
      }
      if (!syncDraftRowField(idx, field, target.value || '')) {
        return;
      }
      queueAutosave(500);
    });

    root.addEventListener('change', function (event) {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-intro-publish')) {
        state.draft = normalizeDraftState(state.draft);
        state.draft.publish_intro_to_nostr = !!target.checked;
        queueAutosave(500);
        renderHead();
        return;
      }
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }
      var field = String(target.getAttribute('data-contact-inline-field') || '').trim().toLowerCase();
      var idx = Number(target.getAttribute('data-row-index'));
      if (!Number.isInteger(idx) || idx < 0 || (field !== 'transport' && field !== 'value' && field !== 'qualifier')) {
        return;
      }
      if (!syncDraftRowField(idx, field, target.value || '')) {
        return;
      }
      queueAutosave(500);
      if (field === 'qualifier') {
        clearActiveRowField();
        renderContent();
      }
    });

    root.addEventListener('focusin', function (event) {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.hasAttribute('data-contact-inline-field')) {
        var field = String(target.getAttribute('data-contact-inline-field') || '').trim().toLowerCase();
        var idx = Number(target.getAttribute('data-row-index'));
        if (Number.isInteger(idx) && idx >= 0 && (field === 'transport' || field === 'value' || field === 'qualifier')) {
          setActiveRowField(idx, field);
        }
        return;
      }
      if (target.hasAttribute('data-contact-head-input')) {
        state.activeHeadField = String(target.getAttribute('data-contact-head-input') || '').trim().toLowerCase();
      }
    });

    root.addEventListener('focusout', function (event) {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var leavingInline = target.hasAttribute('data-contact-inline-field');
      var leavingHead = target.hasAttribute('data-contact-head-input');
      if (!leavingInline && !leavingHead) {
        return;
      }
      window.setTimeout(function () {
        var active = document.activeElement;
        if (active instanceof HTMLElement && root.contains(active) && (active.hasAttribute('data-contact-inline-field') || active.hasAttribute('data-contact-head-input') || active.hasAttribute('data-page-nav-title-input'))) {
          return;
        }
        if (leavingInline && state.activeRowIndex >= 0) {
          clearActiveRowField();
          renderContent();
          return;
        }
        if (leavingHead && state.activeHeadField) {
          state.activeHeadField = '';
          renderHead();
        }
      }, 0);
    });

    root.addEventListener('keydown', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-page-nav-title-input') && event.key === 'Enter') {
        event.preventDefault();
        saveNavbarTitle();
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-head-input') && event.key === 'Enter') {
        event.preventDefault();
        state.activeHeadField = '';
        renderHead();
        queueAutosave(250);
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-head-input') && event.key === 'Escape') {
        event.preventDefault();
        state.activeHeadField = '';
        renderHead();
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-inline-field') && event.key === 'Enter') {
        event.preventDefault();
        clearActiveRowField();
        renderContent();
        queueAutosave(250);
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-inline-field') && event.key === 'Escape') {
        event.preventDefault();
        clearActiveRowField();
        renderContent();
      }
    });
  }

  function maybeReloadForAuthChange() {
    var nextSig = authPayload().session_token + '|' + authPayload().csrf_token;
    var lastSig = state.authSignature || '';
    if (nextSig !== lastSig) {
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
      if (!isExpectedPayload(payload)) {
        throw new Error('Unexpected page payload for profile page');
      }
      state.payload = payload;
      state.draft = normalizeDraftState(payload.state || { title: '', description: '', rows: [] });
      state.navTitle = String(payload.nav_title || '').trim();
      state.navTitleEditing = false;
      state.navTitleInput = '';
      state.navTitleBusy = false;
      state.activeHeadField = '';
      state.activeRowIndex = -1;
      state.activeRowField = '';
      state.saveIndicatorVisible = false;
      setSaveStatus('saved');
      writeBootstrapCache(payload);
      renderAll();
      markInitialContentPainted();
    }).catch(function (err) {
      if (els.content) {
        els.content.innerHTML = '<p class="placeholder">Error: ' + escapeHtml(err.message || 'Could not load page') + '</p>';
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
  load();
})();
