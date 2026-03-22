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
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
    renderAll();
    markInitialContentPainted();
    markHydrationPageReady();
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
      return {
        transport: String(row && row.transport || '').trim().toLowerCase(),
        value: String(row && row.value || ''),
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
    if (els.description && els.description.parentNode === head) {
      head.insertBefore(host, els.description);
    } else if (els.title.nextSibling) {
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

  function inferContactLinkFromTransport(value, transport) {
    var raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    var transportKey = normalizeTransportKey(transport);
    var match;
    if (transportKey === 'email' || transportKey === 'mail') {
      match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (match && match[0]) {
        return renderContactHref('mailto:' + match[0], raw);
      }
    }
    if (transportKey === 'telegram') {
      if (/^@?[a-z0-9_]{3,}$/i.test(raw)) {
        return renderContactHref('https://t.me/' + raw.replace(/^@/, ''), raw);
      }
    }
    if (transportKey === 'twitter' || transportKey === 'x') {
      if (/^@?[a-z0-9_]{1,15}$/i.test(raw)) {
        return renderContactHref('https://x.com/' + raw.replace(/^@/, ''), raw);
      }
    }
    if (transportKey === 'reddit') {
      if (/^\/?u\/[a-z0-9_-]+$/i.test(raw)) {
        return renderContactHref('https://reddit.com/' + raw.replace(/^\//, ''), raw);
      }
      if (/^[a-z0-9_-]+$/i.test(raw)) {
        return renderContactHref('https://reddit.com/u/' + raw, raw);
      }
    }
    if (transportKey === 'facebook' && /^[a-z0-9.]{3,}$/i.test(raw)) {
      return renderContactHref('https://facebook.com/' + raw, raw);
    }
    if (transportKey === 'tumblr') {
      if (/^[a-z0-9-]+\.tumblr\.com$/i.test(raw)) {
        return renderContactHref('https://' + raw, raw);
      }
      if (/^[a-z0-9-]+$/i.test(raw)) {
        return renderContactHref('https://' + raw + '.tumblr.com', raw);
      }
    }
    return '';
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
      els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'Profile') + '</span><span id="contact-page-title-actions" class="list-page-title-actions"></span>';
    }
    renderNavbarTitleRow(s);
    if (els.description) {
      var text = String(s.description || '').trim();
      var rows = normalizeRows(s.rows || []).filter(function (row) {
        return String(row.transport || '').trim() && String(row.value || '').trim();
      });
      var hasMainContent = rows.length > 0 || String(s.extras_after || '').trim().length > 0;
      if (text) {
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

  function renderReadOnly(rows) {
    var list = normalizeRows(rows).filter(function (row) {
      return String(row.transport || '').trim() && String(row.value || '').trim();
    });
    if (!list.length) {
      return '<p class="list-page-empty-state">No content yet.</p>';
    }
    var html = '<div class="contact-profile-table-wrap"><table class="contact-profile-table"><tbody>';
    list.forEach(function (row) {
      var transport = String(row.transport || '').trim();
      var value = String(row.value || '').trim();
      if (!transport || !value) {
        return;
      }
      var qLabel = qualifierLabel(row.qualifier || '');
      var qValue = String(row.qualifier || '').trim().toLowerCase();
      html += '<tr class="contact-profile-row">';
      html += '<th scope="row" class="contact-platform-cell">' + escapeHtml(transport) + '</th>';
      html += '<td class="contact-value-cell"><div class="contact-value-main">' + linkifyContactValue(value, transport) + '</div>';
      if (qLabel) {
        html += '<span class="contact-qualifier-pill" data-qualifier="' + escapeAttr(qValue) + '">' + escapeHtml(qLabel) + '</span>';
      }
      html += '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderEditor(rows, draft) {
    var introScope = draft.publish_intro_to_nostr ? 'nostr' : 'local';
    var introScopeLabel = introScope === 'nostr' ? 'Nostr' : 'Local';
    var html = '';
    html += '<section class="nostr-page-extras-editor" aria-label="Page extras">';
    html += '<h3 class="nostr-page-extras-heading">Before and after content</h3>';
    html += '<label class="nostr-page-extra-edit">';
    html += '<span>Before content (Markdown) <span class="nostr-page-scope-pill is-' + introScope + '">' + introScopeLabel + '</span><span class="nostr-page-extra-controls"><label class="checkbox-control"><input type="checkbox" data-contact-intro-publish="true"' + (draft.publish_intro_to_nostr ? ' checked' : '') + '> <span>Nostr</span></label></span></span>';
    html += '<textarea data-contact-intro="true" rows="4" placeholder="Optional content shown before the main content section">' + escapeHtml(draft.description || '') + '</textarea>';
    html += '</label>';
    html += '<label class="nostr-page-extra-edit">';
    html += '<span>After content <span class="nostr-page-scope-pill is-local">Local</span></span>';
    html += '<span class="nostr-page-extra-controls">';
    html += '<select data-contact-outro-format="after">';
    html += '<option value="markdown"' + (draft.extras_after_format === 'markdown' ? ' selected' : '') + '>Markdown</option>';
    html += '<option value="html"' + (draft.extras_after_format === 'html' ? ' selected' : '') + '>HTML</option>';
    html += '</select>';
    html += '</span>';
    html += '<textarea data-contact-outro="after" rows="4" placeholder="Optional local content shown after the main content section">' + escapeHtml(draft.extras_after || '') + '</textarea>';
    html += '</label>';
    html += '</section>';

    html += '<div class="contact-inline-toolbar">';
    html += '<div class="contact-inline-meta">';
    html += '<label><span>Title <span class="nostr-page-scope-pill is-nostr">Nostr</span></span><input type="text" id="contact-title-input" value="' + escapeHtml(draft.title || '') + '"></label>';
    html += '</div>';
    html += '<div class="contact-inline-toolbar-right"><button type="button" data-contact-action="add-row" title="Add profile row">+</button></div>';
    html += '</div>';

    if (!rows.length) {
      html += '<div class="list-inline-empty">No profile rows yet.</div>';
      return html;
    }

    html += '<div class="contact-inline-head">';
    html += '<span>Transport</span><span>Value</span><span>Qualifier</span><span></span>';
    html += '</div>';
    html += '<div class="contact-inline-rows">';
    rows.forEach(function (row, idx) {
      html += '<div class="contact-inline-row" data-row-index="' + String(idx) + '">';
      html += '<input type="text" data-contact-field="transport" data-row-index="' + String(idx) + '" value="' + escapeHtml(row.transport || '') + '" placeholder="signal">';
      html += '<input type="text" data-contact-field="value" data-row-index="' + String(idx) + '" value="' + escapeHtml(row.value || '') + '" placeholder="value">';
      html += '<select data-contact-field="qualifier" data-row-index="' + String(idx) + '">';
      html += '<option value=""' + (!row.qualifier ? ' selected' : '') + '>(none)</option>';
      html += '<option value="preferred"' + (row.qualifier === 'preferred' ? ' selected' : '') + '>preferred</option>';
      html += '<option value="unpreferred"' + (row.qualifier === 'unpreferred' ? ' selected' : '') + '>unpreferred</option>';
      html += '<option value="public"' + (row.qualifier === 'public' ? ' selected' : '') + '>public</option>';
      html += '<option value="primary"' + (row.qualifier === 'primary' ? ' selected' : '') + '>primary</option>';
      html += '<option value="secondary"' + (row.qualifier === 'secondary' ? ' selected' : '') + '>secondary</option>';
      html += '<option value="emergency"' + (row.qualifier === 'emergency' ? ' selected' : '') + '>emergency</option>';
      html += '<option value="archive"' + (row.qualifier === 'archive' ? ' selected' : '') + '>archive</option>';
      html += '</select>';
      html += '<button type="button" class="icon-danger unobtrusive-icon-button" data-contact-action="remove-row" data-row-index="' + String(idx) + '" title="Delete this entry">✕</button>';
      html += '</div>';
    });
    html += '</div>';
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
    if (isAdmin() && state.editMode) {
      els.content.innerHTML = renderEditor(rows, s) + renderReadOnly(rows) + afterContent;
    } else {
      els.content.innerHTML = renderReadOnly(rows) + afterContent;
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
        state.draft.rows.push({ transport: '', value: '', qualifier: '' });
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
        renderAll();
        queueAutosave(500);
      }
    });

    root.addEventListener('input', function (event) {
      if (!isAdmin() || !state.editMode) {
        return;
      }
      var target = event.target;
      if (target instanceof HTMLTextAreaElement) {
        if (target.hasAttribute('data-contact-intro')) {
          state.draft = normalizeDraftState(state.draft);
          state.draft.description = String(target.value || '');
          renderHead();
          queueAutosave(500);
          return;
        }
        var outroField = String(target.getAttribute('data-contact-outro') || '');
        if (outroField === 'after') {
          state.draft = normalizeDraftState(state.draft);
          state.draft.extras_after = String(target.value || '');
          queueAutosave(500);
        }
        return;
      }

      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-page-nav-title-input')) {
        state.navTitleInput = String(target.value || '');
        return;
      }

      var outroFormatField = String(target.getAttribute('data-contact-outro-format') || '');
      if (target instanceof HTMLSelectElement && outroFormatField === 'after') {
        state.draft = normalizeDraftState(state.draft);
        state.draft.extras_after_format = normalizeExtraFormat(target.value || '');
        renderContent();
        queueAutosave(500);
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-contact-intro-publish')) {
        state.draft = normalizeDraftState(state.draft);
        state.draft.publish_intro_to_nostr = !!target.checked;
        queueAutosave(500);
        return;
      }

      if (target.id === 'contact-title-input') {
        state.draft.title = String(target.value || '');
        renderHead();
        renderAdmin();
        queueAutosave(500);
        return;
      }
      var field = String(target.getAttribute('data-contact-field') || '');
      var idx = Number(target.getAttribute('data-row-index'));
      if (!field || !Number.isInteger(idx) || idx < 0) {
        return;
      }
      state.draft.rows = normalizeRows(state.draft.rows || []);
      if (!state.draft.rows[idx]) {
        return;
      }
      state.draft.rows[idx][field] = String(target.value || '');
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
        return;
      }
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }

      var extraFormatField = String(target.getAttribute('data-contact-outro-format') || '');
      if (extraFormatField === 'after') {
        state.draft = normalizeDraftState(state.draft);
        state.draft.extras_after_format = normalizeExtraFormat(target.value || '');
        renderContent();
        queueAutosave(500);
        return;
      }

      var field = String(target.getAttribute('data-contact-field') || '');
      var idx = Number(target.getAttribute('data-row-index'));
      if (!field || !Number.isInteger(idx) || idx < 0) {
        return;
      }
      state.draft.rows = normalizeRows(state.draft.rows || []);
      if (!state.draft.rows[idx]) {
        return;
      }
      state.draft.rows[idx][field] = String(target.value || '');
      queueAutosave(500);
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
