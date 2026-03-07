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
    var uid = 'entry-' + String(state.uidCounter++);
    return uid;
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

  function yearFromDate(raw) {
    var dateRaw = String(raw || '');
    if (dateRaw.length < 4) {
      return '';
    }
    return dateRaw.slice(0, 4);
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
          return Object.assign({}, entry, { year: yearFromDate(entry.date) });
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

  function entryYear(entry) {
    return yearFromDate(entry && entry.date || entry && entry.year || '');
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
    var active = !!(state.activeEntryUid && uid === state.activeEntryUid);
    var postUrl = String(entry && entry.post_url || '');
    var line = String(entry && entry.markdown || '').trim();
    var eventId = String(entry && entry.event_id || '');
    var html = '';
    html += '<li class="list-entry-line list-entry-inline' + (active ? ' is-active' : '') + '" data-entry-uid="' + escapeHtml(uid) + '" draggable="true">';
    html += '<div class="list-inline-cell list-inline-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</div>';
    if (active) {
      html += '<div class="list-inline-cell list-inline-date"><input type="text" data-inline-field="date" data-entry-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(entry.date || '') + '" placeholder="YYYY / YYYY-MM / YYYY-MM-DD"></div>';
      html += '<div class="list-inline-cell list-inline-markdown"><input type="text" data-inline-field="markdown" data-entry-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(entry.markdown || '') + '"></div>';
      html += '<div class="list-inline-cell list-inline-link">' + (postUrl ? '<a class="list-entry-post-link" href="' + escapeHtml(postUrl) + '" title="Open linked post">↗</a>' : '') + '</div>';
      html += '<div class="list-inline-cell list-inline-actions"><button type="button" data-list-inline-action="remove" data-entry-uid="' + escapeHtml(uid) + '" aria-label="Remove entry">✕</button></div>';
      html += '<div class="list-inline-eventid">';
      html += '<details class="list-admin-eventid-details"' + (eventId ? ' open' : '') + '>';
      html += '<summary>Add event_id</summary>';
      html += '<label><span>event_id</span><input type="text" data-inline-field="event_id" data-entry-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(eventId) + '"></label>';
      html += '</details>';
      html += '</div>';
    } else {
      html += '<button type="button" class="list-inline-cell list-inline-date list-inline-open" data-list-inline-action="edit" data-inline-field="date" data-entry-uid="' + escapeHtml(uid) + '">' + escapeHtml(entry.date || '') + '</button>';
      html += '<button type="button" class="list-inline-cell list-inline-markdown list-inline-open" data-list-inline-action="edit" data-inline-field="markdown" data-entry-uid="' + escapeHtml(uid) + '">' + markdownInline(line || '') + '</button>';
      html += '<div class="list-inline-cell list-inline-link">' + (postUrl ? '<a class="list-entry-post-link" href="' + escapeHtml(postUrl) + '" title="Open linked post">↗</a>' : '') + '</div>';
      html += '<div class="list-inline-cell list-inline-actions"><button type="button" data-list-inline-action="remove" data-entry-uid="' + escapeHtml(uid) + '" aria-label="Remove entry">✕</button></div>';
    }
    html += '</li>';
    return html;
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
    var isAdmin = !!(state.payload && state.payload.is_admin);
    var isInlineEdit = isAdmin && state.editMode;

    if (!entries.length) {
      if (isInlineEdit) {
        els.content.innerHTML = '<div class="list-inline-empty">No entries yet.</div>';
      } else if (isAdmin) {
        els.content.innerHTML = '';
      } else {
        els.content.innerHTML = '<p class="placeholder">No entries yet.</p>';
      }
      return;
    }

    var html = '';
    if (isInlineEdit) {
      html += '<div class="list-inline-head">';
      html += '<span class="list-inline-head-handle"></span>';
      html += '<span class="list-inline-head-date">Date</span>';
      html += '<span class="list-inline-head-markdown">Markdown</span>';
      html += '<span class="list-inline-head-link">Link</span>';
      html += '<span class="list-inline-head-actions"></span>';
      html += '</div>';
    }

    if (s.group_by === 'year') {
      var currentYear = '';
      var groupOpen = false;
      entries.forEach(function (entry) {
        var year = String(entry && entry.year || '') || entryYear(entry);
        if (year !== currentYear) {
          if (groupOpen) {
            html += '</ul></section>';
          }
          currentYear = year;
          groupOpen = true;
          html += '<section class="list-year-group">';
          html += '<h3 class="list-year-heading">' + escapeHtml(year || 'Unknown') + '</h3>';
          html += '<ul class="list-entries' + (isInlineEdit ? ' list-entries-inline' : '') + '">';
        }
        html += isInlineEdit ? renderEntryInline(entry) : renderEntryReadOnly(entry);
      });
      if (groupOpen) {
        html += '</ul></section>';
      }
    } else {
      html += '<ul class="list-entries' + (isInlineEdit ? ' list-entries-inline' : '') + '">';
      entries.forEach(function (entry) {
        html += isInlineEdit ? renderEntryInline(entry) : renderEntryReadOnly(entry);
      });
      html += '</ul>';
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

    var html = '';
    html += '<details class="list-admin-panel" open>';
    html += '<summary class="list-admin-summary">Edit List</summary>';
    html += '<div class="list-admin-topbar">';
    html += '<div class="list-admin-actions">';
    html += '<button type="button" data-list-action="toggle-edit">' + (state.editMode ? 'Done' : 'Edit') + '</button>';
    html += '<button type="button" data-list-action="add">+ Entry</button>';
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

  function syncMetaFromInputs() {
    if (!(state.payload && state.payload.is_admin && state.draft && els.admin)) {
      return;
    }
    var titleInput = document.getElementById('list-admin-title');
    var descriptionInput = document.getElementById('list-admin-description');
    var groupByInput = document.getElementById('list-admin-group-by');
    state.draft.title = titleInput ? String(titleInput.value || '').trim() : state.draft.title;
    state.draft.description = descriptionInput ? String(descriptionInput.value || '').trim() : state.draft.description;
    state.draft.group_by = groupByInput ? String(groupByInput.value || '').trim() : state.draft.group_by;
  }

  function captureEntryRects() {
    var map = {};
    if (!els.content) {
      return map;
    }
    var nodes = els.content.querySelectorAll('.list-entry-inline[data-entry-uid]');
    nodes.forEach(function (node) {
      var uid = node.getAttribute('data-entry-uid') || '';
      if (!uid) {
        return;
      }
      map[uid] = node.getBoundingClientRect();
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

  function findEntryIndex(uid) {
    var entries = Array.isArray(state.draft && state.draft.entries) ? state.draft.entries : [];
    for (var i = 0; i < entries.length; i += 1) {
      if (String(entries[i]._uid || '') === String(uid || '')) {
        return i;
      }
    }
    return -1;
  }

  function compareYearsDesc(a, b) {
    var ay = String(a || '');
    var by = String(b || '');
    if (!ay && !by) {
      return 0;
    }
    if (!ay) {
      return 1;
    }
    if (!by) {
      return -1;
    }
    if (ay === by) {
      return 0;
    }
    return ay > by ? -1 : 1;
  }

  function moveEntryByYear(uid) {
    if (!(state.draft && state.draft.group_by === 'year')) {
      return;
    }
    var entries = state.draft.entries || [];
    var idx = findEntryIndex(uid);
    if (idx < 0) {
      return;
    }
    var entry = entries[idx];
    var targetYear = entryYear(entry);
    var remaining = entries.slice(0, idx).concat(entries.slice(idx + 1));
    var insertAt = remaining.length;
    var lastEqual = -1;
    for (var i = 0; i < remaining.length; i += 1) {
      var cmp = compareYearsDesc(targetYear, entryYear(remaining[i]));
      if (cmp < 0) {
        continue;
      }
      if (cmp === 0) {
        lastEqual = i;
        continue;
      }
      insertAt = i;
      break;
    }
    if (lastEqual >= 0) {
      insertAt = lastEqual + 1;
    }
    remaining.splice(insertAt, 0, entry);
    state.draft.entries = remaining;
  }

  function reorderByDrag(dragUid, targetUid, placeAfter) {
    if (!state.draft || !dragUid || !targetUid || dragUid === targetUid) {
      return;
    }
    var entries = state.draft.entries || [];
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

  async function refreshValidation() {
    if (!(state.payload && state.payload.is_admin)) {
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
      if (!state.payload) {
        state.payload = latest;
      } else {
        state.payload.validation = latest.validation;
        state.payload.canonical_exists = latest.canonical_exists;
        state.payload.canonical_event = latest.canonical_event;
        state.payload.draft_exists = latest.draft_exists;
        state.payload.draft_differs = latest.draft_differs;
      }
      renderValidation();
    } catch (_err) {
      // Keep local editing responsive if validation refresh fails.
    }
  }

  async function persistDraft(options) {
    if (state.busy || !(state.payload && state.payload.is_admin && state.draft)) {
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
      if (state.payload) {
        state.payload.draft_exists = true;
        state.payload.draft_differs = false;
      }
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
    if (state.busy) {
      return;
    }
    syncMetaFromInputs();
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
    if (!els.admin || !els.content) {
      return;
    }

    els.admin.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      var actionNode = target.closest('[data-list-action]');
      if (!(actionNode instanceof HTMLElement)) {
        return;
      }
      var action = actionNode.getAttribute('data-list-action');
      if (action === 'toggle-edit') {
        state.editMode = !state.editMode;
        if (!state.editMode) {
          state.activeEntryUid = '';
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
        return;
      }
      if (action === 'add') {
        if (!state.draft) {
          return;
        }
        var before = captureEntryRects();
        state.draft.entries.push({ _uid: nextUid(), event_id: '', relay_hint: '', marker: 'oeuvre', date: '', markdown: '' });
        state.activeEntryUid = state.draft.entries[state.draft.entries.length - 1]._uid;
        renderListWithFlip(before);
        queueAutosave(120);
      }
    });

    els.admin.addEventListener('input', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.id === 'list-admin-title' || target.id === 'list-admin-description' || target.id === 'list-admin-group-by') {
        syncMetaFromInputs();
        renderList();
        queueAutosave(500);
      }
    });

    els.admin.addEventListener('change', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.id === 'list-admin-group-by') {
        syncMetaFromInputs();
        var before = captureEntryRects();
        renderListWithFlip(before);
        queueAutosave(300);
      }
    });

    els.content.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element) || !state.editMode || !state.draft) {
        return;
      }
      var actionNode = target.closest('[data-list-inline-action]');
      if (actionNode instanceof HTMLElement) {
        var action = actionNode.getAttribute('data-list-inline-action');
        var uid = String(actionNode.getAttribute('data-entry-uid') || '');
        if (!uid) {
          return;
        }
        if (action === 'edit') {
          state.activeEntryUid = uid;
          renderList();
          return;
        }
        if (action === 'remove') {
          var idx = findEntryIndex(uid);
          if (idx < 0) {
            return;
          }
          var before = captureEntryRects();
          state.draft.entries.splice(idx, 1);
          if (state.activeEntryUid === uid) {
            state.activeEntryUid = '';
          }
          renderListWithFlip(before);
          queueAutosave(120);
          return;
        }
      }
    });

    els.content.addEventListener('input', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement) || !state.editMode || !state.draft) {
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
      var target = event.target;
      if (!(target instanceof HTMLInputElement) || !state.editMode || !state.draft) {
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
        var before = captureEntryRects();
        moveEntryByYear(uid);
        state.activeEntryUid = uid;
        renderListWithFlip(before);
      }
      queueAutosave(320);
    });

    els.content.addEventListener('dragstart', function (event) {
      var target = event.target;
      var row = target && target.closest ? target.closest('.list-entry-inline[data-entry-uid]') : null;
      if (!(row instanceof HTMLElement) || !state.editMode) {
        return;
      }
      state.dragUid = String(row.getAttribute('data-entry-uid') || '');
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', state.dragUid);
      } catch (_err) {
        // ignore
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
      if (!state.editMode || !state.dragUid) {
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
      if (!state.editMode || !state.dragUid || !state.draft) {
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
      var before = captureEntryRects();
      reorderByDrag(state.dragUid, targetUid, placeAfter);
      renderListWithFlip(before);
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
