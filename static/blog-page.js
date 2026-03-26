(function () {
  'use strict';

  var CACHE_KEY = 'wizardry_blog_posts_v2';
  var POSTS_CACHE_MAX_AGE_MS = 15000;
  var root = document.getElementById('blog-page-root');
  if (!root) {
    return;
  }

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

  var querySlug = '';
  try {
    var params = new URLSearchParams(window.location.search);
    querySlug = String(params.get('page_slug') || params.get('slug') || '').trim();
  } catch (_queryErr) {
    querySlug = '';
  }
  var pathSlug = slugFromPathname(window.location.pathname || '');
  var attrSlug = String(root.getAttribute('data-blog-slug') || root.getAttribute('data-page-slug') || '').trim();
  var slug = String(querySlug || pathSlug || attrSlug || 'blog').trim() || 'blog';
  var els = {
    title: document.getElementById('blog-page-title'),
    description: document.getElementById('blog-page-description'),
    admin: document.getElementById('blog-page-admin'),
    validation: document.getElementById('blog-page-validation'),
    content: document.getElementById('blog-page-content'),
    settings: document.getElementById('blog-page-settings'),
    toggle: document.getElementById('blog-filter-toggle'),
    panel: document.getElementById('blog-filter-panel'),
    tags: document.getElementById('blog-filter-tags'),
    years: document.getElementById('blog-filter-years'),
    types: document.getElementById('blog-filter-types'),
    clear: document.getElementById('blog-clear-filters'),
    list: document.getElementById('blog-post-list'),
    empty: document.getElementById('blog-empty'),
    composeFab: null,
    composeSlot: null
  };

  var state = {
    payload: null,
    draft: null,
    editMode: false,
    pendingToggleEditOff: false,
    busy: false,
    autosaveQueued: false,
    saveTimer: null,
    saveStatus: 'saved',
    saveIndicatorVisible: false,
    navTitle: '',
    navTitleEditing: false,
    navTitleInput: '',
    navTitleBusy: false,
    posts: [],
    initialContentPainted: false,
    initialPageStateLoaded: false,
    initialPostsLoaded: false,
    defaultFiltersApplied: false,
    filters: {
      tags: new Set(),
      years: new Set(),
      types: new Set()
    },
    compose: {
      open: false,
      preview: false,
      draftId: '',
      tags: [],
      postType: 'longform',
      linkUrl: '',
      linkBody: '',
      uploading: 0,
      autosaveTimer: null,
      busy: false,
      output: '',
      outputTone: '',
      saveStatus: ''
    }
  };
  var panelHideTimer = null;
  var settingsHideTimer = null;
  var COMPOSE_POST_TYPES = ['shortform', 'longform', 'capture-media', 'upload-media', 'attachment', 'audio-note', 'link-share', 'go-live'];

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
      var query = url.searchParams.toString();
      if (query) {
        next += '?' + query;
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

  function markHydrationPageReady() {
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markPageReady === 'function') {
      gate.markPageReady();
    }
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
    markHydrationPageReady();
  }

  function maybeMarkInitialContentPainted() {
    if (state.initialPageStateLoaded && state.initialPostsLoaded) {
      markInitialContentPainted();
    }
  }

  function escapeHtml(value) {
    return String(value || '')
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
    return escapeHtml(value);
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

  function titleizeSlug(value) {
    var text = String(value || '').trim().replace(/-/g, ' ');
    if (!text || text === 'index') {
      return 'Blog';
    }
    return text.split(/\s+/).map(function (word) {
      return word ? (word.charAt(0).toUpperCase() + word.slice(1)) : '';
    }).join(' ');
  }

  function normalizePageState(raw) {
    var src = raw || {};
    return {
      slug: String(src.slug || slug),
      title: String(src.title || ''),
      content: String(src.content || ''),
      default_tag: String(src.default_tag || '').trim(),
      extras_after: String(src.extras_after || ''),
      extras_after_format: String(src.extras_after_format || 'markdown').trim().toLowerCase() === 'html' ? 'html' : 'markdown'
    };
  }

  function getRenderState() {
    if (isAdmin() && state.draft) {
      state.draft = normalizePageState(state.draft);
      return state.draft;
    }
    if (state.payload && state.payload.state) {
      return normalizePageState(state.payload.state);
    }
    return normalizePageState({ title: titleizeSlug(slug) });
  }

  function isAdmin() {
    return !!(state.payload && state.payload.is_admin);
  }

  function defaultNavbarTitle(renderState) {
    var s = renderState || getRenderState();
    var title = String((s && s.title) || titleizeSlug(slug)).trim();
    return title || titleizeSlug(slug);
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

  function authPayload() {
    return {
      session_token: String(localStorage.getItem('session_token') || '').trim(),
      csrf_token: String(localStorage.getItem('csrf_token') || '').trim()
    };
  }

  function apiPost(url, payload) {
    var body = new URLSearchParams(payload || {});
    return fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (_err) {
          throw new Error('Invalid JSON response');
        }
        if (!res.ok || !data || data.success === false) {
          throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
        }
        return data;
      });
    });
  }

  function renderHead() {
    if (!state.initialPageStateLoaded) {
      if (els.title) {
        els.title.hidden = true;
        els.title.innerHTML = '';
      }
      if (els.description) {
        els.description.innerHTML = '';
        els.description.hidden = true;
      }
      renderNavbarTitleRow(null);
      return;
    }
    var page = getRenderState();
    var title = String(page.title || '').trim() || titleizeSlug(slug);
    document.title = title;
    if (els.title) {
      els.title.hidden = false;
      els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(title) + '</span><span id="blog-page-title-actions" class="list-page-title-actions"></span>';
    }
    if (!els.description) {
      return;
    }
    var text = String(page.content || '').trim();
    if (text) {
      els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(text) + '</span>';
      els.description.hidden = false;
    } else {
      els.description.innerHTML = '';
      els.description.hidden = true;
    }
    renderNavbarTitleRow(page);
  }

  function ensureFilterGutterLayout() {
    if (!root || !els.toggle) {
      return;
    }

    var layout = root.querySelector('.blog-layout');
    if (!layout) {
      layout = document.createElement('div');
      layout.className = 'blog-layout';
      while (root.firstChild) {
        layout.appendChild(root.firstChild);
      }
      root.appendChild(layout);
    }

    var filterCol = layout.querySelector('.blog-filter-column');
    if (!filterCol) {
      filterCol = document.createElement('div');
      filterCol.className = 'blog-filter-column';
      layout.insertBefore(filterCol, layout.firstChild);
    }

    var mainCol = layout.querySelector('.blog-main-column');
    if (!mainCol) {
      mainCol = document.createElement('div');
      mainCol.className = 'blog-main-column';
      var cursor = filterCol.nextSibling;
      while (cursor) {
        var next = cursor.nextSibling;
        mainCol.appendChild(cursor);
        cursor = next;
      }
      layout.appendChild(mainCol);
    }

    if (els.toggle.parentNode !== filterCol) {
      filterCol.appendChild(els.toggle);
    }
  }

  function renderValidation() {
    if (!els.validation) {
      return;
    }
    var validation = (state.payload && state.payload.validation) ? state.payload.validation : {};
    var errors = Array.isArray(validation.errors) ? validation.errors : [];
    var warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
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
    var node = document.getElementById('blog-admin-save-status');
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

  function queuePageAutosave(delayMs) {
    if (!isAdmin() || !state.editMode) {
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
    state.draft = normalizePageState(state.draft || getRenderState());
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
      if (!state.payload || typeof state.payload !== 'object') {
        state.payload = {};
      }
      state.payload.validation = data.validation || { errors: [], warnings: [], can_publish: true };
      state.payload.draft_exists = true;
      var localChangedDuringSave = JSON.stringify(state.draft || {}) !== serializedBeforeSave;
      state.payload.draft_differs = localChangedDuringSave;
      if (!localChangedDuringSave) {
        state.payload.state = data.state || state.payload.state;
        state.draft = normalizePageState(data.state || state.draft);
      } else {
        state.payload.state = normalizePageState(state.draft || {});
      }
      setSaveStatus('saved');
      if (state.editMode) {
        renderHead();
        renderAdmin();
        renderValidation();
        renderExtrasAfter();
      } else {
        renderAll();
      }
      return true;
    }).catch(function (err) {
      setSaveStatus('error');
      if (options.alertOnError !== false) {
        window.alert(err && err.message ? err.message : 'Could not save draft');
      }
      return false;
    }).finally(function () {
      state.busy = false;
      if (state.autosaveQueued) {
        state.autosaveQueued = false;
        queuePageAutosave(500);
      }
      maybeFinalizeEditModeExit();
    });
  }

  function exitEditModeNow() {
    state.editMode = false;
    state.pendingToggleEditOff = false;
    state.navTitleEditing = false;
    state.navTitleInput = '';
    renderAll();
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
    state.saveIndicatorVisible = true;
    renderAdmin();
    if (state.busy) {
      return;
    }
    persistDraft({ alertOnError: false }).then(function () {
      maybeFinalizeEditModeExit();
    });
  }

  function renderAdmin() {
    var actionsHost = document.getElementById('blog-page-title-actions');
    if (actionsHost) {
      actionsHost.innerHTML = '';
    }
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
    var html = '<span class="list-page-admin-bar">';
    if (state.saveIndicatorVisible) {
      html += '<span id="blog-admin-save-status" class="list-admin-save-status" aria-live="polite">';
      if (state.saveStatus === 'saving') {
        html += '<span class="save-spinner" aria-hidden="true"></span>Saving...';
      } else if (state.saveStatus === 'error') {
        html += 'Save failed';
      } else {
        html += 'Saved';
      }
      html += '</span>';
    }
    html += '<button type="button" class="list-admin-primary-btn" data-blog-action="toggle-edit">' + (state.editMode ? 'Done' : 'Edit') + '</button>';
    html += '</span>';
    if (actionsHost) {
      actionsHost.innerHTML = html;
    }
    els.admin.hidden = true;
    els.admin.innerHTML = '';
  }

  function ensureSettingsHost() {
    if (els.settings instanceof HTMLElement) {
      return els.settings;
    }
    if (!els.content || !els.content.parentNode) {
      return null;
    }
    var host = document.createElement('div');
    host.id = 'blog-page-settings';
    host.className = 'blog-page-settings-slot';
    host.hidden = true;
    els.content.parentNode.insertBefore(host, els.content);
    els.settings = host;
    return host;
  }

  function setSettingsOpen(open) {
    var host = ensureSettingsHost();
    if (!host) {
      return;
    }
    var isOpen = !!open;
    if (settingsHideTimer) {
      window.clearTimeout(settingsHideTimer);
      settingsHideTimer = null;
    }
    if (isOpen) {
      var wasHidden = !!host.hidden;
      host.hidden = false;
      if (wasHidden) {
        host.classList.remove('is-open');
        void host.offsetHeight;
        window.requestAnimationFrame(function () {
          host.classList.add('is-open');
        });
      } else {
        host.classList.add('is-open');
      }
      return;
    }
    host.classList.remove('is-open');
    settingsHideTimer = window.setTimeout(function () {
      settingsHideTimer = null;
      if (!host.classList.contains('is-open')) {
        host.hidden = true;
        host.innerHTML = '';
      }
    }, 260);
  }

  function renderPageSettings() {
    var host = ensureSettingsHost();
    if (!host) {
      return;
    }
    if (!isAdmin() || !state.editMode) {
      setSettingsOpen(false);
      return;
    }
    var page = getRenderState();
    host.innerHTML = '' +
      '<section class="nostr-page-extras-editor" aria-label="Page settings">' +
        '<h3 class="nostr-page-extras-heading">Page settings</h3>' +
        '<label class="nostr-page-extra-edit">' +
          '<span>Page name <span class="nostr-page-scope-pill is-nostr">Nostr</span></span>' +
          '<input type="text" id="blog-settings-title-input" value="' + escapeHtml(page.title || '') + '">' +
        '</label>' +
        '<label class="nostr-page-extra-edit">' +
          '<span>Description <span class="nostr-page-scope-pill is-nostr">Nostr</span></span>' +
          '<textarea id="blog-settings-description-input" rows="4" placeholder="Short description under the page title">' + escapeHtml(page.content || '') + '</textarea>' +
        '</label>' +
        '<label class="nostr-page-extra-edit">' +
          '<span>Default tag filter <span class="nostr-page-scope-pill is-nostr">Nostr</span></span>' +
          '<input type="text" id="blog-settings-default-tag-input" placeholder="optional-tag" value="' + escapeHtml(page.default_tag || '') + '">' +
        '</label>' +
        '<label class="nostr-page-extra-edit">' +
          '<span>After content <span class="nostr-page-scope-pill is-local">Local</span></span>' +
          '<textarea id="blog-settings-outro-input" rows="5" placeholder="Optional local content shown after the post list">' + escapeHtml(page.extras_after || '') + '</textarea>' +
        '</label>' +
      '</section>';
    setSettingsOpen(true);
  }

  function ensureComposeHosts() {
    if (!els.list || !els.list.parentNode) {
      return;
    }
    if (!els.composeSlot) {
      var slot = document.createElement('div');
      slot.className = 'blog-compose-slot';
      slot.hidden = true;
      els.list.parentNode.insertBefore(slot, els.list);
      els.composeSlot = slot;
    }
    if (!els.composeFab) {
      var fab = document.createElement('button');
      fab.type = 'button';
      fab.className = 'blog-compose-fab list-admin-primary-btn';
      fab.setAttribute('data-blog-action', 'toggle-compose');
      fab.textContent = 'Compose';
      fab.hidden = true;
      root.appendChild(fab);
      els.composeFab = fab;
    }
  }

  function normalizeComposePostType(raw) {
    var picked = String(raw || '').trim().toLowerCase();
    if (COMPOSE_POST_TYPES.indexOf(picked) >= 0) {
      return picked;
    }
    return 'longform';
  }

  function composePostType() {
    return normalizeComposePostType(state.compose.postType);
  }

  function composePostTypeIsTextual(type) {
    var picked = normalizeComposePostType(type);
    return picked === 'shortform' || picked === 'longform';
  }

  function composeBuildLinkMarkdown(urlValue, bodyValue, titleValue) {
    var url = String(urlValue || '').trim();
    if (!url) {
      return '';
    }
    var label = String(titleValue || '').trim() || url;
    var out = '[' + label + '](' + url + ')';
    var body = String(bodyValue || '').trim();
    if (body) {
      out += '\n\n' + body;
    }
    return out;
  }

  function composeNostrTarget(postType) {
    var type = normalizeComposePostType(postType);
    if (type === 'shortform') {
      return { kind: '1', tags: 't=short, alt' };
    }
    if (type === 'longform') {
      return { kind: '30023', tags: 'd, title, summary, published_at' };
    }
    if (type === 'capture-media') {
      return { kind: '20 or 21', tags: 'url, m=image/*|video/*, alt, dim|duration' };
    }
    if (type === 'upload-media') {
      return { kind: '20 or 21', tags: 'url, m=image/*|video/*, ox, size, dim|duration' };
    }
    if (type === 'attachment') {
      return { kind: '15', tags: 'url, m, size, ox' };
    }
    if (type === 'audio-note') {
      return { kind: '21', tags: 'url, m=audio/*, duration, alt' };
    }
    if (type === 'link-share') {
      return { kind: '1', tags: 'r, title, summary, image' };
    }
    return { kind: '30311', tags: 'streaming, starts, status=live' };
  }

  function composeNostrTargetLabel(postType) {
    var target = composeNostrTarget(postType);
    return 'Nostr kind ' + target.kind + ' · ' + target.tags;
  }

  function composePostTypeIconSvg(type) {
    var picked = normalizeComposePostType(type);
    if (picked === 'shortform') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M5 8H15M5 12H13M5 16H15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    if (picked === 'longform') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M5 7H19M5 11H19M5 15H17M5 19H19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    if (picked === 'capture-media') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<rect x="4" y="7" width="16" height="11" rx="2.2" stroke="currentColor" stroke-width="1.8"/>' +
        '<circle cx="12" cy="12.5" r="2.6" stroke="currentColor" stroke-width="1.8"/>' +
        '<path d="M9.2 7L10.4 5.2H13.6L14.8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    if (picked === 'upload-media') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M12 16V6M8.8 9.2L12 6L15.2 9.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<rect x="4.2" y="15.3" width="15.6" height="3.9" rx="1.2" stroke="currentColor" stroke-width="1.8"/>' +
      '</svg>';
    }
    if (picked === 'attachment') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M9.2 12.8L14.4 7.6C15.8 6.2 18 6.2 19.4 7.6C20.8 9 20.8 11.2 19.4 12.6L11.2 20.8C8.9 23.1 5.2 23.1 2.9 20.8C0.6 18.5 0.6 14.8 2.9 12.5L11 4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    }
    if (picked === 'audio-note') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<rect x="9" y="4.2" width="6" height="10" rx="3" stroke="currentColor" stroke-width="1.8"/>' +
        '<path d="M6.6 11.2C6.6 14.4 9.1 16.9 12 16.9C14.9 16.9 17.4 14.4 17.4 11.2M12 16.9V20.2M9.3 20.2H14.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    if (picked === 'link-share') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M10.2 13.8L13.8 10.2M8.2 15.8L6.7 17.3C5.3 18.7 3.1 18.7 1.7 17.3C0.3 15.9 0.3 13.7 1.7 12.3L3.2 10.8M15.8 8.2L17.3 6.7C18.7 5.3 20.9 5.3 22.3 6.7C23.7 8.1 23.7 10.3 22.3 11.7L20.8 13.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="2.4" fill="currentColor"/>' +
      '<path d="M4.4 12H2.2M21.8 12H19.6M17.7 6.3L16.1 7.9M7.9 16.1L6.3 17.7M17.7 17.7L16.1 16.1M7.9 7.9L6.3 6.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>';
  }

  function composeTypeButtonsHtml(activeType) {
    var current = normalizeComposePostType(activeType);
    function btn(type, label, disabled) {
      var cls = 'compose-post-type-pill';
      if (type === current) {
        cls += ' is-active';
      }
      if (disabled) {
        cls += ' is-disabled';
      }
      var icon = composePostTypeIconSvg(type);
      var title = disabled ? ('Coming soon: ' + label) : label;
      return '<button type="button" class="' + cls + '" data-compose-action="set-post-type" data-compose-post-type="' + escapeHtml(type) + '"' +
        (disabled ? ' disabled aria-disabled="true"' : '') +
        ' aria-pressed="' + (type === current ? 'true' : 'false') + '"' +
        ' aria-label="' + escapeHtml(label) + '"' +
        ' title="' + escapeHtml(title) + '"' +
        '>' + icon + '<span class="sr-only">' + escapeHtml(label) + '</span></button>';
    }
    return '' +
      '<div class="compose-post-type-toolbar" role="tablist" aria-label="Post type">' +
      btn('shortform', 'Shortform Post', false) +
      btn('longform', 'Longform Post', false) +
      btn('capture-media', 'Take Photo/Video', false) +
      btn('upload-media', 'Upload Photo/Video', false) +
      btn('attachment', 'Upload Attachment/File', false) +
      btn('audio-note', 'Audio Note', false) +
      btn('link-share', 'Link Share', false) +
      btn('go-live', 'Go Live', true) +
      '</div>';
  }

  function setComposePostType(nextType, options) {
    var opts = options || {};
    var normalized = normalizeComposePostType(nextType);
    if (normalized === 'go-live') {
      setComposeOutput('Go Live is a future feature.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    state.compose.postType = normalized;
    if (!opts.skipRender) {
      renderComposeUi();
    }
    if (!opts.skipAutosave) {
      queueComposeAutosave();
    }
  }

  function normalizeTagValue(tag) {
    return String(tag || '').trim().replace(/\s+/g, '-');
  }

  function syncComposeTagsField() {
    if (!els.composeSlot) {
      return;
    }
    var hidden = els.composeSlot.querySelector('[data-compose-field="tags"]');
    if (hidden instanceof HTMLInputElement) {
      hidden.value = state.compose.tags.join(',');
    }
  }

  function setComposeTags(tags) {
    var list = Array.from(tags || [])
      .map(normalizeTagValue)
      .filter(Boolean);
    state.compose.tags = list.filter(function (tag, idx) {
      return list.indexOf(tag) === idx;
    });
    syncComposeTagsField();
  }

  function addComposeTag(rawTag) {
    var tag = normalizeTagValue(rawTag);
    if (!tag || state.compose.tags.indexOf(tag) !== -1) {
      return false;
    }
    state.compose.tags.push(tag);
    syncComposeTagsField();
    return true;
  }

  function removeComposeTag(tag) {
    setComposeTags(state.compose.tags.filter(function (item) {
      return item !== tag;
    }));
  }

  function commitComposeTagInput() {
    if (!els.composeSlot) {
      return false;
    }
    var input = els.composeSlot.querySelector('[data-compose-field="tags-input"]');
    if (!(input instanceof HTMLInputElement)) {
      return false;
    }
    var parts = String(input.value || '').split(',');
    var changed = false;
    parts.forEach(function (part) {
      if (addComposeTag(part)) {
        changed = true;
      }
    });
    input.value = '';
    return changed;
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });
  }

  function composeUploadMarkdown(url, file) {
    var safeUrl = String(url || '').trim();
    if (!safeUrl) {
      return '';
    }
    var name = String((file && file.name) || 'file').trim();
    var mime = String((file && file.type) || '').toLowerCase();
    var alt = name.replace(/\.[^.]+$/, '') || 'media';
    if (mime.indexOf('image/') === 0) {
      return '![' + alt + '](' + safeUrl + ')';
    }
    if (mime.indexOf('video/') === 0) {
      return '<video controls src="' + safeUrl + '"></video>';
    }
    if (mime.indexOf('audio/') === 0) {
      return '<audio controls src="' + safeUrl + '"></audio>';
    }
    return '[' + name + '](' + safeUrl + ')';
  }

  function appendComposeContent(text) {
    if (!els.composeSlot) {
      return;
    }
    var source = els.composeSlot.querySelector('[data-compose-field="content"]');
    if (!(source instanceof HTMLTextAreaElement)) {
      return;
    }
    var addition = String(text || '').trim();
    if (!addition) {
      return;
    }
    var current = String(source.value || '');
    source.value = current.trim() ? (current.replace(/\s*$/, '') + '\n\n' + addition) : addition;
  }

  function uploadComposeFile(file) {
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      return Promise.reject(new Error('Sign in again to upload.'));
    }
    return readFileAsDataUrl(file).then(function (dataUrl) {
      return apiPost('/cgi/blog-upload-media', {
        session_token: auth.session_token,
        csrf_token: auth.csrf_token,
        draft_id: String(state.compose.draftId || ''),
        filename: String((file && file.name) || 'upload.bin'),
        mime_type: String((file && file.type) || ''),
        data_base64: String(dataUrl || '')
      });
    });
  }

  function handleComposeUploads(files, preferredType) {
    var list = Array.from(files || []).filter(function (file) {
      return file && file.size >= 0;
    });
    if (!list.length) {
      return Promise.resolve();
    }
    if (preferredType) {
      setComposePostType(preferredType, { skipAutosave: true });
    }
    state.compose.uploading += 1;
    setComposeOutput('Uploading ' + list.length + ' file(s)...', 'warn');
    renderComposeStatusOnly();
    var chain = Promise.resolve();
    list.forEach(function (file) {
      chain = chain.then(function () {
        return uploadComposeFile(file).then(function (data) {
          if (data && data.draft_id) {
            state.compose.draftId = String(data.draft_id);
          }
          appendComposeContent(composeUploadMarkdown(data && data.url, file));
        });
      });
    });
    return chain.then(function () {
      setComposeOutput('Upload complete. Added to body.', 'ok');
      queueComposeAutosave();
      renderComposeUi();
    }).catch(function (err) {
      setComposeOutput('Upload error: ' + ((err && err.message) ? err.message : 'Upload failed'), 'error');
      renderComposeStatusOnly();
    }).finally(function () {
      state.compose.uploading = Math.max(0, state.compose.uploading - 1);
      renderComposeStatusOnly();
    });
  }

  function isEditableTarget(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      return true;
    }
    if (target.isContentEditable) {
      return true;
    }
    return !!target.closest('textarea, input, [contenteditable="true"], [contenteditable=""]');
  }

  function clipboardImageFiles(event) {
    var out = [];
    var clip = event && event.clipboardData;
    if (!clip) {
      return out;
    }
    var items = clip.items ? Array.from(clip.items) : [];
    items.forEach(function (item) {
      if (!item || item.kind !== 'file' || String(item.type || '').indexOf('image/') !== 0) {
        return;
      }
      var file = item.getAsFile ? item.getAsFile() : null;
      if (file) {
        out.push(file);
      }
    });
    if (out.length) {
      return out;
    }
    var files = clip.files ? Array.from(clip.files) : [];
    return files.filter(function (file) {
      return file && String(file.type || '').indexOf('image/') === 0;
    });
  }

  function composeLocalToIso(value) {
    if (!value) {
      return '';
    }
    var dt = new Date(value);
    if (isNaN(dt.getTime())) {
      return '';
    }
    return dt.toISOString().replace('.000Z', 'Z');
  }

  function composePublishMode() {
    if (!els.composeSlot) {
      return 'immediate';
    }
    var checked = els.composeSlot.querySelector('input[name="blog-inline-compose-mode"]:checked');
    var value = checked ? String(checked.value || '') : 'immediate';
    if (value === 'scheduled' || value === 'drip' || value === 'immediate') {
      return value;
    }
    return 'immediate';
  }

  function composePrimaryLabel(mode) {
    if (mode === 'scheduled') {
      return 'Schedule Post';
    }
    if (mode === 'drip') {
      return 'Enqueue Post';
    }
    return 'Publish Now';
  }

  function composeModeAction(mode) {
    if (mode === 'scheduled') {
      return 'queue_scheduled';
    }
    if (mode === 'drip') {
      return 'queue_drip';
    }
    return 'publish_now';
  }

  function renderComposePreviewHtml(title, content) {
    var body = String(content || '').trim();
    var heading = String(title || '').trim();
    if (!body && !heading) {
      return '<p class="placeholder">Preview will appear here...</p>';
    }
    var html = '';
    if (heading) {
      html += '<h2>' + escapeHtml(heading) + '</h2>';
    }
    if (body) {
      html += markdownBlock(body);
    }
    return html;
  }

  function composeTrashIconSvg() {
    return '<svg class="trash-icon-svg" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M9 3.75h6a1 1 0 0 1 1 1V6h4v1.75H4V6h4V4.75a1 1 0 0 1 1-1Z" fill="currentColor"/>' +
      '<path d="M6.75 8.5h10.5l-.7 10.02a2 2 0 0 1-2 1.86H9.45a2 2 0 0 1-2-1.86L6.75 8.5Z" fill="currentColor"/>' +
      '<path d="M10.2 10.75v6.7M13.8 10.75v6.7" stroke="var(--bg, #fff)" stroke-width="1.4" stroke-linecap="round"/>' +
      '</svg>';
  }

  function readComposeFields() {
    if (!els.composeSlot) {
      return null;
    }
    var title = els.composeSlot.querySelector('[data-compose-field="title"]');
    var content = els.composeSlot.querySelector('[data-compose-field="content"]');
    var scheduled = els.composeSlot.querySelector('[data-compose-field="scheduled-at"]');
    var tags = els.composeSlot.querySelector('[data-compose-field="tags"]');
    var linkUrl = els.composeSlot.querySelector('[data-compose-field="link-url"]');
    var linkBody = els.composeSlot.querySelector('[data-compose-field="link-body"]');
    return {
      title: title instanceof HTMLInputElement ? String(title.value || '') : '',
      content: content instanceof HTMLTextAreaElement ? String(content.value || '') : '',
      scheduledAt: scheduled instanceof HTMLInputElement ? String(scheduled.value || '') : '',
      tags: tags instanceof HTMLInputElement ? String(tags.value || '') : '',
      linkUrl: linkUrl instanceof HTMLInputElement ? String(linkUrl.value || '') : String(state.compose.linkUrl || ''),
      linkBody: linkBody instanceof HTMLTextAreaElement ? String(linkBody.value || '') : String(state.compose.linkBody || ''),
      postType: composePostType()
    };
  }

  function composePayload(action) {
    commitComposeTagInput();
    var fields = readComposeFields();
    if (!fields) {
      return null;
    }
    var payloadContent = fields.content;
    if (fields.postType === 'link-share') {
      var linkMd = composeBuildLinkMarkdown(fields.linkUrl, fields.linkBody, fields.title);
      if (linkMd) {
        payloadContent = linkMd;
      }
      state.compose.linkUrl = String(fields.linkUrl || '');
      state.compose.linkBody = String(fields.linkBody || '');
    }
    return {
      action: action,
      draft_id: String(state.compose.draftId || ''),
      title: fields.title.trim(),
      tags: fields.tags.trim(),
      summary: '',
      content: payloadContent,
      post_type: fields.postType,
      scheduled_at: composeLocalToIso(fields.scheduledAt),
      publish_mode: composePublishMode()
    };
  }

  function setComposeOutput(message, tone) {
    state.compose.output = String(message || '');
    state.compose.outputTone = String(tone || '');
  }

  function queueComposeAutosave() {
    if (!isAdmin() || !state.compose.open) {
      return;
    }
    if (state.compose.autosaveTimer) {
      clearTimeout(state.compose.autosaveTimer);
    }
    state.compose.saveStatus = 'saving';
    renderComposeStatusOnly();
    state.compose.autosaveTimer = setTimeout(function () {
      state.compose.autosaveTimer = null;
      autosaveCompose();
    }, 1500);
  }

  function afterComposePublishSuccess() {
    state.compose.draftId = '';
    state.compose.saveStatus = '';
    state.compose.uploading = 0;
    state.compose.postType = 'longform';
    state.compose.linkUrl = '';
    state.compose.linkBody = '';
    setComposeTags([]);
    var fields = readComposeFields();
    if (!fields || !els.composeSlot) {
      return;
    }
    var title = els.composeSlot.querySelector('[data-compose-field="title"]');
    var content = els.composeSlot.querySelector('[data-compose-field="content"]');
    var schedule = els.composeSlot.querySelector('[data-compose-field="scheduled-at"]');
    var immediateMode = els.composeSlot.querySelector('input[name="blog-inline-compose-mode"][value="immediate"]');
    if (title instanceof HTMLInputElement) {
      title.value = '';
    }
    if (content instanceof HTMLTextAreaElement) {
      content.value = '';
    }
    if (schedule instanceof HTMLInputElement) {
      schedule.value = '';
    }
    if (immediateMode instanceof HTMLInputElement) {
      immediateMode.checked = true;
    }
  }

  function saveCompose(action) {
    if (state.compose.busy || !isAdmin()) {
      return;
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      setComposeOutput('Sign in again to compose posts.', 'error');
      renderComposeStatusOnly();
      return;
    }
    var payload = composePayload(action);
    if (!payload) {
      return;
    }
    if (action === 'publish_now' && !payload.content.trim()) {
      setComposeOutput('Cannot publish an empty post.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    if (action === 'queue_scheduled' && !payload.scheduled_at) {
      setComposeOutput('Scheduled posts need a release date/time.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    payload.session_token = auth.session_token;
    payload.csrf_token = auth.csrf_token;
    state.compose.busy = true;
    state.compose.saveStatus = action === 'autosave' ? 'saving' : '';
    renderComposeStatusOnly();
    apiPost('/cgi/blog-save-post', payload).then(function (data) {
      if (data && data.draft_id) {
        state.compose.draftId = String(data.draft_id);
      }
      if (action === 'autosave') {
        state.compose.saveStatus = 'saved';
        renderComposeStatusOnly();
        return;
      }
      if (action === 'publish_now') {
        setComposeOutput('Published. Rebuild may take a few seconds.', 'ok');
        afterComposePublishSuccess();
      } else {
        setComposeOutput((data && data.message) || 'Saved.', 'ok');
      }
      renderComposeUi();
      loadPosts();
      setTimeout(function () { loadPosts(); }, 2500);
    }).catch(function (err) {
      var message = err && err.message ? err.message : 'Save failed';
      if (action === 'autosave') {
        state.compose.saveStatus = 'error';
      } else {
        setComposeOutput('Error: ' + message, 'error');
      }
      renderComposeStatusOnly();
    }).finally(function () {
      state.compose.busy = false;
      renderComposeStatusOnly();
    });
  }

  function clearComposeFields() {
    state.compose.draftId = '';
    state.compose.saveStatus = '';
    state.compose.uploading = 0;
    state.compose.postType = 'longform';
    state.compose.linkUrl = '';
    state.compose.linkBody = '';
    setComposeOutput('', '');
    setComposeTags([]);
    if (!els.composeSlot) {
      renderComposeStatusOnly();
      return;
    }
    var title = els.composeSlot.querySelector('[data-compose-field="title"]');
    var content = els.composeSlot.querySelector('[data-compose-field="content"]');
    var schedule = els.composeSlot.querySelector('[data-compose-field="scheduled-at"]');
    var immediateMode = els.composeSlot.querySelector('input[name="blog-inline-compose-mode"][value="immediate"]');
    if (title instanceof HTMLInputElement) {
      title.value = '';
    }
    if (content instanceof HTMLTextAreaElement) {
      content.value = '';
    }
    if (schedule instanceof HTMLInputElement) {
      schedule.value = '';
    }
    if (immediateMode instanceof HTMLInputElement) {
      immediateMode.checked = true;
    }
    renderComposeUi();
  }

  function deleteComposeDraft() {
    var fields = readComposeFields() || { title: '', content: '' };
    var hasContent = !!String(fields.title || '').trim() ||
      !!String(fields.content || '').trim() ||
      !!String(fields.linkUrl || '').trim() ||
      !!String(fields.linkBody || '').trim() ||
      state.compose.tags.length > 0 ||
      !!state.compose.draftId;
    if (hasContent && !window.confirm('Delete this draft?')) {
      return;
    }
    if (!state.compose.draftId) {
      clearComposeFields();
      return;
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      setComposeOutput('Sign in again to delete draft.', 'error');
      renderComposeStatusOnly();
      return;
    }
    state.compose.busy = true;
    renderComposeStatusOnly();
    apiPost('/cgi/blog-delete-draft', {
      draft_id: String(state.compose.draftId || ''),
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function () {
      clearComposeFields();
      setComposeOutput('Draft deleted.', 'ok');
      renderComposeStatusOnly();
    }).catch(function (err) {
      setComposeOutput('Error: ' + ((err && err.message) ? err.message : 'Delete failed'), 'error');
      renderComposeStatusOnly();
    }).finally(function () {
      state.compose.busy = false;
      renderComposeStatusOnly();
    });
  }

  function autosaveCompose() {
    var payload = composePayload('autosave');
    if (!payload) {
      return;
    }
    if (!payload.title.trim() && !payload.content.trim()) {
      state.compose.saveStatus = '';
      renderComposeStatusOnly();
      return;
    }
    saveCompose('autosave');
  }

  function setComposeOpen(open) {
    state.compose.open = !!open;
    renderComposeUi();
    if (state.compose.open && els.composeSlot) {
      setTimeout(function () {
        var title = els.composeSlot.querySelector('[data-compose-field="title"]');
        if (title && typeof title.focus === 'function') {
          title.focus();
        }
      }, 30);
    }
  }

  function composeToolbarAction(action) {
    if (!els.composeSlot) {
      return;
    }
    var textarea = els.composeSlot.querySelector('[data-compose-field="content"]');
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return;
    }
    function placeCursor(start, end) {
      textarea.focus();
      textarea.setSelectionRange(start, end);
    }
    function replaceSelection(transformer) {
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      var selected = textarea.value.slice(start, end);
      var updated = transformer(selected);
      var prefix = textarea.value.slice(0, start);
      var suffix = textarea.value.slice(end);
      textarea.value = prefix + updated.text + suffix;
      placeCursor(start + updated.cursorStart, start + updated.cursorEnd);
    }
    function replaceSelectedLines(transformer) {
      var value = textarea.value;
      var selStart = textarea.selectionStart;
      var selEnd = textarea.selectionEnd;
      var lineStart = value.lastIndexOf('\n', Math.max(0, selStart - 1)) + 1;
      var lineEndIdx = value.indexOf('\n', selEnd);
      var lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
      var source = value.slice(lineStart, lineEnd);
      var lines = source.split('\n');
      var result = transformer(lines);
      if (!result || !Array.isArray(result.lines)) {
        return;
      }
      var next = result.lines.join('\n');
      textarea.value = value.slice(0, lineStart) + next + value.slice(lineEnd);
      placeCursor(lineStart, lineStart + next.length);
    }

    if (action === 'bold' || action === 'italic' || action === 'code') {
      var token = action === 'bold' ? '**' : (action === 'italic' ? '*' : '`');
      replaceSelection(function (selected) {
        var s = selected || 'text';
        if (s.startsWith(token) && s.endsWith(token)) {
          var unwrapped = s.slice(token.length, s.length - token.length);
          return { text: unwrapped, cursorStart: 0, cursorEnd: unwrapped.length };
        }
        var wrapped = token + s + token;
        return { text: wrapped, cursorStart: token.length, cursorEnd: token.length + s.length };
      });
    } else if (action === 'h2' || action === 'h3') {
      var heading = action === 'h2' ? '## ' : '### ';
      replaceSelectedLines(function (lines) {
        var line = lines[0] || '';
        var stripped = line.replace(/^#{1,6}\s+/, '');
        lines[0] = line.startsWith(heading) ? stripped : (heading + stripped);
        return { lines: lines };
      });
    } else if (action === 'quote' || action === 'ul') {
      var prefix = action === 'quote' ? '> ' : '- ';
      replaceSelectedLines(function (lines) {
        var nonEmpty = lines.filter(function (line) { return line.trim() !== ''; });
        var allHave = nonEmpty.length > 0 && nonEmpty.every(function (line) {
          return line.startsWith(prefix);
        });
        return {
          lines: lines.map(function (line) {
            if (line.trim() === '') {
              return line;
            }
            if (allHave) {
              return line.startsWith(prefix) ? line.slice(prefix.length) : line;
            }
            return prefix + line;
          })
        };
      });
    } else if (action === 'ol') {
      replaceSelectedLines(function (lines) {
        var nonEmpty = lines.filter(function (line) { return line.trim() !== ''; });
        var allOrdered = nonEmpty.length > 0 && nonEmpty.every(function (line) {
          return /^\d+\.\s+/.test(line);
        });
        var index = 1;
        return {
          lines: lines.map(function (line) {
            if (line.trim() === '') {
              return line;
            }
            if (allOrdered) {
              return line.replace(/^\d+\.\s+/, '');
            }
            var text = line.replace(/^\d+\.\s+/, '').replace(/^-+\s+/, '');
            var out = index + '. ' + text;
            index += 1;
            return out;
          })
        };
      });
    } else if (action === 'code_block') {
      replaceSelection(function (selected) {
        var source = selected || '';
        if (/^```[\s\S]*```$/.test(source.trim())) {
          var unwrapped = source.trim().replace(/^```[\n]?/, '').replace(/\n?```$/, '');
          return { text: unwrapped, cursorStart: 0, cursorEnd: unwrapped.length };
        }
        var wrapped = '```\n' + source + '\n```';
        return { text: wrapped, cursorStart: 4, cursorEnd: wrapped.length - 4 };
      });
    } else if (action === 'link') {
      replaceSelection(function (selected) {
        var label = selected || 'link text';
        var text = '[' + label + '](https://)';
        var start = text.indexOf('https://');
        return { text: text, cursorStart: start, cursorEnd: start + 8 };
      });
    } else if (action === 'image') {
      replaceSelection(function (selected) {
        var label = selected || 'image';
        var text = '![' + label + '](https://)';
        var start = text.indexOf('https://');
        return { text: text, cursorStart: start, cursorEnd: start + 8 };
      });
    }

    queueComposeAutosave();
    renderComposeUi();
  }

  function renderComposeUi() {
    ensureComposeHosts();
    if (!els.composeSlot || !els.composeFab) {
      return;
    }
    var admin = isAdmin();
    els.composeFab.hidden = !admin;
    if (!admin) {
      state.compose.open = false;
      els.composeSlot.hidden = true;
      els.composeSlot.classList.remove('is-open');
      els.composeSlot.innerHTML = '';
      return;
    }
    els.composeFab.textContent = state.compose.open ? 'Close' : 'Compose';
    els.composeFab.setAttribute('aria-expanded', state.compose.open ? 'true' : 'false');
    if (!state.compose.open) {
      els.composeSlot.classList.remove('is-open');
      setTimeout(function () {
        if (!state.compose.open && els.composeSlot) {
          els.composeSlot.hidden = true;
          els.composeSlot.innerHTML = '';
        }
      }, 240);
      return;
    }

    var fields = readComposeFields() || {
      title: '',
      content: '',
      scheduledAt: '',
      tags: '',
      linkUrl: String(state.compose.linkUrl || ''),
      linkBody: String(state.compose.linkBody || ''),
      postType: composePostType()
    };
    var mode = composePublishMode();
    var postType = normalizeComposePostType(fields.postType);
    state.compose.postType = postType;
    state.compose.linkUrl = String(fields.linkUrl || '');
    state.compose.linkBody = String(fields.linkBody || '');
    var nostrTargetLabel = composeNostrTargetLabel(postType);
    var previewContent = fields.content;
    if (postType === 'link-share') {
      var linkPreview = composeBuildLinkMarkdown(fields.linkUrl, fields.linkBody, fields.title);
      if (linkPreview) {
        previewContent = linkPreview;
      }
    }
    var previewHtml = renderComposePreviewHtml(fields.title, previewContent);
    var contentLabel = composePostTypeIsTextual(postType) ? 'Content' : 'Body';
    var contentPlaceholder = '# Write in Markdown';
    if (postType === 'shortform') {
      contentPlaceholder = 'Write a short post...';
    } else if (postType === 'link-share') {
      contentPlaceholder = 'Optional commentary...';
    } else if (postType === 'capture-media') {
      contentPlaceholder = 'Optional caption for captured media...';
    } else if (postType === 'upload-media') {
      contentPlaceholder = 'Optional caption for uploaded media...';
    } else if (postType === 'attachment') {
      contentPlaceholder = 'Optional note for attached files...';
    } else if (postType === 'audio-note') {
      contentPlaceholder = 'Optional note for uploaded audio...';
    }
    var titlePlaceholder = 'My post';
    if (postType === 'shortform') {
      titlePlaceholder = 'Short post';
    } else if (postType === 'link-share') {
      titlePlaceholder = 'Link title (optional)';
    } else if (postType === 'capture-media' || postType === 'upload-media') {
      titlePlaceholder = 'Media title (optional)';
    }
    var mediaToolsHtml = '';
    if (!composePostTypeIsTextual(postType)) {
      mediaToolsHtml = '' +
        '<div class="compose-media-tools">' +
          '<div class="compose-media-actions">' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn" data-compose-action="pick-capture-media">Take Photo/Video</button>' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn" data-compose-action="pick-upload-media">Upload Photo/Video</button>' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn" data-compose-action="pick-upload-file">Upload Attachment/File</button>' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn" data-compose-action="pick-upload-audio">Upload Audio</button>' +
          '</div>' +
          (postType === 'link-share'
            ? '<div class="compose-link-fields">' +
                '<label><strong>Link URL</strong></label>' +
                '<input type="url" data-compose-field="link-url" placeholder="https://example.com" value="' + escapeHtml(fields.linkUrl) + '">' +
                '<label><strong>Body</strong></label>' +
                '<textarea rows="3" data-compose-field="link-body" placeholder="Optional note">' + escapeHtml(fields.linkBody) + '</textarea>' +
              '</div>'
            : '') +
        '</div>';
    }
    var tagsHtml = state.compose.tags.map(function (tag) {
      return '<span class="tag-pill"><span>' + escapeHtml(tag) + '</span><button type="button" class="tag-pill-remove" data-compose-action="remove-tag" data-compose-tag="' + escapeHtml(tag) + '" aria-label="Remove tag ' + escapeHtml(tag) + '">×</button></span>';
    }).join('');
    var outputClass = 'output';
    if (state.compose.outputTone) {
      outputClass += ' ' + state.compose.outputTone;
    }

    els.composeSlot.hidden = false;
    els.composeSlot.innerHTML = '' +
      '<article class="post-item blog-post-item blog-compose-card">' +
        '<div class="blog-compose-body">' +
          '<div class="field-row compose-post-type-row">' + composeTypeButtonsHtml(postType) + '</div>' +
          '<div class="field-row compose-nostr-target-row"><span class="nostr-target-pill" title="' + escapeHtml(nostrTargetLabel) + '">' + escapeHtml(nostrTargetLabel) + '</span></div>' +
          '<div class="field-row blog-compose-title-row">' +
            '<input type="text" data-compose-field="title" placeholder="' + escapeHtml(titlePlaceholder) + '" value="' + escapeHtml(fields.title) + '">' +
            '<button type="button" class="list-admin-primary-btn blog-compose-preview-toggle blog-compose-btn" data-compose-action="toggle-preview">' + (state.compose.preview ? 'Edit' : 'Preview') + '</button>' +
          '</div>' +
          mediaToolsHtml +
          (state.compose.preview
            ? '<div class="preview-box blog-compose-preview">' + previewHtml + '</div>' +
              '<textarea data-compose-field="content" rows="14" hidden>' + escapeHtml(fields.content) + '</textarea>'
            : '<div class="field-row">' +
                '<label><strong>' + escapeHtml(contentLabel) + '</strong></label>' +
                '<div class="editor-shell blog-compose-editor-shell">' +
                  '<div class="toolbar blog-compose-toolbar" aria-label="Markdown toolbar">' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="bold" title="Bold">B</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="italic" title="Italic">I</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="h2" title="Heading 2">H2</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="h3" title="Heading 3">H3</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="code" title="Inline code">&lt;/&gt;</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="code_block" title="Code block">```</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="link" title="Insert link">Link</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="quote" title="Quote">Quote</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="ul" title="Bullet list">• List</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="ol" title="Numbered list">1. List</button>' +
                    '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="image" title="Insert image">Image</button>' +
                  '</div>' +
                  '<textarea data-compose-field="content" rows="' + (composePostTypeIsTextual(postType) ? '14' : '8') + '" placeholder="' + escapeHtml(contentPlaceholder) + '">' + escapeHtml(fields.content) + '</textarea>' +
                '</div>' +
              '</div>') +
          '<input type="file" data-compose-field="capture-upload" data-compose-upload="capture-media" accept="image/*,video/*" capture="environment" multiple hidden>' +
          '<input type="file" data-compose-field="media-upload" data-compose-upload="upload-media" accept="image/*,video/*" multiple hidden>' +
          '<input type="file" data-compose-field="file-upload" data-compose-upload="attachment" multiple hidden>' +
          '<input type="file" data-compose-field="audio-upload" data-compose-upload="audio-note" accept="audio/*" multiple hidden>' +
          '<div class="grid-two">' +
            '<div class="field-row">' +
              '<label><strong>Tags</strong></label>' +
              '<input type="hidden" data-compose-field="tags" value="' + escapeHtml(fields.tags) + '">' +
              '<div class="tag-editor' + (state.compose.tags.length ? ' has-tags' : '') + '" role="group" aria-label="Post tags">' +
                '<div class="tag-editor-pills">' + tagsHtml + '</div>' +
                '<input type="text" class="tag-editor-input" data-compose-field="tags-input" placeholder="tag, tag, tag">' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="field-row compose-release-row">' +
            '<strong>Release Mode</strong>' +
            '<div class="mode-row">' +
              '<label><input type="radio" name="blog-inline-compose-mode" value="immediate"' + (mode === 'immediate' ? ' checked' : '') + '> Immediate</label>' +
              '<label><input type="radio" name="blog-inline-compose-mode" value="scheduled"' + (mode === 'scheduled' ? ' checked' : '') + '> Scheduled Date</label>' +
              '<label><input type="radio" name="blog-inline-compose-mode" value="drip"' + (mode === 'drip' ? ' checked' : '') + '> Drip Queue</label>' +
            '</div>' +
          '</div>' +
          '<div class="field-row scheduled-row' + (mode === 'scheduled' ? '' : ' is-hidden') + '">' +
            '<label><strong>Scheduled Release Date/Time</strong></label>' +
            '<input type="datetime-local" data-compose-field="scheduled-at" value="' + escapeHtml(fields.scheduledAt) + '">' +
          '</div>' +
        '</div>' +
        '<div class="compose-footer blog-compose-footer">' +
          '<div class="compose-actions blog-compose-footer-actions">' +
            '<button type="button" class="icon-danger unobtrusive-icon-button blog-compose-delete" data-compose-action="delete" aria-label="Delete draft" title="Delete draft"' + (state.compose.busy ? ' disabled aria-disabled="true"' : '') + '>' + composeTrashIconSvg() + '</button>' +
            '<button type="button" class="list-admin-primary-btn blog-compose-btn" data-compose-action="publish"' + (state.compose.busy ? ' disabled aria-disabled="true"' : '') + '>' + escapeHtml(composePrimaryLabel(mode)) + '</button>' +
          '</div>' +
          '<div class="blog-compose-status-row">' +
            '<div class="autosave-indicator' + (state.compose.saveStatus === 'saving' ? ' is-saving' : '') + (state.compose.saveStatus === 'error' ? ' is-error' : '') + '"' + (state.compose.saveStatus ? '' : ' hidden') + '>' + (state.compose.saveStatus === 'saving' ? 'Saving...' : (state.compose.saveStatus === 'error' ? 'Save failed' : 'Saved')) + '</div>' +
            '<div class="' + outputClass + '">' + escapeHtml(state.compose.output) + '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
    requestAnimationFrame(function () {
      if (els.composeSlot) {
        els.composeSlot.classList.add('is-open');
      }
    });
  }

  function renderComposeStatusOnly() {
    if (!els.composeSlot || !state.compose.open) {
      return;
    }
    var mode = composePublishMode();
    var publishBtn = els.composeSlot.querySelector('[data-compose-action="publish"]');
    if (publishBtn instanceof HTMLButtonElement) {
      publishBtn.textContent = composePrimaryLabel(mode);
      publishBtn.disabled = !!state.compose.busy || state.compose.uploading > 0;
    }
    var scheduledRow = els.composeSlot.querySelector('.scheduled-row');
    if (scheduledRow) {
      scheduledRow.classList.toggle('is-hidden', mode !== 'scheduled');
    }
    var output = els.composeSlot.querySelector('.output');
    if (output) {
      output.textContent = state.compose.output || '';
      output.className = 'output' + (state.compose.outputTone ? (' ' + state.compose.outputTone) : '');
    }
    var autosave = els.composeSlot.querySelector('.autosave-indicator');
    if (autosave) {
      var modeStatus = String(state.compose.saveStatus || '');
      if (state.compose.uploading > 0) {
        autosave.hidden = false;
        autosave.classList.remove('is-error');
        autosave.classList.add('is-saving');
        autosave.textContent = 'Uploading...';
        return;
      }
      autosave.hidden = !modeStatus;
      autosave.classList.toggle('is-saving', modeStatus === 'saving');
      autosave.classList.toggle('is-error', modeStatus === 'error');
      autosave.textContent = modeStatus === 'saving' ? 'Saving...' : (modeStatus === 'error' ? 'Save failed' : 'Saved');
    }
  }

  function renderExtrasAfter() {
    if (!els.content) {
      return;
    }
    var page = getRenderState();
    var after = String(page.extras_after || '').trim();
    if (!after) {
      els.content.hidden = true;
      els.content.innerHTML = '';
      return;
    }
    els.content.hidden = false;
    els.content.innerHTML = markdownBlock(after);
  }

  function formatType(value) {
    var raw = String(value || '').trim();
    if (!raw) {
      return 'Post';
    }
    return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  function matchFacet(set, value) {
    if (!set || !set.size) {
      return true;
    }
    return set.has(String(value || ''));
  }

  function matchTags(postTags) {
    if (!state.filters.tags.size) {
      return true;
    }
    var tags = Array.isArray(postTags) ? postTags : [];
    for (var i = 0; i < tags.length; i += 1) {
      if (state.filters.tags.has(String(tags[i]))) {
        return true;
      }
    }
    return false;
  }

  function filteredPosts() {
    return state.posts.filter(function (post) {
      return matchTags(post.tags) &&
        matchFacet(state.filters.years, post.year) &&
        matchFacet(state.filters.types, post.type);
    });
  }

  function filterButtonHtml(group, value, label, isActive) {
    return '<button type="button" class="blog-filter-chip' + (isActive ? ' is-active' : '') + '" data-filter-group="' + escapeHtml(group) + '" data-filter-value="' + escapeHtml(value) + '" aria-pressed="' + (isActive ? 'true' : 'false') + '">' + escapeHtml(label) + '</button>';
  }

  function uniqueSorted(items, compareFn) {
    var map = {};
    items.forEach(function (item) {
      var key = String(item || '');
      if (!key) {
        return;
      }
      map[key] = true;
    });
    var out = Object.keys(map);
    out.sort(compareFn);
    return out;
  }

  function renderFilters() {
    if (!els.tags || !els.years || !els.types) {
      return;
    }

    var tags = uniqueSorted(state.posts.reduce(function (acc, post) {
      return acc.concat(Array.isArray(post.tags) ? post.tags : []);
    }, []), function (a, b) {
      return a.localeCompare(b);
    });

    var years = uniqueSorted(state.posts.map(function (post) {
      return post.year || '';
    }), function (a, b) {
      var an = Number(a);
      var bn = Number(b);
      if (isFinite(an) && isFinite(bn)) {
        return bn - an;
      }
      return a.localeCompare(b);
    });

    var types = uniqueSorted(state.posts.map(function (post) {
      return post.type || 'post';
    }), function (a, b) {
      return formatType(a).localeCompare(formatType(b));
    });

    els.tags.innerHTML = tags.map(function (tag) {
      return filterButtonHtml('tags', tag, tag, state.filters.tags.has(tag));
    }).join('');

    els.years.innerHTML = years.map(function (year) {
      return filterButtonHtml('years', year, year, state.filters.years.has(year));
    }).join('');

    els.types.innerHTML = types.map(function (type) {
      return filterButtonHtml('types', type, formatType(type), state.filters.types.has(type));
    }).join('');
  }

  function renderList() {
    if (!els.list || !els.empty) {
      return;
    }
    if (!state.initialPostsLoaded) {
      els.list.innerHTML = '';
      els.empty.hidden = true;
      return;
    }
    var shown = filteredPosts();

    if (!shown.length) {
      els.list.innerHTML = '';
      els.empty.hidden = false;
      return;
    }

    els.empty.hidden = true;
    els.list.innerHTML = shown.map(function (post) {
      var tagsHtml = (post.tags || []).map(function (tag) {
        return '<button type="button" class="tag blog-inline-tag" data-inline-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
      }).join('');
      var comments = Number(post.comment_count || 0);
      var commentsLabel = comments === 1 ? '1 comment' : String(comments) + ' comments';
      var author = String(post.author || '').trim();
      if (!author) {
        author = 'Blog Author';
      }

      return '' +
        '<article class="post-item blog-post-item">' +
          '<div class="post-head">' +
            '<div class="post-head-main">' +
              '<h2 class="post-title"><a href="' + escapeHtml(post.url || '#') + '">' + escapeHtml(post.title || 'Untitled') + '</a></h2>' +
              '<div class="post-author">' + escapeHtml(author) + '</div>' +
            '</div>' +
            '<div class="post-meta"><span class="post-date">' + escapeHtml(post.pub_date || 'Unknown date') + '</span> <span class="post-comments-count">' + escapeHtml(commentsLabel) + '</span></div>' +
          '</div>' +
          (post.summary ? '<p class="post-summary">' + escapeHtml(post.summary) + '</p>' : '') +
          '<div class="blog-meta-row"><span class="blog-type-pill">' + escapeHtml(formatType(post.type)) + '</span> <span class="blog-year-pill">' + escapeHtml(post.year || 'Unknown') + '</span></div>' +
          (tagsHtml ? '<div class="tags">' + tagsHtml + '</div>' : '') +
        '</article>';
    }).join('');
  }

  function renderAll() {
    renderHead();
    renderAdmin();
    renderValidation();
    renderPageSettings();
    renderExtrasAfter();
    renderFilters();
    renderList();
    renderComposeUi();
  }

  function toggleFilter(group, value, multi) {
    var key = String(group || '');
    var target = state.filters[key];
    if (!target) {
      return;
    }
    var normalized = String(value || '');
    if (!normalized) {
      return;
    }

    if (multi) {
      if (target.has(normalized)) {
        target.delete(normalized);
      } else {
        target.add(normalized);
      }
    } else {
      if (target.size === 1 && target.has(normalized)) {
        target.clear();
      } else {
        target.clear();
        target.add(normalized);
      }
    }
    renderFilters();
    renderList();
  }

  function clearFilters() {
    state.filters.tags.clear();
    state.filters.years.clear();
    state.filters.types.clear();
    renderFilters();
    renderList();
  }

  function applyDefaultFilters() {
    if (state.defaultFiltersApplied) {
      return;
    }
    var page = getRenderState();
    var defaultTag = String(page.default_tag || '').trim();
    if (!defaultTag) {
      state.defaultFiltersApplied = true;
      return;
    }
    if (!state.filters.tags.size && !state.filters.years.size && !state.filters.types.size) {
      state.filters.tags.add(defaultTag);
    }
    state.defaultFiltersApplied = true;
  }

  function setPanelOpen(open) {
    if (!els.panel || !els.toggle) {
      return;
    }
    var isOpen = !!open;
    els.toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (panelHideTimer) {
      window.clearTimeout(panelHideTimer);
      panelHideTimer = null;
    }

    if (isOpen) {
      var wasHidden = !!els.panel.hidden;
      els.panel.hidden = false;
      if (wasHidden) {
        els.panel.classList.remove('is-open');
        void els.panel.offsetHeight;
        window.requestAnimationFrame(function () {
          els.panel.classList.add('is-open');
        });
      } else {
        els.panel.classList.add('is-open');
      }
      return;
    }

    els.panel.classList.remove('is-open');
    panelHideTimer = window.setTimeout(function () {
      panelHideTimer = null;
      if (!els.panel.classList.contains('is-open')) {
        els.panel.hidden = true;
      }
    }, 420);
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      var savedAt = Number(parsed && parsed.saved_at || 0);
      if (!isFinite(savedAt) || savedAt <= 0 || (Date.now() - savedAt) > POSTS_CACHE_MAX_AGE_MS) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      if (parsed && Array.isArray(parsed.posts)) {
        return parsed.posts;
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  function writeCache(posts) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        posts: posts || [],
        saved_at: Date.now()
      }));
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function loadPageState() {
    var auth = authPayload();
    return apiPost('/cgi/blog-get-nostr-page', {
      page_slug: slug,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      var payloadType = String((data && data.page_type) || '').trim().toLowerCase();
      if (payloadType && payloadType !== 'blog') {
        if (!templateRefreshRequested() && reloadForTemplateRefresh()) {
          return;
        }
        throw new Error('This page shell does not match its configured type. Reload failed.');
      }
      clearTemplateRefreshParam();
      state.payload = data;
      state.draft = normalizePageState((data && data.state) || { title: titleizeSlug(slug) });
      state.navTitle = String((data && data.nav_title) || '').trim();
      state.navTitleEditing = false;
      state.navTitleInput = '';
      state.navTitleBusy = false;
      state.saveIndicatorVisible = false;
      setSaveStatus('saved');
    }).catch(function () {
      // Keep existing optimistic state when page-state fetch fails.
    }).finally(function () {
      state.initialPageStateLoaded = true;
      applyDefaultFilters();
      renderAll();
      maybeMarkInitialContentPainted();
    });
  }

  function loadPosts() {
    return fetch('/cgi/blog-list-public-posts', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success || !Array.isArray(data.posts)) {
          return;
        }
        state.posts = data.posts;
        writeCache(state.posts);
        renderFilters();
        renderList();
      })
      .catch(function () {
        // Keep cached posts if fetch fails.
      })
      .finally(function () {
        state.initialPostsLoaded = true;
        renderFilters();
        renderList();
        maybeMarkInitialContentPainted();
      });
  }

  root.addEventListener('click', function (event) {
    var composeFab = event.target && event.target.closest('[data-blog-action="toggle-compose"]');
    if (composeFab) {
      event.preventDefault();
      setComposeOpen(!state.compose.open);
      return;
    }

    var composeAction = event.target && event.target.closest('[data-compose-action]');
    if (composeAction) {
      event.preventDefault();
      var actionName = String(composeAction.getAttribute('data-compose-action') || '');
      if (actionName === 'toggle-preview') {
        state.compose.preview = !state.compose.preview;
        renderComposeUi();
        return;
      }
      if (actionName === 'set-post-type') {
        setComposePostType(String(composeAction.getAttribute('data-compose-post-type') || ''));
        return;
      }
      if (actionName === 'publish') {
        saveCompose(composeModeAction(composePublishMode()));
        return;
      }
      if (actionName === 'delete') {
        deleteComposeDraft();
        return;
      }
      if (actionName === 'remove-tag') {
        removeComposeTag(String(composeAction.getAttribute('data-compose-tag') || ''));
        renderComposeUi();
        queueComposeAutosave();
        return;
      }
      if (actionName === 'pick-capture-media' || actionName === 'pick-upload-media' || actionName === 'pick-upload-file' || actionName === 'pick-upload-audio') {
        var field = '';
        var type = '';
        if (actionName === 'pick-capture-media') {
          field = 'capture-upload';
          type = 'capture-media';
        } else if (actionName === 'pick-upload-media') {
          field = 'media-upload';
          type = 'upload-media';
        } else if (actionName === 'pick-upload-file') {
          field = 'file-upload';
          type = 'attachment';
        } else {
          field = 'audio-upload';
          type = 'audio-note';
        }
        setComposePostType(type, { skipAutosave: true, skipRender: true });
        var picker = els.composeSlot.querySelector('[data-compose-field="' + field + '"]');
        if (picker instanceof HTMLInputElement) {
          picker.click();
        }
        return;
      }
    }

    var composeToolbar = event.target && event.target.closest('[data-compose-toolbar]');
    if (composeToolbar) {
      event.preventDefault();
      composeToolbarAction(String(composeToolbar.getAttribute('data-compose-toolbar') || ''));
      return;
    }

    var toggle = event.target && event.target.closest('[data-filter-group][data-filter-value]');
    if (toggle) {
      event.preventDefault();
      toggleFilter(
        toggle.getAttribute('data-filter-group'),
        toggle.getAttribute('data-filter-value'),
        !!(event.metaKey || event.ctrlKey)
      );
      return;
    }

    var inlineTag = event.target && event.target.closest('[data-inline-tag]');
    if (inlineTag) {
      event.preventDefault();
      setPanelOpen(true);
      toggleFilter('tags', inlineTag.getAttribute('data-inline-tag'), !!(event.metaKey || event.ctrlKey));
      return;
    }

    if (isAdmin() && state.editMode) {
      var navTitleActionNode = event.target && event.target.closest('[data-page-nav-title-action]');
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
    }

    var action = event.target && event.target.closest('[data-blog-action]');
    if (action) {
      event.preventDefault();
      if (action.getAttribute('data-blog-action') === 'toggle-edit') {
        if (state.editMode) {
          requestExitEditModeWithSave();
        } else {
          state.editMode = true;
          state.pendingToggleEditOff = false;
          state.saveIndicatorVisible = false;
          renderAll();
        }
      }
    }
  });

  root.addEventListener('input', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (isAdmin() && state.editMode) {
      state.draft = normalizePageState(state.draft || getRenderState());
      if (target instanceof HTMLInputElement && target.hasAttribute('data-page-nav-title-input')) {
        state.navTitleInput = String(target.value || '');
        return;
      }
      if (target.id === 'blog-settings-title-input' && target instanceof HTMLInputElement) {
        state.draft.title = String(target.value || '');
        renderHead();
        renderAdmin();
        queuePageAutosave(500);
        return;
      }
      if (target.id === 'blog-settings-description-input' && target instanceof HTMLTextAreaElement) {
        state.draft.content = String(target.value || '');
        renderHead();
        queuePageAutosave(500);
        return;
      }
      if (target.id === 'blog-settings-default-tag-input' && target instanceof HTMLInputElement) {
        state.draft.default_tag = String(target.value || '').trim();
        queuePageAutosave(400);
        return;
      }
      if (target.id === 'blog-settings-outro-input' && target instanceof HTMLTextAreaElement) {
        state.draft.extras_after = String(target.value || '');
        renderExtrasAfter();
        queuePageAutosave(500);
        return;
      }
    }
    if (!state.compose.open) {
      return;
    }
    if (target.matches('[data-compose-field="title"], [data-compose-field="content"], [data-compose-field="scheduled-at"], [data-compose-field="link-url"], [data-compose-field="link-body"]')) {
      if (target.matches('[data-compose-field="link-url"], [data-compose-field="link-body"]')) {
        if (target.matches('[data-compose-field="link-url"]')) {
          state.compose.linkUrl = String(target.value || '');
        } else {
          state.compose.linkBody = String(target.value || '');
        }
        if (composePostType() !== 'link-share') {
          state.compose.postType = 'link-share';
        }
      }
      queueComposeAutosave();
      if (state.compose.preview) {
        renderComposeUi();
      } else {
        renderComposeStatusOnly();
      }
      return;
    }
    if (target.matches('input[name="blog-inline-compose-mode"]')) {
      renderComposeUi();
      queueComposeAutosave();
    }
  });

  root.addEventListener('change', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement) || !state.compose.open) {
      return;
    }
    if (!target.matches('[data-compose-upload]')) {
      return;
    }
    var uploadType = String(target.getAttribute('data-compose-upload') || '').trim();
    var files = target.files ? Array.from(target.files) : [];
    if (!files.length) {
      return;
    }
    handleComposeUploads(files, uploadType).finally(function () {
      target.value = '';
    });
  });

  root.addEventListener('keydown', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target instanceof HTMLInputElement && target.hasAttribute('data-page-nav-title-input')) {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveNavbarTitle();
      }
      return;
    }
    if (!state.compose.open) {
      return;
    }
    if (target.matches('[data-compose-field="tags-input"]')) {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        if (commitComposeTagInput()) {
          renderComposeUi();
          queueComposeAutosave();
        }
        return;
      }
      if (event.key === 'Backspace') {
        var input = target;
        if (!String(input.value || '').trim() && state.compose.tags.length) {
          removeComposeTag(state.compose.tags[state.compose.tags.length - 1]);
          renderComposeUi();
          queueComposeAutosave();
        }
      }
    }
  });

  document.addEventListener('paste', function (event) {
    if (!isAdmin()) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    var images = clipboardImageFiles(event);
    if (!images.length) {
      return;
    }
    event.preventDefault();
    if (!state.compose.open) {
      setComposeOpen(true);
    }
    setComposePostType('upload-media', { skipAutosave: true, skipRender: true });
    handleComposeUploads(images, 'upload-media');
  });

  if (els.toggle) {
    els.toggle.addEventListener('click', function () {
      var open = els.toggle.getAttribute('aria-expanded') !== 'true';
      setPanelOpen(open);
    });
  }

  if (els.clear) {
    els.clear.addEventListener('click', function () {
      clearFilters();
    });
  }

  removeLegacyTitleBlock();
  ensureFilterGutterLayout();
  var cached = readCache();
  if (cached) {
    state.posts = cached;
  }
  renderAll();
  loadPageState();
  loadPosts();
})();
