(function () {
  'use strict';

  var root = document.getElementById('public-ranking-root');
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
  var slug = String(root.getAttribute('data-ranking-slug') || query.get('page_slug') || query.get('slug') || 'ranking').trim() || 'ranking';

  var els = {
    title: document.getElementById('public-ranking-title'),
    description: document.getElementById('public-ranking-description'),
    admin: document.getElementById('public-ranking-admin'),
    validation: document.getElementById('public-ranking-validation'),
    content: document.getElementById('public-ranking-content')
  };

  var state = {
    payload: null,
    draft: null,
    editMode: false,
    activeHeadField: '',
    navTitle: '',
    navTitleEditing: false,
    navTitleInput: '',
    navTitleBusy: false,
    submitComposerOpen: false,
    busy: false,
    saveTimer: null,
    saveStatus: 'saved',
    saveError: '',
    saveIndicatorVisible: false,
    currentMetric: 'momentum',
    initialContentPainted: false
  };
  var PAGE_BOOTSTRAP_CACHE_PREFIX = 'nostr_page_bootstrap_v1:';
  var markedUpgradeTimer = 0;
  var markedUpgradeAttempts = 0;

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

  function bootstrapCacheKey() {
    return PAGE_BOOTSTRAP_CACHE_PREFIX + slug;
  }

  function isExpectedPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    var payloadSlug = String(payload.slug || '').trim();
    var payloadType = String(payload.page_type || '').trim().toLowerCase();
    return payloadSlug === slug && payloadType === 'public-ranking';
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
    state.draft = normalizeDraftState((cachedPayload && cachedPayload.state) || {});
    state.navTitle = String((cachedPayload && cachedPayload.nav_title) || '').trim();
    state.navTitleEditing = false;
    state.navTitleInput = '';
    state.navTitleBusy = false;
    state.currentMetric = normalizeMetric((cachedPayload.state && (cachedPayload.state.metric || cachedPayload.state.default_metric)) || state.draft.default_metric || 'momentum');
    state.activeHeadField = '';
    state.submitComposerOpen = false;
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
    renderAll();
    markInitialContentPainted();
    return true;
  }

  function isAdmin() {
    return !!(state.payload && state.payload.is_admin && state.draft);
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
    scheduleMarkedUpgrade();
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
    scheduleMarkedUpgrade();
    return '<p>' + escapeHtml(value).replace(/\n/g, '<br>') + '</p>';
  }

  function scheduleMarkedUpgrade() {
    if (window.marked && typeof window.marked.parse === 'function' && typeof window.marked.parseInline === 'function') {
      return;
    }
    if (markedUpgradeTimer) {
      return;
    }
    markedUpgradeAttempts = 0;
    function pollForMarked() {
      if (window.marked && typeof window.marked.parse === 'function' && typeof window.marked.parseInline === 'function') {
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

  function normalizeMetric(raw) {
    var metric = String(raw || '').trim().toLowerCase();
    if (metric === 'support' || metric === 'enthusiasm' || metric === 'intensity') {
      return metric;
    }
    return 'momentum';
  }

  function normalizeSubmissionMode(raw) {
    var mode = String(raw || '').trim().toLowerCase();
    if (mode === 'open' || mode === 'moderated') {
      return mode;
    }
    return 'owner_only';
  }

  function normalizeDraftState(raw) {
    var src = raw || {};
    var blacklist = Array.isArray(src.blacklist_pubkeys) ? src.blacklist_pubkeys : [];
    var refs = Array.isArray(src.root_refs) ? src.root_refs : [];
    return {
      slug: String(src.slug || slug),
      type: 'public-ranking',
      title: String(src.title || root.getAttribute('data-page-title') || 'Public Ranking'),
      description: String(src.description || ''),
      content: String(src.content || ''),
      extras_after: String(src.extras_after || ''),
      extras_after_format: String(src.extras_after_format || 'markdown').toLowerCase() === 'html' ? 'html' : 'markdown',
      vote_cooldown_seconds: Math.max(60, Math.floor(Number(src.vote_cooldown_seconds || 86400) || 86400)),
      submission_mode: normalizeSubmissionMode(src.submission_mode || 'owner_only'),
      default_metric: normalizeMetric(src.default_metric || src.metric || 'momentum'),
      blacklist_pubkeys: blacklist.map(function (pk) { return String(pk || '').trim().toLowerCase(); }).filter(Boolean),
      root_refs: refs.map(function (coord) { return String(coord || '').trim(); }).filter(Boolean)
    };
  }

  function getRenderState() {
    if (isAdmin()) {
      state.draft = normalizeDraftState(state.draft);
      return state.draft;
    }
    return normalizeDraftState((state.payload && state.payload.state) || {});
  }

  function defaultNavbarTitle(renderState) {
    var s = renderState || getRenderState();
    var title = String((s && s.title) || root.getAttribute('data-page-title') || 'Public Ranking').trim();
    return title || 'Public Ranking';
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
  }

  function apiPost(url, payload) {
    var params = new URLSearchParams(payload || {});
    return fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (_err) {
          throw new Error('Invalid JSON response');
        }
        if (!res.ok || !data || data.success === false) {
          var err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
          err.code = data && data.code ? String(data.code) : '';
          err.payload = data || null;
          throw err;
        }
        return data;
      });
    });
  }

  async function apiPostFirstAvailable(urls, payload) {
    var list = Array.isArray(urls) ? urls : [];
    var lastErr = null;
    var i;
    for (i = 0; i < list.length; i += 1) {
      var endpoint = String(list[i] || '');
      if (!endpoint) {
        continue;
      }
      try {
        return await apiPost(endpoint, payload);
      } catch (err) {
        lastErr = err;
        var message = String((err && err.message) || '');
        if (message.indexOf('404') === -1 && message.indexOf('Not Found') === -1) {
          throw err;
        }
      }
    }
    if (lastErr) {
      throw lastErr;
    }
    throw new Error('No submission endpoint is configured');
  }

  function setSaveStatus(next, errorMessage) {
    state.saveStatus = next;
    state.saveError = String(errorMessage || '');
    var node = document.getElementById('public-ranking-save-status');
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

  function syncDraftFromEditor() {
    if (!isAdmin()) {
      return;
    }
    var cooldown = document.getElementById('public-ranking-edit-cooldown');
    var allowOpen = document.getElementById('public-ranking-edit-allow-open');
    var mode = document.getElementById('public-ranking-edit-submission-mode');
    var metric = document.getElementById('public-ranking-edit-default-metric');
    var blacklist = document.getElementById('public-ranking-edit-blacklist');

    state.draft.vote_cooldown_seconds = Math.max(60, Math.floor(Number(cooldown && cooldown.value ? cooldown.value : state.draft.vote_cooldown_seconds) || 86400));
    if (allowOpen instanceof HTMLInputElement && allowOpen.type === 'checkbox') {
      state.draft.submission_mode = allowOpen.checked ? 'open' : 'owner_only';
    } else {
      state.draft.submission_mode = normalizeSubmissionMode(mode ? mode.value : state.draft.submission_mode);
    }
    state.draft.default_metric = normalizeMetric(metric ? metric.value : state.draft.default_metric);
    state.currentMetric = state.draft.default_metric;
    state.draft.blacklist_pubkeys = String(blacklist && blacklist.value || '')
      .split(/\n|,/)
      .map(function (pk) { return String(pk || '').trim().toLowerCase(); })
      .filter(function (pk) { return /^[0-9a-f]{64}$/.test(pk); });
  }

  function draftPayloadJson() {
    syncDraftFromEditor();
    return JSON.stringify(state.draft || {});
  }

  function renderValidation() {
    if (!els.validation) {
      return;
    }
    var v = (state.payload && state.payload.validation) ? state.payload.validation : {};
    var errors = Array.isArray(v.errors) ? v.errors : [];
    if (!isAdmin() || !state.editMode || !errors.length) {
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
    els.validation.hidden = false;
    els.validation.innerHTML = html;
  }

  function renderHead() {
    var s = getRenderState();
    if (s && s.title) {
      document.title = String(s.title);
    }
    if (els.title) {
      if (isAdmin()) {
        if (state.activeHeadField === 'title') {
          els.title.innerHTML = '<span class="list-page-title-edit-wrap"><input id="public-ranking-head-title-input" class="list-head-inline-input" type="text" value="' + escapeHtml(s.title || 'Public Ranking') + '" data-ranking-head-input="title"></span><span id="public-ranking-page-title-actions" class="list-page-title-actions"></span>';
        } else if (state.editMode) {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'Public Ranking') + '</span> <button type="button" class="list-inline-edit-link" data-ranking-head-edit="title">Edit...</button><span id="public-ranking-page-title-actions" class="list-page-title-actions"></span>';
        } else {
          els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(s.title || 'Public Ranking') + '</span><span id="public-ranking-page-title-actions" class="list-page-title-actions"></span>';
        }
      } else {
        els.title.textContent = s.title || 'Public Ranking';
      }
    }
    renderNavbarTitleRow(s);
    if (els.description) {
      var desc = String(s.description || '').trim();
      var hasMainContent = hasVisibleMainContent(s);
      var suppressEmptyDescription = !desc && !hasMainContent && state.activeHeadField !== 'description';
      if (isAdmin()) {
        els.description.hidden = suppressEmptyDescription;
        if (suppressEmptyDescription) {
          els.description.innerHTML = '';
        } else if (state.activeHeadField === 'description') {
          els.description.innerHTML = '<span class="list-page-description-edit-wrap"><textarea id="public-ranking-head-description-input" class="list-head-description-input" rows="4" data-ranking-head-input="description">' + escapeHtml(desc) + '</textarea></span> <button type="button" class="list-inline-edit-link" data-ranking-head-save="description">Save</button>';
        } else if (state.editMode) {
          if (desc) {
            els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(desc) + '</span> <button type="button" class="list-inline-edit-link" data-ranking-head-edit="description">Edit...</button>';
          } else {
            els.description.innerHTML = '<span class="list-page-description-empty">No description.</span> <button type="button" class="list-inline-edit-link" data-ranking-head-edit="description">Edit...</button>';
          }
        } else if (desc) {
          els.description.innerHTML = '<span class="list-page-description-text">' + markdownInline(desc) + '</span>';
        } else if (hasMainContent) {
          els.description.innerHTML = '';
          els.description.hidden = true;
        } else {
          els.description.innerHTML = '<span class="list-page-description-empty">No description.</span>';
        }
      } else {
        if (desc) {
          els.description.innerHTML = markdownInline(desc);
          els.description.hidden = false;
        } else {
          els.description.innerHTML = '';
          els.description.hidden = true;
        }
      }
    }
    if (isAdmin() && state.activeHeadField) {
      requestAnimationFrame(function () {
        var id = state.activeHeadField === 'title' ? 'public-ranking-head-title-input' : 'public-ranking-head-description-input';
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
      if (state.saveTimer) {
        clearTimeout(state.saveTimer);
        state.saveTimer = null;
      }
      var nonAdminActionsHost = document.getElementById('public-ranking-page-title-actions');
      if (nonAdminActionsHost) {
        nonAdminActionsHost.innerHTML = '';
      }
      els.admin.hidden = true;
      els.admin.innerHTML = '';
      return;
    }
    var hasCanonical = !!(state.payload && state.payload.canonical_exists);
    var hasDraftChanges = !!(state.payload && state.payload.draft_differs);
    var showRevert = !!state.editMode;
    var showPublish = !!state.editMode || hasDraftChanges;
    var canRevert = hasCanonical && hasDraftChanges;
    var revertTitle = canRevert ? 'Revert draft to Nostr version' : (hasCanonical ? 'No local changes to revert' : 'No Nostr version found');
    var actionsHost = document.getElementById('public-ranking-page-title-actions');
    var html = '';
    html += '<span class="list-page-admin-bar">';
    if (state.saveIndicatorVisible) {
      html += '<span id="public-ranking-save-status" class="list-admin-save-status" aria-live="polite">';
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
      html += '<button type="button" data-ranking-action="revert" title="' + escapeHtml(revertTitle) + '"' + (canRevert ? '' : ' disabled aria-disabled="true"') + '>Revert</button>';
    }
    if (showPublish) {
      html += '<button type="button" data-ranking-action="publish" class="list-admin-primary-btn">Publish to Nostr...</button>';
    }
    html += '<button type="button" data-ranking-action="toggle-edit" class="list-admin-primary-btn">' + (state.editMode ? 'Done' : 'Edit') + '</button>';
    html += '</span>';
    if (actionsHost) {
      actionsHost.innerHTML = html;
    }
    els.admin.hidden = true;
    els.admin.innerHTML = '';
    setSaveStatus(state.saveStatus, state.saveError);
  }

  function buildGraph() {
    var payloadState = (state.payload && state.payload.state) ? state.payload.state : {};
    var nodes = Array.isArray(payloadState.nodes) ? payloadState.nodes.slice() : [];
    var edges = Array.isArray(payloadState.edges) ? payloadState.edges.slice() : [];
    var rootCoord = String(payloadState.root_coord || '');
    var nodeMap = {};
    nodes.forEach(function (node) {
      var coord = String(node && node.coordinate || '').trim();
      if (!coord) {
        return;
      }
      nodeMap[coord] = node;
    });

    var children = {};
    function addEdge(parent, child) {
      var p = String(parent || '').trim();
      var c = String(child || '').trim();
      if (!p || !c || !nodeMap[c]) {
        return;
      }
      if (!children[p]) {
        children[p] = [];
      }
      if (children[p].indexOf(c) === -1) {
        children[p].push(c);
      }
    }

    edges.forEach(function (edge) {
      if (!edge || typeof edge !== 'object') {
        return;
      }
      addEdge(edge.parent, edge.child);
    });
    nodes.forEach(function (node) {
      if (!node || typeof node !== 'object') {
        return;
      }
      if (node.parent) {
        addEdge(node.parent, node.coordinate);
      }
    });

    return {
      rootCoord: rootCoord,
      nodeMap: nodeMap,
      children: children,
      nodes: nodes
    };
  }

  function metricValue(node, metric) {
    if (!node || !node.metrics) {
      return 0;
    }
    if (metric === 'support') {
      return Number(node.metrics.support || 0);
    }
    if (metric === 'enthusiasm') {
      return Number(node.metrics.enthusiasm || 0);
    }
    if (metric === 'intensity') {
      return Number(node.metrics.intensity || 0);
    }
    return Number(node.metrics.momentum || 0);
  }

  function compareNodes(a, b, metric) {
    var pa = metricValue(a, metric);
    var pb = metricValue(b, metric);
    if (pb !== pa) {
      return pb - pa;
    }
    var sa = Number(a && a.metrics ? a.metrics.support || 0 : 0);
    var sb = Number(b && b.metrics ? b.metrics.support || 0 : 0);
    if (sb !== sa) {
      return sb - sa;
    }
    var ea = Number(a && a.metrics ? a.metrics.enthusiasm || 0 : 0);
    var eb = Number(b && b.metrics ? b.metrics.enthusiasm || 0 : 0);
    if (eb !== ea) {
      return eb - ea;
    }
    var ca = Number(a && a.created_at || 0);
    var cb = Number(b && b.created_at || 0);
    if (cb !== ca) {
      return cb - ca;
    }
    var coordA = String(a && a.coordinate || '');
    var coordB = String(b && b.coordinate || '');
    return coordA < coordB ? -1 : (coordA > coordB ? 1 : 0);
  }

  function visibleRootChildren(graph, metric) {
    var nodes = (graph.children[graph.rootCoord] || []).map(function (coord) {
      return graph.nodeMap[coord] || null;
    }).filter(Boolean);
    if (!isAdmin()) {
      nodes = nodes.filter(function (node) {
        return String(node && node.status || 'approved').toLowerCase() === 'approved';
      });
    }
    nodes.sort(function (a, b) {
      return compareNodes(a, b, metric);
    });
    return nodes;
  }

  function hasVisibleMainContent(renderState) {
    if (String(renderState.content || '').trim()) {
      return true;
    }
    if (String(renderState.extras_after || '').trim()) {
      return true;
    }
    var graph = buildGraph();
    var metric = normalizeMetric(state.currentMetric || renderState.default_metric);
    return visibleRootChildren(graph, metric).length > 0;
  }

  function canSubmitByMode(mode) {
    if (isAdmin()) {
      return true;
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      return false;
    }
    return normalizeSubmissionMode(mode) !== 'owner_only';
  }

  function voteWindowFor(coord) {
    var payloadState = (state.payload && state.payload.state) ? state.payload.state : {};
    var map = payloadState.viewer_vote_window || {};
    if (!coord || typeof map !== 'object' || !map[coord]) {
      return null;
    }
    return map[coord];
  }

  function formatMetric(value, metric) {
    var num = Number(value || 0);
    if (!isFinite(num)) {
      num = 0;
    }
    if (metric === 'momentum' || metric === 'intensity') {
      return num.toFixed(3);
    }
    return String(Math.round(num));
  }

  function metricLabel(metric) {
    if (metric === 'support') {
      return 'Support';
    }
    if (metric === 'enthusiasm') {
      return 'Enthusiasm';
    }
    if (metric === 'intensity') {
      return 'Intensity';
    }
    return 'Momentum';
  }

  function renderExtraContent(text, format, role) {
    var value = String(text || '');
    if (!value.trim()) {
      return '';
    }
    var html = String(format || '').toLowerCase() === 'html' ? value : markdownBlock(value);
    return '<section class="nostr-page-extra nostr-page-extra-' + escapeHtml(role || '') + '">' + html + '</section>';
  }

  function renderPrefixEditor(renderState) {
    if (!isAdmin() || !state.editMode) {
      return '';
    }
    var html = '';
    html += '<section class="nostr-page-extras-editor" aria-label="Page extras">';
    html += '<h3 class="nostr-page-extras-heading">Before content</h3>';
    html += '<label class="nostr-page-extra-edit">';
    html += '<span>Before content (Markdown) <span class="nostr-page-scope-pill is-nostr">Nostr</span></span>';
    html += '<textarea data-ranking-intro="true" rows="4" placeholder="Optional content shown before the main content section">' + escapeHtml(renderState.content || '') + '</textarea>';
    html += '</label>';
    html += '</section>';
    return html;
  }

  function renderPostfixEditor(renderState) {
    if (!isAdmin() || !state.editMode) {
      return '';
    }
    var html = '';
    html += '<section class="nostr-page-extras-editor" aria-label="Page extras">';
    html += '<h3 class="nostr-page-extras-heading">After content</h3>';
    html += '<label class="nostr-page-extra-edit">';
    html += '<span>After content <span class="nostr-page-scope-pill is-local">Local</span></span>';
    html += '<span class="nostr-page-extra-controls">';
    html += '<select data-ranking-outro-format="after">';
    html += '<option value="markdown"' + (String(renderState.extras_after_format || '').toLowerCase() === 'markdown' ? ' selected' : '') + '>Markdown</option>';
    html += '<option value="html"' + (String(renderState.extras_after_format || '').toLowerCase() === 'html' ? ' selected' : '') + '>HTML</option>';
    html += '</select>';
    html += '</span>';
    html += '<textarea data-ranking-outro="after" rows="4" placeholder="Optional local content shown after the main content section">' + escapeHtml(renderState.extras_after || '') + '</textarea>';
    html += '</label>';
    html += '</section>';
    return html;
  }

  function renderPendingToast(nodes) {
    if (!isAdmin() || !state.editMode) {
      return '';
    }
    var pending = (nodes || []).filter(function (node) {
      return String(node && node.status || '').toLowerCase() === 'pending';
    });
    if (!pending.length) {
      return '';
    }
    var html = '';
    html += '<details class="public-ranking-moderation-toast" open>';
    html += '<summary>' + escapeHtml(String(pending.length)) + ' pending moderation action' + (pending.length === 1 ? '' : 's') + '</summary>';
    html += '<div class="public-ranking-pending-list">';
    pending.forEach(function (node) {
      var coord = String(node.coordinate || '');
      html += '<article class="public-ranking-pending-item" data-pending-node="' + escapeHtml(coord) + '">';
      html += '<header><strong>' + escapeHtml(String(node.title || node.coordinate || 'Untitled')) + '</strong><code>' + escapeHtml(coord) + '</code></header>';
      html += '<label><span>Title</span><input type="text" data-pending-field="title" value="' + escapeHtml(String(node.title || '')) + '"></label>';
      html += '<label><span>Summary</span><input type="text" data-pending-field="summary" value="' + escapeHtml(String(node.summary || '')) + '"></label>';
      html += '<label><span>Content</span><textarea rows="3" data-pending-field="content">' + escapeHtml(String(node.content || '')) + '</textarea></label>';
      html += '<div class="public-ranking-pending-actions">';
      html += '<button type="button" data-pending-action="approve" data-node-coord="' + escapeHtml(coord) + '">Approve</button>';
      html += '<button type="button" data-pending-action="reject" data-node-coord="' + escapeHtml(coord) + '" class="public-ranking-danger">Reject</button>';
      html += '</div>';
      html += '</article>';
    });
    html += '</div>';
    html += '</details>';
    return html;
  }

  function renderSubmitForm(renderState, graph) {
    if (isAdmin() && state.editMode) {
      return '';
    }
    if (!canSubmitByMode(renderState.submission_mode)) {
      return '';
    }
    var groups = Object.keys(graph.nodeMap).map(function (coord) {
      return graph.nodeMap[coord];
    }).filter(function (node) {
      return String(node.node_kind || '') === 'group' && (isAdmin() || String(node.status || '') === 'approved');
    });
    groups.sort(function (a, b) {
      return compareNodes(a, b, normalizeMetric(state.currentMetric || renderState.default_metric));
    });

    var open = !!state.submitComposerOpen;
    var html = '';
    html += '<section class="public-ranking-submit">';
    html += '<div class="public-ranking-submit-toolbar">';
    html += '<div class="public-ranking-submit-toolbar-right">';
    html += '<button type="button" class="unobtrusive-icon-button public-ranking-submit-toggle" data-ranking-action="toggle-submit" aria-expanded="' + (open ? 'true' : 'false') + '" title="' + escapeHtml(open ? 'Close add entry' : 'Add entry') + '">' + (open ? '-' : '+') + '</button>';
    html += '</div>';
    html += '</div>';
    if (open) {
      html += '<div class="public-ranking-submit-inline">';
      if (isAdmin()) {
        html += '<select id="public-ranking-submit-type" aria-label="Entry type"><option value="entry">Entry</option><option value="group">Group</option></select>';
      }
      html += '<select id="public-ranking-submit-parent" aria-label="Parent">';
      html += '<option value="' + escapeHtml(graph.rootCoord || '') + '">Root</option>';
      groups.forEach(function (group) {
        html += '<option value="' + escapeHtml(group.coordinate || '') + '">' + escapeHtml(String(group.title || group.coordinate || 'Group')) + '</option>';
      });
      html += '</select>';
      html += '<input type="text" id="public-ranking-submit-title" placeholder="Entry title">';
      html += '<button type="button" data-ranking-action="submit-node" class="list-admin-primary-btn public-ranking-submit-add">Add</button>';
      html += '<button type="button" data-ranking-action="cancel-submit" class="public-ranking-submit-cancel">Cancel</button>';
      html += '</div>';
      html += '<details class="public-ranking-submit-more">';
      html += '<summary>More fields</summary>';
      html += '<div class="public-ranking-submit-grid">';
      html += '<label><span>Summary</span><input type="text" id="public-ranking-submit-summary" placeholder="Optional summary"></label>';
      html += '<label><span>External URL</span><input type="url" id="public-ranking-submit-url" placeholder="https://..."></label>';
      html += '<label class="public-ranking-submit-wide"><span>Nostr post coordinate</span><input type="text" id="public-ranking-submit-post" placeholder="30023:pubkey:d"></label>';
      html += '<label class="public-ranking-submit-wide"><span>Body</span><textarea id="public-ranking-submit-content" rows="4" placeholder="Optional body"></textarea></label>';
      html += '</div>';
      html += '</details>';
    }
    html += '</section>';
    return html;
  }

  function renderNode(node, graph, depth, path) {
    var coord = String(node && node.coordinate || '');
    if (!coord) {
      return '';
    }
    var currentPath = Array.isArray(path) ? path : [];
    if (currentPath.indexOf(coord) !== -1) {
      return '';
    }
    var status = String(node.status || 'approved').toLowerCase();
    if (!isAdmin() && status !== 'approved') {
      return '';
    }

    var metric = normalizeMetric(state.currentMetric || ((state.payload && state.payload.state && state.payload.state.metric) || 'momentum'));
    var kids = (graph.children[coord] || []).map(function (childCoord) {
      return graph.nodeMap[childCoord] || null;
    }).filter(Boolean);
    kids.sort(function (a, b) {
      return compareNodes(a, b, metric);
    });

    var voteWindow = voteWindowFor(coord);
    var auth = authPayload();
    var canAuthVote = !!(auth.session_token && auth.csrf_token);
    var canVoteNow = !voteWindow || voteWindow.can_vote_now !== false;
    var voteDisabled = (!canAuthVote || !canVoteNow) ? ' disabled aria-disabled="true"' : '';

    var html = '';
    html += '<li class="public-ranking-item depth-' + String(depth) + '">';
    html += '<article class="public-ranking-node" data-node-coord="' + escapeHtml(coord) + '">';
    html += '<header class="public-ranking-node-head">';
    html += '<div class="public-ranking-node-title-wrap">';
    html += '<h4 class="public-ranking-node-title">' + escapeHtml(String(node.title || node.coordinate || 'Untitled')) + '</h4>';
    if (isAdmin() && status !== 'approved') {
      html += '<span class="public-ranking-status status-' + escapeHtml(status) + '">' + escapeHtml(status) + '</span>';
    }
    html += '</div>';
    html += '<div class="public-ranking-node-actions">';
    html += '<button type="button" data-ranking-action="vote" data-node-coord="' + escapeHtml(coord) + '" title="Upvote"' + voteDisabled + '>+</button>';
    html += '</div>';
    html += '</header>';

    html += '<dl class="public-ranking-metrics">';
    html += '<div><dt>' + escapeHtml(metricLabel(metric)) + '</dt><dd>' + escapeHtml(formatMetric(metricValue(node, metric), metric)) + '</dd></div>';
    html += '<div><dt>Support</dt><dd>' + escapeHtml(formatMetric(node.metrics && node.metrics.support, 'support')) + '</dd></div>';
    html += '<div><dt>Enthusiasm</dt><dd>' + escapeHtml(formatMetric(node.metrics && node.metrics.enthusiasm, 'enthusiasm')) + '</dd></div>';
    html += '<div><dt>Intensity</dt><dd>' + escapeHtml(formatMetric(node.metrics && node.metrics.intensity, 'intensity')) + '</dd></div>';
    html += '</dl>';

    if (node.summary) {
      html += '<p class="public-ranking-node-summary">' + markdownInline(node.summary) + '</p>';
    }
    if (node.content) {
      html += '<div class="public-ranking-node-content">' + markdownBlock(node.content) + '</div>';
    }
    if (node.url || node.post_ref) {
      html += '<p class="public-ranking-node-links">';
      if (node.url) {
        html += '<a href="' + escapeHtml(String(node.url || '')) + '" target="_blank" rel="noopener noreferrer">External link</a>';
      }
      if (node.post_ref) {
        var link = String(node.url || '');
        if (link) {
          html += ' • ';
        }
        if (link) {
          html += '<a href="' + escapeHtml(link) + '">Nostr post</a>';
        } else {
          html += '<code>' + escapeHtml(String(node.post_ref || '')) + '</code>';
        }
      }
      html += '</p>';
    }

    if (voteWindow && voteWindow.can_vote_now === false && canAuthVote) {
      html += '<p class="public-ranking-vote-note">Next vote after epoch: <code>' + escapeHtml(String(voteWindow.next_vote_at || 0)) + '</code></p>';
    }

    html += '</article>';

    if (kids.length) {
      html += '<ol class="public-ranking-level">';
      kids.forEach(function (child) {
        html += renderNode(child, graph, depth + 1, currentPath.concat([coord]));
      });
      html += '</ol>';
    }
    html += '</li>';
    return html;
  }

  function renderTree(graph, renderState) {
    var metric = normalizeMetric(state.currentMetric || renderState.default_metric);
    var rootChildren = visibleRootChildren(graph, metric);

    if (!rootChildren.length) {
      return '<p class="list-page-empty-state">No content yet.</p>';
    }

    var html = '';
    html += '<ol class="public-ranking-level depth-0">';
    rootChildren.forEach(function (node) {
      html += renderNode(node, graph, 0, []);
    });
    html += '</ol>';
    return html;
  }

  function renderEditor(renderState) {
    if (!isAdmin() || !state.editMode) {
      return '';
    }
    var blacklistText = (renderState.blacklist_pubkeys || []).join('\n');
    var html = '';
    html += '<section class="public-ranking-editor">';
    html += '<h3>Ranking Settings</h3>';
    html += '<div class="public-ranking-editor-grid">';
    html += '<label><span>Vote cooldown (seconds)</span><input type="number" id="public-ranking-edit-cooldown" min="60" step="60" value="' + escapeHtml(String(renderState.vote_cooldown_seconds || 86400)) + '"></label>';
    html += '<label><span>Allow signed-in Nostr users to add entries</span><input type="checkbox" id="public-ranking-edit-allow-open"' + (normalizeSubmissionMode(renderState.submission_mode) === 'open' ? ' checked' : '') + '></label>';
    html += '<label><span>Default metric</span><select id="public-ranking-edit-default-metric">';
    html += '<option value="momentum"' + (normalizeMetric(renderState.default_metric) === 'momentum' ? ' selected' : '') + '>momentum</option>';
    html += '<option value="support"' + (normalizeMetric(renderState.default_metric) === 'support' ? ' selected' : '') + '>support</option>';
    html += '<option value="enthusiasm"' + (normalizeMetric(renderState.default_metric) === 'enthusiasm' ? ' selected' : '') + '>enthusiasm</option>';
    html += '<option value="intensity"' + (normalizeMetric(renderState.default_metric) === 'intensity' ? ' selected' : '') + '>intensity</option>';
    html += '</select></label>';
    html += '<label class="public-ranking-editor-wide"><span>Blacklist pubkeys (one per line)</span><textarea id="public-ranking-edit-blacklist" rows="4" placeholder="hex pubkey">' + escapeHtml(blacklistText) + '</textarea></label>';
    html += '</div>';
    html += '</section>';
    return html;
  }

  function renderContent() {
    if (!els.content) {
      return;
    }
    var renderState = getRenderState();
    var graph = buildGraph();
    var nodes = graph.nodes || [];

    var html = '';
    html += renderEditor(renderState);
    if (isAdmin() && state.editMode) {
      html += renderPrefixEditor(renderState);
    } else {
      html += renderExtraContent(renderState.content, 'markdown', 'before');
    }
    html += renderPendingToast(nodes);
    html += renderTree(graph, renderState);
    html += renderSubmitForm(renderState, graph);
    if (isAdmin() && state.editMode) {
      html += renderPostfixEditor(renderState);
    } else {
      html += renderExtraContent(renderState.extras_after, renderState.extras_after_format, 'after');
    }

    els.content.innerHTML = html;
  }

  function renderAll() {
    renderHead();
    renderAdmin();
    renderValidation();
    renderContent();
    markInitialContentPainted();
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

  function maybeSetMetricFromPayload() {
    var payloadState = (state.payload && state.payload.state) ? state.payload.state : {};
    var metric = normalizeMetric(payloadState.metric || payloadState.default_metric || state.currentMetric || 'momentum');
    state.currentMetric = metric;
  }

  function refreshPayloadStateFromResponse(data) {
    if (!data || typeof data !== 'object') {
      return;
    }
    if (data.state && typeof data.state === 'object') {
      state.payload.state = data.state;
    }
    if (data.validation && typeof data.validation === 'object') {
      state.payload.validation = data.validation;
    }
    if (typeof data.canonical_exists !== 'undefined') {
      state.payload.canonical_exists = !!data.canonical_exists;
    }
    if (typeof data.draft_exists !== 'undefined') {
      state.payload.draft_exists = !!data.draft_exists;
    }
    if (typeof data.draft_differs !== 'undefined') {
      state.payload.draft_differs = !!data.draft_differs;
    }
  }

  async function persistDraft(options) {
    if (!isAdmin()) {
      return false;
    }
    if (state.busy) {
      return false;
    }
    state.busy = true;
    var opts = options || {};
    setSaveStatus('saving');
    try {
      var auth = authPayload();
      var data = await apiPost('/cgi/blog-save-nostr-page-draft', {
        page_slug: slug,
        state_json: draftPayloadJson(),
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      refreshPayloadStateFromResponse(data);
      state.draft = normalizeDraftState(data.state || state.draft || {});
      setSaveStatus('saved');
      renderAll();
      return true;
    } catch (err) {
      setSaveStatus('error', err && err.message ? err.message : 'Could not save draft');
      if (opts.alertOnError !== false) {
        window.alert(err && err.message ? err.message : 'Could not save draft');
      }
      return false;
    } finally {
      state.busy = false;
    }
  }

  async function publishDraft() {
    if (!isAdmin() || state.busy) {
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
    setSaveStatus('saved');
    await load();
  }

  async function revertDraft() {
    if (!isAdmin() || state.busy) {
      return;
    }
    if (!window.confirm('Discard local draft changes and restore canonical Nostr version?')) {
      return;
    }
    state.busy = true;
    setSaveStatus('saving');
    try {
      var auth = authPayload();
      var data = await apiPost('/cgi/blog-revert-nostr-page-draft', {
        page_slug: slug,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      refreshPayloadStateFromResponse(data);
      state.draft = normalizeDraftState(data.state || state.payload.state || {});
      maybeSetMetricFromPayload();
      setSaveStatus('saved');
      renderAll();
    } catch (err) {
      setSaveStatus('error', err && err.message ? err.message : 'Could not revert draft');
      window.alert(err && err.message ? err.message : 'Could not revert draft');
    } finally {
      state.busy = false;
    }
  }

  function parseSignedEvent(raw) {
    if (!raw) {
      return null;
    }
    if (typeof raw === 'object') {
      return raw;
    }
    try {
      return JSON.parse(String(raw));
    } catch (_err) {
      return null;
    }
  }

  async function signVoteEvent(targetCoord) {
    if (!window.nostr || typeof window.nostr.signEvent !== 'function') {
      throw new Error('No browser Nostr signer detected (NIP-07).');
    }
    var draftEvent = {
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['a', String(targetCoord || '')]
      ],
      content: '+'
    };
    var signed = await window.nostr.signEvent(draftEvent);
    var eventObj = parseSignedEvent(signed);
    if (!eventObj || typeof eventObj !== 'object') {
      throw new Error('Signer returned an invalid event payload.');
    }
    return eventObj;
  }

  async function voteNode(targetCoord) {
    var coord = String(targetCoord || '').trim();
    if (!coord) {
      return;
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      window.alert('Sign in first to vote.');
      return;
    }
    var windowInfo = voteWindowFor(coord);
    if (windowInfo && windowInfo.can_vote_now === false) {
      window.alert('Vote cooldown is active for this entry.');
      return;
    }
    try {
      var signedEvent = await signVoteEvent(coord);
      var data = await apiPost('/cgi/blog-submit-public-ranking-vote', {
        page_slug: slug,
        target_coord: coord,
        event_json: JSON.stringify(signedEvent),
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      refreshPayloadStateFromResponse({ state: data.ranking, validation: state.payload.validation });
      maybeSetMetricFromPayload();
      renderAll();
    } catch (err) {
      var message = err && err.message ? err.message : 'Could not submit vote';
      if (err && err.code === 'vote_cooldown') {
        message = 'Vote cooldown is active for this entry.';
      }
      window.alert(message);
    }
  }

  function readSubmissionPayload() {
    var type = document.getElementById('public-ranking-submit-type');
    var parent = document.getElementById('public-ranking-submit-parent');
    var title = document.getElementById('public-ranking-submit-title');
    var summary = document.getElementById('public-ranking-submit-summary');
    var url = document.getElementById('public-ranking-submit-url');
    var post = document.getElementById('public-ranking-submit-post');
    var content = document.getElementById('public-ranking-submit-content');
    return {
      node_kind: type ? String(type.value || 'entry') : 'entry',
      parent_coord: parent ? String(parent.value || '') : '',
      title: title ? String(title.value || '') : '',
      summary: summary ? String(summary.value || '') : '',
      url: url ? String(url.value || '') : '',
      post_coord: post ? String(post.value || '') : '',
      content: content ? String(content.value || '') : ''
    };
  }

  async function submitNode() {
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      window.alert('Sign in first to submit entries.');
      return;
    }
    var payload = readSubmissionPayload();
    try {
      var data = await apiPostFirstAvailable([
        '/cgi/blog-submit-public-ranking-node',
        '/cgi/blog-submit-public-ranking'
      ], {
        page_slug: slug,
        node_kind: payload.node_kind,
        parent_coord: payload.parent_coord,
        title: payload.title,
        summary: payload.summary,
        url: payload.url,
        post_coord: payload.post_coord,
        content: payload.content,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      state.submitComposerOpen = false;
      refreshPayloadStateFromResponse({ state: data.ranking, validation: state.payload.validation });
      maybeSetMetricFromPayload();
      renderAll();
    } catch (err) {
      window.alert(err && err.message ? err.message : 'Could not submit entry');
    }
  }

  function pendingFieldValue(container, field) {
    if (!(container instanceof HTMLElement)) {
      return '';
    }
    var node = container.querySelector('[data-pending-field="' + field + '"]');
    if (!node) {
      return '';
    }
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      return String(node.value || '');
    }
    return '';
  }

  async function moderateNode(action, nodeCoord, container) {
    if (!isAdmin()) {
      return;
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      window.alert('Sign in first.');
      return;
    }
    try {
      var data = await apiPost('/cgi/blog-moderate-public-ranking-node', {
        page_slug: slug,
        action: action,
        node_coord: String(nodeCoord || ''),
        title: pendingFieldValue(container, 'title'),
        summary: pendingFieldValue(container, 'summary'),
        content: pendingFieldValue(container, 'content'),
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      refreshPayloadStateFromResponse({ state: data.ranking, validation: state.payload.validation });
      maybeSetMetricFromPayload();
      renderAll();
    } catch (err) {
      window.alert(err && err.message ? err.message : 'Moderation action failed');
    }
  }

  function bindEvents() {
    root.addEventListener('input', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement) || !isAdmin()) {
        return;
      }
      if (target instanceof HTMLInputElement && target.hasAttribute('data-page-nav-title-input') && state.editMode) {
        state.navTitleInput = String(target.value || '');
        return;
      }

      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        var headField = String(target.getAttribute('data-ranking-head-input') || '');
        if (headField === 'title') {
          state.draft.title = String(target.value || '');
          queueAutosave(500);
          return;
        }
        if (headField === 'description') {
          state.draft.description = String(target.value || '');
          return;
        }
      }

      if (!state.editMode) {
        return;
      }

      if (target instanceof HTMLTextAreaElement) {
        if (target.hasAttribute('data-ranking-intro')) {
          state.draft.content = String(target.value || '');
          queueAutosave(500);
          return;
        }
        var outroField = String(target.getAttribute('data-ranking-outro') || '');
        if (outroField === 'after') {
          state.draft.extras_after = String(target.value || '');
          queueAutosave(500);
          return;
        }
      }

      if (target.id && target.id.indexOf('public-ranking-edit-') === 0) {
        syncDraftFromEditor();
        queueAutosave(500);
      }
    });

    root.addEventListener('keydown', function (event) {
      var target = event.target;
      if (target instanceof HTMLInputElement && target.hasAttribute('data-page-nav-title-input')) {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveNavbarTitle();
          return;
        }
      }
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || !isAdmin()) {
        return;
      }
      var headField = String(target.getAttribute('data-ranking-head-input') || '');
      if (!headField) {
        return;
      }
      if (event.key === 'Enter') {
        if (headField === 'description' && target instanceof HTMLTextAreaElement) {
          return;
        }
        event.preventDefault();
        if (headField === 'description') {
          persistDraft({ alertOnError: true }).then(function (ok) {
            if (ok !== false) {
              state.activeHeadField = '';
              renderAll();
            }
          });
          return;
        }
        state.activeHeadField = '';
        renderAll();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        state.activeHeadField = '';
        renderAll();
      }
    });

    root.addEventListener('focusout', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLInputElement) || !isAdmin()) {
        return;
      }
      var headField = String(target.getAttribute('data-ranking-head-input') || '');
      if (headField !== 'title') {
        return;
      }
      setTimeout(function () {
        if (!document.activeElement || !document.activeElement.hasAttribute || !document.activeElement.hasAttribute('data-ranking-head-input')) {
          state.activeHeadField = '';
          renderAll();
        }
      }, 0);
    });

    root.addEventListener('change', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.matches('[data-ranking-sort="metric"]') && target instanceof HTMLSelectElement) {
        state.currentMetric = normalizeMetric(target.value);
        renderContent();
        return;
      }
      if (target instanceof HTMLSelectElement) {
        var outroFormatField = String(target.getAttribute('data-ranking-outro-format') || '');
        if (outroFormatField === 'after' && isAdmin() && state.editMode) {
          state.draft.extras_after_format = String(target.value || '').toLowerCase() === 'html' ? 'html' : 'markdown';
          renderContent();
          queueAutosave(500);
          return;
        }
      }
      if (isAdmin() && state.editMode && target.id && target.id.indexOf('public-ranking-edit-') === 0) {
        syncDraftFromEditor();
        queueAutosave(500);
      }
    });

    root.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      var navTitleActionNode = target.closest('[data-page-nav-title-action]');
      if (navTitleActionNode instanceof HTMLElement && isAdmin() && state.editMode) {
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

      var headEdit = target.closest('[data-ranking-head-edit]');
      if (headEdit instanceof HTMLElement && isAdmin() && state.editMode) {
        var field = String(headEdit.getAttribute('data-ranking-head-edit') || '');
        if (field === 'title' || field === 'description') {
          state.activeHeadField = field;
          renderAll();
          return;
        }
      }

      var headSave = target.closest('[data-ranking-head-save]');
      if (headSave instanceof HTMLElement && isAdmin()) {
        var saveField = String(headSave.getAttribute('data-ranking-head-save') || '');
        if (saveField === 'description') {
          persistDraft({ alertOnError: true }).then(function (ok) {
            if (ok !== false) {
              state.activeHeadField = '';
              renderAll();
            }
          });
          return;
        }
      }

      var actionNode = target.closest('[data-ranking-action]');
      if (actionNode instanceof HTMLElement) {
        var action = String(actionNode.getAttribute('data-ranking-action') || '');
        if (action === 'toggle-submit') {
          state.submitComposerOpen = !state.submitComposerOpen;
          renderContent();
          if (state.submitComposerOpen) {
            requestAnimationFrame(function () {
              var titleInput = document.getElementById('public-ranking-submit-title');
              if (titleInput && typeof titleInput.focus === 'function') {
                titleInput.focus();
              }
            });
          }
          return;
        }
        if (action === 'cancel-submit') {
          state.submitComposerOpen = false;
          renderContent();
          return;
        }
        if (action === 'toggle-edit') {
          if (state.editMode) {
            state.activeHeadField = '';
          }
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
        if (action === 'submit-node') {
          submitNode();
          return;
        }
        if (action === 'vote') {
          voteNode(actionNode.getAttribute('data-node-coord') || '');
          return;
        }
      }

      var pendingAction = target.closest('[data-pending-action]');
      if (pendingAction instanceof HTMLElement) {
        var pendingType = String(pendingAction.getAttribute('data-pending-action') || '');
        var nodeCoord = String(pendingAction.getAttribute('data-node-coord') || '');
        if (!nodeCoord || (pendingType !== 'approve' && pendingType !== 'reject')) {
          return;
        }
        var container = pendingAction.closest('[data-pending-node]');
        moderateNode(pendingType, nodeCoord, container instanceof HTMLElement ? container : null);
      }
    });
  }

  async function load() {
    try {
      var auth = authPayload();
      var payload = await apiPost('/cgi/blog-get-nostr-page', {
        page_slug: slug,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      if (!payload || String(payload.page_type || '').toLowerCase() !== 'public-ranking') {
        throw new Error('Unexpected page payload for public ranking page');
      }
      writeBootstrapCache(payload);
      state.payload = payload;
      state.draft = normalizeDraftState(payload.state || {});
      state.navTitle = String(payload.nav_title || '').trim();
      state.navTitleEditing = false;
      state.navTitleInput = '';
      state.navTitleBusy = false;
      state.currentMetric = normalizeMetric((payload.state && (payload.state.metric || payload.state.default_metric)) || state.draft.default_metric || 'momentum');
      state.activeHeadField = '';
      state.submitComposerOpen = false;
      state.saveIndicatorVisible = false;
      setSaveStatus('saved');
      renderAll();
    } catch (err) {
      if (els.content) {
        els.content.innerHTML = '<p class="placeholder">Error: ' + escapeHtml(err && err.message ? err.message : 'Could not load public ranking page') + '</p>';
      }
    } finally {
      markHydrationPageReady();
      markInitialContentPainted();
    }
  }

  bindEvents();
  window.addEventListener('blog-auth-changed', load);
  renderFromBootstrapCache();
  load();
})();
