(function () {
  'use strict';

  function isPostRoute(pathname) {
    var path = String(pathname || '');
    if (/^\/posts\/[^/?#]+\/?$/.test(path)) {
      return true;
    }
    if (/^\/pages\/posts\/[^/?#]+(?:\.html?)?\/?$/.test(path)) {
      return true;
    }
    if (path === '/cgi/blog-open-post' || path.indexOf('/cgi/blog-open-post/') === 0) {
      return true;
    }
    return false;
  }

  if (isPostRoute(window.location.pathname || '')) {
    return;
  }

  var CACHE_KEY = 'wizardry_blog_posts_v2';
  var POSTS_CACHE_MAX_AGE_MS = 15000;
  var DRAFT_NOTICE_CACHE_KEY = 'wizardry_blog_draft_notice_v1';
  var DRAFT_NOTICE_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
  var root = document.getElementById('blog-page-root');
  if (!root) {
    return;
  }

  var slug = String(root.getAttribute('data-blog-slug') || 'blog').trim() || 'blog';
  var els = {
    title: document.getElementById('blog-page-title'),
    description: document.getElementById('blog-page-description'),
    admin: document.getElementById('blog-page-admin'),
    validation: document.getElementById('blog-page-validation'),
    content: document.getElementById('blog-page-content'),
    toggle: document.getElementById('blog-filter-toggle'),
    panel: document.getElementById('blog-filter-panel'),
    tags: document.getElementById('blog-filter-tags'),
    years: document.getElementById('blog-filter-years'),
    types: document.getElementById('blog-filter-types'),
    clear: document.getElementById('blog-clear-filters'),
    list: document.getElementById('blog-post-list'),
    empty: document.getElementById('blog-empty'),
    draftNotice: null,
    composeFab: null,
    composeSlot: null
  };

  var state = {
    payload: null,
    authSignature: '',
    posts: [],
    postsLoading: true,
    initialContentPainted: false,
    initialPageStateLoaded: false,
    initialPostsLoaded: false,
    renderSignature: '',
    defaultFiltersApplied: false,
    pageSettingsOpen: false,
    filters: {
      tags: new Set(),
      years: new Set(),
      types: new Set()
    },
    compose: {
      open: false,
      preview: false,
      draftId: '',
      sourcePostPath: '',
      postTypeLocked: false,
      postTypeChosen: false,
      tags: [],
      tagsOpen: false,
      tagsDraftText: '',
      postType: 'longform',
      postTypeToolbarCollapsed: false,
      postTypeToolbarCollapseTimer: null,
      publishDestination: 'local_only',
      shortformLimit: 280,
      shortformLimitEditing: false,
      linkUrl: '',
      cameraStream: null,
      cameraStarting: false,
      cameraError: '',
      cameraFullscreen: false,
      cameraReturnToChooser: false,
      audioStream: null,
      audioRecorder: null,
      audioChunks: [],
      audioStarting: false,
      audioRecording: false,
      audioError: '',
      uploading: 0,
      uploadItems: [],
      uploadSeq: 0,
      uploadCleanupTimer: null,
      pendingContentAdditions: [],
      autosaveTimer: null,
      busy: false,
      output: '',
      outputTone: '',
      saveStatus: ''
    },
    draftNotice: {
      loading: false,
      loaded: false,
      requestSeq: 0,
      drafts: []
    }
  };
  var panelHideTimer = null;
  var pageSettingsHideTimer = null;
  var composeToggleGuardUntil = 0;
  var composeDropHoverTimer = null;
  var postsCatalogReady = false;
  var COMPOSE_POST_TYPES = ['shortform', 'longform', 'capture-media', 'upload-media', 'attachment', 'audio-note', 'link-share', 'go-live'];
  var routeSelfHealTriggered = false;
  var postCardMenuBusy = false;

  function overflowMenuIconSvg() {
    return '<svg class="overflow-menu-icon-svg" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5.5" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="18.5" r="1.9" fill="currentColor"/></svg>';
  }

  function clearRouteRepairParam() {
    var url;
    try {
      url = new URL(window.location.href);
    } catch (_err) {
      return;
    }
    if (url.searchParams.get('__route_repair') !== '1') {
      return;
    }
    url.searchParams.delete('__route_repair');
    if (!window.history || typeof window.history.replaceState !== 'function') {
      return;
    }
    var next = url.pathname;
    var query = url.searchParams.toString();
    if (query) {
      next += '?' + query;
    }
    if (url.hash) {
      next += url.hash;
    }
    try {
      window.history.replaceState(null, '', next);
    } catch (_replaceErr) {
      // Ignore history replacement failures.
    }
  }

  function authSignature() {
    var auth = authPayload();
    return String(auth.session_token || '') + '|' + String(auth.csrf_token || '');
  }

  function maybeReloadForAuthChange() {
    var nextSig = authSignature();
    var lastSig = String(state.authSignature || '');
    if (nextSig === lastSig) {
      return;
    }
    state.authSignature = nextSig;
    loadPageState({ deferRender: false, deferInitialFlags: true });
  }

  function ensureComposeStateShape() {
    if (!state.compose || typeof state.compose !== 'object') {
      state.compose = {};
    }
    if (typeof state.compose.open !== 'boolean') state.compose.open = false;
    if (typeof state.compose.preview !== 'boolean') state.compose.preview = false;
    if (typeof state.compose.draftId !== 'string') state.compose.draftId = '';
    if (typeof state.compose.sourcePostPath !== 'string') state.compose.sourcePostPath = '';
    if (typeof state.compose.postTypeLocked !== 'boolean') state.compose.postTypeLocked = false;
    if (typeof state.compose.postTypeChosen !== 'boolean') state.compose.postTypeChosen = false;
    if (!Array.isArray(state.compose.tags)) state.compose.tags = [];
    if (typeof state.compose.tagsOpen !== 'boolean') state.compose.tagsOpen = false;
    if (typeof state.compose.tagsDraftText !== 'string') state.compose.tagsDraftText = '';
    if (typeof state.compose.postType !== 'string') state.compose.postType = 'longform';
    if (typeof state.compose.postTypeToolbarCollapsed !== 'boolean') state.compose.postTypeToolbarCollapsed = false;
    if (typeof state.compose.postTypeToolbarCollapseTimer === 'undefined') state.compose.postTypeToolbarCollapseTimer = null;
    if (typeof state.compose.publishDestination !== 'string') state.compose.publishDestination = 'local_only';
    if (typeof state.compose.shortformLimit !== 'number' || !isFinite(state.compose.shortformLimit)) state.compose.shortformLimit = 280;
    if (typeof state.compose.shortformLimitEditing !== 'boolean') state.compose.shortformLimitEditing = false;
    if (typeof state.compose.linkUrl !== 'string') state.compose.linkUrl = '';
    if (typeof state.compose.cameraStarting !== 'boolean') state.compose.cameraStarting = false;
    if (typeof state.compose.cameraError !== 'string') state.compose.cameraError = '';
    if (typeof state.compose.cameraStream === 'undefined') state.compose.cameraStream = null;
    if (typeof state.compose.cameraFullscreen !== 'boolean') state.compose.cameraFullscreen = false;
    if (typeof state.compose.cameraReturnToChooser !== 'boolean') state.compose.cameraReturnToChooser = false;
    if (typeof state.compose.audioStream === 'undefined') state.compose.audioStream = null;
    if (typeof state.compose.audioRecorder === 'undefined') state.compose.audioRecorder = null;
    if (!Array.isArray(state.compose.audioChunks)) state.compose.audioChunks = [];
    if (typeof state.compose.audioStarting !== 'boolean') state.compose.audioStarting = false;
    if (typeof state.compose.audioRecording !== 'boolean') state.compose.audioRecording = false;
    if (typeof state.compose.audioError !== 'string') state.compose.audioError = '';
    if (typeof state.compose.uploading !== 'number' || !isFinite(state.compose.uploading)) state.compose.uploading = 0;
    if (!Array.isArray(state.compose.uploadItems)) state.compose.uploadItems = [];
    if (typeof state.compose.uploadSeq !== 'number' || !isFinite(state.compose.uploadSeq)) state.compose.uploadSeq = 0;
    if (typeof state.compose.uploadCleanupTimer === 'undefined') state.compose.uploadCleanupTimer = null;
    if (!Array.isArray(state.compose.pendingContentAdditions)) state.compose.pendingContentAdditions = [];
    if (typeof state.compose.autosaveTimer === 'undefined') state.compose.autosaveTimer = null;
    if (typeof state.compose.busy !== 'boolean') state.compose.busy = false;
    if (typeof state.compose.output !== 'string') state.compose.output = '';
    if (typeof state.compose.outputTone !== 'string') state.compose.outputTone = '';
    if (typeof state.compose.saveStatus !== 'string') state.compose.saveStatus = '';
  }

  function normalizeSlug(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function slugFromPath(pathname) {
    var path = String(pathname || '').trim();
    if (!path) {
      return 'index';
    }
    path = path.split('?')[0].split('#')[0];
    path = path.replace(/\/+$/, '');
    if (!path || path === '/') {
      return 'index';
    }
    if (path.indexOf('/pages/') === 0) {
      path = path.slice('/pages/'.length);
    } else if (path.charAt(0) === '/') {
      path = path.slice(1);
    }
    path = path.replace(/\.html?$/i, '');
    if (path.indexOf('/') >= 0) {
      return '';
    }
    return normalizeSlug(path);
  }

  function slugsEquivalent(aRaw, bRaw) {
    var a = normalizeSlug(aRaw);
    var b = normalizeSlug(bRaw);
    if (!a || !b) {
      return false;
    }
    if (a === b) {
      return true;
    }
    return (a === 'index' && b === 'blog') || (a === 'blog' && b === 'index');
  }

  function maybeRepairRoute(reason) {
    if (routeSelfHealTriggered) {
      return;
    }
    routeSelfHealTriggered = true;
    var url;
    try {
      url = new URL(window.location.href);
    } catch (_err) {
      window.location.reload();
      return;
    }
    var attempted = url.searchParams.get('__route_repair') === '1';
    if (attempted) {
      clearRouteRepairParam();
      return;
    }
    url.searchParams.set('__route_repair', '1');
    fetch('/cgi/blog-list-navbar-pages', { cache: 'no-store' })
      .catch(function () {
        // Ignore sync hint errors; still attempt one repair reload.
      })
      .finally(function () {
        window.setTimeout(function () {
          if (reason) {
            // Preserve last reason for debugging in browser console/state.
            try {
              sessionStorage.setItem('wizardry_last_route_repair_reason', String(reason));
            } catch (_storageErr) {
              // Ignore storage errors.
            }
          }
          window.location.replace(url.toString());
        }, 220);
      });
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

  function cleanMarkdownText(value) {
    return String(value || '')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
  }

  function renderPostSummaryHtml(summary, url, truncated) {
    var text = cleanMarkdownText(summary).trim();
    if (!text) {
      return '';
    }
    var readMore = '';
    if (truncated && String(url || '').trim()) {
      readMore = '<a class="post-summary-read-more" href="' + escapeHtml(url) + '">Read more</a>';
    }
    return '<div class="post-summary">' + markdownBlock(text) + readMore + '</div>';
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
    if (state.payload && state.payload.state) {
      return normalizePageState(state.payload.state);
    }
    return normalizePageState({ title: titleizeSlug(slug) });
  }

  function hasAuthTokens() {
    var auth = authPayload();
    return !!(auth.session_token && auth.csrf_token);
  }

  function cachedAdminFlag() {
    try {
      return String(localStorage.getItem('last_auth_is_admin') || '') === '1';
    } catch (_err) {
      return false;
    }
  }

  function isAdmin() {
    if (state.payload && state.payload.is_admin) {
      return true;
    }
    return hasAuthTokens() && cachedAdminFlag();
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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
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
    var page = getRenderState();
    var title = String(page.title || '').trim() || titleizeSlug(slug);
    if (typeof window.__wizardryApplyPageTitle === 'function') {
      window.__wizardryApplyPageTitle(title);
    } else {
      document.title = title;
    }
    if (els.title) {
      els.title.innerHTML = '<span class="list-page-title-text">' + escapeHtml(title) + '</span><span id="blog-page-title-actions" class="list-page-title-actions"></span>';
      els.title.hidden = false;
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

  function resolveMainColumnHost() {
    var layout = root.querySelector('.blog-layout');
    if (!layout) {
      return null;
    }
    return layout.querySelector('.blog-main-column');
  }

  function ensureDraftNoticeHost() {
    if (els.draftNotice && els.draftNotice.isConnected) {
      return els.draftNotice;
    }
    var existing = document.getElementById('blog-draft-notice');
    if (existing) {
      els.draftNotice = existing;
      return existing;
    }
    var mainCol = resolveMainColumnHost();
    if (!mainCol) {
      return null;
    }
    var node = document.createElement('div');
    node.id = 'blog-draft-notice';
    node.className = 'blog-draft-notice';
    node.hidden = true;
    var adminNode = document.getElementById('blog-page-admin');
    if (adminNode && adminNode.parentNode === mainCol) {
      mainCol.insertBefore(node, adminNode);
    } else {
      mainCol.insertBefore(node, mainCol.firstChild);
    }
    els.draftNotice = node;
    return node;
  }

  function clearDraftNoticeState() {
    state.draftNotice.loading = false;
    state.draftNotice.loaded = false;
    state.draftNotice.drafts = [];
    clearDraftNoticeCache();
    renderDraftNotice();
  }

  function draftNoticeIdentity() {
    var username = '';
    try {
      username = String(localStorage.getItem('last_auth_username') || '').trim().toLowerCase();
    } catch (_err) {
      username = '';
    }
    if (username) {
      return 'u:' + username;
    }
    var auth = authPayload();
    if (auth.session_token) {
      return 's:' + auth.session_token.slice(0, 24);
    }
    return '';
  }

  function clearDraftNoticeCache() {
    try {
      localStorage.removeItem(DRAFT_NOTICE_CACHE_KEY);
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function readDraftNoticeCache() {
    try {
      var raw = localStorage.getItem(DRAFT_NOTICE_CACHE_KEY);
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      var savedAt = Number(parsed.saved_at || 0);
      if (!isFinite(savedAt) || savedAt <= 0 || (Date.now() - savedAt) > DRAFT_NOTICE_CACHE_MAX_AGE_MS) {
        localStorage.removeItem(DRAFT_NOTICE_CACHE_KEY);
        return null;
      }
      var identity = String(parsed.identity || '').trim();
      if (!identity || identity !== draftNoticeIdentity()) {
        return null;
      }
      var drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
      return drafts.slice();
    } catch (_err) {
      return null;
    }
  }

  function writeDraftNoticeCache(drafts) {
    try {
      var identity = draftNoticeIdentity();
      if (!identity) {
        return;
      }
      localStorage.setItem(DRAFT_NOTICE_CACHE_KEY, JSON.stringify({
        identity: identity,
        drafts: Array.isArray(drafts) ? drafts : [],
        saved_at: Date.now()
      }));
    } catch (_err) {
      // Ignore storage failures.
    }
  }

  function hydrateDraftNoticeFromCache() {
    if (!isAdmin()) {
      return false;
    }
    var cachedDrafts = readDraftNoticeCache();
    if (!cachedDrafts) {
      return false;
    }
    state.draftNotice.loaded = true;
    state.draftNotice.drafts = cachedDrafts;
    renderDraftNotice();
    return true;
  }

  function draftTitleFromRecord(draft) {
    var title = String(draft && draft.title || '').trim();
    if (title) {
      return title;
    }
    var excerpt = String(draft && draft.content_excerpt || '').trim();
    if (excerpt) {
      return excerpt;
    }
    return 'Untitled draft';
  }

  function draftTimestampMs(draft) {
    var updated = String(draft && draft.updated_at || '').trim();
    var created = String(draft && draft.created_at || '').trim();
    var raw = updated || created;
    if (!raw) {
      return 0;
    }
    var ms = Date.parse(raw);
    if (!isFinite(ms)) {
      return 0;
    }
    return ms;
  }

  function pickDraftNoticeSummary(drafts) {
    var list = Array.isArray(drafts) ? drafts : [];
    if (!list.length) {
      return { mode: 'none' };
    }
    var sorted = list.slice().sort(function (a, b) {
      return draftTimestampMs(b) - draftTimestampMs(a);
    });
    if (sorted.length === 1) {
      return { mode: 'continue', draft: sorted[0], count: 1 };
    }
    var recentWindowMs = 36 * 60 * 60 * 1000;
    var cutoff = Date.now() - recentWindowMs;
    var recent = null;
    for (var i = 0; i < sorted.length; i += 1) {
      if (draftTimestampMs(sorted[i]) >= cutoff) {
        recent = sorted[i];
        break;
      }
    }
    if (recent) {
      return { mode: 'continue', draft: recent, count: sorted.length };
    }
    return { mode: 'count', count: sorted.length };
  }

  function renderDraftNotice() {
    var host = ensureDraftNoticeHost();
    if (!host) {
      return;
    }
    if (!isAdmin()) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    var summary = pickDraftNoticeSummary(state.draftNotice.drafts);
    if (summary.mode === 'none') {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    if (summary.mode === 'count') {
      var count = Number(summary.count) || 0;
      var noun = count === 1 ? 'saved draft' : 'saved drafts';
      host.innerHTML = '<div class="blog-draft-notice-card"><span>You have </span><a href="/admin#drafts" class="blog-draft-notice-link">' + escapeHtml(String(count) + ' ' + noun) + '</a><span>.</span></div>';
      host.hidden = false;
      return;
    }
    var draftId = String(summary.draft && summary.draft.draft_id || '').trim();
    var title = draftTitleFromRecord(summary.draft);
    var allDraftsLink = '';
    if ((Number(summary.count) || 0) > 1) {
      allDraftsLink = '<a href="/admin#drafts" class="blog-draft-notice-link blog-draft-notice-all-link">View all drafts</a>';
    }
    host.innerHTML = '' +
      '<div class="blog-draft-notice-card">' +
        '<span class="blog-draft-notice-main">' +
          '<span class="blog-draft-notice-text">Continue working on: </span>' +
          '<a href="#" class="blog-draft-notice-link blog-draft-notice-continue-link" data-draft-banner-action="continue" data-draft-id="' + escapeHtml(draftId) + '"><strong>' + escapeHtml(title) + '</strong></a>' +
        '</span>' +
        allDraftsLink +
      '</div>';
    host.hidden = false;
  }

  function loadDraftNoticeData() {
    if (!isAdmin()) {
      clearDraftNoticeState();
      return Promise.resolve();
    }
    if (state.draftNotice.loading) {
      return Promise.resolve();
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      clearDraftNoticeState();
      return Promise.resolve();
    }
    hydrateDraftNoticeFromCache();
    state.draftNotice.loading = true;
    var requestSeq = state.draftNotice.requestSeq + 1;
    state.draftNotice.requestSeq = requestSeq;
    return apiPost('/cgi/blog-list-drafts', {
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      if (requestSeq !== state.draftNotice.requestSeq) {
        return;
      }
      state.draftNotice.loading = false;
      state.draftNotice.loaded = true;
      state.draftNotice.drafts = Array.isArray(data && data.drafts) ? data.drafts : [];
      writeDraftNoticeCache(state.draftNotice.drafts);
      renderDraftNotice();
    }).catch(function () {
      if (requestSeq !== state.draftNotice.requestSeq) {
        return;
      }
      state.draftNotice.loading = false;
      state.draftNotice.loaded = true;
      state.draftNotice.drafts = [];
      renderDraftNotice();
    });
  }

  function waitForInitialDraftNotice() {
    if (!isAdmin()) {
      clearDraftNoticeState();
      return Promise.resolve();
    }
    return loadDraftNoticeData();
  }

  function openDraftFromNotice(draftId) {
    var id = String(draftId || '').trim();
    if (!id) {
      return;
    }
    openComposeDraftInPlace(id, {}).catch(function (err) {
      showTopToast(err && err.message ? err.message : 'Could not open draft.', 'error', 3600);
    });
  }

  function renderValidation() {
    if (!els.validation) {
      return;
    }
    var validation = (state.payload && state.payload.validation) ? state.payload.validation : {};
    var errors = (Array.isArray(validation.errors) ? validation.errors : []).filter(function (msg) {
      var text = String(msg || '').trim().toLowerCase();
      if (!text) {
        return false;
      }
      return !(/could not validate .*state/.test(text) || /validation .*temporarily unavailable/.test(text));
    });
    var warnings = (Array.isArray(validation.warnings) ? validation.warnings : []).filter(function (msg) {
      var text = String(msg || '').trim().toLowerCase();
      if (!text) {
        return false;
      }
      return !(/could not validate .*state/.test(text) || /validation .*temporarily unavailable/.test(text));
    });
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

  function pageSettingsTags() {
    var seen = {};
    var tags = [];
    (Array.isArray(state.posts) ? state.posts : []).forEach(function (post) {
      var list = Array.isArray(post && post.tags) ? post.tags : [];
      list.forEach(function (raw) {
        var tag = String(raw || '').trim();
        if (!tag || seen[tag]) {
          return;
        }
        seen[tag] = true;
        tags.push(tag);
      });
    });
    tags.sort(function (a, b) {
      return a.localeCompare(b);
    });
    return tags;
  }

  function setPageSettingsOpen(open) {
    if (!els.admin) {
      return;
    }
    var next = !!open;
    state.pageSettingsOpen = next;
    var editToggle = document.querySelector('[data-blog-action="toggle-page-settings"]');
    if (editToggle instanceof HTMLElement) {
      editToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
    }
    if (pageSettingsHideTimer) {
      window.clearTimeout(pageSettingsHideTimer);
      pageSettingsHideTimer = null;
    }
    if (next) {
      els.admin.hidden = false;
      els.admin.classList.remove('is-open');
      void els.admin.offsetHeight;
      window.requestAnimationFrame(function () {
        if (els.admin) {
          els.admin.classList.add('is-open');
        }
      });
      return;
    }
    els.admin.classList.remove('is-open');
    pageSettingsHideTimer = window.setTimeout(function () {
      pageSettingsHideTimer = null;
      if (els.admin && !state.pageSettingsOpen) {
        els.admin.hidden = true;
      }
    }, 240);
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
      state.pageSettingsOpen = false;
      els.admin.hidden = true;
      els.admin.innerHTML = '';
      return;
    }
    if (actionsHost) {
      actionsHost.innerHTML = '<span class="list-page-admin-bar"><button type="button" class="list-admin-primary-btn" data-blog-action="toggle-page-settings" aria-expanded="' + (state.pageSettingsOpen ? 'true' : 'false') + '" aria-controls="blog-page-settings-panel">Edit</button></span>';
    }
    var page = getRenderState();
    var selectedTag = String(page.default_tag || '').trim();
    var tags = pageSettingsTags();
    var options = '<option value="">All posts</option>' + tags.map(function (tag) {
      return '<option value="' + escapeHtml(tag) + '"' + (selectedTag === tag ? ' selected' : '') + '>' + escapeHtml(tag) + '</option>';
    }).join('');
    els.admin.innerHTML = '' +
      '<div id="blog-page-settings-panel" class="blog-page-settings-panel' + (state.pageSettingsOpen ? ' is-open' : '') + '">' +
        '<label><span>Show posts</span><select data-blog-setting="default-tag">' + options + '</select></label>' +
      '</div>';
    if (state.pageSettingsOpen) {
      els.admin.hidden = false;
      els.admin.classList.add('is-open');
    } else {
      els.admin.hidden = true;
      els.admin.classList.remove('is-open');
    }
  }

  function resolveComposeListHost() {
    if (els.list && els.list.isConnected && els.list.parentNode) {
      return els.list;
    }
    var nextList = document.getElementById('blog-post-list');
    if (!nextList) {
      nextList = root.querySelector('#blog-post-list') || root.querySelector('.post-list');
    }
    if (!nextList || !nextList.parentNode) {
      return null;
    }
    els.list = nextList;
    return nextList;
  }

  function bindComposeFabListener(fab) {
    if (!fab || fab.__composeFabBound) {
      return;
    }
    fab.__composeFabBound = true;
    fab.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      toggleComposeFromUi(!state.compose.open);
    });
  }

  function eventTargetElement(target) {
    if (target instanceof Element) {
      return target;
    }
    if (target && target.parentElement instanceof Element) {
      return target.parentElement;
    }
    return null;
  }

  function ensureComposeHosts() {
    var listHost = resolveComposeListHost();
    if (!listHost) {
      return;
    }
    if (!els.composeSlot || !els.composeSlot.isConnected) {
      var slot = document.createElement('div');
      slot.className = 'blog-compose-slot';
      slot.hidden = true;
      listHost.parentNode.insertBefore(slot, listHost);
      els.composeSlot = slot;
    }
    if (!els.composeFab || !els.composeFab.isConnected) {
      var existingFab = root.querySelector('.blog-compose-fab[data-blog-action="toggle-compose"]');
      if (existingFab instanceof HTMLButtonElement) {
        els.composeFab = existingFab;
      }
    }
    if (!els.composeFab || !els.composeFab.isConnected) {
      var fab = document.createElement('button');
      fab.type = 'button';
      fab.className = 'blog-compose-fab list-admin-primary-btn';
      fab.setAttribute('data-blog-action', 'toggle-compose');
      fab.setAttribute('aria-label', 'Compose');
      fab.innerHTML = '<span class="blog-compose-fab-icon" aria-hidden="true">+</span>';
      fab.hidden = true;
      root.appendChild(fab);
      els.composeFab = fab;
    }
    if (els.composeFab instanceof HTMLButtonElement) {
      els.composeFab.type = 'button';
      els.composeFab.setAttribute('data-blog-action', 'toggle-compose');
      if (!els.composeFab.getAttribute('aria-label')) {
        els.composeFab.setAttribute('aria-label', 'Compose');
      }
      if (!els.composeFab.querySelector('.blog-compose-fab-icon')) {
        els.composeFab.innerHTML = '<span class="blog-compose-fab-icon" aria-hidden="true">+</span>';
      }
      bindComposeFabListener(els.composeFab);
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
    ensureComposeStateShape();
    return normalizeComposePostType(state.compose.postType);
  }

  function composePostTypeIsTextual(type) {
    var picked = normalizeComposePostType(type);
    return picked === 'shortform' || picked === 'longform' || picked === 'attachment';
  }

  function composeBackingPostType(type) {
    var picked = normalizeComposePostType(type);
    if (picked === 'attachment') {
      return 'longform';
    }
    return picked;
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

  function parseComposeLinkShareContent(rawContent) {
    var content = String(rawContent || '');
    var match = content.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
    var url = '';
    if (match && match[1]) {
      url = String(match[1]).trim();
    }
    var body = content.replace(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i, '').trim();
    return {
      url: url,
      body: body
    };
  }

  function composeNostrTarget(postType) {
    var type = composeBackingPostType(postType);
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
    if (type === 'audio-note') {
      return { kind: '21', tags: 'url, m=audio/*, duration, alt' };
    }
    if (type === 'link-share') {
      return { kind: '1', tags: 'r, title, summary, image' };
    }
    return { kind: '30311', tags: 'streaming, starts, status=live' };
  }

  function composePostTypeLabel(postType) {
    var type = normalizeComposePostType(postType);
    if (type === 'shortform') return 'Shortform Post';
    if (type === 'longform') return 'Longform Post';
    if (type === 'capture-media') return 'Take Photo/Video';
    if (type === 'upload-media') return 'Upload Photo/Video';
    if (type === 'attachment') return 'Upload Attachment/File';
    if (type === 'audio-note') return 'Audio Note';
    if (type === 'link-share') return 'Link Share';
    return 'Go Live';
  }

  function composePostKindPillText(postType) {
    var type = composeBackingPostType(postType);
    var target = composeNostrTarget(type);
    if (type === 'longform') return 'Long-form Content (kind ' + target.kind + ')';
    if (type === 'shortform') return 'Shortform Post (kind ' + target.kind + ')';
    if (type === 'capture-media') return 'Media Capture (kind ' + target.kind + ')';
    if (type === 'upload-media') return 'Media Upload (kind ' + target.kind + ')';
    if (type === 'audio-note') return 'Audio Note (kind ' + target.kind + ')';
    if (type === 'link-share') return 'Link Share (kind ' + target.kind + ')';
    return 'Go Live (kind ' + target.kind + ')';
  }

  function composePostKindPillClass(postType) {
    var type = composeBackingPostType(postType);
    if (type === 'longform') return 'is-type-nip23';
    if (type === 'capture-media' || type === 'upload-media') return 'is-type-icon-gallery';
    if (type === 'audio-note') return 'is-type-public-ranking';
    if (type === 'link-share') return 'is-type-blog';
    if (type === 'shortform') return 'is-type-list';
    return 'is-type-public-ranking';
  }

  function composeNostrPillsHtml(postType) {
    var type = composeBackingPostType(postType);
    var target = composeNostrTarget(type);
    var kindText = composePostKindPillText(type);
    var badgeClass = composePostKindPillClass(type);
    return '<span class="nostr-page-kind-badge ' + badgeClass + '" title="' + escapeHtml(kindText + ' · ' + target.tags) + '">' + escapeHtml(kindText) + '</span>';
  }

  function clearComposePostTypeCollapseTimer() {
    ensureComposeStateShape();
    if (state.compose.postTypeToolbarCollapseTimer) {
      window.clearTimeout(state.compose.postTypeToolbarCollapseTimer);
      state.compose.postTypeToolbarCollapseTimer = null;
    }
  }

  function applyComposePostTypeControlState() {
    if (!els.composeSlot) {
      return;
    }
    var control = els.composeSlot.querySelector('[data-compose-type-control]');
    var headRow = els.composeSlot.querySelector('[data-compose-head-row]');
    if (!control) {
      return;
    }
    control.classList.toggle('is-collapsed', !!state.compose.postTypeToolbarCollapsed);
    if (headRow) {
      headRow.classList.toggle('is-type-collapsed', !!state.compose.postTypeToolbarCollapsed);
    }
  }

  function setComposePostTypeToolbarCollapsed(collapsed, options) {
    ensureComposeStateShape();
    var opts = options || {};
    state.compose.postTypeToolbarCollapsed = !!collapsed;
    if (opts.clearTimer !== false && collapsed) {
      clearComposePostTypeCollapseTimer();
    }
    if (opts.skipDom) {
      return;
    }
    applyComposePostTypeControlState();
  }

  function scheduleComposePostTypeCollapse(delayMs) {
    ensureComposeStateShape();
    clearComposePostTypeCollapseTimer();
    if (!state.compose.open) {
      return;
    }
    state.compose.postTypeToolbarCollapseTimer = window.setTimeout(function () {
      state.compose.postTypeToolbarCollapseTimer = null;
      if (!state.compose.open) {
        return;
      }
      setComposePostTypeToolbarCollapsed(true);
    }, Math.max(800, Number(delayMs) || 2600));
  }

  function composePostTypeIconSvg(type) {
    var picked = normalizeComposePostType(type);
    if (picked === 'shortform') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 96.314 100" fill="none" aria-hidden="true">' +
        '<path fill="currentColor" stroke="none" d="M84.39,11.825C83.396,8.452,80.595,5,75.097,5c-5.605,0-16.216,3.389-16.216,16.216c0,2.613-1.786,3.205-3.243,3.243c-27.467,0-47.354,32.62-48.187,34.006L5,62.549l4.7,0.785c14.088,2.349,26.242,3.646,36.208,3.879V95h6.486V67.204c1.035-0.03,2.055-0.068,3.041-0.127V95h6.486V66.438c15.209-2.16,22.906-8.613,22.906-19.276V24.459h6.486v-3.243C91.314,17.868,89.414,13.124,84.39,11.825z M78.34,47.162c0,3.367,0,13.606-29.252,13.606c-9.03,0-20.227-1.017-33.326-3.031c6.043-8.383,21.414-26.792,39.876-26.792c3.908,0,9.729-2.591,9.729-9.729c0-9.157,8.12-9.711,9.729-9.73c2.609,0,3.205,1.783,3.243,3.243V47.162z M75.446,17.837c0,1.384-1.128,2.505-2.509,2.505s-2.508-1.121-2.508-2.505c0-1.384,1.127-2.505,2.508-2.505S75.446,16.453,75.446,17.837z"/>' +
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
        '<rect x="3.6" y="5.1" width="16.8" height="13.8" rx="2.2" stroke="currentColor" stroke-width="1.8"/>' +
        '<circle cx="8.4" cy="9.7" r="1.4" fill="currentColor"/>' +
        '<path d="M5.8 16.4L10.2 12.1L13.1 15L15.8 12.5L18.2 16.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    }
    if (picked === 'attachment') {
      return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M21.4 11.1L12.9 19.6C10.6 21.9 6.8 21.9 4.5 19.6C2.2 17.3 2.2 13.5 4.5 11.2L13 2.8C14.6 1.2 17.1 1.2 18.7 2.8C20.2 4.4 20.2 6.9 18.7 8.5L10.2 16.9C9.3 17.8 7.8 17.8 6.9 16.9C6 16 6 14.5 6.9 13.6L14.8 5.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
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
        '<rect x="2.7" y="8.5" width="8.8" height="7" rx="3.5" stroke="currentColor" stroke-width="1.8"/>' +
        '<rect x="12.5" y="8.5" width="8.8" height="7" rx="3.5" stroke="currentColor" stroke-width="1.8"/>' +
        '<path d="M9.8 12H14.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>';
    }
    return '<svg class="compose-post-type-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.8"/>' +
      '<circle cx="12" cy="12" r="2.5" fill="currentColor"/>' +
    '</svg>';
  }

  function composePreviewToggleIconSvg() {
    return '<svg class="compose-preview-toggle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M7.2 3.8H13.4L18.9 9.3V18.5C18.9 19.4 18.2 20.1 17.3 20.1H7.2C6.3 20.1 5.6 19.4 5.6 18.5V5.4C5.6 4.5 6.3 3.8 7.2 3.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M13.4 3.8V9.3H18.9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<circle cx="10.6" cy="13.8" r="2.1" stroke="currentColor" stroke-width="1.8"/>' +
      '<path d="M12.1 15.3L14.3 17.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>';
  }

  function composeCloseIconSvg() {
    return '<svg class="compose-close-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M7 7L17 17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
      '<path d="M17 7L7 17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
    '</svg>';
  }

  function composeTypeButtonsHtml(activeType, opts) {
    var options = opts || {};
    var lockAll = !!options.lockAll;
    var noActive = !!options.noActive;
    var current = noActive ? '' : normalizeComposePostType(activeType);
    function btn(type, label, disabled) {
      var buttonDisabled = !!disabled || lockAll;
      var cls = 'compose-post-type-pill';
      if (type === current) {
        cls += ' is-active';
      }
      if (buttonDisabled) {
        cls += ' is-disabled';
      }
      var icon = composePostTypeIconSvg(type);
      var title = disabled ? ('Coming soon: ' + label) : (buttonDisabled ? ('Post type locked: ' + label) : label);
      return '<button type="button" class="' + cls + '" data-compose-action="set-post-type" data-compose-post-type="' + escapeHtml(type) + '"' +
        (buttonDisabled ? ' disabled aria-disabled="true"' : '') +
        ' aria-pressed="' + (type === current ? 'true' : 'false') + '"' +
        ' aria-label="' + escapeHtml(label) + '"' +
        ' title="' + escapeHtml(title) + '"' +
        '>' + icon + '</button>';
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

  function normalizeComposeShortformLimit(raw) {
    var n = parseInt(String(raw || '').trim(), 10);
    if (!isFinite(n) || n < 1) {
      return 280;
    }
    return Math.max(1, Math.min(5000, n));
  }

  function currentComposeShortformLimit() {
    ensureComposeStateShape();
    state.compose.shortformLimit = normalizeComposeShortformLimit(state.compose.shortformLimit);
    return state.compose.shortformLimit;
  }

  function enforceComposeShortformLimitOnFields(fields) {
    var data = fields || readComposeFields();
    if (!data) {
      return;
    }
    if (normalizeComposePostType(data.postType) !== 'shortform') {
      return;
    }
    var limit = currentComposeShortformLimit();
    if (String(data.content || '').length <= limit) {
      return;
    }
    var next = String(data.content || '').slice(0, limit);
    if (els.composeSlot) {
      var contentField = els.composeSlot.querySelector('[data-compose-field="content"]');
      if (contentField instanceof HTMLTextAreaElement) {
        contentField.value = next;
      }
    }
  }

  function composeShortformMeterHtml(contentValue) {
    var limit = currentComposeShortformLimit();
    var count = String(contentValue || '').length;
    var editing = !!state.compose.shortformLimitEditing;
    return '' +
      '<div class="blog-compose-shortform-meter">' +
        '<button type="button" class="unobtrusive-icon-button blog-compose-shortform-limit-btn" data-compose-action="shortform-limit-toggle" title="Click to toggle 280/140. Double-click to set custom limit."' + (editing ? ' hidden' : '') + '>' + escapeHtml(String(count) + '/' + String(limit)) + '</button>' +
        '<input type="number" class="blog-compose-shortform-limit-input" data-compose-field="shortform-limit" min="1" step="1" inputmode="numeric" value="' + escapeHtml(String(limit)) + '"' + (editing ? '' : ' hidden') + '>' +
      '</div>';
  }

  function setComposeShortformLimit(raw, opts) {
    var options = opts || {};
    state.compose.shortformLimit = normalizeComposeShortformLimit(raw);
    if (options.editing === true || options.editing === false) {
      state.compose.shortformLimitEditing = !!options.editing;
    }
    enforceComposeShortformLimitOnFields();
    if (!options.skipRender) {
      renderComposeUi();
    }
    if (!options.skipAutosave) {
      queueComposeAutosave();
    }
  }

  function composeTextareaRows(postType) {
    var type = normalizeComposePostType(postType);
    if (type === 'shortform') {
      return 9;
    }
    if (composePostTypeIsTextual(type)) {
      return 14;
    }
    return 8;
  }

  function setComposePostType(nextType, options) {
    var opts = options || {};
    var normalized = normalizeComposePostType(nextType);
    var wasChosen = !!state.compose.postTypeChosen;
    if (normalized === 'go-live') {
      setComposeOutput('Go Live is a future feature.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    // For initial media selection, keep chooser mode until capture/file pick completes.
    if (opts.interactive && normalized === 'capture-media') {
      state.compose.postType = normalized;
      state.compose.postTypeChosen = wasChosen;
      state.compose.postTypeToolbarCollapsed = false;
      if (!opts.skipRender) {
        renderComposeUi();
      }
      setTimeout(function () {
        openComposeCameraCapture({ returnToChooser: !wasChosen });
      }, 0);
      return;
    }
    if (opts.interactive && normalized === 'upload-media' && !wasChosen) {
      state.compose.postType = normalized;
      state.compose.postTypeChosen = false;
      state.compose.postTypeToolbarCollapsed = false;
      if (!opts.skipRender) {
        renderComposeUi();
      }
      if (!openComposePickerForType(normalized)) {
        setTimeout(function () {
          openComposePickerForType(normalized);
        }, 0);
      }
      return;
    }
    if (opts.interactive && normalized === 'audio-note') {
      state.compose.postType = normalized;
      state.compose.postTypeChosen = true;
      state.compose.postTypeToolbarCollapsed = true;
      if (!opts.skipRender) {
        renderComposeUi();
      }
      if (!opts.skipAutosave) {
        queueComposeAutosave();
      }
      setTimeout(function () {
        if (!state.compose.open || composePostType() !== 'audio-note') {
          return;
        }
        if (!state.compose.audioRecording) {
          startComposeAudioRecording();
        }
      }, 0);
      return;
    }
    state.compose.postType = normalized;
    state.compose.postTypeChosen = true;
    state.compose.postTypeToolbarCollapsed = true;
    if (!opts.skipRender) {
      renderComposeUi();
    }
    if (!opts.skipAutosave) {
      queueComposeAutosave();
    }
    if (opts.interactive) {
      if (normalized === 'upload-media' || normalized === 'attachment') {
        if (!openComposePickerForType(normalized)) {
          setTimeout(function () {
            openComposePickerForType(normalized);
          }, 0);
        }
      } else if (normalized === 'capture-media') {
        setTimeout(function () {
          applyComposeModeEffects(normalized);
        }, 0);
      }
    }
  }

  function normalizeTagValue(tag) {
    var value = String(tag || '').trim();
    if (!value) {
      return '';
    }
    value = value.replace(/^\[+|\]+$/g, '');
    value = value.replace(/^["']+|["']+$/g, '');
    value = value.replace(/\\+/g, '');
    value = value.replace(/\s+/g, '-');
    value = value.replace(/^-+|-+$/g, '');
    if (!/[A-Za-z0-9]/.test(value)) {
      return '';
    }
    if (/[\[\]{}]/.test(value)) {
      return '';
    }
    value = value.replace(/[^A-Za-z0-9._:+/-]/g, '');
    value = value.replace(/^-+|-+$/g, '');
    if (!value || value.length > 64) {
      return '';
    }
    return value;
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

  function composeDefaultTag() {
    var page = getRenderState();
    return normalizeTagValue(String(page && page.default_tag || ''));
  }

  function seedComposeDefaultTag(forceReplace) {
    var tag = composeDefaultTag();
    if (!tag) {
      if (forceReplace) {
        setComposeTags([]);
      }
      return;
    }
    if (forceReplace) {
      setComposeTags([tag]);
      return;
    }
    if (!state.compose.tags.length) {
      setComposeTags([tag]);
    }
  }

  function composeTagTokenHtml(tag) {
    return '<span class="tag-token" contenteditable="false" data-compose-tag-token="' + escapeHtml(tag) + '" tabindex="-1"><span class="tag-token-label">' + escapeHtml(tag) + '</span></span>';
  }

  function composeTagsEditorHtml() {
    var tokensHtml = state.compose.tags.map(composeTagTokenHtml).join('');
    return '' +
      '<div class="tag-token-editor" data-compose-field="tags-editor" contenteditable="true" role="textbox" aria-label="Post tags" spellcheck="false" data-placeholder="tag, tag, tag">' +
        tokensHtml +
        '<span class="tag-token-editor-draft" data-compose-tag-draft>' + escapeHtml(state.compose.tagsDraftText || '') + '</span>' +
      '</div>';
  }

  function composeTagsEditorNode() {
    if (!els.composeSlot) {
      return null;
    }
    var node = els.composeSlot.querySelector('[data-compose-field="tags-editor"]');
    return node instanceof HTMLElement ? node : null;
  }

  function composeTagsEditorDraftNode(editor) {
    if (!(editor instanceof HTMLElement)) {
      return null;
    }
    var node = editor.querySelector('[data-compose-tag-draft]');
    return node instanceof HTMLElement ? node : null;
  }

  function composeTagsEditorSelectedToken(editor) {
    if (!(editor instanceof HTMLElement)) {
      return null;
    }
    var node = editor.querySelector('.tag-token.is-selected[data-compose-tag-token]');
    return node instanceof HTMLElement ? node : null;
  }

  function composeTagsEditorSetEmptyClass(editor) {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    var draft = String(state.compose.tagsDraftText || '').trim();
    var empty = !state.compose.tags.length && !draft;
    editor.classList.toggle('is-empty', empty);
  }

  function composeTagsEditorRender(editor) {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    var html = state.compose.tags.map(composeTagTokenHtml).join('');
    html += '<span class="tag-token-editor-draft" data-compose-tag-draft>' + escapeHtml(state.compose.tagsDraftText || '') + '</span>';
    editor.innerHTML = html;
    composeTagsEditorSetEmptyClass(editor);
  }

  function composeTagsEditorFocusDraft(editor) {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    var draftNode = composeTagsEditorDraftNode(editor);
    if (!(draftNode instanceof HTMLElement)) {
      return;
    }
    var range = document.createRange();
    range.selectNodeContents(draftNode);
    range.collapse(false);
    var selection = window.getSelection ? window.getSelection() : null;
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (document.activeElement !== editor) {
      try {
        editor.focus({ preventScroll: true });
      } catch (_focusErr) {
        editor.focus();
      }
    }
  }

  function composeTagsEditorPlaceCaretFromPoint(editor, clientX, clientY) {
    if (!(editor instanceof HTMLElement)) {
      return false;
    }
    var selection = window.getSelection ? window.getSelection() : null;
    if (!selection) {
      return false;
    }
    var range = null;
    if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(clientX, clientY);
      if (pos && pos.offsetNode && editor.contains(pos.offsetNode)) {
        range = document.createRange();
        range.setStart(pos.offsetNode, Number(pos.offset) || 0);
        range.collapse(true);
      }
    } else if (document.caretRangeFromPoint) {
      var pointRange = document.caretRangeFromPoint(clientX, clientY);
      if (pointRange && pointRange.startContainer && editor.contains(pointRange.startContainer)) {
        range = pointRange;
        range.collapse(true);
      }
    }
    if (!range) {
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function composeTagsEditorClearSelection(editor) {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    var selected = composeTagsEditorSelectedToken(editor);
    if (selected) {
      selected.classList.remove('is-selected');
    }
  }

  function composeTagsEditorSelectToken(editor, tokenNode) {
    if (!(editor instanceof HTMLElement) || !(tokenNode instanceof HTMLElement)) {
      return;
    }
    composeTagsEditorClearSelection(editor);
    tokenNode.classList.add('is-selected');
    try {
      editor.focus({ preventScroll: true });
    } catch (_focusErr) {
      editor.focus();
    }
  }

  function composeTagsEditorReadDraftText(editor) {
    var draftNode = composeTagsEditorDraftNode(editor);
    if (!(draftNode instanceof HTMLElement)) {
      return '';
    }
    return String(draftNode.textContent || '');
  }

  function composeTagsEditorSyncDraft(editor) {
    if (!(editor instanceof HTMLElement)) {
      return;
    }
    state.compose.tagsDraftText = composeTagsEditorReadDraftText(editor);
    composeTagsEditorSetEmptyClass(editor);
  }

  function composeTagsEditorCommit(editor, forceFinalize) {
    if (!(editor instanceof HTMLElement)) {
      return false;
    }
    var draft = composeTagsEditorReadDraftText(editor);
    var rawParts = String(draft || '').split(',');
    if (!rawParts.length) {
      return false;
    }
    var changed = false;
    var limit = forceFinalize ? rawParts.length : Math.max(0, rawParts.length - 1);
    for (var i = 0; i < limit; i += 1) {
      if (addComposeTag(rawParts[i])) {
        changed = true;
      }
    }
    var nextDraft = forceFinalize ? '' : String(rawParts[rawParts.length - 1] || '');
    var draftChanged = nextDraft !== draft;
    state.compose.tagsDraftText = nextDraft;
    if (changed || draftChanged) {
      composeTagsEditorRender(editor);
      composeTagsEditorFocusDraft(editor);
    } else {
      composeTagsEditorSetEmptyClass(editor);
    }
    return changed || draftChanged;
  }

  function composeTagsEditorRemoveTagByNode(editor, tokenNode) {
    if (!(editor instanceof HTMLElement) || !(tokenNode instanceof HTMLElement)) {
      return false;
    }
    var tag = String(tokenNode.getAttribute('data-compose-tag-token') || '').trim();
    if (!tag) {
      return false;
    }
    if (state.compose.tags.indexOf(tag) < 0) {
      return false;
    }
    removeComposeTag(tag);
    composeTagsEditorRender(editor);
    composeTagsEditorFocusDraft(editor);
    return true;
  }

  function hydrateComposeTagsEditor() {
    var editor = composeTagsEditorNode();
    if (!editor) {
      return;
    }
    if (!(composeTagsEditorDraftNode(editor) instanceof HTMLElement)) {
      composeTagsEditorRender(editor);
    } else {
      composeTagsEditorSetEmptyClass(editor);
    }
  }

  function addComposeTag(rawTag) {
    var tag = normalizeTagValue(rawTag);
    if (!tag || state.compose.tags.indexOf(tag) !== -1) {
      return false;
    }
    state.compose.tags.push(tag);
    state.compose.tagsOpen = true;
    syncComposeTagsField();
    return true;
  }

  function removeComposeTag(tag) {
    setComposeTags(state.compose.tags.filter(function (item) {
      return item !== tag;
    }));
  }

  function commitComposeTagInput() {
    var editor = composeTagsEditorNode();
    if (editor) {
      return composeTagsEditorCommit(editor, true);
    }
    state.compose.tagsDraftText = '';
    return false;
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
    ensureComposeStateShape();
    if (!els.composeSlot) {
      var queuedOnly = String(text || '').trim();
      if (queuedOnly) {
        state.compose.pendingContentAdditions.push(queuedOnly);
      }
      return queuedOnly ? 'queued' : 'skipped';
    }
    var source = els.composeSlot.querySelector('[data-compose-field="content"]');
    var addition = String(text || '').trim();
    if (!addition) {
      return 'skipped';
    }
    if (!(source instanceof HTMLTextAreaElement)) {
      state.compose.pendingContentAdditions.push(addition);
      return 'queued';
    }
    var current = String(source.value || '');
    source.value = current.trim() ? (current.replace(/\s*$/, '') + '\n\n' + addition) : addition;
    return 'inserted';
  }

  function clearComposeUploadCleanupTimer() {
    if (!state.compose || !state.compose.uploadCleanupTimer) {
      return;
    }
    clearTimeout(state.compose.uploadCleanupTimer);
    state.compose.uploadCleanupTimer = null;
  }

  function clearComposeUploadItems() {
    ensureComposeStateShape();
    clearComposeUploadCleanupTimer();
    state.compose.uploadItems = [];
    state.compose.uploading = 0;
  }

  function composeUploadDisplayName(file) {
    var raw = String((file && file.name) || '').trim();
    if (raw) {
      return raw;
    }
    return 'upload-' + String(Date.now()) + '.bin';
  }

  function addComposeUploadEntries(files) {
    ensureComposeStateShape();
    var entries = Array.from(files || []).map(function (file) {
      state.compose.uploadSeq += 1;
      return {
        id: 'upload-' + String(state.compose.uploadSeq),
        name: composeUploadDisplayName(file),
        progress: 0,
        status: 'queued',
        error: ''
      };
    });
    if (entries.length) {
      state.compose.uploadItems = state.compose.uploadItems.concat(entries);
      clearComposeUploadCleanupTimer();
    }
    return entries;
  }

  function updateComposeUploadEntry(entryId, patch) {
    ensureComposeStateShape();
    var id = String(entryId || '').trim();
    if (!id) {
      return;
    }
    for (var idx = 0; idx < state.compose.uploadItems.length; idx += 1) {
      var item = state.compose.uploadItems[idx];
      if (String(item && item.id || '') !== id) {
        continue;
      }
      var next = Object.assign({}, item, patch || {});
      if (!isFinite(Number(next.progress))) {
        next.progress = 0;
      }
      next.progress = Math.max(0, Math.min(100, Math.round(Number(next.progress))));
      state.compose.uploadItems[idx] = next;
      return;
    }
  }

  function scheduleComposeUploadCleanup() {
    ensureComposeStateShape();
    clearComposeUploadCleanupTimer();
    // Keep completed uploads visible in the compose upload list until the
    // compose state is explicitly cleared/closed by the user.
  }

  function composeUploadProgressHtml() {
    ensureComposeStateShape();
    var items = Array.isArray(state.compose.uploadItems) ? state.compose.uploadItems : [];
    if (!items.length) {
      return '<div class="blog-compose-upload-list" data-compose-upload-progress hidden></div>';
    }
    var rows = items.map(function (item) {
      var name = escapeHtml(String((item && item.name) || 'upload.bin'));
      var status = String((item && item.status) || 'queued');
      var progress = Math.max(0, Math.min(100, Math.round(Number(item && item.progress) || 0)));
      var pctText = status === 'error' ? 'Failed' : (String(progress) + '%');
      return '' +
        '<div class="blog-compose-upload-row is-' + escapeHtml(status) + '">' +
          '<span class="blog-compose-upload-name">' + name + '</span>' +
          '<div class="blog-compose-upload-progress">' +
            '<div class="blog-compose-upload-track"><div class="blog-compose-upload-fill" style="width:' + String(progress) + '%"></div></div>' +
            '<span class="blog-compose-upload-state">' + pctText + '</span>' +
          '</div>' +
        '</div>';
    }).join('');
    return '<div class="blog-compose-upload-list" data-compose-upload-progress>' + rows + '</div>';
  }

  function renderComposeUploadProgressOnly() {
    if (!els.composeSlot || !state.compose.open) {
      return;
    }
    var host = els.composeSlot.querySelector('[data-compose-upload-progress]');
    if (!host) {
      return;
    }
    var html = composeUploadProgressHtml();
    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    var nextHost = wrapper.firstChild;
    if (!(nextHost instanceof Element)) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = !!nextHost.hidden;
    host.className = nextHost.className;
    host.innerHTML = nextHost.innerHTML;
  }

  function uploadComposeFile(file, options) {
    var opts = options || {};
    function normalizeUploadDataBase64(dataUrl) {
      var raw = String(dataUrl || '').trim();
      if (!raw) {
        return '';
      }
      var commaIdx = raw.indexOf(',');
      if (commaIdx > 0 && /^data:/i.test(raw.slice(0, commaIdx))) {
        return raw.slice(commaIdx + 1);
      }
      return raw;
    }
    function isMissingUploadPayloadError(data, statusCode) {
      if (!data || typeof data !== 'object') {
        return false;
      }
      var message = String(data.error || '').toLowerCase();
      var code = String(data.code || '').toLowerCase();
      if (message.indexOf('filename and data_base64 are required') < 0) {
        return false;
      }
      // Some deployments return this payload with HTTP 200 and success=false.
      return code === '' || code === 'invalid_request' || Number(statusCode) >= 200;
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      return Promise.reject(new Error('Sign in again to upload.'));
    }
    return readFileAsDataUrl(file).then(function (dataUrl) {
      var rawDataUrl = String(dataUrl || '').trim();
      var bareDataBase64 = normalizeUploadDataBase64(rawDataUrl);
      var safeFilename = String((file && file.name) || 'upload.bin').trim() || 'upload.bin';
      var safeMimeType = String((file && file.type) || '');
      if (!rawDataUrl) {
        return Promise.reject(new Error('Failed to read file'));
      }
      return new Promise(function (resolve, reject) {
        var fallbackAttempted = false;
        function buildPayload(useBareData) {
          return {
            session_token: auth.session_token,
            csrf_token: auth.csrf_token,
            draft_id: String(state.compose.draftId || ''),
            filename: safeFilename,
            mime_type: safeMimeType,
            data_base64: useBareData ? bareDataBase64 : rawDataUrl
          };
        }
        function sendAttempt(useBareData) {
          var body = new URLSearchParams(buildPayload(useBareData)).toString();
          var xhr = new XMLHttpRequest();
          xhr.open('POST', '/cgi/blog-upload-media', true);
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
          if (xhr.upload && typeof opts.onProgress === 'function') {
            xhr.upload.onprogress = function (progressEvent) {
              if (!progressEvent || !progressEvent.lengthComputable || progressEvent.total <= 0) {
                return;
              }
              opts.onProgress(progressEvent.loaded, progressEvent.total);
            };
          }
          xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) {
              return;
            }
            var data;
            try {
              data = JSON.parse(String(xhr.responseText || ''));
            } catch (_err) {
              reject(new Error('Invalid JSON response'));
              return;
            }
            if (xhr.status < 200 || xhr.status >= 300 || !data || data.success === false) {
              if (!fallbackAttempted && isMissingUploadPayloadError(data, xhr.status)) {
                fallbackAttempted = true;
                sendAttempt(!useBareData);
                return;
              }
              reject(new Error((data && data.error) || ('Upload failed (' + xhr.status + ')')));
              return;
            }
            resolve(data);
          };
          xhr.onerror = function () {
            reject(new Error('Upload request failed'));
          };
          xhr.send(body);
        }
        // Prefer bare base64 first; fallback to data URL form for compatibility.
        sendAttempt(true);
      });
    });
  }

  function handleComposeUploads(files, preferredType) {
    ensureComposeStateShape();
    var list = Array.from(files || []).filter(function (file) {
      return file && file.size >= 0;
    });
    if (!list.length) {
      return Promise.resolve();
    }
    if (!state.compose.open) {
      setComposeOpen(true);
    }
    var currentType = state.compose.postTypeChosen ? composePostType() : '';
    var targetType = normalizeComposePostType(preferredType || currentType || 'attachment');
    if (targetType === 'shortform' || targetType === 'capture-media' || targetType === 'go-live') {
      targetType = 'attachment';
    }
    if (!state.compose.postTypeChosen || preferredType) {
      setComposePostType(targetType, { skipAutosave: true });
    } else {
      renderComposeStatusOnly();
    }
    var uploadEntries = addComposeUploadEntries(list);
    state.compose.uploading += list.length;
    setComposeOutput('', '');
    showTopToast('Uploading ' + list.length + ' file(s)...', 'warn', 1600);
    renderComposeStatusOnly();
    var insertedCount = 0;
    var errorCount = 0;
    var chain = Promise.resolve();
    list.forEach(function (file, idx) {
      var entry = uploadEntries[idx];
      chain = chain.then(function () {
        if (entry && entry.id) {
          updateComposeUploadEntry(entry.id, { status: 'uploading', progress: 2, error: '' });
          renderComposeStatusOnly();
        }
        return uploadComposeFile(file, {
          onProgress: function (loaded, total) {
            if (!entry || !entry.id) {
              return;
            }
            var pct = total > 0 ? (loaded / total) * 100 : 0;
            updateComposeUploadEntry(entry.id, { status: 'uploading', progress: Math.max(2, Math.min(98, pct)) });
            renderComposeStatusOnly();
          }
        }).then(function (data) {
          if (data && data.draft_id) {
            state.compose.draftId = String(data.draft_id);
          }
          var uploadUrl = String((data && data.url) || '').trim();
          if (!uploadUrl) {
            var uploadedFileId = String((data && data.file_id) || '').trim();
            var uploadedName = String((data && (data.filename || data.name)) || '').trim();
            if (uploadedFileId) {
              uploadUrl = '/files/' + encodeURIComponent(uploadedFileId);
              if (uploadedName) {
                uploadUrl += '/' + encodeURIComponent(uploadedName);
              }
            }
          }
          if (!uploadUrl) {
            throw new Error('Upload succeeded but file URL is missing');
          }
          var appendState = appendComposeContent(composeUploadMarkdown(uploadUrl, file));
          if (appendState === 'inserted' || appendState === 'queued') {
            insertedCount += 1;
          }
          if (entry && entry.id) {
            updateComposeUploadEntry(entry.id, { status: 'done', progress: 100, error: '' });
            renderComposeStatusOnly();
          }
        }).catch(function (err) {
          errorCount += 1;
          if (entry && entry.id) {
            updateComposeUploadEntry(entry.id, {
              status: 'error',
              progress: 100,
              error: String((err && err.message) || 'Upload failed')
            });
            renderComposeStatusOnly();
          }
        });
      });
    });
    return chain.then(function () {
      renderComposeUi();
      if (insertedCount > 0) {
        flushComposeAutosaveNow();
      } else {
        queueComposeAutosave();
      }
      if (insertedCount > 0) {
        showTopToast('Upload complete. Added to body.', 'ok', 2600);
      } else if (!errorCount) {
        showTopToast('Upload complete.', 'ok', 2400);
      }
      if (errorCount > 0) {
        showTopToast('Upload failed for ' + String(errorCount) + ' file(s).', 'error', 3600);
      }
      scheduleComposeUploadCleanup();
    }).finally(function () {
      state.compose.uploading = Math.max(0, state.compose.uploading - list.length);
      renderComposeStatusOnly();
    });
  }

  function composeDroppedFiles(event) {
    var dt = event && event.dataTransfer;
    if (!dt || !dt.files) {
      return [];
    }
    return Array.from(dt.files).filter(function (file) {
      return file && file.size >= 0;
    });
  }

  function composeDragHasFiles(event) {
    var dt = event && event.dataTransfer;
    if (!dt) {
      return false;
    }
    if (dt.files && dt.files.length > 0) {
      return true;
    }
    var types = dt.types ? Array.from(dt.types) : [];
    return types.indexOf('Files') >= 0;
  }

  function composeDropInComposeCard(target) {
    if (!state.compose.open || !els.composeSlot || !target || !(target instanceof Element)) {
      return false;
    }
    return !!target.closest('.blog-compose-card');
  }

  function clearComposeDropHover() {
    if (composeDropHoverTimer) {
      clearTimeout(composeDropHoverTimer);
      composeDropHoverTimer = null;
    }
    if (!els.composeSlot) {
      return;
    }
    var active = els.composeSlot.querySelector('.blog-compose-card.is-drop-hover');
    if (active) {
      active.classList.remove('is-drop-hover');
    }
  }

  function setComposeDropHover(target) {
    if (!els.composeSlot || !target || !(target instanceof Element)) {
      return;
    }
    var card = target.closest('.blog-compose-card');
    if (!card) {
      return;
    }
    var active = els.composeSlot.querySelector('.blog-compose-card.is-drop-hover');
    if (active && active !== card) {
      active.classList.remove('is-drop-hover');
    }
    card.classList.add('is-drop-hover');
    if (composeDropHoverTimer) {
      clearTimeout(composeDropHoverTimer);
    }
    composeDropHoverTimer = setTimeout(function () {
      clearComposeDropHover();
    }, 150);
  }

  function composeCanAcceptDroppedFiles(postType) {
    if (state.compose.cameraFullscreen) {
      return false;
    }
    var type = normalizeComposePostType(postType);
    if (!type) {
      return true;
    }
    return type !== 'shortform' && type !== 'capture-media';
  }

  function composePreferredDropType(files, currentType) {
    var type = normalizeComposePostType(currentType);
    var list = Array.from(files || []);
    if (!list.length) {
      return '';
    }
    var allAudio = list.every(function (file) {
      return String((file && file.type) || '').toLowerCase().indexOf('audio/') === 0;
    });
    var allVisual = list.every(function (file) {
      var mime = String((file && file.type) || '').toLowerCase();
      return mime.indexOf('image/') === 0 || mime.indexOf('video/') === 0;
    });
    if (type) {
      if (type === 'upload-media' && !allVisual) {
        return 'attachment';
      }
      if (type === 'audio-note' && !allAudio) {
        return 'attachment';
      }
      if (type === 'shortform' || type === 'capture-media') {
        return '';
      }
      return '';
    }
    // When chooser is showing (no type selected), auto-pick based on dropped file kind:
    // image files -> image upload mode, everything else -> attachment mode.
    var allImages = list.every(function (file) {
      return String((file && file.type) || '').toLowerCase().indexOf('image/') === 0;
    });
    if (allImages) {
      return 'upload-media';
    }
    return 'attachment';
  }

  function composePickerFieldByType(type) {
    var picked = normalizeComposePostType(type);
    if (picked === 'capture-media') return 'capture-upload';
    if (picked === 'upload-media') return 'media-upload';
    if (picked === 'attachment') return 'file-upload';
    if (picked === 'audio-note') return 'audio-upload';
    return '';
  }

  function openComposePickerForType(type) {
    if (!els.composeSlot) {
      return false;
    }
    var field = composePickerFieldByType(type);
    if (!field) {
      return false;
    }
    var picker = els.composeSlot.querySelector('[data-compose-field="' + field + '"]');
    if (!(picker instanceof HTMLInputElement)) {
      return false;
    }
    picker.click();
    return true;
  }

  function composeCameraOverlayHtml() {
    var status = state.compose.cameraStarting
      ? 'Requesting camera access...'
      : (state.compose.cameraError ? escapeHtml(state.compose.cameraError) : 'Frame your shot and capture.');
    return '' +
      '<div class="blog-compose-camera-overlay-shell">' +
        '<div class="blog-compose-camera-overlay-stage">' +
          '<video class="blog-compose-camera-overlay-video" data-compose-camera-fullscreen-preview playsinline autoplay muted></video>' +
        '</div>' +
        '<div class="blog-compose-camera-overlay-controls">' +
          '<button type="button" class="unobtrusive-icon-button blog-compose-camera-control" data-compose-action="cancel-camera-capture">Cancel</button>' +
          '<button type="button" class="list-admin-primary-btn blog-compose-camera-capture" data-compose-action="capture-photo">Capture Photo</button>' +
        '</div>' +
        '<div class="blog-compose-camera-overlay-status">' + status + '</div>' +
      '</div>';
  }

  function renderComposeCameraOverlay() {
    if (!root) {
      return;
    }
    var shouldShow = !!(state.compose.open && state.compose.cameraFullscreen);
    var overlay = root.querySelector('.blog-compose-camera-overlay');
    if (!shouldShow) {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      if (document && document.body) {
        document.body.classList.remove('blog-camera-mode-active');
      }
      return;
    }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'blog-compose-camera-overlay';
      root.appendChild(overlay);
    }
    overlay.innerHTML = composeCameraOverlayHtml();
    if (document && document.body) {
      document.body.classList.add('blog-camera-mode-active');
    }
    attachComposeCameraPreview();
  }

  function openComposeCameraCapture(options) {
    ensureComposeStateShape();
    var opts = options || {};
    state.compose.postType = 'capture-media';
    state.compose.cameraFullscreen = true;
    state.compose.cameraReturnToChooser = !!opts.returnToChooser;
    if (opts.returnToChooser) {
      state.compose.postTypeChosen = false;
      state.compose.postTypeToolbarCollapsed = false;
    }
    renderComposeUi();
    ensureComposeCameraStream();
    attachComposeCameraPreview();
  }

  function closeComposeCameraCapture(options) {
    ensureComposeStateShape();
    var opts = options || {};
    var shouldReturnToChooser = !!opts.returnToChooser || !!state.compose.cameraReturnToChooser;
    state.compose.cameraFullscreen = false;
    state.compose.cameraReturnToChooser = false;
    stopComposeCameraStream();
    if (shouldReturnToChooser) {
      state.compose.postTypeChosen = false;
      state.compose.postTypeToolbarCollapsed = false;
    }
    renderComposeUi();
  }

  function stopComposeCameraStream() {
    ensureComposeStateShape();
    var stream = state.compose.cameraStream;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach(function (track) {
        if (track && typeof track.stop === 'function') {
          track.stop();
        }
      });
    }
    state.compose.cameraStream = null;
    state.compose.cameraStarting = false;
  }

  function attachComposeCameraPreview() {
    if (!root) {
      return;
    }
    var previews = root.querySelectorAll('[data-compose-camera-preview], [data-compose-camera-fullscreen-preview]');
    Array.prototype.forEach.call(previews, function (video) {
      if (!(video instanceof HTMLVideoElement)) {
        return;
      }
      if (state.compose.cameraStream && video.srcObject !== state.compose.cameraStream) {
        video.srcObject = state.compose.cameraStream;
      }
      if (video.srcObject) {
        video.play().catch(function () {
          // Ignore autoplay restrictions; controls are still available.
        });
      }
    });
  }

  function ensureComposeCameraStream() {
    ensureComposeStateShape();
    if (state.compose.cameraStream || state.compose.cameraStarting) {
      attachComposeCameraPreview();
      return;
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      state.compose.cameraError = 'Camera is unavailable in this browser.';
      renderComposeUi();
      return;
    }
    state.compose.cameraStarting = true;
    state.compose.cameraError = '';
    renderComposeUi();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .catch(function () {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      })
      .then(function (stream) {
        state.compose.cameraStream = stream || null;
      })
      .catch(function (err) {
        state.compose.cameraError = String((err && err.message) || 'Could not access camera.');
      })
      .finally(function () {
        state.compose.cameraStarting = false;
        renderComposeUi();
      });
  }

  function stopComposeAudioStream() {
    ensureComposeStateShape();
    var recorder = state.compose.audioRecorder;
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = null;
      recorder.onerror = null;
      try {
        recorder.stop();
      } catch (_err) {
        // Ignore stop errors.
      }
    }
    var stream = state.compose.audioStream;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach(function (track) {
        if (track && typeof track.stop === 'function') {
          track.stop();
        }
      });
    }
    state.compose.audioStream = null;
    state.compose.audioRecorder = null;
    state.compose.audioChunks = [];
    state.compose.audioStarting = false;
    state.compose.audioRecording = false;
  }

  function ensureComposeAudioStream() {
    ensureComposeStateShape();
    if (state.compose.audioStream) {
      return Promise.resolve(state.compose.audioStream);
    }
    if (state.compose.audioStarting) {
      return Promise.resolve(null);
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      state.compose.audioError = 'Microphone is unavailable in this browser.';
      renderComposeUi();
      return Promise.resolve(null);
    }
    state.compose.audioStarting = true;
    state.compose.audioError = '';
    renderComposeUi();
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(function (stream) {
        state.compose.audioStream = stream || null;
        return state.compose.audioStream;
      })
      .catch(function (err) {
        state.compose.audioError = String((err && err.message) || 'Could not access microphone.');
        return null;
      })
      .finally(function () {
        state.compose.audioStarting = false;
        renderComposeUi();
      });
  }

  function preferredComposeAudioMimeType() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    var candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4'
    ];
    for (var idx = 0; idx < candidates.length; idx += 1) {
      if (MediaRecorder.isTypeSupported(candidates[idx])) {
        return candidates[idx];
      }
    }
    return '';
  }

  function startComposeAudioRecording() {
    ensureComposeStateShape();
    if (state.compose.audioRecording || state.compose.audioStarting) {
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      state.compose.audioError = 'Audio recording is unavailable in this browser.';
      renderComposeUi();
      return;
    }
    ensureComposeAudioStream().then(function (stream) {
      if (!stream || state.compose.audioRecording) {
        return;
      }
      var recorder;
      var preferredMime = preferredComposeAudioMimeType();
      try {
        recorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      } catch (_err) {
        try {
          recorder = new MediaRecorder(stream);
        } catch (fallbackErr) {
          state.compose.audioError = String((fallbackErr && fallbackErr.message) || 'Could not start recording.');
          renderComposeUi();
          return;
        }
      }
      state.compose.audioChunks = [];
      state.compose.audioRecorder = recorder;
      state.compose.audioError = '';
      recorder.ondataavailable = function (event) {
        if (event && event.data && event.data.size > 0) {
          state.compose.audioChunks.push(event.data);
        }
      };
      recorder.onerror = function (event) {
        state.compose.audioError = String((event && event.error && event.error.message) || 'Recording failed.');
      };
      recorder.onstop = function () {
        var chunks = Array.isArray(state.compose.audioChunks) ? state.compose.audioChunks.slice() : [];
        state.compose.audioChunks = [];
        state.compose.audioRecorder = null;
        state.compose.audioRecording = false;
        if (!chunks.length) {
          renderComposeUi();
          return;
        }
        var mime = (chunks[0] && chunks[0].type) ? String(chunks[0].type) : String(recorder.mimeType || preferredMime || 'audio/webm');
        var blob = new Blob(chunks, { type: mime });
        var ext = mime.indexOf('ogg') >= 0 ? 'ogg' : (mime.indexOf('mp4') >= 0 ? 'm4a' : 'webm');
        var file = new File([blob], 'voice-note-' + Date.now() + '.' + ext, { type: mime });
        handleComposeUploads([file], 'audio-note');
        renderComposeUi();
      };
      try {
        recorder.start(250);
      } catch (err) {
        try {
          recorder.start();
        } catch (fallbackStartErr) {
          state.compose.audioRecorder = null;
          state.compose.audioRecording = false;
          state.compose.audioError = String((fallbackStartErr && fallbackStartErr.message) || 'Could not start recording.');
          renderComposeUi();
          return;
        }
      }
      state.compose.audioRecording = true;
      state.compose.audioError = '';
      renderComposeUi();
    });
  }

  function stopComposeAudioRecording() {
    ensureComposeStateShape();
    var recorder = state.compose.audioRecorder;
    if (!recorder || recorder.state !== 'recording') {
      return;
    }
    try {
      recorder.stop();
    } catch (_err) {
      state.compose.audioRecording = false;
      state.compose.audioRecorder = null;
      renderComposeUi();
    }
  }

  function capturePhotoFromComposeCamera() {
    if (!root) {
      return;
    }
    var video = root.querySelector('[data-compose-camera-fullscreen-preview]') || root.querySelector('[data-compose-camera-preview]');
    if (!(video instanceof HTMLVideoElement)) {
      setComposeOutput('Camera preview is not ready yet.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    var width = video.videoWidth;
    var height = video.videoHeight;
    if (!width || !height) {
      setComposeOutput('Camera preview is still starting. Try again in a moment.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      setComposeOutput('Could not capture from camera.', 'error');
      renderComposeStatusOnly();
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(function (blob) {
      if (!blob) {
        setComposeOutput('Could not capture photo.', 'error');
        renderComposeStatusOnly();
        return;
      }
      var file = new File([blob], 'capture-' + Date.now() + '.jpg', { type: 'image/jpeg' });
      state.compose.cameraFullscreen = false;
      state.compose.cameraReturnToChooser = false;
      state.compose.postType = 'capture-media';
      state.compose.postTypeChosen = true;
      state.compose.preview = false;
      stopComposeCameraStream();
      renderComposeUi();
      handleComposeUploads([file], 'capture-media');
    }, 'image/jpeg', 0.92);
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

  function composeNormalizeScheduledDate(value) {
    var raw = String(value || '').trim();
    if (!raw) {
      return '';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
      return raw.slice(0, 10);
    }
    var dt = new Date(raw);
    if (isNaN(dt.getTime())) {
      return '';
    }
    var local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
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

  function normalizeComposePublishDestination(raw) {
    var picked = String(raw || '').trim().toLowerCase();
    if (picked === 'nostr_now') {
      return 'nostr_now';
    }
    return 'local_only';
  }

  function composePublishDestination() {
    ensureComposeStateShape();
    if (!els.composeSlot) {
      return normalizeComposePublishDestination(state.compose.publishDestination);
    }
    var checked = els.composeSlot.querySelector('input[name="blog-inline-compose-destination"]:checked');
    var value = checked ? String(checked.value || '') : String(state.compose.publishDestination || '');
    return normalizeComposePublishDestination(value);
  }

  function composePrimaryLabel(mode, destination) {
    var shared = (typeof window !== 'undefined' && window.BlogComposeShared) ? window.BlogComposeShared : null;
    if (shared && typeof shared.primaryPublishLabel === 'function') {
      return shared.primaryPublishLabel(mode, destination, { postTypeLocked: !!state.compose.postTypeLocked });
    }
    if (state.compose.postTypeLocked) {
      return 'Publish Changes';
    }
    if (mode === 'scheduled') {
      return 'Schedule Post';
    }
    if (mode === 'drip') {
      return 'Enqueue Post';
    }
    if (normalizeComposePublishDestination(destination) === 'local_only') {
      return 'Publish to Server';
    }
    return 'Publish to Nostr';
  }

  function composePublishDestinationFieldHtml(destination) {
    var shared = (typeof window !== 'undefined' && window.BlogComposeShared) ? window.BlogComposeShared : null;
    if (shared && typeof shared.renderPublishDestinationField === 'function') {
      return shared.renderPublishDestinationField({
        inputName: 'blog-inline-compose-destination',
        destination: destination
      });
    }
    return '' +
      '<strong>Publish to</strong>' +
      '<div class="mode-row">' +
        '<label><input type="radio" name="blog-inline-compose-destination" value="local_only"' + (destination === 'local_only' ? ' checked' : '') + '> Server only</label>' +
        '<label><input type="radio" name="blog-inline-compose-destination" value="nostr_now"' + (destination === 'nostr_now' ? ' checked' : '') + '> Server + Nostr</label>' +
      '</div>';
  }

  function composeModeAction(mode, destination) {
    if (state.compose.postTypeLocked) {
      return 'publish_now';
    }
    if (mode === 'scheduled') {
      return 'queue_scheduled';
    }
    if (mode === 'drip') {
      return 'queue_drip';
    }
    return 'publish_now';
  }

  function openComposeScheduledPicker() {
    if (!els.composeSlot || !state.compose.open) {
      return;
    }
    if (composePublishMode() !== 'scheduled') {
      return;
    }
    var scheduleInput = els.composeSlot.querySelector('[data-compose-field="scheduled-at"]');
    if (!(scheduleInput instanceof HTMLInputElement)) {
      return;
    }
    var releaseRow = scheduleInput.closest('.compose-release-row');
    var scheduleOption = els.composeSlot.querySelector('input[name="blog-inline-compose-mode"][value="scheduled"]');
    var scheduleAnchor = scheduleOption instanceof HTMLInputElement
      ? (scheduleOption.closest('label') || scheduleOption)
      : null;
    if (releaseRow && scheduleAnchor instanceof Element) {
      var rowRect = releaseRow.getBoundingClientRect();
      var anchorRect = scheduleAnchor.getBoundingClientRect();
      var left = Math.max(0, Math.round(anchorRect.left - rowRect.left));
      var top = Math.max(0, Math.round(anchorRect.bottom - rowRect.top + 3));
      scheduleInput.style.left = String(left) + 'px';
      scheduleInput.style.top = String(top) + 'px';
    }
    try {
      if (typeof scheduleInput.showPicker === 'function') {
        scheduleInput.showPicker();
      } else {
        scheduleInput.focus();
        scheduleInput.click();
      }
    } catch (_err) {
      try {
        scheduleInput.focus();
      } catch (_focusErr) {
        // Ignore picker focus errors.
      }
    }
  }

  function composeScheduledDisplayValue(rawValue) {
    var value = composeNormalizeScheduledDate(rawValue);
    if (!value) {
      return 'No schedule selected';
    }
    return value;
  }

  function composeToolbarButtonHtml(action, label, icon) {
    return '<button type="button" class="unobtrusive-icon-button toolbar-button" data-compose-toolbar="' + escapeHtml(action) + '" aria-label="' + escapeHtml(label) + '" title="' + escapeHtml(label) + '">' + icon + '</button>';
  }

  function composeToolbarHtml() {
    return '' +
      '<div class="toolbar blog-compose-toolbar" aria-label="Markdown toolbar">' +
        composeToolbarButtonHtml('bold', 'Bold', '<span class="tb-glyph tb-glyph-bold" aria-hidden="true">B</span>') +
        composeToolbarButtonHtml('italic', 'Italic', '<span class="tb-glyph tb-glyph-italic" aria-hidden="true">I</span>') +
        composeToolbarButtonHtml('h2', 'Heading 2', '<span class="tb-glyph tb-glyph-heading" aria-hidden="true">H2</span>') +
        composeToolbarButtonHtml('h3', 'Heading 3', '<span class="tb-glyph tb-glyph-heading" aria-hidden="true">H3</span>') +
        composeToolbarButtonHtml('code', 'Inline code', '<span class="tb-glyph tb-glyph-code" aria-hidden="true">&lt;/&gt;</span>') +
        composeToolbarButtonHtml('code_block', 'Code block', '<span class="tb-glyph tb-glyph-code" aria-hidden="true">{ }</span>') +
        composeToolbarButtonHtml('link', 'Insert link', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 13.9L8.4 15.5C6.8 17.1 4.2 17.1 2.6 15.5C1 13.9 1 11.3 2.6 9.7L4.2 8.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14 10.1L15.6 8.5C17.2 6.9 19.8 6.9 21.4 8.5C23 10.1 23 12.7 21.4 14.3L19.8 15.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9 12H15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>') +
        composeToolbarButtonHtml('quote', 'Quote', '<span class="tb-glyph tb-glyph-quote" aria-hidden="true">“”</span>') +
        composeToolbarButtonHtml('ul', 'Bullet list', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5.1" cy="7.2" r="1.2" fill="currentColor"/><circle cx="5.1" cy="12" r="1.2" fill="currentColor"/><circle cx="5.1" cy="16.8" r="1.2" fill="currentColor"/><path d="M9.2 7.2H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M9.2 12H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M9.2 16.8H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>') +
        composeToolbarButtonHtml('ol', 'Numbered list', '<span class="tb-glyph tb-glyph-list" aria-hidden="true">1.</span>') +
        composeToolbarButtonHtml('image', 'Insert image', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.6" y="5.1" width="16.8" height="13.8" rx="2.1" stroke="currentColor" stroke-width="1.8"/><circle cx="9.2" cy="10.2" r="1.2" fill="currentColor"/><path d="M6.2 16.1L10.7 11.7L13.2 14.2L16.1 11.5L17.8 13.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>') +
        composeToolbarButtonHtml('attachment', 'Attach file', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.2 12.8L14.4 7.6C15.8 6.2 18 6.2 19.4 7.6C20.8 9 20.8 11.2 19.4 12.6L11.2 20.8C8.9 23.1 5.2 23.1 2.9 20.8C0.6 18.5 0.6 14.8 2.9 12.5L11 4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>') +
        composeToolbarButtonHtml('audio_record', 'Record audio', '<svg class="tb-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="6.2" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>') +
      '</div>';
  }

  function composeModePanelHtml(postType, fields) {
    var type = normalizeComposePostType(postType);
    if (type === 'capture-media') {
      return '' +
        '<div class="compose-media-tools compose-mode-panel compose-camera-panel">' +
          '<div class="compose-media-actions">' +
            '<button type="button" class="list-admin-primary-btn compose-media-btn compose-media-btn-primary" data-compose-action="open-camera-capture">Open Camera</button>' +
            '<button type="button" class="unobtrusive-icon-button compose-media-btn" data-compose-action="open-mode-picker" data-compose-mode-target="capture-media">Use Camera App / Upload</button>' +
          '</div>' +
          '<div class="compose-camera-status">' +
            (state.compose.cameraError ? escapeHtml(state.compose.cameraError) : 'Open camera for fullscreen capture, or upload from device.') +
          '</div>' +
        '</div>';
    }
    if (type === 'upload-media') {
      return '';
    }
    if (type === 'attachment') {
      return '';
    }
    if (type === 'audio-note') {
      return '';
    }
    if (type === 'link-share') {
      return '' +
        '<div class="compose-media-tools compose-mode-panel">' +
          '<div class="compose-link-fields">' +
            '<label><strong>Link URL</strong></label>' +
            '<input type="url" data-compose-field="link-url" placeholder="https://example.com" value="' + escapeHtml(fields.linkUrl) + '">' +
          '</div>' +
        '</div>';
    }
    return '';
  }

  function applyComposeModeEffects(postType) {
    var type = normalizeComposePostType(postType);
    root.classList.remove('blog-camera-mode');
    if (!state.compose.open || !state.compose.cameraFullscreen) {
      stopComposeCameraStream();
    } else {
      ensureComposeCameraStream();
      attachComposeCameraPreview();
    }
    if (!state.compose.open || type !== 'audio-note') {
      stopComposeAudioStream();
    }
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
    return '<svg class="trash-icon-svg" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>';
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
    return {
      title: title instanceof HTMLInputElement ? String(title.value || '') : '',
      content: content instanceof HTMLTextAreaElement ? String(content.value || '') : '',
      scheduledAt: scheduled instanceof HTMLInputElement ? composeNormalizeScheduledDate(String(scheduled.value || '')) : '',
      tags: tags instanceof HTMLInputElement ? String(tags.value || '') : '',
      linkUrl: linkUrl instanceof HTMLInputElement ? String(linkUrl.value || '') : String(state.compose.linkUrl || ''),
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
      var linkMd = composeBuildLinkMarkdown(fields.linkUrl, fields.content, fields.title);
      if (linkMd) {
        payloadContent = linkMd;
      }
      state.compose.linkUrl = String(fields.linkUrl || '');
    }
    return {
      action: action,
      draft_id: String(state.compose.draftId || ''),
      source_post_path: String(state.compose.sourcePostPath || ''),
      title: fields.postType === 'shortform' ? '' : fields.title.trim(),
      tags: fields.tags.trim(),
      summary: '',
      content: payloadContent,
      post_type: composeBackingPostType(fields.postType),
      scheduled_at: composeLocalToIso(fields.scheduledAt),
      publish_mode: composePublishMode(),
      publish_destination: composePublishDestination()
    };
  }

  function setComposeOutput(message, tone) {
    var text = String(message || '').trim();
    var safeTone = String(tone || '').trim().toLowerCase();
    if (safeTone === 'error' || safeTone === 'warn') {
      if (text) {
        showTopToast(text, safeTone === 'error' ? 'error' : 'warn', safeTone === 'error' ? 3800 : 3400);
      }
      state.compose.output = '';
      state.compose.outputTone = '';
      return;
    }
    state.compose.output = text;
    state.compose.outputTone = safeTone;
  }

  function captureComposeFieldFocus() {
    if (!els.composeSlot) {
      return null;
    }
    var active = document.activeElement;
    var isTextControl = (active instanceof HTMLInputElement) || (active instanceof HTMLTextAreaElement);
    var isTagEditor = (active instanceof HTMLElement) && String(active.getAttribute('data-compose-field') || '') === 'tags-editor';
    if (!isTextControl && !isTagEditor) {
      return null;
    }
    if (!els.composeSlot.contains(active)) {
      return null;
    }
    var field = String(active.getAttribute('data-compose-field') || '').trim();
    if (!field) {
      return null;
    }
    var snapshot = {
      field: field,
      scrollTop: typeof active.scrollTop === 'number' ? active.scrollTop : 0,
      scrollLeft: typeof active.scrollLeft === 'number' ? active.scrollLeft : 0
    };
    if (isTextControl) {
      snapshot.selectionStart = typeof active.selectionStart === 'number' ? active.selectionStart : null;
      snapshot.selectionEnd = typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
      snapshot.selectionDirection = typeof active.selectionDirection === 'string' ? active.selectionDirection : 'none';
      return snapshot;
    }
    snapshot.tagsDraftText = String(state.compose.tagsDraftText || '');
    return snapshot;
  }

  function restoreComposeFieldFocus(snapshot) {
    if (!snapshot || !els.composeSlot) {
      return;
    }
    var selector = '[data-compose-field="' + String(snapshot.field || '').replace(/"/g, '\\"') + '"]';
    var target = els.composeSlot.querySelector(selector);
    if ((target instanceof HTMLElement) && String(snapshot.field || '') === 'tags-editor') {
      state.compose.tagsDraftText = typeof snapshot.tagsDraftText === 'string' ? snapshot.tagsDraftText : String(state.compose.tagsDraftText || '');
      composeTagsEditorRender(target);
      composeTagsEditorFocusDraft(target);
      return;
    }
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return;
    }
    try {
      target.focus({ preventScroll: true });
    } catch (_focusErr) {
      target.focus();
    }
    if (typeof snapshot.selectionStart === 'number' && typeof snapshot.selectionEnd === 'number' && typeof target.setSelectionRange === 'function') {
      try {
        target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection || 'none');
      } catch (_selectionErr) {
        // Ignore selection restore errors.
      }
    }
    try {
      target.scrollTop = Number(snapshot.scrollTop) || 0;
      target.scrollLeft = Number(snapshot.scrollLeft) || 0;
    } catch (_scrollErr) {
      // Ignore scroll restore errors.
    }
  }

  function renderComposeUiPreserveFieldFocus() {
    var focusSnapshot = captureComposeFieldFocus();
    renderComposeUi();
    if (focusSnapshot) {
      restoreComposeFieldFocus(focusSnapshot);
    }
  }

  function toastHost() {
    var host = document.getElementById('nav-top-toast-host');
    if (host) {
      return host;
    }
    if (!document || !document.body) {
      return null;
    }
    host = document.createElement('div');
    host.id = 'nav-top-toast-host';
    host.className = 'nav-top-toast-host';
    document.body.appendChild(host);
    return host;
  }

  function showTopToast(message, tone, ttlMs) {
    var text = String(message || '').trim();
    if (!text) {
      return;
    }
    var host = toastHost();
    if (!host) {
      return;
    }
    var kind = String(tone || '').trim().toLowerCase();
    var safeTone = (kind === 'ok' || kind === 'warn' || kind === 'error') ? kind : '';
    var toast = document.createElement('div');
    toast.className = 'nav-top-toast' + (safeTone ? (' is-' + safeTone) : '');
    toast.textContent = text;
    host.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add('is-visible');
    });
    var stayMs = Math.max(1800, Number(ttlMs) || 3200);
    window.setTimeout(function () {
      toast.classList.remove('is-visible');
      toast.classList.add('is-closing');
      window.setTimeout(function () {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 240);
    }, stayMs);
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
    }, 500);
  }

  function flushComposeAutosaveNow() {
    if (!isAdmin() || !state.compose.open) {
      return;
    }
    if (state.compose.autosaveTimer) {
      clearTimeout(state.compose.autosaveTimer);
      state.compose.autosaveTimer = null;
    }
    autosaveCompose();
  }

  function afterComposePublishSuccess() {
    state.compose.draftId = '';
    state.compose.sourcePostPath = '';
    state.compose.postTypeLocked = false;
    state.compose.postTypeChosen = false;
    state.compose.saveStatus = '';
    state.compose.uploading = 0;
    state.compose.postType = 'longform';
    state.compose.tagsOpen = false;
    state.compose.tagsDraftText = '';
    state.compose.publishDestination = 'local_only';
    state.compose.shortformLimitEditing = false;
    state.compose.linkUrl = '';
    state.compose.pendingContentAdditions = [];
    clearComposeUploadItems();
    stopComposeCameraStream();
    stopComposeAudioStream();
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
    var localOnlyTarget = els.composeSlot.querySelector('input[name="blog-inline-compose-destination"][value="local_only"]');
    if (localOnlyTarget instanceof HTMLInputElement) {
      localOnlyTarget.checked = true;
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
        setComposeOutput('', '');
        showTopToast('Published. Rebuild may take a few seconds.', 'ok', 2600);
        afterComposePublishSuccess();
        toggleComposeFromUi(false);
      } else {
        setComposeOutput((data && data.message) || 'Saved.', 'ok');
      }
      renderComposeUi();
      loadPosts();
      loadDraftNoticeData();
      setTimeout(function () { loadPosts(); }, 2500);
    }).catch(function (err) {
      var message = err && err.message ? err.message : 'Save failed';
      if (action === 'autosave') {
        state.compose.saveStatus = '';
        renderComposeStatusOnly();
        return;
      }
      setComposeOutput('Error: ' + message, 'error');
      renderComposeStatusOnly();
    }).finally(function () {
      state.compose.busy = false;
      renderComposeStatusOnly();
    });
  }

  function clearComposeFields() {
    state.compose.draftId = '';
    state.compose.sourcePostPath = '';
    state.compose.postTypeLocked = false;
    state.compose.postTypeChosen = false;
    state.compose.saveStatus = '';
    state.compose.uploading = 0;
    state.compose.postType = 'longform';
    state.compose.tagsOpen = false;
    state.compose.tagsDraftText = '';
    state.compose.publishDestination = 'local_only';
    state.compose.shortformLimitEditing = false;
    state.compose.linkUrl = '';
    clearComposeUploadItems();
    stopComposeCameraStream();
    stopComposeAudioStream();
    setComposeOutput('', '');
    seedComposeDefaultTag(true);
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
    var localOnlyTarget = els.composeSlot.querySelector('input[name="blog-inline-compose-destination"][value="local_only"]');
    if (localOnlyTarget instanceof HTMLInputElement) {
      localOnlyTarget.checked = true;
    }
    renderComposeUi();
  }

  function deleteComposeDraft() {
    var fields = readComposeFields() || { title: '', content: '' };
    var hasTitle = composePostType() === 'shortform' ? false : !!String(fields.title || '').trim();
    var hasContent = hasTitle ||
      !!String(fields.content || '').trim() ||
      !!String(fields.linkUrl || '').trim() ||
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
      loadDraftNoticeData();
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
    ensureComposeStateShape();
    state.compose.open = !!open;
    if (!state.compose.open) {
      clearComposePostTypeCollapseTimer();
      state.compose.postTypeToolbarCollapsed = false;
      state.compose.postTypeLocked = false;
      state.compose.sourcePostPath = '';
      state.compose.cameraFullscreen = false;
      state.compose.cameraReturnToChooser = false;
      clearComposeUploadItems();
    } else {
      state.compose.postTypeToolbarCollapsed = false;
      state.compose.postTypeChosen = false;
      state.compose.postTypeLocked = false;
      state.compose.sourcePostPath = '';
      state.compose.cameraFullscreen = false;
      state.compose.cameraReturnToChooser = false;
      clearComposeUploadItems();
      if (!state.compose.draftId && !state.compose.sourcePostPath) {
        seedComposeDefaultTag(false);
      }
    }
    try {
      renderComposeUi();
    } catch (err) {
      state.compose.open = false;
      clearComposePostTypeCollapseTimer();
      stopComposeCameraStream();
      stopComposeAudioStream();
      if (window && window.console && typeof window.console.error === 'function') {
        window.console.error('Compose render failed', err);
      }
      if (els.composeSlot) {
        els.composeSlot.hidden = true;
        els.composeSlot.classList.remove('is-open');
        els.composeSlot.innerHTML = '';
      }
      if (els.composeFab) {
        els.composeFab.classList.remove('is-open');
        els.composeFab.setAttribute('aria-expanded', 'false');
        els.composeFab.setAttribute('aria-pressed', 'false');
        els.composeFab.setAttribute('aria-label', 'Compose');
      }
      setComposeOutput('Compose failed to open. Reload and try again.', 'error');
      return;
    }
    if (state.compose.open && els.composeSlot) {
      setTimeout(function () {
        if (els.composeSlot && typeof els.composeSlot.scrollIntoView === 'function') {
          try {
            els.composeSlot.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
          } catch (_err) {
            els.composeSlot.scrollIntoView(true);
          }
        }
        var focusTarget = els.composeSlot.querySelector('[data-compose-action="toggle-post-type-toolbar"]');
        if (!state.compose.postTypeChosen) {
          focusTarget = els.composeSlot.querySelector('[data-compose-post-type]');
        } else if (!focusTarget) {
          focusTarget = composePostType() === 'shortform'
            ? els.composeSlot.querySelector('[data-compose-field="content"]')
            : els.composeSlot.querySelector('[data-compose-field="title"]');
        }
        if (focusTarget && typeof focusTarget.focus === 'function') {
          focusTarget.focus();
        }
      }, 30);
    }
  }

  function toggleComposeFromUi(nextOpen) {
    var now = Date.now();
    if (now < composeToggleGuardUntil) {
      return;
    }
    composeToggleGuardUntil = now + 120;
    setComposeOpen(!!nextOpen);
  }

  function parseComposeTags(raw) {
    return String(raw || '')
      .split(',')
      .map(function (part) { return normalizeTagValue(part); })
      .filter(Boolean);
  }

  function openComposeDraftInPlace(draftId, options) {
    var opts = options || {};
    var id = String(draftId || '').trim();
    if (!id) {
      return Promise.reject(new Error('Draft id is missing.'));
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      return Promise.reject(new Error('Sign in as admin first.'));
    }
    return apiPost('/cgi/blog-get-draft', {
      draft_id: id,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      if (!data || !data.success || !data.draft) {
        throw new Error((data && data.error) ? data.error : 'Could not load draft');
      }
      var draft = data.draft || {};
      ensureComposeStateShape();
      state.compose.open = true;
      state.compose.preview = false;
      state.compose.busy = false;
      state.compose.saveStatus = '';
      state.compose.output = '';
      state.compose.outputTone = '';
      state.compose.draftId = String(draft.draft_id || id).trim();
      state.compose.sourcePostPath = String(draft.source_post_path || '').trim();
      state.compose.postType = normalizeComposePostType(draft.post_type || 'longform');
      state.compose.postTypeChosen = true;
      state.compose.postTypeLocked = !!opts.lockPostType;
      state.compose.postTypeToolbarCollapsed = true;
      state.compose.tagsOpen = false;
      state.compose.tagsDraftText = '';
      state.compose.linkUrl = '';
      state.compose.shortformLimitEditing = false;
      state.compose.publishDestination = 'local_only';
      stopComposeCameraStream();
      stopComposeAudioStream();
      setComposeTags(parseComposeTags(draft.tags || ''));
      if (els.composeSlot) {
        els.composeSlot.innerHTML = '';
      }
      renderComposeUi();
      if (els.composeSlot) {
        var titleInput = els.composeSlot.querySelector('[data-compose-field="title"]');
        var contentInput = els.composeSlot.querySelector('[data-compose-field="content"]');
        var linkUrlInput = els.composeSlot.querySelector('[data-compose-field="link-url"]');
        var scheduleInput = els.composeSlot.querySelector('[data-compose-field="scheduled-at"]');
        var loadedContent = String(draft.content || '');
        if (state.compose.postType === 'link-share') {
          var parsedLink = parseComposeLinkShareContent(loadedContent);
          state.compose.linkUrl = parsedLink.url;
          loadedContent = parsedLink.body;
        }
        if (titleInput instanceof HTMLInputElement) {
          titleInput.value = String(draft.title || '');
        }
        if (contentInput instanceof HTMLTextAreaElement) {
          contentInput.value = loadedContent;
        }
        if (linkUrlInput instanceof HTMLInputElement) {
          linkUrlInput.value = String(state.compose.linkUrl || '');
        }
        if (scheduleInput instanceof HTMLInputElement) {
          scheduleInput.value = composeNormalizeScheduledDate(String(draft.scheduled_at_local || ''));
        }
      }
      if (els.composeSlot && typeof els.composeSlot.scrollIntoView === 'function') {
        try {
          els.composeSlot.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        } catch (_err) {
          els.composeSlot.scrollIntoView(true);
        }
      }
      window.setTimeout(function () {
        if (!els.composeSlot) {
          return;
        }
        var postType = normalizeComposePostType(state.compose.postType);
        var focusInput = postType === 'shortform'
          ? els.composeSlot.querySelector('[data-compose-field="content"]')
          : els.composeSlot.querySelector('[data-compose-field="title"]');
        if (focusInput && typeof focusInput.focus === 'function') {
          focusInput.focus();
          if (focusInput.setSelectionRange) {
            var length = String(focusInput.value || '').length;
            focusInput.setSelectionRange(length, length);
          }
        }
      }, 30);
      return true;
    });
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
    function applyEdit(start, end, nextText, cursorStart, cursorEnd) {
      var replacement = String(nextText || '');
      var selStart = Math.max(0, Number(start) || 0);
      var selEnd = Math.max(selStart, Number(end) || selStart);
      if (typeof textarea.setRangeText === 'function') {
        textarea.focus();
        textarea.setRangeText(replacement, selStart, selEnd, 'preserve');
      } else {
        var currentValue = String(textarea.value || '');
        textarea.value = currentValue.slice(0, selStart) + replacement + currentValue.slice(selEnd);
      }
      placeCursor(selStart + (Number(cursorStart) || 0), selStart + (Number(cursorEnd) || 0));
    }
    function replaceSelection(transformer) {
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      var selected = textarea.value.slice(start, end);
      var updated = transformer(selected);
      applyEdit(start, end, updated.text, updated.cursorStart, updated.cursorEnd);
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
      applyEdit(lineStart, lineEnd, next, 0, next.length);
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
    } else if (action === 'audio_record') {
      if (composePostType() !== 'audio-note') {
        setComposePostType('audio-note', { skipAutosave: true, interactive: true });
        return;
      }
      if (state.compose.audioRecording) {
        stopComposeAudioRecording();
      } else {
        startComposeAudioRecording();
      }
      return;
    } else if (action === 'attachment') {
      openComposePickerForType('attachment');
      return;
    }

    queueComposeAutosave();
    renderComposeUi();
  }

  function renderComposeUi() {
    ensureComposeStateShape();
    ensureComposeHosts();
    if (!els.composeSlot || !els.composeFab) {
      renderComposeCameraOverlay();
      return;
    }
    var admin = isAdmin();
    els.composeFab.hidden = !admin;
    if (!admin) {
      state.compose.open = false;
      applyComposeModeEffects('longform');
      els.composeSlot.hidden = true;
      els.composeSlot.classList.remove('is-open');
      els.composeSlot.innerHTML = '';
      renderComposeCameraOverlay();
      return;
    }
    els.composeFab.classList.toggle('is-open', state.compose.open);
    els.composeFab.setAttribute('aria-expanded', state.compose.open ? 'true' : 'false');
    els.composeFab.setAttribute('aria-pressed', state.compose.open ? 'true' : 'false');
    els.composeFab.setAttribute('aria-label', state.compose.open ? 'Close compose' : 'Compose');
    if (!state.compose.open) {
      applyComposeModeEffects('longform');
      els.composeSlot.classList.remove('is-open');
      setTimeout(function () {
        if (!state.compose.open && els.composeSlot) {
          els.composeSlot.hidden = true;
          els.composeSlot.innerHTML = '';
        }
      }, 300);
      renderComposeCameraOverlay();
      return;
    }
    var composeSlotWasVisible = !els.composeSlot.hidden && els.composeSlot.classList.contains('is-open');
    function setComposeSlotOpenHeight() {
      if (!els.composeSlot) {
        return;
      }
      var measuredHeight = Math.ceil(els.composeSlot.scrollHeight || 0);
      var openHeight = Math.max(120, measuredHeight + 8);
      els.composeSlot.style.setProperty('--compose-slot-open-max-height', String(openHeight) + 'px');
    }
    function openComposeSlotAnimated() {
      if (!els.composeSlot) {
        return;
      }
      setComposeSlotOpenHeight();
      if (composeSlotWasVisible) {
        els.composeSlot.classList.add('is-open');
        return;
      }
      els.composeSlot.classList.remove('is-open');
      // Force Firefox to commit the collapsed style before opening.
      void els.composeSlot.offsetHeight;
      requestAnimationFrame(function () {
        if (els.composeSlot && state.compose.open) {
          setComposeSlotOpenHeight();
          els.composeSlot.classList.add('is-open');
        }
      });
    }

    var fields = readComposeFields() || {
      title: '',
      content: '',
      scheduledAt: '',
      tags: '',
      linkUrl: String(state.compose.linkUrl || ''),
      postType: composePostType()
    };
    var mode = composePublishMode();
    var destination = composePublishDestination();
    var postType = normalizeComposePostType(fields.postType);
    if (Array.isArray(state.compose.pendingContentAdditions) && state.compose.pendingContentAdditions.length) {
      var pendingJoined = state.compose.pendingContentAdditions
        .map(function (item) { return String(item || '').trim(); })
        .filter(Boolean)
        .join('\n\n');
      if (pendingJoined) {
        fields.content = String(fields.content || '').trim()
          ? (String(fields.content).replace(/\s*$/, '') + '\n\n' + pendingJoined)
          : pendingJoined;
      }
      state.compose.pendingContentAdditions = [];
    }
    var showTitleField = postType !== 'shortform';
    if (postType !== 'shortform') {
      state.compose.shortformLimitEditing = false;
    }
    state.compose.postType = postType;
    state.compose.publishDestination = destination;
    state.compose.linkUrl = String(fields.linkUrl || '');
    var postTypeLocked = !!state.compose.postTypeLocked;
    var waitingForPostType = !state.compose.postTypeChosen && !postTypeLocked;
    if (waitingForPostType) {
      var chooseHeadRowClass = 'field-row blog-compose-head-row is-type-picker-only';
      var chooseTypeControlClass = 'compose-post-type-control';
      els.composeSlot.hidden = false;
      els.composeSlot.innerHTML = '' +
        '<article class="post-item blog-post-item blog-compose-card blog-compose-type-only">' +
          '<div class="blog-compose-body">' +
            '<div class="blog-compose-type-title"><strong>Compose New Post</strong></div>' +
            '<div class="' + chooseHeadRowClass + '" data-compose-head-row>' +
              '<div class="' + chooseTypeControlClass + ' is-choose-mode" data-compose-type-control>' +
                '<div class="compose-post-type-toolbar-wrap"><div class="compose-post-type-row">' + composeTypeButtonsHtml('', { lockAll: postTypeLocked, noActive: true }) + '</div></div>' +
              '</div>' +
            '</div>' +
            '<input type="file" data-compose-field="capture-upload" data-compose-upload="capture-media" accept="image/*,video/*" capture="environment" multiple hidden>' +
            '<input type="file" data-compose-field="media-upload" data-compose-upload="upload-media" accept="image/*,video/*" multiple hidden>' +
          '</div>' +
        '</article>';
      openComposeSlotAnimated();
      renderComposeCameraOverlay();
      return;
    }
    if (postType === 'shortform') {
      enforceComposeShortformLimitOnFields(fields);
      var shortLimit = currentComposeShortformLimit();
      if (String(fields.content || '').length > shortLimit) {
        fields.content = String(fields.content || '').slice(0, shortLimit);
      }
    }
    var previewContent = fields.content;
    if (postType === 'link-share') {
      var linkPreview = composeBuildLinkMarkdown(fields.linkUrl, fields.content, fields.title);
      if (linkPreview) {
        previewContent = linkPreview;
      }
    }
    var previewTitle = showTitleField ? fields.title : '';
    var previewHtml = renderComposePreviewHtml(previewTitle, previewContent);
    var contentLabel = 'Body';
    var contentPlaceholder = 'Post body';
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
    var titlePlaceholder = 'Post title';
    if (postType === 'shortform') {
      titlePlaceholder = 'Short post';
    } else if (postType === 'link-share') {
      titlePlaceholder = 'Link title (optional)';
    } else if (postType === 'capture-media' || postType === 'upload-media') {
      titlePlaceholder = 'Media title (optional)';
    }
    var mediaToolsHtml = composeModePanelHtml(postType, fields);
    var showPreview = !!state.compose.preview;
    var previewIslandLayout = showPreview;
    var headRowClass = 'field-row blog-compose-head-row' + (state.compose.postTypeToolbarCollapsed ? ' is-type-collapsed' : '');
    var typeControlClass = state.compose.postTypeToolbarCollapsed ? 'compose-post-type-control is-collapsed' : 'compose-post-type-control';
    var shortform = postType === 'shortform';
    var autosaveClass = 'autosave-indicator compose-editor-autosave' +
      (state.compose.saveStatus === 'saving' ? ' is-saving' : '') +
      (state.compose.saveStatus === 'error' ? ' is-error' : '') +
      (shortform ? ' is-shortform-corner' : '');
    var shortformCornerHtml = shortform
      ? ('<div class="blog-compose-shortform-corner">' +
          '<div class="' + autosaveClass + '"' + (state.compose.saveStatus ? '' : ' hidden') + '>' + (state.compose.saveStatus === 'saving' ? 'Saving...' : (state.compose.saveStatus === 'error' ? 'Save failed' : '✓ Saved')) + '</div>' +
          composeShortformMeterHtml(fields.content) +
        '</div>')
      : '';
    var editorBlockHtml = '' +
      '<div class="field-row">' +
        '<label><strong>' + escapeHtml(contentLabel) + '</strong></label>' +
        '<div class="editor-shell blog-compose-editor-shell">' +
          composeToolbarHtml() +
          '<textarea data-compose-field="content" rows="' + String(composeTextareaRows(postType)) + '"' + (postType === 'shortform' ? (' maxlength="' + escapeHtml(String(currentComposeShortformLimit())) + '"') : '') + ' placeholder="' + escapeHtml(contentPlaceholder) + '">' + escapeHtml(fields.content) + '</textarea>' +
          (shortform
            ? shortformCornerHtml
            : ('<div class="' + autosaveClass + '"' + (state.compose.saveStatus ? '' : ' hidden') + '>' + (state.compose.saveStatus === 'saving' ? 'Saving...' : (state.compose.saveStatus === 'error' ? 'Save failed' : '✓ Saved')) + '</div>')) +
        '</div>' +
        composeUploadProgressHtml() +
      '</div>';
    var contentPaneHtml = editorBlockHtml;
    var outputClass = 'output';
    if (state.compose.outputTone) {
      outputClass += ' ' + state.compose.outputTone;
    }
    var composeCardClass = 'post-item blog-post-item blog-compose-card';
    var previewActionLabel = 'Preview';
    var previewToggleTitle = state.compose.preview ? 'Preview is on' : 'Preview';
    var previewTogglePressed = state.compose.preview ? 'true' : 'false';
    var previewToggleClass = 'unobtrusive-icon-button blog-compose-preview-toggle' + (state.compose.preview ? ' is-active' : '');
    var previewToggleHtml = '<button type="button" class="' + previewToggleClass + '" data-compose-action="toggle-preview" aria-label="' + previewActionLabel + '" aria-pressed="' + previewTogglePressed + '" title="' + previewToggleTitle + '">' + composePreviewToggleIconSvg() + '<span class="sr-only">' + previewActionLabel + '</span></button>';
    var postKindFooterHtml = composeNostrPillsHtml(postType) + (postTypeLocked ? '<span class="nostr-target-pill">Post type locked</span>' : '');
    var composeCardHtml = '' +
      '<article class="' + composeCardClass + '">' +
        '<div class="blog-compose-body">' +
          '<div class="' + headRowClass + '" data-compose-head-row>' +
            '<div class="' + typeControlClass + '" data-compose-type-control>' +
              '<button type="button" class="compose-post-type-current-btn unobtrusive-icon-button"' + (postTypeLocked ? ' disabled aria-disabled="true" aria-label="Post type is locked for existing posts" title="Post type is locked for existing posts"' : ' data-compose-action="toggle-post-type-toolbar" aria-label="Choose post type" title="Choose post type"') + '>' + composePostTypeIconSvg(composeBackingPostType(postType)) + '</button>' +
              '<div class="compose-post-type-toolbar-wrap"><div class="compose-post-type-row">' + composeTypeButtonsHtml(postType, { lockAll: postTypeLocked }) + '</div></div>' +
            '</div>' +
            '<div class="blog-compose-head-actions">' +
              previewToggleHtml +
              '<button type="button" class="unobtrusive-icon-button blog-compose-close" data-compose-action="close-compose" aria-label="Close compose" title="Close compose">' + composeCloseIconSvg() + '<span class="sr-only">Close compose</span></button>' +
            '</div>' +
          '</div>' +
          '<div class="field-row blog-compose-title-row"' + (showTitleField ? '' : ' hidden aria-hidden="true"') + '>' +
            '<label><strong>Title</strong></label>' +
            '<input type="text" data-compose-field="title" placeholder="' + escapeHtml(titlePlaceholder) + '" value="' + escapeHtml(fields.title) + '">' +
          '</div>' +
          mediaToolsHtml +
          contentPaneHtml +
          '<input type="file" data-compose-field="capture-upload" data-compose-upload="capture-media" accept="image/*,video/*" capture="environment" multiple hidden>' +
          '<input type="file" data-compose-field="media-upload" data-compose-upload="upload-media" accept="image/*,video/*" multiple hidden>' +
          '<input type="file" data-compose-field="file-upload" data-compose-upload="attachment" multiple hidden>' +
          '<input type="file" data-compose-field="audio-upload" data-compose-upload="audio-note" accept="audio/*" multiple hidden>' +
          '<div class="grid-two">' +
            '<div class="field-row">' +
              '<label><strong>Tags</strong></label>' +
              '<input type="hidden" data-compose-field="tags" value="' + escapeHtml(fields.tags) + '">' +
              '<div class="tag-editor' + (state.compose.tags.length ? ' has-tags' : '') + '" role="group" aria-label="Post tags">' +
                composeTagsEditorHtml() +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="field-row compose-release-row">' +
            '<strong>When</strong>' +
            '<div class="mode-row">' +
              '<label><input type="radio" name="blog-inline-compose-mode" value="immediate"' + (mode === 'immediate' ? ' checked' : '') + '> Now</label>' +
              '<label><input type="radio" name="blog-inline-compose-mode" value="drip"' + (mode === 'drip' ? ' checked' : '') + '> Queue</label>' +
              '<label><input type="radio" name="blog-inline-compose-mode" value="scheduled"' + (mode === 'scheduled' ? ' checked' : '') + '> Schedule...</label>' +
            '</div>' +
            '<div class="compose-scheduled-value" data-compose-scheduled-value' + (mode === 'scheduled' ? '' : ' hidden') + '>' + escapeHtml(composeScheduledDisplayValue(fields.scheduledAt)) + '</div>' +
            '<input type="date" class="compose-scheduled-picker-hidden" data-compose-field="scheduled-at" value="' + escapeHtml(composeNormalizeScheduledDate(fields.scheduledAt)) + '" aria-label="Scheduled release date">' +
          '</div>' +
          '<div class="field-row compose-destination-row">' +
              composePublishDestinationFieldHtml(destination) +
          '</div>' +
        '</div>' +
        '<div class="compose-footer blog-compose-footer">' +
          '<div class="compose-actions blog-compose-footer-actions">' +
            '<button type="button" class="icon-danger unobtrusive-icon-button blog-compose-delete" data-compose-action="delete" aria-label="Delete draft" title="Delete draft"' + (state.compose.busy ? ' disabled aria-disabled="true"' : '') + '>' + composeTrashIconSvg() + '</button>' +
            '<div class="blog-compose-publish-stack">' +
              '<div class="blog-compose-publish-row">' + postKindFooterHtml + '<button type="button" class="list-admin-primary-btn blog-compose-btn" data-compose-action="publish"' + (state.compose.busy ? ' disabled aria-disabled="true"' : '') + '>' + escapeHtml(composePrimaryLabel(mode, destination)) + '</button></div>' +
            '</div>' +
          '</div>' +
          '<div class="blog-compose-status-row">' +
            '<div class="' + outputClass + '">' + escapeHtml(state.compose.output) + '</div>' +
          '</div>' +
        '</div>' +
      '</article>';
    var previewCardHtml = previewIslandLayout
      ? '<article class="post-item blog-post-item blog-compose-preview-card"><div class="blog-compose-preview-card-body"><label><strong>Preview</strong></label><div class="preview-box blog-compose-preview">' + previewHtml + '</div></div></article>'
      : '';

    els.composeSlot.hidden = false;
    els.composeSlot.innerHTML = previewIslandLayout
      ? ('<div class="blog-compose-islands">' + composeCardHtml + previewCardHtml + '</div>')
      : composeCardHtml;
    hydrateComposeTagsEditor();
    openComposeSlotAnimated();
    requestAnimationFrame(function () {
      applyComposeModeEffects(postType);
    });
    renderComposeCameraOverlay();
  }

  function renderComposeStatusOnly() {
    if (!els.composeSlot || !state.compose.open) {
      return;
    }
    var mode = composePublishMode();
    var destination = composePublishDestination();
    state.compose.publishDestination = destination;
    var publishBtn = els.composeSlot.querySelector('[data-compose-action="publish"]');
    if (publishBtn instanceof HTMLButtonElement) {
      publishBtn.textContent = composePrimaryLabel(mode, destination);
      publishBtn.disabled = !!state.compose.busy || state.compose.uploading > 0;
    }
    var output = els.composeSlot.querySelector('.output');
    if (output) {
      output.textContent = state.compose.output || '';
      output.className = 'output' + (state.compose.outputTone ? (' ' + state.compose.outputTone) : '');
    }
    renderComposeUploadProgressOnly();
    var scheduleValue = els.composeSlot.querySelector('[data-compose-scheduled-value]');
    if (scheduleValue) {
      scheduleValue.hidden = mode !== 'scheduled';
      scheduleValue.textContent = composeScheduledDisplayValue((readComposeFields() || {}).scheduledAt || '');
    }
    var autosave = els.composeSlot.querySelector('.compose-editor-autosave');
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
      autosave.textContent = modeStatus === 'saving' ? 'Saving...' : (modeStatus === 'error' ? 'Save failed' : '✓ Saved');
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

  function inlineFilterPillHtml(className, group, value, label) {
    var normalized = String(value || '').trim();
    var display = String(label || normalized || 'Unknown').trim();
    if (!normalized) {
      normalized = display;
    }
    return '<button type="button" class="' + escapeHtml(className) + '" data-inline-filter-group="' + escapeHtml(group) + '" data-inline-filter-value="' + escapeHtml(normalized) + '" aria-label="Filter by ' + escapeHtml(display) + '">' + escapeHtml(display) + '</button>';
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

    if (state.postsLoading && !state.posts.length) {
      els.list.innerHTML = '';
      els.empty.hidden = true;
      return;
    }

    var shown = filteredPosts();
    var hasFilters = state.filters.tags.size || state.filters.years.size || state.filters.types.size;

    if (!shown.length) {
      els.list.innerHTML = '';
      if (!state.posts.length && !hasFilters) {
        if (!postsCatalogReady) {
          els.empty.hidden = true;
          return;
        }
        els.empty.textContent = 'No posts to show yet.';
      } else {
        els.empty.textContent = 'No posts match these filters.';
      }
      els.empty.hidden = false;
      return;
    }

    els.empty.hidden = true;
    els.list.innerHTML = shown.map(function (post) {
      var postTitle = String(post.title || '').trim();
      var postSummary = cleanMarkdownText(post.summary || '');
      if (!postTitle) {
        postTitle = postSummary.trim() || 'Untitled';
      }
      var postPath = String(post.path || '').trim();
      var tagsHtml = (post.tags || []).map(function (tag) {
        return '<button type="button" class="tag blog-inline-tag" data-inline-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
      }).join('');
      var postType = String(post.type || 'post');
      var postYear = String(post.year || 'Unknown');
      var metaPillsHtml = inlineFilterPillHtml('blog-type-pill', 'types', postType, formatType(postType)) + inlineFilterPillHtml('blog-year-pill', 'years', postYear, postYear);
      var comments = Number(post.comment_count || 0);
      var commentsLabel = comments === 1 ? '1 comment' : String(comments) + ' comments';
      var commentsHtml = '<span class="post-card-comments-count">' + escapeHtml(commentsLabel) + '</span>';
      var readMinutes = Number(post.reading_minutes || 0);
      if (!Number.isFinite(readMinutes) || readMinutes < 1) {
        readMinutes = 1;
      }
      var author = String(post.author || '').trim();
      if (!author) {
        author = 'Blog Author';
      }
      var adminMenuHtml = '';
      if (isAdmin() && postPath) {
        adminMenuHtml = '' +
          '<div class="post-page-menu">' +
            '<button type="button" class="post-page-menu-trigger" data-post-card-menu-toggle="' + escapeHtml(postPath) + '" aria-label="Post menu" aria-haspopup="menu" aria-expanded="false">' + overflowMenuIconSvg() + '</button>' +
            '<div class="post-page-menu-panel" role="menu" hidden>' +
              '<button type="button" data-post-card-action="edit_post" data-post-path="' + escapeHtml(postPath) + '" role="menuitem">Edit post...</button>' +
              '<button type="button" class="post-page-menu-delete" data-post-card-action="delete_post" data-post-path="' + escapeHtml(postPath) + '" role="menuitem">Delete post...</button>' +
            '</div>' +
          '</div>';
      }

      return '' +
        '<article class="post-item blog-post-item">' +
          '<div class="post-head">' +
            '<div class="post-head-main">' +
              '<h2 class="post-title"><a href="' + escapeHtml(post.url || '#') + '">' + escapeHtml(postTitle) + '</a></h2>' +
              '<div class="post-byline post-byline-top"><span class="post-author">' + escapeHtml(author) + '</span><span class="post-date">' + escapeHtml(post.published_date || post.pub_date || 'Unknown date') + '</span></div>' +
              '<div class="post-head-divider" aria-hidden="true"></div>' +
              '<div class="post-byline post-byline-bottom"><span class="post-reading-inline">' + escapeHtml(String(readMinutes)) + ' min read</span></div>' +
            '</div>' +
            adminMenuHtml +
          '</div>' +
          renderPostSummaryHtml(post.summary, post.url, !!post.summary_truncated) +
          '<div class="post-card-footer"><div class="tags post-card-meta-tags">' + metaPillsHtml + tagsHtml + '</div>' + commentsHtml + '</div>' +
        '</article>';
    }).join('');
  }

  function closePostCardMenus() {
    if (!els.list) {
      return;
    }
    var panels = els.list.querySelectorAll('.post-page-menu-panel');
    panels.forEach(function (panel) {
      panel.hidden = true;
    });
    var triggers = els.list.querySelectorAll('.post-page-menu-trigger[data-post-card-menu-toggle]');
    triggers.forEach(function (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function togglePostCardMenu(trigger) {
    if (!(trigger instanceof HTMLElement)) {
      return;
    }
    var wrap = trigger.closest('.post-page-menu');
    if (!wrap) {
      return;
    }
    var panel = wrap.querySelector('.post-page-menu-panel');
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    var shouldOpen = !!panel.hidden;
    closePostCardMenus();
    panel.hidden = !shouldOpen;
    trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  function runPostCardAction(action, postPath) {
    var picked = String(action || '').trim();
    var path = String(postPath || '').trim();
    if (!picked || !path || postCardMenuBusy) {
      return;
    }
    if (!isAdmin()) {
      window.alert('Sign in as admin first.');
      return;
    }
    var auth = authPayload();
    if (!auth.session_token || !auth.csrf_token) {
      window.alert('Sign in as admin first.');
      return;
    }
    if (picked === 'edit_post') {
      postCardMenuBusy = true;
      apiPost('/cgi/blog-create-draft-from-post', {
        post_path: path,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      }).then(function (data) {
        var draftId = String((data && data.draft_id) || '').trim();
        if (!draftId) {
          throw new Error('Draft was created but no draft id was returned');
        }
        closePostCardMenus();
        return openComposeDraftInPlace(draftId, { lockPostType: true });
      }).catch(function (err) {
        window.alert(err && err.message ? err.message : 'Could not create draft from post');
      }).finally(function () {
        postCardMenuBusy = false;
      });
      return;
    }
    if (picked === 'delete_post') {
      if (!window.confirm('Delete this published post from this site? This cannot be undone.')) {
        return;
      }
      postCardMenuBusy = true;
      apiPost('/cgi/blog-manage-post', {
        action: 'delete',
        post_path: path,
        session_token: auth.session_token,
        csrf_token: auth.csrf_token
      }).then(function () {
        state.posts = (Array.isArray(state.posts) ? state.posts : []).filter(function (post) {
          return String(post && post.path || '').trim() !== path;
        });
        renderFilters();
        renderList();
      }).catch(function (err) {
        window.alert(err && err.message ? err.message : 'Delete failed');
      }).finally(function () {
        postCardMenuBusy = false;
      });
    }
  }

  function renderAll() {
    renderHead();
    renderAdmin();
    renderDraftNotice();
    renderValidation();
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
        var finishOpen = function () {
          if (els.toggle.getAttribute('aria-expanded') === 'true') {
            els.panel.classList.add('is-open');
          }
        };
        window.requestAnimationFrame(finishOpen);
        window.setTimeout(finishOpen, 32);
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

  function readPrerenderPageBootstrap() {
    try {
      var allPayloads = window.__wizardryNostrPageBootstrap;
      if (!allPayloads || typeof allPayloads !== 'object') {
        return null;
      }
      var payload = allPayloads[slug];
      if (!payload || typeof payload !== 'object') {
        return null;
      }
      var payloadType = String(payload.page_type || '').trim().toLowerCase();
      if (payloadType !== 'blog') {
        return null;
      }
      var payloadSlug = String(payload.slug || '').trim();
      if (!payloadSlug || !slugsEquivalent(payloadSlug, slug)) {
        return null;
      }
      return payload;
    } catch (_err) {
      return null;
    }
  }

  function readPrerenderPostsBootstrap(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    if (!Array.isArray(payload.bootstrap_posts)) {
      return null;
    }
    return payload.bootstrap_posts.slice();
  }

  function renderSignature() {
    function sortedSet(setObj) {
      return Array.from(setObj || []).sort();
    }
    return JSON.stringify({
      payload: (state.payload && state.payload.state) ? state.payload.state : null,
      posts: Array.isArray(state.posts) ? state.posts : [],
      filters: {
        tags: sortedSet(state.filters.tags),
        years: sortedSet(state.filters.years),
        types: sortedSet(state.filters.types)
      }
    });
  }

  function loadPageState(options) {
    var opts = options || {};
    var expectedSlug = slugFromPath(window.location.pathname || '/');
    var requestedSlug = expectedSlug || slug;
    if (expectedSlug && !slugsEquivalent(expectedSlug, slug)) {
      maybeRepairRoute('blog-root-slug-mismatch');
      return Promise.resolve();
    }
    var auth = authPayload();
    state.authSignature = String(auth.session_token || '') + '|' + String(auth.csrf_token || '');
    return apiPost('/cgi/blog-get-nostr-page', {
      page_slug: requestedSlug,
      session_token: auth.session_token,
      csrf_token: auth.csrf_token
    }).then(function (data) {
      var pageType = String(data && data.page_type || '').trim().toLowerCase();
      if (pageType && pageType !== 'blog') {
        maybeRepairRoute('blog-template-page-type-mismatch:' + pageType);
        return;
      }
      state.payload = data;
      try {
        if (typeof data.is_admin !== 'undefined') {
          localStorage.setItem('last_auth_is_admin', data.is_admin ? '1' : '0');
        }
      } catch (_storageErr) {
        // Ignore storage sync failures.
      }
      applyDefaultFilters();
      if (!opts.deferRender) {
        renderAll();
      }
      loadDraftNoticeData();
    }).catch(function (err) {
      var message = String(err && err.message || '');
      if (/unknown nostr page slug/i.test(message) || /unknown_page/i.test(message)) {
        maybeRepairRoute('unknown-page-slug');
      }
      if (!opts.deferRender) {
        renderAll();
      }
      loadDraftNoticeData();
    }).finally(function () {
      if (!opts.deferInitialFlags) {
        state.initialPageStateLoaded = true;
        maybeMarkInitialContentPainted();
      }
    });
  }

  function loadPosts(options) {
    var opts = options || {};
    state.postsLoading = true;
    if (!opts.deferRender) {
      renderList();
    }
    function fetchPostsJson(url) {
      return fetch(url, { credentials: 'same-origin', cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) {
            throw new Error('Post catalog request failed: ' + res.status);
          }
          return res.json();
        });
    }
    return fetchPostsJson('/static/public-posts.json')
      .catch(function () {
        return fetchPostsJson('/cgi/blog-list-public-posts');
      })
      .then(function (data) {
        if (!data || !data.success || !Array.isArray(data.posts)) {
          return;
        }
        postsCatalogReady = true;
        state.posts = data.posts;
        writeCache(state.posts);
        if (!opts.deferRender) {
          renderFilters();
          renderList();
        }
      })
      .catch(function () {
        // Keep cached posts if fetch fails.
      })
      .finally(function () {
        state.postsLoading = false;
        if (!opts.deferInitialFlags) {
          state.initialPostsLoaded = true;
          maybeMarkInitialContentPainted();
        }
        if (!opts.deferRender) {
          renderList();
        }
      });
  }

  root.addEventListener('click', function (event) {
    var target = eventTargetElement(event.target);
    var draftBannerAction = target ? target.closest('[data-draft-banner-action]') : null;
    if (draftBannerAction) {
      event.preventDefault();
      event.stopPropagation();
      if (String(draftBannerAction.getAttribute('data-draft-banner-action') || '') === 'continue') {
        openDraftFromNotice(String(draftBannerAction.getAttribute('data-draft-id') || ''));
      }
      return;
    }
    var postCardMenuTrigger = target ? target.closest('.post-page-menu-trigger[data-post-card-menu-toggle]') : null;
    if (postCardMenuTrigger) {
      event.preventDefault();
      togglePostCardMenu(postCardMenuTrigger);
      return;
    }

    var postCardMenuAction = target ? target.closest('[data-post-card-action]') : null;
    if (postCardMenuAction instanceof HTMLElement) {
      event.preventDefault();
      closePostCardMenus();
      runPostCardAction(
        String(postCardMenuAction.getAttribute('data-post-card-action') || ''),
        String(postCardMenuAction.getAttribute('data-post-path') || '')
      );
      return;
    }

    if (!target || !target.closest('.post-page-menu')) {
      closePostCardMenus();
    }

    var composeFab = target ? target.closest('[data-blog-action="toggle-compose"]') : null;
    if (composeFab) {
      event.preventDefault();
      event.stopPropagation();
      toggleComposeFromUi(!state.compose.open);
      return;
    }

    var composeTagToken = target ? target.closest('[data-compose-tag-token]') : null;
    if (composeTagToken instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      var tokenEditor = composeTagsEditorNode();
      if (tokenEditor && tokenEditor.contains(composeTagToken)) {
        composeTagsEditorSelectToken(tokenEditor, composeTagToken);
      }
      return;
    }

    var composeTagEditor = target ? target.closest('[data-compose-field="tags-editor"]') : null;
    if (composeTagEditor instanceof HTMLElement) {
      composeTagsEditorClearSelection(composeTagEditor);
      try {
        composeTagEditor.focus({ preventScroll: true });
      } catch (_focusErr) {
        composeTagEditor.focus();
      }
      if (!composeTagsEditorPlaceCaretFromPoint(composeTagEditor, Number(event.clientX) || 0, Number(event.clientY) || 0)) {
        var draftNode = composeTagsEditorDraftNode(composeTagEditor);
        if (target === composeTagEditor || !(draftNode && draftNode.contains(target))) {
          composeTagsEditorFocusDraft(composeTagEditor);
        }
      }
      setTimeout(function () {
        if (document.activeElement === composeTagEditor) {
          composeTagsEditorSyncDraft(composeTagEditor);
        }
      }, 0);
    }

    var composeAction = target ? target.closest('[data-compose-action]') : null;
    if (composeAction) {
      event.preventDefault();
      var actionName = String(composeAction.getAttribute('data-compose-action') || '');
      if (actionName === 'toggle-preview') {
        state.compose.preview = !state.compose.preview;
        renderComposeUi();
        return;
      }
      if (actionName === 'close-compose') {
        toggleComposeFromUi(false);
        return;
      }
      if (actionName === 'set-post-type') {
        if (state.compose.postTypeLocked) {
          return;
        }
        setComposePostType(String(composeAction.getAttribute('data-compose-post-type') || ''), { interactive: true, skipAutosave: true });
        return;
      }
      if (actionName === 'toggle-post-type-toolbar') {
        if (state.compose.postTypeLocked) {
          return;
        }
        if (!state.compose.postTypeChosen) {
          setComposePostTypeToolbarCollapsed(false);
          return;
        }
        if (state.compose.postTypeToolbarCollapsed) {
          setComposePostTypeToolbarCollapsed(false);
        } else {
          setComposePostTypeToolbarCollapsed(true);
        }
        return;
      }
      if (actionName === 'publish') {
        saveCompose(composeModeAction(composePublishMode(), composePublishDestination()));
        return;
      }
      if (actionName === 'delete') {
        deleteComposeDraft();
        return;
      }
      if (actionName === 'remove-tag') {
        removeComposeTag(String(composeAction.getAttribute('data-compose-tag') || ''));
        renderComposeUi();
        return;
      }
      if (actionName === 'toggle-tags') {
        state.compose.tagsOpen = !state.compose.tagsOpen;
        renderComposeUi();
        return;
      }
      if (actionName === 'open-mode-picker') {
        openComposePickerForType(String(composeAction.getAttribute('data-compose-mode-target') || composePostType()));
        return;
      }
      if (actionName === 'open-camera-capture') {
        openComposeCameraCapture({ returnToChooser: false });
        return;
      }
      if (actionName === 'cancel-camera-capture') {
        closeComposeCameraCapture({});
        return;
      }
      if (actionName === 'capture-photo') {
        capturePhotoFromComposeCamera();
        return;
      }
      if (actionName === 'audio-record-toggle') {
        if (state.compose.audioRecording) {
          stopComposeAudioRecording();
        } else {
          startComposeAudioRecording();
        }
        return;
      }
      if (actionName === 'shortform-limit-toggle') {
        if (event.detail > 1) {
          return;
        }
        if (composePostType() !== 'shortform' || state.compose.shortformLimitEditing) {
          return;
        }
        var currentLimit = currentComposeShortformLimit();
        setComposeShortformLimit(currentLimit === 280 ? 140 : 280, { editing: false, skipAutosave: true });
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
          type = 'audio-note';
          setComposePostType(type, { skipAutosave: true, interactive: true });
          return;
        }
        setComposePostType(type, { skipAutosave: true, skipRender: true });
        var picker = els.composeSlot.querySelector('[data-compose-field="' + field + '"]');
        if (picker instanceof HTMLInputElement) {
          picker.click();
        }
        return;
      }
    }
    var scheduledModeClick = target ? target.closest('input[name="blog-inline-compose-mode"][value="scheduled"]') : null;
    if (scheduledModeClick instanceof HTMLInputElement) {
      setTimeout(openComposeScheduledPicker, 0);
    }

    var composeToolbar = target ? target.closest('[data-compose-toolbar]') : null;
    if (composeToolbar) {
      event.preventDefault();
      composeToolbarAction(String(composeToolbar.getAttribute('data-compose-toolbar') || ''));
      return;
    }

    var toggle = target ? target.closest('[data-filter-group][data-filter-value]') : null;
    if (toggle) {
      event.preventDefault();
      toggleFilter(
        toggle.getAttribute('data-filter-group'),
        toggle.getAttribute('data-filter-value'),
        !!(event.metaKey || event.ctrlKey)
      );
      return;
    }

    var inlineTag = target ? target.closest('[data-inline-tag]') : null;
    if (inlineTag) {
      event.preventDefault();
      setPanelOpen(true);
      toggleFilter('tags', inlineTag.getAttribute('data-inline-tag'), !!(event.metaKey || event.ctrlKey));
      return;
    }

    var inlineFilter = target ? target.closest('[data-inline-filter-group][data-inline-filter-value]') : null;
    if (inlineFilter) {
      event.preventDefault();
      setPanelOpen(true);
      toggleFilter(
        inlineFilter.getAttribute('data-inline-filter-group'),
        inlineFilter.getAttribute('data-inline-filter-value'),
        !!(event.metaKey || event.ctrlKey)
      );
      return;
    }

    var action = target ? target.closest('[data-blog-action]') : null;
    if (action) {
      event.preventDefault();
      if (action.getAttribute('data-blog-action') === 'toggle-page-settings') {
        setPageSettingsOpen(!state.pageSettingsOpen);
      }
    }
  });

  root.addEventListener('change', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    if (!target.matches('[data-blog-setting="default-tag"]')) {
      return;
    }
    var picked = String(target.value || '').trim();
    if (state.payload && state.payload.state) {
      state.payload.state.default_tag = picked;
    }
    state.defaultFiltersApplied = true;
    state.filters.tags.clear();
    state.filters.years.clear();
    state.filters.types.clear();
    if (picked) {
      state.filters.tags.add(picked);
    }
    renderFilters();
    renderList();
  });

  root.addEventListener('dragover', function (event) {
    var target = eventTargetElement(event.target);
    if (!composeDropInComposeCard(target)) {
      return;
    }
    if (!composeDragHasFiles(event)) {
      return;
    }
    if (!composeCanAcceptDroppedFiles(state.compose.postTypeChosen ? composePostType() : '')) {
      return;
    }
    event.preventDefault();
    setComposeDropHover(target);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  });

  root.addEventListener('dragleave', function () {
    clearComposeDropHover();
  });

  root.addEventListener('drop', function (event) {
    var target = eventTargetElement(event.target);
    if (!composeDropInComposeCard(target)) {
      return;
    }
    var files = composeDroppedFiles(event);
    if (!files.length) {
      return;
    }
    if (!composeCanAcceptDroppedFiles(state.compose.postTypeChosen ? composePostType() : '')) {
      event.preventDefault();
      clearComposeDropHover();
      setComposeOutput('File drop is disabled for this post type.', 'warn');
      renderComposeStatusOnly();
      return;
    }
    event.preventDefault();
    clearComposeDropHover();
    var currentType = state.compose.postTypeChosen ? composePostType() : '';
    var preferredType = composePreferredDropType(files, currentType);
    handleComposeUploads(files, preferredType || undefined);
  });

  document.addEventListener('click', function (event) {
    var target = eventTargetElement(event.target);
    if (!target) {
      return;
    }
    var navCompose = target.closest('.nav-compose');
    if (!navCompose) {
      return;
    }
    if (!isAdmin()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    toggleComposeFromUi(true);
  });

  root.addEventListener('dblclick', function (event) {
    var toggle = event.target && event.target.closest('[data-compose-action="shortform-limit-toggle"]');
    if (!toggle || !state.compose.open || composePostType() !== 'shortform') {
      return;
    }
    event.preventDefault();
    state.compose.shortformLimitEditing = true;
    renderComposeUi();
    if (els.composeSlot) {
      var input = els.composeSlot.querySelector('[data-compose-field="shortform-limit"]');
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    }
  });

  root.addEventListener('input', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement) || !state.compose.open) {
      return;
    }
    var tagEditorTarget = target.closest('[data-compose-field="tags-editor"]');
    if (tagEditorTarget instanceof HTMLElement) {
      composeTagsEditorClearSelection(tagEditorTarget);
      var changed = composeTagsEditorCommit(tagEditorTarget, false);
      composeTagsEditorSyncDraft(tagEditorTarget);
      syncComposeTagsField();
      if (changed || String(state.compose.tagsDraftText || '').trim()) {
        queueComposeAutosave();
      } else {
        renderComposeStatusOnly();
      }
      return;
    }
    if (target.matches('[data-compose-field="shortform-limit"]')) {
      return;
    }
    if (target.matches('[data-compose-field="title"], [data-compose-field="content"], [data-compose-field="scheduled-at"], [data-compose-field="link-url"]')) {
      if (target.matches('[data-compose-field="link-url"]')) {
        state.compose.linkUrl = String(target.value || '');
        if (composePostType() !== 'link-share') {
          state.compose.postType = 'link-share';
          state.compose.postTypeChosen = true;
        }
      }
      if (target.matches('[data-compose-field="content"]') && composePostType() === 'shortform') {
        enforceComposeShortformLimitOnFields();
        if (els.composeSlot) {
          var meterButton = els.composeSlot.querySelector('[data-compose-action="shortform-limit-toggle"]');
          if (meterButton instanceof HTMLButtonElement) {
            meterButton.textContent = String(target.value || '').length + '/' + String(currentComposeShortformLimit());
          }
        }
      }
      queueComposeAutosave();
      if (state.compose.preview) {
        renderComposeUiPreserveFieldFocus();
      } else {
        renderComposeStatusOnly();
      }
      return;
    }
    if (target.matches('input[name="blog-inline-compose-mode"], input[name="blog-inline-compose-destination"]')) {
      var shouldOpenSchedulePicker = target.matches('input[name="blog-inline-compose-mode"][value="scheduled"]') && target.checked;
      renderComposeUi();
      if (shouldOpenSchedulePicker) {
        setTimeout(openComposeScheduledPicker, 0);
      }
    }
  });

  root.addEventListener('change', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLInputElement) || !state.compose.open) {
      return;
    }
    if (target.matches('[data-compose-field="scheduled-at"]')) {
      queueComposeAutosave();
      renderComposeStatusOnly();
      return;
    }
    if (target.matches('[data-compose-field="shortform-limit"]')) {
      setComposeShortformLimit(target.value, { editing: false });
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
    if (!(target instanceof HTMLElement) || !state.compose.open) {
      return;
    }
    if (state.compose.cameraFullscreen && event.key === 'Escape') {
      event.preventDefault();
      closeComposeCameraCapture({});
      return;
    }
    if (target.matches('[data-compose-field="shortform-limit"]')) {
      if (event.key === 'Enter') {
        event.preventDefault();
        setComposeShortformLimit(target.value, { editing: false });
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        state.compose.shortformLimitEditing = false;
        renderComposeUi();
        return;
      }
    }
    var tagEditor = target.closest('[data-compose-field="tags-editor"]');
    if (tagEditor instanceof HTMLElement) {
      var selectedToken = composeTagsEditorSelectedToken(tagEditor);
      if (event.key === 'Enter' || event.key === ',' || event.code === 'Comma') {
        event.preventDefault();
        if (composeTagsEditorCommit(tagEditor, true)) {
          queueComposeAutosave();
        } else {
          renderComposeStatusOnly();
        }
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (selectedToken) {
          event.preventDefault();
          if (composeTagsEditorRemoveTagByNode(tagEditor, selectedToken)) {
            queueComposeAutosave();
          } else {
            renderComposeStatusOnly();
          }
          return;
        }
        var draftText = composeTagsEditorReadDraftText(tagEditor);
        if (!draftText.trim() && state.compose.tags.length) {
          event.preventDefault();
          var edgeTag = event.key === 'Delete' ? state.compose.tags[0] : state.compose.tags[state.compose.tags.length - 1];
          if (edgeTag) {
            removeComposeTag(edgeTag);
            composeTagsEditorRender(tagEditor);
            composeTagsEditorFocusDraft(tagEditor);
            queueComposeAutosave();
          }
          return;
        }
      }
      if (event.key === 'Escape') {
        composeTagsEditorClearSelection(tagEditor);
      }
    }
  });

  root.addEventListener('focusout', function (event) {
    var target = event.target;
    if (!(target instanceof HTMLElement) || !state.compose.open) {
      return;
    }
    var tagEditorTarget = target.closest('[data-compose-field="tags-editor"]');
    if (tagEditorTarget instanceof HTMLElement) {
      if (composeTagsEditorCommit(tagEditorTarget, true)) {
        queueComposeAutosave();
      } else {
        composeTagsEditorSyncDraft(tagEditorTarget);
        renderComposeStatusOnly();
      }
      return;
    }
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.matches('[data-compose-field="shortform-limit"]')) {
      return;
    }
    if (!state.compose.shortformLimitEditing) {
      return;
    }
    setComposeShortformLimit(target.value, { editing: false });
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

  window.addEventListener('beforeunload', function () {
    clearComposePostTypeCollapseTimer();
    stopComposeCameraStream();
    stopComposeAudioStream();
  });

  var composeResizeTimer = null;
  window.addEventListener('resize', function () {
    if (!state.compose.open || !state.compose.preview) {
      return;
    }
    if (composeResizeTimer) {
      window.clearTimeout(composeResizeTimer);
    }
    composeResizeTimer = window.setTimeout(function () {
      composeResizeTimer = null;
      if (state.compose.open && state.compose.preview) {
        renderComposeUi();
      }
    }, 120);
  });

  removeLegacyTitleBlock();
  clearRouteRepairParam();
  ensureFilterGutterLayout();
  ensureDraftNoticeHost();

  (function bootstrapOnce() {
    var hasWarmPosts = false;
    hydrateDraftNoticeFromCache();
    var prerenderedPayload = readPrerenderPageBootstrap();
    if (prerenderedPayload) {
      state.payload = prerenderedPayload;
      applyDefaultFilters();
    }

    var prerenderedPosts = readPrerenderPostsBootstrap(prerenderedPayload);
    if (prerenderedPosts) {
      postsCatalogReady = true;
      state.posts = prerenderedPosts;
      writeCache(prerenderedPosts);
      hasWarmPosts = true;
    } else {
      var cached = readCache();
      if (cached) {
        postsCatalogReady = true;
        state.posts = cached;
        hasWarmPosts = true;
      }
    }
    state.postsLoading = !hasWarmPosts;
    renderAll();
    state.renderSignature = renderSignature();
    state.initialPageStateLoaded = true;
    state.initialPostsLoaded = true;
    waitForInitialDraftNotice().finally(function () {
      markInitialContentPainted();
    });

    Promise.allSettled([
      loadPageState({ deferRender: true, deferInitialFlags: true }),
      loadPosts({ deferRender: true, deferInitialFlags: true })
    ]).finally(function () {
      state.postsLoading = false;
      loadDraftNoticeData();
      var nextSignature = renderSignature();
      if (state.renderSignature !== nextSignature) {
        state.renderSignature = nextSignature;
        renderAll();
      }
    });
  })();
})();
