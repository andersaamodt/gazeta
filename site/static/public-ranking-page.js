(function () {
  'use strict';

  var root = document.getElementById('public-ranking-root');
  if (!root) {
    return;
  }

  window.__wizardryRemoveLegacyTitleBlock(root);

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
    settingsPanelReveal: false,
    activeHeadField: '',
    navTitle: '',
    navTitleEditing: false,
    navTitleInput: '',
    navTitleBusy: false,
    submitComposerOpen: false,
    submitAdvancedOpen: false,
    busy: false,
    saveTimer: null,
    saveStatus: 'saved',
    saveError: '',
    saveIndicatorVisible: false,
    currentMetric: 'momentum',
    initialContentPainted: false
  };
  var BOOTSTRAP_CACHE_MAX_AGE_MS = 15000;
  var markedUpgradeState = { timer: 0, attempts: 0 };

  function isExpectedPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    var payloadSlug = String(payload.slug || '').trim();
    var payloadType = String(payload.page_type || '').trim().toLowerCase();
    return payloadSlug === slug && payloadType === 'public-ranking';
  }

  function applyBootstrapState(optimisticPayload, payload) {
    state.payload = optimisticPayload;
    state.draft = normalizeDraftState((payload && payload.state) || {});
    state.navTitle = String((payload && payload.nav_title) || '').trim();
    state.navTitleEditing = false;
    state.navTitleInput = '';
    state.navTitleBusy = false;
    state.currentMetric = normalizeMetric((payload.state && (payload.state.metric || payload.state.default_metric)) || state.draft.default_metric || 'momentum');
    state.activeHeadField = '';
    state.submitComposerOpen = false;
    state.submitAdvancedOpen = false;
    state.saveIndicatorVisible = false;
    setSaveStatus('saved');
  }

  function renderBootstrapPayload(payload) {
    return window.__wizardryRenderManagedNostrPageBootstrapPayload(payload, {
      rootNode: root,
      contentNode: els.content,
      isExpectedPayload: isExpectedPayload,
      applyState: applyBootstrapState,
      canAdoptStaticPrerender: function (optimisticPayload) {
        return window.__wizardryCanUsePayloadPrerenderReadOnly(optimisticPayload, {
          allowAuthenticatedField: 'viewer_can_submit',
          allowAdminField: 'viewer_can_submit'
        });
      },
      renderHead: renderHead,
      renderAdmin: renderAdmin,
      renderValidation: renderValidation,
      renderAll: renderAll,
      markInitialContentPainted: function () {
        window.__wizardryNotifyInitialContentPainted(slug, {
          state: state,
          markPageReady: true
        });
      }
    });
  }

  function isAdmin() {
    return !!(state.payload && state.payload.is_admin && state.draft);
  }

  function canUsePrerenderReadOnlyView(renderState) {
    return window.__wizardryCanUsePayloadPrerenderReadOnly(state.payload, {
      allowAuthenticatedField: 'viewer_can_submit',
      allowAdminField: 'viewer_can_submit',
      extraCheck: function () {
        if (state.submitComposerOpen || state.submitAdvancedOpen) {
          return false;
        }
        var payloadState = (state.payload && state.payload.state) ? state.payload.state : {};
        var defaultMetric = normalizeMetric(payloadState.metric || payloadState.default_metric || (renderState && renderState.default_metric) || 'momentum');
        return normalizeMetric(state.currentMetric || defaultMetric) === defaultMetric;
      }
    });
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
    window.__wizardryScheduleMarkedUpgrade(markedUpgradeState, function () {
      renderAll();
    });
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
    window.__wizardryScheduleMarkedUpgrade(markedUpgradeState, function () {
      renderAll();
    });
    return '<p>' + escapeHtml(value).replace(/\n/g, '<br>') + '</p>';
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
      submission_mode: normalizeSubmissionMode(
        src.submission_mode
        || (((src.allow_signed_in_submissions === true) || String(src.allow_signed_in_submissions || '').toLowerCase() === 'true') ? 'open' : (slug === 'projects' ? 'open' : 'owner_only'))
      ),
      show_marker_filters: !!src.show_marker_filters,
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

  function renderNavbarTitleRow(renderState) {
    var current = currentNavbarTitle(renderState);
    window.__wizardryRenderManagedNavbarTitleRow({
      isAdmin: isAdmin(),
      editMode: state.editMode,
      titleNode: els.title || null,
      currentText: current,
      editing: !!state.navTitleEditing,
      inputValue: state.navTitleInput || current,
      saveDisabled: state.navTitleBusy
    });
  }

  var apiPost = window.__wizardryPostFormJson;

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
    var showMarkerFilters = document.getElementById('public-ranking-edit-show-marker-filters');

    var cooldownMinutes = Number(cooldown && cooldown.value ? cooldown.value : Math.ceil((Number(state.draft.vote_cooldown_seconds || 86400) || 86400) / 60));
    if (!isFinite(cooldownMinutes) || cooldownMinutes <= 0) {
      cooldownMinutes = 1;
    }
    state.draft.vote_cooldown_seconds = Math.max(60, Math.floor(cooldownMinutes * 60));
    if (allowOpen instanceof HTMLInputElement && allowOpen.type === 'checkbox') {
      state.draft.submission_mode = allowOpen.checked ? 'open' : 'owner_only';
    } else {
      state.draft.submission_mode = normalizeSubmissionMode(mode ? mode.value : state.draft.submission_mode);
    }
    state.draft.default_metric = normalizeMetric(metric ? metric.value : state.draft.default_metric);
    state.currentMetric = state.draft.default_metric;
    state.draft.show_marker_filters = !!(showMarkerFilters && showMarkerFilters.checked);
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
    var desc = String(s.description || '').trim();
    var hasMainContent = hasVisibleMainContent(s);
    window.__wizardryRenderManagedPageHead({
      isAdmin: isAdmin(),
      pageTitle: s && s.title ? String(s.title) : null,
      titleNode: els.title,
      titleText: String(s.title || 'Public Ranking'),
      titleSyncOptions: {
        messageVariant: 'local_source'
      },
      syncStatus: state.payload && state.payload.sync_status,
      descriptionNode: els.description,
      descriptionPayload: state.payload,
      allowPrerenderDescription: canUsePrerenderReadOnlyView(s),
      descriptionFallback: desc ? {
        html: markdownInline(desc),
        hidden: false
      } : {
        html: '',
        hidden: true
      },
      titleEditOptions: {
        activeField: state.activeHeadField,
        editMode: state.editMode,
        value: String(s.title || 'Public Ranking'),
        fallbackText: 'Public Ranking',
        inputId: 'public-ranking-head-title-input',
        inputAttrName: 'data-ranking-head-input',
        editAttrName: 'data-ranking-head-edit'
      },
      descriptionEditOptions: {
        activeField: state.activeHeadField,
        editMode: state.editMode,
        text: desc,
        textHtml: markdownInline(desc),
        suppressEmpty: !desc && !hasMainContent && state.activeHeadField !== 'description',
        hideWhenEmpty: hasMainContent,
        inputId: 'public-ranking-head-description-input',
        inputAttrName: 'data-ranking-head-input',
        editAttrName: 'data-ranking-head-edit',
        saveAttrName: 'data-ranking-head-save'
      },
      focusOptions: isAdmin() && state.activeHeadField ? {
        activeField: state.activeHeadField,
        titleInputId: 'public-ranking-head-title-input',
        descriptionInputId: 'public-ranking-head-description-input'
      } : null
    });
    renderNavbarTitleRow(s);
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
        nonAdminActionsHost.classList.add('public-ranking-sync-actions');
        nonAdminActionsHost.innerHTML = window.__wizardrySyncStatusPillHtml(state.payload && state.payload.sync_status, {
          messageVariant: 'local_source'
        });
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
    if (actionsHost) {
      actionsHost.classList.remove('public-ranking-sync-actions');
    }
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
    html += window.__wizardrySyncStatusPillHtml(state.payload && state.payload.sync_status, {
      messageVariant: 'local_source'
    });
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
    var auth = window.__wizardryAuthPayload();
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
      return 'Upvotes (unique voters)';
    }
    if (metric === 'enthusiasm') {
      return 'Popularity (total votes)';
    }
    if (metric === 'intensity') {
      return 'Engagement (votes/voter)';
    }
    return 'Hotness (recent-weighted)';
  }

  function renderExtraContent(text, format, role) {
    var value = window.__wizardryStripLegacyNostrSyncPills(text);
    if (!value.trim()) {
      return '';
    }
    var html = markdownBlock(value);
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
    var canShowAdvanced = true;
    var advancedOpen = canShowAdvanced && !!state.submitAdvancedOpen;
    var canConfigureHierarchy = !!(isAdmin() && state.editMode);
    var toggleLabel = open ? 'Close add entry form' : 'Add entry';
    var html = '';
    html += '<section class="public-ranking-submit' + (open ? ' is-expanded' : '') + '">';
    html += '<div class="public-ranking-submit-inline">';
    html += '<div class="public-ranking-submit-reveal" ' + (open ? '' : 'aria-hidden="true"') + '>';
    html += '<div class="public-ranking-submit-fields">';
    if (open) {
      html += '<input type="hidden" id="public-ranking-submit-parent" value="' + escapeHtml(graph.rootCoord || '') + '">';
      html += '<input type="text" id="public-ranking-submit-title" placeholder="New entry">';
      html += '<button type="button" data-ranking-action="submit-node" class="list-admin-primary-btn public-ranking-submit-add">Add</button>';
      if (canShowAdvanced) {
        html += '<button type="button" data-ranking-action="toggle-submit-advanced" class="public-ranking-submit-advanced-toggle" aria-expanded="' + (advancedOpen ? 'true' : 'false') + '">' + escapeHtml(advancedOpen ? '-Advanced' : '+Advanced') + '</button>';
      }
      html += '</div>';
      if (advancedOpen) {
        html += '<div class="public-ranking-submit-advanced">';
        if (canConfigureHierarchy) {
          html += '<div class="public-ranking-submit-grid">';
          html += '<label><span>Entry type</span><select id="public-ranking-submit-type-advanced" aria-label="Entry type"><option value="entry">Entry</option><option value="group">Group</option></select></label>';
          html += '<label><span>Parent</span><select id="public-ranking-submit-parent-advanced" aria-label="Parent">';
          html += '<option value="' + escapeHtml(graph.rootCoord || '') + '">Root</option>';
          groups.forEach(function (group) {
            html += '<option value="' + escapeHtml(group.coordinate || '') + '">' + escapeHtml(String(group.title || group.coordinate || 'Group')) + '</option>';
          });
          html += '</select></label>';
          html += '</div>';
        }
        html += '<div class="public-ranking-submit-extras">';
        html += '<details class="public-ranking-submit-more public-ranking-submit-more-compact">';
        html += '<summary>+Link</summary>';
        html += '<div class="public-ranking-submit-grid">';
        html += '<label><span>External URL</span><input type="url" id="public-ranking-submit-url" placeholder="https://..."></label>';
        html += '</div>';
        html += '</details>';
        html += '<details class="public-ranking-submit-more public-ranking-submit-more-compact">';
        html += '<summary>+Nostr post</summary>';
        html += '<div class="public-ranking-submit-grid">';
        html += '<label><span>Nostr post address</span><input type="text" id="public-ranking-submit-post" placeholder="30023:pubkey:d"></label>';
        html += '</div>';
        html += '</details>';
        html += '<details class="public-ranking-submit-more public-ranking-submit-more-compact">';
        html += '<summary>+Body</summary>';
        html += '<div class="public-ranking-submit-grid">';
        html += '<label class="public-ranking-submit-wide"><span>Body</span><textarea id="public-ranking-submit-content" rows="4" placeholder="Optional body"></textarea></label>';
        html += '</div>';
        html += '</details>';
        html += '</div>';
        html += '</div>';
      }
    }
    html += '</div>';
    html += '</div>';
    html += '<button type="button" class="public-ranking-submit-toggle" data-ranking-action="toggle-submit" aria-label="' + escapeHtml(toggleLabel) + '" title="' + escapeHtml(toggleLabel) + '" aria-expanded="' + (open ? 'true' : 'false') + '"><span class="public-ranking-submit-toggle-icon" aria-hidden="true">+</span></button>';
    html += '</div>';
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
    var auth = window.__wizardryAuthPayload();
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
    var revealSettings = !!state.settingsPanelReveal;
    state.settingsPanelReveal = false;
    var html = '';
    var cooldownMinutes = Math.max(1, Math.ceil((Number(renderState.vote_cooldown_seconds || 86400) || 86400) / 60));
    html += '<section class="public-ranking-editor nostr-page-settings-panel' + (revealSettings ? ' is-entering' : '') + '" aria-label="Page settings">';
    html += '<h3 class="nostr-page-settings-title">Page Settings</h3>';
    html += '<div class="public-ranking-editor-grid">';
    html += '<label><span>Vote cooldown (minutes)</span><input type="number" id="public-ranking-edit-cooldown" min="1" step="1" value="' + escapeHtml(String(cooldownMinutes)) + '"></label>';
    html += '<label><span>Allow signed-in Nostr users to add entries</span><input type="checkbox" id="public-ranking-edit-allow-open"' + (normalizeSubmissionMode(renderState.submission_mode) === 'open' ? ' checked' : '') + '></label>';
    html += '<label><span>Show marker-based filters</span><input type="checkbox" id="public-ranking-edit-show-marker-filters"' + (renderState.show_marker_filters ? ' checked' : '') + '></label>';
    html += '<label><span>Default metric</span><select id="public-ranking-edit-default-metric">';
    html += '<option value="momentum"' + (normalizeMetric(renderState.default_metric) === 'momentum' ? ' selected' : '') + '>Hotness (recent-weighted)</option>';
    html += '<option value="support"' + (normalizeMetric(renderState.default_metric) === 'support' ? ' selected' : '') + '>Upvotes (unique voters)</option>';
    html += '<option value="enthusiasm"' + (normalizeMetric(renderState.default_metric) === 'enthusiasm' ? ' selected' : '') + '>Popularity (total votes)</option>';
    html += '<option value="intensity"' + (normalizeMetric(renderState.default_metric) === 'intensity' ? ' selected' : '') + '>Engagement (votes/voter)</option>';
    html += '</select></label>';
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
    window.__wizardryRenderResolvedReadOnlyContent({
      targetNode: els.content,
      payload: state.payload,
      allowPrerender: canUsePrerenderReadOnlyView(renderState),
      renderFallback: function () {
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
        return html;
      }
    });
  }

  function renderAll() {
    renderHead();
    renderAdmin();
    renderValidation();
    renderContent();
    window.__wizardryNotifyInitialContentPainted(slug, {
      state: state,
      markPageReady: true
    });
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
    var auth = window.__wizardryAuthPayload();
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

  function requestedMetric() {
    var payloadState = (state.payload && state.payload.state) ? state.payload.state : {};
    return normalizeMetric(
      state.currentMetric
      || payloadState.metric
      || payloadState.default_metric
      || (state.draft && state.draft.default_metric)
      || 'momentum'
    );
  }

  function canRefreshMetricFromServer() {
    return window.__wizardryCanUseVisitorPrerenderReadOnly({
      isAdmin: isAdmin(),
      extraCheck: function () {
        return !state.submitComposerOpen && !state.submitAdvancedOpen;
      }
    });
  }

  function refreshCurrentMetricView() {
    return load({ sortMetric: requestedMetric() });
  }

  function defaultMetricForCache() {
    var payloadState = (state.payload && state.payload.state) ? state.payload.state : {};
    return normalizeMetric(
      payloadState.default_metric
      || (state.draft && state.draft.default_metric)
      || 'momentum'
    );
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
      var auth = window.__wizardryAuthPayload();
      var data = await apiPost('/cgi/blog-save-nostr-page-draft', {
        page_slug: slug,
        state_json: draftPayloadJson(),
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      window.__wizardryCommitManagedPagePayload(state.payload, data, {
        slug: slug,
        authSignature: window.__wizardrySessionAuthSignature,
        persistMode: 'authenticated_admin'
      });
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
    var hasDialog = await window.__wizardryEnsureNostrPublishDialog();
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
      var auth = window.__wizardryAuthPayload();
      var data = await apiPost('/cgi/blog-revert-nostr-page-draft', {
        page_slug: slug,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      window.__wizardryCommitManagedPagePayload(state.payload, data, {
        slug: slug,
        authSignature: window.__wizardrySessionAuthSignature,
        persistMode: 'authenticated_admin'
      });
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
    var auth = window.__wizardryAuthPayload();
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
      await apiPost('/cgi/blog-submit-public-ranking-vote', {
        page_slug: slug,
        target_coord: coord,
        event_json: JSON.stringify(signedEvent),
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      await refreshCurrentMetricView();
    } catch (err) {
      var message = err && err.message ? err.message : 'Could not submit vote';
      if (err && err.code === 'vote_cooldown') {
        message = 'Vote cooldown is active for this entry.';
      }
      window.alert(message);
    }
  }

  function readSubmissionPayload() {
    var type = document.getElementById('public-ranking-submit-type-advanced');
    var parent = document.getElementById('public-ranking-submit-parent');
    var parentAdvanced = document.getElementById('public-ranking-submit-parent-advanced');
    var title = document.getElementById('public-ranking-submit-title');
    var url = document.getElementById('public-ranking-submit-url');
    var post = document.getElementById('public-ranking-submit-post');
    var content = document.getElementById('public-ranking-submit-content');
    return {
      node_kind: type ? String(type.value || 'entry') : 'entry',
      parent_coord: parentAdvanced ? String(parentAdvanced.value || '') : (parent ? String(parent.value || '') : ''),
      title: title ? String(title.value || '') : '',
      summary: '',
      url: url ? String(url.value || '') : '',
      post_coord: post ? String(post.value || '') : '',
      content: content ? String(content.value || '') : ''
    };
  }

  async function submitNode() {
    var auth = window.__wizardryAuthPayload();
    if (!auth.session_token || !auth.csrf_token) {
      window.alert('Sign in first to submit entries.');
      return;
    }
    var payload = readSubmissionPayload();
    try {
      await apiPostFirstAvailable([
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
      state.submitAdvancedOpen = false;
      await refreshCurrentMetricView();
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
    var auth = window.__wizardryAuthPayload();
    if (!auth.session_token || !auth.csrf_token) {
      window.alert('Sign in first.');
      return;
    }
    try {
      await apiPost('/cgi/blog-moderate-public-ranking-node', {
        page_slug: slug,
        action: action,
        node_coord: String(nodeCoord || ''),
        title: pendingFieldValue(container, 'title'),
        summary: pendingFieldValue(container, 'summary'),
        content: pendingFieldValue(container, 'content'),
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      });
      await refreshCurrentMetricView();
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
        var nextMetric = normalizeMetric(target.value);
        if (nextMetric === requestedMetric()) {
          return;
        }
        state.currentMetric = nextMetric;
        if (canRefreshMetricFromServer()) {
          load({ sortMetric: nextMetric });
        } else {
          renderContent();
        }
        return;
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
          if (!state.submitComposerOpen) {
            state.submitAdvancedOpen = false;
          }
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
          state.submitAdvancedOpen = false;
          renderContent();
          return;
        }
        if (action === 'toggle-submit-advanced') {
          state.submitAdvancedOpen = !state.submitAdvancedOpen;
          renderContent();
          return;
        }
        if (action === 'toggle-edit') {
          if (state.editMode) {
            state.activeHeadField = '';
          }
          state.editMode = !state.editMode;
          if (state.editMode) {
            state.settingsPanelReveal = true;
          } else {
            state.settingsPanelReveal = false;
          }
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

    root.addEventListener('keydown', function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (!state.submitComposerOpen) {
        return;
      }
      var submitShell = target.closest('.public-ranking-submit');
      if (!(submitShell instanceof HTMLElement)) {
        return;
      }
      var key = String(event.key || '');
      if (key === 'Escape' || key === 'Esc') {
        event.preventDefault();
        state.submitComposerOpen = false;
        state.submitAdvancedOpen = false;
        renderContent();
        return;
      }
      if (key === 'Enter') {
        if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
          return;
        }
        if (target instanceof HTMLTextAreaElement) {
          return;
        }
        event.preventDefault();
        submitNode();
      }
    });
  }

  function load(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var sortMetric = normalizeMetric(opts.sortMetric || requestedMetric());
    return window.__wizardryRefreshManagedNostrPage({
      slug: slug,
      authSignature: window.__wizardrySessionAuthSignature,
      isExpectedPayload: isExpectedPayload,
      unexpectedPayloadMessage: 'Unexpected page payload for public ranking page',
      extraParams: {
        sort_metric: sortMetric
      },
      persist: sortMetric === defaultMetricForCache(),
      renderPayload: renderBootstrapPayload,
      loadFallback: {
        consoleLabel: 'Public ranking page',
        state: state,
        contentNode: els.content,
        fallbackText: 'Page content is still loading. The latest ranking data was not available yet.'
      },
      notifyInitialContentPainted: {
        state: state,
        markPageReady: true
      }
    });
  }

  bindEvents();
  window.__wizardryBindSessionAuthRefresh({
    onChange: load,
    storageKeys: ['session_token', 'csrf_token', 'last_auth_is_admin']
  });
  window.__wizardryRenderManagedNostrBootstrapSources({
    slug: slug,
    maxAgeMs: BOOTSTRAP_CACHE_MAX_AGE_MS,
    authSignature: window.__wizardrySessionAuthSignature,
    isExpectedPayload: isExpectedPayload,
    renderPayload: renderBootstrapPayload
  });
  load();
})();
