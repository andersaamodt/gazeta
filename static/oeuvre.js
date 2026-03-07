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
    autosaveQueued: false,
    editMode: false,
    activeEntryUid: '',
    dragUid: '',
    uidCounter: 1
  };

  function isAdmin() {
    return !!(state.payload && state.payload.is_admin && state.draft);
  }

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

  function nextUid() {
    return 'entry-' + String(state.uidCounter++);
  }

  function cloneEditableEntries(entries) {
    return (Array.isArray(entries) ? entries : []).map(function (entry) {
      return {
        _uid: String(entry && entry._uid || nextUid()),
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
    var ch = src.charAt(0).toUpperCase();
    if (!/[A-Z0-9]/.test(ch)) {
      return '#';
    }
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

  function getRenderState() {
    if (isAdmin()) {
      return {
        title: state.draft.title,
        description: state.draft.description,
        group_by: state.draft.group_by,
        entries: cloneEditableEntries(state.draft.entries)
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

  function findEntryIndex(uid) {
    var entries = Array.isArray(state.draft && state.draft.entries) ? state.draft.entries : [];
    for (var i = 0; i < entries.length; i += 1) {
      if (String(entries[i]._uid || '') === String(uid || '')) {
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
    var nodes = els.content.querySelectorAll('.list-entry-inline[data-entry-uid]');
    nodes.forEach(function (node) {
      var uid = node.getAttribute('data-entry-uid') || '';
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
    var nodes = els.content.querySelectorAll('.list-entry-inline[data-entry-uid]');
    nodes.forEach(function (node) {
      var uid = node.getAttribute('data-entry-uid') || '';
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
  }

  async function refreshValidation() {
    if (!isAdmin()) {
      return;
    }
    try {
      var auth = getAuthPayload();
      var latest = await apiPost('/cgi/blog-get-list-page', {
        list_slug: slug,
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
      return;
    }
    var opts = options || {};
    state.busy = true;
    syncMetaFromInputs();
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
      state.payload.draft_exists = true;
      state.payload.draft_differs = false;
      setSaveStatus('saved');
      refreshValidation();
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
    if (state.busy || !isAdmin()) {
      return;
    }
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

  function moveEntryByYear(uid) {
    if (!isAdmin() || state.draft.group_by !== 'year') {
      return;
    }
    var entries = state.draft.entries;
    var idx = findEntryIndex(uid);
    if (idx < 0) {
      return;
    }
    var moving = entries[idx];
    var year = yearFromDate(moving.date) || '';
    entries.splice(idx, 1);
    var inserted = false;
    for (var i = 0; i < entries.length; i += 1) {
      var y = yearFromDate(entries[i].date) || '';
      if (year && y && year > y) {
        entries.splice(i, 0, moving);
        inserted = true;
        break;
      }
      if (year === y) {
        var j = i + 1;
        while (j < entries.length && yearFromDate(entries[j].date) === year) {
          j += 1;
        }
        entries.splice(j, 0, moving);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      entries.push(moving);
    }
  }

  function addEntry(prefillYear) {
    if (!isAdmin()) {
      return;
    }
    var entry = {
      _uid: nextUid(),
      event_id: '',
      relay_hint: '',
      marker: 'oeuvre',
      date: prefillYear ? String(prefillYear) : '',
      markdown: ''
    };
    if (!prefillYear || state.draft.group_by !== 'year') {
      state.draft.entries.push(entry);
    } else {
      var year = String(prefillYear);
      var insertAt = state.draft.entries.length;
      for (var i = 0; i < state.draft.entries.length; i += 1) {
        var y = yearFromDate(state.draft.entries[i].date);
        if (y === year) {
          insertAt = i + 1;
        }
      }
      state.draft.entries.splice(insertAt, 0, entry);
    }
    state.activeEntryUid = entry._uid;
  }

  function reorderByDrag(dragUid, targetUid, placeAfter) {
    if (!isAdmin() || !dragUid || !targetUid || dragUid === targetUid) {
      return;
    }
    var entries = state.draft.entries;
    var from = findEntryIndex(dragUid);
    var to = findEntryIndex(targetUid);
    if (from < 0 || to < 0) {
      return;
    }
    var item = entries[from];
    entries.splice(from, 1);
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
    if (insertAt > entries.length) {
      insertAt = entries.length;
    }
    entries.splice(insertAt, 0, item);
  }

  function renderHead() {
    var s = getRenderState();
    if (els.title) {
      if (isAdmin()) {
        els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'List') + '</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="title">Edit...</button>';
      } else {
        els.title.textContent = s.title || 'List';
      }
    }

    if (!els.description) {
      return;
    }
    var descText = String(s.description || '');
    if (isAdmin()) {
      els.description.hidden = false;
      els.description.innerHTML = '<span class="list-page-description-text">' + escapeHtml(descText) + '</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="description">Edit...</button>';
    } else {
      els.description.textContent = descText;
      els.description.hidden = !descText;
    }
  }

  function renderEntryReadOnly(entry) {
    var line = String(entry && entry.markdown || '').trim();
    var postUrl = String(entry && entry.post_url || '');
    var linked = postUrl
      ? '<a class="list-entry-post-link" href="' + escapeHtml(postUrl) + '" title="Open linked post">↗</a>'
      : '';
    return '<li class="list-entry-line">' + linked + '<span class="list-entry-markdown">' + markdownInline(line) + '</span></li>';
  }

  function renderEntryInline(entry) {
    var uid = String(entry && entry._uid || '');
    var active = uid && uid === state.activeEntryUid;
    var markdownText = String(entry && entry.markdown || '').trim();
    var dateText = String(entry && entry.date || '');
    var eventId = String(entry && entry.event_id || '');
    var html = '';
    html += '<li class="list-entry-line list-entry-inline' + (active ? ' is-active' : '') + '" data-entry-uid="' + escapeHtml(uid) + '" draggable="true">';
    html += '<div class="list-inline-cell list-inline-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</div>';
    if (active) {
      html += '<div class="list-inline-cell list-inline-date"><input type="text" data-inline-field="date" data-entry-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(dateText) + '" placeholder="YYYY / YYYY-MM / YYYY-MM-DD"></div>';
      html += '<div class="list-inline-cell list-inline-markdown"><input type="text" data-inline-field="markdown" data-entry-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(markdownText) + '"></div>';
      html += '<div class="list-inline-cell list-inline-link">' + (eventId ? '<span class="list-entry-post-link" aria-hidden="true">↗</span>' : '') + '</div>';
      html += '<div class="list-inline-cell list-inline-actions"><button type="button" data-list-inline-action="remove" data-entry-uid="' + escapeHtml(uid) + '" aria-label="Remove entry">✕</button></div>';
      html += '<div class="list-inline-eventid">';
      html += '<details class="list-admin-eventid-details"' + (eventId ? ' open' : '') + '>';
      html += '<summary>Add event_id</summary>';
      html += '<label><span>event_id</span><input type="text" data-inline-field="event_id" data-entry-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(eventId) + '"></label>';
      html += '</details>';
      html += '</div>';
    } else {
      html += '<button type="button" class="list-inline-cell list-inline-open list-inline-date" data-list-inline-action="edit" data-inline-field="date" data-entry-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + escapeHtml(dateText) + '</span><span class="list-edit-brace">{edit}</span></button>';
      html += '<button type="button" class="list-inline-cell list-inline-open list-inline-markdown" data-list-inline-action="edit" data-inline-field="markdown" data-entry-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + escapeHtml(markdownText) + '</span><span class="list-edit-brace">{edit}</span></button>';
      html += '<div class="list-inline-cell list-inline-link">' + (eventId ? '<span class="list-entry-post-link" aria-hidden="true">↗</span>' : '') + '</div>';
      html += '<div class="list-inline-cell list-inline-actions"><button type="button" data-list-inline-action="remove" data-entry-uid="' + escapeHtml(uid) + '" aria-label="Remove entry">✕</button></div>';
    }
    html += '</li>';
    return html;
  }

  function renderList() {
    renderHead();

    if (!els.content) {
      return;
    }

    var s = getRenderState();
    var entries = Array.isArray(s.entries) ? s.entries : [];
    var inlineMode = isAdmin() && state.editMode;

    if (!entries.length) {
      if (inlineMode) {
        els.content.innerHTML = '<div class="list-inline-edit-shell"><div class="list-inline-edit-header"><span class="list-inline-edit-title">Edit List</span><div class="list-inline-edit-controls"><label><span>Group by</span><select id="list-admin-group-by"><option value=""' + (state.draft.group_by ? '' : ' selected') + '>None</option><option value="year"' + (state.draft.group_by === 'year' ? ' selected' : '') + '>Year</option><option value="first_letter"' + (state.draft.group_by === 'first_letter' ? ' selected' : '') + '>First letter</option><option value="month"' + (state.draft.group_by === 'month' ? ' selected' : '') + '>Month</option><option value="marker"' + (state.draft.group_by === 'marker' ? ' selected' : '') + '>Marker</option></select></label><button type="button" data-list-action="add">+</button></div></div><div class="list-inline-empty">No entries yet.</div></div>';
      } else if (isAdmin()) {
        els.content.innerHTML = '';
      } else {
        els.content.innerHTML = '<p class="placeholder">No entries yet.</p>';
      }
      return;
    }

    var html = '';
    if (inlineMode) {
      html += '<div class="list-inline-edit-shell">';
      html += '<div class="list-inline-edit-header">';
      html += '<span class="list-inline-edit-title">Edit List</span>';
      html += '<div class="list-inline-edit-controls">';
      html += '<label><span>Group by</span><select id="list-admin-group-by">';
      html += '<option value=""' + (state.draft.group_by ? '' : ' selected') + '>None</option>';
      html += '<option value="year"' + (state.draft.group_by === 'year' ? ' selected' : '') + '>Year</option>';
      html += '<option value="first_letter"' + (state.draft.group_by === 'first_letter' ? ' selected' : '') + '>First letter</option>';
      html += '<option value="month"' + (state.draft.group_by === 'month' ? ' selected' : '') + '>Month</option>';
      html += '<option value="marker"' + (state.draft.group_by === 'marker' ? ' selected' : '') + '>Marker</option>';
      html += '</select></label>';
      html += '<button type="button" data-list-action="add">+</button>';
      html += '</div>';
      html += '</div>';
      html += '<div class="list-inline-head">';
      html += '<span class="list-inline-head-handle"></span>';
      html += '<span class="list-inline-head-date">Date</span>';
      html += '<span class="list-inline-head-markdown">Markdown</span>';
      html += '<span class="list-inline-head-link">Link</span>';
      html += '<span class="list-inline-head-actions"></span>';
      html += '</div>';
    }

    var grouped = ['year', 'first_letter', 'month', 'marker'].indexOf(String(s.group_by || '')) >= 0;
    if (grouped) {
      var currentLabel = '__none__';
      var groupOpen = false;
      entries.forEach(function (entry) {
        var label = groupLabelForEntry(entry, s.group_by);
        if (label !== currentLabel) {
          if (groupOpen) {
            html += '</ul></section>';
          }
          currentLabel = label;
          groupOpen = true;
          html += '<section class="list-year-group">';
          html += '<div class="list-year-head">';
          html += '<h3 class="list-year-heading">' + escapeHtml(label || 'Unknown') + '</h3>';
          if (inlineMode && s.group_by === 'year') {
            html += '<button type="button" class="list-year-add" data-list-action="add-year" data-year="' + escapeHtml(label || '') + '">+</button>';
          }
          html += '</div>';
          html += '<ul class="list-entries' + (inlineMode ? ' list-entries-inline' : '') + '">';
        }
        html += inlineMode ? renderEntryInline(entry) : renderEntryReadOnly(entry);
      });
      if (groupOpen) {
        html += '</ul></section>';
      }
    } else {
      html += '<ul class="list-entries' + (inlineMode ? ' list-entries-inline' : '') + '">';
      entries.forEach(function (entry) {
        html += inlineMode ? renderEntryInline(entry) : renderEntryReadOnly(entry);
      });
      html += '</ul>';
    }

    if (inlineMode) {
      html += '</div>';
    }

    els.content.innerHTML = html;
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
    if (!isAdmin()) {
      if (state.saveTimer) {
        clearTimeout(state.saveTimer);
        state.saveTimer = null;
      }
      els.admin.hidden = true;
      els.admin.innerHTML = '';
      return;
    }

    var canRevert = !!state.payload.canonical_exists;
    var revertTitle = canRevert ? 'Revert draft to Nostr version' : 'No Nostr version found';

    var html = '';
    html += '<div class="list-page-admin-bar">';
    html += '<button type="button" data-list-action="revert" title="' + escapeHtml(revertTitle) + '"' + (canRevert ? '' : ' disabled aria-disabled="true"') + '>Revert</button>';
    html += '<button type="button" data-list-action="publish">Publish to Nostr...</button>';
    html += '<button type="button" data-list-action="toggle-edit">' + (state.editMode ? 'Done' : 'Edit') + '</button>';
    html += '</div>';
    html += '<div id="list-admin-save-status" class="list-admin-save-status" aria-live="polite">';
    if (state.saveStatus === 'saving') {
      html += '<span class="save-spinner" aria-hidden="true"></span>Saving...';
    } else if (state.saveStatus === 'error') {
      html += 'Save failed';
    } else {
      html += 'Saved';
    }
    html += '</div>';

    els.admin.hidden = false;
    els.admin.innerHTML = html;
  }

  function bindAdminEvents() {
    if (!els.admin || !els.content) {
      return;
    }

    els.admin.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      var actionNode = target.closest('[data-list-action]');
      if (!(actionNode instanceof HTMLElement) || !isAdmin()) {
        return;
      }
      var action = actionNode.getAttribute('data-list-action');
      if (action === 'toggle-edit') {
        state.editMode = !state.editMode;
        if (!state.editMode) {
          state.activeEntryUid = '';
        } else if (!state.activeEntryUid && state.draft.entries.length) {
          state.activeEntryUid = state.draft.entries[0]._uid;
        }
        renderAdmin();
        renderList();
        return;
      }
      if (action === 'publish') {
        publishDraft();
        return;
      }
      if (action === 'revert') {
        if (actionNode.disabled) {
          return;
        }
        revertDraft();
      }
    });

    root.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element) || !isAdmin()) {
        return;
      }

      var headEdit = target.closest('[data-list-head-edit]');
      if (headEdit instanceof HTMLElement) {
        var field = headEdit.getAttribute('data-list-head-edit');
        if (field === 'title') {
          var nextTitle = window.prompt('Edit title:', state.draft.title || '');
          if (nextTitle !== null) {
            state.draft.title = String(nextTitle || '').trim();
            renderList();
            queueAutosave(120);
          }
          return;
        }
        if (field === 'description') {
          var nextDesc = window.prompt('Edit description:', state.draft.description || '');
          if (nextDesc !== null) {
            state.draft.description = String(nextDesc || '').trim();
            renderList();
            queueAutosave(120);
          }
          return;
        }
      }

      var listAction = target.closest('[data-list-action]');
      if (listAction instanceof HTMLElement && state.editMode) {
        var action = listAction.getAttribute('data-list-action');
        if (action === 'add') {
          var before = captureEntryRects();
          addEntry('');
          renderListWithFlip(before);
          queueAutosave(120);
          return;
        }
        if (action === 'add-year') {
          var year = String(listAction.getAttribute('data-year') || '').trim();
          if (!year || year === 'Unknown') {
            year = '';
          }
          var beforeYear = captureEntryRects();
          addEntry(year);
          renderListWithFlip(beforeYear);
          queueAutosave(120);
          return;
        }
      }

      if (!state.editMode) {
        return;
      }

      var inlineAction = target.closest('[data-list-inline-action]');
      if (inlineAction instanceof HTMLElement) {
        var actionType = inlineAction.getAttribute('data-list-inline-action');
        var uid = String(inlineAction.getAttribute('data-entry-uid') || '');
        if (!uid) {
          return;
        }
        if (actionType === 'edit') {
          state.activeEntryUid = uid;
          renderList();
          return;
        }
        if (actionType === 'remove') {
          var idx = findEntryIndex(uid);
          if (idx < 0) {
            return;
          }
          var beforeRemove = captureEntryRects();
          state.draft.entries.splice(idx, 1);
          if (state.activeEntryUid === uid) {
            state.activeEntryUid = '';
          }
          renderListWithFlip(beforeRemove);
          queueAutosave(120);
        }
      }
    });

    els.content.addEventListener('input', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      var uid = String(target.getAttribute('data-entry-uid') || '');
      var field = String(target.getAttribute('data-inline-field') || '');
      if (!uid || !field) {
        return;
      }
      var idx = findEntryIndex(uid);
      if (idx < 0) {
        return;
      }
      state.activeEntryUid = uid;
      state.draft.entries[idx][field] = String(target.value || '');
      queueAutosave(500);
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
        var beforeGroup = captureEntryRects();
        state.draft.group_by = String(target.value || '').trim();
        renderListWithFlip(beforeGroup);
        queueAutosave(280);
        return;
      }

      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      var uid = String(target.getAttribute('data-entry-uid') || '');
      var field = String(target.getAttribute('data-inline-field') || '');
      if (!uid || !field) {
        return;
      }
      var idx = findEntryIndex(uid);
      if (idx < 0) {
        return;
      }
      state.draft.entries[idx][field] = String(target.value || '');
      if (field === 'date') {
        var beforeDate = captureEntryRects();
        moveEntryByYear(uid);
        renderListWithFlip(beforeDate);
      }
      queueAutosave(320);
    });

    els.content.addEventListener('dragstart', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      var target = event.target;
      var row = target && target.closest ? target.closest('.list-entry-inline[data-entry-uid]') : null;
      if (!(row instanceof HTMLElement)) {
        return;
      }
      state.dragUid = String(row.getAttribute('data-entry-uid') || '');
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', state.dragUid);
      } catch (_err) {
        // Ignore.
      }
      row.classList.add('is-dragging');
    });

    els.content.addEventListener('dragend', function (event) {
      var row = event.target && event.target.closest ? event.target.closest('.list-entry-inline[data-entry-uid]') : null;
      if (row) {
        row.classList.remove('is-dragging');
      }
      state.dragUid = '';
    });

    els.content.addEventListener('dragover', function (event) {
      if (!state.editMode || !isAdmin() || !state.dragUid) {
        return;
      }
      var target = event.target;
      var row = target && target.closest ? target.closest('.list-entry-inline[data-entry-uid]') : null;
      if (!(row instanceof HTMLElement)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });

    els.content.addEventListener('drop', function (event) {
      if (!state.editMode || !isAdmin() || !state.dragUid) {
        return;
      }
      var target = event.target;
      var row = target && target.closest ? target.closest('.list-entry-inline[data-entry-uid]') : null;
      if (!(row instanceof HTMLElement)) {
        return;
      }
      event.preventDefault();
      var targetUid = String(row.getAttribute('data-entry-uid') || '');
      if (!targetUid || targetUid === state.dragUid) {
        return;
      }
      var rect = row.getBoundingClientRect();
      var placeAfter = event.clientY > (rect.top + rect.height / 2);
      var beforeDrop = captureEntryRects();
      reorderByDrag(state.dragUid, targetUid, placeAfter);
      renderListWithFlip(beforeDrop);
      queueAutosave(120);
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
      if (!state.activeEntryUid && state.draft.entries.length) {
        state.activeEntryUid = state.draft.entries[0]._uid;
      }
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
