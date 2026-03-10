(function () {
  var root = document.getElementById('contact-page-root');
  if (!root) {
    return;
  }

  var query = new URLSearchParams(window.location.search || '');
  var slug = String(query.get('page_slug') || query.get('slug') || root.getAttribute('data-page-slug') || 'contact').trim() || 'contact';

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
    busy: false,
    autosaveQueued: false,
    saveTimer: null,
    saveStatus: 'saved',
    saveIndicatorVisible: false
  };

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
    if (els.title) {
      els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'Profile') + '</span><span id="contact-page-title-actions" class="list-page-title-actions"></span>';
    }
    if (els.description) {
      var text = String(s.description || '').trim();
      if (text) {
        els.description.hidden = false;
        els.description.innerHTML = markdownInline(text);
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
    if (!rows.length) {
      return '<p class="placeholder">No profile entries yet.</p>';
    }
    var html = '<ul class="list-entries">';
    rows.forEach(function (row) {
      var transport = String(row.transport || '').trim();
      var value = String(row.value || '').trim();
      if (!transport || !value) {
        return;
      }
      var qLabel = qualifierLabel(row.qualifier || '');
      html += '<li class="list-entry-line">';
      html += '<strong>' + escapeHtml(transport) + ':</strong> ' + escapeHtml(value);
      if (qLabel) {
        html += ' <span class="muted">(' + escapeHtml(qLabel) + ')</span>';
      }
      html += '</li>';
    });
    html += '</ul>';
    return html;
  }

  function renderEditor(rows, draft) {
    var html = '';
    html += '<section class="nostr-page-extras-editor" aria-label="Page extras">';
    html += '<h3 class="nostr-page-extras-heading">Intro and outro</h3>';
    html += '<label class="nostr-page-extra-edit">';
    html += '<span>Intro (Markdown)<span class="nostr-page-extra-controls"><label class="checkbox-control"><input type="checkbox" data-contact-intro-publish="true"' + (draft.publish_intro_to_nostr ? ' checked' : '') + '> <span>Publish intro to Nostr</span></label></span></span>';
    html += '<textarea data-contact-intro="true" rows="4" placeholder="Optional intro shown before profile entries">' + escapeHtml(draft.description || '') + '</textarea>';
    html += '</label>';
    html += '<label class="nostr-page-extra-edit">';
    html += '<span>Outro</span>';
    html += '<span class="nostr-page-extra-controls">';
    html += '<select data-contact-outro-format="after">';
    html += '<option value="markdown"' + (draft.extras_after_format === 'markdown' ? ' selected' : '') + '>Markdown</option>';
    html += '<option value="html"' + (draft.extras_after_format === 'html' ? ' selected' : '') + '>HTML</option>';
    html += '</select>';
    html += '</span>';
    html += '<textarea data-contact-outro="after" rows="4" placeholder="Optional local content shown after the Nostr-backed section">' + escapeHtml(draft.extras_after || '') + '</textarea>';
    html += '</label>';
    html += '</section>';

    html += '<div class="contact-inline-toolbar">';
    html += '<div class="contact-inline-meta">';
    html += '<label><span>Title</span><input type="text" id="contact-title-input" value="' + escapeHtml(draft.title || '') + '"></label>';
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
      var actionNode = target.closest('[data-contact-action]');
      if (!(actionNode instanceof HTMLElement) || !isAdmin()) {
        return;
      }
      var action = String(actionNode.getAttribute('data-contact-action') || '');
      if (action === 'toggle-edit') {
        state.editMode = !state.editMode;
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
      state.payload = payload;
      state.draft = normalizeDraftState(payload.state || { title: '', description: '', rows: [] });
      state.saveIndicatorVisible = false;
      setSaveStatus('saved');
      renderAll();
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
