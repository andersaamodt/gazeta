(function () {
  'use strict';

  var root = document.getElementById('oeuvre-root');
  if (!root) {
    return;
  }

  var querySlug = '';
  try {
    querySlug = String((new URLSearchParams(window.location.search)).get('list_slug') || '').trim();
  } catch (_err) {
    querySlug = '';
  }
  var slug = String(querySlug || root.getAttribute('data-list-slug') || 'oeuvre').trim() || 'oeuvre';
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
    busy: false,
    authSignature: '',
    saveTimer: null,
    saveStatus: 'saved',
    saveError: '',
    autosaveQueued: false
  };

  function authSignature() {
    var auth = getAuthPayload();
    return String(auth.session_token || '') + '|' + String(auth.csrf_token || '');
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
    return escapeHtml(value);
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
      throw new Error((data && data.error) ? data.error : ('Request failed (' + response.status + ')'));
    }
    return data;
  }

  function cloneEditableEntries(entries) {
    return (Array.isArray(entries) ? entries : []).map(function (entry) {
      return {
        event_id: String(entry && entry.event_id || ''),
        relay_hint: String(entry && entry.relay_hint || ''),
        marker: String(entry && entry.marker || ''),
        date: String(entry && entry.date || ''),
        markdown: String(entry && entry.markdown || '')
      };
    });
  }

  function readEditableStateFromPayload() {
    var s = (state.payload && state.payload.state) ? state.payload.state : {};
    return {
      title: String(s.title || root.getAttribute('data-list-title') || 'List'),
      description: String(s.description || ''),
      group_by: String(s.group_by || ''),
      content: String(s.content || ''),
      entries: cloneEditableEntries(s.entries)
    };
  }

  function getRenderState() {
    if (state.payload && state.payload.is_admin && state.draft) {
      return {
        title: state.draft.title,
        description: state.draft.description,
        group_by: state.draft.group_by,
        entries: cloneEditableEntries(state.draft.entries).map(function (entry) {
          var dateRaw = String(entry && entry.date || '');
          var year = '';
          if (dateRaw.length >= 4) {
            year = dateRaw.slice(0, 4);
          }
          return Object.assign({}, entry, {
            year: year
          });
        })
      };
    }
    var src = (state.payload && state.payload.state) ? state.payload.state : {};
    return {
      title: String(src.title || ''),
      description: String(src.description || ''),
      group_by: String(src.group_by || ''),
      entries: Array.isArray(src.entries) ? src.entries : []
    };
  }

  function renderList() {
    var s = getRenderState();
    if (els.title) {
      els.title.textContent = s.title || 'List';
    }
    if (els.description) {
      els.description.textContent = s.description || '';
      els.description.hidden = !s.description;
    }
    if (!els.content) {
      return;
    }
    var entries = Array.isArray(s.entries) ? s.entries : [];
    if (!entries.length) {
      if (state.payload && state.payload.is_admin) {
        els.content.innerHTML = '';
        return;
      }
      els.content.innerHTML = '<p class="placeholder">No entries yet.</p>';
      return;
    }
    var html = '';
    if (s.group_by === 'year') {
      var currentYear = '';
      var groupOpen = false;
      entries.forEach(function (entry) {
        var year = String(entry && entry.year || '');
        if (!year) {
          var dateRaw = String(entry && entry.date || '');
          if (dateRaw.length >= 4) {
            year = dateRaw.slice(0, 4);
          }
        }
        if (year !== currentYear) {
          if (groupOpen) {
            html += '</ul></section>';
          }
          currentYear = year;
          groupOpen = true;
          html += '<section class="list-year-group">';
          html += '<h3 class="list-year-heading">' + escapeHtml(year || 'Unknown') + '</h3>';
          html += '<ul class="list-entries">';
        }
        html += renderEntryItem(entry);
      });
      if (groupOpen) {
        html += '</ul></section>';
      }
    } else {
      html += '<ul class="list-entries">';
      entries.forEach(function (entry) {
        html += renderEntryItem(entry);
      });
      html += '</ul>';
    }
    els.content.innerHTML = html;
  }

  function renderEntryItem(entry) {
    var line = String(entry && entry.markdown || '').trim();
    var postUrl = String(entry && entry.post_url || '');
    var linked = postUrl
      ? '<a class="list-entry-post-link" href="' + escapeHtml(postUrl) + '" title="Open linked post">↗</a>'
      : '';
    return '<li class="list-entry-line">' + linked + '<span class="list-entry-markdown">' + markdownInline(line) + '</span></li>';
  }

  function renderValidation() {
    if (!els.validation) {
      return;
    }
    var v = (state.payload && state.payload.validation) ? state.payload.validation : {};
    var errors = Array.isArray(v.errors) ? v.errors : [];
    var warnings = Array.isArray(v.warnings) ? v.warnings : [];
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
    if (!(state.payload && state.payload.is_admin)) {
      if (state.saveTimer) {
        clearTimeout(state.saveTimer);
        state.saveTimer = null;
      }
      els.admin.hidden = true;
      els.admin.innerHTML = '';
      return;
    }
    if (!state.draft) {
      state.draft = readEditableStateFromPayload();
    }
    var canRevert = !!(state.payload && state.payload.canonical_exists);
    var revertTitle = canRevert ? 'Revert draft to Nostr version' : 'No Nostr version found';
    var entries = Array.isArray(state.draft.entries) ? state.draft.entries : [];
    var html = '';
    html += '<details class="list-admin-panel" open>';
    html += '<summary class="list-admin-summary">Edit List</summary>';
    html += '<div class="list-admin-topbar">';
    html += '<div class="list-admin-actions">';
    html += '<button type="button" data-list-action="revert" title="' + escapeHtml(revertTitle) + '"' + (canRevert ? '' : ' disabled aria-disabled="true"') + '>Revert</button>';
    html += '<button type="button" data-list-action="publish">Publish to Nostr...</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="list-admin-meta">';
    html += '<label><span>Title</span><input id="list-admin-title" type="text" value="' + escapeHtml(state.draft.title || '') + '"></label>';
    html += '<label><span>Description</span><input id="list-admin-description" type="text" value="' + escapeHtml(state.draft.description || '') + '"></label>';
    html += '<label><span>Group by</span><select id="list-admin-group-by">';
    html += '<option value=""' + (state.draft.group_by ? '' : ' selected') + '>None</option>';
    html += '<option value="year"' + (state.draft.group_by === 'year' ? ' selected' : '') + '>Year</option>';
    html += '</select></label>';
    html += '</div>';
    html += '<section class="list-admin-entries-wrap">';
    html += '<h2 class="list-admin-entries-title">Entries</h2>';
    html += '<div class="list-admin-entries">';
    if (!entries.length) {
      html += '<p class="placeholder list-admin-empty">No entries yet.</p>';
    } else {
      entries.forEach(function (entry, idx) {
        html += '<div class="list-admin-entry" data-entry-index="' + idx + '">';
        html += '<div class="list-admin-entry-controls">';
        html += '<button type="button" data-list-entry-action="up" data-entry-index="' + idx + '" aria-label="Move up">↑</button>';
        html += '<button type="button" data-list-entry-action="down" data-entry-index="' + idx + '" aria-label="Move down">↓</button>';
        html += '<button type="button" data-list-entry-action="remove" data-entry-index="' + idx + '" aria-label="Remove">✕</button>';
        html += '</div>';
        html += '<div class="list-admin-entry-fields">';
        html += '<label><span>Date</span><input data-field="date" data-entry-index="' + idx + '" type="text" value="' + escapeHtml(entry.date || '') + '" placeholder="YYYY / YYYY-MM / YYYY-MM-DD"></label>';
        html += '<label class="list-admin-field-wide"><span>Markdown</span><input data-field="markdown" data-entry-index="' + idx + '" type="text" value="' + escapeHtml(entry.markdown || '') + '"></label>';
        html += '<details class="list-admin-eventid-details"' + (entry.event_id ? ' open' : '') + '>';
        html += '<summary>Add event_id</summary>';
        html += '<label><span>event_id</span><input data-field="event_id" data-entry-index="' + idx + '" type="text" value="' + escapeHtml(entry.event_id || '') + '"></label>';
        html += '</details>';
        html += '</div>';
        html += '</div>';
      });
    }
    html += '</div>';
    html += '<button type="button" class="list-admin-add-fab" data-list-action="add" aria-label="Add markdown entry" title="Add markdown entry">+</button>';
    html += '</section>';
    html += '<div id="list-admin-save-status" class="list-admin-save-status" aria-live="polite">';
    if (state.saveStatus === 'saving') {
      html += '<span class="save-spinner" aria-hidden="true"></span>Saving...';
    } else if (state.saveStatus === 'error') {
      html += 'Save failed';
    } else {
      html += 'Saved';
    }
    html += '</div>';
    html += '</details>';
    els.admin.hidden = false;
    els.admin.innerHTML = html;
  }

  function syncDraftFromInputs() {
    if (!(state.payload && state.payload.is_admin && state.draft && els.admin)) {
      return;
    }
    var titleInput = document.getElementById('list-admin-title');
    var descriptionInput = document.getElementById('list-admin-description');
    var groupByInput = document.getElementById('list-admin-group-by');
    state.draft.title = titleInput ? String(titleInput.value || '').trim() : state.draft.title;
    state.draft.description = descriptionInput ? String(descriptionInput.value || '').trim() : state.draft.description;
    state.draft.group_by = groupByInput ? String(groupByInput.value || '').trim() : state.draft.group_by;
    var nextEntries = [];
    var rows = Array.from(els.admin.querySelectorAll('.list-admin-entry[data-entry-index]'));
    rows.forEach(function (row) {
      var idx = Number(row.getAttribute('data-entry-index'));
      if (!isFinite(idx) || !state.draft.entries[idx]) {
        return;
      }
      var current = state.draft.entries[idx];
      nextEntries.push({
        event_id: readEntryField(row, 'event_id', current.event_id),
        relay_hint: readEntryField(row, 'relay_hint', current.relay_hint),
        marker: readEntryField(row, 'marker', current.marker),
        date: readEntryField(row, 'date', current.date),
        markdown: readEntryField(row, 'markdown', current.markdown)
      });
    });
    state.draft.entries = nextEntries;
  }

  function readEntryField(row, field, fallback) {
    var node = row.querySelector('[data-field="' + field + '"]');
    if (!(node instanceof HTMLInputElement)) {
      return String(fallback || '');
    }
    return String(node.value || '').trim();
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
    if (!(state.payload && state.payload.is_admin && state.draft)) {
      return;
    }
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
    }
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      persistDraft({ alertOnError: false });
    }, Number(delayMs) > 0 ? Number(delayMs) : 500);
  }

  async function persistDraft(options) {
    if (state.busy || !(state.payload && state.payload.is_admin && state.draft)) {
      state.autosaveQueued = true;
      return;
    }
    var opts = options || {};
    state.busy = true;
    syncDraftFromInputs();
    setSaveStatus('saving');
    try {
      var auth = getAuthPayload();
      await apiPost('/cgi/blog-save-list-draft', {
        list_slug: slug,
        title: state.draft.title || '',
        description: state.draft.description || '',
        group_by: state.draft.group_by || '',
        content: state.draft.content || '',
        entries_json: JSON.stringify(state.draft.entries || []),
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      if (state.payload) {
        state.payload.draft_exists = true;
        state.payload.draft_differs = false;
      }
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error', err && err.message ? err.message : 'Could not save draft');
      if (opts.alertOnError !== false) {
        window.alert(err.message || 'Could not save draft');
      }
      return false;
    } finally {
      state.busy = false;
      if (state.autosaveQueued) {
        state.autosaveQueued = false;
        queueAutosave(250);
      }
    }
    return true;
  }

  async function publishDraft() {
    if (state.busy) {
      return;
    }
    syncDraftFromInputs();
    var saved = await persistDraft({ alertOnError: true });
    if (!saved) {
      return;
    }
    state.busy = true;
    setSaveStatus('saving');
    try {
      var auth = getAuthPayload();
      await apiPost('/cgi/blog-publish-list-page', {
        list_slug: slug,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      await load();
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error', err && err.message ? err.message : 'Could not publish list');
      window.alert(err.message || 'Could not publish list');
    } finally {
      state.busy = false;
    }
  }

  async function revertDraft() {
    if (state.busy) {
      return;
    }
    if (!(state.payload && state.payload.canonical_exists)) {
      return;
    }
    if (!window.confirm('Discard local draft changes and restore canonical Nostr version?')) {
      return;
    }
    state.busy = true;
    setSaveStatus('saving');
    try {
      var auth = getAuthPayload();
      await apiPost('/cgi/blog-revert-list-draft', {
        list_slug: slug,
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

  function bindAdminEvents() {
    if (!els.admin) {
      return;
    }
    els.admin.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      var actionNode = target.closest('[data-list-action]');
      if (actionNode instanceof HTMLElement) {
        var action = actionNode.getAttribute('data-list-action');
        if (action === 'publish') {
          publishDraft();
          return;
        }
        if (action === 'revert') {
          if (actionNode.disabled) {
            return;
          }
          revertDraft();
          return;
        }
        if (action === 'add') {
          if (!state.draft) {
            return;
          }
          syncDraftFromInputs();
          state.draft.entries.push({ event_id: '', relay_hint: '', marker: 'oeuvre', date: '', markdown: '' });
          renderAdmin();
          renderList();
          queueAutosave(120);
          return;
        }
      }
      var rowAction = target.closest('[data-list-entry-action][data-entry-index]');
      if (!(rowAction instanceof HTMLElement) || !state.draft) {
        return;
      }
      syncDraftFromInputs();
      var entryAction = rowAction.getAttribute('data-list-entry-action');
      var idx = Number(rowAction.getAttribute('data-entry-index'));
      if (!isFinite(idx) || idx < 0 || idx >= state.draft.entries.length) {
        return;
      }
      if (entryAction === 'remove') {
        state.draft.entries.splice(idx, 1);
      } else if (entryAction === 'up' && idx > 0) {
        var prev = state.draft.entries[idx - 1];
        state.draft.entries[idx - 1] = state.draft.entries[idx];
        state.draft.entries[idx] = prev;
      } else if (entryAction === 'down' && idx < state.draft.entries.length - 1) {
        var next = state.draft.entries[idx + 1];
        state.draft.entries[idx + 1] = state.draft.entries[idx];
        state.draft.entries[idx] = next;
      } else {
        return;
      }
      renderAdmin();
      renderList();
      queueAutosave(120);
    });

    els.admin.addEventListener('input', function () {
      syncDraftFromInputs();
      renderList();
      queueAutosave(500);
    });

    els.admin.addEventListener('change', function () {
      syncDraftFromInputs();
      renderList();
      queueAutosave(300);
    });
  }

  async function load() {
    try {
      state.authSignature = authSignature();
      var auth = getAuthPayload();
      state.payload = await apiPost('/cgi/blog-get-list-page', {
        list_slug: slug,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      state.draft = readEditableStateFromPayload();
      setSaveStatus('saved');
      renderAdmin();
      renderValidation();
      renderList();
    } catch (err) {
      if (els.content) {
        els.content.innerHTML = '<p class="placeholder">Error: ' + escapeHtml(err.message || 'Could not load list page') + '</p>';
      }
    }
  }

  bindAdminEvents();
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
