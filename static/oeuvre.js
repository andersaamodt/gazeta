(function () {
  'use strict';

  var root = document.getElementById('oeuvre-root');
  if (!root) {
    return;
  }

  var querySlug = '';
  try {
    var params = new URLSearchParams(window.location.search);
    querySlug = String(params.get('page_slug') || params.get('list_slug') || '').trim();
  } catch (_err) {
    querySlug = '';
  }

  var slug = String(root.getAttribute('data-list-slug') || querySlug || 'oeuvre').trim() || 'oeuvre';
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
    activeCellField: '',
    activeHeadField: '',
    dragUid: '',
    dragMoved: false,
    dragDropped: false,
    dragLastTargetKey: '',
    dragStartElements: null,
    pointerDownEntryUid: '',
    pointerDownAt: 0,
    pendingNewEntry: null,
    uidCounter: 1,
    initialContentPainted: false
  };
  var PAGE_BOOTSTRAP_CACHE_PREFIX = 'nostr_page_bootstrap_v1:';

  function isAdmin() {
    return !!(state.payload && state.payload.is_admin && state.draft);
  }

  function markHydrationPageReady() {
    var gate = window.__wizardryHydration;
    if (gate && typeof gate.markPageReady === 'function') {
      gate.markPageReady();
    }
  }

  function authSignature() {
    var auth = getAuthPayload();
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
      // Ignore event dispatch issues.
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
    return payloadSlug === slug && payloadType === 'list';
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
      // Ignore cache write errors.
    }
  }

  function renderFromBootstrapCache() {
    var cachedPayload = readBootstrapCache();
    if (!cachedPayload) {
      return false;
    }
    state.payload = cachedPayload;
    state.draft = readEditableStateFromPayload();
    state.pendingNewEntry = null;
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
    renderList();
    renderAdmin();
    renderValidation();
    markInitialContentPainted();
    markHydrationPageReady();
    return true;
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

  function normalizeExtraFormat(value) {
    var next = String(value || '').trim().toLowerCase();
    return next === 'html' ? 'html' : 'markdown';
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
      var err = new Error((data && data.error) ? data.error : ('Request failed (' + response.status + ')'));
      err.code = (data && data.code) ? String(data.code) : '';
      err.httpStatus = response.status;
      throw err;
    }
    return data;
  }

  function nextUid() {
    return 'el-' + String(state.uidCounter++);
  }

  function isEntryType(type) {
    return type === 'entry';
  }

  function normalizeElement(raw) {
    var type = 'entry';
    var depth = Number(raw && raw.depth);
    if (!Number.isFinite(depth) || depth < 0) {
      depth = 0;
    }
    if (String(raw && raw.type || '') === 'subentry' || String(raw && raw.type || '') === 'sub') {
      depth = 1;
    }
    return {
      _uid: String(raw && raw._uid || nextUid()),
      type: type,
      event_id: String(raw && raw.event_id || ''),
      relay_hint: String(raw && raw.relay_hint || ''),
      marker: String(raw && raw.marker || ''),
      date: String(raw && raw.date || ''),
      depth: depth,
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
        depth: Math.max(0, Number(el && el.depth || 0) || 0),
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
      publish_intro_to_nostr: !!s.publish_intro_to_nostr,
      group_by: String(s.group_by || ''),
      content: String(s.content || ''),
      extras_after: String(s.extras_after || ''),
      extras_after_format: normalizeExtraFormat(s.extras_after_format || 'markdown'),
      elements: elements
    };
  }

  function hasStructuralElements(elements) {
    return (Array.isArray(elements) ? elements : []).some(function (el) {
      return (Number(el && el.depth || 0) || 0) > 0;
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
    var match = src.match(/[A-Za-z0-9]/);
    if (!match) {
      return '#';
    }
    var ch = String(match[0] || '').toUpperCase();
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
        publish_intro_to_nostr: !!state.draft.publish_intro_to_nostr,
        group_by: state.draft.group_by,
        extras_after: String(state.draft.extras_after || ''),
        extras_after_format: normalizeExtraFormat(state.draft.extras_after_format || 'markdown'),
        elements: cloneEditableElements(state.draft.elements)
      };
    }
    var src = (state.payload && state.payload.state) ? state.payload.state : {};
    return {
      title: String(src.title || ''),
      description: String(src.description || ''),
      publish_intro_to_nostr: !!src.publish_intro_to_nostr,
      group_by: String(src.group_by || ''),
      extras_after: String(src.extras_after || ''),
      extras_after_format: normalizeExtraFormat(src.extras_after_format || 'markdown'),
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
      var latest = await apiPost('/cgi/blog-get-nostr-page', {
        page_slug: slug,
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
    var shouldRetryAuth = false;
    state.busy = true;
    pruneTransientEntries();
    syncMetaFromInputs();
    setSaveStatus('saving');
    try {
      var auth = getAuthPayload();
      var elements = cloneEditableElements(state.draft.elements || []);
      await apiPost('/cgi/blog-save-nostr-page-draft', {
        page_slug: slug,
        title: state.draft.title || '',
        description: state.draft.description || '',
        publish_intro_to_nostr: state.draft.publish_intro_to_nostr ? 'true' : 'false',
        group_by: state.draft.group_by || '',
        content: state.draft.content || '',
        extras_after: state.draft.extras_after || '',
        extras_after_format: normalizeExtraFormat(state.draft.extras_after_format || 'markdown'),
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
      var errCode = String(err && err.code || '');
      if ((errCode === 'csrf_invalid' || errCode === 'auth_required') && opts.retryAuth !== false) {
        try {
          await load();
          if (isAdmin()) {
            shouldRetryAuth = true;
          } else {
            setSaveStatus('error', err && err.message ? err.message : 'Authentication required');
          }
        } catch (_reloadErr) {
          setSaveStatus('error', err && err.message ? err.message : 'Could not save draft');
        }
      } else {
        setSaveStatus('error', err && err.message ? err.message : 'Could not save draft');
      }
      if (shouldRetryAuth) {
        // Retry once after auth/session refresh.
      } else {
        if (opts.alertOnError !== false) {
          window.alert(err.message || 'Could not save draft');
        }
        return false;
      }
    } finally {
      state.busy = false;
      if (state.autosaveQueued) {
        state.autosaveQueued = false;
        queueAutosave(500);
      }
    }
    if (shouldRetryAuth) {
      return persistDraft({
        alertOnError: opts.alertOnError,
        retryAuth: false
      });
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
      await apiPost('/cgi/blog-publish-nostr-page', {
        page_slug: slug,
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
      await apiPost('/cgi/blog-revert-nostr-page-draft', {
        page_slug: slug,
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

  function addEntry(prefillYear) {
    if (!isAdmin()) {
      return;
    }
    var defaultDate = prefillYear ? String(prefillYear) : '';
    var entry = {
      _uid: nextUid(),
      type: 'entry',
      event_id: '',
      relay_hint: '',
      marker: 'oeuvre',
      date: defaultDate,
      depth: 0,
      markdown: ''
    };
    state.draft.elements.push(entry);
    state.activeEntryUid = entry._uid;
    state.activeCellField = 'markdown';
    state.pendingNewEntry = {
      uid: entry._uid,
      defaults: {
        event_id: '',
        relay_hint: '',
        marker: 'oeuvre',
        date: defaultDate,
        depth: 0,
        markdown: ''
      }
    };
  }

  function isPendingNewEntryUnedited() {
    if (!state.pendingNewEntry || !state.pendingNewEntry.uid) {
      return false;
    }
    var idx = findElementIndex(state.pendingNewEntry.uid);
    if (idx < 0) {
      state.pendingNewEntry = null;
      return false;
    }
    var entry = state.draft.elements[idx] || {};
    var d = state.pendingNewEntry.defaults || {};
    var hasRealContent = String(entry.markdown || '').trim() !== '' || String(entry.event_id || '').trim() !== '';
    if (hasRealContent) {
      return false;
    }
    return (
      String(entry.relay_hint || '') === String(d.relay_hint || '') &&
      String(entry.marker || '') === String(d.marker || '') &&
      Math.max(0, Number(entry.depth || 0) || 0) === Math.max(0, Number(d.depth || 0) || 0)
    );
  }

  function updatePendingNewEntryState() {
    if (!state.pendingNewEntry || !state.pendingNewEntry.uid) {
      return;
    }
    if (!isPendingNewEntryUnedited()) {
      state.pendingNewEntry = null;
    }
  }

  function isPendingNewEntryEditedAnyField() {
    if (!state.pendingNewEntry || !state.pendingNewEntry.uid) {
      return false;
    }
    var idx = findElementIndex(state.pendingNewEntry.uid);
    if (idx < 0) {
      return false;
    }
    var entry = state.draft.elements[idx] || {};
    var d = state.pendingNewEntry.defaults || {};
    return (
      String(entry.event_id || '') !== String(d.event_id || '') ||
      String(entry.relay_hint || '') !== String(d.relay_hint || '') ||
      String(entry.marker || '') !== String(d.marker || '') ||
      String(entry.date || '') !== String(d.date || '') ||
      Math.max(0, Number(entry.depth || 0) || 0) !== Math.max(0, Number(d.depth || 0) || 0) ||
      String(entry.markdown || '') !== String(d.markdown || '')
    );
  }

  function shouldAutosaveForUid(uid) {
    var targetUid = String(uid || '');
    if (!targetUid || !state.pendingNewEntry || !state.pendingNewEntry.uid) {
      return true;
    }
    if (String(state.pendingNewEntry.uid) !== targetUid) {
      return true;
    }
    return !isPendingNewEntryUnedited();
  }

  function isSubstantiveEntry(entry) {
    if (!entry) {
      return false;
    }
    return String(entry.markdown || '').trim() !== '' || String(entry.event_id || '').trim() !== '';
  }

  function pruneTransientEntries() {
    if (!isAdmin() || !Array.isArray(state.draft && state.draft.elements)) {
      return false;
    }
    var beforeLen = state.draft.elements.length;
    state.draft.elements = state.draft.elements.filter(function (entry) {
      if (isSubstantiveEntry(entry)) {
        return true;
      }
      var uid = String(entry && entry._uid || '');
      if (uid && state.pendingNewEntry && String(state.pendingNewEntry.uid || '') === uid) {
        // Keep a pending row visible while the admin is actively filling it out,
        // even if it is not yet publishable.
        return isPendingNewEntryEditedAnyField();
      }
      return false;
    });
    if (state.pendingNewEntry && state.pendingNewEntry.uid && findElementIndex(state.pendingNewEntry.uid) < 0) {
      state.pendingNewEntry = null;
    }
    if (state.activeEntryUid && findElementIndex(state.activeEntryUid) < 0) {
      state.activeEntryUid = '';
      state.activeCellField = '';
    }
    return state.draft.elements.length !== beforeLen;
  }

  function reorderByDrag(dragUid, targetUid, placeAfter) {
    if (!isAdmin() || !dragUid || !targetUid || dragUid === targetUid) {
      return;
    }
    var elements = state.draft.elements;
    var from = findElementIndex(dragUid);
    var to = findElementIndex(targetUid);
    if (from < 0 || to < 0) {
      return false;
    }
    var beforeOrder = elements.map(function (el) { return String(el && el._uid || ''); }).join('|');
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
    var afterOrder = elements.map(function (el) { return String(el && el._uid || ''); }).join('|');
    return beforeOrder !== afterOrder;
  }

  function renderHead() {
    var s = getRenderState();
    if (els.title) {
      if (isAdmin()) {
        if (state.activeHeadField === 'title') {
          els.title.innerHTML = '<span class="list-page-title-edit-wrap"><input id="list-head-title-input" class="list-head-inline-input" type="text" value="' + escapeHtml(s.title || 'List') + '" data-head-input="title"></span><span id="list-page-title-actions" class="list-page-title-actions"></span>';
        } else if (state.editMode) {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'List') + '</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="title">Edit...</button><span id="list-page-title-actions" class="list-page-title-actions"></span>';
        } else {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'List') + '</span><span id="list-page-title-actions" class="list-page-title-actions"></span>';
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
        els.description.innerHTML = '<span class="list-page-description-edit-wrap"><input id="list-head-description-input" class="list-head-inline-input list-head-description-input" type="text" value="' + escapeHtml(descText) + '" data-head-input="description"></span> <button type="button" class="list-inline-edit-link" data-list-head-save="description">Save</button>';
      } else if (state.editMode) {
        if (descText.trim()) {
          els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(descText) + '</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="description">Edit...</button>';
        } else {
          els.description.innerHTML = '<span class="list-page-description-empty">No description.</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="description">Edit...</button>';
        }
      } else {
        if (descText.trim()) {
          els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(descText) + '</span>';
        } else {
          els.description.innerHTML = '<span class="list-page-description-empty">No description.</span>';
        }
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

  function renderEntryInner(entry) {
    return renderEntryReadOnly(entry).replace(/^<li[^>]*>|<\/li>$/g, '');
  }

  function placeholderHtml(label) {
    return '<span class="list-inline-placeholder">' + escapeHtml(label) + '</span>';
  }

  function renderStructuredReadOnly(elements, listClass) {
    var html = '<ul class="' + escapeHtml(listClass || 'list-entries') + '">';
    var openDepth = -1;
    var started = false;

    (Array.isArray(elements) ? elements : []).forEach(function (el, idx) {
      var depth = Math.max(0, Number(el && el.depth || 0) || 0);
      if (!started && depth > 0) {
        depth = 0;
      }
      if (started && depth > openDepth + 1) {
        depth = openDepth + 1;
      }

      if (!started) {
        html += '<li class="list-entry-line list-depth-' + String(depth) + '">' + renderEntryInner(el);
        openDepth = depth;
        started = true;
        return;
      }

      if (depth === openDepth) {
        html += '</li><li class="list-entry-line list-depth-' + String(depth) + '">' + renderEntryInner(el);
        return;
      }

      if (depth > openDepth) {
        while (openDepth < depth) {
          html += '<ul class="list-sub-entries">';
          openDepth += 1;
        }
        html += '<li class="list-entry-line list-depth-' + String(depth) + '">' + renderEntryInner(el);
        return;
      }

      html += '</li>';
      while (openDepth > depth) {
        html += '</ul></li>';
        openDepth -= 1;
      }
      html += '<li class="list-entry-line list-depth-' + String(depth) + '">' + renderEntryInner(el);
    });

    if (started) {
      html += '</li>';
      while (openDepth > 0) {
        html += '</ul></li>';
        openDepth -= 1;
      }
    }

    html += '</ul>';
    return html;
  }

  function renderGroupByReadOnly(entries, groupBy) {
    var html = '';
    var grouped = ['year', 'first_letter', 'month', 'marker'].indexOf(String(groupBy || '')) >= 0;
    if (grouped) {
      var currentLabel = '__none__';
      var bucket = [];
      function flushGroup() {
        if (!bucket.length) {
          return;
        }
        html += renderStructuredReadOnly(bucket, 'list-entries');
        html += '</section>';
        bucket = [];
      }
      entries.forEach(function (entry) {
        var label = groupLabelForEntry(entry, groupBy);
        if (label !== currentLabel) {
          flushGroup();
          currentLabel = label;
          html += '<section class="list-year-group">';
          html += '<div class="list-year-head">';
          html += '<h3 class="list-year-heading">' + escapeHtml(label || 'Unknown') + '</h3>';
          html += '</div>';
        }
        bucket.push(entry);
      });
      flushGroup();
      return html;
    }

    return renderStructuredReadOnly(entries, 'list-entries');
  }

  function renderExtraContent(text, format, role) {
    var value = String(text || '');
    if (!value.trim()) {
      return '';
    }
    var html = normalizeExtraFormat(format) === 'html' ? value : markdownBlock(value);
    return '<section class="nostr-page-extra nostr-page-extra-' + escapeHtml(role || '') + '">' + html + '</section>';
  }

  function renderExtrasEditor() {
    var draft = state.draft || {};
    var html = '';
    html += '<section class="nostr-page-extras-editor" aria-label="Page extras">';
    html += '<h3 class="nostr-page-extras-heading">Before and after content</h3>';
    html += '<label class="nostr-page-extra-edit">';
    html += '<span>Before content (Markdown)<span class="nostr-page-extra-controls"><label class="checkbox-control"><input type="checkbox" data-list-intro-publish="true"' + (draft.publish_intro_to_nostr ? ' checked' : '') + '> <span>Publish before content to Nostr</span></label></span></span>';
    html += '<textarea data-list-intro="true" rows="4" placeholder="Optional content shown before the main content section">' + escapeHtml(draft.description || '') + '</textarea>';
    html += '</label>';
    html += '<label class="nostr-page-extra-edit">';
    html += '<span>After content</span>';
    html += '<span class="nostr-page-extra-controls">';
    html += '<select data-list-outro-format="after">';
    html += '<option value="markdown"' + (normalizeExtraFormat(draft.extras_after_format) === 'markdown' ? ' selected' : '') + '>Markdown</option>';
    html += '<option value="html"' + (normalizeExtraFormat(draft.extras_after_format) === 'html' ? ' selected' : '') + '>HTML</option>';
    html += '</select>';
    html += '</span>';
    html += '<textarea data-list-outro="after" rows="4" placeholder="Optional local content shown after the main content section">' + escapeHtml(draft.extras_after || '') + '</textarea>';
    html += '</label>';
    html += '</section>';
    return html;
  }

  function renderElementInline(el) {
    var uid = String(el && el._uid || '');
    var rowSelected = uid && uid === state.activeEntryUid;
    var activeField = rowSelected ? String(state.activeCellField || '') : '';
    var active = !!activeField;
    var depth = Math.max(0, Number(el && el.depth || 0) || 0);
    var guiDepth = depth > 0 ? 1 : 0;
    var idx = findElementIndex(uid);
    var canToggle = !(idx === 0 && guiDepth === 0);
    var html = '';

    html += '<li class="list-entry-line list-entry-inline' + (active ? ' is-active' : '') + '" data-element-uid="' + escapeHtml(uid) + '" data-depth="' + String(guiDepth) + '" style="--list-depth:' + String(guiDepth) + ';" draggable="true">';
    html += '<div class="list-inline-cell list-inline-handle" title="Drag to reorder" aria-hidden="true">⋮⋮</div>';

    var markdownText = String(el && el.markdown || '').trim();
    var dateText = String(el && el.date || '');
    var eventId = String(el && el.event_id || '');

    html += '<div class="list-inline-cell list-inline-indent-controls">';
    html += '<button type="button" class="list-inline-indent-btn" data-list-inline-action="toggle-depth" data-element-uid="' + escapeHtml(uid) + '" title="' + (guiDepth > 0 ? 'Unindent entry' : 'Indent entry') + '"' + (canToggle ? '' : ' disabled aria-disabled="true"') + '>' + (guiDepth > 0 ? '←' : '→') + '</button>';
    html += '</div>';

    if (active && activeField === 'markdown') {
      html += '<div class="list-inline-cell list-inline-markdown"><input type="text" data-inline-field="markdown" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(markdownText) + '"></div>';
    } else {
      html += '<div role="button" tabindex="0" class="list-inline-cell list-inline-open list-inline-markdown" data-list-inline-action="edit" data-inline-field="markdown" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + (markdownText ? markdownInline(markdownText) : placeholderHtml('Add text...')) + '</span></div>';
    }
    if (active && activeField === 'date') {
      html += '<div class="list-inline-cell list-inline-date"><div class="list-inline-date-shell"><input type="text" data-inline-field="date" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(dateText) + '" placeholder="YYYY / YYYY-MM / YYYY-MM-DD"></div></div>';
    } else {
      html += '<div class="list-inline-cell list-inline-date"><div class="list-inline-date-shell"><button type="button" class="list-inline-open list-inline-date-button" data-list-inline-action="edit" data-inline-field="date" data-element-uid="' + escapeHtml(uid) + '"><span class="list-inline-value">' + (dateText ? escapeHtml(dateText) : placeholderHtml('Add date...')) + '</span></button></div></div>';
    }
    html += '<div class="list-inline-cell list-inline-actions"><button type="button" data-list-inline-action="remove" data-element-uid="' + escapeHtml(uid) + '" aria-label="Remove entry" title="Delete this entry">✕</button></div>';
    if (active) {
      html += '<div class="list-inline-eventid">';
      html += '<details class="list-admin-eventid-details"' + (activeField === 'event_id' ? ' open' : '') + '>';
      html += '<summary>Add Nostr event_id</summary>';
      html += '<label><span class="list-inline-eventid-label">event_id</span><input type="text" data-inline-field="event_id" data-element-uid="' + escapeHtml(uid) + '" value="' + escapeHtml(eventId) + '"></label>';
      html += '</details>';
      html += '</div>';
    }

    html += '</li>';
    return html;
  }

  function renderInlineEditor(elements) {
    var html = '';
    html += renderExtrasEditor();
    var groupedModes = ['year', 'first_letter', 'month', 'marker'];
    var isGrouped = groupedModes.indexOf(String(state.draft.group_by || '')) >= 0;
    var pendingUnedited = isPendingNewEntryUnedited();
    var addTitle = pendingUnedited ? 'Edit the new entry before adding another' : 'Add entry';
    html += '<div class="list-inline-toolbar">';
    html += '<div class="list-inline-toolbar-left"><div class="list-inline-edit-controls">';
    html += '<label><span>Group by</span><select id="list-admin-group-by">';
    html += '<option value=""' + (state.draft.group_by ? '' : ' selected') + '>None</option>';
    html += '<option value="year"' + (state.draft.group_by === 'year' ? ' selected' : '') + '>Year</option>';
    html += '<option value="first_letter"' + (state.draft.group_by === 'first_letter' ? ' selected' : '') + '>First letter</option>';
    html += '<option value="month"' + (state.draft.group_by === 'month' ? ' selected' : '') + '>Month</option>';
    html += '<option value="marker"' + (state.draft.group_by === 'marker' ? ' selected' : '') + '>Marker</option>';
    html += '</select></label>';
    html += '</div></div>';
    html += '<div class="list-inline-toolbar-right"><button type="button" data-list-action="add" title="' + escapeHtml(addTitle) + '"' + (pendingUnedited ? ' disabled aria-disabled="true"' : '') + '>+</button></div>';
    html += '</div>';

    if (!elements.length) {
      html += '<div class="list-inline-empty">No entries yet.</div>';
      return html;
    }

    html += '<div class="list-inline-head">';
    html += '<span class="list-inline-head-handle"></span>';
    html += '<span class="list-inline-head-depth" aria-hidden="true"></span>';
    html += '<span class="list-inline-head-markdown">Text</span>';
    html += '<span class="list-inline-head-date">Date</span>';
    html += '<span class="list-inline-head-actions"></span>';
    html += '</div>';

    if (isGrouped) {
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
          if (state.draft.group_by === 'year') {
            var prefillYear = (/^\d{4}$/.test(String(label || '')) ? String(label || '') : '');
            html += '<button type="button" class="list-year-add" data-list-action="add-year" data-prefill-year="' + escapeHtml(prefillYear) + '" title="' + escapeHtml(pendingUnedited ? 'Edit the new entry before adding another' : ('Add entry for ' + (prefillYear || 'this year section'))) + '"' + (pendingUnedited ? ' disabled aria-disabled="true"' : '') + '>+</button>';
          }
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
    var afterContent = renderExtraContent(s.extras_after, s.extras_after_format, 'after');
    var inlineMode = isAdmin() && state.editMode;
    if (root && root.classList) {
      root.classList.toggle('is-editing', inlineMode);
    }

    if (!elements.length) {
      if (inlineMode) {
        els.content.innerHTML = renderInlineEditor([]) + afterContent;
      } else {
        els.content.innerHTML = '<p class="list-page-empty-state">No content yet.</p>' + afterContent;
      }
      renderAdmin();
      return;
    }

    if (inlineMode) {
      els.content.innerHTML = renderInlineEditor(elements) + afterContent;
      renderAdmin();
      return;
    }

    els.content.innerHTML = renderGroupByReadOnly(elements.filter(function (el) {
      return isEntryType(String(el && el.type || 'entry'));
    }), s.group_by) + afterContent;
    renderAdmin();
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

    var hasCanonical = !!state.payload.canonical_exists;
    var hasDraftChanges = !!state.payload.draft_differs;
    var showRevert = !!state.editMode;
    var showPublish = !!state.editMode || hasDraftChanges;
    var canRevert = hasCanonical && hasDraftChanges;
    var revertTitle = canRevert
      ? 'Revert draft to Nostr version'
      : (hasCanonical ? 'No local changes to revert' : 'No Nostr version found');

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
    if (showRevert) {
      html += '<button type="button" data-list-action="revert" title="' + escapeHtml(revertTitle) + '"' + (canRevert ? '' : ' disabled aria-disabled="true"') + '>Revert</button>';
    }
    if (showPublish) {
      html += '<button type="button" class="list-admin-primary-btn" data-list-action="publish">Publish to Nostr...</button>';
    }
    html += '<button type="button" class="list-admin-primary-btn" data-list-action="toggle-edit">' + (state.editMode ? 'Done' : 'Edit') + '</button>';
    html += '</span>';
    if (actionsHost) {
      actionsHost.innerHTML = html;
    }
    els.admin.hidden = true;
    els.admin.innerHTML = '';
  }

  function focusInlineField(uid, field) {
    var targetUid = String(uid || '');
    var targetField = String(field || '');
    if (!targetUid || !targetField || !els.content) {
      return;
    }
    requestAnimationFrame(function () {
      var selector = '[data-inline-field="' + targetField + '"][data-element-uid="' + targetUid + '"]';
      var nextInput = els.content.querySelector(selector);
      if (nextInput && typeof nextInput.focus === 'function') {
        nextInput.focus();
        if (nextInput instanceof HTMLInputElement && typeof nextInput.select === 'function') {
          nextInput.select();
        }
      }
    });
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
          var removedTransient = false;
          if (state.editMode) {
            removedTransient = pruneTransientEntries();
          }
          state.editMode = !state.editMode;
          if (!state.editMode) {
            state.activeEntryUid = '';
            state.activeCellField = '';
          }
          renderList();
          renderAdmin();
          if (removedTransient) {
            queueAutosave(120);
          }
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

      var eventSummary = target.closest('.list-admin-eventid-details summary');
      if (eventSummary instanceof HTMLElement && state.editMode) {
        var eventRow = eventSummary.closest('.list-entry-inline[data-element-uid]');
        if (eventRow instanceof HTMLElement) {
          state.activeEntryUid = String(eventRow.getAttribute('data-element-uid') || '');
          state.activeCellField = 'event_id';
        }
      }

      var headSave = target.closest('[data-list-head-save]');
      if (headSave instanceof HTMLElement) {
        var saveField = String(headSave.getAttribute('data-list-head-save') || '');
        if (saveField === 'description') {
          persistDraft({ alertOnError: true }).then(function (ok) {
            if (ok !== false) {
              state.activeHeadField = '';
              renderList();
              renderAdmin();
            }
          });
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
          if (isPendingNewEntryUnedited()) {
            return;
          }
          var before = captureEntryRects();
          addEntry('');
          renderListWithFlip(before);
          return;
        }
        if (action === 'add-year') {
          if (isPendingNewEntryUnedited()) {
            return;
          }
          var prefill = String(listAction.getAttribute('data-prefill-year') || '').trim();
          var beforeYear = captureEntryRects();
          addEntry(prefill);
          renderListWithFlip(beforeYear);
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
          event.preventDefault();
          state.activeEntryUid = uid;
          state.activeCellField = String(inlineAction.getAttribute('data-inline-field') || '');
          renderList();
          focusInlineField(uid, state.activeCellField);
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
            state.activeCellField = '';
          }
          if (state.pendingNewEntry && state.pendingNewEntry.uid === uid) {
            state.pendingNewEntry = null;
          }
          renderListWithFlip(beforeRemove);
          queueAutosave(120);
          return;
        }
        if (actionType === 'toggle-depth') {
          if (inlineAction.hasAttribute('disabled')) {
            return;
          }
          var depthIdx = findElementIndex(uid);
          if (depthIdx < 0) {
            return;
          }
          var beforeDepth = captureEntryRects();
          var currentDepth = Math.max(0, Number(state.draft.elements[depthIdx].depth || 0) || 0);
          if (currentDepth > 0) {
            state.draft.elements[depthIdx].depth = 0;
          } else if (depthIdx > 0) {
            state.draft.elements[depthIdx].depth = 1;
          }
          renderListWithFlip(beforeDepth);
          updatePendingNewEntryState();
          if (shouldAutosaveForUid(uid)) {
            queueAutosave(120);
          }
          return;
        }
      }
    });

    els.content.addEventListener('mousedown', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var row = target.closest('.list-entry-inline[data-element-uid]');
      state.pointerDownEntryUid = row ? String(row.getAttribute('data-element-uid') || '') : '';
      state.pointerDownAt = Date.now();
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
        if (headField === 'description') {
          persistDraft({ alertOnError: true }).then(function (ok) {
            if (ok !== false) {
              state.activeHeadField = '';
              renderList();
              renderAdmin();
            }
          });
        } else {
          state.activeHeadField = '';
          renderList();
          renderAdmin();
        }
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
      if (headField === 'description') {
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
      if (target instanceof HTMLTextAreaElement) {
        if (target.hasAttribute('data-list-intro')) {
          state.draft.description = String(target.value || '');
          renderHead();
          queueAutosave(500);
          return;
        }
        var outroField = String(target.getAttribute('data-list-outro') || '');
        if (outroField === 'after') {
          state.draft.extras_after = String(target.value || '');
          queueAutosave(500);
        }
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
      state.activeEntryUid = uid;
      state.draft.elements[idx][field] = String(target.value || '');
      updatePendingNewEntryState();
      if (shouldAutosaveForUid(uid)) {
        queueAutosave(500);
      }
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
      if (target instanceof HTMLSelectElement) {
        var outroFormatField = String(target.getAttribute('data-list-outro-format') || '');
        if (outroFormatField === 'after') {
          state.draft.extras_after_format = normalizeExtraFormat(target.value || '');
          renderList();
          queueAutosave(500);
          return;
        }
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-list-intro-publish')) {
        state.draft.publish_intro_to_nostr = !!target.checked;
        queueAutosave(500);
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
      state.draft.elements[idx][field] = String(target.value || '');
      updatePendingNewEntryState();
      if (field === 'date') {
        var beforeDate = captureEntryRects();
        moveEntryByYear(uid);
        renderListWithFlip(beforeDate);
      }
      if (shouldAutosaveForUid(uid)) {
        queueAutosave(500);
      }
    });

    els.content.addEventListener('focusout', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (!target.matches('[data-inline-field]')) {
        return;
      }
      var uid = String(target.getAttribute('data-element-uid') || '');
      if (!uid || uid !== String(state.activeEntryUid || '')) {
        return;
      }
      setTimeout(function () {
        var activeEl = document.activeElement;
        if (!(activeEl instanceof HTMLElement)) {
          state.activeEntryUid = '';
          state.activeCellField = '';
          renderList();
          renderAdmin();
          return;
        }
        var pointerIsSameRow = state.pointerDownEntryUid === uid && (Date.now() - Number(state.pointerDownAt || 0)) < 600;
        if (pointerIsSameRow) {
          return;
        }
        var sameRow = activeEl.closest('.list-entry-inline[data-element-uid]');
        var sameUid = sameRow ? String(sameRow.getAttribute('data-element-uid') || '') : '';
        if (sameUid === uid) {
          return;
        }
        var nextInlineField = activeEl.closest('[data-inline-field][data-element-uid]');
        if (!nextInlineField) {
          state.activeEntryUid = '';
          state.activeCellField = '';
          renderList();
          renderAdmin();
        }
      }, 0);
    });

    els.content.addEventListener('keydown', function (event) {
      if (!state.editMode || !isAdmin()) {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var inlineAction = target.closest('[data-list-inline-action="edit"]');
      if (!(inlineAction instanceof HTMLElement)) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        inlineAction.click();
      }
    });

    els.content.addEventListener('keydown', function (event) {
      if (!state.editMode || !isAdmin() || event.key !== 'Tab') {
        return;
      }
      var target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      var uid = String(target.getAttribute('data-element-uid') || '');
      var field = String(target.getAttribute('data-inline-field') || '');
      if (!uid || !field) {
        return;
      }
      var rowNodes = Array.prototype.slice.call(els.content.querySelectorAll('.list-entry-inline[data-element-uid]'));
      if (!rowNodes.length) {
        return;
      }
      var rowUids = rowNodes.map(function (row) {
        return String(row.getAttribute('data-element-uid') || '');
      });
      var rowIdx = rowUids.indexOf(uid);
      if (rowIdx < 0) {
        return;
      }

      var nextUid = uid;
      var nextField = field;
      var backward = !!event.shiftKey;

      if (field === 'event_id') {
        nextField = backward ? 'date' : 'markdown';
        if (!backward) {
          nextUid = rowUids[(rowIdx + 1) % rowUids.length] || uid;
        }
      } else if (field === 'markdown') {
        if (backward) {
          nextUid = rowUids[(rowIdx - 1 + rowUids.length) % rowUids.length] || uid;
          nextField = 'date';
        } else {
          nextField = 'date';
        }
      } else if (field === 'date') {
        if (backward) {
          nextField = 'markdown';
        } else {
          nextUid = rowUids[(rowIdx + 1) % rowUids.length] || uid;
          nextField = 'markdown';
        }
      } else {
        return;
      }

      event.preventDefault();
      state.activeEntryUid = nextUid;
      state.activeCellField = nextField;
      renderList();
      renderAdmin();
      focusInlineField(nextUid, nextField);
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
      state.dragStartElements = cloneEditableElements(state.draft.elements || []);
      state.dragMoved = false;
      state.dragDropped = false;
      state.dragLastTargetKey = '';
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
      if (state.dragUid && state.dragMoved && !state.dragDropped && Array.isArray(state.dragStartElements)) {
        var beforeSnap = captureEntryRects();
        state.draft.elements = cloneEditableElements(state.dragStartElements);
        renderListWithFlip(beforeSnap);
      }
      state.dragUid = '';
      state.dragMoved = false;
      state.dragDropped = false;
      state.dragLastTargetKey = '';
      state.dragStartElements = null;
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
      var targetUid = String(row.getAttribute('data-element-uid') || '');
      if (!targetUid || targetUid === state.dragUid) {
        return;
      }
      var rect = row.getBoundingClientRect();
      var placeAfter = event.clientY > (rect.top + rect.height / 2);
      var targetKey = targetUid + ':' + (placeAfter ? 'after' : 'before');
      if (targetKey === state.dragLastTargetKey) {
        return;
      }
      var beforeLiveMove = captureEntryRects();
      var changed = reorderByDrag(state.dragUid, targetUid, placeAfter);
      if (!changed) {
        return;
      }
      state.dragLastTargetKey = targetKey;
      state.dragMoved = true;
      renderListWithFlip(beforeLiveMove);
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
      state.dragDropped = true;
      var targetUid = String(row.getAttribute('data-element-uid') || '');
      if (targetUid && targetUid !== state.dragUid) {
        var rect = row.getBoundingClientRect();
        var placeAfter = event.clientY > (rect.top + rect.height / 2);
        var targetKey = targetUid + ':' + (placeAfter ? 'after' : 'before');
        if (targetKey !== state.dragLastTargetKey) {
          var beforeDrop = captureEntryRects();
          var changed = reorderByDrag(state.dragUid, targetUid, placeAfter);
          if (changed) {
            state.dragMoved = true;
            renderListWithFlip(beforeDrop);
          }
        }
      }
      if (state.dragMoved) {
        queueAutosave(120);
      }
    });
  }

  async function load() {
    try {
      state.authSignature = authSignature();
      var auth = getAuthPayload();
      var payload = await apiPost('/cgi/blog-get-nostr-page', {
        page_slug: slug,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      if (!isExpectedPayload(payload)) {
        throw new Error('Unexpected page payload for list page');
      }
      state.payload = payload;
      state.draft = readEditableStateFromPayload();
      state.pendingNewEntry = null;
      state.saveIndicatorVisible = false;
      if (!state.activeEntryUid && state.draft.elements.length) {
        state.activeEntryUid = state.draft.elements[0]._uid;
      }
      setSaveStatus('saved');
      writeBootstrapCache(state.payload);
      renderList();
      renderAdmin();
      renderValidation();
      markInitialContentPainted();
    } catch (err) {
      if (els.content) {
        els.content.innerHTML = '<p class="placeholder">Error: ' + escapeHtml(err.message || 'Could not load list page') + '</p>';
      }
    } finally {
      markHydrationPageReady();
    }
  }

  bindAdminEvents();
  document.addEventListener('mousedown', function (event) {
    if (!state.editMode || !isAdmin() || !state.activeEntryUid) {
      return;
    }
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!root.contains(target)) {
      var removedTransient = pruneTransientEntries();
      state.activeEntryUid = '';
      state.activeCellField = '';
      renderList();
      renderAdmin();
      if (removedTransient) {
        queueAutosave(120);
      }
    }
  });
  document.addEventListener('click', function (event) {
    if (!state.editMode || !isAdmin() || !state.activeEntryUid || !state.activeCellField) {
      return;
    }
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!root.contains(target)) {
      return;
    }
    if (target.closest('[data-list-inline-action="edit"]')) {
      return;
    }
    var activeUid = String(state.activeEntryUid || '');
    var activeRow = target.closest('.list-entry-inline[data-element-uid]');
    if (activeRow && String(activeRow.getAttribute('data-element-uid') || '') === activeUid) {
      return;
    }
    var activeFieldSelector = '[data-inline-field="' + String(state.activeCellField || '') + '"][data-element-uid="' + activeUid + '"]';
    var onActiveField = !!target.closest(activeFieldSelector);
    if (onActiveField) {
      return;
    }
    var onActiveEventDetails = !!target.closest('.list-inline-eventid') &&
      !!target.closest('.list-entry-inline[data-element-uid="' + activeUid + '"]');
    if (onActiveEventDetails) {
      return;
    }
    var removedTransient = pruneTransientEntries();
    state.activeEntryUid = '';
    state.activeCellField = '';
    renderList();
    renderAdmin();
    if (removedTransient) {
      queueAutosave(120);
    }
  });
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
