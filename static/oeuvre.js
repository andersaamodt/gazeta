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
    saveIndicatorVisible: false,
    editMode: false,
    activeEntryUid: '',
    activeHeadField: '',
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
    return 'el-' + String(state.uidCounter++);
  }

  function isEntryType(type) {
    return type === 'entry' || type === 'sub';
  }

  function normalizeElement(raw) {
    var type = String(raw && raw.type || 'entry');
    if (type !== 'group' && type !== 'sub') {
      type = 'entry';
    }
    if (type === 'group') {
      return {
        _uid: String(raw && raw._uid || nextUid()),
        type: 'group',
        title: String(raw && raw.title || '')
      };
    }
    return {
      _uid: String(raw && raw._uid || nextUid()),
      type: type,
      event_id: String(raw && raw.event_id || ''),
      relay_hint: String(raw && raw.relay_hint || ''),
      marker: String(raw && raw.marker || ''),
      date: String(raw && raw.date || ''),
      markdown: String(raw && raw.markdown || ''),
      year: String(raw && raw.year || ''),
      post_url: String(raw && raw.post_url || '')
    };
  }

  function cloneEditableElements(elements) {
    return (Array.isArray(elements) ? elements : []).map(normalizeElement);
  }

  function elementsFromLegacyEntries(entries) {
    return (Array.isArray(entries) ? entries : []).map(function (entry) {
      return normalizeElement({
        type: 'entry',
        event_id: entry && entry.event_id,
        relay_hint: entry && entry.relay_hint,
        marker: entry && entry.marker,
        date: entry && entry.date,
        markdown: entry && entry.markdown,
        year: entry && entry.year,
        post_url: entry && entry.post_url
      });
    });
  }

  function toEntries(elements) {
    return (Array.isArray(elements) ? elements : []).filter(function (el) {
      return isEntryType(String(el && el.type || 'entry'));
    }).map(function (el) {
      return {
        event_id: String(el && el.event_id || ''),
        relay_hint: String(el && el.relay_hint || ''),
        marker: String(el && el.marker || ''),
        date: String(el && el.date || ''),
        markdown: String(el && el.markdown || '')
      };
    });
  }

  function readEditableStateFromPayload() {
    var s = (state.payload && state.payload.state) ? state.payload.state : {};
    var elements = Array.isArray(s.elements) ? cloneEditableElements(s.elements) : elementsFromLegacyEntries(s.entries);
    return {
      title: String(s.title || root.getAttribute('data-list-title') || 'List'),
      description: String(s.description || ''),
      group_by: String(s.group_by || ''),
      content: String(s.content || ''),
      elements: elements
    };
  }

  function hasStructuralElements(elements) {
    return (Array.isArray(elements) ? elements : []).some(function (el) {
      var type = String(el && el.type || 'entry');
      return type === 'group' || type === 'sub';
    });
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
        elements: cloneEditableElements(state.draft.elements)
      };
    }
    var src = (state.payload && state.payload.state) ? state.payload.state : {};
    return {
      title: String(src.title || ''),
      description: String(src.description || ''),
      group_by: String(src.group_by || ''),
      elements: Array.isArray(src.elements) ? cloneEditableElements(src.elements) : elementsFromLegacyEntries(src.entries)
    };
  }

  function findElementIndex(uid) {
    var elements = Array.isArray(state.draft && state.draft.elements) ? state.draft.elements : [];
    for (var i = 0; i < elements.length; i += 1) {
      if (String(elements[i]._uid || '') === String(uid || '')) {
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
    var nodes = els.content.querySelectorAll('.list-entry-inline[data-element-uid]');
    nodes.forEach(function (node) {
      var uid = node.getAttribute('data-element-uid') || '';
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
    var nodes = els.content.querySelectorAll('.list-entry-inline[data-element-uid]');
    nodes.forEach(function (node) {
      var uid = node.getAttribute('data-element-uid') || '';
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
    state.saveIndicatorVisible = true;
    renderAdmin();
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
      var elements = cloneEditableElements(state.draft.elements || []);
      await apiPost('/cgi/blog-save-list-draft', {
        list_slug: slug,
        title: state.draft.title || '',
        description: state.draft.description || '',
        group_by: state.draft.group_by || '',
        content: state.draft.content || '',
        elements_json: JSON.stringify(elements),
        entries_json: JSON.stringify(toEntries(elements)),
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
    if (hasStructuralElements(state.draft.elements)) {
      return;
    }
    var elements = state.draft.elements;
    var idx = findElementIndex(uid);
    if (idx < 0) {
      return;
    }
    var moving = elements[idx];
    if (!isEntryType(String(moving.type || 'entry'))) {
      return;
    }
    var year = yearFromDate(moving.date) || '';
    elements.splice(idx, 1);
    var inserted = false;
    for (var i = 0; i < elements.length; i += 1) {
      var y = yearFromDate(elements[i].date) || '';
      if (year && y && year > y) {
        elements.splice(i, 0, moving);
        inserted = true;
        break;
      }
      if (year === y) {
        var j = i + 1;
        while (j < elements.length && yearFromDate(elements[j].date) === year) {
          j += 1;
        }
        elements.splice(j, 0, moving);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      elements.push(moving);
    }
  }

  function addEntry(prefillYear, type) {
    if (!isAdmin()) {
      return;
    }
    var kind = String(type || 'entry');
    if (!isEntryType(kind)) {
      kind = 'entry';
    }
    var entry = {
      _uid: nextUid(),
      type: kind,
      event_id: '',
      relay_hint: '',
      marker: 'oeuvre',
      date: prefillYear ? String(prefillYear) : '',
      markdown: ''
    };
    state.draft.elements.push(entry);
    state.activeEntryUid = entry._uid;
  }

  function addGroup() {
    if (!isAdmin()) {
      return;
    }
    var group = {
      _uid: nextUid(),
      type: 'group',
      title: 'New group'
    };
    state.draft.elements.push(group);
    state.activeEntryUid = group._uid;
  }

  function reorderByDrag(dragUid, targetUid, placeAfter) {
    if (!isAdmin() || !dragUid || !targetUid || dragUid === targetUid) {
      return;
    }
    var elements = state.draft.elements;
    var from = findElementIndex(dragUid);
    var to = findElementIndex(targetUid);
    if (from < 0 || to < 0) {
      return;
    }
    var item = elements[from];
    elements.splice(from, 1);
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
    if (insertAt > elements.length) {
      insertAt = elements.length;
    }
    elements.splice(insertAt, 0, item);
  }

  function renderHead() {
    var s = getRenderState();
    if (els.title) {
      if (isAdmin()) {
        if (state.activeHeadField === 'title') {
          els.title.innerHTML = '<span class="list-page-title-edit-wrap"><input id="list-head-title-input" class="list-head-inline-input" type="text" value="' + escapeHtml(s.title || 'List') + '" data-head-input="title"></span><span id="list-page-title-actions" class="list-page-title-actions"></span>';
        } else {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'List') + '</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="title">Edit...</button><span id="list-page-title-actions" class="list-page-title-actions"></span>';
        }
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
      if (state.activeHeadField === 'description') {
        els.description.innerHTML = '<span class="list-page-description-edit-wrap"><input id="list-head-description-input" class="list-head-inline-input list-head-description-input" type="text" value="' + escapeHtml(descText) + '" data-head-input="description"></span> <button type="button" class="list-inline-edit-link" data-list-head-done="description">Done</button>';
      } else {
        els.description.innerHTML = '<span class="list-page-description-text">' + escapeHtml(descText) + '</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="description">Edit...</button>';
      }
    } else {
      els.description.textContent = descText;
      els.description.hidden = !descText;
    }

    if (isAdmin() && state.activeHeadField) {
      requestAnimationFrame(function () {
        var id = state.activeHeadField === 'title' ? 'list-head-title-input' : 'list-head-description-input';
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

  function renderEntryReadOnly(entry) {
    var line = String(entry && entry.markdown || '').trim();
    var postUrl = String(entry && entry.post_url || '');
    var linked = postUrl
      ? '<a class="list-entry-post-link" href="' + escapeHtml(postUrl) + '" title="Open linked post">↗</a>'
      : '';
    return '<li class="list-entry-line">' + linked + '<span class="list-entry-markdown">' + markdownInline(line) + '</span></li>';
  }

  function renderStructuredReadOnly(elements) {
    var html = '<ul class="list-entries">';
    var groupOpen = false;

    (Array.isArray(elements) ? elements : []).forEach(function (el) {
      var type = String(el && el.type || 'entry');
      if (type === 'group') {
        if (groupOpen) {
          html += '</ul></li>';
        }
        html += '<li class="list-entry-line list-group-line"><span class="list-group-title">' + escapeHtml(String(el && el.title || '')) + '</span><ul class="list-sub-entries">';
        groupOpen = true;
        return;
      }

      if (type === 'sub') {
        if (groupOpen) {
          html += renderEntryReadOnly(el);
        } else {
          html += '<li class="list-entry-line list-sub-orphan">' + renderEntryReadOnly(el).replace(/^<li[^>]*>|<\/li>$/g, '') + '</li>';
        }
        return;
      }

      if (groupOpen) {
        html += '</ul></li>';
        groupOpen = false;
      }
      html += renderEntryReadOnly(el);
    });

    if (groupOpen) {
      html += '</ul></li>';
    }
    html += '</ul>';
    return html;
  }

  function renderGroupByReadOnly(entries, groupBy) {
    var html = '';
    var grouped = ['year', 'first_letter', 'month', 'marker'].indexOf(String(groupBy || '')) >= 0;
    if (grouped) {
      var currentLabel = '__none__';
      var groupOpen = false;
      entries.forEach(function (entry) {
        var label = groupLabelForEntry(entry, groupBy);
        if (label !== currentLabel) {
          if (groupOpen) {
            html += '</ul></section>';
          }
          currentLabel = label;
          groupOpen = true;
          html += '<section class="list-year-group">';
          html += '<div class="list-year-head">';
          html += '<h3 class="list-year-heading">' + escapeHtml(label || 'Unknown') + '</h3>';
          html += '</div>';
          html += '<ul class="list-entries">';
        }
        html += renderEntryReadOnly(entry);
      });
      if (groupOpen) {
        html += '</ul></section>';
      }
      return html;
    }

    html += '<ul class="list-entries">';
    entries.forEach(function (entry) {
      html += renderEntryReadOnly(entry);
    });
    html += '</ul>';
    return html;
  }

  function renderElementInline(el) {
    var uid = String(el && el._uid || '');
    var active = uid && uid === state.activeEntryUid;
    var type = String(el && el.type || 'entry');
    var html = '';

    html += '<li class="list-entry-line list-entry-inline' + (active ? ' is-active' : '') + '" data-element-uid="' + escapeHtml(uid) + '" draggable="true">';
    html += '<div class="list-inline-cell list-inline-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</div>';

    if (type === 'group') {
      if (active) {
        html += '<div class="list-inline-cell list-inline-date"><span class="list-inline-type-pill">group</span></div>';
        html += '<div class="list-inline-cell list-inline-markdown"><input type="text" data-inline-field="title" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(String(el && el.title || '')) + '" placeholder="Group title"></div>';
        html += '<div class="list-inline-cell list-inline-link"></div>';
        html += '<div class="list-inline-cell list-inline-actions"><button type="button" data-list-inline-action="remove" data-element-uid="' + escapeHtml(uid) + '" aria-label="Remove group">✕</button></div>';
      } else {
        html += '<button type="button" class="list-inline-cell list-inline-open list-inline-date" data-list-inline-action="edit" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-type-pill">group</span></button>';
        html += '<button type="button" class="list-inline-cell list-inline-open list-inline-markdown" data-list-inline-action="edit" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + escapeHtml(String(el && el.title || '')) + '</span><span class="list-edit-brace">{edit}</span></button>';
        html += '<div class="list-inline-cell list-inline-link"></div>';
        html += '<div class="list-inline-cell list-inline-actions"><button type="button" data-list-inline-action="remove" data-element-uid="' + escapeHtml(uid) + '" aria-label="Remove group">✕</button></div>';
      }

      html += '</li>';
      return html;
    }

    var markdownText = String(el && el.markdown || '').trim();
    var dateText = String(el && el.date || '');
    var eventId = String(el && el.event_id || '');

    if (active) {
      html += '<div class="list-inline-cell list-inline-date"><input type="text" data-inline-field="date" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(dateText) + '" placeholder="YYYY / YYYY-MM / YYYY-MM-DD"></div>';
      html += '<div class="list-inline-cell list-inline-markdown"><input type="text" data-inline-field="markdown" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(markdownText) + '"></div>';
      html += '<div class="list-inline-cell list-inline-link">' + (eventId ? '<span class="list-entry-post-link" aria-hidden="true">↗</span>' : '') + '</div>';
      html += '<div class="list-inline-cell list-inline-actions"><button type="button" data-list-inline-action="remove" data-element-uid="' + escapeHtml(uid) + '" aria-label="Remove entry">✕</button></div>';
      html += '<div class="list-inline-eventid">';
      html += '<details class="list-admin-eventid-details"' + (eventId ? ' open' : '') + '>';
      html += '<summary>Add Nostr event_id</summary>';
      html += '<label><span>EVENT_ID</span><input type="text" data-inline-field="event_id" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(eventId) + '"></label>';
      html += '<label><span>Type</span><select data-inline-field="type" data-element-uid="' + escapeHtml(uid) + '"><option value="entry"' + (type === 'entry' ? ' selected' : '') + '>entry</option><option value="sub"' + (type === 'sub' ? ' selected' : '') + '>sub</option></select></label>';
      html += '</details>';
      html += '</div>';
    } else {
      html += '<button type="button" class="list-inline-cell list-inline-open list-inline-date" data-list-inline-action="edit" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + escapeHtml(dateText) + '</span><span class="list-edit-brace">{edit}</span></button>';
      html += '<button type="button" class="list-inline-cell list-inline-open list-inline-markdown" data-list-inline-action="edit" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-type-pill">' + escapeHtml(type) + '</span><span class="list-inline-value">' + escapeHtml(markdownText) + '</span><span class="list-edit-brace">{edit}</span></button>';
      html += '<div class="list-inline-cell list-inline-link">' + (eventId ? '<span class="list-entry-post-link" aria-hidden="true">↗</span>' : '') + '</div>';
      html += '<div class="list-inline-cell list-inline-actions"><button type="button" data-list-inline-action="remove" data-element-uid="' + escapeHtml(uid) + '" aria-label="Remove entry">✕</button></div>';
    }

    html += '</li>';
    return html;
  }

  function renderInlineEditor(elements) {
    var html = '';
    var groupedModes = ['year', 'first_letter', 'month', 'marker'];
    var isGrouped = groupedModes.indexOf(String(state.draft.group_by || '')) >= 0;
    var hasStructural = hasStructuralElements(elements);
    html += '<div class="list-inline-toolbar">';
    html += '<div class="list-inline-edit-controls">';
    html += '<label><span>Group by</span><select id="list-admin-group-by">';
    html += '<option value=""' + (state.draft.group_by ? '' : ' selected') + '>None</option>';
    html += '<option value="year"' + (state.draft.group_by === 'year' ? ' selected' : '') + '>Year</option>';
    html += '<option value="first_letter"' + (state.draft.group_by === 'first_letter' ? ' selected' : '') + '>First letter</option>';
    html += '<option value="month"' + (state.draft.group_by === 'month' ? ' selected' : '') + '>Month</option>';
    html += '<option value="marker"' + (state.draft.group_by === 'marker' ? ' selected' : '') + '>Marker</option>';
    html += '</select></label>';
    html += '<button type="button" data-list-action="add-group" title="Add group">+G</button>';
    html += '<button type="button" data-list-action="add" title="Add entry">+</button>';
    html += '</div>';
    html += '</div>';

    if (!elements.length) {
      html += '<div class="list-inline-empty">No entries yet.</div>';
      return html;
    }

    html += '<div class="list-inline-head">';
    html += '<span class="list-inline-head-handle"></span>';
    html += '<span class="list-inline-head-date">Date / Type</span>';
    html += '<span class="list-inline-head-markdown">Text</span>';
    html += '<span class="list-inline-head-link">Link</span>';
    html += '<span class="list-inline-head-actions"></span>';
    html += '</div>';

    if (isGrouped && !hasStructural) {
      var currentLabel = '__none__';
      var groupOpen = false;
      elements.forEach(function (el) {
        var label = groupLabelForEntry(el, state.draft.group_by);
        if (label !== currentLabel) {
          if (groupOpen) {
            html += '</ul></section>';
          }
          currentLabel = label;
          groupOpen = true;
          html += '<section class="list-year-group">';
          html += '<div class="list-year-head">';
          html += '<h3 class="list-year-heading">' + escapeHtml(label || 'Unknown') + '</h3>';
          html += '</div>';
          html += '<ul class="list-entries list-entries-inline">';
        }
        html += renderElementInline(el);
      });
      if (groupOpen) {
        html += '</ul></section>';
      }
    } else {
      html += '<ul class="list-entries list-entries-inline">';
      elements.forEach(function (el) {
        html += renderElementInline(el);
      });
      html += '</ul>';
    }
    return html;
  }

  function renderList() {
    renderHead();

    if (!els.content) {
      return;
    }

    var s = getRenderState();
    var elements = Array.isArray(s.elements) ? s.elements : [];
    var inlineMode = isAdmin() && state.editMode;

    if (!elements.length) {
      if (inlineMode) {
        els.content.innerHTML = renderInlineEditor([]);
      } else if (isAdmin()) {
        els.content.innerHTML = '';
      } else {
        els.content.innerHTML = '<p class="placeholder">No entries yet.</p>';
      }
      return;
    }

    if (inlineMode) {
      els.content.innerHTML = renderInlineEditor(elements);
      return;
    }

    if (hasStructuralElements(elements)) {
      els.content.innerHTML = renderStructuredReadOnly(elements);
      return;
    }

    els.content.innerHTML = renderGroupByReadOnly(elements.filter(function (el) {
      return isEntryType(String(el && el.type || 'entry'));
    }), s.group_by);
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

    var actionsHost = document.getElementById('list-page-title-actions');
    var html = '';
    html += '<span class="list-page-admin-bar">';
    if (state.saveIndicatorVisible) {
      html += '<span id="list-admin-save-status" class="list-admin-save-status" aria-live="polite">';
      if (state.saveStatus === 'saving') {
        html += '<span class="save-spinner" aria-hidden="true"></span>Saving...';
      } else if (state.saveStatus === 'error') {
        html += 'Save failed';
      } else {
        html += 'Saved';
      }
      html += '</span>';
    }
    html += '<button type="button" data-list-action="revert" title="' + escapeHtml(revertTitle) + '"' + (canRevert ? '' : ' disabled aria-disabled="true"') + '>Revert</button>';
    html += '<button type="button" data-list-action="publish">Publish to Nostr...</button>';
    html += '<button type="button" data-list-action="toggle-edit">' + (state.editMode ? 'Done' : 'Edit') + '</button>';
    html += '</span>';
    if (actionsHost) {
      actionsHost.innerHTML = html;
    }
    els.admin.hidden = true;
    els.admin.innerHTML = '';
  }

  function bindAdminEvents() {
    if (!els.admin || !els.content) {
      return;
    }

    root.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element) || !isAdmin()) {
        return;
      }

      var topAction = target.closest('[data-list-action]');
      if (topAction instanceof HTMLElement) {
        var topActionName = topAction.getAttribute('data-list-action');
        if (topActionName === 'toggle-edit') {
          state.editMode = !state.editMode;
          if (!state.editMode) {
            state.activeEntryUid = '';
          }
          renderList();
          renderAdmin();
          return;
        }
        if (topActionName === 'publish') {
          publishDraft();
          return;
        }
        if (topActionName === 'revert') {
          if (topAction.disabled) {
            return;
          }
          revertDraft();
          return;
        }
      }

      var headEdit = target.closest('[data-list-head-edit]');
      if (headEdit instanceof HTMLElement) {
        var field = headEdit.getAttribute('data-list-head-edit');
        if (field === 'title' || field === 'description') {
          state.activeHeadField = field;
          renderList();
          renderAdmin();
          return;
        }
      }

      var headDone = target.closest('[data-list-head-done]');
      if (headDone instanceof HTMLElement) {
        state.activeHeadField = '';
        renderList();
        renderAdmin();
        return;
      }

      var listAction = target.closest('[data-list-action]');
      if (listAction instanceof HTMLElement && state.editMode) {
        var action = listAction.getAttribute('data-list-action');
        if (action === 'add') {
          var before = captureEntryRects();
          addEntry('', 'entry');
          renderListWithFlip(before);
          queueAutosave(120);
          return;
        }
        if (action === 'add-group') {
          var beforeGroup = captureEntryRects();
          addGroup();
          renderListWithFlip(beforeGroup);
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
        var uid = String(inlineAction.getAttribute('data-element-uid') || '');
        if (!uid) {
          return;
        }
        if (actionType === 'edit') {
          state.activeEntryUid = uid;
          renderList();
          return;
        }
        if (actionType === 'remove') {
          var idx = findElementIndex(uid);
          if (idx < 0) {
            return;
          }
          var beforeRemove = captureEntryRects();
          state.draft.elements.splice(idx, 1);
          if (state.activeEntryUid === uid) {
            state.activeEntryUid = '';
          }
          renderListWithFlip(beforeRemove);
          queueAutosave(120);
        }
      }
    });

    root.addEventListener('input', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement) || !isAdmin()) {
        return;
      }
      var headField = String(target.getAttribute('data-head-input') || '');
      if (!headField) {
        return;
      }
      if (headField === 'title') {
        state.draft.title = String(target.value || '');
        queueAutosave(500);
      } else if (headField === 'description') {
        state.draft.description = String(target.value || '');
        queueAutosave(500);
      }
    });

    root.addEventListener('keydown', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement) || !isAdmin()) {
        return;
      }
      var headField = String(target.getAttribute('data-head-input') || '');
      if (!headField) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        state.activeHeadField = '';
        renderList();
        renderAdmin();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        state.activeHeadField = '';
        renderList();
        renderAdmin();
      }
    });

    root.addEventListener('focusout', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement) || !isAdmin()) {
        return;
      }
      var headField = String(target.getAttribute('data-head-input') || '');
      if (!headField) {
        return;
      }
      setTimeout(function () {
        if (!document.activeElement || !document.activeElement.hasAttribute || !document.activeElement.hasAttribute('data-head-input')) {
          state.activeHeadField = '';
          renderList();
          renderAdmin();
        }
      }, 0);
    });

    els.content.addEventListener('input', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }
      var uid = String(target.getAttribute('data-element-uid') || '');
      var field = String(target.getAttribute('data-inline-field') || '');
      if (!uid || !field) {
        return;
      }
      var idx = findElementIndex(uid);
      if (idx < 0) {
        return;
      }
      state.activeEntryUid = uid;
      if (field === 'type') {
        var nextType = String(target.value || 'entry');
        state.draft.elements[idx].type = (nextType === 'sub') ? 'sub' : 'entry';
      } else {
        state.draft.elements[idx][field] = String(target.value || '');
      }
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
        var beforeGroupBy = captureEntryRects();
        state.draft.group_by = String(target.value || '').trim();
        renderListWithFlip(beforeGroupBy);
        queueAutosave(280);
        return;
      }

      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        return;
      }
      var uid = String(target.getAttribute('data-element-uid') || '');
      var field = String(target.getAttribute('data-inline-field') || '');
      if (!uid || !field) {
        return;
      }
      var idx = findElementIndex(uid);
      if (idx < 0) {
        return;
      }
      if (field === 'type') {
        var nextType = String(target.value || 'entry');
        state.draft.elements[idx].type = (nextType === 'sub') ? 'sub' : 'entry';
      } else {
        state.draft.elements[idx][field] = String(target.value || '');
      }
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
      var row = target && target.closest ? target.closest('.list-entry-inline[data-element-uid]') : null;
      if (!(row instanceof HTMLElement)) {
        return;
      }
      state.dragUid = String(row.getAttribute('data-element-uid') || '');
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', state.dragUid);
      } catch (_err) {
        // Ignore.
      }
      row.classList.add('is-dragging');
    });

    els.content.addEventListener('dragend', function (event) {
      var row = event.target && event.target.closest ? event.target.closest('.list-entry-inline[data-element-uid]') : null;
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
      var row = target && target.closest ? target.closest('.list-entry-inline[data-element-uid]') : null;
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
      var row = target && target.closest ? target.closest('.list-entry-inline[data-element-uid]') : null;
      if (!(row instanceof HTMLElement)) {
        return;
      }
      event.preventDefault();
      var targetUid = String(row.getAttribute('data-element-uid') || '');
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
      state.saveIndicatorVisible = false;
      if (!state.activeEntryUid && state.draft.elements.length) {
        state.activeEntryUid = state.draft.elements[0]._uid;
      }
      setSaveStatus('saved');
      renderList();
      renderAdmin();
      renderValidation();
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
