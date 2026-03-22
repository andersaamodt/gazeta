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
  var PAGE_BOOTSTRAP_CACHE_PREFIX = 'nostr_page_bootstrap_v1:';
  var markedUpgradeTimer = 0;
  var markedUpgradeAttempts = 0;

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

  function normalizeDraftState(raw) {
    var src = raw || {};
    return {
      slug: String(src.slug || slug),
      type: String(src.type || 'nip23'),
      title: String(src.title || ''),
      content: String(src.content || ''),
      extras_after: String(src.extras_after || ''),
      extras_after_format: normalizeExtraFormat(src.extras_after_format || 'markdown')
    };
  }

  function authPayload() {
    return {
      session_token: String(localStorage.getItem('session_token') || '').trim(),
      csrf_token: String(localStorage.getItem('csrf_token') || '').trim()
    };
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
    return payloadSlug === slug && payloadType === 'nip23';
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
    state.draft = normalizeDraftState((cachedPayload && cachedPayload.state) || { title: '', content: '' });
    state.navTitle = String((cachedPayload && cachedPayload.nav_title) || '').trim();
    state.navTitleEditing = false;
    state.navTitleInput = '';
    state.navTitleBusy = false;
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
    renderAll();
    markInitialContentPainted();
    markHydrationPageReady();
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

  function renderContent() {
    if (!els.content) {
      return;
    }
    var s = getRenderState();
    var outroHtml = '';
    if (String(s.extras_after || '').trim()) {
      outroHtml = '<section class="nostr-page-extra nostr-page-extra-after">' +
        (s.extras_after_format === 'html' ? String(s.extras_after || '') : markdownBlock(s.extras_after || '')) +
        '</section>';
    }

    var hasMainContent = String(s.content || '').trim().length > 0;
    var readOnlyMain = hasMainContent
      ? '<article class="list-entry-markdown">' + markdownBlock(s.content || '') + '</article>'
      : '<p class="list-page-empty-state">No content yet.</p>';

    if (isAdmin() && state.editMode) {
      var html = '';
      html += '<section class="nostr-page-extras-editor" aria-label="Page editor">';
      html += '<h3 class="nostr-page-extras-heading">Edit page</h3>';
      html += '<label class="nostr-page-extra-edit"><span>Title <span class="nostr-page-scope-pill is-nostr">Nostr</span></span><input type="text" id="nip23-title-input" value="' + escapeHtml(s.title || '') + '"></label>';
      html += '<label class="nostr-page-extra-edit"><span>Content (Markdown) <span class="nostr-page-scope-pill is-nostr">Nostr</span></span><textarea id="nip23-content-input" rows="12" placeholder="Write markdown content">' + escapeHtml(s.content || '') + '</textarea></label>';
      html += '<label class="nostr-page-extra-edit"><span>After content <span class="nostr-page-scope-pill is-local">Local</span></span><span class="nostr-page-extra-controls"><select id="nip23-outro-format"><option value="markdown"' + (s.extras_after_format === 'markdown' ? ' selected' : '') + '>Markdown</option><option value="html"' + (s.extras_after_format === 'html' ? ' selected' : '') + '>HTML</option></select></span><textarea id="nip23-outro-input" rows="5" placeholder="Optional local content shown after the main content section">' + escapeHtml(s.extras_after || '') + '</textarea></label>';
      html += '</section>';
      html += readOnlyMain;
      html += outroHtml;
      els.content.innerHTML = html;
      return;
    }

    els.content.innerHTML = readOnlyMain + outroHtml;
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

  function publishDraft() {
    if (state.busy || !isAdmin()) {
      return;
    }
    var payload = authPayload();
    state.busy = true;
    setSaveStatus('saving');
    apiPost('/cgi/blog-publish-nostr-page', {
      page_slug: slug,
      session_token: payload.session_token,
      csrf_token: payload.csrf_token
    }).then(function (data) {
      state.payload.state = data.state;
      state.payload.canonical_state = data.state;
      state.payload.validation = data.validation || { errors: [], warnings: [], can_publish: true };
      state.payload.canonical_exists = true;
      state.payload.draft_exists = true;
      state.payload.draft_differs = false;
      state.draft = normalizeDraftState(data.state);
      setSaveStatus('saved');
      renderAll();
    }).catch(function (err) {
      setSaveStatus('error');
      window.alert(err.message || 'Could not publish to Nostr');
    }).finally(function () {
      state.busy = false;
    });
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
      if (!(target instanceof HTMLElement) || !isAdmin()) {
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
      var actionNode = target.closest('[data-nip23-action]');
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
      if (target.id === 'nip23-outro-input') {
        state.draft.extras_after = String(target.value || '');
        queueAutosave(500);
        return;
      }
      if (target.id === 'nip23-outro-format' && target instanceof HTMLSelectElement) {
        state.draft.extras_after_format = normalizeExtraFormat(target.value || '');
        renderContent();
        queueAutosave(500);
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
      if (!isExpectedPayload(payload)) {
        throw new Error('Unexpected page payload for long-form page');
      }
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
  renderFromBootstrapCache();
  load();
})();
